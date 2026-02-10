"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Copy,
  Pencil,
  Trash2,
  RefreshCw,
  Check,
  ArrowDown,
  AlertCircle,
  Reply,
  X,
  Headphones,
  Loader2,
} from "lucide-react"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { CodeBlock } from "./code-block"
import { TypingIndicator, ButtonLoadingIndicator } from "./typing-indicator"
import { QuickSuggestions } from "./quick-suggestions"
import { MessageSources, Source } from "./message-sources"
import { ConversationExport } from "./conversation-export"
import { CommandPalette } from "./command-palette"
import { FileUploadButton } from "./file-upload-button"
import { FilePreview } from "./file-preview"
import { ThreadIndicator, ReplyButton, MessageReplyIndicator } from "./thread-indicator"
import { EditVersionIndicator, getVersionContent, getVersionAssistantResponse } from "./edit-version-indicator"
import { ToolCallIndicator } from "./tool-call-indicator"

// Delimiter for sources metadata in streaming response
const SOURCES_DELIMITER = "\n\n---SOURCES---\n"

// Marker for agent handoff in AI responses
const AGENT_HANDOFF_MARKER = "[AGENT_HANDOFF]"

// Handoff state type
type HandoffState = "idle" | "requesting" | "waiting" | "connected" | "resolved"

interface ChatWorkspaceProps {
  session?: ChatSession
  assistant: Assistant
  onBack?: () => void
  onUpdateSession?: (sessionId: string, updates: Partial<ChatSession>) => void
  onNewChat?: () => void
}

// Edit history entry for versioning - includes both user prompt and AI response
interface EditHistoryEntry {
  content: string // The user's prompt
  assistantResponse?: string // The AI's response to this prompt
  editedAt: Date
}

// Extended message type with sources and edit history
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt?: Date
  sources?: Source[]
  replyTo?: string
  editHistory?: EditHistoryEntry[] // Previous versions of the message
}

// Helper to extract text content from UIMessage parts
function getMessageContent(message: {
  content?: string
  parts?: Array<{ type: string; text?: string }>
}): string {
  if (message.content) {
    return message.content
  }
  if (message.parts) {
    return message.parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("")
  }
  return ""
}

// Extract tool call parts from UIMessage parts array
interface ToolCallPart {
  toolName: string
  toolCallId: string
  state: "input-streaming" | "input-available" | "execution-started" | "done" | "error"
  input?: Record<string, unknown>
  output?: unknown
  errorText?: string
}

function getToolCallParts(message: {
  parts?: Array<Record<string, unknown>>
}): ToolCallPart[] {
  if (!message.parts) return []
  return message.parts
    .filter((part) => part.type === "tool-invocation")
    .map((part) => {
      // Map SDK states to our indicator states
      const rawState = part.state as string
      let state: ToolCallPart["state"] = "done"
      if (rawState === "partial-call") state = "input-streaming"
      else if (rawState === "call") state = "execution-started"
      else if (rawState === "result") state = "done"
      else if (rawState === "error") state = "error"

      return {
        toolName: (part.toolName as string) || "unknown",
        toolCallId: (part.toolCallId as string) || "",
        state,
        input: part.args as Record<string, unknown> | undefined,
        output: part.output,
        errorText: part.errorText as string | undefined,
      }
    })
}

// Normalize role from useChat (may include "system") to ChatMessage.role
function toChatMessageRole(
  role: string
): "user" | "assistant" {
  return role === "system" ? "assistant" : (role as "user" | "assistant")
}

// Type for message that may have extended fields (replyTo, editHistory) from our layer
type MessageWithExtras = ChatMessage & { replyTo?: string; editHistory?: EditHistoryEntry[] }

// Message Actions component
function MessageActions({
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
  onReply,
  isUser,
  copied,
}: {
  onCopy: () => void
  onEdit?: () => void
  onDelete?: () => void
  onRegenerate?: () => void
  onReply?: () => void
  isUser: boolean
  copied: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onCopy}
        title="Copy message"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-chart-2" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      {onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onReply}
          title="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </Button>
      )}
      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          title="Edit message"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {!isUser && onRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onRegenerate}
          title="Regenerate response"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

// Message animation variants
const messageVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

