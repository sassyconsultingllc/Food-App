// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-TEQ2MX5FNOV6
// Lightweight React Native mock for Vitest that re-exports react-native-web
// to avoid parsing Flow syntax from react-native in a Node/Vitest environment.
// This log helps confirm the mock is being loaded when tests import react-native.
console.log("[vitest] Using react-native mock");
// @ts-ignore — react-native-web lacks type declarations in this project
import * as RNWeb from "react-native-web";

// @ts-ignore
export * from "react-native-web";
export default RNWeb;
