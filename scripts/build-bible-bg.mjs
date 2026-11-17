// Builds the Bulgarian Bible for the reader: the Synodal edition of the Bulgarian Orthodox Church
// (Holy Synod, Sofia 1992), as published for free use by blagodarya.com/bible.
//   node scripts/build-bible-bg.mjs <Bulgarian_Orthodox_Bible.json> <bulgarian_orthodox_bible.txt>   (both from blagodarya.com/bible)
// The site asks that the meaning and content of the text are not changed, so verses are copied as they are
// (only surrounding whitespace is trimmed).
// Writes public/bible/bg/<CODE>.json (one file per book) and public/bible/bg/index.json,
// src/lib/fasting-verses-bg.json (the fasting passages in this text) and
// supabase/functions/daily-verse/verses-bg.ts (the notification verses in this text).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("Pass the path to Bulgarian_Orthodox_Bible.json");
const data = JSON.parse(readFileSync(src, "utf8"));

// In the order of the Synodal edition: [code, English, Bulgarian, section, title in the file]
// Codes match the English Bible's where the book is the same, so a place can carry across.
const BOOKS = [
  ["GEN", "Genesis", "Битие", "ot", "Първа книга Моисеева – Битие"],
  ["EXO", "Exodus", "Изход", "ot", "Втора книга Моисеева – Изход"],
  ["LEV", "Leviticus", "Левит", "ot", "Трета книга Моисеева – Левит"],
  ["NUM", "Numbers", "Числа", "ot", "Четвърта книга Моисеева – Числа"],
  ["DEU", "Deuteronomy", "Второзаконие", "ot", "Пета книга Моисеева – Второзаконие"],
  ["JOS", "Joshua", "Иисус Навин", "ot", "Книга Иисус Навин"],
  ["JDG", "Judges", "Съдии", "ot", "Книга Съдии Израилеви"],
  ["RUT", "Ruth", "Рут", "ot", "Книга Рут"],
  ["1SA", "1 Kingdoms", "1 Царства", "ot", "Първа книга Царства"],
  ["2SA", "2 Kingdoms", "2 Царства", "ot", "Втора книга Царства"],
  ["1KI", "3 Kingdoms", "3 Царства", "ot", "Трета книга Царства"],
  ["2KI", "4 Kingdoms", "4 Царства", "ot", "Четвърта книга Царства"],
  ["1CH", "1 Chronicles", "1 Паралипоменон", "ot", "Първа книга Паралипоменон"],
  ["2CH", "2 Chronicles", "2 Паралипоменон", "ot", "Втора книга Паралипоменон"],
  ["EZR", "1 Ezra", "1 Ездра", "ot", "Първа книга на Ездра"],
  ["NEH", "Nehemiah", "Неемия", "ot", "Книга на Неемия"],
  ["1ES", "2 Ezra", "2 Ездра", "dc", "Втора книга на Ездра"],
  ["TOB", "Tobit", "Товит", "dc", "Книга на Товита"],
  ["JDT", "Judith", "Иудит", "dc", "Книга Иудит"],
  ["EST", "Esther", "Естир", "ot", "Книга Естир"],
  ["JOB", "Job", "Иов", "ot", "Книга на Иова"],
  ["PSA", "Psalms", "Псалми", "ot", "Псалтир"],
  ["PRO", "Proverbs", "Притчи", "ot", "Книга Притчи Соломонови"],
  ["ECC", "Ecclesiastes", "Еклисиаст", "ot", "Книга на Еклисиаста или Проповедника"],
  ["SOL", "Song of Songs", "Песен на песните", "ot", "Книга Песен на Песните, от Соломона"],
  ["WIS", "Wisdom of Solomon", "Премъдрост Соломонова", "dc", "Книга Премъдрост Соломонова"],
  ["SIR", "Sirach", "Сирах", "dc", "Книга Премъдрост на Иисуса, син Сирахов"],
  ["ISA", "Isaiah", "Исаия", "ot", "Книга на пророк Исаия"],
  ["JER", "Jeremiah", "Иеремия", "ot", "Книга на пророк Иеремия"],
  ["LAM", "Lamentations", "Плач Иеремиев", "ot", "Книга Плач Иеремиев"],
  ["LJE", "Letter of Jeremiah", "Послание на Иеремия", "dc", "Послание на Иеремия"],
  ["BAR", "Baruch", "Варух", "dc", "Книга на пророк Варуха"],
  ["EZE", "Ezekiel", "Иезекиил", "ot", "Книга на пророк Иезекииля"],
  ["DAN", "Daniel", "Даниил", "ot", "Книга на пророк Даниила"],
  ["HOS", "Hosea", "Осия", "ot", "Книга на пророк Осия"],
  ["JOE", "Joel", "Иоил", "ot", "Книга на пророк Иоиля"],
  ["AMO", "Amos", "Амос", "ot", "Книга на пророк Амоса"],
  ["OBA", "Obadiah", "Авдий", "ot", "Книга на пророк Авдий"],
  ["JON", "Jonah", "Иона", "ot", "Книга на пророк Иона"],
  ["MIC", "Micah", "Михей", "ot", "Книга на пророк Михей"],
  ["NAH", "Nahum", "Наум", "ot", "Книга на пророк Наума"],
  ["HAB", "Habakkuk", "Авакум", "ot", "Книга на пророк Авакума"],
  ["ZEP", "Zephaniah", "Софония", "ot", "Книга на пророк Софония"],
  ["HAG", "Haggai", "Агей", "ot", "Книга на пророк Агей"],
  ["ZEC", "Zechariah", "Захария", "ot", "Книга на пророк Захария"],
  ["MAL", "Malachi", "Малахия", "ot", "Книга на пророк Малахия"],
  ["1MA", "1 Maccabees", "1 Макавейска", "dc", "Първа книга Макавейска"],
  ["2MA", "2 Maccabees", "2 Макавейска", "dc", "Втора книга Макавейска"],
  ["3MA", "3 Maccabees", "3 Макавейска", "dc", "Трета книга Макавейска"],
  ["4ES", "3 Ezra", "3 Ездра", "dc", "Трета книга на Ездра"],
  ["MAT", "Matthew", "Матей", "nt", "От Матея свето Евангелие"],
  ["MAR", "Mark", "Марк", "nt", "От Марка свето Евангелие"],
  ["LUK", "Luke", "Лука", "nt", "От Лука свето Евангелие"],
  ["JOH", "John", "Иоан", "nt", "От Иоана свето Евангелие"],
  ["ACT", "Acts", "Деяния на апостолите", "nt", "Деяния на светите Апостоли"],
  ["JAM", "James", "Иаков", "nt", "Съборно послание на св. ап. Иакова"],
  ["1PE", "1 Peter", "1 Петрово", "nt", "Първо съборно послание на св. ап. Петра"],
  ["2PE", "2 Peter", "2 Петрово", "nt", "Второ съборно послание на св. ап. Петра"],
  ["1JO", "1 John", "1 Иоаново", "nt", "Първо съборно послание на св. ап. Иоана Богослова"],
  ["2JO", "2 John", "2 Иоаново", "nt", "Второ съборно послание на св. ап. Иоана Богослова"],
  ["3JO", "3 John", "3 Иоаново", "nt", "Трето съборно послание на св. ап. Иоана Богослова"],
  ["JUD", "Jude", "Иуда", "nt", "Съборно послание на св. ап. Иуда"],
  ["ROM", "Romans", "Римляни", "nt", "Послание на св. ап. Павла до Римляни"],
  ["1CO", "1 Corinthians", "1 Коринтяни", "nt", "Първо послание на св. ап. Павла до Коринтяни"],
  ["2CO", "2 Corinthians", "2 Коринтяни", "nt", "Второ послание на св. ап. Павла до Коринтяни"],
  ["GAL", "Galatians", "Галатяни", "nt", "Послание на св. ап. Павла до Галатяни"],
  ["EPH", "Ephesians", "Ефесяни", "nt", "Послание на св. ап. Павла до Ефесяни"],
  ["PHI", "Philippians", "Филипяни", "nt", "Послание на св. ап. Павла до Филипяни"],
  ["COL", "Colossians", "Колосяни", "nt", "Послание на св. ап. Павла до Колосяни"],
  ["1TH", "1 Thessalonians", "1 Солуняни", "nt", "Първо послание на св. ап. Павла до Солуняни"],
  ["2TH", "2 Thessalonians", "2 Солуняни", "nt", "Второ послание на св. ап. Павла до Солуняни"],
  ["1TI", "1 Timothy", "1 Тимотей", "nt", "Първо послание на св. ап. Павла до Тимотея"],
  ["2TI", "2 Timothy", "2 Тимотей", "nt", "Второ послание на св. ап. Павла до Тимотея"],
  ["TIT", "Titus", "Тит", "nt", "Послание на св. ап. Павла до Тита"],
  ["PHM", "Philemon", "Филимон", "nt", "Послание на св. ап. Павла до Филимона"],
  ["HEB", "Hebrews", "Евреи", "nt", "Послание на св. ап. Павла до Евреите"],
  ["REV", "Revelation", "Откровение", "nt", "Откровение на св. Иоана Богослова"],
];

