import { useState } from "react";
import { tr } from "../lib/i18n";
import type { PlanType } from "../lib/types";
import { actions, useStore } from "../lib/store";
import { DAY_META, dayType, todayISO } from "../lib/fast";
import { UNIT_META, fmtK, fmtQty, itemMacros, sum, uid } from "../lib/nutrition";
import { Icon, KindDot, MacroLine, Summary } from "./ui";
import { useSheet } from "./sheets";

const TYPES: PlanType[] = ["strict", "oil", "fish"];

export function Plan() {
  const s = useStore();
  const open = useSheet();
  const todayType = dayType(todayISO(), s.profile);
  const [plan, setPlan] = useState<PlanType>(todayType === "free" ? "fish" : todayType);
  const [editing, setEditing] = useState<string | null>(null);
  const [newMeal, setNewMeal] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const meals = s.plans[plan];
  const total = sum(meals.flatMap((m) => m.items.map(itemMacros)));

  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr("Хранителен режим", "Meal plan")}</div>
          <h1 className="h1">{tr("План", "Plan")}</h1>
        </div>
        <button className="pill" onClick={() => open({ k: "newplan", plan })}>
          <Icon name="sparkle" size={16} /> {tr("Нов план", "New plan")}
        </button>
      </header>

      <div className="seg" role="tablist">
        {TYPES.map((t) => (
          <button key={t} role="tab" aria-selected={plan === t} className={plan === t ? "on" : ""} onClick={() => setPlan(t)}>
            <span className={`dot ${t}`} style={{ width: 7, height: 7, borderRadius: "50%" }} /> {DAY_META[t].short}
          </button>
        ))}
      </div>

      <div className="small muted" style={{ marginTop: -6, paddingInline: 4 }}>
        {tr(`Попълва всеки ${DAY_META[plan].title.toLowerCase()}: ${DAY_META[plan].rule.toLowerCase()}. Промените важат за дните, които още не си отварял за отметки.`, `Fills every ${DAY_META[plan].title.toLowerCase()}: ${DAY_META[plan].rule.toLowerCase()}. Changes apply to days you haven't ticked anything on yet.`)}
      </div>

      <Summary m={total} />
      {s.profile.planIsExample && (
        <div className="note">{tr("Примерен план. Натисни „Нов план“ и напиши своя, или редактирай храните тук.", "Example plan. Tap “New plan” and write your own, or edit the foods here.")}</div>
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
                    if (name) actions.editPlan(plan, (ms) => ms.map((m) => (m.id === meal.id ? { ...m, name } : m)));
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
                  <button className="icon-btn" aria-label={tr(`Изтрий ${meal.name}`, `Delete ${meal.name}`)} onClick={() => actions.editPlan(plan, (ms) => ms.filter((m) => m.id !== meal.id))}>
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </span>
            </div>
            {meal.items.map((it) => {
              const m = itemMacros(it);
              return (
                <button key={it.id} className="row" style={{ gridTemplateColumns: "28px 1fr auto", width: "100%", paddingLeft: 18 }} onClick={() => open({ k: "planItem", plan, item: it })}>
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
            <button className="add-row" onClick={() => open({ k: "add", target: { to: "plan", plan, mealId: meal.id } })}>
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
            actions.editPlan(plan, (ms) => [...ms, { id: uid(), name: newMeal.trim(), items: [] }]);
            setNewMeal("");
          }}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className="card">
        <button className="li" onClick={() => setCopyOpen(!copyOpen)}>
          <Icon name="refresh" size={18} />
          <span className="grow">{tr("Копирай от друг план", "Copy from another plan")}</span>
          <Icon name={copyOpen ? "down" : "right"} size={16} />
        </button>
        {copyOpen &&
          TYPES.filter((t) => t !== plan).map((t) => (
            <button
              key={t}
              className="li"
              onClick={() => {
                actions.setPlanMeals(plan, s.plans[t].map((m) => ({ ...m, id: uid(), items: m.items.map((i) => ({ ...i, id: uid() })) })));
                setCopyOpen(false);
              }}
            >
              <span className={`dot ${t}`} style={{ width: 8, height: 8, borderRadius: "50%" }} />
              <span className="grow">{DAY_META[t].title} → {DAY_META[plan].title.toLowerCase()}</span>
              <span className="small faint">{fmtK(sum(s.plans[t].flatMap((m) => m.items.map(itemMacros))).kcal)} kcal</span>
            </button>
          ))}
      </div>
    </div>
  );
}
