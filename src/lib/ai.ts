import type { Kind, Macros, Unit } from "./types";
import { getLang, tr } from "./i18n";
import { IS_ARTIFACT } from "./env";

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json<T = unknown>(input: string, opts?: Record<string, unknown>): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>;
};

export type JsonOpts = { images?: Blob[]; signal?: AbortSignal; cache?: boolean; modelTier?: "quick" };
/** Asks Claude for a JSON answer: through the artifact's sample capability, or the app's server function */
export interface AI {
  images: boolean;
  json<T = unknown>(prompt: string, opts?: JsonOpts): Promise<T>;
}

async function artifactAI(): Promise<AI | null> {
  const c = (window as unknown as { claude?: { use(n: string): Promise<any> } }).claude;
  const s: SampleFn | null = c?.use ? await c.use("sample").catch(() => null) : null;
  if (!s) return null;
  const lim = await s.limits().catch(() => null);
  return { images: !!lim?.images, json: (p, o) => s.json(p, o as Record<string, unknown>) };
}

let aiPromise: Promise<AI | null> | null = null;
export function getAI(): Promise<AI | null> {
  if (!aiPromise) aiPromise = IS_ARTIFACT ? artifactAI() : import("./cloud").then((m) => m.webAI());
  return aiPromise;
}

export async function aiStatus(): Promise<{ text: boolean; images: boolean }> {
  const a = await getAI();
  return a ? { text: true, images: a.images } : { text: false, images: false };
}

export function aiErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case "not_granted":
      return tr("AI е изключен за тази страница. Разреши го от менюто Permissions на артефакта.", "AI is turned off for this page. Allow it from the artifact's Permissions menu.");
    case "rate_limited":
      return tr("Твърде много заявки. Опитай пак след минута.", "Too many requests. Try again in a minute.");
    case "image_rejected":
      return tr("Снимката не става. Опитай с друга, по-ясна снимка.", "That photo can't be used. Try a clearer one.");
    case "images_unavailable":
      return tr("Тук не може да се изпращат снимки към AI.", "Photos can't be sent to AI here.");
    case "invalid_json":
      return tr("AI отговори в неочакван вид. Опитай пак.", "AI answered in an unexpected format. Try again.");
    case "refused":
      return tr("AI отказа тази заявка. Опитай с друга снимка или текст.", "AI declined this request. Try another photo or text.");
    case "daily_limit":
      return tr("Използва всички 40 AI анализа за днес. Утре можеш пак.", "You've used all 40 AI scans for today. More tomorrow.");
    case "not_configured":
      return tr("AI още не е настроен на сървъра.", "AI isn't set up on the server yet.");
    case "not_signed_in":
      return tr("Влез отново в профила си.", "Please sign in again.");
    case "cancelled":
      return "";
    default:
      return tr("AI не отговори. Провери връзката и опитай пак.", "AI didn't respond. Check your connection and try again.");
  }
}

const KINDS = `"kind" is one of: "vegan" (plant-based, no oil or fat added), "oil" (plant-based but with oil or vegetable fat), "seafood" (invertebrate seafood: shrimp, mussels, squid, octopus), "fish" (fish), "animal" (meat, milk, cheese, butter, eggs). Honey and sugar are "vegan".`;

/** Language the person reads the app in; every name and note the AI writes uses it */
const outLang = () => (getLang() === "en" ? "English" : "Bulgarian");

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const kindOf = (v: unknown): Kind => (["vegan", "oil", "seafood", "fish", "animal"].includes(String(v)) ? (String(v) as Kind) : "vegan");

/* ───────── meal photo ───────── */

export interface ScannedItem {
  name: string;
  grams: number;
  kind: Kind;
  per100: Macros;
}
export interface MealScan {
  title: string;
  notes: string;
  items: ScannedItem[];
}

export async function scanMeal(image: Blob, dayRule: string, signal?: AbortSignal): Promise<MealScan> {
  const s = await getAI();
  if (!s) throw { code: "unavailable" };
  const prompt = `You are a sports dietitian. The photo shows food or a dish. Identify every separate ingredient (including oil, sauces and bread if they are visible or typical for the dish), estimate its weight from the size of the plate and cutlery, and give its nutrition.
Context: the person is keeping the Orthodox Nativity fast. Today: ${dayRule}.
${KINDS}
Write "title", every "name" and "notes" in ${outLang()}.
Reply with JSON only, in this shape:
{"title": "short name of the dish", "items": [{"name": "ingredient name", "grams": 150, "kcal": 210, "protein": 12.5, "carbs": 20, "fat": 8, "kind": "oil"}], "notes": "one short sentence: how confident the estimate is and whether the dish fits today's fasting rule"}
kcal, protein, carbs and fat are for the stated weight of the ingredient, not per 100 g. If there is no food in the photo, return "items": [] and explain in "notes".`;
  const res = await s.json<{ title?: string; notes?: string; items?: Record<string, unknown>[] }>(prompt, {
    images: [image],
    signal,
    cache: false,
  });
  const items: ScannedItem[] = (res.items ?? [])
    .map((it) => {
      const grams = Math.max(1, num(it.grams));
      const k = 100 / grams;
      return {
        name: String(it.name ?? tr("Съставка", "Ingredient")),
        grams: Math.round(grams),
        kind: kindOf(it.kind),
        per100: { kcal: num(it.kcal) * k, p: num(it.protein) * k, c: num(it.carbs) * k, f: num(it.fat) * k },
      };
    })
    .filter((it) => it.name);
  return { title: String(res.title ?? tr("Ястие", "Meal")), notes: String(res.notes ?? ""), items };
}

