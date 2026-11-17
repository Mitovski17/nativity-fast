// Daily fasting verse (Web Push).
//   GET                          → { publicKey } so phones can subscribe
//   POST + x-cron-secret         → sends today's verse to every phone where it is 7:xx now (pg_cron, every 15 min)
//   POST {test:true} + user JWT  → sends today's verse to the caller's own phones right away
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SECRET_KEY, SUPABASE_URL, caller, cors, json } from "../_shared/auth.ts";
import { VERSES } from "./verses.ts";
import { VERSES_BG } from "./verses-bg.ts";

const admin = createClient(SUPABASE_URL, SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

interface Config {
  publicKey: string;
  privateKey: string;
  cronSecret: string;
}
let cached: Config | null = null;

/** Push keys from Supabase Vault; made on the first run so the private key never leaves Supabase */
async function config(): Promise<Config> {
  if (cached) return cached;
  const read = async () => {
    const { data, error } = await admin.rpc("push_config");
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as { vapid_public: string | null; vapid_private: string | null; cron_secret: string | null };
  };
  let row = await read();
  if (!row.vapid_private) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const { error } = await admin.rpc("save_vapid_keys", { p_public: pub, p_private: jwk.d });
    if (error) throw error;
    row = await read(); // another run may have saved first; the vault copy wins
  }
  cached = { publicKey: row.vapid_public!, privateKey: row.vapid_private!, cronSecret: row.cron_secret ?? "" };
  webpush.setVapidDetails("https://koledni-posti.vercel.app", cached.publicKey, cached.privateKey);
  return cached;
}

/** Same verse for everyone on a given day, cycling through the list (both lists are in the same order) */
function verseFor(day: string, lang: string) {
  const list = lang === "en" ? VERSES : VERSES_BG;
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return list[((n % list.length) + list.length) % list.length];
}

function message(lang: string, day: string) {
  const v = verseFor(day, lang);
  return JSON.stringify({
    title: lang === "en" ? "Verse for the fast" : "Стих за поста",
    body: `${v.t} — ${v.ref}`,
    url: "./#bible",
    tag: "daily-verse",
  });
}

interface Sub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
  local_day?: string;
}

/** Sends one notification; drops subscriptions the push service says are gone */
async function send(sub: Sub, day: string): Promise<"sent" | "gone" | "failed"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message(sub.lang, day), { TTL: 6 * 3600, urgency: "normal" });
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await admin.from("push_subscriptions").delete().eq("id", sub.id);
      return "gone";
    }
    console.error("push failed", status, (e as Error).message);
    return "failed";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  let cfg: Config;
  try {
    cfg = await config();
  } catch (e) {
    console.error("config", e);
    return json({ error: "not_configured" }, 503);
  }
  if (req.method === "GET") return json({ publicKey: cfg.publicKey });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const body = (await req.json().catch(() => ({}))) as { test?: boolean; probe?: string };
  const today = new Date().toISOString().slice(0, 10);

  // pg_cron: everyone whose clock now shows 7:xx and who hasn't had today's verse
  if (cfg.cronSecret && req.headers.get("x-cron-secret") === cfg.cronSecret) {
    if (body.probe) {
      // checks keys and the push service without a real phone (the endpoint is fake, so a 4xx is expected)
      const fake = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
      const keys = { p256dh: b64url(await crypto.subtle.exportKey("raw", fake.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16)).buffer) };
      const r = await webpush.sendNotification({ endpoint: body.probe, keys }, "probe").catch((e) => e);
      return json({ probe: (r as { statusCode?: number }).statusCode ?? null });
    }
    const { data, error } = await admin.rpc("due_daily_verses");
    if (error) {
      console.error("due", error);
      return json({ error: "server" }, 500);
    }
    const subs = (data ?? []) as (Sub & { local_day: string })[];
    const results = await Promise.all(
      subs.map(async (s) => {
        const r = await send(s, s.local_day);
        if (r === "sent") await admin.from("push_subscriptions").update({ last_sent: s.local_day }).eq("id", s.id);
        return r;
      }),
    );
    return json({ due: subs.length, sent: results.filter((r) => r === "sent").length, gone: results.filter((r) => r === "gone").length });
  }

  // "Send me a test": today's verse to the signed-in person's own phones
  if (body.test) {
    const who = await caller(req);
    if (who instanceof Response) return who;
    const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, lang").eq("user_id", who.user.id);
    if (error) return json({ error: "server" }, 500);
    const results = await Promise.all((data ?? []).map((s) => send(s as Sub, today)));
    return json({ sent: results.filter((r) => r === "sent").length, devices: results.length });
  }

  return json({ error: "forbidden" }, 403);
});