// Markdown components — only override code blocks (for syntax highlighting)
// and links (for external target). Everything else is handled by CSS in globals.css.
const markdownComponents = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "")
    const isInline = !match && !String(children).includes("\n")

    if (isInline) {
      return <code {...props}>{children}</code>
    }

    return (
      <CodeBlock language={match?.[1]}>
        {String(children).replace(/\n$/, "")}
      </CodeBlock>
    )
  },
  a({ children, href, ...props }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 break-words"
        {...props}
      >
        {children}
      </a>
    )
  },
  // Wrap tables in a scrollable container
  table({ children, ...props }: any) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border">
        <table {...props}>{children}</table>
      </div>
    )
  },
}

const remarkPlugins = [remarkGfm]

export function ChatWorkspace({
  session,
  assistant,
  onBack,
  onUpdateSession,
  onNewChat,
}: ChatWorkspaceProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // State
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [messageSources, setMessageSources] = useState<
    Record<string, Source[]>
  >({})

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")

  // Reply/Thread state
  const [replyingTo, setReplyingTo] = useState<{
    id: string
    content: string
  } | null>(null)

  // File attachment state
  const [attachedFile, setAttachedFile] = useState<File | null>(null)

  // Error state
  const [error, setError] = useState<{
    message: string
    retry: () => void
  } | null>(null)

  // Version viewing state for edited messages (messageId -> version number, 1-indexed)
  const [viewingVersions, setViewingVersions] = useState<Record<string, number>>({})

  // Handoff state
  const [handoffState, setHandoffState] = useState<HandoffState>("idle")
  const [handoffConversationId, setHandoffConversationId] = useState<string | null>(null)
  const [handoffTriggeredMsgId, setHandoffTriggeredMsgId] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPollTimestamp = useRef<string | null>(null)

  const chat = useChat({
    id: session?.id,
    onFinish: (message) => {
      if (session && onUpdateSession) {
        const content = getMessageContent(message.message)
        const updatedMessages = [
          ...session.messages,
          {
            id: message.message.id,
            role: message.message.role as "user" | "assistant",
            content,
            createdAt: new Date(),
          },
        ]

        const title =
          session.title === "New Chat" && updatedMessages.length >= 1
            ? updatedMessages[0].content.slice(0, 50) +
              (updatedMessages[0].content.length > 50 ? "..." : "")
            : session.title

        onUpdateSession(session.id, {
          messages: updatedMessages,
          title,
        })
      }
    },
  })

  // Reset messages when session changes
  useEffect(() => {
    if (session?.messages && session.messages.length > 0) {
      chat.setMessages(
        session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })) as any
      )
    } else {
      chat.setMessages([] as any)
    }
    // Clear edit, reply, and handoff state on session change
    setEditingMessageId(null)
    setEditContent("")
    setReplyingTo(null)
    setError(null)
    setHandoffState("idle")
    setHandoffConversationId(null)
    lastPollTimestamp.current = null
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [session?.id])

  // Track if we should auto-scroll (only when user sends a message or during streaming)
  const shouldAutoScroll = useRef(false)

  // Auto-scroll only when user sends a message (not on every message change)
  useEffect(() => {
    if (shouldAutoScroll.current && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: "LAST",
        behavior: "smooth",
      })
      // Reset after scrolling, but keep scrolling during streaming
      if (!isStreaming) {
        shouldAutoScroll.current = false
      }
    }
  }, [chat.messages, isStreaming])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  // Handlers
  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      behavior: "smooth",
    })
  }, [])

  const scrollToMessage = useCallback((messageId: string) => {
    const index = chat.messages.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      virtuosoRef.current?.scrollToIndex({
        index,
        behavior: "smooth",
        align: "center",
      })
    }
  }, [chat.messages])

  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setInput(suggestion)
    textareaRef.current?.focus()
  }, [])

  // Edit handlers
  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditContent(content)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditContent("")
  }, [])

  // Core message sending logic - used by both submit and edit
  const sendMessage = useCallback(
    async (
      userInput: string,
      baseMessages: typeof chat.messages,
      replyToId?: string,
      editHistory?: EditHistoryEntry[]
    ) => {
      setIsLoading(true)
      setIsStreaming(false)
      setError(null)

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: userInput,
        ...(replyToId && { replyTo: replyToId }),
        ...(editHistory && editHistory.length > 0 && { editHistory }),
      }

      // Placeholder ID for the assistant message (will be replaced when streaming starts)
      const pendingAssistantId = `pending-${crypto.randomUUID()}`

      // Enable auto-scroll
      shouldAutoScroll.current = true

      // Add user message AND placeholder assistant message immediately for instant feedback
      chat.setMessages([
        ...baseMessages,
        userMessage,
        { id: pendingAssistantId, role: "assistant", content: "" },
      ] as any)

      // Update session
      if (session && onUpdateSession) {
        const title =
          session.title === "New Chat"
            ? userInput.slice(0, 50) + (userInput.length > 50 ? "..." : "")
            : session.title

        onUpdateSession(session.id, {
          messages: [
            ...baseMessages.map((m) => {
              const ext = m as unknown as MessageWithExtras
              return {
                id: m.id,
                role: toChatMessageRole(m.role),
                content: getMessageContent(m),
                createdAt: new Date(),
                ...(ext.replyTo != null && { replyTo: ext.replyTo }),
                ...(ext.editHistory != null && { editHistory: ext.editHistory }),
              }
            }),
            { ...userMessage, createdAt: new Date() },
          ],
          title,
        })
      }

      try {
        // Normalize messages to plain { id, role, content } before sending.
        // This strips any custom `parts` set during SSE streaming (e.g. tool-invocation)
        // which would break convertToModelMessages on the server.
        const normalizedMessages = [...baseMessages, userMessage].map((m) => ({
          id: m.id,
          role: m.role,
          content: getMessageContent(m) || (m as { content?: string }).content || "",
        }))

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: normalizedMessages,
            assistantId: assistant.id,
            systemPrompt: assistant.systemPrompt,
            useKnowledgeBase: assistant.useKnowledgeBase,
            knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error("API Error:", response.status, errorText)
          throw new Error(`Failed to get response: ${response.status}`)
        }

        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ""
        const assistantMsgId = crypto.randomUUID()

        // Detect if response is SSE (UIMessageStream) vs plain text
        const isSSE = response.headers.get("x-vercel-ai-ui-message-stream") === "v1"

        // Replace the placeholder assistant message with the real one
        chat.setMessages((prev) => {
          const updated = [...prev]
          const lastIdx = updated.length - 1
          if (updated[lastIdx]?.role === "assistant" && updated[lastIdx]?.id.startsWith("pending-")) {
            updated[lastIdx] = { id: assistantMsgId, role: "assistant", content: "" } as unknown as typeof updated[number]
          }
          return updated
        })
        setIsStreaming(true)

        // SSE parsing state
        let sseBuffer = ""
        const toolCalls = new Map<string, {
          toolCallId: string
          toolName: string
          state: string
          args?: Record<string, unknown>
          output?: unknown
          errorText?: string
        }>()

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          if (isSSE) {
            // Parse SSE protocol: data: <json>\n\n
            sseBuffer += chunk
            const lines = sseBuffer.split("\n")
            sseBuffer = lines.pop() || "" // Keep last incomplete line

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith("data: ")) continue
              const data = trimmed.slice(6)
              if (data === "[DONE]") continue

              try {
                const part = JSON.parse(data)
                switch (part.type) {
                  case "text-delta":
                    assistantContent += part.delta
                    break
                  case "tool-input-start":
                    toolCalls.set(part.toolCallId, {
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      state: "call",
                    })
                    break
                  case "tool-input-available":
                    if (toolCalls.has(part.toolCallId)) {
                      const tc = toolCalls.get(part.toolCallId)!
                      tc.args = part.input as Record<string, unknown>
                      tc.state = "call"
                    }
                    break
                  case "tool-output-available": {
                    const tc = toolCalls.get(part.toolCallId)
                    if (tc) {
                      tc.output = part.output
                      tc.state = "result"
                    }
                    break
                  }
                  case "tool-output-error": {
                    const tc = toolCalls.get(part.toolCallId)
                    if (tc) {
                      tc.errorText = part.errorText
                      tc.state = "error"
                    }
                    break
                  }
                  case "tool-input-error": {
                    const tc = toolCalls.get(part.toolCallId)
                    if (tc) {
                      tc.errorText = part.errorText
                      tc.state = "error"
                    }
                    break
                  }
                }
              } catch {
                // Invalid JSON line, skip
              }
            }

            // Build parts array from tracked tool calls
            const parts: Array<Record<string, unknown>> = []
            for (const tc of toolCalls.values()) {
              parts.push({
                type: "tool-invocation",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                state: tc.state,
                args: tc.args,
                output: tc.output,
                errorText: tc.errorText,
              })
            }

            // Update message with content + tool parts (strip handoff marker from display)
            const sseDisplayContent = assistantContent.replace(AGENT_HANDOFF_MARKER, "").trim()
            chat.setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: sseDisplayContent,
                  parts,
                } as unknown as typeof updated[number]
              }
              return updated
            })
          } else {
            // Plain text stream (no tools)
            assistantContent += chunk

            let displayContent = assistantContent.includes(SOURCES_DELIMITER)
              ? assistantContent.split(SOURCES_DELIMITER)[0]
              : assistantContent

            // Strip handoff marker from live display
            displayContent = displayContent.replace(AGENT_HANDOFF_MARKER, "").trim()

            chat.setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: displayContent,
                } as typeof updated[number]
              }
              return updated
            })
          }
        }

        setIsStreaming(false)

        // Parse sources (only for plain text responses)
        let finalContent = assistantContent
        let sources: Source[] = []

        if (!isSSE && assistantContent.includes(SOURCES_DELIMITER)) {
          const [content, sourcesJson] = assistantContent.split(SOURCES_DELIMITER)
          finalContent = content.trim()
          try {
            sources = JSON.parse(sourcesJson)
            setMessageSources((prev) => ({ ...prev, [assistantMsgId]: sources }))
          } catch (e) {
            console.warn("[Chat] Failed to parse sources:", e)
          }

          chat.setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (updated[lastIdx]?.role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: finalContent,
              } as typeof updated[number]
            }
            return updated
          })
        }

        // Detect and handle agent handoff marker
        const hasHandoffMarker = assistantContent.includes(AGENT_HANDOFF_MARKER)
        if (hasHandoffMarker) {
          finalContent = finalContent.replace(AGENT_HANDOFF_MARKER, "").trim()

          // Update the displayed message with marker stripped
          chat.setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (updated[lastIdx]?.role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: finalContent,
              } as typeof updated[number]
            }
            return updated
          })

          // If liveChatEnabled, set flag to show handoff button after this message
          if (assistant.liveChatEnabled) {
            setHandoffTriggeredMsgId(assistantMsgId)
          }
        }

        // Save to session
        if (session && onUpdateSession && finalContent) {
          onUpdateSession(session.id, {
            messages: [
              ...baseMessages.map((m) => {
                const ext = m as unknown as MessageWithExtras
                return {
                  id: m.id,
                  role: toChatMessageRole(m.role),
                  content: getMessageContent(m),
                  createdAt: new Date(),
                  ...(ext.replyTo != null && { replyTo: ext.replyTo }),
                  ...(ext.editHistory != null && { editHistory: ext.editHistory }),
                }
              }),
              { ...userMessage, createdAt: new Date() },
              {
                id: assistantMsgId,
                role: "assistant" as const,
                content: finalContent,
                createdAt: new Date(),
              },
            ],
          })
        }
      } catch (err) {
        console.error("Chat error:", err)
        setIsStreaming(false)

        // Remove incomplete/placeholder assistant message
        chat.setMessages((prev) => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg?.role === "assistant" && (!getMessageContent(lastMsg) || lastMsg.id.startsWith("pending-"))) {
            return prev.slice(0, -1) as any
          }
          return prev
        })

        // Set error state
        const retryFn = () => {
          setInput(userInput)
          setError(null)
          textareaRef.current?.focus()
        }

        setError({
          message: "Failed to get response. Please try again.",
          retry: retryFn,
        })

        // Show toast
        toast({
          variant: "destructive",
          title: "Message failed",
          description: "Failed to get a response from the assistant.",
          action: (
            <ToastAction altText="Retry" onClick={retryFn}>
              Retry
            </ToastAction>
          ),
        })
      } finally {
        setIsLoading(false)
      }
    },
    [chat, session, onUpdateSession, assistant, toast]
  )

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId || !editContent.trim()) return

    const messageIndex = chat.messages.findIndex(
      (m) => m.id === editingMessageId
    )
    if (messageIndex === -1) return

    // Get the original message to preserve edit history
    const originalMessage = chat.messages[messageIndex] as unknown as ChatMessage
    const originalContent = getMessageContent(originalMessage)
    const existingHistory = originalMessage.editHistory || []

    // Get the assistant response that followed this user message (if any)
    const nextMessage = chat.messages[messageIndex + 1]
    const assistantResponse =
      nextMessage?.role === "assistant" ? getMessageContent(nextMessage) : undefined

    // Build new edit history by adding the original content and its response
    const newEditHistory: EditHistoryEntry[] = [
      ...existingHistory,
      { content: originalContent, assistantResponse, editedAt: new Date() },
    ]

    // Get messages before the edited one
    const truncatedMessages = chat.messages.slice(0, messageIndex)
    const editedContent = editContent.trim()

    // Preserve reply context if the original message had one
    const replyToId = originalMessage.replyTo

    // Clear edit state
    setEditingMessageId(null)
    setEditContent("")

    // Send the edited message with history
    await sendMessage(editedContent, truncatedMessages, replyToId, newEditHistory)
  }, [editingMessageId, editContent, chat.messages, sendMessage])

  // Regenerate handler
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const messageIndex = chat.messages.findIndex((m) => m.id === messageId)
      if (
        messageIndex === -1 ||
        chat.messages[messageIndex].role !== "assistant"
      )
        return

      // Find the preceding user message
      const userMessageIndex = messageIndex - 1
      if (
        userMessageIndex < 0 ||
        chat.messages[userMessageIndex].role !== "user"
      )
        return

      const userMessage = chat.messages[userMessageIndex]
      const userContent = getMessageContent(userMessage)
      const userReplyTo = (userMessage as unknown as ChatMessage).replyTo

      // Get messages before the user message (to resend with the same context)
      const truncatedMessages = chat.messages.slice(0, userMessageIndex)

      // Send the same user message again to get a new response
      await sendMessage(userContent, truncatedMessages, userReplyTo)
    },
    [chat.messages, sendMessage]
  )

  // Delete handler
  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      const messageIndex = chat.messages.findIndex((m) => m.id === messageId)
      if (messageIndex === -1) return

      // Remove message and all after it
      const truncatedMessages = chat.messages.slice(0, messageIndex)
      chat.setMessages(truncatedMessages as any)

      if (session && onUpdateSession) {
        onUpdateSession(session.id, {
          messages: session.messages.slice(0, messageIndex),
        })
      }
    },
    [chat, session, onUpdateSession]
  )

  // Reply handler
  const handleReply = useCallback((messageId: string, content: string) => {
    setReplyingTo({ id: messageId, content })
    textareaRef.current?.focus()
  }, [])

  // Clear chat handler
  const handleClearChat = useCallback(() => {
    chat.setMessages([] as any)
    if (session && onUpdateSession) {
      onUpdateSession(session.id, {
        messages: [],
        title: "New Chat",
      })
    }
    setMessageSources({})
    setError(null)
    setHandoffState("idle")
    setHandoffConversationId(null)
    setHandoffTriggeredMsgId(null)
    lastPollTimestamp.current = null
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [chat, session, onUpdateSession])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Handoff: request handoff to human agent
  const requestHandoff = useCallback(async () => {
    setHandoffState("requesting")

    try {
      const chatHistory = chat.messages.map((m) => ({
        role: m.role,
        content: getMessageContent(m),
      }))

      const response = await fetch("/api/dashboard/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: assistant.id,
          chatHistory,
        }),
      })

      if (!response.ok) {
        throw new Error(`Handoff request failed: ${response.status}`)
      }

      const data = await response.json()
      setHandoffConversationId(data.conversationId)
      setHandoffState("waiting")
      lastPollTimestamp.current = null

      // Add system message to chat
      const systemMsg = {
        id: `system-handoff-${Date.now()}`,
        role: "assistant" as const,
        content: `Connecting you with a live agent... You are #${data.queuePosition} in the queue.`,
      }
      chat.setMessages((prev) => [...prev, systemMsg] as any)
      shouldAutoScroll.current = true

      // Start polling
      startPolling(data.conversationId)
    } catch (err) {
      console.error("Handoff request failed:", err)
      setHandoffState("idle")
      toast({
        variant: "destructive",
        title: "Handoff failed",
        description: "Could not connect to a live agent. Please try again.",
      })
    }
  }, [chat, assistant.id, toast])

  // Handoff: start polling for agent messages
  const startPolling = useCallback((conversationId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    const poll = async () => {
      try {
        const params = new URLSearchParams({ conversationId })
        if (lastPollTimestamp.current) {
          params.set("after", lastPollTimestamp.current)
        }

        const response = await fetch(`/api/dashboard/handoff?${params.toString()}`)
        if (!response.ok) return

        const data = await response.json()

        // Update handoff state based on conversation status
        if (data.status === "AGENT_CONNECTED" && handoffState !== "connected") {
          setHandoffState("connected")
          // Add agent joined banner
          const bannerMsg = {
            id: `banner-joined-${Date.now()}`,
            role: "assistant" as const,
            content: `**${data.agentName || "An agent"}** has joined the conversation.`,
          }
          chat.setMessages((prev) => [...prev, bannerMsg] as any)
          shouldAutoScroll.current = true
        } else if (data.status === "RESOLVED") {
          setHandoffState("resolved")
          // Add resolved banner
          const resolvedMsg = {
            id: `banner-resolved-${Date.now()}`,
            role: "assistant" as const,
            content: "This conversation has been resolved by the agent.",
          }
          chat.setMessages((prev) => [...prev, resolvedMsg] as any)
          shouldAutoScroll.current = true
          // Stop polling
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        }

        // Add new agent messages
        if (data.messages && data.messages.length > 0) {
          const newMessages = data.messages
            .filter((m: { role: string }) => m.role === "agent")
            .map((m: { id: string; content: string; timestamp: string }) => ({
              id: `agent-${m.id}`,
              role: "assistant" as const,
              content: `**Agent:** ${m.content}`,
            }))

          if (newMessages.length > 0) {
            chat.setMessages((prev) => [...prev, ...newMessages] as any)
            shouldAutoScroll.current = true
          }

          // Update last poll timestamp
          const lastMessage = data.messages[data.messages.length - 1]
          if (lastMessage?.timestamp) {
            lastPollTimestamp.current = lastMessage.timestamp
          }
        }
      } catch (err) {
        console.error("Poll error:", err)
      }
    }

    // Poll immediately, then every 3 seconds
    poll()
    pollIntervalRef.current = setInterval(poll, 3000)
  }, [chat, handoffState])

  // Handoff: send message to agent
  const sendHandoffMessage = useCallback(async (content: string) => {
    if (!handoffConversationId) return

    try {
      const response = await fetch("/api/dashboard/handoff/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: handoffConversationId,
          content,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message to agent")
      }
    } catch (err) {
      console.error("Send handoff message error:", err)
      toast({
        variant: "destructive",
        title: "Message failed",
        description: "Could not send message to the agent.",
      })
    }
  }, [handoffConversationId, toast])

  // Export helpers
  const exportAsMarkdown = useCallback(() => {
    if (!session) return
    let markdown = `# ${session.title}\n\n`
    markdown += `*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n`
    for (const msg of session.messages) {
      const role = msg.role === "user" ? "**You**" : "**Assistant**"
      markdown += `${role}:\n\n${msg.content}\n\n---\n\n`
    }
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${session.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [session])

  const exportAsJson = useCallback(() => {
    if (!session) return
    const json = JSON.stringify(
      {
        title: session.title,
        exportedAt: new Date().toISOString(),
        messages: session.messages,
      },
      null,
      2
    )
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${session.title
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [session])

  // Submit handler
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userInput = input.trim()
    setInput("")

    // If connected to agent, send via handoff API instead of AI
    if (handoffState === "connected" && handoffConversationId) {
      // Add user message to chat locally
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: userInput,
      }
      chat.setMessages((prev) => [...prev, userMsg] as any)
      shouldAutoScroll.current = true

      // Send to agent via handoff API
      await sendHandoffMessage(userInput)
      return
    }

    // Capture and clear reply state
    const replyContext = replyingTo
    setReplyingTo(null)

    // Send the message using shared logic
    await sendMessage(userInput, chat.messages, replyContext?.id)
  }

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e)
    }
    if (e.key === "Escape") {
      if (editingMessageId) {
        handleCancelEdit()
      } else if (replyingTo) {
        setReplyingTo(null)
      }
    }
  }

  if (!session) {
    return <EmptyState />
  }

  const allMessages = [...chat.messages]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with mobile back button and actions */}
      <div className="flex items-center justify-between gap-2 py-4 pl-14 pr-4 border-b">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <span className="font-medium truncate">{session.title}</span>
          {/* Live chat status indicator */}
          {handoffState === "connected" && (
            <span className="flex items-center gap-1.5 text-xs text-chart-2 bg-chart-2/10 px-2 py-0.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-chart-2" />
              </span>
              Live Chat
            </span>
          )}
          {handoffState === "waiting" && (
            <span className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting...
            </span>
          )}
          {handoffState === "resolved" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" />
              Resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ConversationExport title={session.title} messages={session.messages} />
          <CommandPalette
            onNewChat={onNewChat || (() => {})}
            onExportMarkdown={exportAsMarkdown}
            onExportJson={exportAsJson}
            onClearChat={handleClearChat}
          />
        </div>
      </div>

      {/* Messages with Virtuoso */}
      <div className="flex-1 relative">
        {chat.messages.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-12">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="text-5xl mb-4"
              >
                {assistant.emoji}
              </motion.div>
              <motion.h3
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="text-lg font-medium mb-1"
              >
                {assistant.name}
              </motion.h3>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="text-sm text-muted-foreground max-w-sm mx-auto text-center"
              >
                {assistant.description}
              </motion.p>
              <QuickSuggestions
                assistant={assistant}
                onSelect={handleSuggestionSelect}
              />
            </div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={allMessages}
            className="h-full"
            atBottomStateChange={setAtBottom}
            atBottomThreshold={100}
            overscan={200}
            itemContent={(index, message) => {
              const rawContent = getMessageContent(message)
              const isUser = message.role === "user"
              const isLastMessage = index === allMessages.length - 1
              const isLoadingMessage =
                isLoading &&
                isLastMessage &&
                message.role === "assistant" &&
                !rawContent
              const isStreamingMessage =
                isStreaming && isLastMessage && message.role === "assistant"
              const sources = messageSources[message.id] || []
              const isEditing = editingMessageId === message.id

              // Version handling for edited messages
              const msgEditHistory = (message as unknown as ChatMessage).editHistory
              const hasEditHistory = msgEditHistory && msgEditHistory.length > 0
              const totalVersions = hasEditHistory ? msgEditHistory.length + 1 : 1
              const currentViewingVersion = viewingVersions[message.id] || totalVersions
              const content = hasEditHistory
                ? getVersionContent(rawContent, msgEditHistory, currentViewingVersion)
                : rawContent

              // Get historical assistant response if viewing a previous version
              const historicalAssistantResponse =
                isUser && hasEditHistory
                  ? getVersionAssistantResponse(msgEditHistory, currentViewingVersion, totalVersions)
                  : undefined
              const isViewingHistoricalVersion =
                hasEditHistory && currentViewingVersion < totalVersions

              return (
                <motion.div
                  variants={messageVariants}
                  initial="initial"
                  animate="animate"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="max-w-3xl mx-auto px-4 py-3"
                >
                  <div
                    className={cn(
                      "group flex gap-3",
                      isUser ? "flex-row-reverse" : ""
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm",
                        isUser
                          ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
                          : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                      )}
                    >
                      {isUser ? (
                        <User className="h-4 w-4" />
                      ) : assistant.emoji ? (
                        <span className="text-lg">{assistant.emoji}</span>
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>

                    {/* Message content */}
                    <div
                      className={cn("flex-1 min-w-0", isUser ? "ml-12" : "mr-12")}
                    >
                      <div
                        className={cn(
                          "rounded-2xl py-2.5 px-4 text-sm",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {/* Reply indicator - show what message this is replying to */}
                        {(message as unknown as ChatMessage).replyTo && (() => {
                          const replyToId = (message as unknown as ChatMessage).replyTo
                          const parentMsg = allMessages.find(
                            (m) => m.id === replyToId
                          )
                          if (!parentMsg) return null
                          const parentContent = getMessageContent(parentMsg)
                          return (
                            <MessageReplyIndicator
                              parentContent={parentContent}
                              onClick={() => scrollToMessage(parentMsg.id)}
                              isUserMessage={isUser}
                            />
                          )
                        })()}

                        {isLoadingMessage ? (
                          <TypingIndicator />
                        ) : isEditing ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="min-h-[60px] bg-background"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save & Resend
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Tool call indicators for assistant messages */}
                            {!isUser && (() => {
                              const toolParts = getToolCallParts(message as unknown as { parts?: Array<Record<string, unknown>> })
                              if (toolParts.length === 0) return null
                              return (
                                <div className="space-y-0.5 mb-1">
                                  {toolParts.map((tp) => (
                                    <ToolCallIndicator
                                      key={tp.toolCallId}
                                      toolName={tp.toolName}
                                      state={tp.state}
                                      args={tp.input}
                                      result={tp.output}
                                      errorText={tp.errorText}
                                    />
                                  ))}
                                </div>
                              )
                            })()}
                            <div className="chat-message max-w-none">
                              <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                                {content}
                              </ReactMarkdown>
                              {isStreamingMessage && (
                                <span className="inline-block w-2 h-4 bg-foreground/70 animate-pulse ml-0.5 align-middle" />
                              )}
                            </div>
                          </>
                        )}

                        {/* Sources */}
                        {!isUser &&
                          !isLoadingMessage &&
                          !isEditing &&
                          sources.length > 0 && (
                            <MessageSources sources={sources} />
                          )}

                        {/* Handoff button — shown after the message that triggered handoff */}
                        {!isUser &&
                          handoffTriggeredMsgId === message.id &&
                          handoffState === "idle" && (
                            <div className="mt-3 flex justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 rounded-full border-primary/30 hover:bg-primary/10"
                                onClick={requestHandoff}
                              >
                                <Headphones className="h-4 w-4" />
                                Connect with Live Agent
                              </Button>
                            </div>
                          )}

                        {/* Handoff requesting state */}
                        {!isUser &&
                          handoffTriggeredMsgId === message.id &&
                          handoffState === "requesting" && (
                            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Connecting...
                            </div>
                          )}

                        {/* Handoff waiting state */}
                        {!isUser &&
                          handoffTriggeredMsgId === message.id &&
                          handoffState === "waiting" && (
                            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                              <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary/80" />
                              </span>
                              Waiting for an agent...
                            </div>
                          )}
                      </div>

                      {/* Historical AI response when viewing previous version */}
                      {isUser && isViewingHistoricalVersion && historicalAssistantResponse && (
                        <div className="mt-3 flex gap-3">
                          <div
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm",
                              "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                            )}
                          >
                            {assistant.emoji ? (
                              <span className="text-sm">{assistant.emoji}</span>
                            ) : (
                              <Bot className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="flex-1 rounded-2xl py-2.5 px-4 text-sm bg-muted/70 border border-muted-foreground/10">
                            <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                              <span>Historical response</span>
                              <span className="opacity-60">•</span>
                              <span>Version {currentViewingVersion}/{totalVersions}</span>
                            </div>
                            <div className="chat-message max-w-none opacity-90">
                              <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                                {historicalAssistantResponse}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Message footer */}
                      {!isLoadingMessage && !isEditing && (
                        <div
                          className={cn(
                            "flex items-center gap-2 mt-1",
                            isUser ? "flex-row-reverse" : ""
                          )}
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(), { addSuffix: true })}
                          </span>
                          {/* Show version indicator for edited messages, otherwise show regular actions */}
                          {hasEditHistory ? (
                            <EditVersionIndicator
                              currentContent={rawContent}
                              editHistory={msgEditHistory!}
                              viewingVersion={currentViewingVersion}
                              onVersionChange={(v) =>
                                setViewingVersions((prev) => ({
                                  ...prev,
                                  [message.id]: v,
                                }))
                              }
                              onCopy={(c) => handleCopy(message.id, c)}
                              onEdit={
                                isUser
                                  ? () => handleEditMessage(message.id, rawContent)
                                  : undefined
                              }
                              copied={copiedId === message.id}
                              isUserMessage={isUser}
                            />
                          ) : (
                            <MessageActions
                              onCopy={() => handleCopy(message.id, content)}
                              onEdit={
                                isUser
                                  ? () => handleEditMessage(message.id, content)
                                  : undefined
                              }
                              onRegenerate={
                                !isUser
                                  ? () => handleRegenerate(message.id)
                                  : undefined
                              }
                              onDelete={() => handleDeleteMessage(message.id)}
                              onReply={() => handleReply(message.id, content)}
                              copied={copiedId === message.id}
                              isUser={isUser}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            }}
          />
        )}

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-4 left-4 right-4 max-w-3xl mx-auto"
            >
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive flex-1">{error.message}</p>
                <Button size="sm" variant="outline" onClick={error.retry}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Retry
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setError(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll to bottom button */}
        {showScrollButton && !atBottom && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 bg-background">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
          {/* Reply indicator */}
          <AnimatePresence>
            {replyingTo && (
              <ThreadIndicator
                parentContent={replyingTo.content}
                onClear={() => setReplyingTo(null)}
              />
            )}
          </AnimatePresence>

          {/* File preview */}
          <AnimatePresence>
            {attachedFile && (
              <div className="mb-2">
                <FilePreview
                  file={attachedFile}
                  onRemove={() => setAttachedFile(null)}
                />
              </div>
            )}
          </AnimatePresence>

          <div className="relative flex items-end gap-2">
            <FileUploadButton
              onFileSelect={setAttachedFile}
              disabled={isLoading}
            />
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  handoffState === "connected"
                    ? "Type a message to the agent..."
                    : handoffState === "resolved"
                      ? "Conversation resolved"
                      : "Type a message..."
                }
                className="min-h-[52px] max-h-[200px] pr-12 resize-none rounded-2xl border-2 focus-visible:ring-1"
                disabled={isLoading || handoffState === "waiting" || handoffState === "requesting" || handoffState === "resolved"}
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 bottom-2 rounded-full h-8 w-8"
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? (
                  <ButtonLoadingIndicator />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            {handoffState === "connected"
              ? "You are chatting with a live agent · Enter to send"
              : <>
                  Enter to send · Shift+Enter for new line ·{" "}
                  <kbd className="px-1 rounded bg-muted font-mono">⌘K</kbd> command
                  palette
                </>
            }
          </p>
        </form>
      </div>
    </div>
  )
}
