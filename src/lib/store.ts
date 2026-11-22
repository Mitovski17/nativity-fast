import { useSyncExternalStore } from "react";
import type { Day, DayType, Entry, Food, HlColor, Item, Meal, MealPlan, PlanType, Plans, Profile, SavedVerse, State } from "./types";
import { defaultMeals, initialState, migrate, relocalize } from "./seed";
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
    return s && s.v === 1 ? migrate(s) : null;
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
/**
 * Documents changed on this device but not yet uploaded. Kept on the device too, so closing the app
 * before the upload finishes can't let the older cloud copy overwrite the change on the next start.
 */
const pendingKey = () => (lsKey ? `${lsKey}:pending` : null);
function savePending() {
  const k = pendingKey();
  if (!k) return;
  try {
    if (dirty.size) localStorage.setItem(k, JSON.stringify([...dirty]));
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
function restorePending() {
  const k = pendingKey();
  if (!k) return;
  try {
    const keys = JSON.parse(localStorage.getItem(k) ?? "[]") as unknown;
    if (Array.isArray(keys)) keys.forEach((x) => typeof x === "string" && dirty.add(x));
  } catch {
    /* nothing pending */
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
/** Bumped when the account/session changes, so an old upload finishing late can't clear the new one's marker */
let flushGen = 0;
let lastPull = 0;

function markDirty(prev: State, next: State) {
  if (prev.profile !== next.profile) dirty.add("profile");
  if (prev.plans !== next.plans) dirty.add("plans");
  if (prev.foods !== next.foods) dirty.add("library");
  if (prev.bible !== next.bible) dirty.add("bible");
  if (prev.days !== next.days) {
    const keys = new Set([...Object.keys(prev.days), ...Object.keys(next.days)]);
    keys.forEach((d) => {
      if (prev.days[d] !== next.days[d]) dirty.add("log-" + d.slice(0, 7));
    });
  }
  savePending();
  schedule();
}

function body(key: string): Record<string, unknown> {
  if (key === "profile") return { profile: state.profile };
  if (key === "plans") return { plans: state.plans };
  if (key === "library") return { foods: state.foods };
  if (key === "bible") return { bible: state.bible };
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
  const gen = flushGen;
  flushing = (async () => {
    setSync("saving");
    try {
      while (dirty.size && remote === r) {
        const key = dirty.values().next().value as string;
        dirty.delete(key);
        try {
          await r.save(key, body(key));
          savePending();
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
      if (gen === flushGen) flushing = null;
    }
    if (dirty.size && remote === r) schedule();
  })();
  return flushing;
}

// Upload straight away when the app goes to the background (phones often close it from there)
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && ready && dirty.size) {
      clearTimeout(timer);
      void flush();
    }
  });

/** Saves anything still waiting, e.g. before signing out */
export async function flushNow() {
  clearTimeout(timer);
  if (flushing) await flushing;
  if (dirty.size) await flush();
}

/** Remote copy wins per document, except documents changed here and not uploaded yet; days merge, remote days replacing local ones */
function applyRemote(docs: { key: string; data: Record<string, unknown> }[]) {
  const next: State = { ...state, days: { ...state.days } };
  const remoteDays: Record<string, Day> = {};
  for (const d of docs) {
    if (dirty.has(d.key)) continue; // this device's newer copy is still on its way up
    const data = structuredClone(d.data ?? {}) as Record<string, any>;
    if (d.key === "profile" && data.profile) next.profile = { ...state.profile, lang: "bg", ...data.profile };
    else if (d.key === "plans" && data.plans) next.plans = data.plans;
    else if (d.key === "library" && data.foods) next.foods = data.foods;
    else if (d.key === "bible" && data.bible) next.bible = data.bible;
    else if (d.key.startsWith("log-") && data.days) Object.assign(remoteDays, data.days);
  }
  next.days = { ...state.days, ...remoteDays };
  state = migrate(next);
  syncLang(next);
  saveLocal(next);
  emit();
}

async function startSync(r: Remote) {
  remote = r;
  ready = false;
  restorePending();
  setSync("connecting");
  try {
    const docs = await r.load();
    if (remote !== r) return;
    if (!docs.length) {
      ["profile", "plans", "library", "bible"].forEach((k) => dirty.add(k));
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
  flushing = null; // an upload stuck from the previous account/session must not block this one
  flushGen++;
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
      localStorage.removeItem(`${lsKey}:pending`);
    } catch {
      /* nothing cached */
    }
  }
  remote = null;
  ready = false;
  dirty.clear();
  clearTimeout(timer);
  flushing = null;
  flushGen++;
  lsKey = null;
  state = initialState();
  setSync("local");
  emit();
}


/* ───────────── day helpers ───────────── */

const toEntries = (meals: Meal[]): Entry[] =>
  meals.flatMap((m) => m.items.map((it) => ({ ...it, meal: m.name, done: false })));

/** The plan that fills untouched days, or null in manual tracking mode */
export function activePlan(s: State): MealPlan | null {
  const id = s.profile.activePlan;
  return id ? s.plans[id] ?? null : null;
}

export function planFor(t: DayType, s: State): Meal[] {
  const p = activePlan(s);
  return t === "free" || !p ? [] : p.days[t] ?? [];
}

const cloneMeals = (meals: Meal[]): Meal[] => meals.map((m) => ({ ...m, id: uid(), items: m.items.map((i) => ({ ...i, id: uid() })) }));

/** The stored day, or a virtual one built from the plan until the person touches it */
export function dayView(s: State, date: string): { entries: Entry[]; stored: boolean; type: DayType } {
  const type = dayType(date, s.profile);
  const d = s.days[date];
  if (d) return { entries: d.entries, stored: true, type };
  return { entries: toEntries(planFor(type, s)), stored: false, type };
}

export function mealOrder(s: State, date: string, entries: Entry[]): string[] {
  const type = dayType(date, s.profile);
  const names = planFor(type, s).map((m) => m.name);
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

  /* plan library */
  /** Saves a new plan; with activate it starts filling the days right away */
  addPlan(name: string, days: Plans, activate: boolean): string {
    const id = uid();
    setState((s) => ({
      ...s,
      plans: { ...s.plans, [id]: { id, name, days, createdAt: Date.now() } },
      profile: activate ? { ...s.profile, activePlan: id, planIsExample: false } : s.profile,
    }));
    return id;
  },
  /** null switches to manual tracking: days start empty */
  setActivePlan(id: string | null) {
    setState((s) => ({ ...s, profile: { ...s.profile, activePlan: id } }));
  },
  renamePlan(id: string, name: string) {
    setState((s) => (s.plans[id] ? { ...s, plans: { ...s.plans, [id]: { ...s.plans[id], name } } } : s));
  },
  duplicatePlan(id: string, name: string): string | null {
    const src = getState().plans[id];
    if (!src) return null;
    return actions.addPlan(name, { strict: cloneMeals(src.days.strict), oil: cloneMeals(src.days.oil), fish: cloneMeals(src.days.fish) }, false);
  },
  deletePlan(id: string) {
    setState((s) => {
      const plans = { ...s.plans };
      delete plans[id];
      return { ...s, plans, profile: s.profile.activePlan === id ? { ...s.profile, activePlan: null } : s.profile };
    });
  },
  setPlanMeals(planId: string, plan: PlanType, meals: Meal[]) {
    actions.editPlan(planId, plan, () => meals);
  },
  copyPlanDay(planId: string, from: PlanType, to: PlanType) {
    actions.editPlan(planId, to, () => cloneMeals(getState().plans[planId]?.days[from] ?? []));
  },
  editPlan(planId: string, plan: PlanType, fn: (meals: Meal[]) => Meal[]) {
    setState((s) => {
      const p = s.plans[planId];
      if (!p) return s;
      // editing the example makes it the person's own plan
      return { ...s, plans: { ...s.plans, [planId]: { ...p, example: false, days: { ...p.days, [plan]: fn(p.days[plan] ?? []) } } } };
    });
  },
  addPlanItems(planId: string, plan: PlanType, mealId: string, items: Item[]) {
    actions.editPlan(planId, plan, (ms) => ms.map((m) => (m.id === mealId ? { ...m, items: [...m.items, ...items.map((i) => ({ ...i, id: uid() }))] } : m)));
  },
  updatePlanItem(planId: string, plan: PlanType, item: Item) {
    actions.editPlan(planId, plan, (ms) => ms.map((m) => ({ ...m, items: m.items.map((i) => (i.id === item.id ? item : i)) })));
  },
  removePlanItem(planId: string, plan: PlanType, id: string) {
    actions.editPlan(planId, plan, (ms) => ms.map((m) => ({ ...m, items: m.items.filter((i) => i.id !== id) })));
  },

  /* Bible notes */
  setHighlight(keys: string[], color: HlColor | null) {
    setState((s) => {
      const highlights = { ...s.bible.highlights };
      for (const k of keys) {
        if (color) highlights[k] = color;
        else delete highlights[k];
      }
      return { ...s, bible: { ...s.bible, highlights } };
    });
  },
  addFolder(name: string): string {
    const id = uid();
    setState((s) => ({ ...s, bible: { ...s.bible, folders: [...s.bible.folders, { id, name: name.trim(), createdAt: Date.now() }] } }));
    return id;
  },
  renameFolder(id: string, name: string) {
    setState((s) => ({ ...s, bible: { ...s.bible, folders: s.bible.folders.map((f) => (f.id === id ? { ...f, name } : f)) } }));
  },
  /** removes the folder and the verses saved in it */
  deleteFolder(id: string) {
    setState((s) => ({ ...s, bible: { ...s.bible, folders: s.bible.folders.filter((f) => f.id !== id), saved: s.bible.saved.filter((v) => v.folderId !== id) } }));
  },
  saveVerses(v: Omit<SavedVerse, "id" | "createdAt">) {
    setState((s) => ({ ...s, bible: { ...s.bible, saved: [{ ...v, id: uid(), createdAt: Date.now() }, ...s.bible.saved] } }));
  },
  removeSaved(id: string) {
    setState((s) => ({ ...s, bible: { ...s.bible, saved: s.bible.saved.filter((v) => v.id !== id) } }));
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
