/**
 * One-time migration: legacy community content -> anonymous bucket keys
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Brings pre-anonymization data into the bucket scheme so the "all aspects
 * anonymized" goal holds for OLD data too:
 *
 *   1. Legacy user photos in D1 `menu_photos` (keyed by restaurant_id) are
 *      re-keyed into `community_photos` (keyed by the opaque HMAC bucket).
 *      Each image is downloaded, EXIF-stripped, and re-uploaded under
 *      community/{bucket}/.
 *   2. Legacy notes in KV FOODIE_PUBLIC_NOTES (key `notes:{restaurantId}`) are
 *      re-keyed to `notes:{bucket}`.
 *
 * The bucket is computed with the SAME function + pepper as the Worker, so a
 * migrated item lands in the exact bucket the app will read. Therefore the
 * RESTAURANT_BUCKET_PEPPER env var here MUST equal the Worker secret.
 *
 * Safety:
 *   - DRY-RUN by default. Pass --apply to actually write/delete.
 *   - Idempotent: photos get a deterministic id (`mig_<legacyId>`) and are
 *     skipped if already present; notes are merged + the legacy key deleted, so
 *     a re-run is a no-op.
 *   - NEVER prints a restaurant name, coordinates, or a bucket id.
 *
 * Run:
 *   $env:RESTAURANT_BUCKET_PEPPER="<same as wrangler secret>"
 *   npx tsx scripts/migrate-anon-buckets.ts            # dry run
 *   npx tsx scripts/migrate-anon-buckets.ts --apply    # execute
 *
 * Requires wrangler authenticated to the account that owns the resources.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeBucketId } from "../worker/restaurant-bucket";
import { stripImageMetadata } from "../worker/image-metadata";

// ---- Config (override via env if your resources differ) ---------------------
const D1_NAME = process.env.D1_NAME || "foodie-finder";
const KV_NAMESPACE_ID = process.env.FOODIE_NOTES_KV_ID || "f58d8de66b624373b3f316b839c7bfcf";
const R2_BUCKET = process.env.R2_BUCKET_NAME || "foodie-finder-menus";
const PUBLIC_BASE = process.env.MENU_PUBLIC_BASE || "https://foodie-finder-menus.sassyconsultingllc.com/";

const APPLY = process.argv.includes("--apply");
const PEPPER = process.env.RESTAURANT_BUCKET_PEPPER || "";

// `npx` resolves to npx.cmd on Windows; execFileSync needs the right one.
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function wrangler(args: string[]): string {
  return execFileSync(NPX, ["wrangler", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Run a read-only D1 query against the remote DB and return rows. */
function d1Query<T>(sql: string): T[] {
  const out = wrangler(["d1", "execute", D1_NAME, "--remote", "--json", "--command", sql]);
  // wrangler prints a JSON array of result sets: [{ results: [...] }]
  const parsed = JSON.parse(out);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return (first?.results ?? []) as T[];
}

function d1Exec(sql: string): void {
  if (!APPLY) return;
  wrangler(["d1", "execute", D1_NAME, "--remote", "--command", sql]);
}

/**
 * Ensure the destination table exists. Idempotent (CREATE TABLE IF NOT EXISTS),
 * so it's safe to run even in dry-run — it creates the empty table the queries
 * below depend on (the Worker also creates it lazily on first request) but
 * migrates no data on its own.
 */
