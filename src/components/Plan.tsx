import { useState } from "react";
import type { MealPlan, PlanType } from "../lib/types";
import { actions, activePlan, useStore } from "../lib/store";
import { DAY_META, dayType, todayISO } from "../lib/fast";
import { UNIT_META, fmtK, fmtQty, itemMacros, sum, uid } from "../lib/nutrition";
import { Icon, KindDot, MacroLine, Summary, toast } from "./ui";
import { useSheet } from "./sheets";
import { tr } from "../lib/i18n";

const TYPES: PlanType[] = ["strict", "oil", "fish"];
const dayTotal = (p: MealPlan, t: PlanType) => sum(p.days[t].flatMap((m) => m.items.map(itemMacros)));

export function Plan() {
  const [openId, setOpenId] = useState<string | null>(null);
  const s = useStore();
  if (openId && s.plans[openId]) return <PlanDetail plan={s.plans[openId]} onBack={() => setOpenId(null)} />;
  return <PlanList onOpen={setOpenId} />;
}

/* ───────── the library of plans ───────── */

function PlanList({ onOpen }: { onOpen: (id: string) => void }) {
  const s = useStore();
  const open = useSheet();
  const active = activePlan(s);
  const p = s.profile;
  const plans = Object.values(s.plans).sort((a, b) => (a.id === active?.id ? -1 : b.id === active?.id ? 1 : b.createdAt - a.createdAt));

  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr("Хранителен режим", "Meal plans")}</div>
          <h1 className="h1">{tr("Планове", "Plans")}</h1>
        </div>
        <button className="pill" onClick={() => open({ k: "newplan" })}>
          <Icon name="plus" size={16} /> {tr("Нов план", "New plan")}
        </button>
      </header>

      <button className="card pad goal-card" onClick={() => open({ k: "goal" })} aria-label={tr("Промени дневната цел", "Change the daily goal")}>
        <div>
          <div className="eyebrow">{tr("Дневна цел", "Daily goal")}</div>
          <div className="goal-kcal">{fmtK(p.kcal)} <span>kcal</span></div>
          <div className="goal-macros">
            <span className="t-p">{p.p} {tr("г протеин", "g protein")}</span>
            <span className="t-c">{p.c} {tr("г въглехидр.", "g carbs")}</span>
            <span className="t-f">{p.f} {tr("г мазнини", "g fat")}</span>
          </div>
        </div>
        <span className="pill light"><Icon name="pen" size={14} /> {tr("Промени", "Edit")}</span>
      </button>

      <div className="sec-head"><span className="eyebrow">{tr("Как попълваш дните", "How your days fill")}</span></div>
      <section className="card">
        <ModeRow
          on={!active}
          title={tr("Ръчно проследяване", "Manual tracking")}
          sub={tr("Без план: добавяш всичко сам, денят започва празен", "No plan: you add everything yourself; days start empty")}
          onSelect={() => {
            actions.setActivePlan(null);
            toast(tr("Ръчно проследяване", "Manual tracking on"));
          }}
        />
        {plans.map((pl) => (
          <PlanRow key={pl.id} plan={pl} active={pl.id === active?.id} onOpen={() => onOpen(pl.id)} />
        ))}
      </section>
      <div className="tiny faint" style={{ textAlign: "center", paddingInline: 12 }}>
        {tr("Активният план попълва дните, в които още не си отбелязвал нищо. Дните с отметки пазят своите храни.", "The active plan fills the days you haven't ticked anything on yet. Days with ticks keep their foods.")}
      </div>
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return <span className={`radio ${on ? "on" : ""}`} aria-hidden="true" />;
}

function ModeRow({ on, title, sub, onSelect }: { on: boolean; title: string; sub: string; onSelect: () => void }) {
  return (
    <button className="li plan-row" onClick={onSelect} aria-pressed={on}>
      <Radio on={on} />
      <span className="grow">
        <span className="name">{title}</span>
        <span className="tiny muted" style={{ display: "block" }}>{sub}</span>
      </span>
    </button>
  );
}

