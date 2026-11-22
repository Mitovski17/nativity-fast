import type { BibleNotes, Food, Item, Kind, Meal, MealPlan, Plans, Profile, State, Unit } from "./types";
import { itemFromFood, uid } from "./nutrition";
import { getLang, type Lang } from "./i18n";
import { dbById } from "./foodsdb";

type Row = [id: string, bg: string, en: string, kind: Kind, kcal: number, p: number, c: number, f: number, units?: Partial<Record<Unit, number>>];

// Typical values per 100 g (cooked where noted). Editable in the library.
const ROWS: Row[] = [
  ["tofu", "Тофу", "Tofu", "vegan", 144, 15.8, 2.8, 8.7, { serving: 100 }],
  ["oats", "Овесени ядки", "Rolled oats", "vegan", 379, 13.2, 67.7, 6.5, { cup: 80, tbsp: 8 }],
  ["soymilk", "Соево мляко без захар", "Soy milk, unsweetened", "vegan", 33, 3.3, 0.7, 1.8, { cup: 245 }],
  ["banana", "Банан", "Banana", "vegan", 89, 1.1, 22.8, 0.3, { pc: 120 }],
  ["apple", "Ябълка", "Apple", "vegan", 52, 0.3, 13.8, 0.2, { pc: 180 }],
  ["walnuts", "Орехи", "Walnuts", "vegan", 654, 15.2, 13.7, 65.2, { tbsp: 8, serving: 30 }],
  ["tahini", "Тахан", "Tahini", "vegan", 595, 17, 21, 54, { tbsp: 15, tsp: 5 }],
  ["pb", "Фъстъчено масло", "Peanut butter", "vegan", 588, 25, 20, 50, { tbsp: 16, tsp: 5 }],
  ["lentils", "Леща, варена", "Lentils, cooked", "vegan", 116, 9, 20.1, 0.4, { cup: 200 }],
  ["beans", "Бял боб, варен", "White beans, cooked", "vegan", 139, 9.7, 25.1, 0.4, { cup: 180 }],
  ["chickpeas", "Нахут, варен", "Chickpeas, cooked", "vegan", 164, 8.9, 27.4, 2.6, { cup: 165 }],
  ["rice", "Ориз, варен", "Rice, cooked", "vegan", 130, 2.7, 28.2, 0.3, { cup: 160 }],
  ["potato", "Картофи, варени", "Potatoes, boiled", "vegan", 87, 1.9, 20.1, 0.1, { pc: 150 }],
  ["bread", "Пълнозърнест хляб", "Wholegrain bread", "vegan", 247, 13, 41, 3.4, { pc: 35 }],
  ["pasta", "Паста, варена", "Pasta, cooked", "vegan", 158, 5.8, 30.9, 0.9, { cup: 140 }],
  ["sauerkraut", "Кисело зеле", "Sauerkraut", "vegan", 19, 0.9, 4.3, 0.1, { cup: 140 }],
  ["tomato", "Домат", "Tomato", "vegan", 18, 0.9, 3.9, 0.2, { pc: 120 }],
  ["cucumber", "Краставица", "Cucumber", "vegan", 15, 0.7, 3.6, 0.1, { pc: 200 }],
  ["pepper", "Червена чушка", "Red pepper", "vegan", 31, 1, 6, 0.3, { pc: 120 }],
  ["broccoli", "Броколи", "Broccoli", "vegan", 34, 2.8, 6.6, 0.4, { cup: 90 }],
  ["peaprotein", "Растителен протеин на прах", "Plant protein powder", "vegan", 380, 78, 6, 6, { serving: 30 }],
  ["olive", "Зехтин", "Olive oil", "oil", 884, 0, 0, 100, { tbsp: 13.5, tsp: 4.5 }],
  ["sunflower", "Слънчогледово олио", "Sunflower oil", "oil", 884, 0, 0, 100, { tbsp: 13.6, tsp: 4.5 }],
  ["hummus", "Хумус", "Hummus", "oil", 177, 7.9, 14.3, 9.6, { tbsp: 15 }],
  ["lyutenitsa", "Лютеница", "Lyutenitsa", "oil", 85, 1.6, 10, 4.3, { tbsp: 20 }],
  ["mackerel", "Скумрия, печена", "Mackerel, baked", "fish", 262, 23.9, 0, 17.8, { serving: 150 }],
  ["trout", "Пъстърва, печена", "Trout, baked", "fish", 190, 26.6, 0, 8.5, { pc: 200 }],
  ["tuna", "Риба тон в собствен сос", "Tuna in brine", "fish", 116, 25.5, 0, 0.8, { pc: 112 }],
  ["salmon", "Сьомга, печена", "Salmon, baked", "fish", 206, 22.1, 0, 12.4, { serving: 150 }],
  ["shrimp", "Скариди, варени", "Shrimp, boiled", "seafood", 99, 24, 0.2, 0.3, { serving: 100 }],
  ["mussels", "Миди, варени", "Mussels, cooked", "seafood", 172, 23.8, 7.4, 4.5, { serving: 100 }],
  ["squid", "Калмари", "Squid", "seafood", 92, 15.6, 3.1, 1.4, { serving: 100 }],
];

