import { MMKV } from "react-native-mmkv"

export const storage = new MMKV({ id: "rantai-mobile" })

export function namespacedKey(ns: string, key: string): string {
  return `${ns}/${key}`
}

// AsyncStorage-compatible adapter for libraries that expect promises
// (e.g. TanStack Query's persister).
export const mmkvAsyncAdapter = {
  async getItem(key: string): Promise<string | null> {
    return storage.getString(key) ?? null
  },
  async setItem(key: string, value: string): Promise<void> {
    storage.set(key, value)
  },
  async removeItem(key: string): Promise<void> {
    storage.delete(key)
  },
}
