// Bible reader data: World English Bible (public domain), split into one file per book
// under /bible/web/ by scripts/build-bible.mjs and fetched only when a book is opened.
import fasting from "./fasting-verses.json";
import { getLang } from "./i18n";

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

const base = () => new URL("bible/web/", document.baseURI);
let indexPromise: Promise<BookInfo[]> | null = null;
const books = new Map<string, Promise<BookText>>();

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(new URL(name, base()));
  if (!r.ok) throw new Error(`bible ${name}: ${r.status}`);
  return r.json() as Promise<T>;
}

export function loadIndex(): Promise<BookInfo[]> {
  if (!indexPromise) indexPromise = getJson<BookInfo[]>("index.json").catch((e) => ((indexPromise = null), Promise.reject(e)));
  return indexPromise;
}

export function loadBook(code: string): Promise<BookText> {
  let p = books.get(code);
  if (!p) {
    p = getJson<BookText>(`${code}.json`);
    p.catch(() => books.delete(code));
    books.set(code, p);
  }
  return p;
}

export const bookName = (b: Pick<BookInfo, "en" | "bg">) => (getLang() === "en" ? b.en : b.bg);

export const FASTING: FastingPassage[] = fasting as FastingPassage[];

/** A random fasting passage, never the same one twice in a row */
export function randomPassage(prev?: FastingPassage): FastingPassage {
  if (FASTING.length < 2) return FASTING[0];
  let p = prev;
  while (p === prev) p = FASTING[Math.floor(Math.random() * FASTING.length)];
  return p!;
}

export const WEB_CREDIT = "World English Bible (public domain), eBible.org";
export const NIV_CREDIT =
  "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.";
