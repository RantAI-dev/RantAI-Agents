import { useEffect, useState } from "react"
import { storage } from "@/lib/mmkv"

const draftKey = (id: string) => `draft/conversation/${id}`

export function useDraft(conversationId: string | null) {
  const [text, setText] = useState("")

  useEffect(() => {
    if (!conversationId) {
      setText("")
      return
    }
    setText(storage.getString(draftKey(conversationId)) ?? "")
  }, [conversationId])

  function update(value: string) {
    setText(value)
    if (!conversationId) return
    if (value) storage.set(draftKey(conversationId), value)
    else storage.delete(draftKey(conversationId))
  }

  function clear() {
    if (conversationId) storage.delete(draftKey(conversationId))
    setText("")
  }

  return { text, setText: update, clear }
}