/* ───── verse numbering repairs ─────
   The JSON was made from the site's plain-text edition and carries some numbering slips. Only the numbering
   is repaired; words are never changed. Text the JSON dropped is taken from the same site's .txt file. */
const txtPath = process.argv[3];
if (!txtPath) throw new Error("Pass the path to bulgarian_orthodox_bible.txt as the second argument");
const txt = readFileSync(txtPath, "utf8").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim());
const txtLine = (re) => {
  const hits = txt.filter((l) => re.test(l));
  if (hits.length !== 1) throw new Error(`Expected one line matching ${re}, found ${hits.length}`);
  return hits[0];
};

/** "31. text; 32. more" in one verse → two verses (only when the inner number is the next verse) */
function splitRunTogether(ch) {
  const out = [];
  for (const [n, t] of ch) {
    let cur = n;
    let rest = t;
    for (;;) {
      const m = new RegExp(`^(.*?[;,.:!?)\\s])\\s*${cur + 1}\\. (.+)$`, "s").exec(rest);
      if (!m) break;
      out.push([cur, m[1].trim()]);
      cur += 1;
      rest = m[2];
    }
    out.push([cur, rest.trim()]);
  }
  return out;
}

/** One-off number typos (17, 118, 19 → 18) and a swapped pair (20, 22, 21, 23 → 21, 22) */
function renumber(ch) {
  const c = ch.map((v) => [...v]);
  for (let k = 1; k < c.length; k++) {
    const prev = c[k - 1][0];
    const next = c[k + 1]?.[0];
    if (c[k][0] === prev + 2 && next === prev + 1) {
      c[k][0] = prev + 1;
      c[k + 1][0] = prev + 2;
    } else if (c[k][0] !== prev + 1 && c[k][0] !== prev && next === prev + 2) c[k][0] = prev + 1;
  }
  return c;
}

