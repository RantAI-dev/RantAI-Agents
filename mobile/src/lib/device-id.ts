import { storage } from "./mmkv"
import * as Crypto from "expo-crypto"

const KEY = "device/id"

// Stable per-install identifier. Survives OS updates (Device.osInternalBuildId
// does not). Generated once on first launch and persisted in MMKV.
export function getDeviceId(): string {
  const existing = storage.getString(KEY)
  if (existing) return existing
  const id = Crypto.randomUUID()
  storage.set(KEY, id)
  return id
}