function ensureCommunityPhotoTable(): void {
  wrangler([
    "d1", "execute", D1_NAME, "--remote", "--command",
    "CREATE TABLE IF NOT EXISTS community_photos (id TEXT PRIMARY KEY, bucket_id TEXT NOT NULL, r2_key TEXT NOT NULL, caption TEXT, created_at TEXT DEFAULT (datetime('now')))",
  ]);
  wrangler([
    "d1", "execute", D1_NAME, "--remote", "--command",
    "CREATE INDEX IF NOT EXISTS idx_community_photos_bucket ON community_photos(bucket_id)",
  ]);
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function kvListNoteKeys(): string[] {
  const out = wrangler(["kv", "key", "list", `--namespace-id=${KV_NAMESPACE_ID}`, "--remote"]);
  const arr = JSON.parse(out) as { name: string }[];
  return arr.map((k) => k.name).filter((n) => n.startsWith("notes:"));
}

function kvGet(key: string): string | null {
  try {
    return wrangler(["kv", "key", "get", key, `--namespace-id=${KV_NAMESPACE_ID}`, "--remote"]);
  } catch {
    return null;
  }
}

function kvPutFromFile(key: string, file: string): void {
  if (!APPLY) return;
  wrangler(["kv", "key", "put", key, `--path=${file}`, `--namespace-id=${KV_NAMESPACE_ID}`, "--remote"]);
}

function kvDelete(key: string): void {
  if (!APPLY) return;
  wrangler(["kv", "key", "delete", key, `--namespace-id=${KV_NAMESPACE_ID}`, "--remote"]);
}

function r2PutFromFile(key: string, file: string, contentType: string): void {
  if (!APPLY) return;
  wrangler(["r2", "object", "put", `${R2_BUCKET}/${key}`, `--file=${file}`, `--content-type=${contentType}`, "--remote"]);
}

interface LegacyPhoto {
  id: string;
  image_url: string;
  caption: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface NoteRecord {
  text: string;
  name?: string;
  ts: number;
}

async function migratePhotos(tmp: string): Promise<void> {
  const rows = d1Query<LegacyPhoto>(
    "SELECT mp.id AS id, mp.image_url AS image_url, mp.caption AS caption, " +
      "rc.name AS name, rc.latitude AS latitude, rc.longitude AS longitude " +
      "FROM menu_photos mp JOIN restaurant_cache rc ON mp.restaurant_id = rc.id " +
      "WHERE mp.source = 'user'"
  );
  let migrated = 0;
  let skipped = 0;
  let unresolved = 0;
  for (const row of rows) {
    if (!row.name || row.latitude == null || row.longitude == null) {
      unresolved++;
      continue;
    }
    let bucket: string;
    try {
      bucket = await computeBucketId(PEPPER, row.name, row.latitude, row.longitude);
    } catch {
      unresolved++;
      continue;
    }
    const newId = `mig_${row.id}`;
    // Idempotency: already migrated?
    const exists = d1Query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM community_photos WHERE id = ${sqlStr(newId)}`
    );
    if (Number(exists[0]?.n ?? 0) > 0) {
      skipped++;
      continue;
    }

    // Download the legacy image (public URL), strip metadata, re-upload.
    let strippedBytes: Uint8Array;
    let ext: string;
    let contentType: string;
    try {
      const res = await fetch(row.image_url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const raw = new Uint8Array(await res.arrayBuffer());
      const out = stripImageMetadata(raw);
      strippedBytes = out.bytes;
      ext = out.format === "png" ? "png" : "jpg";
      contentType = out.format === "png" ? "image/png" : "image/jpeg";
    } catch {
      // Can't fetch/strip (gone, or non-JPEG/PNG) — skip rather than store raw.
      unresolved++;
      continue;
    }

    const r2Key = `community/${bucket}/${newId}.${ext}`;
    const imgFile = join(tmp, `${newId}.${ext}`);
    writeFileSync(imgFile, strippedBytes);
    r2PutFromFile(r2Key, imgFile, contentType);

    const caption = row.caption ? sqlStr(row.caption.slice(0, 140)) : "NULL";
    d1Exec(
      `INSERT INTO community_photos (id, bucket_id, r2_key, caption) VALUES (${sqlStr(newId)}, ${sqlStr(bucket)}, ${sqlStr(r2Key)}, ${caption})`
    );
    // Remove the identifying legacy row (and let the old R2 object age out, or
    // delete it manually — we keep this conservative and only drop the D1 row).
    d1Exec(`DELETE FROM menu_photos WHERE id = ${sqlStr(row.id)}`);
    migrated++;
  }
  console.log(`photos: ${migrated} migrated, ${skipped} already-done, ${unresolved} unresolved (of ${rows.length})`);
}

async function migrateNotes(tmp: string): Promise<void> {
  const keys = kvListNoteKeys();
  let migrated = 0;
  let skipped = 0;
  let unresolved = 0;
  for (const key of keys) {
    const rid = key.slice("notes:".length);
    // Already-bucketed keys (notes:v1_...) are skipped — only legacy ids migrate.
    if (rid.startsWith("v1_")) {
      skipped++;
      continue;
    }
    const lookup = d1Query<{ name: string; latitude: number | null; longitude: number | null }>(
      `SELECT name, latitude, longitude FROM restaurant_cache WHERE id = ${sqlStr(rid)} LIMIT 1`
    );
    const r = lookup[0];
    if (!r || !r.name || r.latitude == null || r.longitude == null) {
      unresolved++;
      continue;
    }
    let bucket: string;
    try {
      bucket = await computeBucketId(PEPPER, r.name, r.latitude, r.longitude);
    } catch {
      unresolved++;
      continue;
    }

    const legacyRaw = kvGet(key);
    if (!legacyRaw) {
      skipped++;
      continue;
    }
    let legacyNotes: NoteRecord[] = [];
    try {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) legacyNotes = parsed;
    } catch {
      unresolved++;
      continue;
    }

    // Merge into any existing bucket notes (idempotent: dedupe by ts+text).
    const destKey = `notes:${bucket}`;
    let dest: NoteRecord[] = [];
    const destRaw = kvGet(destKey);
    if (destRaw) {
      try {
        const parsed = JSON.parse(destRaw);
        if (Array.isArray(parsed)) dest = parsed;
      } catch {
        dest = [];
      }
    }
    const seen = new Set(dest.map((n) => `${n.ts}|${n.text}`));
    for (const n of legacyNotes) {
      if (!seen.has(`${n.ts}|${n.text}`)) dest.push(n);
    }
    dest.sort((a, b) => a.ts - b.ts);
    const merged = dest.slice(-200);

    const noteFile = join(tmp, `note_${bucket}.json`);
    writeFileSync(noteFile, JSON.stringify(merged));
    kvPutFromFile(destKey, noteFile);
    kvDelete(key);
    migrated++;
  }
  console.log(`notes: ${migrated} migrated, ${skipped} skipped, ${unresolved} unresolved (of ${keys.length})`);
}

async function main(): Promise<void> {
  if (!APPLY) {
    console.log("DRY RUN — no writes. Re-run with --apply to execute.\n");
  } else if (!PEPPER) {
    console.error("ERROR: --apply requires RESTAURANT_BUCKET_PEPPER (same value as the Worker secret).");
    process.exit(1);
  }
  if (APPLY && PEPPER.length < 16) {
    console.error("ERROR: RESTAURANT_BUCKET_PEPPER looks too short — refusing to migrate with a weak pepper.");
    process.exit(1);
  }
  // In dry-run we still need a pepper to compute buckets for the report; use a
  // throwaway if none provided (counts only, nothing is written).
  if (!APPLY && !PEPPER) {
    console.log("(no RESTAURANT_BUCKET_PEPPER set — dry-run will still count rows, but bucket computation is skipped)\n");
  }

  ensureCommunityPhotoTable();

  const tmp = mkdtempSync(join(tmpdir(), "anon-mig-"));
  try {
    await migratePhotos(tmp);
    await migrateNotes(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(APPLY ? "\nDone." : "\nDry run complete — re-run with --apply to write.");
}

main().catch((e) => {
  // Never print identity; surface only the error class.
  console.error("Migration failed:", (e as Error)?.message ?? "unknown error");
  process.exit(1);
});
