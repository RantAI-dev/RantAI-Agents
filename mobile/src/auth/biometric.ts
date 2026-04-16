import * as LocalAuthentication from "expo-local-authentication"
import { storage } from "@/lib/mmkv"

const BIOMETRIC_ENABLED_KEY = "biometric/enabled"
const LAST_UNLOCK_AT_KEY = "biometric/lastUnlockAt"
const REPROMPT_INTERVAL_MS = 5 * 60 * 1000

export async function isBiometricSupported(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  return hasHardware && enrolled
}

export function isBiometricEnabled(): boolean {
  return storage.getBoolean(BIOMETRIC_ENABLED_KEY) ?? false
}

export function setBiometricEnabled(enabled: boolean): void {
  storage.set(BIOMETRIC_ENABLED_KEY, enabled)
  if (!enabled) storage.delete(LAST_UNLOCK_AT_KEY)
}

export function markUnlocked(): void {
  storage.set(LAST_UNLOCK_AT_KEY, Date.now())
}

export function needsBiometricUnlock(): boolean {
  if (!isBiometricEnabled()) return false
  const last = storage.getNumber(LAST_UNLOCK_AT_KEY) ?? 0
  return Date.now() - last > REPROMPT_INTERVAL_MS
}

export async function promptBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock RantAI",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  })
  if (result.success) markUnlocked()
  return result.success
}
