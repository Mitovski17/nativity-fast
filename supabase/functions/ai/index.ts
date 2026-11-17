// AI for the tracker: meal photos, nutrition labels, food estimates and meal-plan parsing.
// The app builds the prompt; this function checks who is asking, counts the call
// against their daily allowance, and forwards it to Claude with the server's API key.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SECRET_KEY, SUPABASE_URL, caller, cors, json } from "../_shared/auth.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-opus-5-5";
const MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_PROMPT = 20_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 5_000_000;

interface Body {
  prompt?: unknown;
  images?: { media_type?: unknown; data?: unknown }[];
  tier?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "not_configured" }, 503);

  const who = await caller(req);
  if (who instanceof Response) return who;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const images = Array.isArray(body.images) ? body.images : [];
  if (!prompt || prompt.length > MAX_PROMPT || images.length > MAX_IMAGES) return json({ error: "bad_request" }, 400);
  for (const im of images) {
    if (typeof im.data !== "string" || typeof im.media_type !== "string" || !MEDIA.has(im.media_type) || im.data.length > MAX_IMAGE_B64)
      return json({ error: "image_rejected" }, 400);
  }

  if (!SECRET_KEY) return json({ error: "not_configured" }, 503);
  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed, error: quotaError } = await admin.rpc("consume_ai_quota_for", { p_user: who.user.id });
  if (quotaError) {
    console.error("quota", quotaError);
    return json({ error: "server" }, 500);
  }
  if (!allowed) return json({ error: "daily_limit" }, 429);

  try {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...images.map((im) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: im.media_type as "image/jpeg", data: im.data as string },
      })),
      { type: "text" as const, text: prompt },
    ];
    const res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Quick look-ups need little thought; photos and plans get a bit more.
      output_config: { effort: body.tier === "quick" ? "low" : "medium" },
      // If Claude declines on a safety false positive, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return json({ error: "refused" }, 422);
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (e instanceof Anthropic.BadRequestError) {
      console.error("anthropic 400", e.message);
      return json({ error: "image_rejected" }, 400);
    }
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      return json({ error: "upstream" }, 502);
    }
    console.error("ai", e);
    return json({ error: "server" }, 500);
  }
});
