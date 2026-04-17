import { View, Text, FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter, Stack } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import { useCreateConversation } from "@/features/chat/use-conversations"

interface Assistant {
  id: string
  name: string
  description?: string
}

export default function NewChatScreen() {
  const router = useRouter()
  const create = useCreateConversation()
  const { data } = useQuery({
    queryKey: ["assistants"],
    queryFn: () => apiFetch<{ assistants: Assistant[] }>("/api/assistants"),
    select: (d) => d.assistants,
  })

  async function start(_assistantId: string) {
    const sessionId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const conv = await create.mutateAsync(sessionId)
    router.replace(`/(tabs)/chat/${conv.id}`)
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "New chat" }} />
      <View className="flex-1 px-4 py-3">
        <Text className="text-foreground text-lg font-medium mb-3">
          Pick an assistant
        </Text>
        <FlatList
          data={data ?? []}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => start(item.id)}
              className="py-3 border-b border-border active:opacity-60"
            >
              <Text className="text-foreground font-medium">{item.name}</Text>
              {item.description && (
                <Text
                  className="text-foreground/60 text-sm mt-1"
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
              )}
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  )
}
