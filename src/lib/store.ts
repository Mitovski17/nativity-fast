import { useSyncExternalStore } from "react";
import type { Day, DayType, Entry, Food, Item, Meal, PlanType, Plans, Profile, State } from "./types";
import { defaultMeals, initialState, relocalize } from "./seed";
import { detectLang, getLang, setLang, type Lang } from "./i18n";
import { dayType } from "./fast";
import { uid } from "./nutrition";
import { IS_ARTIFACT } from "./env";

const BASE_KEY = "koledni-posti:v1";
const LANG_KEY = "koledni-posti:lang";
/** Where this device caches the data: one key in Claude; one per signed-in person on the web */
let lsKey: string | null = IS_ARTIFACT ? BASE_KEY : null;

function loadLocal(): State | null {
  if (!lsKey) return null;
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}
function saveLocal(s: State) {
  if (!lsKey) return;
  try {
    localStorage.setItem(lsKey, JSON.stringify(s));
  } catch {
    /* storage unavailable: the cloud copy or memory still holds it */
  }
}
function storedLang(): Lang | null {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return l === "bg" || l === "en" ? l : null;
  } catch {
    return null;
  }
}

const local = loadLocal();
// Data saved before the English version was made in Bulgarian
setLang(local ? local.profile.lang ?? "bg" : storedLang() ?? detectLang());
let state: State = local ?? initialState();
/** Keeps the runtime language in step with the saved profile (local, cloud or reset) */
function syncLang(s: State) {
  if (s.profile.lang && s.profile.lang !== getLang()) setLang(s.profile.lang);
  try {
    localStorage.setItem(LANG_KEY, getLang());
  } catch {
    /* only remembers the sign-in screen's language */
  }
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getState = () => state;
export function useStore(): State {
  return useSyncExternalStore(subscribe, getState);
}
/** Re-renders only when the language changes */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang);
}

export function setState(fn: (s: State) => State) {
  const prev = state;
  const next = fn(prev);
  if (next === prev) return;
  state = next;
  syncLang(next);
  saveLocal(next);
  markDirty(prev, next);
  emit();
}

/* ───────────── cloud sync (Claude artifact db, private per person) ───────────── */

export type SyncStatus = "local" | "connecting" | "synced" | "saving" | "error";
let syncStatus: SyncStatus = "local";
const syncListeners = new Set<() => void>();
const setSync = (s: SyncStatus) => {
  syncStatus = s;
  syncListeners.forEach((l) => l());
};
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => syncStatus,
  );
}

/** Where the documents live: the artifact's Claude db, or the Supabase table on the web */
export interface Remote {
  load(): Promise<{ key: string; data: Record<string, unknown> }[]>;
  save(key: string, data: Record<string, unknown>): Promise<void>;
}
let remote: Remote | null = null;
let ready = false;
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | null = null;
let lastPull = 0;

function markDirty(prev: State, next: State) {
  if (prev.profile !== next.profile) dirty.add("profile");
  if (prev.plans !== next.plans) dirty.add("plans");
  if (prev.foods !== next.foods) dirty.add("library");
  if (prev.days !== next.days) {
    const keys = new Set([...Object.keys(prev.days), ...Object.keys(next.days)]);
    keys.forEach((d) => {
      if (prev.days[d] !== next.days[d]) dirty.add("log-" + d.slice(0, 7));
    });
  }
  schedule();
}

function body(key: string): Record<string, unknown> {
  if (key === "profile") return { profile: state.profile };
  if (key === "plans") return { plans: state.plans };
  if (key === "library") return { foods: state.foods };
  const month = key.slice(4);
  const days: Record<string, Day> = {};
  for (const [d, v] of Object.entries(state.days)) if (d.startsWith(month)) days[d] = v;
  return { days };
}

function schedule() {
  if (!remote || !ready || dirty.size === 0) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}

function flush(): Promise<void> {
  if (!remote) return Promise.resolve();
  if (flushing) return flushing;
  const r = remote;
  flushing = (async () => {
    setSync("saving");
    try {
      while (dirty.size && remote === r) {
        const key = dirty.values().next().value as string;
        dirty.delete(key);
        try {
          await r.save(key, body(key));
        } catch (e) {
          dirty.add(key);
          throw e;
        }
      }
      setSync("synced");
    } catch (e) {
      console.warn("sync failed", e);
      setSync("error");
      clearTimeout(timer);
      timer = setTimeout(flush, 15000); // try again later; the local copy keeps everything meanwhile
      return;
    } finally {
      flushing = null;
    }
    if (dirty.size && remote === r) schedule();
  })();
  return flushing;
}

