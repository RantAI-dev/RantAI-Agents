import { View, Text, Pressable, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useFiles } from "@/features/knowledge/use-files"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function KnowledgeScreen() {
  const router = useRouter()
  const { data, isLoading, refetch, isRefetching } = useFiles()

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-foreground text-2xl font-semibold">Knowledge</Text>
        <Text className="text-foreground/60 text-sm mt-1">Files</Text>
      </View>
      <FlashList
        data={data ?? []}
        keyExtractor={(f) => f.id}
        estimatedItemSize={72}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/knowledge/files/${item.id}`)}
            className="px-4 py-3 border-b border-border active:opacity-60"
          >
            <Text className="text-foreground font-medium" numberOfLines={1}>
              {item.name}
            </Text>
            <View className="flex-row gap-3 mt-1">
              <Text className="text-foreground/60 text-xs">
                {formatBytes(item.size)}
              </Text>
              <Text className="text-foreground/60 text-xs">{item.status}</Text>
              {item.category && (
                <Text className="text-foreground/60 text-xs">{item.category}</Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16">
            <Text className="text-foreground/60">
              {isLoading ? "Loading…" : "No files yet"}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}
