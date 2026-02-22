"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  Send,
  Square,
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
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { MarkdownContent } from "./markdown-content"
import { TypingIndicator, ButtonLoadingIndicator } from "./typing-indicator"
import { QuickSuggestions } from "./quick-suggestions"
import { MessageSources, Source } from "./message-sources"
import { ConversationExport } from "./conversation-export"
import { CommandPalette } from "./command-palette"
import { FilePreview } from "./file-preview"
import { ChatInputToolbar, type AssistantToolInfo, type CanvasMode } from "./chat-input-toolbar"
import { ThreadIndicator, ReplyButton, MessageReplyIndicator } from "./thread-indicator"
import { EditVersionIndicator, getVersionContent, getVersionAssistantResponse } from "./edit-version-indicator"
import { ToolCallIndicator } from "./tool-call-indicator"
import { useArtifacts } from "./artifacts/use-artifacts"
import { ArtifactIndicator } from "./artifacts/artifact-indicator"
import { ArtifactPanel } from "./artifacts/artifact-panel"
import type { Artifact, ArtifactType } from "./artifacts/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

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
        "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
        onClick={onCopy}
        title="Copy message"
      >
        {copied ? (
          <Check className="h-3 w-3 text-chart-2" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
      {onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
          onClick={onReply}
          title="Reply"
        >
          <Reply className="h-3 w-3" />
        </Button>
      )}
      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
          onClick={onEdit}
          title="Edit message"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {!isUser && onRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
          onClick={onRegenerate}
          title="Regenerate response"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg"
          onClick={onDelete}
          title="Delete message"
        >
          <Trash2 className="h-3 w-3" />
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

// Extracted messages area to share between artifact and non-artifact layouts
function MessagesArea({
  chat,
  allMessages,
  isLoading,
  isStreaming,
  assistant,
  messageSources,
  editingMessageId,
  editContent,
  viewingVersions,
  copiedId,
  error,
  showScrollButton,
  atBottom,
  handoffState,
  handoffTriggeredMsgId,
  virtuosoRef,
  setAtBottom,
  setEditContent,
  setViewingVersions,
  setError,
  handleSuggestionSelect,
  handleSaveEdit,
  handleCancelEdit,
  handleCopy,
  handleEditMessage,
  handleRegenerate,
  handleDeleteMessage,
  handleReply,
  scrollToBottom,
  scrollToMessage,
  requestHandoff,
  openArtifact,
  artifacts,
}: {
  chat: ReturnType<typeof useChat>
  allMessages: ReturnType<typeof useChat>["messages"]
  isLoading: boolean
  isStreaming: boolean
  assistant: Assistant
  messageSources: Record<string, Source[]>
  editingMessageId: string | null
  editContent: string
  viewingVersions: Record<string, number>
  copiedId: string | null
  error: { message: string; retry: () => void } | null
  showScrollButton: boolean
  atBottom: boolean
  handoffState: HandoffState
  handoffTriggeredMsgId: string | null
  virtuosoRef: React.RefObject<VirtuosoHandle | null>
  setAtBottom: (v: boolean) => void
  setEditContent: (v: string) => void
  setViewingVersions: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setError: (v: { message: string; retry: () => void } | null) => void
  handleSuggestionSelect: (s: string) => void
  handleSaveEdit: () => void
  handleCancelEdit: () => void
  handleCopy: (id: string, content: string) => void
  handleEditMessage: (id: string, content: string) => void
  handleRegenerate: (id: string) => void
  handleDeleteMessage: (id: string) => void
  handleReply: (id: string, content: string) => void
  scrollToBottom: () => void
  scrollToMessage: (id: string) => void
  requestHandoff: () => void
  openArtifact: (id: string) => void
  artifacts: Map<string, Artifact>
}) {
  return (
    <div className="h-full w-full relative">
      {chat.messages.length === 0 && !isLoading ? (
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-center py-12 max-w-lg mx-auto">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 border border-violet-500/20 mb-5"
            >
              <span className="text-3xl">{assistant.emoji || "🤖"}</span>
            </motion.div>
            <motion.h3
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-xl font-semibold mb-2 tracking-tight"
            >
              {assistant.name}
            </motion.h3>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="text-sm text-muted-foreground max-w-md mx-auto text-center leading-relaxed"
            >
              {assistant.openingMessage || assistant.description}
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

            const msgEditHistory = (message as unknown as ChatMessage).editHistory
            const hasEditHistory = msgEditHistory && msgEditHistory.length > 0
            const totalVersions = hasEditHistory ? msgEditHistory.length + 1 : 1
            const currentViewingVersion = viewingVersions[message.id] || totalVersions
            const content = hasEditHistory
              ? getVersionContent(rawContent, msgEditHistory, currentViewingVersion)
              : rawContent

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
                className="max-w-3xl mx-auto px-4 py-4"
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
                      "flex shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "h-8 w-8 bg-neutral-300 text-neutral-700 dark:bg-neutral-600 dark:text-white shadow-sm"
                        : "h-8 w-8 bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"
                    )}
                  >
                    {isUser ? (
                      <User className="h-3.5 w-3.5" />
                    ) : assistant.emoji ? (
                      <span className="text-base">{assistant.emoji}</span>
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Message content */}
                  <div
                    className={cn("flex-1 min-w-0", isUser ? "ml-12" : "mr-8")}
                  >
                    {/* Assistant name label */}
                    {!isUser && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{assistant.name}</span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "text-sm",
                        isUser
                          ? "rounded-2xl py-2.5 px-4 bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                          : ""
                      )}
                    >
                      {/* Reply indicator */}
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
                          {/* Tool call indicators (live during streaming) */}
                          {!isUser && (() => {
                            const toolParts = getToolCallParts(message as unknown as { parts?: Array<Record<string, unknown>> })
                            if (toolParts.length > 0) {
                              return (
                                <div className="space-y-0.5 mb-1">
                                  {toolParts.map((tp) => {
                                    const isArtifactTool = (tp.toolName === "create_artifact" || tp.toolName === "update_artifact") && tp.state === "done" && tp.output
                                    if (isArtifactTool) {
                                      const out = tp.output as Record<string, unknown>
                                      const artifactId = out.id as string
                                      const existing = artifactId ? artifacts.get(artifactId) : undefined
                                      return (
                                        <ArtifactIndicator
                                          key={tp.toolCallId}
                                          title={
                                            tp.toolName === "update_artifact"
                                              ? `Updated: ${(out.title as string) || existing?.title || "Artifact"}`
                                              : (out.title as string) || "Artifact"
                                          }
                                          type={existing?.type || (out.type as ArtifactType) || "text/html"}
                                          onClick={() => {
                                            if (artifactId) openArtifact(artifactId)
                                          }}
                                        />
                                      )
                                    }
                                    return (
                                      <ToolCallIndicator
                                        key={tp.toolCallId}
                                        toolName={tp.toolName}
                                        state={tp.state}
                                        args={tp.input}
                                        result={tp.output}
                                        errorText={tp.errorText}
                                      />
                                    )
                                  })}
                                </div>
                              )
                            }
                            // Fallback: render tool calls + artifact indicators from persisted metadata (after session switch/refresh)
                            const msgMeta = (message as unknown as { metadata?: { artifactIds?: string[]; toolCalls?: ToolCallPart[] } }).metadata
                            const persistedTCs = msgMeta?.toolCalls
                            const persistedIds = msgMeta?.artifactIds
                            if ((persistedTCs && persistedTCs.length > 0) || (persistedIds && persistedIds.length > 0)) {
                              return (
                                <div className="space-y-0.5 mb-1">
                                  {persistedTCs?.map((tc) => {
                                    const isArtifactTool = (tc.toolName === "create_artifact" || tc.toolName === "update_artifact") && tc.state === "done" && tc.output
                                    if (isArtifactTool) {
                                      const out = tc.output as Record<string, unknown>
                                      const artifactId = out.id as string
                                      const existing = artifactId ? artifacts.get(artifactId) : undefined
                                      return (
                                        <ArtifactIndicator
                                          key={tc.toolCallId}
                                          title={
                                            tc.toolName === "update_artifact"
                                              ? `Updated: ${(out.title as string) || existing?.title || "Artifact"}`
                                              : (out.title as string) || "Artifact"
                                          }
                                          type={existing?.type || (out.type as ArtifactType) || "text/html"}
                                          onClick={() => {
                                            if (artifactId) openArtifact(artifactId)
                                          }}
                                        />
                                      )
                                    }
                                    return (
                                      <ToolCallIndicator
                                        key={tc.toolCallId}
                                        toolName={tc.toolName}
                                        state={tc.state}
                                        args={tc.input}
                                        result={tc.output}
                                        errorText={tc.errorText}
                                      />
                                    )
                                  })}
                                  {/* Artifact IDs without matching tool call (legacy/fallback) */}
                                  {persistedIds?.filter((aid) => !persistedTCs?.some((tc) => {
                                    const out = tc.output as Record<string, unknown> | undefined
                                    return out?.id === aid
                                  })).map((aid) => {
                                    const art = artifacts.get(aid)
                                    if (!art) return null
                                    return (
                                      <ArtifactIndicator
                                        key={aid}
                                        title={art.title}
                                        type={art.type}
                                        onClick={() => openArtifact(aid)}
                                      />
                                    )
                                  })}
                                </div>
                              )
                            }
                            return null
                          })()}
                          <MarkdownContent content={content} isStreaming={isStreamingMessage} />
                        </>
                      )}

                      {/* Sources */}
                      {!isUser &&
                        !isLoadingMessage &&
                        !isEditing &&
                        sources.length > 0 && (
                          <MessageSources sources={sources} />
                        )}

                      {/* Handoff button */}
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

                      {!isUser &&
                        handoffTriggeredMsgId === message.id &&
                        handoffState === "requesting" && (
                          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </div>
                        )}

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
                            <span className="opacity-60">&middot;</span>
                            <span>Version {currentViewingVersion}/{totalVersions}</span>
                          </div>
                          <div className="opacity-90">
                            <MarkdownContent content={historicalAssistantResponse} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message footer */}
                    {!isLoadingMessage && !isEditing && (
                      <div
                        className={cn(
                          "flex items-center gap-2 mt-2",
                          isUser ? "flex-row-reverse" : ""
                        )}
                      >
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(message.createdAt ? new Date(message.createdAt) : new Date(), { addSuffix: true })}
                        </span>
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
  )
}