/** Saves anything still waiting, e.g. before signing out */
export async function flushNow() {
  clearTimeout(timer);
  if (flushing) await flushing;
  if (dirty.size) await flush();
}

/** Remote copy wins per document; days merge, remote days replacing local ones */
function applyRemote(docs: { key: string; data: Record<string, unknown> }[]) {
  const next: State = { ...state, days: { ...state.days } };
  const remoteDays: Record<string, Day> = {};
  for (const d of docs) {
    const data = structuredClone(d.data ?? {}) as Record<string, any>;
    if (d.key === "profile" && data.profile) next.profile = { ...state.profile, lang: "bg", ...data.profile };
    else if (d.key === "plans" && data.plans) next.plans = data.plans;
    else if (d.key === "library" && data.foods) next.foods = data.foods;
    else if (d.key.startsWith("log-") && data.days) Object.assign(remoteDays, data.days);
  }
  next.days = { ...state.days, ...remoteDays };
  state = next;
  syncLang(next);
  saveLocal(next);
  emit();
}

async function startSync(r: Remote) {
  remote = r;
  ready = false;
  setSync("connecting");
  try {
    const docs = await r.load();
    if (remote !== r) return;
    if (!docs.length) {
      ["profile", "plans", "library"].forEach((k) => dirty.add(k));
      Object.keys(state.days).forEach((d) => dirty.add("log-" + d.slice(0, 7)));
    } else applyRemote(docs);
    lastPull = Date.now();
    ready = true;
    setSync("synced");
    schedule();
  } catch (e) {
    console.warn("cloud init failed", e);
    if (remote === r) setSync("error");
  }
}

/** Fetches changes made on another device; skipped while local edits are still uploading */
export async function pullRemote(minGapMs = 30000) {
  const r = remote;
  if (!r) return;
  if (!ready) return startSync(r);
  if (dirty.size || flushing || Date.now() - lastPull < minGapMs) return;
  lastPull = Date.now();
  try {
    const docs = await r.load();
    if (remote === r && !dirty.size && !flushing && docs.length) applyRemote(docs);
  } catch (e) {
    console.warn("refresh failed", e);
  }
}

/** Claude artifact: the person's private documents under data/users/<id> */
export async function initCloud() {
  if (!IS_ARTIFACT) return;
  const c = (window as unknown as { claude?: { use(n: string): Promise<any> } }).claude;
  if (!c?.use) return;
  setSync("connecting");
  try {
    const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
    if (!db || !user) return setSync("local");
    const id = await user.id();
    if (!id) return setSync("local");
    const col = db.collection(`data/users/${id}`);
    await startSync({
      async load() {
        const snap = await col.get();
        return snap.docs.map((d: { id: string; data(): Record<string, unknown> | undefined }) => ({ key: d.id, data: d.data() ?? {} }));
      },
      save: (key, data) => col.doc(key).set(data),
    });
  } catch (e) {
    console.warn("cloud init failed", e);
    setSync("error");
  }
}

/** Web: switches the app to a signed-in person's data (cached copy first, then their cloud copy) */
export async function openUser(userId: string, r: Remote) {
  remote = null;
  ready = false;
  dirty.clear();
  clearTimeout(timer);
  lsKey = `${BASE_KEY}:${userId}`;
  state = loadLocal() ?? initialState();
  syncLang(state);
  emit();
  await startSync(r);
}

/** Web: after sign-out nothing of the person's stays in memory (forget also clears this device's copy) */
export function closeUser(forget = false) {
  if (forget && lsKey) {
    try {
      localStorage.removeItem(lsKey);
    } catch {
      /* nothing cached */
    }
  }
  remote = null;
  ready = false;
  dirty.clear();
  clearTimeout(timer);
  lsKey = null;
  state = initialState();
  setSync("local");
  emit();
}


/* ───────────── day helpers ───────────── */

const toEntries = (meals: Meal[]): Entry[] =>
  meals.flatMap((m) => m.items.map((it) => ({ ...it, meal: m.name, done: false })));

export function planFor(t: DayType, plans: Plans): Meal[] {
  return t === "free" ? [] : plans[t];
}

