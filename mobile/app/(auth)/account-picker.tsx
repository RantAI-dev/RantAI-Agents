import { useEffect, useState } from "react"
import { View, Text, FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuthStore } from "@/auth/use-auth-store"
import { listAccounts, type StoredAccount } from "@/auth/account-store"
import { Button } from "@/components/ui/button"

export default function AccountPickerScreen() {
  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const router = useRouter()
  const switchAccount = useAuthStore(s => s.switchAccount)

  useEffect(() => { listAccounts().then(setAccounts) }, [])

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 py-6 gap-3">
        <Text className="text-2xl font-semibold text-foreground">Switch account</Text>
        <FlatList
          data={accounts}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <Pressable
              className="py-3 border-b border-border active:opacity-60"
              onPress={async () => {
                await switchAccount(item.id)
                router.replace("/(tabs)/chat")
              }}
            >
              <Text className="text-foreground text-base">{item.name}</Text>
              <Text className="text-foreground/60 text-sm">{item.email}</Text>
            </Pressable>
          )}
        />
        <Button variant="outline" onPress={() => router.push("/(auth)/login")}>
          Add account
        </Button>
      </View>
    </SafeAreaView>
  )
}
