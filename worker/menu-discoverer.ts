/**
 * Menu Discoverer
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Resolves a restaurant's actual menu page (and any embedded menu images
 * or PDFs) starting from its homepage. Previously the worker labeled the
 * homepage URL itself as the "menu URL" — users tapped "View Full Menu"
 * and got the restaurant's homepage instead of a menu. This module
 * replaces that hack with real discovery:
 *
 *   1. Parse Schema.org JSON-LD on the homepage for `Restaurant.hasMenu`
 *   2. Look for `<a>` tags whose text or href mention "menu"
 *   3. Probe common menu paths (`/menu`, `/menus`, `/our-menu`, …)
 *
 * Once a candidate URL is found, the module:
 *   - Detects PDF menus by Content-Type / extension
 *   - For HTML menu pages, extracts `<img>` URLs filtered to plausible
 *     menu photos (size hints, not obvious icons/logos)
 *
 * SSRF protection: rejects private IPs, loopback, and cloud-metadata
 * endpoints. Caps response size, timeout, and redirect count.
 */

const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 1_500_000; // 1.5 MB — enough for any real menu page
const MAX_IMAGES = 10;
const MIN_IMG_SIZE_HINT = 200;    // px, only used when width/height attrs present

const COMMON_MENU_PATHS = [
  "/menu",
  "/menus",
  "/our-menu",
  "/the-menu",
  "/food",
  "/food-menu",
  "/dinner-menu",
  "/lunch-menu",
  "/menu.html",
  "/menu.pdf",
  "/menus.pdf",
  "/menu/",
  // Widened 2026-05-10 to cover chains that don't use the literal "menu"
  // word in their URL. Real-world examples: In-N-Out (/our-food), Sonic
  // (/menu/full-menu — caught by /menu prefix), McDonald's (/full-menu —
  // also /menu prefix), Five Guys (/menu — already covered), Wendy's
  // (/menu — already covered). The interesting outliers are below.
  "/our-food",
  "/food-and-drink",
  "/eats",
  "/dishes",
  "/order",
  "/order-online",
];

// Filename fragments that almost never indicate a menu image — skip them
// so we don't surface restaurant logos / icons / hero banners as menus.
// Note: matches anywhere in the URL path, so "logo-spacer-x2.png" hits.
const IMG_DENY_FRAGMENTS = [
  "logo",
  "icon",
  "favicon",
  "sprite",
  "social",
  "facebook",
  "instagram",
  "twitter",
  "tripadvisor",
  "yelp",
  "pixel",
  "1x1",
  "spacer",
  "tracking",
  // Added 2026-05-10 after audit caught Chipotle's medallion + common
  // hero / banner / placeholder patterns leaking into the menu carousel.
  "medallion",
  "hero",
  "banner",
  "splash",
  "placeholder",
  "loading",
  "background",
  "mascot",
  "watermark",
  "transparent",
];

export interface MenuDiscoveryResult {
  menuUrl?: string;
  isPdf: boolean;
  images: string[];
  /** How the menuUrl was resolved — kept for telemetry. */
  source?: "schema" | "link" | "path" | "homepage";
}

export const EMPTY_RESULT: MenuDiscoveryResult = {
  isPdf: false,
  images: [],
};

/**
 * Reject hostnames that point at private networks, loopback, or cloud
 * metadata endpoints — these are SSRF risk surfaces. Mirrors the gate
 * used by the vision endpoint but doesn't apply an allowlist, because
 * we genuinely need to fetch arbitrary restaurant websites here.
 */
function isPrivateOrLoopbackHost(host: string): boolean {
  const denyList = new Set([
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",
    "metadata",
  ]);
  if (denyList.has(host)) return true;

  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = +ipv4[1], b = +ipv4[2];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  if (host.includes(":")) {
    const lower = host.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
  }
  return false;
}

function safeParseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isPrivateOrLoopbackHost(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Fetch with timeout + size cap. Returns the response body as text along
 * with the final Content-Type and URL (after redirects). Returns null on
 * timeout / network error / non-2xx / over-size body.
 */
async function safeFetch(
  url: string,
  opts: { acceptPdf?: boolean } = {}
): Promise<{ url: string; contentType: string; text: string; isPdf: boolean } | null> {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodieFinderBot/1.0; +https://sassyconsultingllc.com)",
        "Accept": opts.acceptPdf
          ? "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.1"
          : "text/html,application/xhtml+xml,*/*;q=0.1",
      },
    });
    if (!res.ok) return null;

    const finalUrl = res.url || parsed.toString();
    const finalParsed = safeParseUrl(finalUrl);
    if (!finalParsed) return null;

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const isPdf = ct.includes("application/pdf");
    if (isPdf) {
      // For PDFs we don't read the body — we only need the URL.
      return { url: finalUrl, contentType: ct, text: "", isPdf: true };
    }
    if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("application/xhtml")) {
      return null;
    }

    // Stream the body up to MAX_HTML_BYTES to bound memory.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > MAX_HTML_BYTES) {
        try { await reader.cancel(); } catch { /* best effort */ }
        return null;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { url: finalUrl, contentType: ct, text, isPdf: false };
  } catch {
    return null;
  }
}

/**
 * Look for Schema.org JSON-LD blocks on a page and extract `hasMenu`
 * (which may be a string, an object with `url`, or an array of either).
 */
function extractSchemaMenuUrl(html: string, baseUrl: string): string | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptRe)) {
    const body = match[1].trim();
    if (!body) continue;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    const url = findHasMenu(json, baseUrl);
    if (url) return url;
  }
  return null;
}

function findHasMenu(node: unknown, baseUrl: string): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findHasMenu(item, baseUrl);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const candidate = obj.hasMenu ?? obj.menu;
  if (typeof candidate === "string") {
    return resolveUrl(candidate, baseUrl);
  }
  if (Array.isArray(candidate)) {
    for (const c of candidate) {
      if (typeof c === "string") return resolveUrl(c, baseUrl);
      if (c && typeof c === "object" && typeof (c as any).url === "string") {
        return resolveUrl((c as any).url, baseUrl);
      }
    }
  }
  if (candidate && typeof candidate === "object" && typeof (candidate as any).url === "string") {
    return resolveUrl((candidate as any).url, baseUrl);
  }
  // Recurse into common nested wrappers (`@graph`, etc.).
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && (typeof v === "object" || Array.isArray(v))) {
      const found = findHasMenu(v, baseUrl);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Decode the small set of HTML entities that show up inside URL attribute
 * values. We extract via regex (not an HTML parser), so the values come
 * back with `&amp;` / `&#38;` / `&#x26;` literal in them. Once stored as
 * an image URL and fetched, the server reads `&amp;` as a stray query
 * param named `amp` — breaking every multi-param image URL. Decoding
 * before resolving prevents that.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    });
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(decodeHtmlEntities(href), baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Find an <a> tag whose text or href screams "menu". Returns the first
 * good candidate, prioritising matches in href over matches in text
 * because "menu" can appear as breadcrumb / navigation noise.
 *
 * 2026-05-10: also rejects candidates whose RESOLVED path is the site
 * root, an index file, or one of the obvious SPA stub paths. Chipotle's
 * homepage has `<a href="/home">Menu</a>` because the menu renders
 * client-side on the same SPA route — accepting that and probing
 * https://chipotle.com/home triggers `looksLikeMenu()` (the homepage
 * does have prices) and we end up promising "View Menu Page" while
 * actually opening the homepage. Path-based rejection blocks that.
 */