/** A psalm title or an opening passage numbered like the verse after it → one verse, as in the printed Bible */
function mergeRepeated(ch) {
  const out = [];
  for (const [n, t] of ch) {
    const last = out.at(-1);
    if (last && last[0] === n) last[1] = `${last[1]} ${t}`;
    else out.push([n, t]);
  }
  return out;
}

const FIXES = {
  // heading lines in the .txt that are the chapter's first verse (or open it)
  "PRO 10": (c) => prependFromHeading(c, /^ГЛАВА 10\. Притчи Соломонови\.$/),
  "PRO 25": (c) => prependFromHeading(c, /^ГЛАВА 25\. И това са притчи Соломонови/),
  "PRO 30": (c) => prependFromHeading(c, /^ГЛАВА 30\. Думи на Иакеевия син Агура/),
  "PRO 31": (c) => prependFromHeading(c, /^ГЛАВА 31\. Думи на цар Лемуила/),
  "SIR 51": (c) => prependFromHeading(c, /^ГЛАВА 51\. Молитва на Иисуса, син Сирахов\.$/),
  // the line carries its own "1." inside the bracket; the number goes, the words stay
  "JOB 38": (c) => (c[0][0] === 1 ? c : [[1, txtLine(/^\(1\. Когато Елиуй престана да говори,\)/).replace("(1. ", "(")], ...c]),
  // psalm titles with a "2." inside: verse 2 is the rest of the title line, verse 3 the line after it
  "PSA 50": (c) => titleVerse2(c, 50),
  "PSA 51": (c) => titleVerse2(c, 51),
  "PSA 53": (c) => titleVerse2(c, 53),
  "PSA 59": (c) => titleVerse2(c, 59),
};
function prependFromHeading(c, re) {
  const t = txtLine(re).replace(/^ГЛАВА \d+\. /, "");
  return c[0][0] === 1 ? [[1, `${t} ${c[0][1]}`], ...c.slice(1)] : [[1, t], ...c];
}
function titleVerse2(c, ps) {
  const v2 = txtLine(new RegExp(`^ПСАЛОМ ${ps}\\. `)).split(" 2. ")[1];
  const i = c.findIndex(([n]) => n === 2);
  if (!v2 || i < 0 || c[i + 1]?.[0] !== 4 || !c[i][1].startsWith(v2)) throw new Error(`Psalm ${ps}: unexpected shape`);
  return [...c.slice(0, i), [2, v2], [3, c[i][1].slice(v2.length).trim()], ...c.slice(i + 1)];
}

