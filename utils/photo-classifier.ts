/**
 * Photo Classifier
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Classifies restaurant photos as "menu" or "food/ambiance" using Google
 * Cloud Vision OCR. Menu pages have dense text; food/ambiance photos don't.
 *
 * Results are cached per-URL in AsyncStorage so subsequent renders are
 * instant and we don't burn Vision API quota re-classifying the same photo.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// Bump the cache key whenever the thresholds change so old classifications
// made with looser rules get re-evaluated.
const CACHE_KEY = "photo_classification_v2";
// A real menu has dense text — many words, many lines, lots of characters.
// A single sign, logo, or storefront photo has a handful of words and should
// NOT be classified as a menu.
const MENU_MIN_CHARS = 250; // raw character count (whitespace stripped)
const MENU_MIN_WORDS = 40;  // distinct word tokens
const MENU_MIN_LINES = 8;   // menus are multi-line; signs/logos are 1–3 lines
const BATCH_SIZE = 16; // Vision API batchAnnotate max

type Classification = "menu" | "food" | "unknown";
type ClassificationMap = Record<string, Classification>;

let memoryCache: ClassificationMap | null = null;

async function loadCache(): Promise<ClassificationMap> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    memoryCache = raw ? (JSON.parse(raw) as ClassificationMap) : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

async function saveCache(cache: ClassificationMap) {
  memoryCache = cache;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best effort
  }
}

async function classifyBatchViaVision(
  urls: string[],
  apiKey: string
): Promise<Record<string, Classification>> {
  if (!urls.length) return {};

  const body = {
    requests: urls.map((uri) => ({
      image: { source: { imageUri: uri } },
      features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
    })),
  };

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      console.warn("[photo-classifier] Vision API error:", res.status);
      return Object.fromEntries(urls.map((u) => [u, "unknown"] as const));
    }
    const json = (await res.json()) as any;
    const responses = json?.responses || [];
    const out: Record<string, Classification> = {};
    urls.forEach((url, i) => {
      const r = responses[i];
      if (!r || r.error) {
        out[url] = "unknown";
        return;
      }
      const text: string =
        r?.fullTextAnnotation?.text ||
        r?.textAnnotations?.[0]?.description ||
        "";
      const charCount = text.replace(/\s+/g, "").length;
      const wordCount = text.split(/\s+/).filter((w) => w.length > 1).length;
      const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
      // ALL three thresholds must be met — prevents a single sign or logo
      // with a few chunky words from being misclassified as a menu.
      const looksLikeMenu =
        charCount >= MENU_MIN_CHARS &&
        wordCount >= MENU_MIN_WORDS &&
        lineCount >= MENU_MIN_LINES;
      out[url] = looksLikeMenu ? "menu" : "food";
    });
    return out;
  } catch (e) {
    console.warn("[photo-classifier] Vision fetch failed:", e);
    return Object.fromEntries(urls.map((u) => [u, "unknown"] as const));
  }
}

export interface ClassifiedPhotos {
  foodPhotos: string[]; // photos without menu-like text (for photo carousel + hero)
  menuPhotos: string[]; // photos detected as menu pages (up to 5)
  heroPhoto: string | undefined; // best choice for single restaurant image
  loading: boolean;
}

/**
 * Classify a list of photo URLs. Uses cache for known URLs and calls
 * Vision API (in batches) for unknown ones. Returns food/menu splits.
 *
 * onProgress fires whenever the classification state updates so the UI can
 * render progressively (cached results first, then Vision results).
 */
export async function classifyPhotos(
  urls: string[],
  apiKey: string | undefined,
  onProgress?: (result: Omit<ClassifiedPhotos, "loading">) => void
): Promise<Omit<ClassifiedPhotos, "loading">> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (!unique.length) {
    return { foodPhotos: [], menuPhotos: [], heroPhoto: undefined };
  }

  const cache = await loadCache();

  // If there's no API key, pass through with unknown → food
  if (!apiKey) {
    return buildResult(unique, Object.fromEntries(unique.map((u) => [u, "food"])));
  }

  // Emit cached result immediately so UI can paint
  const cachedSnapshot: ClassificationMap = {};
  unique.forEach((u) => {
    cachedSnapshot[u] = cache[u] || "unknown";
  });
  onProgress?.(buildResult(unique, cachedSnapshot));

  // Find URLs we don't know yet
  const needClassify = unique.filter((u) => !cache[u]);
  if (!needClassify.length) {
    return buildResult(unique, cache);
  }

  // Batch through Vision API
  for (let i = 0; i < needClassify.length; i += BATCH_SIZE) {
    const batch = needClassify.slice(i, i + BATCH_SIZE);
    const results = await classifyBatchViaVision(batch, apiKey);
    for (const [url, cls] of Object.entries(results)) {
      // Don't cache "unknown" — we'll want to retry those on next load
      if (cls !== "unknown") cache[url] = cls;
    }
    // Emit progress with whatever we have so far
    const snapshot: ClassificationMap = {};
    unique.forEach((u) => {
      snapshot[u] = cache[u] || results[u] || "unknown";
    });
    onProgress?.(buildResult(unique, snapshot));
  }

  await saveCache(cache);
  return buildResult(unique, cache);
}

function buildResult(
  orderedUrls: string[],
  classifications: ClassificationMap
): Omit<ClassifiedPhotos, "loading"> {
  const foodPhotos: string[] = [];
  const menuPhotos: string[] = [];
  for (const url of orderedUrls) {
    const cls = classifications[url];
    if (cls === "menu") {
      menuPhotos.push(url);
    } else {
      // "food" or "unknown" → treat as food (safer default: show in carousel)
      foodPhotos.push(url);
    }
  }
  return {
    foodPhotos,
    menuPhotos: menuPhotos.slice(0, 5),
    heroPhoto: foodPhotos[0] || menuPhotos[0],
  };
}
