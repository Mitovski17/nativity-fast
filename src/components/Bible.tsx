import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HlColor, SavedVerse, Translation } from "../lib/types";
import { actions, getState, useLang, useStore } from "../lib/store";
import { BG_CREDIT, NIV_CREDIT, WEB_CREDIT, bookName, currentTr, fastingPassages, loadBook, loadIndex, randomPassage, shortName, type BookInfo, type BookText, type FastingPassage } from "../lib/bible";
import { IS_ARTIFACT } from "../lib/env";
import { tr } from "../lib/i18n";
import { Icon, Sheet, toast } from "./ui";

const DailyVerseRow = IS_ARTIFACT ? null : lazy(() => import("./DailyVerse"));

type View =
  | { k: "home" }
  | { k: "book"; code: string }
  | { k: "read"; code: string; chapter: number; verse?: number }
  | { k: "folder"; id: string };

/** Where the Bible tab was, kept while the app is open (the saved place covers restarts) */
let lastView: View = { k: "home" };
/** The Bible that view was in: after a language switch the tab starts from its home (book numbering differs) */
let lastViewTr: Translation | null = null;
/** Which testament sections are open on the Bible home */
let openSections: Partial<Record<BookInfo["section"], boolean>> = {};

const COLORS: HlColor[] = ["yellow", "green", "blue", "pink"];
/** English Bible keys stay as they were ("PRO.6.11"); the Bulgarian Bible numbers some books differently, so its keys are its own */
const hlKey = (tr: Translation, book: string, chapter: number, verse: number) => `${tr === "web" ? "" : tr + ":"}${book}.${chapter}.${verse}`;
const textLang = (tr: Translation) => (tr === "web" ? "en" : "bg");

/** "Exodus 2:3–5" / "Exodus 2:3, 7" */
function refOf(info: Pick<BookInfo, "en" | "bg">, chapter: number, verses: number[]) {
  const v = [...verses].sort((a, b) => a - b);
  const contiguous = v.every((n, i) => i === 0 || n === v[i - 1] + 1);
  const part = v.length === 1 ? `${v[0]}` : contiguous ? `${v[0]}–${v[v.length - 1]}` : v.join(", ");
  return `${bookName(info)} ${chapter}:${part}`;
}

export function Bible() {
  if (lastViewTr !== currentTr()) {
    lastView = { k: "home" };
    lastViewTr = currentTr();
  }
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    lastViewTr = currentTr();
    setViewState(v);
  };
  const lang = useLang();
  const bt = currentTr();
  const [index, setIndex] = useState<BookInfo[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    // the text follows the app language: switching language switches the Bible
    let live = true;
    setIndex(null);
    setErr(false);
    loadIndex(bt).then((i) => live && setIndex(i), () => live && setErr(true));
    return () => {
      live = false;
    };
  }, [lang]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view.k, view.k === "read" ? `${view.code}${view.chapter}` : view.k === "folder" ? view.id : ""]);

  const s = useStore();
  const saved = (s.profile.bible?.tr ?? "web") === bt ? s.profile.bible : undefined;
  const book = (code: string) => index?.find((b) => b.code === code);
  const readBook = view.k === "read" ? book(view.code) : undefined;
  if (view.k === "read" && readBook && view.chapter <= readBook.chapters) {
    // coming back to the chapter you were reading: start where you left off
    const verse = view.verse ?? (saved?.book === view.code && saved.chapter === view.chapter ? saved.verse : undefined);
    return <Reader key={`${bt}-${view.code}-${view.chapter}`} bt={bt} info={readBook} chapter={view.chapter} verse={verse} go={setView} />;
  }
  if (view.k === "read" && readBook) return <Chapters info={readBook} go={setView} />;
  if (view.k === "book" && index && book(view.code)) return <Chapters info={book(view.code)!} go={setView} />;
  if (view.k === "folder" && index) return <FolderView id={view.id} index={index} go={setView} />;
  return <BibleHome index={index} err={err} go={setView} />;
}

/* ───────── home: continue, verse for the fast, saved verses, the three sections ───────── */

