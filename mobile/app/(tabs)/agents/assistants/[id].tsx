import { ScrollView, View, Text, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { useAssistant } from "@/features/agents/use-assistants"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

export default function AssistantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useAssistant(id ?? null)

  function manageOnWeb() {
    Linking.openURL(`${env.apiBaseUrl}/dashboard/agent-builder/${id}`)
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Assistant" }} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-foreground/60">Loading…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen options={{ title: data.name }} />
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        <Card>
          <Text className="text-foreground text-xl font-semibold">{data.name}</Text>
          {data.description && (
            <Text className="text-foreground/70 mt-1">{data.description}</Text>
          )}
        </Card>
        {data.systemPrompt && (
          <Card>
            <Text className="text-foreground/60 text-xs uppercase mb-2">
              System prompt
            </Text>
            <Text className="text-foreground" selectable>
              {data.systemPrompt}
            </Text>
          </Card>
        )}
        <View className="flex-row gap-2">
          {data.modelId && <Pill label="Model" value={data.modelId} />}
          {typeof data.temperature === "number" && (
            <Pill label="Temp" value={data.temperature.toFixed(1)} />
          )}
          {data.isPublic && <Pill label="Public" value="✓" />}
        </View>
        <Button variant="outline" onPress={manageOnWeb}>
          Manage on web
        </Button>
      </ScrollView>
    </SafeAreaView>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-muted px-3 py-1.5 rounded-full">
      <Text className="text-foreground/70 text-xs">
        <Text className="text-foreground/50">{label}: </Text>
        {value}
      </Text>
    </View>
  )
}
