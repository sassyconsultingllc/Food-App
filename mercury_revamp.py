"""Send Foodie Finder UI surface to Inception Mercury-2 for a UI revamp pass.

Sibling of mercury_audit.py. Where the audit script does strict bug-hunting,
this one swaps the prompt for a senior-product-designer brief that produces
a concrete UI revamp:

  - critique of current layout & visual hierarchy
  - revised TSX for the home/spinner screen and the restaurant detail screen
  - extracted-component suggestions
  - accessibility notes

Output is written to audits/mercury_revamp.md. We send a single bundle —
screens + UI components + design tokens + types — so Mercury has the whole
mobile surface in one shot.

Usage:
    set INCEPTION_API_KEY=...
    python mercury_revamp.py
    python mercury_revamp.py bundle   # write bundle only, no API call
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

# Only UI-relevant files — screens, components, theme tokens, type shapes.
UI_DIRS = [
    ROOT / "app",
    ROOT / "components",
]
TOKEN_FILES = [
    ROOT / "constants" / "theme.ts",
    ROOT / "types" / "restaurant.ts",
]

SOURCE_EXTS = {".ts", ".tsx"}
SKIP_DIR_NAMES = {"node_modules", ".git", ".expo", ".expo-shared", "build", "dist"}


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


SYSTEM_PROMPT = """You are a senior product designer + React Native engineer reviewing the UI of an Expo app called Foodie Finder. The app helps users find and remember restaurants. There is NO user auth — favorites/notes are device-local. Backend is Cloudflare Workers but you do not need to touch it.

Your job is a REDESIGN PASS, not a bug hunt. Produce:

1. SHORT CRITIQUE of the current UI — what's cluttered, where the hierarchy is wrong, what's hidden, what's clipped on narrow screens (320–360 dp). Be specific to file:line.

2. REVISED LAYOUT for the home/spinner screen (app/(tabs)/index.tsx) and the restaurant detail screen (app/restaurant/[id].tsx). For each, give:
   - an ASCII wireframe of the new layout at 360 dp
   - the full revised TSX (you may split into smaller components if useful)
   - notes on which design tokens you used from constants/theme.ts (DO NOT invent new colors unless absolutely needed; if you need a new token, propose it explicitly)

3. ONE OR TWO RECOMMENDED COMPONENT EXTRACTIONS — pieces of the home screen that should be their own component, with the extracted TSX.

4. ACCESSIBILITY NOTES — anything you change that improves a11y (touch targets, labels, contrast, focus order).

Constraints:
- React Native + Expo (no DOM, no Tailwind, no web-only APIs). StyleSheet.create only.
- Use existing tokens from constants/theme.ts: Spacing (xs=4, sm=8, md=16, lg=24, xl=32), BorderRadius, Colors[light|dark], AppColors. Keep the existing copper/blue palette.
- Preserve all existing functionality: zip+GPS search, radius +/- with auto re-search, filter chips, spinner wheel, favorites, personal notes, public notes ("community tips"), menu section. Do NOT remove features in your redesign — only reorganize them.
- IconSymbol component (components/ui/icon-symbol.tsx) wraps SF Symbol names — keep using it, don't switch icon libraries.
- Target: small Android (360x740) and iPhone (375x812). Layout must not clip at the right edge at 360 dp.
- The radius control feeds a debounced re-search and a manual Refresh button — keep that behavior.
- ALREADY FIXED in current code (do not re-flag): home search row was split into two rows (zip+GPS on row 1; radius +/- and Refresh button on row 2), so the radius row is no longer clipped at 360 dp. The `isFetching` flag from useRestaurantStorage drives a spinner on the radius readout and the Refresh button. Critique the layout that EXISTS in the bundle, not previous versions.

Output FORMAT:

## Critique
... (bulleted, file:line anchored)

## Home redesign

### Wireframe
```
ASCII art
```

### Revised TSX
```tsx
// app/(tabs)/index.tsx
... full file
```

### Tokens used / new tokens proposed
...

## Detail redesign
(same structure)

## Recommended extractions
(zero to two)

## Accessibility notes
...

Be opinionated. The current UI is functional but visually busy. Push for clarity and a stronger primary action.
"""


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
        "temperature": 0.3,
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

    ui_files = collect(UI_DIRS)
    token_files = [p for p in TOKEN_FILES if p.exists()]

    ui_bundle = (
        bundle(token_files, "DESIGN TOKENS + TYPES (constants/theme.ts, types/restaurant.ts)")
        + "\n\n"
        + bundle(ui_files, "UI SURFACE (app/ + components/)")
    )

    bundle_path = OUT_DIR / "mercury_foodie_ui_bundle.txt"
    bundle_path.write_text(ui_bundle, encoding="utf-8")
    print(f"UI bundle: {len(ui_bundle)/1024:.1f} KB ({len(ui_files)} ui + {len(token_files)} tokens) -> {bundle_path}")

    if len(sys.argv) > 1 and sys.argv[1] == "bundle":
        return

    user_msg = (
        "Here is the full UI surface of Foodie Finder. Produce the redesign pass "
        "described in the system prompt.\n\n" + ui_bundle
    )
    report = call_mercury(user_msg, "ui-mockup")
    report_path = OUT_DIR / "mercury_revamp.md"
    report_path.write_text(report, encoding="utf-8")
    print(f"Report written: {report_path}")


if __name__ == "__main__":
    main()
