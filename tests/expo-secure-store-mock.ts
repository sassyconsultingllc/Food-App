// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// In-memory stand-in for expo-secure-store under Vitest. The real module
// pulls expo-modules-core (native bindings + TS syntax the flow-strip
// transform can't parse), which broke any test importing lib/license.ts.
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test helper — not part of the real expo-secure-store surface. */
export function __resetSecureStore(): void {
  store.clear();
}

export default { getItemAsync, setItemAsync, deleteItemAsync };
