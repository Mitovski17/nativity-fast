// Lets a signed-in person delete their own account. Their documents and AI usage
// rows go with it (foreign keys cascade from auth.users).
import { createClient } from "npm:@supabase/supabase-js@2";
import { SECRET_KEY, SUPABASE_URL, caller, cors, json } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!SECRET_KEY) return json({ error: "not_configured" }, 503);

  const who = await caller(req);
  if (who instanceof Response) return who;

  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(who.user.id);
  if (error) {
    console.error("delete", error);
    return json({ error: "server" }, 500);
  }
  return json({ ok: true });
});
