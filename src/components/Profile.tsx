import { Suspense, lazy, useState } from "react";
import { IS_ARTIFACT } from "../lib/env";

const AccountSection = IS_ARTIFACT ? null : lazy(() => import("./Account"));
import { LANGS, getLang, tr } from "../lib/i18n";
import type { DayType } from "../lib/types";
import { actions, useStore, useSyncStatus } from "../lib/store";
import { DAY_META, FAST_DAYS, FAST_START, WD_SHORT, addDays, dayMonth, dayType, todayISO, parseISO } from "../lib/fast";
import { NumberInput, Switch, Icon } from "./ui";
import { useSheet } from "./sheets";

const syncText = (s: string) =>
  ({
    local: tr("Данните се пазят на това устройство", "Your data is kept on this device"),
    connecting: tr("Свързване с облака…", "Connecting to the cloud…"),
    synced: IS_ARTIFACT ? tr("Синхронизирано в профила ти в Claude", "Synced to your Claude account") : tr("Синхронизирано с профила ти", "Synced to your account"),
    saving: tr("Записване…", "Saving…"),
    error: tr("Облакът не отговаря. Промените са запазени тук и ще се качат по-късно.", "The cloud isn't responding. Changes are saved here and will upload later."),
  } as Record<string, string>)[s] ?? "";

