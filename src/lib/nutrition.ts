import type { Food, Item, Macros, Unit } from "./types";
import { bi, getLang, locale } from "./i18n";

export const UNIT_META = bi<Record<Unit, { label: string; long: string; fallback: number }>>(
  {
    g: { label: "г", long: "грама", fallback: 1 },
    ml: { label: "мл", long: "милилитра", fallback: 1 },
    cup: { label: "ч.ч.", long: "чаена чаша (240 мл)", fallback: 240 },
    tbsp: { label: "с.л.", long: "супена лъжица (15 мл)", fallback: 15 },
    tsp: { label: "ч.л.", long: "чаена лъжичка (5 мл)", fallback: 5 },
    pc: { label: "бр.", long: "брой", fallback: 100 },
    serving: { label: "порция", long: "порция", fallback: 100 },
  },
  {
    g: { label: "g", long: "grams", fallback: 1 },
    ml: { label: "ml", long: "millilitres", fallback: 1 },
    cup: { label: "cup", long: "cup (240 ml)", fallback: 240 },
    tbsp: { label: "tbsp", long: "tablespoon (15 ml)", fallback: 15 },
    tsp: { label: "tsp", long: "teaspoon (5 ml)", fallback: 5 },
    pc: { label: "pc", long: "piece", fallback: 100 },
    serving: { label: "serving", long: "serving", fallback: 100 },
  },
);
export const UNITS: Unit[] = ["g", "ml", "cup", "tbsp", "tsp", "pc", "serving"];

export const gramsPer = (units: Item["units"], unit: Unit) =>
  unit === "g" || unit === "ml" ? 1 : units[unit] ?? UNIT_META[unit].fallback;

export const itemGrams = (it: Pick<Item, "units" | "qty" | "unit">) => it.qty * gramsPer(it.units, it.unit);

export function itemMacros(it: Pick<Item, "units" | "qty" | "unit" | "per100">): Macros {
  const k = itemGrams(it) / 100;
  return { kcal: it.per100.kcal * k, p: it.per100.p * k, c: it.per100.c * k, f: it.per100.f * k };
}

export const zero = (): Macros => ({ kcal: 0, p: 0, c: 0, f: 0 });
export function sum(list: Macros[]): Macros {
  return list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), zero());
}

export const r0 = (n: number) => Math.round(n);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : getLang() === "en" ? String(r1(n)) : String(r1(n)).replace(".", ","));
export const fmtK = (n: number) => r0(n).toLocaleString(locale()).replace(/ /g, " ");

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function itemFromFood(food: Food, qty?: number, unit?: Unit): Item {
  const u: Unit = unit ?? (food.units.pc ? "pc" : food.units.serving ? "serving" : "g");
  return {
    id: uid(),
    foodId: food.id,
    name: food.name,
    kind: food.kind,
    per100: { ...food.per100 },
    units: { ...food.units },
    qty: qty ?? (u === "g" || u === "ml" ? 100 : 1),
    unit: u,
  };
}

export const unitsFor = (food: Pick<Food, "units">): Unit[] =>
  UNITS.filter((u) => u === "g" || u === "ml" || u === "cup" || u === "tbsp" || u === "tsp" || food.units[u] != null);