/* ───────── nutrition label ───────── */

export interface LabelRead {
  name: string;
  brand: string;
  kind: Kind;
  per100: Macros;
  serving?: number;
  liquid: boolean;
}

export async function readLabel(images: Blob[], signal?: AbortSignal): Promise<LabelRead> {
  const s = await getAI();
  if (!s) throw { code: "unavailable" };
  const prompt = `The photos show food packaging: a nutrition label and/or an ingredient list. Read them.
${KINDS} Decide "kind" from the ingredient list (vegetable fats and oil = "oil").
Write "name" in ${outLang()}; keep "brand" as printed.
Reply with JSON only:
{"name": "product name", "brand": "brand or empty", "kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "servingGrams": null, "liquid": false, "kind": "vegan"}
Values are per 100 g (or per 100 ml for a drink, then "liquid": true). If the label only gives values per serving, convert them to 100 g. "servingGrams" is the size of one serving, if stated.`;
  const r = await s.json<Record<string, unknown>>(prompt, { images, signal, cache: false });
  return {
    name: String(r.name ?? "").trim() || tr("Продукт", "Product"),
    brand: String(r.brand ?? "").trim(),
    kind: kindOf(r.kind),
    per100: { kcal: num(r.kcal), p: num(r.protein), c: num(r.carbs), f: num(r.fat) },
    serving: r.servingGrams ? num(r.servingGrams) || undefined : undefined,
    liquid: !!r.liquid,
  };
}

/* ───────── estimate a typed food ───────── */

export interface Estimate {
  kind: Kind;
  per100: Macros;
  units: Partial<Record<Unit, number>>;
}

export async function estimateFood(name: string): Promise<Estimate> {
  const s = await getAI();
  if (!s) throw { code: "unavailable" };
  const prompt = `Give the typical nutrition per 100 g of the food: "${name}" (if it is a dish, assume a standard home recipe; the name may be in Bulgarian or English).
${KINDS}
Reply with JSON only:
{"kcal": 0, "protein": 0, "carbs": 0, "fat": 0, "kind": "vegan", "pieceGrams": null, "cupGrams": null}
"pieceGrams" is the weight of 1 piece if the food is counted in pieces; "cupGrams" is the weight of 1 cup (240 ml) where that makes sense.`;
  const r = await s.json<Record<string, unknown>>(prompt, { modelTier: "quick" });
  const units: Partial<Record<Unit, number>> = {};
  if (num(r.pieceGrams)) units.pc = num(r.pieceGrams);
  if (num(r.cupGrams)) units.cup = num(r.cupGrams);
  return { kind: kindOf(r.kind), per100: { kcal: num(r.kcal), p: num(r.protein), c: num(r.carbs), f: num(r.fat) }, units };
}

/* ───────── parse a written meal plan ───────── */

export interface ParsedItem {
  name: string;
  qty: number;
  unit: Unit;
  gramsPerUnit?: number;
  kind: Kind;
  per100: Macros;
}
export interface ParsedMeal {
  name: string;
  items: ParsedItem[];
}

const UNIT_SET: Unit[] = ["g", "ml", "cup", "tbsp", "tsp", "pc", "serving"];

export async function parsePlan(text: string, libraryNames: string[], signal?: AbortSignal): Promise<ParsedMeal[]> {
  const s = await getAI();
  if (!s) throw { code: "unavailable" };
  const en = getLang() === "en";
  const prompt = `Turn this meal plan into structured data.

PLAN:
"""
${text.slice(0, 8000)}
"""

Foods already in the person's library (if a food in the plan matches one, use exactly that name):
${libraryNames.slice(0, 450).join("; ")}

Rules:
- Split it into meals using the names from the plan (for example ${en ? '"Breakfast", "Lunch", "Snack", "Dinner"' : '"Закуска", "Обяд", "Междинно", "Вечеря"'}).
- Write meal and food names in ${outLang()}, unless a library name matches.
- "unit" is one of: "g", "ml", "cup" (240 ml), "tbsp" (tablespoon), "tsp" (teaspoon), "pc" (piece), "serving".
- "gramsPerUnit" is the weight in grams of 1 unit for pc, serving, cup, tbsp, tsp; null for g and ml.
- The nutrition values are typical values per 100 g of the food.
- ${KINDS}
Reply with JSON only:
{"meals": [{"name": "${en ? "Breakfast" : "Закуска"}", "items": [{"name": "${en ? "Rolled oats" : "Овесени ядки"}", "qty": 80, "unit": "g", "gramsPerUnit": null, "kcal": 379, "protein": 13.2, "carbs": 67.7, "fat": 6.5, "kind": "vegan"}]}]}`;
  const r = await s.json<PlanReply>(prompt, { signal, cache: false });
  return readMeals(r);
}

