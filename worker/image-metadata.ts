/**
 * Image Metadata Stripper
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Removes privacy-sensitive metadata (EXIF GPS, device model, timestamps, XMP,
 * IPTC, text chunks) from user-uploaded images BEFORE they are stored, so an
 * anonymous upload can't leak the uploader's location/device through the file.
 *
 * Pure byte surgery -- no native libs, runs in the Workers runtime and Node.
 * Supports JPEG and PNG (the formats the picker produces). Anything else THROWS
 * so the caller fails the upload closed rather than storing an un-stripped image
 * -- never silently pass an unknown format through.
 *
 * Format is detected from MAGIC BYTES, never from the client-supplied
 * Content-Type (which is attacker-controlled).
 */

export type ImageFormat = "jpeg" | "png";

export interface StrippedImage {
  bytes: Uint8Array;
  format: ImageFormat;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v);
}

/**
 * JPEG: drop every APPn segment (FFE0-FFEF — EXIF/XMP/ICC/Photoshop live here)
 * and COM comment segments (FFFE). Everything from the Start-of-Scan (FFDA)
 * onward is the entropy-coded image data and is copied verbatim.
 */
function stripJpeg(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) throw new Error("stripJpeg: not a JPEG");
  const parts: Uint8Array[] = [b.subarray(0, 2)]; // SOI (FFD8)
  let i = 2;
  while (i < b.length) {
    // A marker is 0xFF followed by a non-0xFF, non-0x00 byte. Skip 0xFF fill.
    while (i < b.length && b[i] === 0xff && b[i + 1] === 0xff) i++;
    if (i + 1 >= b.length || b[i] !== 0xff) {
      throw new Error("stripJpeg: expected marker");
    }
    const marker = b[i + 1];

    if (marker === 0xd9) {
      // EOI
      parts.push(b.subarray(i, i + 2));
      break;
    }
    if (marker === 0xda) {
      // SOS — copy the rest of the file (scan data + EOI) untouched
      parts.push(b.subarray(i));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      // RSTn — standalone, no length
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }

    // Length-prefixed segment: 2-byte big-endian length includes the 2 length
    // bytes but not the marker.
    if (i + 3 >= b.length) throw new Error("stripJpeg: truncated marker length");
    const len = (b[i + 2] << 8) | b[i + 3];
    const segEnd = i + 2 + len;
    if (len < 2 || segEnd > b.length) throw new Error("stripJpeg: truncated segment");

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isCom = marker === 0xfe;
    if (!isApp && !isCom) {
      parts.push(b.subarray(i, segEnd)); // keep DQT/DHT/SOF/etc.
    }
    i = segEnd;
  }
  return concat(parts);
}

/**
 * PNG: drop text/metadata chunks (tEXt/zTXt/iTXt/eXIf/tIME). Other chunks
 * (IHDR/PLTE/IDAT/IEND and rendering ancillaries) are copied verbatim, so their
 * CRCs stay valid — we only delete chunks, never rewrite them.
 */
function stripPng(b: Uint8Array): Uint8Array {
  if (!isPng(b)) throw new Error("stripPng: not a PNG");
  const DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const parts: Uint8Array[] = [b.subarray(0, 8)]; // signature
  let i = 8;
  while (i < b.length) {
    if (i + 12 > b.length) throw new Error("stripPng: truncated chunk header");
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const chunkEnd = i + 12 + len; // 4 len + 4 type + data + 4 crc
    if (chunkEnd > b.length) throw new Error("stripPng: truncated chunk");
    if (!DROP.has(type)) parts.push(b.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === "IEND") break;
  }
  return concat(parts);
}

/**
 * Strip all privacy-sensitive metadata from an uploaded image.
 * @throws if the format is not JPEG/PNG or the file is malformed — callers MUST
 *         treat a throw as "reject this upload" (fail closed).
 */
export function stripImageMetadata(input: Uint8Array): StrippedImage {
  if (isJpeg(input)) return { bytes: stripJpeg(input), format: "jpeg" };
  if (isPng(input)) return { bytes: stripPng(input), format: "png" };
  throw new Error("stripImageMetadata: unsupported image format (only JPEG/PNG accepted)");
}
