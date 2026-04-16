import { vi } from "vitest"

vi.mock("expo-secure-store", () => {
  const store = new Map<string, string>()
  return {
    getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    deleteItemAsync: vi.fn(async (k: string) => { store.delete(k) }),
  }
})

vi.mock("react-native-mmkv", () => {
  const map = new Map<string, any>()
  class MMKV {
    getString(k: string) { return map.get(k) }
    set(k: string, v: any) { map.set(k, v) }
    delete(k: string) { map.delete(k) }
    getBoolean(k: string) { return map.get(k) }
    getNumber(k: string) { return map.get(k) }
  }
  return { MMKV }
})

vi.mock("expo-crypto", () => ({
  randomUUID: () => "test-uuid-aaaa-bbbb-cccc-dddddddddddd",
}))

vi.mock("expo-device", () => ({
  isDevice: false,
  deviceName: "Test Device",
  modelName: "Test Model",
  osInternalBuildId: "test-build",
}))
