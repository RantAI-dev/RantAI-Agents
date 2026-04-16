import { useEffect } from "react"
import { View, Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { Button } from "@/components/ui/button"
import { promptBiometric, setBiometricEnabled } from "@/auth/biometric"

export default function BiometricScreen() {
  const router = useRouter()

  async function unlock() {
    const ok = await promptBiometric()
    if (ok) router.replace("/(tabs)/chat")
  }

  useEffect(() => { void unlock() }, [])

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6 gap-6">
        <Text className="text-2xl font-semibold text-foreground">Unlock RantAI</Text>
        <Button onPress={unlock}>Use Face ID / Fingerprint</Button>
        <Button
          variant="ghost"
          onPress={() => { setBiometricEnabled(false); router.replace("/(tabs)/chat") }}
        >
          Use password instead
        </Button>
      </View>
    </SafeAreaView>
  )
}
