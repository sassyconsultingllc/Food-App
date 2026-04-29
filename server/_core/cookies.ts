import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

/**
 * Common multi-level public suffixes. NOT a complete PSL — pulling the
 * full Mozilla public-suffix list as a dependency is overkill for an app
 * that ships without auth — but covers the cases that would cause naive
 * `parts.slice(-2)` to return a public suffix as the "parent domain"
 * (e.g. ".co.uk", which would let a cookie leak to every UK site).
 *
 * Format: each entry is the suffix WITHOUT the leading dot, lowercase.
 */
const KNOWN_MULTI_SUFFIXES = new Set([
  // UK
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "net.uk",
  // Australia
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  // Brazil
  "com.br", "net.br", "org.br", "gov.br",
  // Japan
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
  // India
  "co.in", "net.in", "org.in", "ac.in", "gov.in",
  // South Africa
  "co.za", "org.za", "gov.za", "ac.za",
  // New Zealand
  "co.nz", "org.nz", "ac.nz", "govt.nz",
  // Mexico
  "com.mx", "org.mx", "gob.mx",
  // China
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  // Korea
  "co.kr", "ne.kr", "or.kr", "go.kr", "ac.kr",
  // Singapore
  "com.sg", "org.sg", "gov.sg", "edu.sg",
  // Israel
  "co.il", "org.il", "ac.il",
  // Italy
  "co.it", "gov.it",
  // Germany
  "co.de",
]);

/**
 * Extract parent domain for cookie sharing across subdomains.
 * e.g., "3000-xxx.manuspre.computer" -> ".manuspre.computer"
 * This allows cookies set by 3000-xxx to be read by 8081-xxx.
 *
 * Returns undefined for cases where naive parent extraction would set
 * the cookie on a public suffix (e.g. "site.co.uk" → ".co.uk" would let
 * cookies leak to every other UK domain). Without a full public-suffix
 * list we use a hand-rolled allowlist of common multi-level suffixes —
 * if the second-and-third parts of the host match a known multi-suffix
 * we require 4+ parts and use the third-to-last as the e-TLD+1.
 */
function getParentDomain(hostname: string): string | undefined {
  if (LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return undefined;
  }

  const parts = hostname.toLowerCase().split(".");
  if (parts.length < 3) return undefined;

  // Check whether the last two parts form a known multi-level public
  // suffix (e.g. "co.uk"). If so, the registrable domain is the LAST
  // THREE parts and we need at least 4 to safely set a parent.
  const lastTwo = parts.slice(-2).join(".");
  if (KNOWN_MULTI_SUFFIXES.has(lastTwo)) {
    if (parts.length < 4) return undefined;
    return "." + parts.slice(-3).join(".");
  }

  return "." + parts.slice(-2).join(".");
}

export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const domain = getParentDomain(hostname);

  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
