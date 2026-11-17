import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { actions, useStore } from "../lib/store";
import { FASTING, NIV_CREDIT, WEB_CREDIT, bookName, loadBook, loadIndex, randomPassage, type BookInfo, type BookText, type FastingPassage } from "../lib/bible";
import { IS_ARTIFACT } from "../lib/env";
import { tr } from "../lib/i18n";
import { Icon } from "./ui";

const DailyVerseRow = IS_ARTIFACT ? null : lazy(() => import("./DailyVerse"));

type View = { k: "home" } | { k: "book"; code: string } | { k: "read"; code: string; chapter: number; verse?: number };

/** Where the Bible tab was, kept while the app is open (the saved place covers restarts) */
let lastView: View = { k: "home" };

export function Bible() {
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  const [index, setIndex] = useState<BookInfo[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    loadIndex().then(setIndex, () => setErr(true));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view.k, view.k === "read" ? `${view.code}${view.chapter}` : ""]);

  const saved = useStore().profile.bible;
  const book = (code: string) => index?.find((b) => b.code === code);
  if (view.k === "read" && index) {
    // coming back to the chapter you were reading: start where you left off
    const verse = view.verse ?? (saved?.book === view.code && saved.chapter === view.chapter ? saved.verse : undefined);
    return <Reader key={`${view.code}-${view.chapter}`} info={book(view.code)!} chapter={view.chapter} verse={verse} go={setView} />;
  }
  if (view.k === "book" && index) return <Chapters info={book(view.code)!} go={setView} />;
  return <BibleHome index={index} err={err} go={setView} />;
}

/* ───────── home: verse for the fast, continue reading, books ───────── */

function BibleHome({ index, err, go }: { index: BookInfo[] | null; err: boolean; go: (v: View) => void }) {
  const s = useStore();
  const last = s.profile.bible;
  const lastBook = last && index?.find((b) => b.code === last.book);
  const sections: [BookInfo["section"], string][] = [
    ["ot", tr("Стар завет", "Old Testament")],
    ["dc", tr("Второканонични книги", "Deuterocanonical books")],
    ["nt", tr("Нов завет", "New Testament")],
  ];
  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <div className="eyebrow">{tr("Слово за поста", "Word for the fast")}</div>
          <h1 className="h1">{tr("Библия", "Bible")}</h1>
        </div>
      </header>

      {lastBook ? (
        <button className="card pad continue" onClick={() => go({ k: "read", code: lastBook.code, chapter: last!.chapter, verse: last!.verse })}>
          <span className="ic"><Icon name="bible" size={22} /></span>
          <span className="grow">
            <span className="eyebrow">{tr("Продължи да четеш", "Continue reading")}</span>
            <span className="continue-ref">{bookName(lastBook)} {last!.chapter}</span>
          </span>
          <Icon name="right" size={18} />
        </button>
      ) : null}

      <VerseCard go={go} />

      {DailyVerseRow && (
        <Suspense fallback={null}>
          <DailyVerseRow />
        </Suspense>
      )}

      {err && <div className="note warn">{tr("Библията не се зареди. Провери връзката и отвори раздела пак.", "The Bible didn't load. Check your connection and open this tab again.")}</div>}
      {!index && !err && (
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <span className="spinner" />
        </div>
      )}
      {index &&
        sections.map(([sec, title]) => (
          <section key={sec}>
            <div className="sec-head"><span className="eyebrow">{title}</span></div>
            <div className="card book-grid">
              {index
                .filter((b) => b.section === sec)
                .map((b) => (
                  <button key={b.code} className="book-cell" onClick={() => go(b.chapters === 1 ? { k: "read", code: b.code, chapter: 1 } : { k: "book", code: b.code })}>
                    <span>{bookName(b)}</span>
                    <small>{b.chapters}</small>
                  </button>
                ))}
            </div>
          </section>
        ))}

      <div className="tiny faint" style={{ textAlign: "center", paddingInline: 8, lineHeight: 1.5 }}>
        {tr("Текст на Библията", "Bible text")}: {WEB_CREDIT}.
        <br />
        {tr("Стиховете за поста", "Fasting verses")}: {NIV_CREDIT}
      </div>
    </div>
  );
}