/** Psalm 151 follows Psalm 150 in the same verse; it becomes its own chapter, as in Orthodox Psalters */
function splitPsalm151(chapters) {
  const p150 = chapters[149];
  const at = p150.findIndex(([, t]) => t.includes("(Псалом Давидов, на едноборството с Голиата"));
  if (at < 0 || chapters.length !== 150) throw new Error("Psalm 151 not where expected");
  const [n, t] = p150[at];
  const cut = t.indexOf("(Псалом Давидов, на едноборството");
  const head = [...p150.slice(0, at), [n, t.slice(0, cut).trim()]];
  // " *" pointed at a footnote the JSON leaves out
  const p151 = [[1, t.slice(cut).trim().replace(" *.", ".")], ...p150.slice(at + 1)];
  if (p151.some(([v], i) => v !== i + 1)) throw new Error("Psalm 151 numbering");
  return [...chapters.slice(0, 149), head, p151];
}

/* ───── Bible text, one file per book ───── */
const byTitle = new Map();
for (const t of data.testaments) for (const b of t.books) byTitle.set(b.name, b);
if (byTitle.size !== BOOKS.length) throw new Error(`File has ${byTitle.size} books, list has ${BOOKS.length}`);

const out = new URL("../public/bible/bg/", import.meta.url);
mkdirSync(out, { recursive: true });
const index = [];
const text = new Map(); // code -> chapters
let verses = 0;
const odd = [];
for (const [code, en, bg, section, title] of BOOKS) {
  const b = byTitle.get(title);
  if (!b) throw new Error("Missing book " + title);
  let chapters = [];
  for (const c of b.chapters) {
    if (c.number !== chapters.length + 1) throw new Error(`${code}: chapter ${c.number} out of order`);
    let ch = c.verses.map((v) => [v.number, String(v.text).trim()]).filter(([, t]) => t);
    ch = mergeRepeated(renumber(splitRunTogether(ch)));
    const fix = FIXES[`${code} ${c.number}`];
    if (fix) ch = mergeRepeated(fix(ch));
    chapters.push(ch);
  }
  if (code === "PSA") chapters = splitPsalm151(chapters);
  chapters.forEach((c, i) => {
    verses += c.length;
    c.forEach(([n], k) => {
      if (n !== (k ? c[k - 1][0] + 1 : 1)) odd.push(`${code} ${i + 1}:${n}`);
    });
  });
  text.set(code, chapters);
  writeFileSync(new URL(`${code}.json`, out), JSON.stringify({ code, chapters }));
  index.push({ code, en, bg, section, chapters: chapters.length });
}

// The Prayer of Manasseh is printed after 2 Chronicles as one paragraph; the JSON leaves it out.
{
  const at = txt.findIndex((l) => l.startsWith("Молитва на иудейския цар Манасия, когато е бил в плен във Вавилон"));
  const body = txt.slice(at + 1, at + 6).find((l) => l.startsWith("Господи, Вседържителю, Боже на отците ни"));
  if (at < 0 || !body) throw new Error("Prayer of Manasseh not found");
  const chapters = [[[1, body]]];
  verses += 1;
  text.set("PRM", chapters);
  writeFileSync(new URL("PRM.json", out), JSON.stringify({ code: "PRM", chapters }));
  index.splice(index.findIndex((b) => b.code === "2CH") + 1, 0, { code: "PRM", en: "Prayer of Manasseh", bg: "Молитвата на Манасия", section: "dc", chapters: 1 });
}
writeFileSync(new URL("index.json", out), JSON.stringify(index));
console.log(`${index.length} books, ${verses} verses`);
console.log(`verse numbers still out of sequence (as printed in the source): ${odd.join(", ") || "none"}`);

