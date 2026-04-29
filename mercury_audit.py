"""Send Foodie Finder source to Inception Mercury-2 for full audit.

Adapted from sassytalkie's mercury_audit.py for an Expo React Native +
Cloudflare Worker app. Splits the codebase into three domain bundles:

  - backend   : Cloudflare worker + Node server + tRPC routers + scrapers
  - mobile    : React Native app, components, hooks, contexts, lib
  - features  : README + CLAUDE.md + product MDs + configs (feature-dump
                cross-check)

Each bundle is written to audits/ and POSTed to Mercury-2; reports land
back next to the bundles.

Usage:
    set INCEPTION_API_KEY=...
    python mercury_audit.py            # all three
    python mercury_audit.py backend
    python mercury_audit.py mobile
    python mercury_audit.py features
    python mercury_audit.py bundles    # write bundles only, no API call
"""
import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

API_URL = "https://api.inceptionlabs.ai/v1/chat/completions"
MODEL = "mercury-2"

ROOT = Path("V:/Projects/foodie-finder v8")
OUT_DIR = ROOT / "audits"

# ----- Source partitions -----
WORKER_DIRS = [ROOT / "worker"]
SERVER_DIRS = [ROOT / "server"]
MOBILE_DIRS = [
    ROOT / "app",
    ROOT / "components",
    ROOT / "hooks",
    ROOT / "contexts",
    ROOT / "context",
    ROOT / "lib",
]
SHARED_DIRS = [
    ROOT / "utils",
    ROOT / "shared",
    ROOT / "types",
    ROOT / "constants",
]
TEST_DIRS = [
    ROOT / "__tests__",
    ROOT / "tests",
    ROOT / "scripts",
]

BACKEND_CONFIGS = ["package.json", "tsconfig.json", "wrangler.toml", "drizzle.config.ts"]
MOBILE_CONFIGS = [
    "package.json",
    "tsconfig.json",
    "app.config.ts",
    "eas.json",
    "metro.config.cjs",
    "eslint.config.js",
]
ALL_CONFIGS = [
    "package.json",
    "tsconfig.json",
    "wrangler.toml",
    "app.config.ts",
    "eas.json",
    "drizzle.config.ts",
    "metro.config.cjs",
    "eslint.config.js",
    "vitest.config.ts",
    "vitest.setup.tsx",
    ".env.example",
    "docker-compose.yml",
    "obfuscator.config.js",
    "assetlinks.json",
]

SOURCE_EXTS = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"}
SKIP_DIR_NAMES = {"node_modules", ".git", ".expo", ".expo-shared", "build", "dist", "coverage", "__snapshots__"}


def collect(dirs, exts=SOURCE_EXTS):
    files = []
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*"):
            if not p.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in p.parts):
                continue
            if p.suffix in exts:
                files.append(p)
    return sorted(files)


def bundle(paths, label):
    parts = [f"# {label}\n"]
    for p in sorted(paths):
        try:
            rel = p.relative_to(ROOT)
        except ValueError:
            rel = p.name
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            text = f"<<read error: {e}>>"
        parts.append(f"\n\n===== FILE: {rel} =====\n{text}")
    return "".join(parts)


def configs_to_paths(names):
    return [ROOT / n for n in names if (ROOT / n).exists()]


