// Lightweight React Native mock for Vitest that re-exports react-native-web
// to avoid parsing Flow syntax from react-native in a Node/Vitest environment.
// This log helps confirm the mock is being loaded when tests import react-native.
console.log("[vitest] Using react-native mock");
// @ts-ignore — react-native-web lacks type declarations in this project
import * as RNWeb from "react-native-web";

// @ts-ignore
export * from "react-native-web";
export default RNWeb;
