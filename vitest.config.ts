import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";
import { transformSync } from "@babel/core";
// @ts-ignore — no type declarations for this babel plugin
import flowStripTypes from "@babel/plugin-transform-flow-strip-types";

console.log("[vitest] config loaded");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const flowStripPlugin = {
  name: "flow-strip-types",
  enforce: "pre",
  transform(code: string, id: string) {
    if (!id.includes("node_modules")) return null;
    console.log(`[vitest] transforming ${id}`);
    // Strip Flow/typeof exports from any dependency; safe for TS/JS output.
    const result = transformSync(code, {
      plugins: [flowStripTypes],
      filename: id,
      babelrc: false,
      configFile: false,
    });
    return { code: result?.code ?? code };
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.tsx"],
    include: [
      "__tests__/**/*.test.ts",
      "__tests__/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["__tests__/components/**"],
    server: {
      deps: {
        inline: [
          /react-native/,
          /@testing-library\/react-native/,
          /react-test-renderer/,
          /react-native-reanimated/,
          /react-native-gesture-handler/,
          /react-native-safe-area-context/,
          /react-native-screens/,
        ],
      },
    },
  },
  plugins: [flowStripPlugin],
  resolve: {
    alias: [
      // Map React Native imports (and any subpaths) to a web-friendly mock so Flow syntax isn't parsed
      { find: /^react-native(\/.*)?$/, replacement: path.resolve(__dirname, "tests/react-native-mock.ts") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
});
