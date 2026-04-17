import { View, Text, Pressable, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { FlashList } from "@shopify/flash-list"
import { cn } from "@/lib/cn"
import { useAudit } from "@/features/ops/use-audit"

function statusColor(status: string): string {
  if (status === "SUCCESS" || status === "OK") return "bg-primary/20"
  if (status === "FAILED" || status === "ERROR") return "bg-danger/20"
  return "bg-muted"
}

export default function OpsScreen() {
  const { data, isLoading, refetch, isRefetching } = useAudit()

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-foreground text-2xl font-semibold">Ops</Text>
        <Text className="text-foreground/60 text-sm mt-1">Audit log</Text>
      </View>
      <FlashList
        data={data ?? []}
        keyExtractor={(e) => e.id}
        estimatedItemSize={72}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <Pressable className="px-4 py-3 border-b border-border active:opacity-60">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-foreground font-medium">{item.action}</Text>
                <Text className="text-foreground/60 text-xs mt-0.5">
                  {item.resource}
                  {item.resourceId ? ` · ${item.resourceId}` : ""}
                </Text>
                <Text className="text-foreground/50 text-xs mt-1">
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </View>
              <View
                className={cn("px-2 py-0.5 rounded-full", statusColor(item.status))}
              >
                <Text className="text-xs text-foreground/80">{item.status}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16">
            <Text className="text-foreground/60">
              {isLoading ? "Loading…" : "No audit entries"}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}