SYSTEM_PROMPT = """You are a principal engineer performing a rigorous, no-punches-pulled audit of a production Expo React Native + Cloudflare Worker app called Foodie Finder. The app helps users discover and remember restaurants. There is NO user auth — favorites and notes are local-only on device. There is a community tips feature (public notes) that uses KV with a moderation gate.

Your audit MUST cover:
1. CORRECTNESS — logic errors, off-by-one, wrong state transitions, broken invariants, dead code, unreachable branches, stale closures
2. CONCURRENCY / ASYNC — race conditions, fire-and-forget promises, useEffect dep bugs, AbortController hygiene, request waterfalls, double-fetch, StrictMode double-invoke regressions
3. SECURITY — XSS via WebView/HTML, KV/D1 injection, PII leakage in logs, secrets in client bundles (EXPO_PUBLIC_*), auth bypass on admin routes, CSRF on tRPC, tainted user input flowing to external APIs, photo-proxy SSRF, CORS misconfig, content-moderation bypass
4. WORKERS RUNTIME — D1 query cost, KV TTL/size limits, R2 PUT/GET hygiene, fetch-event lifecycle, waitUntil misuse, CPU-time budgets, isolate global state pollution, env-binding misuse, recursion / unbounded loops
5. REACT NATIVE — re-render storms, FlatList key/uniqueness, image leaks, AsyncStorage misuse, Hermes-specific bugs, useEffect cleanup, navigation memory leaks, AppState handling, accessibility
6. TRPC / API SHAPE — Zod schema gaps, mutation idempotency, optimistic updates, error surface, transport-level retries, query-key correctness
7. ERROR HANDLING — swallowed exceptions, silent failures, retry storms, missing backpressure, user-visible error states
8. DATA / MIGRATION — D1 schema correctness, migrations idempotent, KV key collisions, R2 key namespacing, denormalization risks
9. PERFORMANCE — allocations in hot paths, blocking JS work, oversize photos, unbounded list growth, N+1 fetches over the network
10. FEASIBILITY — does this actually work as claimed? Any impossible-to-satisfy assumptions (free-tier quotas, geocoding accuracy, photo licensing, store-policy compliance)?
11. FEATURE COMPLETENESS — when README/CLAUDE.md is in scope, verify advertised features are actually wired and reachable end-to-end (no orphan components, no stub backends, no dead routes, no docs that lie about state).
12. IMPROVEMENTS — concrete refactor suggestions ranked by impact/effort

For every finding emit JSON objects in a single fenced ```json block, one per line, with keys:
  severity: one of [critical, high, medium, low, nit]
  category: one of the 12 above
  file: relative path
  symbol: function/class/component where applicable (or null)
  issue: what is wrong (one sentence)
  why: why it matters (one sentence, concrete consequence)
  fix: suggested fix (specific, actionable, code sketch if useful)
  confidence: 0.0-1.0 (your confidence this is a real issue, not a false positive)

After the JSON block, give a short prose "Top 5 things to fix first" summary and an overall feasibility verdict.

Do NOT be gentle. Do NOT be generic. Every finding must be anchored to a specific file/function and a specific consequence. Skip stylistic nits unless they cause bugs. Prior audits already caught: cache-table infinite recursion, photo-proxy HTTPS-only, FSQ regression, stale closures, admin auth gating, taint/ANR/regex-fuzz issues. Do NOT re-report those — find what was missed."""


def call_mercury(user_content, label):
    key = os.environ.get("INCEPTION_API_KEY")
    if not key:
        raise SystemExit("INCEPTION_API_KEY env var not set")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
        "max_tokens": 50000,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    print(f"[{label}] POST {API_URL}  payload={len(body)/1024:.1f} KB", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"[{label}] HTTP {e.code}: {err}", flush=True)
        raise
    msg = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    print(
        f"[{label}] tokens prompt={usage.get('prompt_tokens')} "
        f"completion={usage.get('completion_tokens')}",
        flush=True,
    )
    return msg


