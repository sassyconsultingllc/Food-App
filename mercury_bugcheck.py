"""Send the Foodie Finder codebase to Inception Mercury-2 for a focused
BUG-CHECK audit, one bug-class "lens" at a time.

Mercury-2's context is 128k tokens shared by prompt+completion, but the code is
~235k tokens — it CANNOT fit in one request. So we split. The trick to avoiding
false positives ("module X is missing!") is to make each split self-contained:

  * COHESIVE CHUNKS  — one domain per chunk (worker / server / app / components /
    hooks), with the shared layer (utils, types, constants, shared, lib) appended
    to EVERY chunk so cross-references resolve in-context.
  * REPO MANIFEST    — a cheap map (full file tree + every exported symbol name +
    package.json deps/versions) is prepended to EVERY chunk, so the model always
    knows what exists elsewhere and stops flagging present things as "missing".

Lenses (each sweeps the whole tree once, through one bug lens):
  security / efficiency / accuracy / feasibility / correctness

Usage:
    set INCEPTION_API_KEY=...
    python mercury_bugcheck.py                 # all five lenses
    python mercury_bugcheck.py security        # one lens
    python mercury_bugcheck.py efficiency accuracy
    python mercury_bugcheck.py chunks          # write manifest + chunk bundles, NO API call

Outputs land in audits/: mercury_bug_<lens>_<domain>_report.md per chunk and a
synthesized mercury_bug_<lens>_report.md.
"""
import os
import re
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

API_URL = "https://api.inceptionlabs.ai/v1/chat/completions"
MODEL = "mercury-2"

ROOT = Path("V:/Projects/foodie-finder v8")
OUT_DIR = ROOT / "audits"

# mercury-2: 128k context shared by prompt+completion. Leave room for the
# completion + system prompt + the manifest that rides along in every chunk.
MODEL_CONTEXT_TOKENS = 128_000
MAX_COMPLETION_TOKENS = 16_000
RESERVE_TOKENS = 6_000
PROMPT_TOKEN_BUDGET = MODEL_CONTEXT_TOKENS - MAX_COMPLETION_TOKENS - RESERVE_TOKENS
CHARS_PER_TOKEN = 3.0
CHUNK_BUDGET = int(PROMPT_TOKEN_BUDGET * CHARS_PER_TOKEN)  # ~311 KB total per request

# mercury-2 pricing, USD per 1M tokens. Verified Jun 2026 (OpenRouter + Artificial
# Analysis both list $0.25 in / $0.75 out; 128k ctx, 50k max out).
PRICE_IN_PER_M = 0.25
PRICE_OUT_PER_M = 0.75
EST_CHARS_PER_TOKEN = 3.8  # for the pre-run estimate only

_USAGE = {"in": 0, "out": 0}


def cost(tin, tout):
    return tin / 1e6 * PRICE_IN_PER_M + tout / 1e6 * PRICE_OUT_PER_M


# ---------------------------------------------------------------------------
# Source layout
# ---------------------------------------------------------------------------
INCLUDE_EXT = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".sql"}
EXCLUDE = (
    "/node_modules/", "/.git/", "/.expo", "/android/", "/ios/", "/vendor/",
    "/build/", "/builds/", "/dist/", "/coverage/", "__snapshots__",
    "/audits/", "/_DELETE_/", "/backup/", "mercury_", "package-lock", ".bak",
)

# One chunk per domain; the shared layer rides along in every chunk.
DOMAINS = {
    "worker": ["worker"],
    "server": ["server"],
    "app": ["app"],
    "components": ["components"],
    "hooks": ["hooks", "contexts", "context"],
}
SHARED_DIRS = ["utils", "types", "constants", "shared", "lib"]

