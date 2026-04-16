import "../global.css"
import { useEffect, useState } from "react"
import { Slot } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { StatusBar } from "expo-status-bar"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { AuthGate } from "@/components/providers/auth-gate"
import { queryClient, queryPersister } from "@/lib/query-client"
import { useAuthStore } from "@/auth/use-auth-store"
import { initSentry } from "@/lib/sentry"
import { registerPushToken } from "@/push/register"

initSentry()

export default function RootLayout() {
  const bootstrap = useAuthStore(s => s.bootstrap)
  const ready = useAuthStore(s => s.ready)
  const activeAccount = useAuthStore(s => s.activeAccount)
  const [pushAttempted, setPushAttempted] = useState(false)

  useEffect(() => { void bootstrap() }, [bootstrap])

  useEffect(() => {
    if (activeAccount && !pushAttempted) {
      setPushAttempted(true)
      void registerPushToken().catch(() => {})
    }
  }, [activeAccount, pushAttempted])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister }}
      >
        <ThemeProvider>
          <StatusBar style="auto" />
          <AuthGate>
            <Slot />
          </AuthGate>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}
