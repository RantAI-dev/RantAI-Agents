"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Send, Trash2, Loader2, Bot, User, ThumbsUp, ThumbsDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/app/dashboard/_components/chat/markdown-content"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  feedback?: "up" | "down" | null
  followUps?: string[]
}

interface ChatTestPanelProps {
  workflowId: string
  onClose: () => void
  onExecuteComplete?: () => void
}

/** Parse follow-up suggestions from text delimited by ---SUGGESTIONS--- */
function parseSuggestions(text: string): { displayText: string; followUps: string[] } {
  const idx = text.indexOf("---SUGGESTIONS---")
  if (idx < 0) return { displayText: text, followUps: [] }
  const displayText = text.substring(0, idx).trimEnd()
  const suggestionsBlock = text.substring(idx + "---SUGGESTIONS---".length).trim()
  const followUps = suggestionsBlock
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0)
  return { displayText, followUps }
}

export function ChatTestPanel({ workflowId, onClose, onExecuteComplete }: ChatTestPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadId, setThreadId] = useState(() => `test_${workflowId}_${Date.now()}`)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const chatflowConfig = useWorkflowEditor((s) => s.chatflowConfig)
  const welcomeMessage = chatflowConfig.welcomeMessage
  const starterPrompts = chatflowConfig.starterPrompts || []

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim()
    if (!text || isStreaming) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsStreaming(true)

    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
    ])

    try {
      const res = await fetch(`/api/dashboard/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { message: text }, threadId }),
      })

      if (!res.ok) {
        const errText = await res.text()
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${res.status} — ${errText || "Failed to get response"}` }
              : m
          )
        )
        setIsStreaming(false)
        return
      }

      const contentType = res.headers.get("content-type") || ""

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Stream response
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let accumulated = ""
        const isSSE = contentType.includes("text/event-stream")

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })

            if (isSSE) {
              // SSE format: parse "data: ..." lines
              for (const line of chunk.split("\n")) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6)
                  if (data === "[DONE]") continue
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.text) accumulated += parsed.text
                    else if (parsed.content) accumulated += parsed.content
                    else if (typeof parsed === "string") accumulated += parsed
                  } catch {
                    accumulated += data
                  }
                }
              }
            } else {
              // Plain text stream (toTextStreamResponse) — preserve raw text including newlines
              accumulated += chunk
            }

            // Strip ---SOURCES--- and ---SUGGESTIONS--- delimiters from display
            let displayChunk = accumulated
            const sourcesIdx = displayChunk.indexOf("\n\n---SOURCES---\n")
            if (sourcesIdx >= 0) displayChunk = displayChunk.substring(0, sourcesIdx)
            const sugIdx = displayChunk.indexOf("---SUGGESTIONS---")
            if (sugIdx >= 0) displayChunk = displayChunk.substring(0, sugIdx).trimEnd()

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: displayChunk } : m
              )
            )
          }
        }

        // Strip sources from final accumulated text
        const finalSourcesIdx = accumulated.indexOf("\n\n---SOURCES---\n")
        if (finalSourcesIdx >= 0) accumulated = accumulated.substring(0, finalSourcesIdx)

        // Parse follow-up suggestions from the final text
        const { displayText: finalText, followUps } = parseSuggestions(accumulated)

        // Update message with clean text and follow-ups
        if (finalText || followUps.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: finalText || "(No response content)", followUps: followUps.length > 0 ? followUps : undefined }
                : m
            )
          )
        } else if (!accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: "(No response content)" } : m
            )
          )
        }
      } else {
        // JSON response
        const data = await res.json()
        const content =
          data.output?.text ||
          data.output?.message ||
          data.result?.text ||
          data.text ||
          (typeof data.output === "string" ? data.output : JSON.stringify(data.output || data, null, 2))

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content } : m
          )
        )
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${err instanceof Error ? err.message : "Network error"}` }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
      onExecuteComplete?.()
    }
  }, [input, isStreaming, workflowId, threadId, onExecuteComplete])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
    setInput("")
    setThreadId(`test_${workflowId}_${Date.now()}`)
  }

  const handleFeedback = (msgId: string, type: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, feedback: m.feedback === type ? null : type }
          : m
      )
    )
  }

  const showStarterPrompts = messages.length === 0 && starterPrompts.length > 0

  return (
    <div className="w-[320px] shrink-0 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold">Test Chat</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleClear}
            title="Clear chat"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Empty state with welcome message */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Bot className="h-8 w-8 opacity-30" />
            {welcomeMessage ? (
              <p className="text-xs text-center">{welcomeMessage}</p>
            ) : (
              <p className="text-xs text-center">
                Send a message to test your chatflow workflow
              </p>
            )}
          </div>
        )}

        {/* Starter prompts */}
        {showStarterPrompts && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {starterPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="text-[11px] px-2.5 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="h-6 w-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-xs max-w-[85%] break-words",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                    : "bg-muted"
                )}
              >
                {msg.content ? (
                  msg.role === "assistant" ? (
                    <MarkdownContent content={msg.content} className="chat-message max-w-none text-xs" />
                  ) : (
                    msg.content
                  )
                ) : (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </span>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </div>

            {/* Feedback buttons for assistant messages */}
            {msg.role === "assistant" && msg.content && !isStreaming && (
              <div className="flex items-center gap-0.5 ml-8 mt-0.5">
                <button
                  onClick={() => handleFeedback(msg.id, "up")}
                  className={cn(
                    "p-1 rounded hover:bg-muted transition-colors",
                    msg.feedback === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  )}
                  title="Good response"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleFeedback(msg.id, "down")}
                  className={cn(
                    "p-1 rounded hover:bg-muted transition-colors",
                    msg.feedback === "down"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  )}
                  title="Bad response"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Follow-up suggestion chips */}
            {msg.role === "assistant" && msg.followUps && msg.followUps.length > 0 && !isStreaming && (
              <div className="flex flex-wrap gap-1 ml-8 mt-1.5">
                {msg.followUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(q)}
                    className="text-[10px] px-2 py-1 rounded-full border bg-background hover:bg-muted transition-colors text-foreground text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-2">
        <div className="flex items-end gap-1.5">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="text-xs min-h-[36px] max-h-[100px] resize-none"
            rows={1}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
