import { useState } from "react";
import { tr } from "../lib/i18n";
import { defaultMeals } from "../lib/seed";
import type { Kind } from "../lib/types";
import { useStore } from "../lib/store";
import { KIND_META, todayISO } from "../lib/fast";
import { Icon } from "./ui";
import { BarcodeAction, LibraryList, MealPhotoAction, useSheet } from "./sheets";

const KINDS: Kind[] = ["vegan", "oil", "seafood", "fish", "animal"];

export function Library() {
  const s = useStore();
  const open = useSheet();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const count = Object.keys(s.foods).length;
  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr(`${count} храни`, `${count} foods`)}</div>
          <h1 className="h1">{tr("Библиотека", "Library")}</h1>
        </div>
        <button className="pill" onClick={() => open({ k: "food" })}>
          <Icon name="plus" size={16} /> {tr("Нова", "New")}
        </button>
      </header>
      <div className="search">
        <Icon name="search" size={18} />
        <input id="lib-search" className="input" placeholder={tr("Търси по име, марка или баркод", "Search by name, brand or barcode")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="unitchips" style={{ margin: "0 -16px", padding: "0 16px" }}>
        <button className={`uchip ${!kind ? "on" : ""}`} onClick={() => setKind(null)}>{tr("Всички", "All")}</button>
        {KINDS.map((k) => (
          <button key={k} className={`uchip ${kind === k ? "on" : ""}`} onClick={() => setKind(kind === k ? null : k)}>
            {KIND_META[k].label}
          </button>
        ))}
      </div>
      <div className="action-grid">
        <BarcodeAction className="action" style={{ minHeight: 0, flexDirection: "row", alignItems: "center", gap: 12 }} target={{ to: "day", date: todayISO(), meal: defaultMeals()[2] }}>
          <span className="ic"><Icon name="barcode" /></span>
          <b>{tr("Сканирай", "Scan")}</b>
        </BarcodeAction>
        <MealPhotoAction className="action" style={{ minHeight: 0, flexDirection: "row", alignItems: "center", gap: 12 }} target={{ to: "day", date: todayISO(), meal: defaultMeals()[1] }}>
          <span className="ic"><Icon name="camera" /></span>
          <b>{tr("Снимай", "Photo")}</b>
        </MealPhotoAction>
      </div>
      <section className="card">
        <LibraryList query={q} kindFilter={kind} onPick={(food) => open({ k: "food", food })} />
      </section>
      <div className="tiny faint" style={{ textAlign: "center" }}>{tr("Всяка храна, която добавиш, сканираш или снимаш, се запазва тук.", "Every food you add, scan or photograph is saved here.")}</div>
    </div>
  );
}
