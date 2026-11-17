import type { DayType, Kind, Profile, RuleSet } from "./types";
import { bi, getLang } from "./i18n";

/**
 * Nativity (Christmas) fast, Bulgarian Orthodox Church — Revised Julian calendar.
 * 15 November – 24 December 2026, Christmas on 25 December.
 */
export const FAST_START = "2026-11-15";
export const FAST_END = "2026-12-24";
export const FAST_DAYS = 40;
/** The first week has no fish: oil on most days, strict on Wednesday and Friday */
export const FIRST_WEEK_END = "2026-11-22";

export const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const todayISO = () => iso(new Date());
export const inFast = (s: string) => s >= FAST_START && s <= FAST_END;
export const fastDayNumber = (s: string) =>
  Math.round((parseISO(s).getTime() - parseISO(FAST_START).getTime()) / 86400000) + 1;

/** Feasts inside the fast that lift the rule to fish whatever the weekday */
export const FEASTS: Record<string, string> = bi<Record<string, string>>(
  { "2026-11-21": "Въведение Богородично", "2026-12-06": "Никулден" },
  { "2026-11-21": "Presentation of the Theotokos", "2026-12-06": "St Nicholas" },
);
export const NOTES: Record<string, string> = bi<Record<string, string>>(
  {
    "2026-11-15": "Първа седмица · без риба до 22 ноември",
    "2026-11-30": "Андреевден",
    "2026-12-04": "Варвара",
    "2026-12-20": "Игнажден · предпразнични дни, без риба",
    "2026-12-24": "Бъдни вечер · строг пост до вечерята",
    "2026-12-25": "Рождество Христово",
  },
  {
    "2026-11-15": "First week · no fish until 22 November",
    "2026-11-30": "St Andrew",
    "2026-12-04": "St Barbara",
    "2026-12-20": "St Ignatius · forefeast days, no fish",
    "2026-12-24": "Christmas Eve · strict fast until dinner",
    "2026-12-25": "Nativity of Christ",
  },
);

/** 0 = Monday … 6 = Sunday */
const weekday = (s: string) => (parseISO(s).getDay() + 6) % 7;

export function ruleDay(s: string, rules: RuleSet): DayType {
  if (!inFast(s)) return "free";
  if (s === FAST_END) return "strict";
  const w = weekday(s);
  if (s <= FIRST_WEEK_END) return w === 2 || w === 4 ? "strict" : "oil"; // first week: no fish at all
  if (FEASTS[s]) return "fish";
  if (w === 2 || w === 4) return "strict"; // Wednesday, Friday
  const weekend = w === 5 || w === 6;
  if (s >= "2026-12-20") return "oil"; // forefeast: no fish, even at the weekend
  if (rules === "typikon") {
    if (s <= "2026-12-06") return w === 0 ? "oil" : "fish"; // Tue, Thu, Sat, Sun fish
    return weekend ? "fish" : "oil";
  }
  return weekend ? "fish" : "oil";
}

export function dayType(s: string, profile: Profile): DayType {
  return profile.overrides[s] ?? ruleDay(s, profile.ruleSet);
}

export function allowedKinds(t: DayType, profile: Profile): Kind[] {
  switch (t) {
    case "strict":
      return ["vegan"];
    case "oil":
      return profile.seafoodOnOil ? ["vegan", "oil", "seafood"] : ["vegan", "oil"];
    case "fish":
      return ["vegan", "oil", "seafood", "fish"];
    default:
      return ["vegan", "oil", "seafood", "fish", "animal"];
  }
}

export const DAY_META = bi<Record<DayType, { title: string; short: string; rule: string }>>(
  {
    strict: { title: "Строг ден", short: "Строг", rule: "Само растително, без олио" },
    oil: { title: "Ден с олио", short: "Олио", rule: "Растително, с олио" },
    fish: { title: "Рибен ден", short: "Риба", rule: "Риба, морски дарове и олио" },
    free: { title: "Блажен ден", short: "Блажно", rule: "Без постни ограничения" },
  },
  {
    strict: { title: "Strict day", short: "Strict", rule: "Plant-based only, no oil" },
    oil: { title: "Oil day", short: "Oil", rule: "Plant-based, oil allowed" },
    fish: { title: "Fish day", short: "Fish", rule: "Fish, seafood and oil" },
    free: { title: "Fast-free day", short: "Free", rule: "No fasting rules" },
  },
);

export const KIND_META = bi<Record<Kind, { label: string; short: string }>>(
  {
    vegan: { label: "Растително", short: "Растит." },
    oil: { label: "С олио", short: "Олио" },
    seafood: { label: "Морски дарове", short: "Морско" },
    fish: { label: "Риба", short: "Риба" },
    animal: { label: "Месо, мляко, яйца", short: "Блажно" },
  },
  {
    vegan: { label: "Plant-based", short: "Plant" },
    oil: { label: "With oil", short: "Oil" },
    seafood: { label: "Seafood", short: "Seafood" },
    fish: { label: "Fish", short: "Fish" },
    animal: { label: "Meat, dairy, eggs", short: "Non-fast" },
  },
);

export const MONTHS = bi(
  ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"],
  ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
);
export const WEEKDAYS = bi(
  ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"],
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
);
export const WD_SHORT = bi(["П", "В", "С", "Ч", "П", "С", "Н"], ["M", "T", "W", "T", "F", "S", "S"]);
/** "15 ноември" / "15 November" */
export const dayMonth = (s: string) => {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const isEn = () => getLang() === "en";

export const longDate = (s: string) => {
  const d = parseISO(s);
  const w = WEEKDAYS[weekday(s)];
  return `${w[0].toUpperCase()}${w.slice(1)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const weekStart = (s: string) => addDays(s, -weekday(s));
export { weekday };
