import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DayType, Entry, Food, Item, Kind, PlanType, Target, Unit } from "../lib/types";
import { actions, foodByBarcode, foodByName, getState, mealOrder, dayView, useStore } from "../lib/store";
import { DAY_META, KIND_META, allowedKinds, dayType, longDate } from "../lib/fast";
import { UNIT_META, fmtK, fmtQty, itemFromFood, itemMacros, sum, uid, unitsFor, r0 } from "../lib/nutrition";
import { aiErrorText, aiStatus, estimateFood, parsePlan, readLabel, scanMeal, type MealScan, type ParsedMeal } from "../lib/ai";
import { decodeBarcode, liveCameraLikely, lookupOpenFoodFacts } from "../lib/barcode";
import { CameraInput, LiveScanner } from "./Scanner";
import { Icon, KindDot, MacroLine, NumberInput, Sheet, Summary, toast } from "./ui";
import { getLang, tr } from "../lib/i18n";

export type SheetState =
  | { k: "add"; target: Target; quick?: boolean }
  | { k: "pick"; target: Target }
  | { k: "qty"; target: Target; food: Food }
  | { k: "food"; food?: Partial<Food>; then?: Target }
  | { k: "entry"; date: string; entry: Entry }
  | { k: "planItem"; plan: PlanType; item: Item }
  | { k: "scan"; target: Target; file?: File }
  | { k: "barcode"; target: Target; code?: string; file?: File }
  | { k: "live"; target: Target }
  | { k: "newplan"; plan: PlanType }
  | { k: "daytype"; date: string };

type Open = (s: SheetState | null) => void;
export const SheetCtx = createContext<Open>(() => {});
export const useSheet = () => useContext(SheetCtx);

const KINDS: Kind[] = ["vegan", "oil", "seafood", "fish", "animal"];

function commit(target: Target, items: Item[]) {
  if (target.to === "day") actions.addEntries(target.date, target.meal, items, true);
  else actions.addPlanItems(target.plan, target.mealId, items);
}

function useAI() {
  const [s, setS] = useState<{ text: boolean; images: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    aiStatus().then((v) => live && setS(v));
    return () => {
      live = false;
    };
  }, []);
  return s;
}

function targetMeals(target: Target): string[] {
  const s = getState();
  if (target.to === "day") return mealOrder(s, target.date, dayView(s, target.date).entries);
  return s.plans[target.plan].map((m) => m.name);
}

