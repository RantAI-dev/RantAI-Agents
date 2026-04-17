import { useEffect, useRef } from "react"
import { KeyboardAvoidingView, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams } from "expo-router"
import { FlashList } from "@shopify/flash-list"
import { useConversation } from "@/features/chat/use-conversation"
import { useChatStream } from "@/features/chat/use-chat-stream"
import { useDraft } from "@/features/chat/use-draft"
import { MessageBubble } from "@/components/chat/message-bubble"
import { Composer } from "@/components/chat/composer"
import { TypingIndicator } from "@/components/chat/typing-indicator"

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: conv } = useConversation(id ?? null)
  const draft = useDraft(id ?? null)
  const listRef = useRef<FlashList<any>>(null)

  const { messages, sendMessage, status } = useChatStream({
    sessionId: id!,
    initialMessages: conv?.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  })

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length])

  function send() {
    if (!draft.text.trim()) return
    sendMessage({ role: "user", content: draft.text } as any)
    draft.clear()
  }

  function attach(_uri: string, _name: string, _mimeType: string) {
    // Wired in Plan 2c — file upload then append as a message attachment.
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen options={{ title: conv?.title ?? "Chat" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        style={{ flex: 1 }}
      >
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          estimatedItemSize={88}
          renderItem={({ item }) => (
            <MessageBubble role={item.role as any} content={item.content} />
          )}
          ListFooterComponent={
            status === "in_progress" ? <TypingIndicator /> : null
          }
        />
        <Composer
          value={draft.text}
          onChange={draft.setText}
          onSend={send}
          onAttach={attach}
          disabled={status === "in_progress"}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
