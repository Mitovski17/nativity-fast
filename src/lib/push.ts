// Web build only: the daily 7:00 verse (Web Push). The phone subscribes with the app's public
// key and its time zone; the daily-verse edge function sends when it is 7:xx there.
import { sb } from "./cloud";
import type { Lang } from "./i18n";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-verse`;

/** on/off, or why it can't be offered: iPhone needs the app on the Home Screen first */
export type PushState = "on" | "off" | "denied" | "install" | "unsupported";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Sofia";
  } catch {
    return "Europe/Sofia";
  }
};

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("sw.js"));
}

export async function pushState(): Promise<PushState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !standalone() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return "off";
  await save(sub, null).catch(() => undefined); // keeps the time zone current if the phone travelled
  return "on";
}

async function save(sub: PushSubscription, lang: Lang | null) {
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("not signed in");
  const j = sub.toJSON();
  const row: Record<string, string> = { user_id: uid, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", tz: tz() };
  if (lang) row.lang = lang;
  const { error } = await sb.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) throw error;
}

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function subscribeDailyVerse(lang: Lang): Promise<PushState> {
  // must start from the tap: iPhone only asks for permission inside a user gesture
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch(FN)).json()) as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(publicKey) });
  await save(sub, lang);
  return "on";
}

export async function unsubscribeDailyVerse() {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Today's verse to this person's phones now */
export async function sendTestVerse(): Promise<number> {
  const { data } = await sb.auth.getSession();
  const r = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ test: true }),
  });
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { sent: number }).sent;
}

/** Signing out: this phone stops getting the verse for that account */
export async function forgetThisDevice() {
  if (!("serviceWorker" in navigator)) return;
  await unsubscribeDailyVerse().catch(() => undefined);
}
