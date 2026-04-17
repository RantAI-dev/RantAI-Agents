import { ScrollView, View, Text, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { useFile } from "@/features/knowledge/use-files"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

export default function FileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isLoading } = useFile(id ?? null)

  function open() {
    if (data?.url) Linking.openURL(data.url)
  }

  function manageOnWeb() {
    Linking.openURL(`${env.apiBaseUrl}/dashboard/files/${id}`)
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ title: "File" }} />
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
          <Text className="text-foreground/60 text-sm mt-1">{data.mimeType}</Text>
          <Text className="text-foreground/60 text-sm">
            Uploaded {new Date(data.uploadedAt).toLocaleString()}
          </Text>
        </Card>
        {data.url && <Button onPress={open}>Open file</Button>}
        <Button variant="outline" onPress={manageOnWeb}>
          Manage on web
        </Button>
      </ScrollView>
    </SafeAreaView>
  )
}