function PlanRow({ plan, active, onOpen }: { plan: MealPlan; active: boolean; onOpen: () => void }) {
  return (
    <div className="li plan-row">
      <button
        className="radio-hit"
        onClick={() => {
          actions.setActivePlan(plan.id);
          toast(tr(`„${plan.name}“ е активен`, `“${plan.name}” is on`));
        }}
        aria-pressed={active}
        aria-label={tr(`Използвай ${plan.name}`, `Use ${plan.name}`)}
      >
        <Radio on={active} />
      </button>
      <button className="grow plan-open" onClick={onOpen}>
        <span className="name">
          {plan.name}
          {active && <span className="badge">{tr("активен", "on")}</span>}
        </span>
        <span className="plan-kcal">
          {TYPES.map((t) => (
            <span key={t}>
              <i className={`dot ${t}`} /> {plan.days[t].length ? fmtK(dayTotal(plan, t).kcal) : "–"}
            </span>
          ))}
        </span>
      </button>
      <button className="icon-btn" onClick={onOpen} aria-label={tr(`Отвори ${plan.name}`, `Open ${plan.name}`)}>
        <Icon name="right" size={18} />
      </button>
    </div>
  );
}

/* ───────── one plan ───────── */

function PlanDetail({ plan, onBack }: { plan: MealPlan; onBack: () => void }) {
  const s = useStore();
  const open = useSheet();
  const todayType = dayType(todayISO(), s.profile);
  const [type, setType] = useState<PlanType>(todayType === "free" ? "fish" : todayType);
  const [editing, setEditing] = useState<string | null>(null);
  const [newMeal, setNewMeal] = useState("");
  const [more, setMore] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isActive = s.profile.activePlan === plan.id;
  const meals = plan.days[type];
  const total = dayTotal(plan, type);

  return (
    <div className="screen">
      <header className="topbar" style={{ alignItems: "center" }}>
        <button className="icon-btn" onClick={onBack} aria-label={tr("Назад към плановете", "Back to plans")} style={{ marginLeft: -8 }}>
          <Icon name="left" size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{isActive ? tr("Активен план", "Active plan") : tr("План", "Plan")}</div>
          <input
            className="h1 plan-title"
            value={plan.name}
            onChange={(e) => actions.renamePlan(plan.id, e.target.value)}
            onBlur={(e) => !e.target.value.trim() && actions.renamePlan(plan.id, tr("План", "Plan"))}
            aria-label={tr("Име на плана", "Plan name")}
          />
        </div>
      </header>

      <button
        className={`btn block ${isActive ? "outline" : "primary"}`}
        onClick={() => {
          actions.setActivePlan(isActive ? null : plan.id);
          toast(isActive ? tr("Ръчно проследяване", "Manual tracking on") : tr(`„${plan.name}“ е активен`, `“${plan.name}” is on`));
        }}
      >
        <Icon name={isActive ? "x" : "check"} size={18} /> {isActive ? tr("Изключи плана", "Turn this plan off") : tr("Използвай този план", "Use this plan")}
      </button>

      <div className="seg" role="tablist">
        {TYPES.map((t) => (
          <button key={t} role="tab" aria-selected={type === t} className={type === t ? "on" : ""} onClick={() => setType(t)}>
            <span className={`dot ${t}`} style={{ width: 7, height: 7, borderRadius: "50%" }} /> {DAY_META[t].short}
          </button>
        ))}
      </div>

      <div className="small muted" style={{ marginTop: -6, paddingInline: 4 }}>
        {tr(`За всеки ${DAY_META[type].title.toLowerCase()}: ${DAY_META[type].rule.toLowerCase()}.`, `For every ${DAY_META[type].title.toLowerCase()}: ${DAY_META[type].rule.toLowerCase()}.`)}
      </div>

      <button className="summary-btn" onClick={() => open({ k: "goal" })} aria-label={tr("Промени дневната цел", "Change the daily goal")}>
        <Summary m={total} />
        <span className="tiny faint">
          {tr(`Цел ${fmtK(s.profile.kcal)} kcal · ${s.profile.p}/${s.profile.c}/${s.profile.f} г`, `Goal ${fmtK(s.profile.kcal)} kcal · ${s.profile.p}/${s.profile.c}/${s.profile.f} g`)} · <u>{tr("промени", "edit")}</u>
        </span>
      </button>

      {plan.example && <div className="note">{tr("Примерен план. Редактирай храните тук или създай свой с „Нов план“.", "Example plan. Edit the foods here, or make your own with “New plan”.")}</div>}

      {meals.length === 0 && (
        <div className="note">{tr("Няма хранения за този вид ден. Добави хранене или копирай от друг вид ден.", "No meals for this kind of day yet. Add a meal or copy from another kind of day.")}</div>
      )}

      {meals.map((meal) => {
        const mt = sum(meal.items.map(itemMacros));
        return (
          <section key={meal.id} className="card meal">
            <div className="meal-head">
              {editing === meal.id ? (
                <input
                  autoFocus
                  className="input"
                  style={{ height: 40 }}
                  defaultValue={meal.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name) actions.editPlan(plan.id, type, (ms) => ms.map((m) => (m.id === meal.id ? { ...m, name } : m)));
                    setEditing(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  aria-label={tr("Име на храненето", "Meal name")}
                />
              ) : (
                <button className="h2" onClick={() => setEditing(meal.id)} style={{ textAlign: "left" }}>{meal.name}</button>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span className="meal-kcal">{fmtK(mt.kcal)} kcal</span>
                {meal.items.length === 0 && (
                  <button className="icon-btn" aria-label={tr(`Изтрий ${meal.name}`, `Delete ${meal.name}`)} onClick={() => actions.editPlan(plan.id, type, (ms) => ms.filter((m) => m.id !== meal.id))}>
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </span>
            </div>
            {meal.items.map((it) => {
              const m = itemMacros(it);
              return (
                <button key={it.id} className="row" style={{ gridTemplateColumns: "28px 1fr auto", width: "100%", paddingLeft: 18 }} onClick={() => open({ k: "planItem", planId: plan.id, plan: type, item: it })}>
                  <KindDot kind={it.kind} />
                  <span className="row-main">
                    <span className="row-name">{it.name}</span>
                    <span className="row-sub">
                      <span>{fmtQty(it.qty)} {UNIT_META[it.unit].label}</span>
                      <MacroLine m={m} />
                    </span>
                  </span>
                  <span className="row-kcal">{fmtK(m.kcal)}</span>
                </button>
              );
            })}
            <button className="add-row" onClick={() => open({ k: "add", target: { to: "plan", planId: plan.id, plan: type, mealId: meal.id } })}>
              <Icon name="plus" size={18} /> {tr("Добави храна", "Add food")}
            </button>
          </section>
        );
      })}

      <div style={{ display: "flex", gap: 8 }}>
        <input id="new-meal" className="input" placeholder={tr("Ново хранене, напр. Следобедна закуска", "New meal, e.g. Afternoon snack")} value={newMeal} onChange={(e) => setNewMeal(e.target.value)} />
        <button
          className="btn ghost"
          disabled={!newMeal.trim()}
          onClick={() => {
            actions.editPlan(plan.id, type, (ms) => [...ms, { id: uid(), name: newMeal.trim(), items: [] }]);
            setNewMeal("");
          }}
          aria-label={tr("Добави хранене", "Add meal")}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className="card">
        <button className="li" onClick={() => setMore(!more)}>
          <Icon name="refresh" size={18} />
          <span className="grow">{tr("Копирай, дублирай, изтрий", "Copy, duplicate, delete")}</span>
          <Icon name={more ? "down" : "right"} size={16} />
        </button>
        {more && (
          <>
            {TYPES.filter((t) => t !== type).map((t) => (
              <button key={t} className="li" onClick={() => { actions.copyPlanDay(plan.id, t, type); toast(tr("Копирано", "Copied")); }}>
                <span className={`dot ${t}`} style={{ width: 8, height: 8, borderRadius: "50%" }} />
                <span className="grow">{tr(`Копирай ${DAY_META[t].title.toLowerCase()} → ${DAY_META[type].title.toLowerCase()}`, `Copy ${DAY_META[t].title.toLowerCase()} → ${DAY_META[type].title.toLowerCase()}`)}</span>
                <span className="small faint">{fmtK(dayTotal(plan, t).kcal)} kcal</span>
              </button>
            ))}
            <button
              className="li"
              onClick={() => {
                actions.duplicatePlan(plan.id, tr(`${plan.name} (копие)`, `${plan.name} (copy)`));
                toast(tr("Планът е дублиран", "Plan duplicated"));
                onBack();
              }}
            >
              <Icon name="book" size={18} />
              <span className="grow">{tr("Дублирай плана", "Duplicate this plan")}</span>
            </button>
            <button
              className="li"
              style={{ color: "var(--warn)" }}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                actions.deletePlan(plan.id);
                toast(tr("Планът е изтрит", "Plan deleted"));
                onBack();
              }}
            >
              <Icon name="trash" size={18} />
              <span className="grow">{confirmDel ? tr("Натисни пак, за да изтриеш плана", "Tap again to delete this plan") : tr("Изтрий плана", "Delete this plan")}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
