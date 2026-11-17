import { useEffect, useState } from "react";
import { pushState, sendTestVerse, subscribeDailyVerse, unsubscribeDailyVerse, type PushState } from "../lib/push";
import { getLang, tr } from "../lib/i18n";
import { Icon, Switch, toast } from "./ui";

/** Web build only: turn the 7:00 fasting-verse notification on or off for this phone */
export default function DailyVerseRow() {
  const [state, setState] = useState<PushState | "busy" | null>(null);
  useEffect(() => {
    pushState().then(setState, () => setState("unsupported"));
  }, []);

  async function toggle(on: boolean) {
    setState("busy");
    try {
      if (on) {
        const r = await subscribeDailyVerse(getLang());
        setState(r);
        if (r === "on") toast(tr("Всяка сутрин в 7:00 ще получаваш стих", "You'll get a verse every morning at 7:00"));
      } else {
        await unsubscribeDailyVerse();
        setState("off");
      }
    } catch (e) {
      console.warn("push", e);
      toast(tr("Не успях да включа известията. Опитай пак.", "Couldn't turn notifications on. Try again."));
      setState(await pushState().catch(() => "off" as const));
    }
  }

  async function test() {
    try {
      const n = await sendTestVerse();
      toast(n ? tr("Изпратено – виж известията си", "Sent – check your notifications") : tr("Няма телефон с включени известия", "No phone has notifications on"));
    } catch {
      toast(tr("Пробата не мина. Опитай пак.", "The test didn't go through. Try again."));
    }
  }

  if (state === null || state === "unsupported") return null;
  return (
    <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="ic-round"><Icon name="bell" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{tr("Стих всяка сутрин в 7:00", "A verse every morning at 7:00")}</div>
          <div className="tiny muted">{tr("Кратък стих за поста, по твоето време", "A short verse on fasting, in your time zone")}</div>
        </div>
        {state === "busy" ? (
          <span className="spinner" style={{ width: 20, height: 20 }} />
        ) : state === "on" || state === "off" ? (
          <Switch on={state === "on"} onChange={toggle} label={tr("Стих всяка сутрин в 7:00", "A verse every morning at 7:00")} />
        ) : null}
      </div>
      {state === "install" && (
        <div className="note small">
          {tr(
            "На iPhone първо добави приложението на началния екран: Сподели → „Добави към началния екран“. После го отвори от иконата и включи известията тук.",
            "On iPhone, first add the app to your Home Screen: Share → “Add to Home Screen”. Then open it from that icon and turn this on here.",
          )}
        </div>
      )}
      {state === "denied" && (
        <div className="note warn small">
          {tr("Известията са спрени за този сайт. Разреши ги от настройките на телефона или браузъра.", "Notifications are blocked for this site. Allow them in your phone or browser settings.")}
        </div>
      )}
      {state === "on" && (
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={test}>
          {tr("Изпрати ми проба сега", "Send me a test now")}
        </button>
      )}
    </section>
  );
}
