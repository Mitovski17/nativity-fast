export type Kind = "vegan" | "oil" | "seafood" | "fish" | "animal";
export type Unit = "g" | "ml" | "cup" | "tbsp" | "tsp" | "pc" | "serving";
export type DayType = "strict" | "oil" | "fish" | "free";
export type PlanType = Exclude<DayType, "free">;
export type RuleSet = "typikon" | "weekend";
export type Source = "seed" | "manual" | "barcode" | "ai";

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  kind: Kind;
  per100: Macros;
  /** grams (or ml) in one of each unit; g and ml are always 1 */
  units: Partial<Record<Unit, number>>;
  source: Source;
  createdAt: number;
}

/** A food amount, self-contained so logs survive library edits */
export interface Item {
  id: string;
  foodId?: string;
  name: string;
  kind: Kind;
  per100: Macros;
  units: Partial<Record<Unit, number>>;
  qty: number;
  unit: Unit;
}

export interface Entry extends Item {
  meal: string;
  done: boolean;
}

export interface Meal {
  id: string;
  name: string;
  items: Item[];
}

export type Plans = Record<PlanType, Meal[]>;

export interface Day {
  date: string;
  entries: Entry[];
}

export interface Profile {
  name: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  ruleSet: RuleSet;
  seafoodOnOil: boolean;
  overrides: Record<string, DayType>;
  planIsExample: boolean;
  /** UI language; missing on profiles made before the English version */
  lang?: "bg" | "en";
}

export interface State {
  v: 1;
  profile: Profile;
  foods: Record<string, Food>;
  plans: Plans;
  days: Record<string, Day>;
}

export type Target =
  | { to: "day"; date: string; meal: string }
  | { to: "plan"; plan: PlanType; mealId: string };