function VerseCard({ go }: { go: (v: View) => void }) {
  const [p, setP] = useState<FastingPassage | null>(null);
  return (
    <section className="card pad verse-card">
      {p ? (
        <>
          <div className="eyebrow">{p.ref} · NIV</div>
          <blockquote className="verse-text">
            {p.verses.map((v) => (
              <span key={v.n}>
                <sup>{v.n}</sup>
                {v.t}{" "}
              </span>
            ))}
          </blockquote>
          <div className="verse-actions">
            <button className="btn primary" style={{ flex: 1 }} onClick={() => setP(randomPassage(p))}>
              <Icon name="refresh" size={18} /> {tr("Друг стих", "Another verse")}
            </button>
            <button className="btn ghost" onClick={() => go({ k: "read", code: p.code, chapter: p.chapter, verse: p.verses[0]?.n })}>
              {tr("В контекст", "In context")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="eyebrow">{tr(`${FASTING.length} стиха за поста`, `${FASTING.length} passages on fasting`)}</div>
          <p className="display verse-invite">{tr("Вземи си стих за днес", "Take a verse for today")}</p>
          <button className="btn primary block" onClick={() => setP(randomPassage())}>
            <Icon name="sparkle" size={18} /> {tr("Дай ми стих", "Get a verse")}
          </button>
        </>
      )}
    </section>
  );
}

/* ───────── chapters of a book ───────── */

function Chapters({ info, go }: { info: BookInfo; go: (v: View) => void }) {
  const s = useStore();
  const last = s.profile.bible;
  return (
    <div className="screen">
      <header className="topbar" style={{ alignItems: "center" }}>
        <button className="icon-btn" onClick={() => go({ k: "home" })} aria-label={tr("Назад към книгите", "Back to the books")} style={{ marginLeft: -8 }}>
          <Icon name="left" size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{tr("Глави", "Chapters")}</div>
          <h1 className="h1">{bookName(info)}</h1>
        </div>
      </header>
      <div className="chapter-grid">
        {Array.from({ length: info.chapters }, (_, i) => i + 1).map((c) => (
          <button key={c} className={`chapter-cell ${last?.book === info.code && last.chapter === c ? "on" : ""}`} onClick={() => go({ k: "read", code: info.code, chapter: c })}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── reading a chapter ───────── */

/** Remounted per chapter (key); the starting verse is fixed for the visit so saving the place doesn't move the page */
function Reader({ info, chapter, verse: startVerse, go }: { info: BookInfo; chapter: number; verse?: number; go: (v: View) => void }) {
  const [verse] = useState(startVerse);
  const [text, setText] = useState<BookText | null>(null);
  const [err, setErr] = useState(false);
  const [mark] = useState<number | undefined>(verse);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setText(null);
    setErr(false);
    loadBook(info.code).then((t) => live && setText(t), () => live && setErr(true));
    return () => {
      live = false;
    };
  }, [info.code]);

  // Remember the place: book and chapter at once, the verse at the top of the screen as you scroll
  useEffect(() => {
    actions.updateProfile({ bible: { book: info.code, chapter, verse } });
  }, [info.code, chapter, verse]);

  const verses = text?.chapters[chapter - 1] ?? null;

  useLayoutEffect(() => {
    if (!verses || !verse || verse <= 1) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-v="${verse}"]`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90 });
  }, [verses, verse]);

  useEffect(() => {
    if (!verses) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const els = body.current?.querySelectorAll<HTMLElement>("[data-v]") ?? [];
        for (const el of els) {
          if (el.getBoundingClientRect().bottom > 90) {
            const v = Number(el.dataset.v);
            actions.updateProfile({ bible: { book: info.code, chapter, verse: v > 1 ? v : undefined } });
            break;
          }
        }
      }, 800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [verses, info.code, chapter]);

  const prev = chapter > 1 ? chapter - 1 : null;
  const next = chapter < info.chapters ? chapter + 1 : null;
  const title = useMemo(() => `${bookName(info)} ${chapter}`, [info, chapter]);

  return (
    <div className="screen reader">
      <header className="topbar reader-bar">
        <button className="icon-btn" onClick={() => go(info.chapters > 1 ? { k: "book", code: info.code } : { k: "home" })} aria-label={tr("Назад", "Back")} style={{ marginLeft: -8 }}>
          <Icon name="left" size={22} />
        </button>
        <button className="reader-title" onClick={() => go({ k: "home" })} aria-label={tr("Към всички книги", "To all books")}>
          <span className="eyebrow">{tr("Библия", "Bible")}</span>
          <span className="h2">{title}</span>
        </button>
        <span style={{ width: 40 }} />
      </header>

      {err && <div className="note warn">{tr("Главата не се зареди. Провери връзката.", "This chapter didn't load. Check your connection.")}</div>}
      {!verses && !err && (
        <div style={{ display: "grid", placeItems: "center", padding: 40 }}>
          <span className="spinner" />
        </div>
      )}
      {verses && (
        <div className="scripture" ref={body} lang="en">
          {verses.map(([n, t]) => (
            <span key={n} data-v={n} className={mark === n ? "hl" : undefined}>
              <sup>{n}</sup>
              {t}{" "}
            </span>
          ))}
        </div>
      )}

      {verses && (
        <div className="reader-nav">
          <button className="btn ghost" disabled={!prev} onClick={() => prev && go({ k: "read", code: info.code, chapter: prev })}>
            <Icon name="left" size={18} /> {prev ?? ""}
          </button>
          <span className="tiny faint">{WEB_CREDIT.split(" (")[0]}</span>
          <button className="btn primary" disabled={!next} onClick={() => next && go({ k: "read", code: info.code, chapter: next })}>
            {next ?? ""} <Icon name="right" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