export function ChatWorkspace({
  session,
  assistant,
  onBack,
  onUpdateSession,
  onNewChat,
}: ChatWorkspaceProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
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

  // Toolbar: per-message overrides for web search, knowledge base & tools
  const [webSearchOverride, setWebSearchOverride] = useState<boolean | null>(null)
  const [selectedKBGroupIds, setSelectedKBGroupIds] = useState<string[] | null>(null)
  const [toolsOverride, setToolsOverride] = useState<boolean | null>(null)
  const [assistantTools, setAssistantTools] = useState<AssistantToolInfo[]>([])

  // Knowledge base groups for picker
  const [kbGroups, setKBGroups] = useState<{ id: string; name: string; color: string | null; documentCount: number }[]>([])

  // Canvas mode — forces AI to create/update artifacts
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(false)

  // GitHub import dialog state
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")

  // Artifacts system
  const {
    artifacts,
    activeArtifact,
    activeArtifactId,
    addOrUpdateArtifact,
    removeArtifact,
    loadFromPersisted,
    openArtifact,
    closeArtifact,
  } = useArtifacts()

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
          metadata: m.metadata || undefined,
        })) as any
      )
    } else {
      chat.setMessages([] as any)
    }
    // Load persisted artifacts — always fetch fresh from API because
    // session.artifacts in context can be stale (not updated after tool creates new artifacts)
    if (session?.id) {
      // Show context artifacts instantly (if any) while fetching fresh data
      if (session.artifacts && session.artifacts.length > 0) {
        loadFromPersisted(session.artifacts)
      }
      fetch(`/api/dashboard/chat/sessions/${session.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.artifacts?.length > 0) {
            loadFromPersisted(data.artifacts)
          } else if (!session.artifacts?.length) {
            loadFromPersisted([])
          }
        })
        .catch(() => {
          // Fallback: keep whatever was loaded from context
          if (!session.artifacts?.length) loadFromPersisted([])
        })
    } else {
      loadFromPersisted([])
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

  // Fetch assistant tools for toolbar display
  useEffect(() => {
    if (!assistant?.id || assistant.id === "general") {
      setAssistantTools([])
      setWebSearchOverride(null)
      setSelectedKBGroupIds(null)
      setToolsOverride(null)
      return
    }
    fetch(`/api/assistants/${assistant.id}/tools`)
      .then((res) => res.json())
      .then((tools) => {
        if (Array.isArray(tools)) {
          setAssistantTools(
            tools
              .filter((t: { enabledForAssistant?: boolean }) => t.enabledForAssistant !== false)
              .map((t: { name: string; displayName: string; description: string; category: string }) => ({
                name: t.name,
                displayName: t.displayName,
                description: t.description,
                category: t.category,
              }))
          )
        } else {
          setAssistantTools([])
        }
      })
      .catch(() => setAssistantTools([]))
    // Reset overrides when assistant changes
    setWebSearchOverride(null)
    setSelectedKBGroupIds(null)
    setToolsOverride(null)
  }, [assistant?.id])

  // Fetch knowledge base groups for picker
  useEffect(() => {
    fetch("/api/dashboard/knowledge/groups")
      .then((res) => res.json())
      .then((data) => setKBGroups(data.groups || []))
      .catch(() => setKBGroups([]))
  }, [])

  // Derived toolbar values
  const webSearchAvailable = assistantTools.some((t) => t.name === "web_search")
  const effectiveWebSearch = webSearchOverride ?? webSearchAvailable
  const effectiveKBGroupIds = selectedKBGroupIds ?? (assistant.knowledgeBaseGroupIds || [])
  const effectiveKnowledgeBase = selectedKBGroupIds !== null
    ? selectedKBGroupIds.length > 0
    : (assistant.useKnowledgeBase ?? false)
  const effectiveToolsEnabled = toolsOverride ?? (assistantTools.length > 0)

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

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            messages: normalizedMessages,
            assistantId: assistant.id,
            sessionId: session?.id,
            systemPrompt: assistant.systemPrompt,
            useKnowledgeBase: effectiveKnowledgeBase,
            knowledgeBaseGroupIds: effectiveKBGroupIds,
            enableWebSearch: effectiveWebSearch,
            enableTools: effectiveToolsEnabled,
            canvasMode: canvasMode || undefined,
            targetArtifactId: activeArtifactId || undefined,
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

                      // Progressive artifact rendering — show content as it streams
                      if (
                        (tc.toolName === "create_artifact" || tc.toolName === "update_artifact") &&
                        tc.args
                      ) {
                        const args = tc.args
                        if (args.type && args.content) {
                          const streamingId = tc.toolName === "update_artifact" && args.id
                            ? args.id as string
                            : `streaming-${part.toolCallId}`
                          addOrUpdateArtifact({
                            id: streamingId,
                            title: (args.title as string) || "Generating...",
                            type: (args.type as ArtifactType) || "text/html",
                            content: args.content as string,
                            language: (args.language as string) || undefined,
                          })
                        }
                      }
                    }
                    break
                  case "tool-output-available": {
                    const tc = toolCalls.get(part.toolCallId)
                    if (tc) {
                      tc.output = part.output
                      tc.state = "result"

                      // Handle create_artifact — replace streaming placeholder with final
                      if (tc.toolName === "create_artifact" && part.output && typeof part.output === "object") {
                        const out = part.output as Record<string, unknown>
                        if (out.id && out.title && out.type && out.content) {
                          // Remove streaming placeholder, add final artifact
                          removeArtifact(`streaming-${part.toolCallId}`)
                          addOrUpdateArtifact({
                            id: out.id as string,
                            title: out.title as string,
                            type: out.type as ArtifactType,
                            content: out.content as string,
                            language: (out.language as string) || undefined,
                          })
                        }
                      }

                      // Handle update_artifact — update existing artifact (versioning handled by hook)
                      if (tc.toolName === "update_artifact" && part.output && typeof part.output === "object") {
                        const out = part.output as Record<string, unknown>
                        if (out.id && out.content) {
                          // Find existing artifact to get its type
                          const existing = artifacts.get(out.id as string)
                          if (existing) {
                            addOrUpdateArtifact({
                              id: out.id as string,
                              title: (out.title as string) || existing.title,
                              type: existing.type,
                              content: out.content as string,
                              language: existing.language,
                            })
                          }
                        }
                      }
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

        // Collect artifact IDs from completed tool calls
        const artifactIds = Array.from(toolCalls.values())
          .filter(tc => (tc.toolName === "create_artifact" || tc.toolName === "update_artifact") && tc.state === "result" && tc.output)
          .map(tc => (tc.output as Record<string, unknown>).id as string)
          .filter(Boolean)

        // Collect all tool call data for persistence (so they render after session switch)
        const persistedToolCalls = Array.from(toolCalls.values())
          .filter(tc => tc.state === "result" || tc.state === "error")
          .map(tc => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            state: tc.state === "result" ? "done" as const : "error" as const,
            input: tc.args,
            output: tc.output,
            errorText: tc.errorText,
          }))

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
                ...((artifactIds.length > 0 || persistedToolCalls.length > 0) && {
                  metadata: {
                    ...(artifactIds.length > 0 && { artifactIds }),
                    ...(persistedToolCalls.length > 0 && { toolCalls: persistedToolCalls }),
                  },
                }),
              },
            ],
          })
        }
      } catch (err) {
        // Handle user-initiated abort — keep partial content
        if (err instanceof DOMException && err.name === "AbortError") {
          setIsStreaming(false)
          return
        }

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
        abortControllerRef.current = null
        // Reset toolbar overrides back to defaults (keep activeArtifactId for iteration)
        setWebSearchOverride(null)
        setSelectedKBGroupIds(null)
        setToolsOverride(null)
      }
    },
    [chat, session, onUpdateSession, assistant, toast, effectiveWebSearch, effectiveKnowledgeBase, effectiveKBGroupIds, effectiveToolsEnabled, canvasMode, activeArtifactId]
  )

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

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
      <div className="flex items-center justify-between gap-2 py-3 pl-14 pr-4 border-b border-border/50">
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

      {/* Messages with Virtuoso + optional Artifact Panel */}
      <div className="flex-1 relative flex overflow-hidden">
      {activeArtifact ? (
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={55} minSize={30}>
            <MessagesArea
              chat={chat}
              allMessages={allMessages}
              isLoading={isLoading}
              isStreaming={isStreaming}
              assistant={assistant}
              messageSources={messageSources}
              editingMessageId={editingMessageId}
              editContent={editContent}
              viewingVersions={viewingVersions}
              copiedId={copiedId}
              error={error}
              showScrollButton={showScrollButton}
              atBottom={atBottom}
              handoffState={handoffState}
              handoffTriggeredMsgId={handoffTriggeredMsgId}
              virtuosoRef={virtuosoRef}
              setAtBottom={setAtBottom}
              setEditContent={setEditContent}
              setViewingVersions={setViewingVersions}
              setError={setError}
              handleSuggestionSelect={handleSuggestionSelect}
              handleSaveEdit={handleSaveEdit}
              handleCancelEdit={handleCancelEdit}
              handleCopy={handleCopy}
              handleEditMessage={handleEditMessage}
              handleRegenerate={handleRegenerate}
              handleDeleteMessage={handleDeleteMessage}
              handleReply={handleReply}
              scrollToBottom={scrollToBottom}
              scrollToMessage={scrollToMessage}
              requestHandoff={requestHandoff}
              openArtifact={openArtifact}
              artifacts={artifacts}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            <ArtifactPanel
              artifact={activeArtifact}
              onClose={closeArtifact}
              onUpdateArtifact={addOrUpdateArtifact}
              sessionId={session?.id}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <MessagesArea
          chat={chat}
          allMessages={allMessages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          assistant={assistant}
          messageSources={messageSources}
          editingMessageId={editingMessageId}
          editContent={editContent}
          viewingVersions={viewingVersions}
          copiedId={copiedId}
          error={error}
          showScrollButton={showScrollButton}
          atBottom={atBottom}
          handoffState={handoffState}
          handoffTriggeredMsgId={handoffTriggeredMsgId}
          virtuosoRef={virtuosoRef}
          setAtBottom={setAtBottom}
          setEditContent={setEditContent}
          setViewingVersions={setViewingVersions}
          setError={setError}
          handleSuggestionSelect={handleSuggestionSelect}
          handleSaveEdit={handleSaveEdit}
          handleCancelEdit={handleCancelEdit}
          handleCopy={handleCopy}
          handleEditMessage={handleEditMessage}
          handleRegenerate={handleRegenerate}
          handleDeleteMessage={handleDeleteMessage}
          handleReply={handleReply}
          scrollToBottom={scrollToBottom}
          scrollToMessage={scrollToMessage}
          requestHandoff={requestHandoff}
          openArtifact={openArtifact}
          artifacts={artifacts}
        />
      )}
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 bg-background">
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

          {/* Unified input container */}
          <div className="rounded-2xl border border-border/60 bg-muted/30 shadow-sm transition-all focus-within:border-foreground/20 focus-within:shadow-md focus-within:bg-muted/40">
            <div className="relative">
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
                      : "Ask, create, or start a task. Press Ctrl Enter to insert a line break..."
                }
                className="min-h-[52px] max-h-[200px] pr-12 resize-none !border-none !shadow-none bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-2xl rounded-b-none"
                disabled={isLoading || handoffState === "waiting" || handoffState === "requesting" || handoffState === "resolved"}
                rows={1}
              />
              <Button
                type={isStreaming ? "button" : "submit"}
                size="icon"
                className="absolute right-3 bottom-2 rounded-full h-8 w-8 shadow-sm"
                disabled={isStreaming ? false : (!input.trim() || isLoading)}
                onClick={isStreaming ? handleStop : undefined}
              >
                {isLoading ? (
                  isStreaming ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <ButtonLoadingIndicator />
                  )
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Toolbar inside container */}
            <div className="px-2 pb-2">
              <ChatInputToolbar
                onFileSelect={setAttachedFile}
                fileAttached={!!attachedFile}
                webSearchEnabled={effectiveWebSearch}
                onToggleWebSearch={() => setWebSearchOverride((prev) => !(prev ?? webSearchAvailable))}
                knowledgeBaseGroupIds={effectiveKBGroupIds}
                onKBGroupsChange={setSelectedKBGroupIds}
                kbGroups={kbGroups}
                toolsEnabled={effectiveToolsEnabled}
                onToggleTools={() => setToolsOverride((prev) => !(prev ?? (assistantTools.length > 0)))}
                assistantTools={assistantTools}
                onImportGithub={() => {
                  setGithubUrl("")
                  setGithubDialogOpen(true)
                }}
                canvasMode={canvasMode}
                onSetCanvasMode={setCanvasMode}
                artifacts={artifacts}
                activeArtifactId={activeArtifactId}
                onOpenArtifact={openArtifact}
                onCloseArtifact={closeArtifact}
                disabled={isLoading}
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            {handoffState === "connected"
              ? "You are chatting with a live agent · Enter to send"
              : <>
                  <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">Shift+Enter</kbd> new line · <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">⌘K</kbd> commands
                </>
            }
          </p>
        </form>
      </div>

      {/* GitHub Import Dialog */}
      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import from GitHub</DialogTitle>
            <DialogDescription>
              Enter a GitHub file or repository URL to import code.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/blob/main/file.ts"
            onKeyDown={(e) => {
              if (e.key === "Enter" && githubUrl.trim()) {
                setInput((prev) => prev + (prev ? "\n" : "") + `Import code from: ${githubUrl.trim()}`)
                setGithubDialogOpen(false)
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGithubDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (githubUrl.trim()) {
                  setInput((prev) => prev + (prev ? "\n" : "") + `Import code from: ${githubUrl.trim()}`)
                  setGithubDialogOpen(false)
                }
              }}
              disabled={!githubUrl.trim()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
