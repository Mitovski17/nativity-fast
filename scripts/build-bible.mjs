// Builds the Bible reader data and the fasting-verse lists.
//   node scripts/build-bible.mjs <eng-web_vpl.txt>
// Bible text: World English Bible (public domain), https://ebible.org/find/details.php?id=eng-web
// Writes public/bible/web/<CODE>.json (one file per book) and public/bible/web/index.json,
// src/lib/fasting-verses.json (passages for "Get a verse") and
// supabase/functions/daily-verse/verses.ts (short verses for the 7:00 notification).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("Pass the path to eng-web_vpl.txt");

// [code, English, Bulgarian, section]  ot = Old Testament, dc = books Orthodox Bibles add, nt = New Testament
const BOOKS = [
  ["GEN", "Genesis", "Битие", "ot"], ["EXO", "Exodus", "Изход", "ot"], ["LEV", "Leviticus", "Левит", "ot"],
  ["NUM", "Numbers", "Числа", "ot"], ["DEU", "Deuteronomy", "Второзаконие", "ot"], ["JOS", "Joshua", "Иисус Навин", "ot"],
  ["JDG", "Judges", "Съдии", "ot"], ["RUT", "Ruth", "Рут", "ot"], ["1SA", "1 Samuel", "1 Царства", "ot"],
  ["2SA", "2 Samuel", "2 Царства", "ot"], ["1KI", "1 Kings", "3 Царства", "ot"], ["2KI", "2 Kings", "4 Царства", "ot"],
  ["1CH", "1 Chronicles", "1 Паралипоменон", "ot"], ["2CH", "2 Chronicles", "2 Паралипоменон", "ot"], ["EZR", "Ezra", "Ездра", "ot"],
  ["NEH", "Nehemiah", "Неемия", "ot"], ["EST", "Esther", "Естир", "ot"], ["JOB", "Job", "Йов", "ot"],
  ["PSA", "Psalms", "Псалми", "ot"], ["PRO", "Proverbs", "Притчи", "ot"], ["ECC", "Ecclesiastes", "Еклесиаст", "ot"],
  ["SOL", "Song of Songs", "Песен на песните", "ot"], ["ISA", "Isaiah", "Исаия", "ot"], ["JER", "Jeremiah", "Йеремия", "ot"],
  ["LAM", "Lamentations", "Плачът на Йеремия", "ot"], ["EZE", "Ezekiel", "Езекиил", "ot"], ["DAN", "Daniel", "Даниил", "ot"],
  ["HOS", "Hosea", "Осия", "ot"], ["JOE", "Joel", "Йоил", "ot"], ["AMO", "Amos", "Амос", "ot"],
  ["OBA", "Obadiah", "Авдий", "ot"], ["JON", "Jonah", "Йона", "ot"], ["MIC", "Micah", "Михей", "ot"],
  ["NAH", "Nahum", "Наум", "ot"], ["HAB", "Habakkuk", "Авакум", "ot"], ["ZEP", "Zephaniah", "Софония", "ot"],
  ["HAG", "Haggai", "Агей", "ot"], ["ZEC", "Zechariah", "Захария", "ot"], ["MAL", "Malachi", "Малахия", "ot"],
  ["TOB", "Tobit", "Товит", "dc"], ["JDT", "Judith", "Юдит", "dc"], ["WIS", "Wisdom of Solomon", "Премъдрост Соломонова", "dc"],
  ["SIR", "Sirach", "Сирах", "dc"], ["BAR", "Baruch", "Варух", "dc"], ["1MA", "1 Maccabees", "1 Макавейска", "dc"],
  ["2MA", "2 Maccabees", "2 Макавейска", "dc"], ["3MA", "3 Maccabees", "3 Макавейска", "dc"], ["1ES", "1 Esdras", "2 Ездра", "dc"],
  ["4ES", "2 Esdras", "3 Ездра", "dc"], ["PRM", "Prayer of Manasseh", "Молитвата на Манасия", "dc"], ["PSX", "Psalm 151", "Псалом 151", "dc"],
  ["4MA", "4 Maccabees", "4 Макавейска", "dc"],
  ["MAT", "Matthew", "Матей", "nt"], ["MAR", "Mark", "Марк", "nt"], ["LUK", "Luke", "Лука", "nt"],
  ["JOH", "John", "Йоан", "nt"], ["ACT", "Acts", "Деяния на апостолите", "nt"], ["ROM", "Romans", "Римляни", "nt"],
  ["1CO", "1 Corinthians", "1 Коринтяни", "nt"], ["2CO", "2 Corinthians", "2 Коринтяни", "nt"], ["GAL", "Galatians", "Галатяни", "nt"],
  ["EPH", "Ephesians", "Ефесяни", "nt"], ["PHI", "Philippians", "Филипяни", "nt"], ["COL", "Colossians", "Колосяни", "nt"],
  ["1TH", "1 Thessalonians", "1 Солунци", "nt"], ["2TH", "2 Thessalonians", "2 Солунци", "nt"], ["1TI", "1 Timothy", "1 Тимотей", "nt"],
  ["2TI", "2 Timothy", "2 Тимотей", "nt"], ["TIT", "Titus", "Тит", "nt"], ["PHM", "Philemon", "Филимон", "nt"],
  ["HEB", "Hebrews", "Евреи", "nt"], ["JAM", "James", "Яков", "nt"], ["1PE", "1 Peter", "1 Петрово", "nt"],
  ["2PE", "2 Peter", "2 Петрово", "nt"], ["1JO", "1 John", "1 Йоаново", "nt"], ["2JO", "2 John", "2 Йоаново", "nt"],
  ["3JO", "3 John", "3 Йоаново", "nt"], ["JUD", "Jude", "Юда", "nt"], ["REV", "Revelation", "Откровение", "nt"],
];

