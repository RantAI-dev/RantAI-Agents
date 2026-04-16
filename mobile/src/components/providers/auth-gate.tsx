import { useEffect } from "react"
import { useRouter, useSegments } from "expo-router"
import { useAuthStore } from "@/auth/use-auth-store"
import { isBiometricEnabled, needsBiometricUnlock } from "@/auth/biometric"

export function AuthGate({ children }: { children: React.ReactNode }) {
  const ready = useAuthStore(s => s.ready)
  const activeAccount = useAuthStore(s => s.activeAccount)
  const accessToken = useAuthStore(s => s.accessToken)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    const inAuthGroup = segments[0] === "(auth)"
    if (!activeAccount && !inAuthGroup) {
      router.replace("/(auth)/login")
      return
    }
    if (
      activeAccount &&
      isBiometricEnabled() &&
      needsBiometricUnlock() &&
      segments.join("/") !== "(auth)/biometric"
    ) {
      router.replace("/(auth)/biometric")
      return
    }
    if (
      activeAccount &&
      !isBiometricEnabled() &&
      inAuthGroup &&
      segments[1] !== "account-picker"
    ) {
      router.replace("/(tabs)/chat")
    }
  }, [ready, activeAccount, accessToken, segments, router])

  return <>{children}</>
}
