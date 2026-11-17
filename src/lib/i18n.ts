export type Lang = "bg" | "en";
export const LANGS: Lang[] = ["bg", "en"];

/** First open: Bulgarian phones get Bulgarian, everything else English */
export function detectLang(): Lang {
  try {
    return (navigator.language || "").toLowerCase().startsWith("bg") ? "bg" : "en";
  } catch {
    return "bg";
  }
}

let current: Lang = "bg";
export const getLang = () => current;
export function setLang(l: Lang) {
  current = l;
  try {
    document.documentElement.lang = l;
  } catch {
    /* no document while testing */
  }
}

/** Pick the string for the current language */
export const tr = (bg: string, en: string) => (current === "en" ? en : bg);

/** A table that reads from the current language each time it is indexed */
export function bi<T extends object>(bg: T, en: T): T {
  return new Proxy(bg, {
    get: (_t, k) => Reflect.get(current === "en" ? en : bg, k),
  });
}

export const locale = () => (current === "en" ? "en-GB" : "bg-BG");
