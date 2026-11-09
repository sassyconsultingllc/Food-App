// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-VRQEDPTBDFVN
// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // eslint-plugin-react's "detect" calls context.getFilename(), which
    // ESLint 10 removed, so every react/* rule crashes the run. Pinning the
    // version skips the detection path entirely.
    settings: { react: { version: "19.1" } },
    rules: {
      // Guards against HTML parser quirks; React Native <Text> renders raw
      // apostrophes/quotes verbatim, so it only adds escaping noise here.
      "react/no-unescaped-entities": "off",
    },
  },
]);
