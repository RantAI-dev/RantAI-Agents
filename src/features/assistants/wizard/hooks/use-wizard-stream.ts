"use client"

import { useCallback, useRef, useState } from "react"
import type {
  WizardDraft,
  ProposeAgentInput,
  RefineAgentInput,
} from "../schema"

export interface WizardTurn {
  id: string
  role: "user" | "assistant"
  content: string
}

interface StreamHandlers {
  onProposal: (p: ProposeAgentInput) => void
  onRefinement: (p: RefineAgentInput) => void
}

interface SendArgs {
  text: string
  draft: WizardDraft
  history: WizardTurn[]
}

function nextId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function useWizardStream({ onProposal, onRefinement }: StreamHandlers) {
  const [turns, setTurns] = useState<WizardTurn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async ({ text, draft, history }: SendArgs) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      const userTurn: WizardTurn = {
        id: nextId(),
        role: "user",
        content: trimmed,
      }
      const assistantId = nextId()
      const all = [...history, userTurn]

      setTurns((prev) => [
        ...prev,
        userTurn,
        { id: assistantId, role: "assistant", content: "" },
      ])
      setStreaming(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch("/api/assistants/wizard/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: all.map((t) => ({
              id: t.id,
              role: t.role,
              content: t.content,
            })),
            draft,
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "")
          throw new Error(body || `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        const flushEvent = (raw: string) => {
          const t = raw.trim()
          if (!t) return
          const payload = t.startsWith("data:") ? t.slice(5).trim() : t
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
            setTurns((prev) =>
              prev.map((m) =>
                m.id === assistantId
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
          let idx: number
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 1)
            flushEvent(line)
          }
        }
        if (buffer.length > 0) flushEvent(buffer)
      } catch (err) {
        if (controller.signal.aborted) return
        const msg = err instanceof Error ? err.message : "Stream failed"
        setError(msg)
        setTurns((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `Error: ${msg}` }
              : m
          )
        )
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setStreaming(false)
      }
    },
    [streaming, onProposal, onRefinement]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setTurns([])
    setError(null)
    setStreaming(false)
  }, [])

  return { turns, streaming, error, send, stop, reset }
}
