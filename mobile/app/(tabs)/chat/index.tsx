import { View, Text, RefreshControl, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { Plus } from "lucide-react-native"
import { useConversations } from "@/features/chat/use-conversations"
import { Button } from "@/components/ui/button"

export default function ChatListScreen() {
  const router = useRouter()
  const { data: conversations, isLoading, refetch, isRefetching } = useConversations()

  if (isLoading && !conversations) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <Text className="text-foreground/60">Loading…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!conversations || conversations.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-foreground text-lg">No conversations yet</Text>
          <Button onPress={() => router.push("/(tabs)/chat/new")}>Start a chat</Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 py-3 flex-row items-center justify-between border-b border-border">
        <Text className="text-foreground text-2xl font-semibold">Chat</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/chat/new")}
          className="p-2 active:opacity-60"
          accessibilityLabel="New chat"
        >
          <Plus size={22} color="currentColor" />
        </Pressable>
      </View>
      <FlashList
        data={conversations}
        keyExtractor={(c) => c.id}
        estimatedItemSize={72}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
            className="px-4 py-3 border-b border-border active:opacity-60"
          >
            <Text className="text-foreground font-medium" numberOfLines={1}>
              {item.title || "Untitled"}
            </Text>
            {item.lastMessagePreview && (
              <Text
                className="text-foreground/60 text-sm mt-1"
                numberOfLines={1}
              >
                {item.lastMessagePreview}
              </Text>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}