/** The stored day, or a virtual one built from the plan until the person touches it */
export function dayView(s: State, date: string): { entries: Entry[]; stored: boolean; type: DayType } {
  const type = dayType(date, s.profile);
  const d = s.days[date];
  if (d) return { entries: d.entries, stored: true, type };
  return { entries: toEntries(planFor(type, s.plans)), stored: false, type };
}

export function mealOrder(s: State, date: string, entries: Entry[]): string[] {
  const type = dayType(date, s.profile);
  const names = planFor(type, s.plans).map((m) => m.name);
  const base = names.length ? names : defaultMeals();
  const extra = entries.map((e) => e.meal).filter((m) => !base.includes(m));
  return [...base, ...Array.from(new Set(extra))];
}

function mutateDay(date: string, fn: (entries: Entry[]) => Entry[]) {
  setState((s) => {
    const cur = dayView(s, date).entries;
    return { ...s, days: { ...s.days, [date]: { date, entries: fn(cur) } } };
  });
}

export const actions = {
  toggle(date: string, id: string) {
    mutateDay(date, (es) => es.map((e) => (e.id === id ? { ...e, done: !e.done } : e)));
  },
  setMealDone(date: string, meal: string, done: boolean) {
    mutateDay(date, (es) => es.map((e) => (e.meal === meal ? { ...e, done } : e)));
  },
  updateEntry(date: string, entry: Entry) {
    mutateDay(date, (es) => es.map((e) => (e.id === entry.id ? entry : e)));
  },
  removeEntry(date: string, id: string) {
    mutateDay(date, (es) => es.filter((e) => e.id !== id));
  },
  addEntries(date: string, meal: string, items: Item[], done = true) {
    mutateDay(date, (es) => [...es, ...items.map((it) => ({ ...it, id: uid(), meal, done }))]);
  },
  resetDay(date: string) {
    setState((s) => {
      const days = { ...s.days };
      delete days[date];
      return { ...s, days };
    });
  },

  /* plans */
  setPlanMeals(plan: PlanType, meals: Meal[]) {
    setState((s) => ({ ...s, plans: { ...s.plans, [plan]: meals } }));
  },
  editPlan(plan: PlanType, fn: (meals: Meal[]) => Meal[]) {
    setState((s) => ({ ...s, plans: { ...s.plans, [plan]: fn(s.plans[plan]) } }));
  },
  addPlanItems(plan: PlanType, mealId: string, items: Item[]) {
    actions.editPlan(plan, (ms) => ms.map((m) => (m.id === mealId ? { ...m, items: [...m.items, ...items.map((i) => ({ ...i, id: uid() }))] } : m)));
  },
  updatePlanItem(plan: PlanType, item: Item) {
    actions.editPlan(plan, (ms) => ms.map((m) => ({ ...m, items: m.items.map((i) => (i.id === item.id ? item : i)) })));
  },
  removePlanItem(plan: PlanType, id: string) {
    actions.editPlan(plan, (ms) => ms.map((m) => ({ ...m, items: m.items.filter((i) => i.id !== id) })));
  },

  /* library */
  upsertFood(food: Food) {
    setState((s) => ({ ...s, foods: { ...s.foods, [food.id]: food } }));
  },
  deleteFood(id: string) {
    setState((s) => {
      const foods = { ...s.foods };
      delete foods[id];
      return { ...s, foods };
    });
  },

  /* profile */
  updateProfile(patch: Partial<Profile>) {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  },
  setOverride(date: string, t: DayType | null) {
    setState((s) => {
      const overrides = { ...s.profile.overrides };
      if (t) overrides[date] = t;
      else delete overrides[date];
      return { ...s, profile: { ...s.profile, overrides } };
    });
  },
  resetAll() {
    const fresh = initialState();
    setState(() => fresh);
  },
  /** Switches the UI language and renames the built-in foods and meals that were not edited */
  setLang(to: Lang) {
    setState((s) => {
      const from = getLang();
      if (from === to && s.profile.lang === to) return s;
      const next = relocalize(s, from, to);
      return { ...next, profile: { ...next.profile, lang: to } };
    });
  },
};

/** Find a library food by name (case-insensitive), used to link AI results to saved foods */
export function foodByName(s: State, name: string): Food | undefined {
  const n = name.trim().toLowerCase();
  return Object.values(s.foods).find((f) => f.name.trim().toLowerCase() === n);
}
export function foodByBarcode(s: State, code: string): Food | undefined {
  return Object.values(s.foods).find((f) => f.barcode === code);
}
