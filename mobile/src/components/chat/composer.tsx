import { useState } from "react"
import { View, Pressable } from "react-native"
import { Plus, Send } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import { Input } from "@/components/ui/input"
import { AttachmentSheet } from "./attachment-sheet"
import { VoiceButton } from "./voice-button"

export interface ComposerProps {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  onAttach: (uri: string, name: string, mimeType: string) => void
  disabled?: boolean
}

export function Composer({
  value,
  onChange,
  onSend,
  onAttach,
  disabled,
}: ComposerProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const canSend = value.trim().length > 0 && !disabled

  function send() {
    if (!canSend) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onSend()
  }

  return (
    <View className="border-t border-border bg-background px-3 py-2 flex-row items-end gap-2">
      <Pressable
        onPress={() => setSheetOpen(true)}
        className="p-2 active:opacity-60"
        accessibilityLabel="Attach"
      >
        <Plus size={22} color="currentColor" />
      </Pressable>
      <Input
        className="flex-1 max-h-32"
        placeholder="Message"
        accessibilityLabel="Message input"
        multiline
        value={value}
        onChangeText={onChange}
      />
      <VoiceButton
        onTranscript={(t) => onChange((value ? value + " " : "") + t)}
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        className="p-2 active:opacity-60"
        accessibilityLabel="Send"
      >
        <Send size={22} color={canSend ? "#1d4ed8" : "#9ca3af"} />
      </Pressable>
      <AttachmentSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={onAttach}
      />
    </View>
  )
}
