import { View, Text, Pressable } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as Haptics from "expo-haptics"
import { cn } from "@/lib/cn"

export interface MessageBubbleProps {
  role: "user" | "assistant" | "system" | "tool"
  content: string
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user"

  async function copy() {
    await Haptics.selectionAsync()
    await Clipboard.setStringAsync(content)
  }

  return (
    <View className={cn("px-4 py-2", isUser ? "items-end" : "items-start")}>
      <Pressable
        onLongPress={copy}
        className={cn(
          "rounded-2xl px-4 py-3 max-w-[85%]",
          isUser ? "bg-primary" : "bg-muted",
        )}
      >
        <Text className={cn(isUser ? "text-white" : "text-foreground")}>
          {content}
        </Text>
      </Pressable>
    </View>
  )
}