type PlanReply = { meals?: { name?: string; items?: Record<string, unknown>[] }[] };
function readMeals(r: PlanReply): ParsedMeal[] {
  return (r.meals ?? [])
    .map((m) => ({
      name: String(m.name ?? tr("Хранене", "Meal")),
      items: (m.items ?? []).map((it) => {
        const unit = UNIT_SET.includes(it.unit as Unit) ? (it.unit as Unit) : "g";
        return {
          name: String(it.name ?? tr("Продукт", "Product")),
          qty: num(it.qty) || 1,
          unit,
          gramsPerUnit: num(it.gramsPerUnit) || undefined,
          kind: kindOf(it.kind),
          per100: { kcal: num(it.kcal), p: num(it.protein), c: num(it.carbs), f: num(it.fat) },
        };
      }),
    }))
    .filter((m) => m.items.length);
}

/* ───────── generate a plan for one kind of fasting day ───────── */

export interface PlanGoal {
  kcal: number;
  p: number;
  c: number;
  f: number;
  meals: number;
  prefs: string;
}

const DAY_RULES: Record<"strict" | "oil" | "fish", string> = {
  strict: `a STRICT fasting day: only plant foods ("vegan" kind) and no oil or fat added at all (no olive/sunflower oil, no hummus, no olives, no fried food). Nuts, seeds, nut butters, tahini and avocado are allowed. No fish, seafood, meat, dairy or eggs.`,
  oil: `an OIL day: plant foods ("vegan" or "oil" kind), cooking oil and olive oil are allowed. No fish, no seafood, no meat, dairy or eggs.`,
  fish: `a FISH day: plant foods, oil, fish ("fish") and invertebrate seafood ("seafood") are allowed. No meat, dairy or eggs.`,
};

/**
 * Asks Claude for a day of meals that fits the Orthodox Nativity fast rule for that day type
 * and the person's calorie and macro targets. Same reply shape as parsePlan.
 */
export async function generatePlanDay(type: "strict" | "oil" | "fish", goal: PlanGoal, foodNames: string[], signal?: AbortSignal): Promise<ParsedMeal[]> {
  const s = await getAI();
  if (!s) throw { code: "unavailable" };
  const en = getLang() === "en";
  const mealNames = (en ? ["Breakfast", "Lunch", "Snack", "Dinner", "Snack 2", "Supper"] : ["Закуска", "Обяд", "Междинно", "Вечеря", "Междинно 2", "Късна вечеря"]).slice(0, Math.max(2, Math.min(6, goal.meals)));
  const prompt = `You are a sports dietitian who plans meals for people keeping the Orthodox Christmas (Nativity) fast in Bulgaria.
Plan ONE day of eating for ${DAY_RULES[type]}

Targets for the whole day (stay within about 5%): ${Math.round(goal.kcal)} kcal, protein ${Math.round(goal.p)} g, carbohydrate ${Math.round(goal.c)} g, fat ${Math.round(goal.f)} g.
Meals: ${goal.meals}, named: ${mealNames.map((m) => `"${m}"`).join(", ")}.
${goal.prefs.trim() ? `The person's preferences and notes (follow them where the fasting rule allows):\n"""\n${goal.prefs.trim().slice(0, 1500)}\n"""\n` : ""}
Use simple foods that are easy to buy in Bulgaria. Prefer foods from this list and use exactly these names when you do:
${foodNames.slice(0, 450).join("; ")}

Rules:
- Write meal and food names in ${outLang()}.
- Give realistic portions. "unit" is one of: "g", "ml", "cup" (240 ml), "tbsp", "tsp", "pc" (piece), "serving"; prefer "g" for most foods.
- "gramsPerUnit" is the weight in grams of 1 unit for pc, serving, cup, tbsp, tsp; null for g and ml.
- kcal, protein, carbs and fat are typical values per 100 g of the food (not for the portion).
- ${KINDS}
- Check the day total against the targets before answering and adjust the portions.
Reply with JSON only:
{"meals": [{"name": "${mealNames[0]}", "items": [{"name": "${en ? "Rolled oats" : "Овесени ядки"}", "qty": 80, "unit": "g", "gramsPerUnit": null, "kcal": 379, "protein": 13.2, "carbs": 67.7, "fat": 6.5, "kind": "vegan"}]}]}`;
  const r = await s.json<PlanReply>(prompt, { signal, cache: false });
  return readMeals(r);
}
