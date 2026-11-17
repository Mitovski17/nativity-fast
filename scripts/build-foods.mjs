// Builds src/lib/foods-db.json from the USDA SR Legacy CSV download and scripts/foods-spec.mjs.
// Usage: node scripts/build-foods.mjs <folder with food.csv, food_nutrient.csv, food_portion.csv>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC } from "./foods-spec.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("Pass the unzipped SR Legacy CSV folder");

/** Minimal CSV reader for USDA's quoted files */
function* rows(file) {
  const text = readFileSync(join(dir, file), "utf8");
  let i = 0;
  const n = text.length;
  let header = null;
  while (i < n) {
    const row = [];
    for (;;) {
      let v = "";
      if (text[i] === '"') {
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          v += text.slice(i, q);
          i = q + 1;
          if (text[i] === '"') { v += '"'; i++; } else break;
        }
      } else {
        while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") v += text[i++];
      }
      row.push(v);
      if (text[i] === ",") { i++; continue; }
      while (text[i] === "\r" || text[i] === "\n") i++;
      break;
    }
    if (!header) header = row;
    else yield Object.fromEntries(header.map((h, k) => [h, row[k]]));
  }
}

const byDesc = new Map();
for (const r of rows("food.csv")) byDesc.set(r.description.toLowerCase(), r.fdc_id);

const wanted = new Map(); // fdc_id -> spec index
const missing = [];
SPEC.forEach((s, k) => {
  const id = byDesc.get(s[4].toLowerCase());
  if (id) wanted.set(id, k);
  else missing.push(s[4]);
});
if (missing.length) {
  console.error("Not found in USDA data:\n  " + missing.join("\n  "));
  process.exit(1);
}

const NUTRIENT = { 1008: "kcal", 1003: "p", 1005: "c", 1004: "f" };
const vals = new Map();
for (const r of rows("food_nutrient.csv")) {
  const key = NUTRIENT[r.nutrient_id];
  if (!key || !wanted.has(r.fdc_id)) continue;
  const v = vals.get(r.fdc_id) ?? {};
  v[key] = Number(r.amount);
  vals.set(r.fdc_id, v);
}

// Typical cup and tablespoon weights from USDA portions
const units = new Map();
for (const r of rows("food_portion.csv")) {
  if (!wanted.has(r.fdc_id) || Number(r.amount) !== 1) continue;
  const m = r.modifier.toLowerCase();
  const u = units.get(r.fdc_id) ?? {};
  if (!u.cup && /^cup\b/.test(m)) u.cup = Number(r.gram_weight);
  if (!u.tbsp && /^tbsp\b/.test(m)) u.tbsp = Number(r.gram_weight);
  units.set(r.fdc_id, u);
}

const r1 = (x) => Math.round(x * 10) / 10;
const out = [];
for (const [fdc, k] of wanted) {
  const [id, bg, en, kind, , pc] = SPEC[k];
  const v = vals.get(fdc) ?? {};
  if (v.kcal == null) throw new Error("No energy value for " + en);
  const u = { ...(units.get(fdc) ?? {}) };
  if (pc) u.pc = pc;
  out.push([id, bg, en, kind, Math.round(v.kcal), r1(v.p ?? 0), r1(v.c ?? 0), r1(v.f ?? 0), u, Number(fdc)]);
}
out.sort((a, b) => SPEC.findIndex((s) => s[0] === a[0]) - SPEC.findIndex((s) => s[0] === b[0]));
writeFileSync(new URL("../src/lib/foods-db.json", import.meta.url), JSON.stringify(out));
console.log(`${out.length} foods written`);
for (const f of out) console.log(f[2].padEnd(30), String(f[4]).padStart(4), "kcal", f[5], f[6], f[7], JSON.stringify(f[8]));
