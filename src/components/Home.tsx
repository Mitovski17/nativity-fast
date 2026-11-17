import { useState } from "react";
import { tr } from "../lib/i18n";
import type { Entry } from "../lib/types";
import { actions, activePlan, dayView, mealOrder, useStore } from "../lib/store";
import {
  DAY_META, FAST_DAYS, FEASTS, MONTHS, NOTES, WD_SHORT, addDays, allowedKinds, dayType, fastDayNumber, inFast, longDate,
  parseISO, todayISO, weekStart, FAST_START, dayMonth,
} from "../lib/fast";
import { UNIT_META, fmtK, fmtQty, itemMacros, sum } from "../lib/nutrition";
import { Check, Icon, MacroBars, MacroLine, Ring } from "./ui";
import { useSheet } from "./sheets";

function relTitle(date: string) {
  const t = todayISO();
  if (date === t) return tr("Днес", "Today");
  if (date === addDays(t, 1)) return tr("Утре", "Tomorrow");
  if (date === addDays(t, -1)) return tr("Вчера", "Yesterday");
  return dayMonth(date);
}

function Calendar({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const s = useStore();
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState(() => weekStart(date));
  const today = todayISO();
  const d = parseISO(date);

  const cell = (iso: string, dim = false) => {
    const t = dayType(iso, s.profile);
    const n = parseISO(iso).getDate();
    return (
      <button
        key={iso}
        className={`dcell ${iso === date ? "sel" : ""} ${iso === today ? "today" : ""} ${dim ? "out" : ""}`}
        onClick={() => {
          setDate(iso);
          setAnchor(weekStart(iso));
        }}
        aria-label={`${longDate(iso)}, ${DAY_META[t].title}`}
      >
        <span className="dn">{n}</span>
        <span className={`dot ${t}`} />
      </button>
    );
  };

  if (expanded) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const startIso = weekStart(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const span = Math.round((last.getTime() - parseISO(startIso).getTime()) / 86400000) + 1;
    const rows = Array.from({ length: Math.ceil(span / 7) * 7 }, (_, i) => addDays(startIso, i));
    return (
      <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="sec-head" style={{ padding: 0 }}>
          <button className="icon-btn" onClick={() => setDate(addDays(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, -1))} aria-label={tr("Предишен месец", "Previous month")}><Icon name="left" /></button>
          <button className="month-toggle" onClick={() => setExpanded(false)} style={{ textTransform: "capitalize", color: "var(--ink)", fontSize: 15, fontWeight: 700 }}>
            {MONTHS[d.getMonth()]} {d.getFullYear()} <Icon name="down" size={16} />
          </button>
          <button className="icon-btn" onClick={() => setDate(`${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}-${String(((d.getMonth() + 1) % 12) + 1).padStart(2, "0")}-01`)} aria-label={tr("Следващ месец", "Next month")}><Icon name="right" /></button>
        </div>
        <div className="month">
          {WD_SHORT.map((w, i) => <div key={i} className="wd">{w}</div>)}
          {rows.map((iso) => cell(iso, parseISO(iso).getMonth() !== d.getMonth()))}
        </div>
        <div className="legend">
          <span><i className="dot fish" /> {DAY_META.fish.short}</span>
          <span><i className="dot oil" /> {DAY_META.oil.short}</span>
          <span><i className="dot strict" /> {DAY_META.strict.short}</span>
        </div>
      </div>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="week" style={{ paddingInline: 0 }}>
        <span />
        {WD_SHORT.map((w, i) => <span key={i} className="dcell" style={{ padding: 0 }}><span className="wd">{w}</span></span>)}
        <span />
      </div>
      <div className="week">
        <button className="week-nav" onClick={() => setAnchor(addDays(anchor, -7))} aria-label={tr("Предишна седмица", "Previous week")}><Icon name="left" size={18} /></button>
        {days.map((iso) => cell(iso))}
        <button className="week-nav" onClick={() => setAnchor(addDays(anchor, 7))} aria-label={tr("Следваща седмица", "Next week")}><Icon name="right" size={18} /></button>
      </div>
      <button className="month-toggle" style={{ alignSelf: "center" }} onClick={() => setExpanded(true)}>
        <Icon name="calendar" size={15} /> {tr("Целият месец", "Full month")}
      </button>
    </div>
  );
}

function DayCard({ date }: { date: string }) {
  const s = useStore();
  const open = useSheet();
  const t = dayType(date, s.profile);
  const allowed = allowedKinds(t, s.profile);
  const n = fastDayNumber(date);
  const note = FEASTS[date] ?? NOTES[date];
  const sub = inFast(date) ? tr(`Ден ${n} от ${FAST_DAYS}`, `Day ${n} of ${FAST_DAYS}`) : date < FAST_START ? tr("Постът започва на 15 ноември", "The fast starts on 15 November") : tr("Постът приключи", "The fast is over");
  const chip = (ok: boolean, label: string, dot?: string) => (
    <span className={`chip ${ok ? "" : "no"}`}>
      {dot && ok && <span className="cdot" style={{ background: `var(--${dot})` }} />}
      {label}
    </span>
  );
  return (
    <button className="card daycard" style={{ textAlign: "left" }} onClick={() => open({ k: "daytype", date })} aria-label={tr("Смени вида на деня", "Change the day type")}>
      <span className={`swatch ${t}`} />
      <div className="meta">
        <span className="eyebrow">{sub}</span>
        {s.profile.overrides[date] && <span className="tiny faint">{tr("ръчно", "set by hand")}</span>}
      </div>
      <div>
        <div className="title display">{DAY_META[t].title}</div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {DAY_META[t].rule}
          {note ? ` · ${note}` : ""}
        </div>
      </div>
      {t !== "free" && (
        <div className="chips">
          {chip(true, tr("Растително", "Plant-based"))}
          {chip(allowed.includes("oil"), tr("Олио", "Oil"), "oil")}
          {chip(allowed.includes("fish"), tr("Риба", "Fish"), "fish")}
          {chip(allowed.includes("seafood"), tr("Морски дарове", "Seafood"), "fish")}
        </div>
      )}
    </button>
  );
}

export function Home({ date, setDate, onProfile }: { date: string; setDate: (d: string) => void; onProfile: () => void }) {
  const s = useStore();
  const open = useSheet();
  const { entries, type } = dayView(s, date);
  const meals = mealOrder(s, date, entries);
  const allowed = allowedKinds(type, s.profile);
  const eaten = sum(entries.filter((e) => e.done).map(itemMacros));
  const planned = sum(entries.map(itemMacros));
  const today = todayISO();
  const plan = activePlan(s);

  return (
    <div className="screen">
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{longDate(date)}</div>
          <h1 className="h1">{relTitle(date)}</h1>
        </div>
        {date !== today && (
          <button className="pill light" onClick={() => setDate(today)}>{tr("Днес", "Today")}</button>
        )}
        <button className="avatar" onClick={onProfile} aria-label={tr("Профил и настройки", "Profile and settings")}>
          {s.profile.name.trim() ? s.profile.name.trim()[0].toUpperCase() : <Icon name="user" size={20} />}
        </button>
      </header>

      <Calendar key={date.slice(0, 7)} date={date} setDate={setDate} />
      <DayCard date={date} />

      <section className="card pad">
        <div className="cal">
          <Ring value={eaten.kcal} goal={s.profile.kcal} />
          <div className="calstats">
            <button className="stat stat-btn" onClick={() => open({ k: "goal" })} aria-label={tr("Промени дневната цел", "Change the daily goal")}><span className="muted small">{tr("Цел", "Goal")} <Icon name="pen" size={12} /></span><b>{fmtK(s.profile.kcal)}</b></button>
            <div className="stat"><span className="muted small">{tr("Изядено", "Eaten")}</span><b>{fmtK(eaten.kcal)}</b></div>
            <div className="stat"><span className="muted small">{tr("По план", "Planned")}</span><b className="muted">{fmtK(planned.kcal)}</b></div>
          </div>
        </div>
        <MacroBars m={eaten} goal={s.profile} />
      </section>

      {!plan && (
        <div className="note" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "var(--ink)" }}><Icon name="pen" size={18} /></span>
          <span>{tr("Ръчно проследяване: добавяй храните с „+“ или от всяко хранене. Планът може да се включи от „План“.", "Manual tracking: add foods with “+” or under each meal. You can switch a plan on under “Plan”.")}</span>
        </div>
      )}

      {plan?.example && type !== "free" && (
        <div className="note" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "var(--ink)" }}><Icon name="sparkle" size={18} /></span>
          <span>{tr("Това е примерен план. Въведи своя в „План“ и денят ще се попълва с твоите храни.", "This is an example plan. Enter yours under “Plan” and every day fills with your own foods.")}</span>
        </div>
      )}

      {meals.map((meal) => {
        const list = entries.filter((e) => e.meal === meal);
        const allDone = list.length > 0 && list.every((e) => e.done);
        const mk = sum(list.filter((e) => e.done).map(itemMacros)).kcal;
        const mt = sum(list.map(itemMacros)).kcal;
        return (
          <section key={meal} className="card meal">
            <div className="meal-head">
              <span className="h2">
                {list.length > 0 && (
                  <Check small on={allDone} onClick={() => actions.setMealDone(date, meal, !allDone)} label={tr(`Отбележи цялото хранене ${meal}`, `Tick all of ${meal}`)} />
                )}
                {meal}
              </span>
              <span className="meal-kcal">
                {list.length ? `${fmtK(mk)} / ${fmtK(mt)} kcal` : ""}
              </span>
            </div>
            {list.map((e) => (
              <EntryRow key={e.id} e={e} ok={allowed.includes(e.kind)} onToggle={() => actions.toggle(date, e.id)} onOpen={() => open({ k: "entry", date, entry: e })} />
            ))}
            <button className="add-row" onClick={() => open({ k: "add", target: { to: "day", date, meal } })}>
              <Icon name="plus" size={18} /> {tr("Добави", "Add")}
            </button>
          </section>
        );
      })}
    </div>
  );
}

function EntryRow({ e, ok, onToggle, onOpen }: { e: Entry; ok: boolean; onToggle: () => void; onOpen: () => void }) {
  const m = itemMacros(e);
  return (
    <div className={`row ${e.done ? "" : "pending"}`}>
      <Check on={e.done} onClick={onToggle} label={e.done ? tr(`Махни отметката от ${e.name}`, `Untick ${e.name}`) : tr(`Отбележи ${e.name}`, `Tick ${e.name}`)} />
      <button className="row-main" onClick={onOpen}>
        <span className="row-name">{e.name}</span>
        <span className="row-sub">
          <span>{fmtQty(e.qty)} {UNIT_META[e.unit].label}</span>
          <MacroLine m={m} />
          {!ok && (
            <span className="warn-tag"><Icon name="alert" size={13} /> {tr("не е за днес", "not for today")}</span>
          )}
        </span>
      </button>
      <span className="row-kcal">{fmtK(m.kcal)}</span>
    </div>
  );
}
