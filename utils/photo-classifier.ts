/**
 * Photo Classifier
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Classifies restaurant photos as "menu" or "food/ambiance" by calling
 * the worker's /api/vision/classify proxy. The Google Vision API key
 * lives ONLY on the server — it is never shipped to the client.
 *
 * Results are cached per-URL in AsyncStorage so subsequent renders are
 * instant and we don't re-hit the server for the same photo. The worker
 * side also caches per URL in KV so cross-device reuse is free.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

// Bump the cache key whenever the thresholds change so old classifications
// made with looser rules get re-evaluated.
const CACHE_KEY = "photo_classification_v3";
const BATCH_SIZE = 16; // Keep batches bounded so the worker stays fast

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

async function classifyBatchViaWorker(
  urls: string[]
): Promise<Record<string, Classification>> {
  if (!urls.length) return {};

  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/vision/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
      // Abort if the server takes too long
      signal: typeof AbortSignal !== "undefined" && (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(12000)
        : undefined,
    });
    if (!res.ok) {
      console.warn("[photo-classifier] worker error:", res.status);
      return Object.fromEntries(urls.map((u) => [u, "unknown"] as const));
    }
    const json = (await res.json()) as {
      results?: Record<string, "menu" | "food">;
      error?: string;
    };
    const out: Record<string, Classification> = {};
    urls.forEach((url) => {
      const label = json.results?.[url];
      out[url] = label === "menu" || label === "food" ? label : "unknown";
    });
    return out;
  } catch (e) {
    console.warn("[photo-classifier] worker fetch failed:", e);
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
 * Classify a list of photo URLs. Uses AsyncStorage cache for known URLs
 * and calls the worker (which itself caches in KV) for unknown ones.
 *
 * onProgress fires whenever the classification state updates so the UI
 * can render progressively (cached results first, then server results).
 */
export async function classifyPhotos(
  urls: string[],
  onProgress?: (result: Omit<ClassifiedPhotos, "loading">) => void
): Promise<Omit<ClassifiedPhotos, "loading">> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (!unique.length) {
    return { foodPhotos: [], menuPhotos: [], heroPhoto: undefined };
  }

  const cache = await loadCache();

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

  // Batch through the worker
  for (let i = 0; i < needClassify.length; i += BATCH_SIZE) {
    const batch = needClassify.slice(i, i + BATCH_SIZE);
    const results = await classifyBatchViaWorker(batch);
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