/* ───── Bible text, one file per book ───── */
const text = new Map(); // code -> Map(chapter -> [[verse, text]])
for (const line of readFileSync(src, "utf8").split(/\r?\n/)) {
  const m = /^([1-4A-Z]{3}) (\d+):(\d+) (.*)$/.exec(line);
  if (!m) continue;
  const [, code, ch, v, t] = m;
  if (!text.has(code)) text.set(code, new Map());
  const book = text.get(code);
  if (!book.has(+ch)) book.set(+ch, []);
  book.get(+ch).push([+v, t.trim()]);
}

const out = new URL("../public/bible/web/", import.meta.url);
mkdirSync(out, { recursive: true });
const index = [];
let verses = 0;
for (const [code, en, bg, section] of BOOKS) {
  const book = text.get(code);
  if (!book) throw new Error("Missing book " + code);
  const chapters = [...book.keys()].sort((a, b) => a - b).map((c) => book.get(c));
  chapters.forEach((c) => (verses += c.length));
  writeFileSync(new URL(`${code}.json`, out), JSON.stringify({ code, chapters }));
  index.push({ code, en, bg, section, chapters: chapters.length });
}
writeFileSync(new URL("index.json", out), JSON.stringify(index));
console.log(`${index.length} books, ${verses} verses`);

/* ───── the person's fasting verses (NIV) ───── */
const NAMES = Object.fromEntries(BOOKS.map(([code, en]) => [en, code]));
NAMES["Psalm"] = "PSA";
const passages = [];
let cur = null;
for (const raw of readFileSync(new URL("../Bible Verses About Fasting.txt", import.meta.url), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  const ref = /^((?:[1-3] )?[A-Za-z]+(?: [A-Za-z]+)*) (\d+):(\d+)(?:-(\d+))?$/.exec(line);
  if (ref) {
    if (!NAMES[ref[1]]) throw new Error("Unknown book in verses file: " + ref[1]);
    cur = { ref: line, book: ref[1], code: NAMES[ref[1]], chapter: +ref[2], verses: [] };
    passages.push(cur);
    continue;
  }
  const v = /^(\d+)\s+(.*)$/.exec(line);
  if (!v || !cur) throw new Error("Unexpected line: " + line);
  cur.verses.push({ n: +v[1], t: v[2] });
}
writeFileSync(new URL("../src/lib/fasting-verses.json", import.meta.url), JSON.stringify(passages.map(({ ref, code, chapter, verses }) => ({ ref, code, chapter, verses }))));

// Short verses for the morning notification: about fasting, readable on their own
// (start a sentence, don't stop mid-sentence) and short enough for a phone notification.
const seen = new Set();
const short = [];
for (const p of passages)
  for (const v of p.verses) {
    let t = v.t.replace(/\s+/g, " ").trim().replace(/;$/, ".");
    const ref = `${p.book} ${p.chapter}:${v.n}`;
    const aboutFasting = /\bfast|bread alone|choice food/i.test(t);
    if (!aboutFasting || t.length > 170 || seen.has(ref) || !/^[“"‘(A-Z]/.test(t) || /[,:—-]$/.test(t)) continue;
    seen.add(ref);
    short.push({ ref, t });
  }
mkdirSync(new URL("../supabase/functions/daily-verse/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../supabase/functions/daily-verse/verses.ts", import.meta.url),
  `// Generated by scripts/build-bible.mjs from "Bible Verses About Fasting.txt" (NIV).\n` +
    `// Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.\n` +
    `export const VERSES: { ref: string; t: string }[] = ${JSON.stringify(short, null, 1)};\n`,
);
console.log(`${passages.length} fasting passages, ${short.length} short verses for notifications`);
for (const s of short) console.log(" ", s.ref.padEnd(18), s.t.length, s.t.slice(0, 70));