function extractMenuLink(html: string, baseUrl: string): string | null {
  const anchorRe = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  const byHref: string[] = [];
  const byText: string[] = [];
  for (const match of html.matchAll(anchorRe)) {
    const href = match[2];
    const innerHtml = match[4];
    const innerText = innerHtml.replace(/<[^>]*>/g, "").trim().toLowerCase();
    const hrefLower = href.toLowerCase();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    if (hrefLower.startsWith("mailto:") || hrefLower.startsWith("tel:")) continue;

    const isPdf = hrefLower.endsWith(".pdf") || hrefLower.includes("menu.pdf");
    const hrefHasMenu =
      hrefLower.includes("/menu") ||
      hrefLower.includes("menu.pdf") ||
      hrefLower.endsWith("/menu/") ||
      /[?&](page|pg|s)=menu\b/.test(hrefLower);
    const textHasMenu = /^(menu|menus|view menu|see menu|our menu|food menu|view our menu|full menu)$/i.test(innerText);

    if (isPdf && hrefHasMenu) {
      const resolved = resolveUrl(href, baseUrl);
      if (resolved && isPlausibleMenuTarget(resolved)) return resolved;
    }
    if (hrefHasMenu) byHref.push(href);
    else if (textHasMenu) byText.push(href);
  }

  for (const href of byHref.concat(byText)) {
    const resolved = resolveUrl(href, baseUrl);
    if (resolved && isPlausibleMenuTarget(resolved)) return resolved;
  }
  return null;
}

/**
 * Reject candidate URLs that resolve to the site root, an index file,
 * or a SPA stub like /home. Required because anchor text alone is
 * misleading on SPAs that re-use the homepage route for menu rendering.
 */
function isPlausibleMenuTarget(absoluteUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(absoluteUrl);
  } catch {
    return false;
  }
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  // Empty path / root / common SPA stubs.
  const stubs = new Set([
    "",
    "/index",
    "/index.html",
    "/index.htm",
    "/index.php",
    "/home",
    "/default",
    "/default.aspx",
  ]);
  if (stubs.has(path)) return false;
  // Path must contain "menu", "food", "order", "eats", "dishes" or end in .pdf.
  // This guards against anchors with `<a href="/about">Menu</a>` weirdness.
  if (path.endsWith(".pdf")) return true;
  const hints = ["menu", "food", "order", "eats", "dishes", "dinner", "lunch", "breakfast"];
  return hints.some((h) => path.includes(h));
}

/**
 * Sanity-check that a candidate HTML page actually looks like a menu and
 * not a "404 — not found" or a generic homepage. Heuristic: must contain
 * the word "menu" + at least 3 price-like tokens, OR many list items.
 * Keeps us from accepting `/menu` pages that return 200 OK with a "page
 * not found" body (common on misconfigured WordPress sites).
 */
function looksLikeMenu(html: string): boolean {
  const lower = html.toLowerCase();
  if (!lower.includes("menu")) return false;
  const priceMatches = lower.match(/(?:[\$£€]\s?\d{1,3}(?:[.,]\d{2})?|\b\d{1,3}\.\d{2}\b)/g) || [];
  if (priceMatches.length >= 3) return true;
  const liCount = (lower.match(/<li\b/g) || []).length;
  if (liCount >= 8) return true;
  return false;
}

/**
 * Pull <img> URLs from menu page HTML. Filtered to:
 *   - Absolute URL or resolvable against baseUrl
 *   - Not obvious icons / logos / tracking pixels
 *   - Above MIN_IMG_SIZE_HINT in width/height attrs (when present)
 *   - http(s) only
 *
 * Deduped, capped at MAX_IMAGES.
 */
