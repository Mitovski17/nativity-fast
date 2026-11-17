import { useCallback, useEffect, useState } from "react";
import { Home } from "./components/Home";
import { Plan } from "./components/Plan";
import { Library } from "./components/Library";
import { Profile } from "./components/Profile";
import { Bible } from "./components/Bible";
import { SheetCtx, SheetHost, type SheetState } from "./components/sheets";
import { Icon, ToastHost } from "./components/ui";
import { dayView, getState, initCloud, mealOrder, useLang } from "./lib/store";
import { defaultMeals } from "./lib/seed";
import { tr } from "./lib/i18n";
import { todayISO } from "./lib/fast";

type Tab = "today" | "plan" | "library" | "bible" | "profile";
/** profile is not in the tab bar; it opens from the avatar on Today */
const TABS: Tab[] = ["today", "plan", "library", "bible", "profile"];
const fromHash = (): Tab => {
  const h = location.hash.replace("#", "") as Tab;
  return TABS.includes(h) ? h : "today";
};

function mealByClock(date: string) {
  const s = getState();
  const meals = mealOrder(s, date, dayView(s, date).entries);
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const [breakfast, lunch, snack, dinner] = defaultMeals();
  const want = h < 10.5 ? breakfast : h < 15 ? lunch : h < 18 ? snack : dinner;
  return meals.includes(want) ? want : meals[0] ?? lunch;
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(fromHash);
  const [date, setDate] = useState(todayISO);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const open = useCallback((s: SheetState | null) => setSheet(s), []);
  // Changing language remounts every screen so all text is redrawn
  const lang = useLang();

  useEffect(() => {
    initCloud();
    const onHash = () => setTabState(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      history.replaceState(null, "", t === "today" ? location.pathname + location.search : "#" + t);
    } catch {
      /* hash routing is a convenience */
    }
    window.scrollTo({ top: 0 });
  };

  const nav: [Tab, string, string][] = [
    ["today", "home", tr("Днес", "Today")],
    ["plan", "list", tr("План", "Plan")],
    ["library", "book", tr("Храни", "Foods")],
    ["bible", "bible", tr("Библия", "Bible")],
  ];

  return (
    <SheetCtx.Provider value={open} key={lang}>
      <main className="app">
        {tab === "today" && <Home date={date} setDate={setDate} onProfile={() => setTab("profile")} />}
        {tab === "plan" && <Plan />}
        {tab === "library" && <Library />}
        {tab === "profile" && <Profile onBack={() => setTab("today")} />}
        {tab === "bible" && <Bible />}
      </main>
      <nav className="tabbar" aria-label={tr("Основна навигация", "Main navigation")}>
        <div className="tabbar-in">
          {nav.slice(0, 2).map(([t, ic, label]) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}>
              <Icon name={ic} size={22} stroke={tab === t ? 2.1 : 1.7} />
              {label}
            </button>
          ))}
          <button
            className="fab"
            aria-label={tr("Добави храна", "Add food")}
            onClick={() => {
              const d = tab === "today" ? date : todayISO();
              open({ k: "add", quick: true, target: { to: "day", date: d, meal: mealByClock(d) } });
            }}
          >
            <Icon name="plus" size={26} stroke={2.2} />
          </button>
          {nav.slice(2).map(([t, ic, label]) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}>
              <Icon name={ic} size={22} stroke={tab === t ? 2.1 : 1.7} />
              {label}
            </button>
          ))}
        </div>
      </nav>
      <SheetHost sheet={sheet} />
      <ToastHost />
    </SheetCtx.Provider>
  );
}
