// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-VRQEDPTBDFVN
// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import globals from "globals";

// eslint stays on 9.x: eslint-plugin-react (pulled in by eslint-config-expo)
// supports eslint <= 9 and crashes on 10 (context.getFilename was removed).
export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Pin the React version so eslint-plugin-react skips its "detect" path,
    // which calls context.getFilename(). That keeps lint working in a
    // node_modules that still has ESLint 10, not only on the pinned 9.x.
    settings: { react: { version: "19.1" } },
  },
  {
    // Build/config scripts run in Node, not the app runtime.
    files: ["**/*.cjs", "**/*.mjs", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
]);
