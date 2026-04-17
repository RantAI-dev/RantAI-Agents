"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Send, Loader2, Sparkles } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type {
  WizardDraft,
  ProposeAgentInput,
  RefineAgentInput,
} from "../schema"

export interface WizardChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

interface Props {
  draft: WizardDraft
  onProposal: (p: ProposeAgentInput) => void
  onRefinement: (p: RefineAgentInput) => void
}

const OPENING: WizardChatMessage = {
  id: "opening",
  role: "assistant",
  content: "In a sentence or two, what do you want this agent to do?",
}

function nextId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function WizardChat({ draft, onProposal, onRefinement }: Props) {
  const [messages, setMessages] = useState<WizardChatMessage[]>([OPENING])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef(draft)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: WizardChatMessage = {
      id: nextId(),
      role: "user",
      content: text,
    }
    const assistantMsgId = nextId()

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "" },
    ])
    setInput("")
    setIsStreaming(true)
    setError(null)

    try {
      const currentMessages = [...messages, userMsg].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))

      const res = await fetch("/api/assistants/wizard/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          draft: draftRef.current,
        }),
      })

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "")
        throw new Error(body || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const flushEvent = (raw: string) => {
        const trimmed = raw.trim()
        if (!trimmed) return
        const payload = trimmed.startsWith("data:")
          ? trimmed.slice(5).trim()
          : trimmed
        if (payload === "[DONE]" || payload === "") return

        let event: unknown
        try {
          event = JSON.parse(payload)
        } catch {
          return
        }
        if (!event || typeof event !== "object") return
        const e = event as {
          type?: string
          delta?: string
          toolName?: string
          input?: unknown
        }

        if (e.type === "text-delta" && typeof e.delta === "string") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + e.delta }
                : m
            )
          )
        } else if (e.type === "tool-input-available") {
          if (e.toolName === "proposeAgent" && e.input) {
            onProposal(e.input as ProposeAgentInput)
          } else if (e.toolName === "refineAgent" && e.input) {
            onRefinement(e.input as RefineAgentInput)
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIdx: number
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx)
          buffer = buffer.slice(newlineIdx + 1)
          flushEvent(line)
        }
      }
      if (buffer.length > 0) flushEvent(buffer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed"
      setError(msg)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: m.content || `Error: ${msg}` }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, messages, onProposal, onRefinement])

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex gap-2",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {m.role === "assistant" && (
                <Sparkles className="inline h-3 w-3 mr-1 align-text-top text-primary" />
              )}
              {m.content || (isStreaming && m.id === messages[messages.length - 1]?.id ? (
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
              ) : null)}
            </div>
          </div>
        ))}
        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
      </div>

      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer…"
          rows={1}
          className="min-h-[40px] max-h-[120px] resize-none"
          disabled={isStreaming}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
