import type { Food, Kind } from "./types";
import { getLang, tr } from "./i18n";
import { uid } from "./nutrition";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/** Read a barcode from a photo. Uses the browser's detector when present, else ZXing (WebAssembly). */
export async function decodeBarcode(file: Blob): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
  if (BD) {
    try {
      const supported: string[] = (await BD.getSupportedFormats?.()) ?? FORMATS;
      const det = new BD({ formats: FORMATS.filter((f) => supported.includes(f)) });
      const bmp = await createImageBitmap(file);
      const found = await det.detect(bmp);
      if (found?.[0]?.rawValue) return String(found[0].rawValue);
    } catch {
      /* fall through to ZXing */
    }
  }
  const zx = await import("zxing-wasm/reader");
  await ensureZXing(zx);
  const res = await zx.readBarcodes(file, {
    formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 1,
  });
  const ok = res.find((r) => r.isValid && r.text);
  return ok ? ok.text : null;
}

let zxReady: Promise<unknown> | null = null;
function ensureZXing(zx: typeof import("zxing-wasm/reader")) {
  if (!zxReady) {
    // The wasm ships beside the page, so no third-party fetch is needed.
    zxReady = fetch(new URL("zxing_reader.wasm", document.baseURI))
      .then((r) => {
        if (!r.ok) throw new Error("wasm " + r.status);
        return r.arrayBuffer();
      })
      .then((wasmBinary) => zx.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true }))
      .catch((e) => {
        zxReady = null;
        throw e;
      });
  }
  return zxReady;
}

/** Open Food Facts lookup. Inside the Claude artifact the network is closed, so this returns null there. */
export async function lookupOpenFoodFacts(code: string): Promise<Food | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_bg,product_name_en,brands,nutriments,serving_quantity,ingredients_analysis_tags,categories_tags,ingredients_text,allergens_tags`,
      { signal: ctl.signal },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.product;
    if (!p) return null;
    const n = p.nutriments ?? {};
    const kcal = Number(n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0)) || 0;
    const fat = Number(n.fat_100g) || 0;
    const tags: string[] = [...(p.ingredients_analysis_tags ?? []), ...(p.categories_tags ?? [])];
    const allergens: string[] = p.allergens_tags ?? [];
    const ingr = String(p.ingredients_text ?? "").toLowerCase();
    const animal =
      tags.includes("en:non-vegan") ||
      allergens.some((a) => /en:(milk|eggs)/.test(a)) ||
      /мляко|млечн|суроватк|яйц|сирене|кашкавал|milk|whey|lactose|egg|cheese|butter|gelatin|желатин/.test(ingr);
    let kind: Kind = "vegan";
    if (tags.some((t) => /seafood|crustacean|mollus|shrimp/.test(t)) || allergens.some((a) => /crustaceans|molluscs/.test(a))) kind = animal ? "animal" : "seafood";
    else if (tags.some((t) => /fishes|fish-/.test(t)) || allergens.includes("en:fish")) kind = animal ? "animal" : "fish";
    else if (animal) kind = "animal";
    else if (fat > 2 || /oil|олио|масло|мазнин/.test(ingr)) kind = "oil";
    const serving = Number(p.serving_quantity) || undefined;
    return {
      id: uid(),
      name: String((getLang() === "en" ? p.product_name_en : p.product_name_bg) || p.product_name || tr("Продукт", "Product")).trim(),
      brand: String(p.brands ?? "").split(",")[0].trim() || undefined,
      barcode: code,
      kind,
      per100: { kcal, p: Number(n.proteins_100g) || 0, c: Number(n.carbohydrates_100g) || 0, f: fat },
      units: serving ? { serving } : {},
      source: "barcode",
      createdAt: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ───────── live camera ───────── */

let detector: { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> } | null | undefined;
async function getDetector() {
  if (detector !== undefined) return detector;
  const BD = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
  try {
    const supported: string[] = BD ? (await BD.getSupportedFormats?.()) ?? FORMATS : [];
    const formats = FORMATS.filter((f) => supported.includes(f));
    detector = BD && formats.length ? new BD({ formats }) : null;
  } catch {
    detector = null;
  }
  return detector;
}

/** Reads one video frame (already cropped to the frame cut-out). Fast settings, called several times a second. */
export async function decodeFrame(canvas: HTMLCanvasElement): Promise<string | null> {
  const det = await getDetector();
  if (det) {
    try {
      const found = await det.detect(canvas);
      if (found?.[0]?.rawValue) return String(found[0].rawValue);
      return null;
    } catch {
      detector = null;
    }
  }
  const zx = await import("zxing-wasm/reader");
  await ensureZXing(zx);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const res = await zx.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
    formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"],
    tryHarder: true,
    tryRotate: false,
    tryInvert: false,
    tryDownscale: true,
    maxNumberOfSymbols: 1,
  });
  const ok = res.find((r) => r.isValid && r.text);
  return ok ? ok.text : null;
}

let liveRefused = false;
export const markLiveRefused = () => {
  liveRefused = true;
};
/**
 * Whether a live camera view can be offered. Known synchronously so the tap that
 * opens the camera stays a user gesture: inside the Claude artifact the camera is
 * blocked, so the button opens the phone's own camera instead.
 */
export function liveCameraLikely(): boolean {
  if (liveRefused || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return false;
  const policy = (document as any).permissionsPolicy ?? (document as any).featurePolicy;
  if (policy?.allowsFeature) return !!policy.allowsFeature("camera");
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}
