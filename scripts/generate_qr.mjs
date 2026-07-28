#!/usr/bin/env node
// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-OM2EF5UBY4ER
import QRCode from "qrcode";

const url = process.argv[2];

if (!url) {
  console.error('Usage: node scripts/generate_qr.mjs "exps://..."');
  process.exit(1);
}

await QRCode.toFile("expo-qr-code.png", url, { width: 512 });
console.log(`✅ QR code saved to expo-qr-code.png`);
