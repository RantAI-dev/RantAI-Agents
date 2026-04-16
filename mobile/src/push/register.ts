import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import { Platform } from "react-native"
import { apiFetch } from "@/api/client"
import { getDeviceId } from "@/lib/device-id"

export async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null // simulators can't get tokens
  const { status: existing } = await Notifications.getPermissionsAsync()
  let final = existing
  if (existing !== "granted") {
    const ask = await Notifications.requestPermissionsAsync()
    final = ask.status
  }
  if (final !== "granted") return null

  const tokenData = await Notifications.getExpoPushTokenAsync()
  const expoPushToken = tokenData.data
  const platform = Platform.OS === "ios" ? "ios" : "android"
  await apiFetch("/api/mobile/push/register", {
    method: "POST",
    json: { deviceId: getDeviceId(), expoPushToken, platform },
  })
  return expoPushToken
}
