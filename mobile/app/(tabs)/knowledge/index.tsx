import { View, Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

export default function KnowledgeTab() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-foreground text-lg">Knowledge — coming in Phase C.</Text>
      </View>
    </SafeAreaView>
  )
}