def main():
    OUT_DIR.mkdir(exist_ok=True)

    worker_files = collect(WORKER_DIRS)
    server_files = collect(SERVER_DIRS)
    shared_files = collect(SHARED_DIRS)
    test_files = collect(TEST_DIRS)

    # Split MOBILE_DIRS into screens (app/), components, and hooks/contexts/lib
    screens_files = collect([ROOT / "app"])
    components_files = collect([ROOT / "components"])
    hooks_files = collect([
        ROOT / "hooks",
        ROOT / "contexts",
        ROOT / "context",
        ROOT / "lib",
    ])

    # ----- WORKER BUNDLE -----
    worker_bundle = (
        bundle(configs_to_paths(BACKEND_CONFIGS), "WORKER CONFIG")
        + "\n\n"
        + bundle(worker_files, "CLOUDFLARE WORKER (worker/)")
        + "\n\n"
        + bundle(shared_files, "SHARED TYPES + UTILS (utils/, types/, shared/, constants/)")
    )

    # ----- SERVER BUNDLE -----
    server_bundle = (
        bundle(configs_to_paths(BACKEND_CONFIGS), "SERVER CONFIG")
        + "\n\n"
        + bundle(server_files, "SERVER / TRPC ROUTERS (server/)")
        + "\n\n"
        + bundle(shared_files, "SHARED TYPES + UTILS (utils/, types/, shared/, constants/)")
    )

    # ----- MOBILE-SCREENS BUNDLE -----
    screens_bundle = (
        bundle(configs_to_paths(MOBILE_CONFIGS), "MOBILE CONFIG")
        + "\n\n"
        + bundle(screens_files, "REACT NATIVE SCREENS (app/)")
    )

    # ----- COMPONENTS BUNDLE -----
    components_bundle = (
        bundle(configs_to_paths(MOBILE_CONFIGS), "MOBILE CONFIG")
        + "\n\n"
        + bundle(components_files, "REACT NATIVE COMPONENTS (components/)")
        + "\n\n"
        + bundle(shared_files, "SHARED TYPES + UTILS (utils/, types/, shared/, constants/)")
    )

    # ----- HOOKS BUNDLE -----
    hooks_bundle = (
        bundle(configs_to_paths(MOBILE_CONFIGS), "MOBILE CONFIG")
        + "\n\n"
        + bundle(hooks_files, "REACT NATIVE HOOKS + CONTEXTS + LIB (hooks/, contexts/, context/, lib/)")
        + "\n\n"
        + bundle(shared_files, "SHARED TYPES + UTILS (utils/, types/, shared/, constants/)")
    )

    # ----- FEATURES BUNDLE (docs + configs cross-check) -----
    root_mds = sorted(ROOT.glob("*.md"))
    docs_dir = ROOT / "docs"
    docs_mds = sorted(docs_dir.rglob("*.md")) if docs_dir.exists() else []
    features_bundle = (
        bundle(root_mds, "PRODUCT DOCS (root *.md)")
        + ("\n\n" + bundle(docs_mds, "DOCS FOLDER (docs/**/*.md)") if docs_mds else "")
        + "\n\n"
        + bundle(configs_to_paths(ALL_CONFIGS), "ALL CONFIGS")
    )

    (OUT_DIR / "mercury_foodie_worker_bundle.txt").write_text(worker_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_foodie_server_bundle.txt").write_text(server_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_foodie_screens_bundle.txt").write_text(screens_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_foodie_components_bundle.txt").write_text(components_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_foodie_hooks_bundle.txt").write_text(hooks_bundle, encoding="utf-8")
    (OUT_DIR / "mercury_foodie_features_bundle.txt").write_text(features_bundle, encoding="utf-8")
    print(f"Worker     bundle: {len(worker_bundle)/1024:.1f} KB ({len(worker_files)} worker + {len(shared_files)} shared)")
    print(f"Server     bundle: {len(server_bundle)/1024:.1f} KB ({len(server_files)} server + {len(shared_files)} shared)")
    print(f"Screens    bundle: {len(screens_bundle)/1024:.1f} KB ({len(screens_files)} app/ files)")
    print(f"Components bundle: {len(components_bundle)/1024:.1f} KB ({len(components_files)} components + {len(shared_files)} shared)")
    print(f"Hooks      bundle: {len(hooks_bundle)/1024:.1f} KB ({len(hooks_files)} hooks/lib + {len(shared_files)} shared)")
    print(f"Features   bundle: {len(features_bundle)/1024:.1f} KB ({len(root_mds)} root MDs + {len(docs_mds)} docs MDs + {sum(1 for n in ALL_CONFIGS if (ROOT/n).exists())} configs)")

    worker_user = (
        "Audit the Foodie Finder Cloudflare Worker. It fronts Google Places / Foursquare / HERE / "
        "OSM scrapers, holds public 'community tips' in KV (FOODIE_PUBLIC_NOTES), menu photos in "
        "R2 (MENU_PHOTOS), and a structured cache in D1. Be exhaustive on the worker runtime, "
        "data taint flowing user→external API, secret hygiene (no API keys in client URLs), "
        "the tRPC procedure surface in worker/trpc-router.ts, admin-route gating, and CPU-time "
        "budgets. Flag anything that would brick the worker, leak quota, or leak secrets.\n\n"
        + worker_bundle
    )
    server_user = (
        "Audit the Foodie Finder Node-side server (server/). This runs locally for dev and "
        "shares logic with the worker — restaurant scraping, RAG indexing, sentiment, the tRPC "
        "router, queue worker (rag-bull), Culver's flavor-of-the-day fetcher. Be exhaustive on "
        "scraper correctness (geocoding fallbacks, photo enrichment, dedup), tRPC procedure "
        "shape, error handling on third-party API failures, and data flowing through to D1/KV/R2.\n\n"
        + server_bundle
    )
    screens_user = (
        "Audit the Foodie Finder Expo Router screens (app/). It's an image-heavy restaurant "
        "discovery app with: home tab (search/spinner), browse tab (list of nearby), favorites, "
        "settings, restaurant detail, OAuth callback, modal. No user auth — favorites/notes are "
        "local-only via AsyncStorage. Be exhaustive on screen lifecycle, navigation, "
        "useEffect/useMemo correctness, FlatList key uniqueness, image leaks, and any tRPC "
        "calls that race or fire on every render. Accessibility findings welcome.\n\n"
        + screens_bundle
    )
    components_user = (
        "Audit the Foodie Finder React Native components/. Includes the spinner-wheel restaurant "
        "picker (animated), photo carousel, menu section, public + personal notes UI, "
        "taste-matches, restaurant card, themed-text/view, error boundary. Be exhaustive on "
        "render correctness, animated component lifecycle (Animated/Reanimated cleanup), "
        "FlatList key uniqueness, image-prop leaks, and re-render hot paths.\n\n"
        + components_bundle
    )
    hooks_user = (
        "Audit the Foodie Finder hooks + contexts + lib. Most important: useRestaurantStorage "
        "(AsyncStorage-backed favorites/notes — local-only, no auth by design, do NOT recommend "
        "adding auth), useTrpc (tRPC client setup), useAuth (OAuth callback only — no user "
        "auth state for app data), useLocation, useTasteProfile (RAG-style local embeddings), "
        "useSemanticSearch, useShareHandler. Be exhaustive on hooks correctness, stale closures, "
        "useEffect dep arrays, AsyncStorage corruption/race risk, and the tRPC client surface.\n\n"
        + hooks_bundle
    )
    features_user = (
        "Audit the Foodie Finder product docs + feature claims. Read every README/CLAUDE.md/"
        "PROJECT_STATUS/SHIPPING_CHECKLIST/etc. and call out: (a) features documented but NOT "
        "wired in code, (b) features in code but NOT documented, (c) stale claims (docs that "
        "describe a state that no longer exists), (d) missing privacy/policy disclosures for "
        "actually-shipping features, (e) configuration documented in .env.example but not "
        "actually consumed, or vice versa.\n\n"
        + features_bundle
    )

    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target == "bundles":
        print("bundles-only mode: skipping Mercury-2 calls")
        return

    jobs = []
    if target in ("worker", "all", "backend"):
        jobs.append(("worker", worker_user))
    if target in ("server", "all", "backend"):
        jobs.append(("server", server_user))
    if target in ("screens", "all", "mobile"):
        jobs.append(("screens", screens_user))
    if target in ("components", "all", "mobile"):
        jobs.append(("components", components_user))
    if target in ("hooks", "all", "mobile"):
        jobs.append(("hooks", hooks_user))
    if target in ("features", "all"):
        jobs.append(("features", features_user))

    for label, user_msg in jobs:
        report = call_mercury(user_msg, label)
        out = OUT_DIR / f"mercury_foodie_{label}_report.md"
        out.write_text(report, encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