function BibleHome({ index, err, go }: { index: BookInfo[] | null; err: boolean; go: (v: View) => void }) {
  const s = useStore();
  const bt = currentTr();
  const last = (s.profile.bible?.tr ?? "web") === bt ? s.profile.bible : undefined;
  const lastBook = last && index?.find((b) => b.code === last.book && last.chapter <= b.chapters);
  const [open, setOpen] = useState(openSections);
  const toggle = (sec: BookInfo["section"]) => {
    openSections = { ...openSections, [sec]: !openSections[sec] };
    setOpen(openSections);
  };
  const sections: [BookInfo["section"], string][] = [
    ["ot", tr("Стар завет", "Old Testament")],
    ["dc", tr("Второканонични", "Deuterocanonical")],
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

      {err && <div className="note warn">{tr("Библията не се зареди. Провери връзката и отвори раздела пак.", "The Bible didn't load. Check your connection and open this tab again.")}</div>}
      {!index && !err && (
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <span className="spinner" />
        </div>
      )}
      {index && (
        <section className="card testaments">
          {sections.map(([sec, title]) => {
            const books = index.filter((b) => b.section === sec);
            return (
              <div key={sec} className={`testament ${open[sec] ? "open" : ""}`}>
                <button className="li testament-head" onClick={() => toggle(sec)} aria-expanded={!!open[sec]}>
                  <span className="grow">
                    <span className="name">{title}</span>
                    <span className="tiny muted" style={{ display: "block" }}>{tr(`${books.length} книги`, `${books.length} books`)}</span>
                  </span>
                  <span className="chev"><Icon name="down" size={18} /></span>
                </button>
                {open[sec] && (
                  <div className="book-grid">
                    {books.map((b) => (
                      <button key={b.code} className="book-cell" onClick={() => go(b.chapters === 1 ? { k: "read", code: b.code, chapter: 1 } : { k: "book", code: b.code })}>
                        <span>{bookName(b)}</span>
                        <small>{b.chapters}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <SavedFolders go={go} />

      <VerseCard key={bt} go={go} />

      {DailyVerseRow && (
        <Suspense fallback={null}>
          <DailyVerseRow />
        </Suspense>
      )}

      <div className="tiny faint" style={{ textAlign: "center", paddingInline: 8, lineHeight: 1.5 }}>
        {bt === "web" ? (
          <>
            Bible text: {WEB_CREDIT}.
            <br />
            Fasting verses: {NIV_CREDIT}
          </>
        ) : (
          <>Текст на Библията и стиховете за поста: {BG_CREDIT}.</>
        )}
      </div>
    </div>
  );
}

function SavedFolders({ go }: { go: (v: View) => void }) {
  const { bible } = useStore();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const count = (id: string) => bible.saved.filter((v) => v.folderId === id).length;
  return (
    <section>
      <div className="sec-head">
        <span className="eyebrow">{tr("Запазени стихове", "Saved verses")}</span>
        <button className="btn sm ghost" onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={16} /> {tr("Папка", "Folder")}
        </button>
      </div>
      <div className="card">
        {bible.folders.length === 0 && !adding && (
          <div className="li" style={{ minHeight: 0 }}>
            <span className="small muted">{tr("Докосни стих, докато четеш, за да го оцветиш или запазиш в папка.", "Tap a verse while reading to highlight it or save it to a folder.")}</span>
          </div>
        )}
        {bible.folders.map((f) => (
          <button key={f.id} className="li" onClick={() => go({ k: "folder", id: f.id })}>
            <Icon name="book" size={18} />
            <span className="grow name">{f.name}</span>
            <span className="small faint">{count(f.id)}</span>
            <Icon name="right" size={16} />
          </button>
        ))}
        {adding && (
          <form
            className="li"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              actions.addFolder(name);
              setName("");
              setAdding(false);
            }}
          >
            <input autoFocus className="input" placeholder={tr("Име на папката, напр. Утеха", "Folder name, e.g. Comfort")} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary sm" disabled={!name.trim()}>{tr("Създай", "Create")}</button>
          </form>
        )}
      </div>
    </section>
  );
}

function VerseCard({ go }: { go: (v: View) => void }) {
  const [p, setP] = useState<FastingPassage | null>(null);
  return (
    <section className="card pad verse-card">
      {p ? (
        <>
          <div className="eyebrow">{p.ref}{currentTr() === "web" ? " · NIV" : ""}</div>
          <blockquote className="verse-text" lang={textLang(currentTr())}>
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
          <div className="eyebrow">{tr(`${fastingPassages().length} откъса за поста`, `${fastingPassages().length} passages on fasting`)}</div>
          <p className="display verse-invite">{tr("Вземи си стих за днес", "Take a verse for today")}</p>
          <button className="btn primary block" onClick={() => setP(randomPassage())}>
            <Icon name="sparkle" size={18} /> {tr("Дай ми стих", "Get a verse")}
          </button>
        </>
      )}
    </section>
  );
}

/* ───────── a folder of saved verses ───────── */

function FolderView({ id, index, go }: { id: string; index: BookInfo[]; go: (v: View) => void }) {
  const { bible } = useStore();
  const folder = bible.folders.find((f) => f.id === id);
  const [confirm, setConfirm] = useState(false);
  const bt = currentTr();
  // book names for verses saved from the other language's Bible
  const [otherIndex, setOtherIndex] = useState<BookInfo[] | null>(null);
  const other: Translation = bt === "web" ? "bg" : "web";
  const needsOther = bible.saved.some((v) => v.folderId === id && (v.tr ?? "web") === other && !v.ref);
  useEffect(() => {
    if (needsOther) loadIndex(other).then(setOtherIndex, () => undefined);
  }, [needsOther, other]);
  if (!folder) return <BibleHome index={index} err={false} go={go} />;
  const items = bible.saved.filter((v) => v.folderId === id);
  const info = (code: string) => index.find((b) => b.code === code);
  return (
    <div className="screen">
      <header className="topbar" style={{ alignItems: "center" }}>
        <button className="icon-btn" onClick={() => go({ k: "home" })} aria-label={tr("Назад", "Back")} style={{ marginLeft: -8 }}>
          <Icon name="left" size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{tr(`Папка · ${items.length} ${items.length === 1 ? "стих" : "стиха"}`, `Folder · ${items.length} saved`)}</div>
          <input
            className="h1 plan-title"
            value={folder.name}
            onChange={(e) => actions.renameFolder(id, e.target.value)}
            onBlur={(e) => !e.target.value.trim() && actions.renameFolder(id, tr("Папка", "Folder"))}
            aria-label={tr("Име на папката", "Folder name")}
          />
        </div>
      </header>
      {items.length === 0 && <div className="note">{tr("Още няма стихове тук. Докосни стих, докато четеш, и избери „Запази“.", "No verses here yet. Tap a verse while reading and choose “Save”.")}</div>}
      {items.map((v) => {
        const vt = v.tr ?? "web";
        // a verse saved from the other language's Bible keeps its own reference; it opens only in that Bible
        const b = vt === bt ? info(v.book) : undefined;
        const ob = !b && !v.ref ? otherIndex?.find((x) => x.code === v.book) : undefined;
        const ref = b ? refOf(b, v.chapter, v.verses) : v.ref ?? (ob ? refOf(ob, v.chapter, v.verses) : `${v.book} ${v.chapter}:${v.verses.join(", ")}`);
        return (
          <article key={v.id} className="card pad saved-verse">
            <div className="sec-head" style={{ padding: 0 }}>
              {b ? (
                <button className="eyebrow saved-ref" onClick={() => go({ k: "read", code: v.book, chapter: v.chapter, verse: v.verses[0] })}>
                  {ref} <Icon name="right" size={12} />
                </button>
              ) : (
                <span className="eyebrow">{ref} · {shortName(vt)}</span>
              )}
              <button className="icon-btn" onClick={() => actions.removeSaved(v.id)} aria-label={tr("Премахни от папката", "Remove from folder")}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="verse-text" lang={textLang(vt)} style={{ fontSize: 17 }}>{v.text}</p>
          </article>
        );
      })}
      <button
        className="btn ghost block"
        style={{ color: "var(--warn)" }}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          actions.deleteFolder(id);
          go({ k: "home" });
        }}
      >
        <Icon name="trash" size={18} /> {confirm ? tr("Натисни пак: папката и стиховете в нея се изтриват", "Tap again: the folder and its verses are deleted") : tr("Изтрий папката", "Delete folder")}
      </button>
    </div>
  );
}

/* ───────── chapters of a book ───────── */

function ChapterGrid({ info, current, onPick }: { info: BookInfo; current?: number; onPick: (c: number) => void }) {
  return (
    <div className="chapter-grid">
      {Array.from({ length: info.chapters }, (_, i) => i + 1).map((c) => (
        <button key={c} className={`chapter-cell ${current === c ? "on" : ""}`} onClick={() => onPick(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}

function Chapters({ info, go }: { info: BookInfo; go: (v: View) => void }) {
  const last = useStore().profile.bible;
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
      <ChapterGrid info={info} current={last?.book === info.code ? last.chapter : undefined} onPick={(c) => go({ k: "read", code: info.code, chapter: c })} />
    </div>
  );
}

/* ───────── reading a chapter ───────── */

/** Remounted per chapter (key); the starting verse is fixed for the visit so saving the place doesn't move the page */
function Reader({ bt, info, chapter, verse: startVerse, go }: { bt: Translation; info: BookInfo; chapter: number; verse?: number; go: (v: View) => void }) {
  const { bible } = useStore();
  const [verse] = useState(startVerse);
  const [text, setText] = useState<BookText | null>(null);
  const [err, setErr] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [barHidden, setBarHidden] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadBook(info.code, bt).then((t) => live && setText(t), () => live && setErr(true));
    return () => {
      live = false;
    };
  }, [info.code, bt]);

  // Remember the place: book and chapter at once, the verse at the top of the screen as you scroll
  useEffect(() => {
    actions.updateProfile({ bible: { book: info.code, chapter, verse, tr: bt } });
  }, [info.code, chapter, verse, bt]);

  const verses = text?.chapters[chapter - 1] ?? null;

  useLayoutEffect(() => {
    if (!verses || !verse || verse <= 1) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-v="${verse}"]`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16 });
  }, [verses, verse]);

  useEffect(() => {
    if (!verses) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastY = window.scrollY;
    const onScroll = () => {
      // the chapter bar steps aside while reading down and comes back when scrolling up
      const y = window.scrollY;
      if (Math.abs(y - lastY) > 6) {
        setBarHidden(y > lastY && y > 80);
        lastY = y;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const els = body.current?.querySelectorAll<HTMLElement>("[data-v]") ?? [];
        for (const el of els) {
          if (el.getBoundingClientRect().bottom > 12) {
            const v = Number(el.dataset.v);
            actions.updateProfile({ bible: { book: info.code, chapter, verse: v > 1 ? v : undefined, tr: bt } });
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
  }, [verses, info.code, chapter, bt]);

  const prev = chapter > 1 ? chapter - 1 : null;
  const next = chapter < info.chapters ? chapter + 1 : null;
  const title = `${bookName(info)} ${chapter}`;
  const toggleVerse = (n: number) => setSelected((sel) => (sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n]));
  const selKeys = selected.map((n) => hlKey(bt, info.code, chapter, n));
  const selText = () =>
    (verses ?? [])
      .filter(([n]) => selected.includes(n))
      .map(([, t]) => t)
      .join(" ");

  return (
    <div className="screen reader">
      <header className="topbar" style={{ alignItems: "center" }}>
        <button className="icon-btn" onClick={() => go({ k: "home" })} aria-label={tr("Към книгите", "To the books")} style={{ marginLeft: -8 }}>
          <Icon name="left" size={22} />
        </button>
        <button className="reader-title" onClick={() => setPicker(true)} aria-label={tr("Избери глава", "Choose a chapter")}>
          <span className="eyebrow">{tr("Библия", "Bible")}</span>
          <span className="h2">{title} <Icon name="down" size={16} /></span>
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
        <div className="scripture" ref={body} lang={textLang(bt)}>
          {verses.map(([n, t]) => {
            const hl = bible.highlights[hlKey(bt, info.code, chapter, n)];
            const cls = [hl ? `hl-${hl}` : "", selected.includes(n) ? "sel" : "", !hl && verse === n ? "here" : ""].filter(Boolean).join(" ");
            return (
              <span key={n} data-v={n} className={cls || undefined} onClick={() => toggleVerse(n)}>
                <sup>{n}</sup>
                {t}{" "}
              </span>
            );
          })}
        </div>
      )}

      {verses && (
        <div className="reader-nav">
          <button className="btn ghost" disabled={!prev} onClick={() => prev && go({ k: "read", code: info.code, chapter: prev })}>
            <Icon name="left" size={18} /> {prev ?? ""}
          </button>
          <span className="tiny faint">{bt === "web" ? WEB_CREDIT.split(" (")[0] : shortName(bt)}</span>
          <button className="btn primary" disabled={!next} onClick={() => next && go({ k: "read", code: info.code, chapter: next })}>
            {next ?? ""} <Icon name="right" size={18} />
          </button>
        </div>
      )}

      {selected.length > 0 ? (
        <div className="float-bar verse-tools" role="toolbar" aria-label={tr("Избрани стихове", "Selected verses")}>
          <span className="tiny" style={{ fontWeight: 700 }}>{refOf(info, chapter, selected)}</span>
          <div className="tool-row">
            {COLORS.map((c) => (
              <button key={c} className={`swatch-dot hl-dot-${c}`} aria-label={tr("Оцвети", "Highlight") + " " + c} onClick={() => { actions.setHighlight(selKeys, c); setSelected([]); }} />
            ))}
            {selKeys.some((k) => bible.highlights[k]) && (
              <button className="tool-btn" onClick={() => { actions.setHighlight(selKeys, null); setSelected([]); }} aria-label={tr("Махни оцветяването", "Remove highlight")}>
                <Icon name="x" size={16} />
              </button>
            )}
            <span className="tool-sep" />
            <button className="tool-btn" onClick={() => setSaving(true)}>
              <Icon name="book" size={16} /> {tr("Запази", "Save")}
            </button>
            <button
              className="tool-btn"
              onClick={() => {
                navigator.clipboard?.writeText(`${selText()} — ${refOf(info, chapter, selected)} (${shortName(bt)})`).then(
                  () => toast(tr("Копирано", "Copied")),
                  () => toast(tr("Не можах да копирам", "Couldn't copy")),
                );
                setSelected([]);
              }}
            >
              {tr("Копирай", "Copy")}
            </button>
            <button className="tool-btn" onClick={() => setSelected([])} aria-label={tr("Откажи избора", "Clear selection")}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      ) : (
        verses && (
          <div className={`float-bar chapter-pill ${barHidden ? "away" : ""}`}>
            <button className="icon-btn" disabled={!prev} onClick={() => prev && go({ k: "read", code: info.code, chapter: prev })} aria-label={tr("Предишна глава", "Previous chapter")}>
              <Icon name="left" size={18} />
            </button>
            <button className="pill-title" onClick={() => setPicker(true)}>
              {title} <Icon name="down" size={14} />
            </button>
            <button className="icon-btn" disabled={!next} onClick={() => next && go({ k: "read", code: info.code, chapter: next })} aria-label={tr("Следваща глава", "Next chapter")}>
              <Icon name="right" size={18} />
            </button>
          </div>
        )
      )}

      {picker && (
        <Sheet title={bookName(info)} onClose={() => setPicker(false)}>
          <ChapterGrid info={info} current={chapter} onPick={(c) => { setPicker(false); if (c !== chapter) go({ k: "read", code: info.code, chapter: c }); }} />
          <button className="btn ghost block" onClick={() => { setPicker(false); go({ k: "home" }); }}>
            <Icon name="bible" size={18} /> {tr("Друга книга", "Another book")}
          </button>
        </Sheet>
      )}

      {saving && (
        <SaveSheet
          onClose={() => setSaving(false)}
          onSave={(folderId) => {
            actions.saveVerses({ folderId, book: info.code, chapter, verses: [...selected].sort((a, b) => a - b), text: selText(), tr: bt, ref: refOf(info, chapter, selected) });
            const f = getState().bible.folders.find((x) => x.id === folderId);
            toast(tr(`Запазено в „${f?.name}“`, `Saved to “${f?.name}”`));
            setSaving(false);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}

function SaveSheet({ onClose, onSave }: { onClose: () => void; onSave: (folderId: string) => void }) {
  const { bible } = useStore();
  const [name, setName] = useState("");
  const count = (id: string) => bible.saved.filter((v: SavedVerse) => v.folderId === id).length;
  return (
    <Sheet title={tr("Запази в папка", "Save to a folder")} onClose={onClose}>
      {bible.folders.length > 0 && (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          {bible.folders.map((f) => (
            <button key={f.id} className="li" onClick={() => onSave(f.id)}>
              <Icon name="book" size={18} />
              <span className="grow name">{f.name}</span>
              <span className="small faint">{count(f.id)}</span>
            </button>
          ))}
        </div>
      )}
      <form
        style={{ display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(actions.addFolder(name));
        }}
      >
        <input className="input" autoFocus={!bible.folders.length} placeholder={tr("Нова папка", "New folder")} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>{tr("Създай", "Create")}</button>
      </form>
    </Sheet>
  );
}
