// Bible reader data, split into one file per book and fetched only when a book is opened:
//   /bible/web/  World English Bible (public domain), by scripts/build-bible.mjs; read in the English app
//   /bible/bg/   Bulgarian Synodal Bible (Holy Synod, Sofia 1992), by scripts/build-bible-bg.mjs; read in the Bulgarian app
import fastingEn from "./fasting-verses.json";
import fastingBg from "./fasting-verses-bg.json";
import { getLang } from "./i18n";
import type { Translation } from "./types";

export interface BookInfo {
  code: string;
  en: string;
  bg: string;
  section: "ot" | "dc" | "nt";
  chapters: number;
}
/** chapters[c - 1] = [[verse number, text], …] */
export interface BookText {
  code: string;
  chapters: [number, string][][];
}
export interface FastingPassage {
  ref: string;
  code: string;
  chapter: number;
  verses: { n: number; t: string }[];
}

/** The Bible that goes with the app language */
export const currentTr = (): Translation => (getLang() === "en" ? "web" : "bg");

const indexes = new Map<Translation, Promise<BookInfo[]>>();
const books = new Map<string, Promise<BookText>>();

async function getJson<T>(tr: Translation, name: string): Promise<T> {
  const r = await fetch(new URL(`bible/${tr}/${name}`, document.baseURI));
  if (!r.ok) throw new Error(`bible ${tr}/${name}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** Cached per Bible; a failed load is forgotten so opening the tab again retries */
function once<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = load();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export const loadIndex = (tr: Translation = currentTr()) => once(indexes as Map<string, Promise<BookInfo[]>>, tr, () => getJson<BookInfo[]>(tr, "index.json"));
export const loadBook = (code: string, tr: Translation = currentTr()) => once(books, `${tr}/${code}`, () => getJson<BookText>(tr, `${code}.json`));

export const bookName = (b: Pick<BookInfo, "en" | "bg">) => (getLang() === "en" ? b.en : b.bg);

/** The person's fasting passages: NIV in English, the same passages from the Synodal Bible in Bulgarian */
export const fastingPassages = (): FastingPassage[] => (currentTr() === "web" ? fastingEn : fastingBg) as FastingPassage[];

/** A random fasting passage, never the same one twice in a row */
export function randomPassage(prev?: FastingPassage): FastingPassage {
  const list = fastingPassages();
  if (list.length < 2) return list[0];
  let p = prev;
  while (p === prev || p?.ref === prev?.ref) p = list[Math.floor(Math.random() * list.length)];
  return p!;
}

export const WEB_CREDIT = "World English Bible (public domain), eBible.org";
export const BG_CREDIT = "Библия, Синодално издание (Св. Синод на БПЦ, София 1992), blagodarya.com";
export const NIV_CREDIT =
  "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.";

/** Short name under the text and after copied verses */
export const shortName = (tr: Translation) => (tr === "web" ? "WEB" : "Синодално издание");
