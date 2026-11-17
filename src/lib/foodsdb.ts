// Built-in database of ~170 basic foods (USDA FoodData Central, SR Legacy, public domain).
// Rebuild with scripts/build-foods.mjs; names are Bulgarian and English.
import raw from "./foods-db.json";
import type { Food, Kind, Unit } from "./types";
import { getLang, type Lang } from "./i18n";

type Row = [id: string, bg: string, en: string, kind: Kind, kcal: number, p: number, c: number, f: number, units: Partial<Record<Unit, number>>, fdc: number];
const ROWS = raw as unknown as Row[];

export interface DbFood {
  id: string;
  names: Record<Lang, string>;
  kind: Kind;
  per100: { kcal: number; p: number; c: number; f: number };
  units: Partial<Record<Unit, number>>;
}

export const DB: DbFood[] = ROWS.map(([id, bg, en, kind, kcal, p, c, f, units]) => ({ id: "db:" + id, names: { bg, en }, kind, per100: { kcal, p, c, f }, units }));
const byId = new Map(DB.map((d) => [d.id, d]));

/** Lower-case, no accents/punctuation, ё→е: "Тофу, твърдо" → "тофу твърдо" */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const index = DB.map((d) => ({ d, bg: norm(d.names.bg), en: norm(d.names.en) }));
const byName = new Map<string, DbFood>();
for (const x of index) {
  byName.set(x.bg, x.d);
  byName.set(x.en, x.d);
}

export const dbById = (id: string) => byId.get(id);
/** Exact (normalised) name in either language */
export const dbByName = (name: string) => byName.get(norm(name));
export const dbName = (d: DbFood) => d.names[getLang()];

/** Every word of the query must start a word in the name (either language); earlier matches rank first */
export function searchDb(query: string, limit = 30): DbFood[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored: { d: DbFood; score: number }[] = [];
  for (const x of index) {
    let best = -1;
    for (const name of [x.bg, x.en]) {
      const parts = name.split(" ");
      if (!words.every((w) => parts.some((p) => p.startsWith(w)))) continue;
      const score = (name.startsWith(q) ? 0 : 10) + name.length / 100;
      if (best < 0 || score < best) best = score;
    }
    if (best >= 0) scored.push({ d: x.d, score: best });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.d);
}

/** A library food made from a database entry (same id, so it is saved only once) */
export function dbToFood(d: DbFood): Food {
  return { id: d.id, name: dbName(d), kind: d.kind, per100: { ...d.per100 }, units: { ...d.units }, source: "db", createdAt: Date.now() };
}
