import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { sb, supabaseRemote } from "../lib/cloud";
import { actions, closeUser, flushNow, openUser, pullRemote, useLang } from "../lib/store";
import { LANGS, tr } from "../lib/i18n";
import { Icon } from "./ui";

type Mode = "signin" | "signup" | "forgot" | "recovery";

/* ───────── who is signed in (read by Profile) ───────── */

let account: { id: string; email: string } | null = null;
const accountListeners = new Set<() => void>();
export function useAccount() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    accountListeners.add(l);
    return () => void accountListeners.delete(l);
  }, []);
  return account;
}
function setAccount(a: typeof account) {
  account = a;
  accountListeners.forEach((l) => l());
}

export async function signOut(forget = false) {
  await flushNow().catch(() => undefined);
  await sb.auth.signOut();
  closeUser(forget);
  setAccount(null);
}

/** Shows the sign-in screen until there is a session, then the app with that person's data */
export function AuthGate({ children }: { children: ReactNode }) {
  useLang();
  const [phase, setPhase] = useState<"loading" | "out" | "in" | "recovery">("loading");
  const current = useRef<string | null>(null);

  useEffect(() => {
    const enter = async (s: Session | null) => {
      if (!s) {
        if (current.current) closeUser();
        current.current = null;
        setAccount(null);
        setPhase("out");
        return;
      }
      if (current.current === s.user.id) return;
      current.current = s.user.id;
      setAccount({ id: s.user.id, email: s.user.email ?? "" });
      setPhase("in");
      await openUser(s.user.id, supabaseRemote(s.user.id));
    };
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      // Supabase asks not to await its own calls inside this callback
      setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") setPhase("recovery");
        else if (event === "SIGNED_OUT") enter(null);
        else if (event === "INITIAL_SESSION" || event === "SIGNED_IN") enter(s);
      }, 0);
    });
    // Pick up changes from other devices when the app comes back to the front
    const onShow = () => document.visibilityState === "visible" && current.current && pullRemote();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  if (phase === "loading")
    return (
      <div className="auth-wrap" style={{ placeItems: "center" }}>
        <span className="spinner" />
      </div>
    );
  if (phase === "out") return <AuthScreen initial="signin" onDone={() => undefined} />;
  if (phase === "recovery") return <AuthScreen initial="recovery" onDone={() => setPhase("in")} />;
  return <>{children}</>;
}

function errorText(e: AuthError | Error | null): string {
  const code = (e as AuthError | null)?.code;
  switch (code) {
    case "invalid_credentials":
      return tr("Грешен имейл или парола.", "Wrong email or password.");
    case "email_not_confirmed":
      return tr("Потвърди имейла си от писмото, което ти изпратихме.", "Confirm your email from the message we sent you.");
    case "user_already_exists":
    case "email_exists":
      return tr("Вече има профил с този имейл. Влез в него.", "There's already an account with this email. Sign in instead.");
    case "weak_password":
      return tr("Паролата е твърде слаба. Използвай поне 8 знака.", "That password is too weak. Use at least 8 characters.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return tr("Твърде много опити. Изчакай малко и опитай пак.", "Too many attempts. Wait a little and try again.");
    case "email_address_invalid":
    case "validation_failed":
      return tr("Провери имейла.", "Check the email address.");
    case "same_password":
      return tr("Новата парола трябва да е различна.", "The new password has to be different.");
    default:
      return e?.message || tr("Нещо се обърка. Опитай пак.", "Something went wrong. Try again.");
  }
}

function AuthScreen({ initial, onDone }: { initial: Mode; onDone: () => void }) {
  const lang = useLang();
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setErr("");
    setInfo("");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setInfo("");
    const redirect = window.location.origin + window.location.pathname;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setErr(errorText(error));
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (error) setErr(errorText(error));
        else if (!data.session)
          setInfo(tr("Готово. Отвори писмото, което ти изпратихме, и потвърди имейла си. После влез тук.", "Done. Open the email we sent you and confirm your address, then sign in here."));
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
        if (error) setErr(errorText(error));
        else setInfo(tr("Ако има профил с този имейл, ще получиш линк за нова парола.", "If there's an account with this email, a link to set a new password is on its way."));
      } else {
        const { error } = await sb.auth.updateUser({ password });
        if (error) setErr(errorText(error));
        else onDone();
      }
    } catch (x) {
      setErr(errorText(x as Error));
    } finally {
      setBusy(false);
    }
  }

  const title = { signin: tr("Влез", "Sign in"), signup: tr("Създай профил", "Create an account"), forgot: tr("Забравена парола", "Forgot password"), recovery: tr("Нова парола", "New password") }[mode];
  const cta = { signin: tr("Влез", "Sign in"), signup: tr("Създай профил", "Create account"), forgot: tr("Изпрати линк", "Send link"), recovery: tr("Запази паролата", "Save password") }[mode];
  const needsEmail = mode !== "recovery";
  const needsPassword = mode !== "forgot";

  return (
    <div className="auth-wrap">
      <div className="auth-top">
        <div className="seg auth-lang" role="group" aria-label={tr("Език", "Language")}>
          {LANGS.map((l) => (
            <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => actions.setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="auth-brand">
        <img src="icon.svg" alt="" width={64} height={64} />
        <h1 className="display">{tr("Коледни пости", "Nativity Fast")}</h1>
        <p className="muted">{tr("Калории, макроси и календар на поста. 15 ноември – 24 декември.", "Calories, macros and the fasting calendar. 15 November – 24 December.")}</p>
      </div>

      <form className="card pad auth-card" onSubmit={submit}>
        <h2 className="h2">{title}</h2>
        {mode === "forgot" && <p className="small muted" style={{ margin: 0 }}>{tr("Въведи имейла си и ще ти изпратим линк.", "Enter your email and we'll send you a link.")}</p>}
        {needsEmail && (
          <label className="field">
            <span>{tr("Имейл", "Email")}</span>
            <input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {needsPassword && (
          <label className="field">
            <span>{mode === "recovery" ? tr("Нова парола", "New password") : tr("Парола", "Password")}</span>
            <div className="input-suffix">
              <input
                className="input"
                type={show ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "signin" ? undefined : 8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label={show ? tr("Скрий паролата", "Hide password") : tr("Покажи паролата", "Show password")}>
                {show ? tr("Скрий", "Hide") : tr("Покажи", "Show")}
              </button>
            </div>
            {mode !== "signin" && <span className="tiny faint" style={{ fontWeight: 500 }}>{tr("Поне 8 знака.", "At least 8 characters.")}</span>}
          </label>
        )}
        {err && <div className="note warn">{err}</div>}
        {info && <div className="note">{info}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <span className="spinner" /> : null} {cta}
        </button>
        {mode === "signin" && (
          <button type="button" className="auth-link" onClick={() => go("forgot")}>
            {tr("Забравена парола?", "Forgot your password?")}
          </button>
        )}
      </form>

      {mode !== "recovery" && (
        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              {tr("Нямаш профил?", "New here?")}{" "}
              <button type="button" className="auth-link" onClick={() => go("signup")}>{tr("Създай профил", "Create an account")}</button>
            </>
          ) : (
            <>
              {tr("Имаш профил?", "Have an account?")}{" "}
              <button type="button" className="auth-link" onClick={() => go("signin")}>
                <Icon name="left" size={14} /> {tr("Влез", "Sign in")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
