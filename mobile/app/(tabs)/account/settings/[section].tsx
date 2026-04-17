import { View, Text, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { env } from "@/lib/env"

const titles: Record<string, string> = {
  general: "General",
  notifications: "Notifications",
  appearance: "Appearance",
  workflows: "Workflows",
  organization: "Organization",
  billing: "Billing",
}

export default function SettingsSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>()
  const title = titles[section ?? ""] ?? section ?? "Settings"

  function manageOnWeb() {
    Linking.openURL(`${env.apiBaseUrl}/dashboard/settings/${section ?? ""}`)
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen options={{ title }} />
      <View className="flex-1 p-4 gap-4">
        <Card>
          <Text className="text-foreground text-lg font-semibold">{title}</Text>
          <Text className="text-foreground/60 text-sm mt-2">
            Most settings live on the web dashboard for now. Tap below to open
            this section in your browser.
          </Text>
        </Card>
        <Button onPress={manageOnWeb}>Manage on web</Button>
      </View>
    </SafeAreaView>
  )
}