export function seedFoods(): Record<string, Food> {
  const out: Record<string, Food> = {};
  const now = Date.now();
  const lang = getLang();
  for (const [id, bg, en, kind, kcal, p, c, f, units] of ROWS) {
    out[id] = { id, name: lang === "en" ? en : bg, kind, per100: { kcal, p, c, f }, units: units ?? {}, source: "seed", createdAt: now };
  }
  return out;
}

function meal(name: string, foods: Record<string, Food>, rows: [string, number, Unit?][]): Meal {
  return { id: uid(), name, items: rows.map(([id, qty, unit]) => itemFromFood(foods[id], qty, unit)) };
}

/** An example plan so the app opens in a working state. Replaced by the user's own. */
export function seedPlans(foods: Record<string, Food>): Plans {
  const M = defaultMeals();
  return {
    strict: [
      meal(M[0], foods, [["oats", 80, "g"], ["soymilk", 1, "cup"], ["banana", 1, "pc"], ["walnuts", 20, "g"]]),
      meal(M[1], foods, [["lentils", 300, "g"], ["bread", 2, "pc"], ["sauerkraut", 150, "g"]]),
      meal(M[2], foods, [["apple", 1, "pc"], ["peaprotein", 1, "serving"]]),
      meal(M[3], foods, [["tofu", 200, "g"], ["rice", 200, "g"], ["broccoli", 150, "g"]]),
    ],
    oil: [
      meal(M[0], foods, [["oats", 80, "g"], ["soymilk", 1, "cup"], ["pb", 1, "tbsp"], ["banana", 1, "pc"]]),
      meal(M[1], foods, [["beans", 300, "g"], ["bread", 2, "pc"], ["olive", 1, "tbsp"], ["tomato", 1, "pc"]]),
      meal(M[2], foods, [["hummus", 4, "tbsp"], ["pepper", 1, "pc"], ["peaprotein", 1, "serving"]]),
      meal(M[3], foods, [["tofu", 200, "g"], ["potato", 250, "g"], ["olive", 1, "tbsp"]]),
    ],
    fish: [
      meal(M[0], foods, [["oats", 80, "g"], ["soymilk", 1, "cup"], ["tahini", 1, "tbsp"], ["apple", 1, "pc"]]),
      meal(M[1], foods, [["trout", 1, "pc"], ["potato", 250, "g"], ["olive", 1, "tbsp"], ["cucumber", 1, "pc"]]),
      meal(M[2], foods, [["tuna", 1, "pc"], ["bread", 1, "pc"]]),
      meal(M[3], foods, [["shrimp", 200, "g"], ["pasta", 200, "g"], ["olive", 1, "tbsp"], ["tomato", 1, "pc"]]),
    ],
  };
}

export function defaultProfile(): Profile {
  return {
    name: "",
    kcal: 2200,
    p: 140,
    c: 250,
    f: 70,
    ruleSet: "typikon",
    seafoodOnOil: false,
    overrides: {},
    planIsExample: true,
    lang: getLang(),
  };
}

export const EXAMPLE_PLAN_ID = "example";
export const emptyBible = (): BibleNotes => ({ highlights: {}, folders: [], saved: [] });
const EXAMPLE_NAMES: Record<Lang, string> = { bg: "Примерен план", en: "Example plan" };

