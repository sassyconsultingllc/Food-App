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
    // Build/config scripts run in Node, not the app runtime.
    files: ["**/*.cjs", "**/*.mjs", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
]);