function extractImages(html: string, baseUrl: string): string[] {
  const imgRe = /<img\b([^>]*)>/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of html.matchAll(imgRe)) {
    if (out.length >= MAX_IMAGES) break;
    const attrs = match[1];
    // Honor srcset > data-src > src so lazy-loaded images aren't missed.
    let src: string | null = null;
    const srcsetMatch = attrs.match(/\bsrcset=["']([^"']+)["']/i);
    if (srcsetMatch) {
      const candidates = srcsetMatch[1]
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (candidates.length) src = candidates[candidates.length - 1];
    }
    if (!src) {
      const dataSrcMatch = attrs.match(/\bdata-src=["']([^"']+)["']/i);
      if (dataSrcMatch) src = dataSrcMatch[1];
    }
    if (!src) {
      const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
      if (srcMatch) src = srcMatch[1];
    }
    if (!src) continue;

    const resolved = resolveUrl(src, baseUrl);
    if (!resolved) continue;
    const parsed = safeParseUrl(resolved);
    if (!parsed) continue;

    const lowerUrl = resolved.toLowerCase();
    if (IMG_DENY_FRAGMENTS.some((frag) => lowerUrl.includes(frag))) continue;

    // Honor width/height hints only when BOTH are present and BOTH
    // below threshold, to avoid false-rejecting menus that omit them.
    const widthMatch = attrs.match(/\bwidth=["']?(\d+)["']?/i);
    const heightMatch = attrs.match(/\bheight=["']?(\d+)["']?/i);
    if (widthMatch && heightMatch) {
      const w = parseInt(widthMatch[1], 10);
      const h = parseInt(heightMatch[1], 10);
      if (w < MIN_IMG_SIZE_HINT && h < MIN_IMG_SIZE_HINT) continue;
    }

    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/**
 * Inspect a candidate URL and return discovery metadata if it looks like
 * a real menu. Returns null otherwise.
 *
 * 2026-05-10: also re-checks the FINAL URL after redirects via
 * isPlausibleMenuTarget. Sites like chipotle.com 302-redirect /menu →
 * /, which previously slipped through because we only validated the
 * pre-fetch candidate.
 */
async function probeMenuUrl(
  url: string,
  source: MenuDiscoveryResult["source"]
): Promise<MenuDiscoveryResult | null> {
  const res = await safeFetch(url, { acceptPdf: true });
  if (!res) return null;
  if (res.isPdf) {
    return { menuUrl: res.url, isPdf: true, images: [], source };
  }
  if (!isPlausibleMenuTarget(res.url)) return null;
  if (!looksLikeMenu(res.text)) return null;
  const images = extractImages(res.text, res.url);
  return { menuUrl: res.url, isPdf: false, images, source };
}

/**
 * Try Schema.org first, then in-page menu link, then common URL paths.
 * Returns the first successful match. Returns EMPTY_RESULT (no menuUrl)
 * if none of the strategies find a plausible menu page.
 */
export async function discoverMenu(websiteUrl: string): Promise<MenuDiscoveryResult> {
  const homepage = safeParseUrl(websiteUrl);
  if (!homepage) return EMPTY_RESULT;

  const homepageRes = await safeFetch(homepage.toString());
  if (!homepageRes) return EMPTY_RESULT;
  const homepageHtml = homepageRes.text;
  const finalHomepage = homepageRes.url;

  // Step 1 — Schema.org JSON-LD on the homepage.
  const schemaUrl = extractSchemaMenuUrl(homepageHtml, finalHomepage);
  if (schemaUrl) {
    const probed = await probeMenuUrl(schemaUrl, "schema");
    if (probed) return probed;
  }

  // Step 2 — anchor tag whose text or href mentions "menu".
  const linkUrl = extractMenuLink(homepageHtml, finalHomepage);
  if (linkUrl) {
    const probed = await probeMenuUrl(linkUrl, "link");
    if (probed) return probed;
  }

  // Step 3 — common paths in parallel.
  const candidates = COMMON_MENU_PATHS
    .map((path) => resolveUrl(path, finalHomepage))
    .filter((u): u is string => !!u);
  const probes = await Promise.allSettled(
    candidates.map((u) => probeMenuUrl(u, "path"))
  );
  for (const p of probes) {
    if (p.status === "fulfilled" && p.value) return p.value;
  }

  return EMPTY_RESULT;
}

/**
 * Helper for the route handler — extracts the cache key (hostname) from
 * a website URL, normalised to drop "www." so franchises hit the same
 * cache row.
 */
export function cacheKeyForWebsite(websiteUrl: string): string | null {
  const u = safeParseUrl(websiteUrl);
  if (!u) return null;
  return u.hostname.toLowerCase().replace(/^www\./, "");
}
