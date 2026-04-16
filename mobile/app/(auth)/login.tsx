import { useState } from "react"
import { View, Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/auth/use-auth-store"

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = useAuthStore(s => s.signIn)

  async function onSubmit() {
    setBusy(true); setError(null)
    try { await signIn(email.trim(), password) }
    catch (e: any) {
      setError(e?.status === 401 ? "Invalid email or password" : "Something went wrong")
    } finally { setBusy(false) }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6 gap-4">
        <Text className="text-3xl font-semibold text-foreground">Sign in</Text>
        <Input
          placeholder="Email"
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password"
          accessibilityLabel="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text className="text-danger text-sm">{error}</Text>}
        <Button onPress={onSubmit} disabled={busy} accessibilityLabel="Sign in">
          {busy ? "Signing in..." : "Sign in"}
        </Button>
      </View>
    </SafeAreaView>
  )
}
