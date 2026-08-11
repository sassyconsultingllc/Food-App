// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// In-memory stand-in for @react-native-async-storage/async-storage under
// Vitest — the real package needs a native module host.
const store = new Map<string, string>();

const AsyncStorageMock = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? (store.get(key) as string) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async clear(): Promise<void> {
    store.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return Array.from(store.keys());
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) store.delete(k);
  },
  async multiSet(pairs: [string, string][]): Promise<void> {
    for (const [k, v] of pairs) store.set(k, v);
  },
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return keys.map((k) => [k, store.has(k) ? (store.get(k) as string) : null]);
  },
};

export default AsyncStorageMock;