export function initialState(): State {
  const foods = seedFoods();
  const example: MealPlan = { id: EXAMPLE_PLAN_ID, name: EXAMPLE_NAMES[getLang()], days: seedPlans(foods), example: true, createdAt: Date.now() };
  return { v: 1, profile: { ...defaultProfile(), activePlan: EXAMPLE_PLAN_ID }, foods, plans: { [EXAMPLE_PLAN_ID]: example }, days: {}, bible: emptyBible() };
}

/**
 * Brings saved data up to date. Before the plan library there was one plan:
 * `plans` held the meals for each day type directly. It becomes the first plan in the library.
 */
export function migrate(s: State): State {
  const legacy = s.plans as unknown as Partial<Plans>;
  let next = s;
  if (legacy && Array.isArray(legacy.strict)) {
    const example = s.profile.planIsExample !== false;
    const plan: MealPlan = {
      id: example ? EXAMPLE_PLAN_ID : "main",
      // runs while the saved data loads, before the app language is set from it
      name: example ? EXAMPLE_NAMES[s.profile.lang ?? getLang()] : (s.profile.lang ?? getLang()) === "en" ? "My plan" : "Моят план",
      days: { strict: legacy.strict ?? [], oil: legacy.oil ?? [], fish: legacy.fish ?? [] },
      example,
      createdAt: Date.now(),
    };
    next = { ...s, plans: { [plan.id]: plan }, profile: { ...s.profile, activePlan: plan.id } };
  }
  if (!next.bible) next = { ...next, bible: emptyBible() };
  if (next.profile.activePlan === undefined) {
    next = { ...next, profile: { ...next.profile, activePlan: Object.keys(next.plans)[0] ?? null } };
  }
  return next;
}

/* ───────── language switch for the built-in names ───────── */

export const MEAL_NAMES: Record<Lang, string[]> = {
  bg: ["Закуска", "Обяд", "Междинно", "Вечеря"],
  en: ["Breakfast", "Lunch", "Snack", "Dinner"],
};
/** Breakfast, lunch, snack, dinner in the current language */
export const defaultMeals = () => MEAL_NAMES[getLang()];

const SEED_NAMES: Record<string, Record<Lang, string>> = Object.fromEntries(ROWS.map(([id, bg, en]) => [id, { bg, en }]));

/** Every name a food answers to in search: its own, plus both languages' names for built-in and database foods */
export function searchNames(f: Food): string[] {
  const n = f.source === "seed" ? SEED_NAMES[f.id] : f.source === "db" ? dbById(f.id)?.names : undefined;
  return n ? [f.name, n.bg, n.en] : [f.name];
}

/**
 * Renames the built-in foods and meal names the person has not changed,
 * so switching language does not leave the example data in the old one.
 */
export function relocalize(s: State, from: Lang, to: Lang): State {
  if (from === to) return s;
  const meal = (name: string) => {
    const i = MEAL_NAMES[from].indexOf(name);
    return i < 0 ? name : MEAL_NAMES[to][i];
  };
  const food = (foodId: string | undefined, name: string) => {
    const n = foodId ? SEED_NAMES[foodId] ?? dbById(foodId)?.names : undefined;
    return n && n[from] === name ? n[to] : name;
  };
  const item = <T extends Item>(it: T): T => {
    const name = food(it.foodId, it.name);
    return name === it.name ? it : { ...it, name };
  };
  const foods: Record<string, Food> = {};
  for (const [id, f] of Object.entries(s.foods)) foods[id] = f.source === "seed" || f.source === "db" ? { ...f, name: food(id, f.name) } : f;
  const days_ = (d: Plans) =>
    Object.fromEntries(Object.entries(d).map(([t, meals]) => [t, meals.map((m) => ({ ...m, name: meal(m.name), items: m.items.map(item) }))])) as Plans;
  const plans: Record<string, MealPlan> = {};
  for (const [id, p] of Object.entries(s.plans))
    plans[id] = { ...p, name: p.example && p.name === EXAMPLE_NAMES[from] ? EXAMPLE_NAMES[to] : p.name, days: days_(p.days) };
  const days = Object.fromEntries(
    Object.entries(s.days).map(([d, day]) => [d, { ...day, entries: day.entries.map((e) => ({ ...item(e), meal: meal(e.meal) })) }]),
  );
  return { ...s, foods, plans, days };
}