export function Profile() {
  const s = useStore();
  const sync = useSyncStatus();
  const open = useSheet();
  const p = s.profile;
  const lang = getLang();
  const [confirm, setConfirm] = useState(false);
  const macroKcal = Math.round(p.p * 4 + p.c * 4 + p.f * 9);

  const counts: Record<DayType, number> = { strict: 0, oil: 0, fish: 0, free: 0 };
  const fastDays = Array.from({ length: FAST_DAYS }, (_, i) => addDays(FAST_START, i));
  fastDays.forEach((d) => counts[dayType(d, p)]++);

  function splitFromKcal() {
    // 30% protein · 45% carbs · 25% fat
    actions.updateProfile({ p: Math.round((p.kcal * 0.3) / 4), c: Math.round((p.kcal * 0.45) / 4), f: Math.round((p.kcal * 0.25) / 9) });
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr("Настройки", "Settings")}</div>
          <h1 className="h1">{p.name ? p.name : tr("Профил", "Profile")}</h1>
        </div>
      </header>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <span>{tr("Език", "Language")}</span>
          <div className="seg">
            {LANGS.map((l) => (
              <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => actions.setLang(l)}>
                {l === "bg" ? "Български" : "English"}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{tr("Име", "Name")}</span>
          <input id="p-name" className="input" value={p.name} placeholder={tr("Как да те наричаме", "What should we call you")} onChange={(e) => actions.updateProfile({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>{tr("Дневна цел", "Daily goal")}</span>
          <NumberInput id="p-kcal" value={p.kcal} onChange={(kcal) => actions.updateProfile({ kcal: Math.round(kcal) })} suffix="kcal" />
        </label>
        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field"><span className="t-p">{tr("Протеин", "Protein")}</span><NumberInput id="p-p" value={p.p} onChange={(v) => actions.updateProfile({ p: Math.round(v) })} suffix={tr("г", "g")} /></label>
          <label className="field"><span className="t-c">{tr("Въглехидр.", "Carbs")}</span><NumberInput id="p-c" value={p.c} onChange={(v) => actions.updateProfile({ c: Math.round(v) })} suffix={tr("г", "g")} /></label>
          <label className="field"><span className="t-f">{tr("Мазнини", "Fat")}</span><NumberInput id="p-f" value={p.f} onChange={(v) => actions.updateProfile({ f: Math.round(v) })} suffix={tr("г", "g")} /></label>
        </div>
        <div className="sec-head" style={{ padding: 0 }}>
          <span className="tiny faint">{tr(`Макросите дават ${macroKcal} kcal`, `Macros add up to ${macroKcal} kcal`)}</span>
          <button className="btn sm ghost" onClick={splitFromKcal}>{tr("Раздели 30/45/25", "Split 30/45/25")}</button>
        </div>
      </section>

      <div className="sec-head"><span className="eyebrow">{tr("Правила на поста", "Fasting rules")}</span></div>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <span>{tr("Кога е разрешена риба (до 19 декември)", "When fish is allowed (until 19 December)")}</span>
          <div className="typepick">
            <button className={p.ruleSet === "typikon" ? "on" : ""} onClick={() => actions.updateProfile({ ruleSet: "typikon" })}>
              <b>{tr("По типикона", "By the Typikon")}</b>
              <span className="tiny muted">{tr("От 23 ноември до Никулден: вт, чт, сб, нд. После: сб и нд", "23 Nov to St Nicholas (6 Dec): Tue, Thu, Sat, Sun. After that: Sat and Sun")}</span>
            </button>
            <button className={p.ruleSet === "weekend" ? "on" : ""} onClick={() => actions.updateProfile({ ruleSet: "weekend" })}>
              <b>{tr("Само събота и неделя", "Saturdays and Sundays only")}</b>
              <span className="tiny muted">{tr("От 23 ноември", "From 23 November")}</span>
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{tr("Морски дарове в дни с олио", "Seafood on oil days")}</div>
            <div className="tiny muted">{tr("Скариди, миди и калмари и в дните без риба", "Shrimp, mussels and squid on days without fish too")}</div>
          </div>
          <Switch on={p.seafoodOnOil} onChange={(v) => actions.updateProfile({ seafoodOnOil: v })} label={tr("Морски дарове в дни с олио", "Seafood on oil days")} />
        </div>
        <div className="note small">
          {tr("Първата седмица (15–22 ноември) е без риба. Сряда и петък са строги (без олио). От 20 до 23 декември няма риба, а 24 декември е строг. Всеки ден можеш да промениш ръчно от календара.", "The first week (15–22 November) has no fish. Wednesdays and Fridays are strict (no oil). There's no fish from 20 to 23 December, and 24 December is strict. You can change any day by hand from the calendar.")}
        </div>
      </section>

      <div className="sec-head">
        <span className="eyebrow">{tr("40 дни · 15.11 – 24.12", "40 days · 15 Nov – 24 Dec")}</span>
        <span className="tiny faint">{tr(`${counts.fish} риба · ${counts.oil} олио · ${counts.strict} строги`, `${counts.fish} fish · ${counts.oil} oil · ${counts.strict} strict`)}</span>
      </div>
      <section className="card pad">
        <FastGrid onPick={(d) => open({ k: "daytype", date: d })} />
      </section>

      {AccountSection && (
        <Suspense fallback={null}>
          <AccountSection />
        </Suspense>
      )}

      <div className="sec-head"><span className="eyebrow">{tr("Данни", "Data")}</span></div>
      <section className="card">
        <div className="li">
          <Icon name="cloud" size={18} />
          <span className="grow small">{syncText(sync)}</span>
          {sync === "saving" || sync === "connecting" ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
        </div>
        <button
          className="li"
          style={{ color: "var(--warn)" }}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            actions.resetAll();
            setConfirm(false);
          }}
        >
          <Icon name="trash" size={18} />
          <span className="grow">{confirm ? tr("Натисни пак, за да изтриеш всичко", "Tap again to erase everything") : tr("Започни отначало", "Start over")}</span>
        </button>
      </section>
      <div className="tiny faint" style={{ textAlign: "center", paddingBottom: 8 }}>{tr("Коледни пости · Рождество Христово, 25 декември", "Nativity Fast · Christmas Day, 25 December")}</div>
    </div>
  );
}

function FastGrid({ onPick }: { onPick: (d: string) => void }) {
  const s = useStore();
  const today = todayISO();
  // Weeks from Monday 9 Nov to Sunday 27 Dec 2026
  const start = "2026-11-09";
  const cells = Array.from({ length: 49 }, (_, i) => addDays(start, i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="month">
        {WD_SHORT.map((w, i) => <div key={i} className="wd">{w}</div>)}
        {cells.map((d) => {
          const inside = d >= FAST_START && d <= "2026-12-24";
          const t = dayType(d, s.profile);
          const dt = parseISO(d);
          return (
            <button
              key={d}
              className={`dcell ${d === today ? "today" : ""} ${inside ? "" : "out"}`}
              disabled={!inside}
              onClick={() => onPick(d)}
              aria-label={`${dayMonth(d)}, ${DAY_META[t].title}`}
            >
              <span className="dn" style={{ width: 30, height: 30, fontSize: 13.5 }}>{dt.getDate()}</span>
              <span className={`dot ${inside ? t : "free"}`} />
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="dot fish" /> {DAY_META.fish.short}</span>
        <span><i className="dot oil" /> {DAY_META.oil.short}</span>
        <span><i className="dot strict" /> {DAY_META.strict.short}</span>
      </div>
    </div>
  );
}
