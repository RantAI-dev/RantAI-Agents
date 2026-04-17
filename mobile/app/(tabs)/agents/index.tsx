import { useState } from "react"
import { View, Text, Pressable, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { cn } from "@/lib/cn"
import { useAssistants } from "@/features/agents/use-assistants"
import { useDigitalEmployees } from "@/features/agents/use-digital-employees"

type Tab = "assistants" | "digital-employees"

export default function AgentsScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("assistants")
  const assistants = useAssistants()
  const employees = useDigitalEmployees()

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-foreground text-2xl font-semibold">Agents</Text>
        <View className="flex-row mt-3 gap-1 p-1 rounded-lg bg-muted">
          <SegmentButton active={tab === "assistants"} onPress={() => setTab("assistants")}>
            Assistants
          </SegmentButton>
          <SegmentButton
            active={tab === "digital-employees"}
            onPress={() => setTab("digital-employees")}
          >
            Digital Employees
          </SegmentButton>
        </View>
      </View>
      {tab === "assistants" ? (
        <FlashList
          data={assistants.data ?? []}
          keyExtractor={(a) => a.id}
          estimatedItemSize={72}
          refreshControl={
            <RefreshControl
              refreshing={assistants.isRefetching}
              onRefresh={assistants.refetch}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(tabs)/agents/assistants/${item.id}`)}
              className="px-4 py-3 border-b border-border active:opacity-60"
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
          ListEmptyComponent={
            <EmptyState text={assistants.isLoading ? "Loading…" : "No assistants yet"} />
          }
        />
      ) : (
        <FlashList
          data={employees.data ?? []}
          keyExtractor={(e) => e.id}
          estimatedItemSize={72}
          refreshControl={
            <RefreshControl
              refreshing={employees.isRefetching}
              onRefresh={employees.refetch}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push(`/(tabs)/agents/digital-employees/${item.id}`)
              }
              className="px-4 py-3 border-b border-border active:opacity-60"
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground font-medium">{item.name}</Text>
                <StatusPill status={item.status} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState text={employees.isLoading ? "Loading…" : "No digital employees yet"} />
          }
        />
      )}
    </SafeAreaView>
  )
}

function SegmentButton({
  active,
  onPress,
  children,
}: {
  active: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "flex-1 py-2 rounded-md items-center",
        active ? "bg-background" : "bg-transparent",
      )}
    >
      <Text
        className={cn(
          "text-sm",
          active ? "text-foreground font-medium" : "text-foreground/60",
        )}
      >
        {children}
      </Text>
    </Pressable>
  )
}

function StatusPill({ status }: { status: string }) {
  const isOnline = status === "RUNNING" || status === "ONLINE"
  return (
    <View
      className={cn(
        "px-2 py-0.5 rounded-full",
        isOnline ? "bg-primary/20" : "bg-muted",
      )}
    >
      <Text className="text-xs text-foreground/80">{status}</Text>
    </View>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <Text className="text-foreground/60">{text}</Text>
    </View>
  )
}