CONFIG_FILES = [
    "package.json", "tsconfig.json", "wrangler.toml", "app.config.ts",
    "eas.json", "drizzle.config.ts", "metro.config.cjs", "eslint.config.js",
    "vitest.config.ts", "docker-compose.yml", "obfuscator.config.cjs",
    "assetlinks.json", ".env.example",
]
DOC_FILES = [
    "README.md", "CLAUDE.md", "PROJECT_STATUS.md", "SHIPPING_CHECKLIST.md",
    "COMPETITIVE_ANALYSIS.md", "IMPROVEMENTS_IMPLEMENTED.md", "CHANGELOG.md",
    "design.md", "todo.md",
]


def rel(p):
    try:
        return str(p.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return p.name


def read(p):
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"<<read error: {e}>>"


def list_files(dirs):
    out = []
    for d in dirs:
        base = ROOT / d
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in INCLUDE_EXT:
                continue
            if any(x in str(p).replace("\\", "/") for x in EXCLUDE):
                continue
            out.append(p)
    return sorted(set(out))


def config_paths(names):
    return [ROOT / n for n in names if (ROOT / n).is_file()]


def render(files):
    parts = []
    for p in files:
        parts.append(f"\n\n===== FILE: {rel(p)} =====\n{read(p)}")
    return "".join(parts)


# ---------------------------------------------------------------------------
# Repo manifest — the "what exists" map prepended to every chunk
# ---------------------------------------------------------------------------
_EXPORT_DECL = re.compile(
    r"^\s*export\s+(?:default\s+)?(?:async\s+)?"
    r"(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)",
    re.M,
)
_EXPORT_LIST = re.compile(r"^\s*export\s*\{([^}]*)\}", re.M)


def export_names(text):
    names = set(_EXPORT_DECL.findall(text))
    for blk in _EXPORT_LIST.findall(text):
        for item in blk.split(","):
            item = item.strip()
            if not item:
                continue
            names.add(item.split(" as ")[-1].strip())  # `foo as bar` -> bar
    if re.search(r"^\s*export\s+default\b", text, re.M):
        names.add("default")
    return sorted(names)


def key_deps():
    try:
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except Exception:
        return "(package.json unreadable)"
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    return ", ".join(f"{k}@{v}" for k, v in sorted(deps.items()))


def build_manifest(code_files):
    lines = [
        "# REPO MANIFEST — AUTHORITATIVE INVENTORY OF THIS CODEBASE",
        "Every file and exported symbol below EXISTS in the project. Many of them "
        "are NOT included in the current chunk's source body — that is expected. "
        "Do NOT report a file, import, export, or dependency as 'missing', "
        "'non-existent', or 'unsupported' if it appears here; assume it exists and "
        "is wired. Only the chunk's own FILE blocks are the code under audit.",
        "",
        "## Installed dependencies (name@version) — trust these versions for any "
        "API/availability judgement:",
        key_deps(),
        "",
        "## Files and their exported symbols:",
    ]
    for p in code_files:
        names = export_names(read(p))
        lines.append(f"  {rel(p)}: {', '.join(names) if names else '(no named exports)'}")
    docs = [n for n in DOC_FILES if (ROOT / n).is_file()]
    if docs:
        lines += ["", "## Product docs present (bodies not included in code lenses): "
                  + ", ".join(docs)]
    lines.append("\n# END MANIFEST\n")
    return "\n".join(lines)


def build_chunks():
    """Return (manifest, [(chunk_name, [files])]). Cohesive: each chunk =
    shared layer + configs + one domain. A domain too big for the budget is
    sub-split, but shared+configs are repeated in each sub-chunk."""
    shared = list_files(SHARED_DIRS)
    configs = config_paths(CONFIG_FILES)
    all_code = sorted(set(shared + sum((list_files(ds) for ds in DOMAINS.values()), [])))
    manifest = build_manifest(all_code)

    fixed = shared + configs
    fixed_chars = len(render(fixed))
    # budget left for a domain's own files, after manifest + shared + configs
    domain_budget = CHUNK_BUDGET - len(manifest) - fixed_chars

    chunks = []
    for name, dirs in DOMAINS.items():
        files = list_files(dirs)
        # greedily sub-split this domain only if it overflows
        sub, cur, size = [], [], 0
        for p in files:
            c = len(read(p))
            if cur and size + c > domain_budget:
                sub.append(cur)
                cur, size = [], 0
            cur.append(p)
            size += c
        if cur:
            sub.append(cur)
        for i, group in enumerate(sub):
            cname = name if len(sub) == 1 else f"{name}{i+1}"
            chunks.append((cname, fixed + group))
    return manifest, chunks


# ---------------------------------------------------------------------------
# Shared prompt scaffolding
# ---------------------------------------------------------------------------
APP_CONTEXT = """Foodie Finder is a production Expo React Native (TypeScript, Hermes) restaurant-discovery app with a Cloudflare Worker backend (Hono + tRPC). Data comes from Google Places / Foursquare / HERE / OSM scrapers; a structured restaurant cache lives in D1; community "tips" (public notes) live in KV (FOODIE_PUBLIC_NOTES) behind a moderation gate (utils/pii-guard.ts, worker/content-guard.ts); menu photos live in R2 (MENU_PHOTOS). There is NO user auth — favorites and notes are device-local via AsyncStorage (do NOT recommend adding auth for app data). A Node-side server/ mirrors worker logic for dev. The worker/trpc-router.ts surface is consumed by the app via lib/trpc.ts + hooks/use-trpc.tsx."""

DO_NOT_REREPORT = """Prior audits ALREADY caught and FIXED these — do NOT re-report: cache-table infinite recursion; photo-proxy restricted to HTTPS; a Foursquare regression; several stale-closure useEffect bugs; admin-route auth gating; input taint / ANR / regex-fuzz hardening; Culver's name normalization; non-food place-type leakage; cuisine-label cleanup."""

ANTI_FP = """Anti-false-positive rules (this codebase is split across chunks):
- The REPO MANIFEST at the top lists every file and export that exists. NEVER claim something is missing/undefined/unsupported if it is in the manifest or in the installed dependencies.
- Judge runtime-API availability against the pinned dependency versions in the manifest (e.g. the expo SDK and expo-file-system version, the Cloudflare Workers runtime). Do not assume a legacy API.
- If a finding depends on code NOT shown in this chunk, mark confidence <= 0.5 and say which file you would need to confirm it."""

JSON_TAIL = """For every finding emit a JSON object inside a SINGLE fenced ```json block, one object per line, with these keys:
  severity: one of [critical, high, medium, low, nit]
  category: (see the categories above — closest one)
  file: relative path as shown in a FILE header (must be a file actually shown in THIS chunk)
  symbol: function / component / route (or null)
  issue: what is wrong (one sentence, concrete)
  why: the concrete consequence if left as-is (one sentence)
  fix: a specific, actionable fix (code sketch if useful)
  loc_estimate: integer — approximate lines of code the fix touches
  fix_tokens: integer — approximate tokens a coding model needs to IMPLEMENT this fix (read context + write diff). Cost to MAKE the change, separate from this audit. (~300-800 a one-liner, 1-3k localized, 5-15k cross-file.)
  effort: one of [S, M, L, XL]  (S<=10 LOC, M<=40, L<=120, XL>120)
  confidence: 0.0-1.0 that this is a REAL issue, verified against the code shown (lower it if you could not see the relevant file)
After the JSON block: a prose "Top 5 to fix first" for THIS chunk (file/symbol anchored), then one line: "CHUNK TOTALS: loc=<sum>, fix_tokens=<sum>, findings=<count>".

Anchor every finding to a file+symbol+consequence. No generic advice. Skip style nits unless they cause a bug."""


def system_for(lens_title, focus):
    return (f"You are a principal engineer performing a rigorous {lens_title} audit "
            f"of a production app.\n\n{APP_CONTEXT}\n\n{focus}\n\n{ANTI_FP}\n\n"
            f"{DO_NOT_REREPORT}\n\n{JSON_TAIL}")


def synthesis_for(lens_title, verdict_q):
    return (f"You are the same {lens_title} auditor. Below are your per-chunk findings "
            f"for the Foodie Finder codebase. Synthesize into ONE definitive report. "
            f"Deduplicate, resolve conflicts, drop findings whose confidence was <=0.4, "
            f"and re-rank by severity x confidence. Produce:\n"
            f"1. A one-paragraph verdict: {verdict_q}\n"
            f"2. TOP 10 must-fix issues as a ranked table — severity, file:symbol, "
            f"one-line issue, one-line fix, loc_estimate, fix_tokens.\n"
            f"3. Findings grouped by theme, with affected files.\n"
            f"4. IMPLEMENTATION BUDGET: total loc_estimate and total fix_tokens across the "
            f"deduped findings, broken down by severity, with the grand-total fix_tokens "
            f"stated explicitly.\n"
            f"5. Anything needing a human decision (trade-off, product call, "
            f"or can't-tell-without-runtime).\nKeep it concrete and code-anchored.")


SECURITY_FOCUS = """This is a SECURITY audit. Categories:
1. INJECTION — unsanitized input into D1 SQL, KV/R2 keys, or eval/shell.
2. SSRF / OPEN-PROXY — any fetch() whose URL is influenced by user/scraped data; host/scheme allow-listing.
3. SECRET HYGIENE — API keys reachable from the client bundle, EXPO_PUBLIC_* vars, tRPC responses, or client-facing URLs.
4. MODERATION / PII BYPASS — defeating utils/pii-guard.ts or worker/content-guard.ts to publish PII/profanity/spam/oversize payloads.
5. AUTHZ — admin routes (server/admin-http.ts) or privileged procedures reachable without the expected guard.
6. ABUSE / DOS — missing rate limits or size caps (NOTE: a global tRPC limiter may already exist in worker/index.ts — verify before flagging).
7. TRANSPORT / CORS — over-broad CORS, missing origin checks, tokens in query/logs.
8. CLIENT — XSS via WebView/HTML, deep-link/share-handler injection.
severity = exploitability x blast radius."""

EFFICIENCY_FOCUS = """This is an EFFICIENCY / PERFORMANCE audit. Categories:
1. RENDER — re-render storms, missing memo/useCallback, inline props into lists, context churn, FlatList key/getItemLayout.
2. NETWORK — N+1 calls, waterfalls, fetch-on-render, missing dedupe/cache, missing debounce on search/radius.
3. WORKER COST — D1 full scans / missing indexes, per-request KV/R2 round-trips, CPU hot spots, work that should be in waitUntil, scrapes that ignore cache.
4. EXTERNAL QUOTA — redundant Places/FSQ calls, no negative-result caching.
5. MEMORY / ALLOC — oversize images, leaked listeners/timers/AbortControllers, unbounded growth.
6. BUNDLE / STARTUP — heavy sync imports on the startup path.
NOTE: many worker fetches already use AbortSignal.timeout — verify a fetch truly lacks a timeout before flagging.
severity = cost magnitude x frequency."""

ACCURACY_FOCUS = """This is a DATA-ACCURACY audit: does the data shown match reality? Categories:
1. SCRAPER FIDELITY — right name/address/category; brand normalization; non-food leakage; cuisine mislabeling.
2. DEDUP / MERGE — cross-provider duplicates, wrong merge keys, worse record clobbering better.
3. GEOCODING / DISTANCE — zip/GPS fallback, lat/lng swaps, km-vs-mi conversions (CHECK the actual return unit before flagging), radius filtering, sort-by-distance.
4. PHOTO ENRICHMENT — wrong/duplicate photos, broken refs, count mismatches.
5. HOURS — open/closed + timezone, overnight ranges, DST, "open now".
6. RATINGS / SENTIMENT — aggregation, mislabeling, irrelevant RAG matches.
7. STALE CACHE — records served past usefulness, missing radius/country filter on cache reads.
severity = how wrong x how visible."""

FEASIBILITY_FOCUS = """This is a FEASIBILITY / SHIP-READINESS audit. Categories:
1. IMPOSSIBLE ASSUMPTIONS — code assuming a response shape/capacity an external API doesn't guarantee.
2. FREE-TIER / QUOTA — Places/D1/KV/R2/Workers limits the call pattern will blow; cost cliffs.
3. STORE POLICY — Play data-safety/permissions/background-service/Photo-Picker vs what the code does.
4. FEATURE COMPLETENESS — features in docs but not wired (orphan components, dead routes, stub procedures), or in code but undocumented. (Check the manifest before declaring something unwired.)
5. DOCS-VS-REALITY — stale claims, .env vars unused or undocumented, privacy gaps for shipping features.
6. RESILIENCE — no network, API failure, empty results, denied location — graceful or broken?
severity = likelihood it blocks a real ship x discoverability."""

CORRECTNESS_FOCUS = """This is a CORRECTNESS audit — logic, concurrency, error handling. Categories:
1. LOGIC — off-by-one, inverted conditions, wrong transitions, broken invariants, dead branches, wrong defaults.
2. CONCURRENCY / ASYNC — races, fire-and-forget promises, useEffect dep bugs, stale closures, missing AbortController, double-fetch, out-of-order responses.
3. STATE — AsyncStorage read/write races or corruption, optimistic-update desync, drifting derived state.
4. tRPC / API SHAPE — Zod gaps, non-idempotent mutations, wrong query keys, detail-swallowing error surfaces.
5. ERROR HANDLING — swallowed exceptions, empty catches, silent failures, retry storms, missing error/empty/loading states.
6. LIFECYCLE — navigation/listener/timer leaks, AppState mishandling, cleanup that never runs.
severity = likelihood x user impact."""

LENSES = {
    "security": {"title": "SECURITY", "system": system_for("security", SECURITY_FOCUS),
                 "synthesis": synthesis_for("security", "is this app safe to expose publicly, and the single worst exposure?")},
    "efficiency": {"title": "EFFICIENCY", "system": system_for("efficiency / performance", EFFICIENCY_FOCUS),
                   "synthesis": synthesis_for("efficiency", "where is the most compute/network/quota burned, and the single biggest win?")},
    "accuracy": {"title": "DATA-ACCURACY", "system": system_for("data-accuracy", ACCURACY_FOCUS),
                 "synthesis": synthesis_for("data-accuracy", "can a user trust what this app shows, and the single most misleading output?")},
    "feasibility": {"title": "FEASIBILITY", "system": system_for("feasibility / ship-readiness", FEASIBILITY_FOCUS),
                    "synthesis": synthesis_for("feasibility", "can this ship as-is, and the single biggest launch blocker?")},
    "correctness": {"title": "CORRECTNESS", "system": system_for("correctness (logic / concurrency / error-handling)", CORRECTNESS_FOCUS),
                    "synthesis": synthesis_for("correctness", "how buggy is this in practice, and the most likely crash / data-loss path?")},
}


def call(system, user, label):
    key = os.environ.get("INCEPTION_API_KEY")
    if not key:
        raise SystemExit("INCEPTION_API_KEY env var not set")
    payload = {"model": MODEL,
               "messages": [{"role": "system", "content": system},
                            {"role": "user", "content": user}],
               "temperature": 0.2, "max_tokens": MAX_COMPLETION_TOKENS}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST",
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    print(f"[{label}] POST payload={len(body)/1024:.1f} KB", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[{label}] HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}", flush=True)
        raise
    msg = data["choices"][0]["message"]["content"]
    u = data.get("usage", {})
    _USAGE["in"] += u.get("prompt_tokens") or 0
    _USAGE["out"] += u.get("completion_tokens") or 0
    print(f"[{label}] tokens prompt={u.get('prompt_tokens')} completion={u.get('completion_tokens')} "
          f"(${cost(u.get('prompt_tokens') or 0, u.get('completion_tokens') or 0):.3f})", flush=True)
    return msg


def run_lens(name, manifest, chunks):
    lens = LENSES[name]
    title = lens["title"]
    print(f"\n=== {title} lens — {len(chunks)} chunk(s) ===", flush=True)
    reports = []
    for cname, files in chunks:
        user = (f"{manifest}\n\n{title} BUG-CHECK — domain chunk '{cname}'. Audit ONLY "
                f"the FILE blocks below, through the {title} lens. The manifest above lists "
                f"everything else that exists in the repo (do not flag those as missing).\n"
                + render(files))
        rep = call(lens["system"], user, f"{name}-{cname}")
        path = OUT_DIR / f"mercury_bug_{name}_{cname}_report.md"
        path.write_text(rep, encoding="utf-8")
        reports.append(rep)
        print(f"  wrote {rel(path)}", flush=True)

    combined = "\n\n".join(f"### CHUNK {c[0]} FINDINGS\n{r}" for c, r in zip(chunks, reports))
    if len(combined) > CHUNK_BUDGET:
        combined = combined[:CHUNK_BUDGET] + "\n\n<<TRUNCATED to fit context budget>>"
    roadmap = call(lens["synthesis"], combined, f"{name}-synthesis")
    out = OUT_DIR / f"mercury_bug_{name}_report.md"
    out.write_text(roadmap, encoding="utf-8")
    print(f"  wrote {rel(out)}  (synthesis)", flush=True)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    manifest, chunks = build_chunks()
    body_chars = sum(len(render(f)) for _, f in chunks)
    print(f"Manifest {len(manifest)/1024:.1f} KB | {len(chunks)} cohesive chunk(s): "
          + ", ".join(f"{n}({len(f)}f, {len(render(f))/1024:.0f}KB)" for n, f in chunks), flush=True)

    args = [a.lower() for a in sys.argv[1:]]

    if "chunks" in args:
        (OUT_DIR / "mercury_bug_manifest.txt").write_text(manifest, encoding="utf-8")
        print(f"  wrote {rel(OUT_DIR / 'mercury_bug_manifest.txt')}", flush=True)
        for cname, files in chunks:
            path = OUT_DIR / f"mercury_bug_chunk_{cname}.txt"
            path.write_text(manifest + "\n\n" + render(files), encoding="utf-8")
            print(f"  wrote {rel(path)} ({len(files)} files)", flush=True)
        print("chunks-only mode: no Mercury-2 calls made")
        return

    selected = [a for a in args if a in LENSES]
    unknown = [a for a in args if a not in LENSES and a != "chunks"]
    if unknown:
        print(f"Unknown lens(es) ignored: {', '.join(unknown)}. Valid: {', '.join(LENSES)}, chunks")
    if not selected:
        selected = list(LENSES)

    n = len(selected)
    # each lens sends (manifest + body) once per chunk + a synthesis pass
    per_lens_in = (len(manifest) * len(chunks) + body_chars) / EST_CHARS_PER_TOKEN + 60_000
    est_in = per_lens_in * n
    est_out = 60_000 * n
    print(f"Running lenses: {', '.join(selected)}  ({len(chunks)} chunk calls + 1 synthesis each)", flush=True)
    print(f"Rough pre-run estimate: ~{est_in/1e6:.2f}M in + ~{est_out/1e6:.2f}M out = ${cost(est_in, est_out):.2f} "
          f"at mercury-2 rates (${PRICE_IN_PER_M}/M in, ${PRICE_OUT_PER_M}/M out). "
          f"This is the cost to RUN the audit, not to implement fixes.", flush=True)

    for name in selected:
        run_lens(name, manifest, chunks)

    print(f"\nACTUAL audit spend: prompt={_USAGE['in']:,} + completion={_USAGE['out']:,} tokens "
          f"= ${cost(_USAGE['in'], _USAGE['out']):.2f}", flush=True)


if __name__ == "__main__":
    main()
