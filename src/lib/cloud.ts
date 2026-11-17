// Web build only: Supabase sign-in, the per-person document store and the AI proxy.
import { createClient, type Session } from "@supabase/supabase-js";
import type { AI, JsonOpts } from "./ai";
import type { Remote } from "./store";

const URL_ = import.meta.env.VITE_SUPABASE_URL ?? "";
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const sb = createClient(URL_, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

/** The person's documents; row-level security limits every query to their own rows */
export function supabaseRemote(userId: string): Remote {
  return {
    async load() {
      const { data, error } = await sb.from("user_docs").select("key, data").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as { key: string; data: Record<string, unknown> }[];
    },
    async save(key, data) {
      const { error } = await sb.from("user_docs").upsert({ user_id: userId, key, data }, { onConflict: "user_id,key" });
      if (error) throw error;
    },
  };
}

async function session(): Promise<Session | null> {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function callFunction(name: string, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const s = await session();
  if (!s) throw { code: "not_signed_in" };
  let res: Response;
  try {
    res = await fetch(`${URL_}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw { code: "cancelled" };
    throw { code: "network" };
  }
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw { code: typeof out.error === "string" ? out.error : `http_${res.status}` };
  return out;
}

/** Shrinks a photo to at most 1568 px on its long side (what Claude reads at full detail) as JPEG */
async function toJpegBase64(blob: Blob): Promise<{ media_type: string; data: string }> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", 0.85));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { media_type: "image/jpeg", data: btoa(bin) };
}

/** Pulls the JSON object out of Claude's reply (it may wrap it in a code fence) */
function parseJson<T>(text: string): T {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw { code: "invalid_json" };
  try {
    return JSON.parse(text.slice(a, b + 1)) as T;
  } catch {
    throw { code: "invalid_json" };
  }
}

export function webAI(): AI {
  return {
    images: true,
    async json<T>(prompt: string, opts: JsonOpts = {}) {
      const images = opts.images?.length ? await Promise.all(opts.images.map(toJpegBase64)) : [];
      const out = await callFunction("ai", { prompt, images, tier: opts.modelTier === "quick" ? "quick" : "default" }, opts.signal);
      return parseJson<T>(String(out.text ?? ""));
    },
  };
}

export async function deleteAccount(): Promise<void> {
  await callFunction("delete-account", {});
}