function MealChips({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  if (target.to !== "day") return null;
  const meals = targetMeals(target);
  return (
    <div className="field">
      <span>{tr("Хранене", "Meal")}</span>
      <div className="unitchips">
        {meals.map((m) => (
          <button key={m} className={`uchip ${target.meal === m ? "on" : ""}`} onClick={() => onChange({ ...target, meal: m })}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function KindWarning({ kind, target }: { kind: Kind; target: Target }) {
  const s = getState();
  if (target.to !== "day") return null;
  const t = dayType(target.date, s.profile);
  if (allowedKinds(t, s.profile).includes(kind)) return null;
  return (
    <div className="note warn">
      {tr(`${KIND_META[kind].label} не е разрешено в ${DAY_META[t].title.toLowerCase()} (${DAY_META[t].rule.toLowerCase()}).`, `${KIND_META[kind].label} isn't allowed on a ${DAY_META[t].title.toLowerCase()} (${DAY_META[t].rule.toLowerCase()}).`)}
    </div>
  );
}

/* ───────── add: choose how ───────── */

/** quick: the + button, which only offers the camera; library and manual live on the meal rows */
export function AddSheet({ target, quick }: { target: Target; quick?: boolean }) {
  const open = useSheet();
  const ai = useAI();
  const where = target.to === "day" ? longDate(target.date) : tr(`план · ${DAY_META[target.plan].title.toLowerCase()}`, `plan · ${DAY_META[target.plan].title.toLowerCase()}`);
  return (
    <Sheet title={tr("Добави храна", "Add food")} onClose={() => open(null)}>
      <div className="small muted" style={{ marginTop: -8 }}>{where}</div>
      <div className="action-grid">
        <MealPhotoAction target={target} className="action hero">
          <span className="ic"><Icon name="camera" /></span>
          <span>
            <b>{tr("Снимай ястие", "Photo of a meal")}</b>
            <small>{ai && !ai.images ? tr("AI не е достъпен тук", "AI isn't available here") : tr("AI разпознава и смята", "AI recognises and counts it")}</small>
          </span>
        </MealPhotoAction>
        <BarcodeAction target={target} className="action">
          <span className="ic"><Icon name="barcode" /></span>
          <span>
            <b>{tr("Баркод", "Barcode")}</b>
            <small>{tr("Насочи камерата към кода", "Point the camera at the code")}</small>
          </span>
        </BarcodeAction>
        {!quick && <>
        <button className="action" onClick={() => open({ k: "pick", target })}>
          <span className="ic"><Icon name="book" /></span>
          <span>
            <b>{tr("Библиотека", "Library")}</b>
            <small>{tr(`${Object.keys(getState().foods).length} запазени храни`, `${Object.keys(getState().foods).length} saved foods`)}</small>
          </span>
        </button>
        <button className="action" onClick={() => open({ k: "food", then: target })}>
          <span className="ic"><Icon name="pen" /></span>
          <span>
            <b>{tr("Ръчно", "Manual")}</b>
            <small>{tr("Нова храна в библиотеката", "New food for your library")}</small>
          </span>
        </button>
        </>}
      </div>
    </Sheet>
  );
}

/** Opens the camera at once; the photo goes straight to the AI meal scan */
export function MealPhotoAction({ target, className, style, children }: { target: Target; className?: string; style?: CSSProperties; children: ReactNode }) {
  const open = useSheet();
  return (
    <CameraInput className={className} style={style} onFile={(file) => open({ k: "scan", target, file })}>
      {children}
    </CameraInput>
  );
}

/** Live scanner where the browser allows it, otherwise the phone camera on the same tap */
export function BarcodeAction({ target, className, style, children }: { target: Target; className?: string; style?: CSSProperties; children: ReactNode }) {
  const open = useSheet();
  if (liveCameraLikely())
    return (
      <button className={className} style={style} onClick={() => open({ k: "live", target })}>
        {children}
      </button>
    );
  return (
    <CameraInput className={className} style={style} onFile={(file) => open({ k: "barcode", target, file })}>
      {children}
    </CameraInput>
  );
}

/* ───────── library picker ───────── */

export function LibraryList({ onPick, query, kindFilter }: { onPick: (f: Food) => void; query: string; kindFilter?: Kind | null }) {
  const { foods } = useStore();
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(foods)
      .filter((f) => (!q || f.name.toLowerCase().includes(q) || f.brand?.toLowerCase().includes(q) || f.barcode === q) && (!kindFilter || f.kind === kindFilter))
      .sort((a, b) => (b.source === "seed" ? 0 : 1) - (a.source === "seed" ? 0 : 1) || a.name.localeCompare(b.name, getLang()));
  }, [foods, query, kindFilter]);
  if (!list.length) return <div className="empty">{tr("Няма храни, които да отговарят.", "No matching foods.")}</div>;
  return (
    <div className="list">
      {list.map((f) => (
        <button key={f.id} className="li" onClick={() => onPick(f)}>
          <KindDot kind={f.kind} />
          <div className="grow">
            <div className="name">{f.name}</div>
            <div className="tiny faint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>{f.brand ? `${f.brand} · ` : ""}{fmtK(f.per100.kcal)} kcal</span>
              <MacroLine m={f.per100} />
              <span>/ 100 {tr("г", "g")}</span>
            </div>
          </div>
          {f.source === "barcode" && <span className="faint"><Icon name="barcode" size={16} /></span>}
          {f.source === "ai" && <span className="faint"><Icon name="sparkle" size={16} /></span>}
        </button>
      ))}
    </div>
  );
}

export function PickSheet({ target }: { target: Target }) {
  const open = useSheet();
  const [q, setQ] = useState("");
  return (
    <Sheet title={tr("Библиотека", "Library")} onClose={() => open(null)}>
      <div className="search">
        <Icon name="search" size={18} />
        <input id="pick-search" className="input" placeholder={tr("Търси храна", "Search foods")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ boxShadow: "none", background: "transparent", margin: "0 -18px" }}>
        <LibraryList query={q} onPick={(food) => open({ k: "qty", target, food })} />
      </div>
      <button className="btn ghost block" onClick={() => open({ k: "food", food: q ? { name: q } : undefined, then: target })}>
        <Icon name="plus" size={18} /> {tr("Нова храна", "New food")}{q ? tr(` „${q}“`, ` “${q}”`) : ""}
      </button>
    </Sheet>
  );
}

/* ───────── amount step ───────── */

function AmountFields({ item, setItem }: { item: Item; setItem: (i: Item) => void }) {
  const units = unitsFor(item);
  return (
    <>
      <div className="field">
        <span>{tr("Количество", "Amount")}</span>
        <NumberInput id="qty" value={item.qty} onChange={(qty) => setItem({ ...item, qty })} suffix={UNIT_META[item.unit].label} />
      </div>
      <div className="field">
        <span>{tr("Мерна единица", "Unit")}</span>
        <div className="unitchips">
          {units.map((u) => (
            <button
              key={u}
              className={`uchip ${item.unit === u ? "on" : ""}`}
              onClick={() => {
                if (u === item.unit) return;
                const toBulk = u === "g" || u === "ml";
                const fromBulk = item.unit === "g" || item.unit === "ml";
                const qty = toBulk && !fromBulk ? r0(itemMacrosGrams(item)) : !toBulk && fromBulk ? 1 : toBulk ? item.qty : 1;
                setItem({ ...item, unit: u, qty });
              }}
              title={UNIT_META[u].long}
            >
              {UNIT_META[u].label}
              {u !== "g" && u !== "ml" && <span style={{ opacity: 0.5, fontWeight: 600 }}> {r0(item.units[u] ?? UNIT_META[u].fallback)}{tr("г", "g")}</span>}
            </button>
          ))}
        </div>
      </div>
      <Summary m={itemMacros(item)} />
    </>
  );
}
const itemMacrosGrams = (it: Item) => it.qty * (it.unit === "g" || it.unit === "ml" ? 1 : it.units[it.unit] ?? UNIT_META[it.unit].fallback);

export function QtySheet({ target: t0, food }: { target: Target; food: Food }) {
  const open = useSheet();
  const [target, setTarget] = useState(t0);
  const [item, setItem] = useState<Item>(() => itemFromFood(food));
  return (
    <Sheet
      title={food.name}
      onClose={() => open(null)}
      foot={
        <>
          <button className="btn ghost" onClick={() => open({ k: "food", food, then: target })}>{tr("Редактирай", "Edit")}</button>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            disabled={!(item.qty > 0)}
            onClick={() => {
              commit(target, [item]);
              toast(tr(`Добавено: ${food.name}`, `Added: ${food.name}`));
              open(null);
            }}
          >
            {tr("Добави", "Add")}
          </button>
        </>
      }
    >
      <div className="small muted" style={{ marginTop: -8, display: "flex", gap: 8, alignItems: "center" }}>
        <KindDot kind={food.kind} /> {KIND_META[food.kind].label}
        {food.brand ? ` · ${food.brand}` : ""}
      </div>
      <KindWarning kind={food.kind} target={target} />
      <AmountFields item={item} setItem={setItem} />
      <MealChips target={target} onChange={setTarget} />
    </Sheet>
  );
}

/* ───────── edit an entry or plan item ───────── */

export function EntrySheet({ date, entry }: { date: string; entry: Entry }) {
  const open = useSheet();
  const [item, setItem] = useState<Entry>(entry);
  const [target, setTarget] = useState<Target>({ to: "day", date, meal: entry.meal });
  return (
    <Sheet
      title={entry.name}
      onClose={() => open(null)}
      foot={
        <>
          <button className="btn danger" onClick={() => { actions.removeEntry(date, entry.id); open(null); }} aria-label={tr("Премахни", "Remove")}>
            <Icon name="trash" size={18} />
          </button>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            onClick={() => {
              actions.updateEntry(date, { ...item, meal: target.to === "day" ? target.meal : item.meal });
              open(null);
            }}
          >
            {tr("Запази", "Save")}
          </button>
        </>
      }
    >
      <div className="small muted" style={{ marginTop: -8, display: "flex", gap: 8, alignItems: "center" }}>
        <KindDot kind={entry.kind} /> {KIND_META[entry.kind].label}
      </div>
      <KindWarning kind={entry.kind} target={target} />
      <AmountFields item={item} setItem={(i) => setItem(i as Entry)} />
      <MealChips target={target} onChange={setTarget} />
      <button className="btn outline block" onClick={() => setItem({ ...item, done: !item.done })}>
        <Icon name="check" size={18} /> {item.done ? tr("Отбележи като неизядено", "Mark as not eaten") : tr("Отбележи като изядено", "Mark as eaten")}
      </button>
    </Sheet>
  );
}

export function PlanItemSheet({ plan, item: i0 }: { plan: PlanType; item: Item }) {
  const open = useSheet();
  const [item, setItem] = useState<Item>(i0);
  return (
    <Sheet
      title={i0.name}
      onClose={() => open(null)}
      foot={
        <>
          <button className="btn danger" onClick={() => { actions.removePlanItem(plan, i0.id); open(null); }} aria-label={tr("Премахни", "Remove")}>
            <Icon name="trash" size={18} />
          </button>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => { actions.updatePlanItem(plan, item); open(null); }}>
            {tr("Запази", "Save")}
          </button>
        </>
      }
    >
      <div className="small muted" style={{ marginTop: -8 }}>{tr("План", "Plan")} · {DAY_META[plan].title.toLowerCase()}</div>
      <AmountFields item={item} setItem={setItem} />
    </Sheet>
  );
}

/* ───────── food editor ───────── */

export function FoodSheet({ food: f0, then }: { food?: Partial<Food>; then?: Target }) {
  const open = useSheet();
  const ai = useAI();
  const existing = !!(f0?.id && getState().foods[f0.id]);
  const [f, setF] = useState<Food>(() => ({
    id: f0?.id ?? uid(),
    name: f0?.name ?? "",
    brand: f0?.brand,
    barcode: f0?.barcode,
    kind: f0?.kind ?? "vegan",
    per100: f0?.per100 ?? { kcal: 0, p: 0, c: 0, f: 0 },
    units: f0?.units ?? {},
    source: f0?.source ?? "manual",
    createdAt: f0?.createdAt ?? Date.now(),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<Food>) => setF((x) => ({ ...x, ...patch }));
  const setM = (k: keyof Food["per100"], v: number) => setF((x) => ({ ...x, per100: { ...x.per100, [k]: v } }));
  const setU = (u: Unit, v: number) => setF((x) => ({ ...x, units: { ...x.units, [u]: v || undefined } }));
  const calc = r0(f.per100.p * 4 + f.per100.c * 4 + f.per100.f * 9);

  async function fill() {
    if (!f.name.trim()) return setErr(tr("Напиши име на храната.", "Type the food's name first."));
    setBusy(true);
    setErr("");
    try {
      const e = await estimateFood(f.name.trim());
      setF((x) => ({ ...x, kind: e.kind, per100: e.per100, units: { ...e.units, ...x.units } }));
    } catch (e) {
      setErr(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const food = { ...f, name: f.name.trim() };
    actions.upsertFood(food);
    toast(existing ? tr("Храната е обновена", "Food updated") : tr("Запазено в библиотеката", "Saved to your library"));
    if (then) open({ k: "qty", target: then, food });
    else open(null);
  }

  return (
    <Sheet
      title={existing ? tr("Редактирай храна", "Edit food") : tr("Нова храна", "New food")}
      onClose={() => open(null)}
      foot={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                actions.deleteFood(f.id);
                toast(tr("Изтрито от библиотеката", "Deleted from your library"));
                open(null);
              }}
            >
              {confirmDel ? tr("Изтрий", "Delete") : <Icon name="trash" size={18} />}
            </button>
          )}
          <button className="btn primary" style={{ flex: 1 }} disabled={!f.name.trim()} onClick={save}>
            {then ? tr("Запази и добави", "Save and add") : tr("Запази", "Save")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{tr("Име", "Name")}</span>
        <input id="food-name" className="input" value={f.name} placeholder={tr("напр. Тофу с гъби", "e.g. Tofu with mushrooms")} onChange={(e) => set({ name: e.target.value })} />
      </label>
      {ai?.text && (
        <button className="btn outline block" onClick={fill} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="sparkle" size={18} />} {tr("Попълни стойностите с AI", "Fill in the values with AI")}
        </button>
      )}
      {err && <div className="note warn">{err}</div>}
      <div className="field">
        <span>{tr("Вид храна (за поста)", "Food type (for the fast)")}</span>
        <div className="unitchips">
          {KINDS.map((k) => (
            <button key={k} className={`uchip ${f.kind === k ? "on" : ""}`} onClick={() => set({ kind: k })}>
              {KIND_META[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>{tr("Хранителни стойности за 100 г", "Nutrition per 100 g")}</span>
        <div className="grid2">
          <label className="field"><span>{tr("Калории", "Calories")}</span><NumberInput id="f-kcal" value={f.per100.kcal} onChange={(v) => setM("kcal", v)} suffix="kcal" /></label>
          <label className="field"><span className="t-p">{tr("Протеин", "Protein")}</span><NumberInput id="f-p" value={f.per100.p} onChange={(v) => setM("p", v)} suffix={tr("г", "g")} /></label>
          <label className="field"><span className="t-c">{tr("Въглехидрати", "Carbs")}</span><NumberInput id="f-c" value={f.per100.c} onChange={(v) => setM("c", v)} suffix={tr("г", "g")} /></label>
          <label className="field"><span className="t-f">{tr("Мазнини", "Fat")}</span><NumberInput id="f-f" value={f.per100.f} onChange={(v) => setM("f", v)} suffix={tr("г", "g")} /></label>
        </div>
        {f.per100.kcal > 0 && Math.abs(calc - f.per100.kcal) > Math.max(25, f.per100.kcal * 0.15) && (
          <div className="tiny faint">{tr(`По макросите излизат около ${calc} kcal.`, `The macros add up to about ${calc} kcal.`)}</div>
        )}
      </div>
      <div className="field">
        <span>{tr("Грамове в една единица (по желание)", "Grams in one unit (optional)")}</span>
        <div className="grid2">
          <label className="field"><span>{tr("1 брой", "1 piece")}</span><NumberInput id="u-pc" value={f.units.pc ?? 0} onChange={(v) => setU("pc", v)} suffix={tr("г", "g")} /></label>
          <label className="field"><span>{tr("1 порция", "1 serving")}</span><NumberInput id="u-serving" value={f.units.serving ?? 0} onChange={(v) => setU("serving", v)} suffix={tr("г", "g")} /></label>
          <label className="field"><span>{tr("1 ч.ч.", "1 cup")}</span><NumberInput id="u-cup" value={f.units.cup ?? 0} onChange={(v) => setU("cup", v)} suffix={tr("г", "g")} /></label>
          <label className="field"><span>{tr("1 с.л.", "1 tbsp")}</span><NumberInput id="u-tbsp" value={f.units.tbsp ?? 0} onChange={(v) => setU("tbsp", v)} suffix={tr("г", "g")} /></label>
        </div>
        <div className="tiny faint">{tr("Празно: чаша 240 г, супена лъжица 15 г, чаена лъжичка 5 г.", "If empty: cup 240 g, tablespoon 15 g, teaspoon 5 g.")}</div>
      </div>
      <div className="grid2">
        <label className="field"><span>{tr("Марка", "Brand")}</span><input id="food-brand" className="input" value={f.brand ?? ""} onChange={(e) => set({ brand: e.target.value || undefined })} /></label>
        <label className="field"><span>{tr("Баркод", "Barcode")}</span><input id="food-barcode" className="input" inputMode="numeric" value={f.barcode ?? ""} onChange={(e) => set({ barcode: e.target.value.trim() || undefined })} /></label>
      </div>
    </Sheet>
  );
}

/* ───────── photo input ───────── */

function PhotoPick({ label, hint, onFile, multiple }: { label: string; hint: string; onFile: (f: File[]) => void; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="drop" onClick={() => ref.current?.click()}>
        <span className="ic"><Icon name="camera" size={26} /></span>
        <b>{label}</b>
        <span className="small">{hint}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFile(files);
        }}
      />
    </>
  );
}

function usePreview(file: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/* ───────── AI meal scan ───────── */

interface EditRow { name: string; grams: number; kind: Kind; per100: Food["per100"]; on: boolean }

export function ScanSheet({ target: t0, file: f0 }: { target: Target; file?: File }) {
  const open = useSheet();
  const ai = useAI();
  const [target, setTarget] = useState(t0);
  const [file, setFile] = useState<File | null>(null);
  const url = usePreview(file);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<MealScan | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => {
    if (f0) run(f0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = getState();
  const dt: DayType = target.to === "day" ? dayType(target.date, s.profile) : target.plan;

  async function run(f: File) {
    setFile(f);
    setErr("");
    setRes(null);
    setBusy(true);
    ctl.current?.abort();
    ctl.current = new AbortController();
    try {
      const r = await scanMeal(f, `${DAY_META[dt].title} — ${DAY_META[dt].rule.toLowerCase()}`, ctl.current.signal);
      setRes(r);
      setRows(r.items.map((i) => ({ ...i, on: true })));
      if (!r.items.length) setErr(r.notes || tr("Не открих храна на снимката.", "No food found in the photo."));
    } catch (e) {
      const t = aiErrorText(e);
      if (t) setErr(t);
    } finally {
      setBusy(false);
    }
  }

  const items: Item[] = rows
    .filter((r) => r.on && r.grams > 0)
    .map((r) => ({ id: uid(), name: r.name, kind: r.kind, per100: r.per100, units: {}, qty: r.grams, unit: "g" as Unit }));
  const total = sum(items.map(itemMacros));

  function addAll() {
    const st = getState();
    const linked = items.map((it) => {
      const known = foodByName(st, it.name);
      if (known) return { ...it, foodId: known.id };
      const food: Food = { id: uid(), name: it.name, kind: it.kind, per100: { ...it.per100 }, units: {}, source: "ai", createdAt: Date.now() };
      actions.upsertFood(food);
      return { ...it, foodId: food.id };
    });
    commit(target, linked);
    toast(tr(`Добавени ${linked.length} съставки`, `Added ${linked.length} ingredients`));
    open(null);
  }

  return (
    <Sheet
      title={tr("Снимай ястие", "Photo of a meal")}
      onClose={() => open(null)}
      foot={
        res && rows.length ? (
          <button className="btn primary block" disabled={!items.length} onClick={addAll}>
            {tr("Добави", "Add")} {fmtK(total.kcal)} kcal
          </button>
        ) : undefined
      }
    >
      {ai && !ai.images ? (
        <div className="note">
          {tr("AI анализът на снимки работи, когато приложението е отворено в Claude (claude.ai или приложението на телефона). Тук можеш да добавиш храната ръчно.", "Photo analysis works when the app is open in Claude (claude.ai or the phone app). Here you can add the food by hand.")}
        </div>
      ) : null}
      {url ? <img className="photo" src={url} alt={tr("Снимка на ястието", "Photo of the meal")} /> : busy ? null : <PhotoPick label={tr("Снимай чинията", "Photograph the plate")} hint={tr("Отгоре, на светло, с цялата чиния в кадър", "From above, in good light, with the whole plate in frame")} onFile={(f) => run(f[0])} />}
      {busy && (
        <div className="thinking">
          <span className="spinner" />
          <div>
            <b>{tr("Анализирам ястието…", "Analysing the meal…")}</b>
            <div className="small muted">{tr("Обикновено отнема 10–30 секунди", "Usually takes 10–30 seconds")}</div>
          </div>
        </div>
      )}
      {err && <div className="note warn">{err}</div>}
      {res && rows.length > 0 && (
        <>
          <div>
            <div className="h2">{res.title}</div>
            {res.notes && <div className="small muted" style={{ marginTop: 4 }}>{res.notes}</div>}
          </div>
          <KindWarningList rows={rows.filter((r) => r.on)} target={target} />
          <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
            {rows.map((r, i) => {
              const m = itemMacros({ per100: r.per100, units: {}, qty: r.grams, unit: "g" });
              return (
                <div key={i} className="row" style={{ gridTemplateColumns: "40px 1fr 92px", opacity: r.on ? 1 : 0.45 }}>
                  <button className={`check sm ${r.on ? "on" : ""}`} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} aria-label={tr(`Включи ${r.name}`, `Include ${r.name}`)}>
                    <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>
                  </button>
                  <div className="row-main">
                    <input
                      className="row-name"
                      style={{ background: "transparent", border: 0, padding: 0, outline: "none", width: "100%" }}
                      value={r.name}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      aria-label={tr("Име на съставката", "Ingredient name")}
                    />
                    <span className="row-sub">
                      <KindDot kind={r.kind} /> {fmtK(m.kcal)} kcal · <MacroLine m={m} />
                    </span>
                  </div>
                  <NumberInput value={r.grams} onChange={(g) => setRows(rows.map((x, j) => (j === i ? { ...x, grams: g } : x)))} suffix={tr("г", "g")} />
                </div>
              );
            })}
          </div>
          <Summary m={total} />
          <MealChips target={target} onChange={setTarget} />
          <CameraInput className="btn ghost block" onFile={(f) => { setRows([]); run(f); }}>
            <Icon name="camera" size={18} /> {tr("Нова снимка", "New photo")}
          </CameraInput>
        </>
      )}
    </Sheet>
  );
}

function KindWarningList({ rows, target }: { rows: { kind: Kind; name: string }[]; target: Target }) {
  const s = getState();
  if (target.to !== "day") return null;
  const t = dayType(target.date, s.profile);
  const allowed = allowedKinds(t, s.profile);
  const bad = rows.filter((r) => !allowed.includes(r.kind));
  if (!bad.length) return null;
  return (
    <div className="note warn">
      {tr(`Не е за ${DAY_META[t].title.toLowerCase()}: ${bad.map((b) => b.name).join(", ")}.`, `Not for a ${DAY_META[t].title.toLowerCase()}: ${bad.map((b) => b.name).join(", ")}.`)}
    </div>
  );
}

/* ───────── barcode ───────── */

export function BarcodeSheet({ target, code: c0, file: f0 }: { target: Target; code?: string; file?: File }) {
  const open = useSheet();
  const ai = useAI();
  const [code, setCode] = useState(c0 ?? "");
  const [stage, setStage] = useState<"scan" | "reading" | "lookup" | "label" | "labelBusy">(f0 ? "reading" : c0 ? "lookup" : "scan");
  useEffect(() => {
    if (f0) fromPhoto(f0);
    else if (c0) lookup(c0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [err, setErr] = useState("");
  const [labelFiles, setLabelFiles] = useState<File[]>([]);

  async function fromPhoto(f: File) {
    setErr("");
    setStage("reading");
    try {
      const c = await decodeBarcode(f);
      if (!c) {
        setStage("scan");
        return setErr(tr("Не намерих баркод. Снимай отблизо, кодът да е рязък и хоризонтален, или го въведи ръчно.", "No barcode found. Shoot closer with the code sharp and level, or type it in."));
      }
      setCode(c);
      await lookup(c);
    } catch (e) {
      console.warn(e);
      setStage("scan");
      setErr(tr("Четецът на баркодове не се зареди. Въведи цифрите ръчно.", "The barcode reader didn't load. Type the digits in."));
    }
  }

  async function lookup(c: string) {
    const clean = c.replace(/\D/g, "");
    if (clean.length < 6) return setErr(tr("Баркодът е твърде кратък.", "That barcode is too short."));
    setErr("");
    const known = foodByBarcode(getState(), clean);
    if (known) {
      toast(tr("Намерено в библиотеката", "Found in your library"));
      return open({ k: "qty", target, food: known });
    }
    setStage("lookup");
    const off = await lookupOpenFoodFacts(clean);
    if (off) {
      toast(tr("Намерено в Open Food Facts", "Found in Open Food Facts"));
      return open({ k: "food", food: off, then: target });
    }
    setStage("label");
  }

  async function readFromLabel(files: File[]) {
    setLabelFiles(files);
    setStage("labelBusy");
    setErr("");
    try {
      const r = await readLabel(files);
      const units: Food["units"] = {};
      if (r.serving) units.serving = r.serving;
      open({
        k: "food",
        then: target,
        food: { name: r.name, brand: r.brand || undefined, barcode: code.replace(/\D/g, "") || undefined, kind: r.kind, per100: r.per100, units, source: "barcode" },
      });
    } catch (e) {
      setStage("label");
      setErr(aiErrorText(e) || tr("Не успях да прочета етикета.", "Couldn't read the label."));
    }
  }

  return (
    <Sheet title={tr("Баркод", "Barcode")} onClose={() => open(null)}>
      {(stage === "scan" || stage === "reading") && (
        <>
          <PhotoPick label={tr("Снимай баркода", "Photograph the barcode")} hint={tr("Отблизо, кодът да заема поне половината кадър", "Close up, with the code filling at least half the frame")} onFile={(f) => fromPhoto(f[0])} />
          {stage === "reading" && (
            <div className="thinking"><span className="spinner" /><b>{tr("Чета баркода…", "Reading the barcode…")}</b></div>
          )}
          <div className="field">
            <span>{tr("Или въведи цифрите", "Or type the digits")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="barcode-manual" className="input" inputMode="numeric" placeholder="3800…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup(code)} />
              <button className="btn primary" onClick={() => lookup(code)} disabled={!code.trim()}>{tr("Търси", "Search")}</button>
            </div>
          </div>
        </>
      )}
      {stage === "lookup" && (
        <div className="thinking"><span className="spinner" /><div><b>{tr(`Търся ${code}…`, `Looking up ${code}…`)}</b><div className="small muted">{tr("Библиотека и Open Food Facts", "Your library and Open Food Facts")}</div></div></div>
      )}
      {(stage === "label" || stage === "labelBusy") && (
        <>
          <div className="note">
            <b style={{ color: "var(--ink)" }}>{tr("Нов продукт", "New product")} · {code.replace(/\D/g, "")}</b>
            <br />
            {tr("Снимай етикета с хранителните стойности (и съставките, ако можеш). Продуктът се запазва с този баркод и следващия път излиза веднага.", "Photograph the nutrition label (and the ingredients if you can). The product is saved with this barcode and comes up instantly next time.")}
          </div>
          {stage === "labelBusy" ? (
            <div className="thinking"><span className="spinner" /><div><b>{tr("Чета етикета…", "Reading the label…")}</b><div className="small muted">{tr(`${labelFiles.length} снимк${labelFiles.length === 1 ? "а" : "и"}`, `${labelFiles.length} photo${labelFiles.length === 1 ? "" : "s"}`)}</div></div></div>
          ) : ai?.images ? (
            <PhotoPick label={tr("Снимай етикета", "Photograph the label")} hint={tr("Таблицата с хранителни стойности, рязко и без отблясъци", "The nutrition table, sharp and without glare")} multiple onFile={readFromLabel} />
          ) : null}
          <button className="btn ghost block" onClick={() => open({ k: "food", food: { barcode: code.replace(/\D/g, ""), source: "barcode" }, then: target })}>
            <Icon name="pen" size={18} /> {tr("Въведи стойностите ръчно", "Enter the values by hand")}
          </button>
        </>
      )}
      {err && <div className="note warn">{err}</div>}
    </Sheet>
  );
}

/* ───────── new plan from text ───────── */

const placeholder = () =>
  tr(
    `Закуска: 80 г овесени ядки, 1 ч.ч. соево мляко, 1 банан
Обяд: 300 г леща, 2 филийки хляб, 1 с.л. зехтин
Междинно: 1 ябълка, 30 г орехи
Вечеря: 200 г тофу, 200 г ориз, броколи`,
    `Breakfast: 80 g rolled oats, 1 cup soy milk, 1 banana
Lunch: 300 g lentils, 2 slices of bread, 1 tbsp olive oil
Snack: 1 apple, 30 g walnuts
Dinner: 200 g tofu, 200 g rice, broccoli`,
  );

export function NewPlanSheet({ plan }: { plan: PlanType }) {
  const open = useSheet();
  const ai = useAI();
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<PlanType[]>([plan]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState<ParsedMeal[] | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  async function run() {
    setBusy(true);
    setErr("");
    ctl.current = new AbortController();
    try {
      const names = Object.values(getState().foods).map((f) => f.name);
      const meals = await parsePlan(text, names, ctl.current.signal);
      if (!meals.length) setErr(tr("Не открих храни в текста. Напиши по едно хранене на ред.", "No foods found in the text. Write one meal per line."));
      setParsed(meals);
    } catch (e) {
      const t = aiErrorText(e);
      if (t) setErr(t);
    } finally {
      setBusy(false);
    }
  }

  function build(): { meals: { id: string; name: string; items: Item[] }[] } {
    const st = getState();
    const meals = (parsed ?? []).map((m) => ({
      id: uid(),
      name: m.name,
      items: m.items.map((it) => {
        let food = foodByName(st, it.name);
        if (!food) {
          const units: Food["units"] = {};
          if (it.gramsPerUnit && it.unit !== "g" && it.unit !== "ml") units[it.unit] = it.gramsPerUnit;
          food = { id: uid(), name: it.name, kind: it.kind, per100: it.per100, units, source: "ai", createdAt: Date.now() };
          actions.upsertFood(food);
        } else if (it.gramsPerUnit && it.unit !== "g" && it.unit !== "ml" && !food.units[it.unit]) {
          food = { ...food, units: { ...food.units, [it.unit]: it.gramsPerUnit } };
          actions.upsertFood(food);
        }
        return itemFromFood(food, it.qty, it.unit);
      }),
    }));
    return { meals };
  }

  function save() {
    const { meals } = build();
    targets.forEach((t) => actions.setPlanMeals(t, meals.map((m) => ({ ...m, id: uid(), items: m.items.map((i) => ({ ...i, id: uid() })) }))));
    actions.updateProfile({ planIsExample: false });
    toast(tr("Планът е запазен", "Plan saved"));
    open(null);
  }

  const preview = (parsed ?? []).map((m) => ({
    name: m.name,
    items: m.items,
    total: sum(m.items.map((it) => itemMacros({ per100: it.per100, qty: it.qty, unit: it.unit, units: it.gramsPerUnit ? { [it.unit]: it.gramsPerUnit } : {} }))),
  }));
  const grand = sum(preview.map((p) => p.total));

  return (
    <Sheet
      title={tr("Нов план", "New plan")}
      onClose={() => open(null)}
      foot={
        parsed && parsed.length ? (
          <>
            <button className="btn ghost" onClick={() => setParsed(null)}>{tr("Назад", "Back")}</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!targets.length} onClick={save}>{tr("Запази плана", "Save plan")}</button>
          </>
        ) : (
          <button className="btn primary block" disabled={!text.trim() || busy || !ai?.text} onClick={run}>
            {busy ? <span className="spinner" /> : <Icon name="sparkle" size={18} />} {tr("Разчети плана", "Read my plan")}
          </button>
        )
      }
    >
      <div className="field">
        <span>{tr("За кои дни", "For which days")}</span>
        <div className="seg">
          {(["strict", "oil", "fish"] as PlanType[]).map((t) => (
            <button key={t} className={targets.includes(t) ? "on" : ""} onClick={() => setTargets(targets.includes(t) ? targets.filter((x) => x !== t) : [...targets, t])}>
              <span className={`dot ${t}`} /> {DAY_META[t].short}
            </button>
          ))}
        </div>
      </div>
      {!parsed || !parsed.length ? (
        <>
          <label className="field">
            <span>{tr("Напиши или постави плана си", "Write or paste your plan")}</span>
            <textarea id="plan-text" className="input" placeholder={placeholder()} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {ai && !ai.text && (
            <div className="note">{tr("Разчитането на текст работи, когато приложението е отворено в Claude. Тук можеш да редактираш плана ръчно от екрана „План“.", "Reading the text works when the app is open in Claude. Here you can edit the plan by hand on the Plan screen.")}</div>
          )}
          <div className="tiny faint">{tr("AI разделя плана по хранения, свързва продуктите с библиотеката и добавя новите в нея.", "AI splits the plan into meals, links foods to your library and adds the new ones to it.")}</div>
        </>
      ) : (
        <>
          <Summary m={grand} />
          {preview.map((m, i) => (
            <div key={i} className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
              <div className="meal-head"><span className="h2">{m.name}</span><span className="meal-kcal">{fmtK(m.total.kcal)} kcal</span></div>
              {m.items.map((it, j) => (
                <div key={j} className="li" style={{ padding: "10px 18px", minHeight: 0 }}>
                  <KindDot kind={it.kind} />
                  <div className="grow name">{it.name}</div>
                  <span className="small muted">{fmtQty(it.qty)} {UNIT_META[it.unit].label}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {err && <div className="note warn">{err}</div>}
    </Sheet>
  );
}

/* ───────── change the type of a day ───────── */

export function DayTypeSheet({ date }: { date: string }) {
  const open = useSheet();
  const s = useStore();
  const cur = dayType(date, s.profile);
  const overridden = !!s.profile.overrides[date];
  return (
    <Sheet title={tr("Вид на деня", "Day type")} onClose={() => open(null)}>
      <div className="small muted" style={{ marginTop: -8 }}>{longDate(date)}</div>
      <div className="typepick">
        {(["strict", "oil", "fish", "free"] as DayType[]).map((t) => (
          <button
            key={t}
            className={cur === t ? "on" : ""}
            onClick={() => {
              actions.setOverride(date, t);
              open(null);
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <span className={`dot ${t}`} style={{ width: 8, height: 8, borderRadius: "50%" }} /> {DAY_META[t].title}
            </span>
            <span className="tiny muted">{DAY_META[t].rule}</span>
          </button>
        ))}
      </div>
      {overridden && (
        <button className="btn ghost block" onClick={() => { actions.setOverride(date, null); open(null); }}>
          {tr("Върни по календара", "Back to the calendar rule")}
        </button>
      )}
      {s.days[date] && (
        <button className="btn outline block" onClick={() => { actions.resetDay(date); toast(tr("Денят е зареден от плана", "Day reloaded from the plan")); open(null); }}>
          <Icon name="refresh" size={18} /> {tr("Зареди храните от плана наново", "Reload the foods from the plan")}
        </button>
      )}
    </Sheet>
  );
}

function LiveSheet({ target }: { target: Target }) {
  const open = useSheet();
  return (
    <LiveScanner
      onClose={() => open(null)}
      onCode={(code) => open({ k: "barcode", target, code })}
      onManual={() => open({ k: "barcode", target })}
      onPhoto={(file) => open({ k: "barcode", target, file })}
    />
  );
}

export function SheetHost({ sheet }: { sheet: SheetState | null }) {
  if (!sheet) return null;
  switch (sheet.k) {
    case "add": return <AddSheet target={sheet.target} quick={sheet.quick} />;
    case "pick": return <PickSheet target={sheet.target} />;
    case "qty": return <QtySheet key={sheet.food.id} target={sheet.target} food={sheet.food} />;
    case "food": return <FoodSheet key={sheet.food?.id ?? "new"} food={sheet.food} then={sheet.then} />;
    case "entry": return <EntrySheet date={sheet.date} entry={sheet.entry} />;
    case "planItem": return <PlanItemSheet plan={sheet.plan} item={sheet.item} />;
    case "scan": return <ScanSheet target={sheet.target} file={sheet.file} />;
    case "barcode": return <BarcodeSheet target={sheet.target} code={sheet.code} file={sheet.file} />;
    case "live": return <LiveSheet target={sheet.target} />;
    case "newplan": return <NewPlanSheet plan={sheet.plan} />;
    case "daytype": return <DayTypeSheet date={sheet.date} />;
  }
}
