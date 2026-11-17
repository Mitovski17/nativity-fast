import { useEffect, useState, type ReactNode } from "react";
import { tr } from "../lib/i18n";
import type { DayType, Kind, Macros } from "../lib/types";
import { fmtK, r0 } from "../lib/nutrition";

const P: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  down: <path d="M6 9l6 6 6-6" />,
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  barcode: <path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12M4 4h3M17 4h3M4 20h3M17 20h3" />,
  pen: <path d="M14.5 5.5l4 4M4 20l1-5L15.5 4.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L9 19z" />,
  book: <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />,
  home: <path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
  alert: <path d="M12 8v5M12 16.5h.01M10.3 4.2L2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />,
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.5 3.8 3.8 0 0 1-.5 7.5z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
};

export function Icon({ name, size = 20, stroke = 1.8 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function Check({ on, onClick, small, label }: { on: boolean; onClick: () => void; small?: boolean; label: string }) {
  return (
    <button className={`check ${on ? "on" : ""} ${small ? "sm" : ""}`} onClick={onClick} aria-pressed={on} aria-label={label}>
      <span className="box">
        <Icon name="check" size={small ? 13 : 15} stroke={2.6} />
      </span>
    </button>
  );
}

export function Sheet({ title, onClose, children, foot }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={tr("Затвори", "Close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

export function Ring({ value, goal }: { value: number; goal: number }) {
  const size = 132;
  const sw = 11;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const left = goal - value;
  return (
    <div className="ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} />
        <circle
          className={`val ${left < 0 ? "over" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="center">
        <div className="big">{fmtK(Math.abs(left))}</div>
        <div className="tiny faint">{left >= 0 ? tr("kcal остават", "kcal left") : tr("kcal над целта", "kcal over")}</div>
      </div>
    </div>
  );
}

export function MacroBars({ m, goal }: { m: Macros; goal: { p: number; c: number; f: number } }) {
  const rows: [string, "p" | "c" | "f", string][] = [
    [tr("Протеин", "Protein"), "p", "c-p"],
    [tr("Въглехидрати", "Carbs"), "c", "c-c"],
    [tr("Мазнини", "Fat"), "f", "c-f"],
  ];
  return (
    <div className="macros">
      {rows.map(([label, k, cls]) => (
        <div className="macro" key={k}>
          <div className="lbl">
            <span className={`kind-dot ${cls}`} />
            {label}
          </div>
          <div className="num">
            {r0(m[k])}
            <span> / {goal[k]} {tr("г", "g")}</span>
          </div>
          <div className="bar">
            <i className={cls} style={{ width: `${Math.min(100, goal[k] ? (m[k] / goal[k]) * 100 : 0)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const KindDot = ({ kind }: { kind: Kind }) => <span className={`kind-dot k-${kind}`} />;
export const DayDot = ({ type }: { type: DayType }) => <span className={`dot ${type}`} />;

export function MacroLine({ m }: { m: Macros }) {
  return (
    <span className="mm" aria-label={tr(`Протеин ${r0(m.p)}, въглехидрати ${r0(m.c)}, мазнини ${r0(m.f)} г`, `Protein ${r0(m.p)}, carbs ${r0(m.c)}, fat ${r0(m.f)} g`)}>
      <b className="t-p">{tr("П", "P")} {r0(m.p)}</b>
      <b className="t-c">{tr("В", "C")} {r0(m.c)}</b>
      <b className="t-f">{tr("М", "F")} {r0(m.f)}</b>
    </span>
  );
}

export function Summary({ m }: { m: Macros }) {
  return (
    <div className="summary">
      <div>
        <b>{fmtK(m.kcal)}</b>
        <span>kcal</span>
      </div>
      <div>
        <b className="t-p">{r0(m.p)}</b>
        <span>{tr("протеин", "protein")}</span>
      </div>
      <div>
        <b className="t-c">{r0(m.c)}</b>
        <span>{tr("въглехидр.", "carbs")}</span>
      </div>
      <div>
        <b className="t-f">{r0(m.f)}</b>
        <span>{tr("мазнини", "fat")}</span>
      </div>
    </div>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export const toast = (msg: string) => toastSet?.(msg);
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => {
      toastSet = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast" role="status" key={msg + Date.now()}>
      {msg}
    </div>
  ) : null;
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function NumberInput({ value, onChange, suffix, id, step = "any" }: { value: number; onChange: (n: number) => void; suffix?: string; id?: string; step?: string }) {
  const [txt, setTxt] = useState(String(value ?? ""));
  useEffect(() => {
    if (Number(txt.replace(",", ".")) !== value) setTxt(value ? String(Math.round(value * 10) / 10) : value === 0 ? "0" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="input-suffix">
      <input
        id={id}
        className="input"
        inputMode="decimal"
        step={step}
        value={txt}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <em>{suffix}</em>}
    </div>
  );
}
