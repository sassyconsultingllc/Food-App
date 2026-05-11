// Sanity check for worker/menu-discoverer.ts run against real
// restaurant websites — bypasses the worker so we can see whether
// the discovery logic itself finds a usable menu page.
//
// Run: node --experimental-strip-types scripts/test-menu-discovery.mjs
//
// (Strip-types means we can import the .ts module directly.)

import { discoverMenu } from "../worker/menu-discoverer.ts";

const TARGETS = [
  { label: "Lawry's The Prime Rib", url: "https://www.lawrysonline.com/" },
  { label: "In-N-Out Burger",      url: "https://www.in-n-out.com/" },
  { label: "Chipotle",             url: "https://www.chipotle.com/" },
  { label: "Domino's",             url: "https://www.dominos.com/" },
  { label: "Culver's",             url: "https://www.culvers.com/" },
  { label: "The Abbey Food & Bar", url: "https://www.theabbeyweho.com/" },
  // Should fail cleanly (homepage with no menu link/page)
  { label: "Plain test site",      url: "https://example.com/" },
];

for (const t of TARGETS) {
  const started = Date.now();
  try {
    const result = await discoverMenu(t.url);
    const ms = Date.now() - started;
    console.log(
      `\n[${t.label}]  ${ms} ms`,
      `\n  menuUrl: ${result.menuUrl ?? "(none)"}`,
      `\n  isPdf:   ${result.isPdf}`,
      `\n  source:  ${result.source ?? "(n/a)"}`,
      `\n  images:  ${result.images.length} (first: ${result.images[0] ?? "—"})`
    );
  } catch (err) {
    console.log(`\n[${t.label}] ERROR`, err);
  }
}