// Nothing lost: every line of the .txt edition (minus headings and verse numbers) is somewhere in the output
{
  const all = [...text.values()].flat(3).filter((x) => typeof x === "string").join(" ").replace(/\s+/g, " ");
  const missing = [];
  for (const line of txt) {
    if (!line || line.startsWith("*") || !/\p{Ll}/u.test(line)) continue; // blank lines, all-caps titles, translators' footnotes
    const body = line.replace(/^(ГЛАВА|ПСАЛОМ) \d+\.\s*/, "");
    for (const piece of body.split(/(?:^|\s)\(?\d+\.\s/)) {
      const p = piece.replace(/\s+/g, " ").trim();
      if (p.length > 12 && !all.includes(p)) missing.push(p.slice(0, 90));
    }
  }
  console.log(`.txt lines not found in the output: ${missing.length}`);
  for (const m of missing.slice(0, 25)) console.log("   ", m);
}

/* ───── the fasting passages, in this text ───── */
// The Psalms are numbered as in the Septuagint, and some psalms count the title as verse 1.
// [book, chapter] in the English list -> [chapter here, verse offset]
const MOVED = { "PSA 35": [34, 0], "PSA 69": [68, 1] };
const names = Object.fromEntries(BOOKS.map(([code, , bg]) => [code, bg]));
const verseRef = (code, ch, a, b) => `${names[code]} ${ch}:${a}${b && b !== a ? "–" + b : ""}`;
const place = (code, chapter, n) => {
  const [ch, dv] = MOVED[`${code} ${chapter}`] ?? [chapter, 0];
  return { ch, n: n + dv };
};
const verseText = (code, ch, n) => {
  const v = text.get(code)?.[ch - 1]?.find(([k]) => k === n);
  if (!v) throw new Error(`No verse ${code} ${ch}:${n}`);
  return v[1];
};

const fasting = JSON.parse(readFileSync(new URL("../src/lib/fasting-verses.json", import.meta.url), "utf8"));
const bgPassages = fasting.map((p) => {
  const vs = p.verses.map((v) => {
    const at = place(p.code, p.chapter, v.n);
    return { ch: at.ch, n: at.n, t: verseText(p.code, at.ch, at.n) };
  });
  const ch = vs[0].ch;
  return { ref: verseRef(p.code, ch, vs[0].n, vs.at(-1).n), code: p.code, chapter: ch, verses: vs.map(({ n, t }) => ({ n, t })) };
});
writeFileSync(new URL("../src/lib/fasting-verses-bg.json", import.meta.url), JSON.stringify(bgPassages));
for (const p of bgPassages) console.log(p.ref.padEnd(22), p.verses.map((v) => v.t).join(" ").slice(0, 110));

/* ───── the notification verses, in this text (same order, so both languages rotate together) ───── */
const versesTs = readFileSync(new URL("../supabase/functions/daily-verse/verses.ts", import.meta.url), "utf8");
const short = JSON.parse(versesTs.slice(versesTs.indexOf("= [") + 2, versesTs.lastIndexOf("]") + 1));
const enCode = Object.fromEntries(BOOKS.map(([code, en]) => [en, code]));
Object.assign(enCode, { Psalm: "PSA", "1 Samuel": "1SA", "2 Samuel": "2SA", "1 Kings": "1KI", "2 Kings": "2KI", Ezra: "EZR" });
const bgShort = short.map(({ ref }) => {
  const m = /^(.+) (\d+):(\d+)$/.exec(ref);
  const code = enCode[m[1]];
  if (!code) throw new Error("Unknown book " + m[1]);
  const at = place(code, +m[2], +m[3]);
  // quoted on its own in a notification: capital first letter, full stop at the end (as with the English list)
  const t = verseText(code, at.ch, at.n).replace(/^\p{Ll}/u, (c) => c.toUpperCase()).replace(/[;,:]$/, ".");
  return { ref: verseRef(code, at.ch, at.n), t };
});
writeFileSync(
  new URL("../supabase/functions/daily-verse/verses-bg.ts", import.meta.url),
  `// Generated by scripts/build-bible-bg.mjs: the verses in verses.ts, in the Bulgarian Synodal Bible\n` +
    `// (Holy Synod of the Bulgarian Orthodox Church, Sofia 1992), same order.\n` +
    `export const VERSES_BG: { ref: string; t: string }[] = ${JSON.stringify(bgShort, null, 1)};\n`,
);
console.log("\nnotification verses:");
for (const s of bgShort) console.log(" ", s.ref.padEnd(18), s.t.length, s.t);
