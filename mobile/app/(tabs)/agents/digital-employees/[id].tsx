import { ScrollView, View, Text, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { useDigitalEmployee } from "@/features/agents/use-digital-employees"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

export default function DigitalEmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useDigitalEmployee(id ?? null)

  function manageOnWeb() {
    Linking.openURL(`${env.apiBaseUrl}/dashboard/digital-employees/${id}`)
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Digital Employee" }} />
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
          <Text className="text-foreground/60 text-sm mt-1">{data.status}</Text>
        </Card>
        {data.containerId && (
          <Card>
            <Text className="text-foreground/60 text-xs uppercase mb-1">Container</Text>
            <Text className="text-foreground" selectable>
              {data.containerId}
            </Text>
          </Card>
        )}
        {data.lastActivityAt && (
          <Card>
            <Text className="text-foreground/60 text-xs uppercase mb-1">Last activity</Text>
            <Text className="text-foreground">
              {new Date(data.lastActivityAt).toLocaleString()}
            </Text>
          </Card>
        )}
        <Button variant="outline" onPress={manageOnWeb}>
          Manage on web
        </Button>
      </ScrollView>
    </SafeAreaView>
  )
}
