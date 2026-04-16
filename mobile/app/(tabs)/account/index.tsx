import { useEffect, useState } from "react"
import { View, Text, Switch } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuthStore } from "@/auth/use-auth-store"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  isBiometricEnabled,
  isBiometricSupported,
  setBiometricEnabled,
  promptBiometric,
} from "@/auth/biometric"

export default function AccountScreen() {
  const router = useRouter()
  const activeAccount = useAuthStore(s => s.activeAccount)
  const signOut = useAuthStore(s => s.signOutCurrent)
  const [bioOn, setBioOn] = useState(isBiometricEnabled())
  const [bioSupported, setBioSupported] = useState(false)

  useEffect(() => { isBiometricSupported().then(setBioSupported) }, [])

  async function toggleBio(next: boolean) {
    if (next) {
      const ok = await promptBiometric()
      if (!ok) return
    }
    setBiometricEnabled(next)
    setBioOn(next)
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 py-6 gap-4">
        <Card>
          <Text className="text-foreground text-lg font-semibold">{activeAccount?.name}</Text>
          <Text className="text-foreground/60">{activeAccount?.email}</Text>
        </Card>
        <Card>
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground">Biometric unlock</Text>
            <Switch value={bioOn} onValueChange={toggleBio} disabled={!bioSupported} />
          </View>
        </Card>
        <Button variant="outline" onPress={() => router.push("/(auth)/account-picker")}>
          Switch account
        </Button>
        <Button
          variant="destructive"
          onPress={async () => { await signOut(); router.replace("/(auth)/login") }}
        >
          Sign out
        </Button>
      </View>
    </SafeAreaView>
  )
}
