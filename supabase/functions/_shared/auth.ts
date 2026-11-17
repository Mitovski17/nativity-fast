import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** First key of a JSON map env var such as SUPABASE_SECRET_KEYS = {"default": "sb_secret_..."} */
function firstKey(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const v = Object.values(JSON.parse(raw) as Record<string, string>)[0];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? firstKey("SUPABASE_PUBLISHABLE_KEYS")!;
export const SECRET_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? firstKey("SUPABASE_SECRET_KEYS");

/**
 * Checks the caller's session with Supabase Auth and returns a client that acts as
 * that person, so database calls go through their row-level security.
 */
export async function caller(req: Request): Promise<{ user: User; db: SupabaseClient } | Response> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "not_signed_in" }, 401);
  const db = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "not_signed_in" }, 401);
  return { user: data.user, db };
}
