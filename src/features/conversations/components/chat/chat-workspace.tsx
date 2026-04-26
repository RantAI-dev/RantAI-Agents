"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
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
  FileText,
  Layers,
  Download,
} from "@/lib/icons"
import { SendHorizontal } from "lucide-react"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { useProfileStore } from "@/hooks/use-profile"
import { ToastAction } from "@/components/ui/toast"
import { MarkdownContent } from "./markdown-content"
import { TypingIndicator, ButtonLoadingIndicator } from "./typing-indicator"
import { QuickSuggestions } from "./quick-suggestions"
import { MessageSources, Source } from "./message-sources"
import { ConversationExport } from "./conversation-export"
import { CommandPalette } from "./command-palette"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FilePreview } from "./file-preview"
import { ChatInputToolbar, type AssistantToolInfo, type AssistantSkillInfo, type CanvasMode, type KBGroup, type ToolMode, type SkillMode } from "./chat-input-toolbar"
import { ThreadIndicator, ReplyButton, MessageReplyIndicator } from "./thread-indicator"
import { EditVersionIndicator, getVersionContent, getVersionAssistantResponse } from "./edit-version-indicator"
import { ToolCallIndicator } from "./tool-call-indicator"
import { useArtifacts } from "./artifacts/use-artifacts"
import { ArtifactIndicator } from "./artifacts/artifact-indicator"
import { isPersistedArtifactToolCall, getEffectiveToolState } from "./artifact-tool-result"
import { ArtifactPanel } from "./artifacts/artifact-panel"
import { isValidArtifactType, type Artifact, type ArtifactType } from "./artifacts/types"
import { TYPE_ICONS, TYPE_LABELS, getArtifactRegistryEntry } from "./artifacts/registry"
import { consumeSseChunk } from "./transports/sse"
import { reduceEmployeePollEvents, type EmployeePollEvent } from "./transports/polling"
import type { TransportToolCallMap } from "./transports/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useOrgFetch } from "@/hooks/use-organization"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

// Marker for agent handoff in AI responses
const AGENT_HANDOFF_MARKER = "[AGENT_HANDOFF]"

// Handoff state type
type HandoffState = "idle" | "requesting" | "waiting" | "connected" | "resolved"

/** Settings from ChatHome toolbar to apply on initial message send */
interface InitialChatSettings {
  files?: File[]
  webSearchEnabled?: boolean
  codeInterpreterEnabled?: boolean
  knowledgeBaseGroupIds?: string[]
  toolMode?: ToolMode
  selectedToolNames?: string[]
  skillMode?: SkillMode
  selectedSkillIds?: string[]
  canvasMode?: CanvasMode
}

interface ChatWorkspaceProps {
  session?: ChatSession
  assistant: Assistant
  digitalEmployeeId?: string
  apiEndpoint?: string
  initialMessage?: string
  initialSettings?: InitialChatSettings
  onInitialMessageConsumed?: () => void
  initialAssistantTools?: AssistantToolInfo[]
  initialAssistantSkills?: AssistantSkillInfo[]
  initialKnowledgeBaseGroups?: KBGroup[]
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

// Attachment info for file uploads displayed on user messages
interface AttachmentInfo {
  fileName: string
  mimeType: string
  type: "inline" | "rag"
  text?: string
  pageCount?: number
  chunkCount?: number
  fileUrl?: string // blob URL for native file preview (session-only)
  fileId?: string  // persistent server-stored file ID
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
type PersistedArtifactSnapshot = {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content: string; title: string; timestamp: number }>
  }
}

interface SessionToolbarStateSnapshot {
  selectedKBGroupIds: string[] | null
  toolMode: ToolMode
  selectedToolNames: string[]
  skillMode: SkillMode
  selectedSkillIds: string[]
  webSearchOverride: boolean | null
  codeInterpreterOverride: boolean | null
  canvasMode?: CanvasMode
}

const SESSION_TOOLBAR_STATE_STORAGE_PREFIX = "chat-toolbar-state:"

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
  messageAttachments,
  onViewAttachment,
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
  digitalEmployeeId,
}: {
  chat: ReturnType<typeof useChat>
  allMessages: ReturnType<typeof useChat>["messages"]
  isLoading: boolean
  isStreaming: boolean
  assistant: Assistant
  messageSources: Record<string, Source[]>
  messageAttachments: Record<string, AttachmentInfo[]>
  onViewAttachment: (att: AttachmentInfo) => void
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
  digitalEmployeeId?: string
}) {
  const { avatarUrl: userAvatarUrl, name: userName } = useProfileStore()

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
          initialTopMostItemIndex={allMessages.length - 1}
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
                      "flex shrink-0 items-center justify-center rounded-full overflow-hidden",
                      isUser
                        ? "h-8 w-8 bg-neutral-300 text-neutral-700 dark:bg-neutral-600 dark:text-white shadow-sm"
                        : "h-8 w-8 bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"
                    )}
                  >
                    {isUser ? (
                      userAvatarUrl ? (
                        <img src={userAvatarUrl} alt={userName || "User"} className="h-8 w-8 object-cover" />
                      ) : userName ? (
                        <span className="text-xs font-medium">{userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )
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
                                    if (isPersistedArtifactToolCall(tp)) {
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
                                          content={existing?.content || (out.content as string | undefined)}
                                          onClick={() => {
                                            if (artifactId) openArtifact(artifactId)
                                          }}
                                        />
                                      )
                                    }
                                    // Failed artifact tool calls (validation rejected, concurrent
                                    // update conflict, missing artifact) fall through to the regular
                                    // tool-call indicator. getEffectiveToolState rewrites the state
                                    // to "error" so the pill renders red instead of green.
                                    const effective = getEffectiveToolState(tp)
                                    return (
                                      <ToolCallIndicator
                                        key={tp.toolCallId}
                                        toolName={tp.toolName}
                                        state={effective.state}
                                        args={tp.input}
                                        result={tp.output}
                                        errorText={effective.errorText}
                                        employeeId={digitalEmployeeId}
                                      />
                                    )
                                  })}
                                </div>
                              )
                            }
                            // Fallback: render tool calls + artifact indicators from persisted metadata (after session switch/refresh)
                            const msgMeta = (message as unknown as {
                              metadata?: {
                                artifactIds?: string[]
                                toolCalls?: ToolCallPart[]
                                artifacts?: Array<{
                                  id: string
                                  title?: string
                                  artifactType?: string
                                }>
                              }
                            }).metadata
                            const persistedTCs = msgMeta?.toolCalls
                            const persistedIds = msgMeta?.artifactIds
                            const persistedArtifacts = msgMeta?.artifacts
                            if (
                              (persistedTCs && persistedTCs.length > 0) ||
                              (persistedIds && persistedIds.length > 0) ||
                              (persistedArtifacts && persistedArtifacts.length > 0)
                            ) {
                              return (
                                <div className="space-y-0.5 mb-1">
                                  {persistedTCs?.map((tc) => {
                                    if (isPersistedArtifactToolCall(tc)) {
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
                                          content={existing?.content || (out.content as string | undefined)}
                                          onClick={() => {
                                            if (artifactId) openArtifact(artifactId)
                                          }}
                                        />
                                      )
                                    }
                                    // Failed artifact tool calls fall through to the tool-call
                                    // indicator with state rewritten to "error" so the user can
                                    // tell the LLM's attempt didn't take.
                                    const effective = getEffectiveToolState(tc)
                                    return (
                                      <ToolCallIndicator
                                        key={tc.toolCallId}
                                        toolName={tc.toolName}
                                        state={effective.state}
                                        args={tc.input}
                                        result={tc.output}
                                        errorText={effective.errorText}
                                        employeeId={digitalEmployeeId}
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
                                        content={art.content}
                                        onClick={() => openArtifact(aid)}
                                      />
                                    )
                                  })}
                                  {/* Fallback snapshot artifacts (post-refresh when only metadata.artifacts is present) */}
                                  {persistedArtifacts
                                    ?.filter((artifact) => {
                                      const aid = artifact.id
                                      const seenInToolCalls = persistedTCs?.some((tc) => {
                                        const out = tc.output as Record<string, unknown> | undefined
                                        return out?.id === aid
                                      })
                                      const seenInIds = persistedIds?.includes(aid)
                                      return !seenInToolCalls && !seenInIds
                                    })
                                    .map((artifact) => {
                                      const inMemory = artifacts.get(artifact.id)
                                      return (
                                        <ArtifactIndicator
                                          key={`snapshot-${artifact.id}`}
                                          title={inMemory?.title || artifact.title || "Artifact"}
                                          type={inMemory?.type || (artifact.artifactType as ArtifactType) || "application/code"}
                                          content={inMemory?.content}
                                          onClick={() => openArtifact(artifact.id)}
                                        />
                                      )
                                    })}
                                </div>
                              )
                            }
                            return null
                          })()}
                          {/* Attachment badges for user messages */}
                          {isUser && messageAttachments?.[message.id]?.map((att, i) => {
                            const ext = att.mimeType === "application/pdf" ? "PDF"
                              : att.mimeType?.startsWith("image/") ? "IMG"
                                : att.mimeType === "text/markdown" ? "MD" : "TXT"
                            return (
                              <button
                                key={`${att.fileName}-${i}`}
                                onClick={() => onViewAttachment(att)}
                                className="flex items-center gap-2 mb-1 p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors w-full text-left"
                              >
                                <FileText className="h-4 w-4 shrink-0 opacity-60" />
                                <span className="text-xs truncate flex-1">{att.fileName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-medium uppercase">{ext}</span>
                              </button>
                            )
                          })}
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
                          {formatDistanceToNow((message as any).createdAt ? new Date((message as any).createdAt) : new Date(), { addSuffix: true })}
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
  digitalEmployeeId,
  apiEndpoint,
  initialMessage,
  initialSettings,
  onInitialMessageConsumed,
  initialAssistantTools,
  initialAssistantSkills,
  initialKnowledgeBaseGroups,
  onBack,
  onUpdateSession,
  onNewChat,
}: ChatWorkspaceProps) {
  const orgFetch = useOrgFetch()
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  // Resolve DB-persisted session ID for API calls (handles temp → db ID mapping)
  const apiSessionId = session?.dbId || session?.id

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
  const [messageAttachments, setMessageAttachments] = useState<
    Record<string, AttachmentInfo[]>
  >({})
  const [viewingAttachment, setViewingAttachment] = useState<AttachmentInfo | null>(null)

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")

  // Reply/Thread state
  const [replyingTo, setReplyingTo] = useState<{
    id: string
    content: string
  } | null>(null)

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)

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
  const hasInitialAssistantTools = initialAssistantTools !== undefined
  const hasInitialAssistantSkills = initialAssistantSkills !== undefined

  // Toolbar: per-message overrides for web search, knowledge base & tools
  const [webSearchOverride, setWebSearchOverride] = useState<boolean | null>(null)
  const [codeInterpreterOverride, setCodeInterpreterOverride] = useState<boolean | null>(null)
  const [selectedKBGroupIds, setSelectedKBGroupIds] = useState<string[] | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>("auto")
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([])
  const [skillMode, setSkillMode] = useState<SkillMode>("auto")
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [assistantTools, setAssistantTools] = useState<AssistantToolInfo[]>(() => initialAssistantTools ?? [])
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkillInfo[]>(() => initialAssistantSkills ?? [])
  const [assistantDefaultToolNames, setAssistantDefaultToolNames] = useState<string[]>(
    () => (initialAssistantTools ?? []).map((tool) => tool.name)
  )
  const [assistantDefaultSkillIds, setAssistantDefaultSkillIds] = useState<string[]>(
    () => (initialAssistantSkills ?? []).map((skill) => skill.id)
  )

  // Knowledge base groups for picker
  const [kbGroups, setKBGroups] = useState<KBGroup[]>(() => initialKnowledgeBaseGroups ?? [])
  const [hasSessionToolbarState, setHasSessionToolbarState] = useState(false)
  const hasInitialToolbarOverrides =
    Boolean(initialSettings?.webSearchEnabled !== undefined) ||
    Boolean(initialSettings?.codeInterpreterEnabled !== undefined) ||
    Boolean(initialSettings?.knowledgeBaseGroupIds !== undefined) ||
    Boolean(initialSettings?.toolMode !== undefined) ||
    Boolean(initialSettings?.selectedToolNames !== undefined) ||
    Boolean(initialSettings?.skillMode !== undefined) ||
    Boolean(initialSettings?.selectedSkillIds !== undefined)
  const preserveInitialToolbarSelectionRef = useRef(hasInitialToolbarOverrides)
  const toolbarStateHydratedRef = useRef(false)
  const hasPersistedToolbarState = useCallback(() => {
    if (typeof window === "undefined") return false
    const storageSessionKey = apiSessionId || session?.id
    if (!storageSessionKey) return false
    const key = `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${storageSessionKey}`
    return window.sessionStorage.getItem(key) !== null
  }, [apiSessionId, session?.id])

  // Canvas mode — forces AI to create/update artifacts
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(false)

  // GitHub import dialog state
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")
  const [githubImporting, setGithubImporting] = useState(false)
  const [githubImportResult, setGithubImportResult] = useState<{
    type: "inline" | "rag"
    fileName: string
    text?: string
    documentId?: string
    fileCount: number
  } | null>(null)

  const handleGithubImport = useCallback(async () => {
    const url = githubUrl.trim()
    if (!url) return

    if (!url.includes("github.com/")) {
      toast({ title: "Invalid URL", description: "Please enter a GitHub URL", variant: "destructive" })
      return
    }

    setGithubImporting(true)
    try {
      const res = await fetch("/api/chat/github-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sessionId: apiSessionId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Import failed: ${res.status}`)

      if (data.type === "inline" && data.text) {
        // Small repo/single file — store as inline context
        setGithubImportResult({
          type: "inline",
          fileName: data.fileName,
          text: data.text,
          fileCount: data.fileCount,
        })
      } else if (data.type === "rag" && data.documentId) {
        // Large repo — stored as RAG document
        setGithubImportResult({
          type: "rag",
          fileName: data.fileName,
          documentId: data.documentId,
          fileCount: data.fileCount,
        })
      }

      setGithubDialogOpen(false)
      setGithubUrl("")

      const desc = data.fileCount === 1
        ? `${data.fileName} attached`
        : `${data.fileCount} files from ${data.fileName}${data.skippedCount ? ` (${data.skippedCount} skipped)` : ""}`
      toast({ title: "Imported from GitHub", description: desc })
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Could not import from GitHub", variant: "destructive" })
    } finally {
      setGithubImporting(false)
    }
  }, [githubUrl, toast, apiSessionId])

  const queuedInitialMessageKeyRef = useRef<string | null>(null)

  // Artifacts system. We pass the session id so the active-artifact pointer
  // is persisted per-session in sessionStorage and survives a page refresh.
  const {
    artifacts,
    activeArtifact,
    activeArtifactId,
    addOrUpdateArtifact,
    removeArtifact,
    loadFromPersisted,
    openArtifact,
    closeArtifact,
  } = useArtifacts(apiSessionId || session?.id || null)

  const [artifactsSheetOpen, setArtifactsSheetOpen] = useState(false)

  const handleDownloadArtifact = useCallback((artifact: Artifact) => {
    const ext =
      artifact.type === "application/code"
        ? `.${artifact.language || "txt"}`
        : (getArtifactRegistryEntry(artifact.type)?.extension ?? ".txt")
    const filename = `${artifact.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}${ext}`
    const blob = new Blob([artifact.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Notify layout to auto collapse/expand sidebar when artifact panel visibility changes
  const prevPanelVisibleRef = useRef(false)
  useEffect(() => {
    const isPanelVisible = !!activeArtifactId
    if (isPanelVisible !== prevPanelVisibleRef.current) {
      prevPanelVisibleRef.current = isPanelVisible
      window.dispatchEvent(
        new CustomEvent("artifact-panel-changed", { detail: { open: isPanelVisible } })
      )
    }
  }, [activeArtifactId])

  const handleOpenArtifact = useCallback((id: string) => {
    openArtifact(id)
  }, [openArtifact])

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
  const setChatMessagesRef = useRef(chat.setMessages)

  useEffect(() => {
    setChatMessagesRef.current = chat.setMessages
  }, [chat.setMessages])

  const loadFreshSessionArtifacts = useCallback(
    async (hasFallbackArtifacts: boolean, signal?: AbortSignal) => {
      if (!apiSessionId) {
        if (!hasFallbackArtifacts) {
          loadFromPersisted([])
        }
        return
      }

      try {
        const response = await fetch(`/api/dashboard/chat/sessions/${apiSessionId}`, { signal })
        const data = response.ok ? await response.json() : null
        if (data?.artifacts?.length > 0) {
          loadFromPersisted(data.artifacts)
        } else if (!hasFallbackArtifacts) {
          loadFromPersisted([])
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return
        }
        if (!hasFallbackArtifacts) {
          loadFromPersisted([])
        }
      }
    },
    [apiSessionId, loadFromPersisted]
  )

  const loadAssistantTools = useCallback(
    async (
      assistantId: string,
      options?: { signal?: AbortSignal; preserveSessionSelection?: boolean }
    ) => {
      const {
        signal,
        preserveSessionSelection = false,
      } = options ?? {}
      try {
        const [boundRes, allRes] = await Promise.all([
          fetch(`/api/assistants/${assistantId}/tools`, { signal }),
          fetch("/api/dashboard/tools", { signal }),
        ])

        const boundTools = (boundRes.ok ? await boundRes.json() : []) as Array<{
          name: string
          enabledForAssistant?: boolean
        }>
        const allTools = (allRes.ok ? await allRes.json() : []) as Array<{
          id?: string
          name: string
          displayName: string
          description: string
          category: string
          enabled?: boolean
          icon?: string | null
        }>

        const visibleToolNames = new Set(
          Array.isArray(allTools)
            ? allTools
                .filter((tool) => tool.enabled !== false)
                .map((tool) => tool.name)
            : []
        )
        const defaultToolNames = Array.isArray(boundTools)
          ? boundTools
              .filter((tool) => tool.enabledForAssistant !== false)
              .map((tool) => tool.name)
              .filter((name) => visibleToolNames.has(name))
          : []
        setAssistantDefaultToolNames(defaultToolNames)
        if (!preserveSessionSelection) {
          setSelectedToolNames(defaultToolNames)
          setToolMode(defaultToolNames.length > 0 ? "auto" : "off")
        }

        if (Array.isArray(allTools)) {
          setAssistantTools(
            allTools
              .filter((tool) => tool.enabled !== false)
              .map((tool) => ({
                id: tool.id,
                name: tool.name,
                displayName: tool.displayName,
                description: tool.description,
                category: tool.category,
                icon: tool.icon,
              }))
          )
        } else {
          setAssistantTools([])
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return
        }
        setAssistantDefaultToolNames([])
        if (!preserveSessionSelection) {
          setSelectedToolNames([])
        }
      }
    },
    []
  )

  const loadAssistantSkills = useCallback(async (
    assistantId: string,
    options?: { signal?: AbortSignal; preserveSessionSelection?: boolean }
  ) => {
    const {
      signal,
      preserveSessionSelection = false,
    } = options ?? {}
    try {
      const [boundRes, allRes, allToolsRes] = await Promise.all([
        fetch(`/api/assistants/${assistantId}/skills`, { signal }),
        fetch("/api/dashboard/skills", { signal }),
        fetch("/api/dashboard/tools", { signal }),
      ])

      const boundSkills = (boundRes.ok ? await boundRes.json() : []) as Array<{
        id: string
        enabled?: boolean
      }>
      const allSkills = (allRes.ok ? await allRes.json() : []) as Array<{
        id: string
        displayName: string
        description: string
        icon?: string | null
        enabled?: boolean
        relatedToolIds?: string[]
        metadata?: Record<string, unknown> | null
      }>
      const allTools = (allToolsRes.ok ? await allToolsRes.json() : []) as Array<{
        id?: string
        name: string
        enabled?: boolean
      }>

      const defaultSkillIds = Array.isArray(boundSkills)
        ? boundSkills
            .filter((skill) => skill.enabled !== false)
            .map((skill) => skill.id)
        : []
      setAssistantDefaultSkillIds(defaultSkillIds)
      if (!preserveSessionSelection) {
        setSelectedSkillIds(defaultSkillIds)
        setSkillMode(defaultSkillIds.length > 0 ? "auto" : "off")
      }

      if (Array.isArray(allSkills)) {
        const toolNameById = new Map(
          allTools
            .filter(
              (tool) =>
                tool.enabled !== false &&
                typeof tool.id === "string" &&
                tool.id.length > 0
            )
            .map((tool) => [tool.id as string, tool.name])
        )
        setAssistantSkills(
          allSkills
            .filter((skill) => skill.enabled !== false)
            .map((skill) => ({
              id: skill.id,
              displayName: skill.displayName,
              description: skill.description,
              icon: skill.icon,
              autoToolNames: (() => {
                const names = new Set<string>()
                const addToolName = (value: unknown) => {
                  if (typeof value !== "string" || value.length === 0) return
                  names.add(toolNameById.get(value) ?? value)
                }
                if (Array.isArray(skill.relatedToolIds)) {
                  for (const toolId of skill.relatedToolIds) {
                    const toolName = toolNameById.get(toolId)
                    if (toolName) names.add(toolName)
                  }
                }
                const attachedToolIds = Array.isArray(skill.metadata?.toolIds)
                  ? skill.metadata.toolIds
                  : []
                for (const toolId of attachedToolIds) addToolName(toolId)
                const requiredTools =
                  skill.metadata &&
                  typeof skill.metadata === "object" &&
                  !Array.isArray(skill.metadata) &&
                  skill.metadata.requirements &&
                  typeof skill.metadata.requirements === "object" &&
                  !Array.isArray(skill.metadata.requirements) &&
                  Array.isArray((skill.metadata.requirements as { tools?: unknown }).tools)
                    ? (skill.metadata.requirements as { tools: unknown[] }).tools
                    : []
                for (const tool of requiredTools) {
                  if (typeof tool === "object" && tool !== null && !Array.isArray(tool)) {
                    const candidate = tool as Record<string, unknown>
                    addToolName(candidate.name)
                    addToolName(candidate.toolName)
                    addToolName(candidate.id)
                    continue
                  }
                  addToolName(tool)
                }
                const sharedTools = Array.isArray(skill.metadata?.sharedTools)
                  ? skill.metadata.sharedTools
                  : []
                for (const tool of sharedTools) addToolName(tool)
                const directTools = Array.isArray(skill.metadata?.tools)
                  ? skill.metadata.tools
                  : []
                for (const tool of directTools) addToolName(tool)
                return Array.from(names)
              })(),
            }))
        )
      } else {
        setAssistantSkills([])
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return
      }
      setAssistantDefaultSkillIds([])
      if (!preserveSessionSelection) {
        setSelectedSkillIds([])
      }
    }
  }, [])

  const loadKnowledgeBaseGroups = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await orgFetch("/api/dashboard/files/groups", { signal })
      const data = await response.json()
      setKBGroups(data.groups || [])
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return
      }
      setKBGroups([])
    }
  }, [orgFetch])

  const uploadInitialFiles = useCallback(
    async (files: File[]) => {
      let fileCtx: { fileContext?: string; fileDocumentIds?: string[] } | undefined
      const uploadAttachments: AttachmentInfo[] = []

      for (const file of files) {
        try {
          const formData = new FormData()
          formData.append("file", file)
          if (apiSessionId) formData.append("sessionId", apiSessionId)

          const uploadRes = await fetch("/api/chat/upload", {
            method: "POST",
            body: formData,
          })

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            if (uploadData.result) {
              if (uploadData.result.type === "inline" && uploadData.result.text) {
                const ctx = `[Attached file: ${uploadData.result.fileName}]\n${uploadData.result.text}`
                fileCtx = {
                  fileContext: fileCtx?.fileContext
                    ? `${fileCtx.fileContext}\n\n${ctx}`
                    : ctx,
                  fileDocumentIds: fileCtx?.fileDocumentIds,
                }
              } else if (uploadData.result.type === "rag" && uploadData.result.documentId) {
                fileCtx = {
                  fileContext: fileCtx?.fileContext,
                  fileDocumentIds: [
                    ...(fileCtx?.fileDocumentIds || []),
                    uploadData.result.documentId,
                  ],
                }
              }
              uploadAttachments.push({
                fileName: uploadData.result.fileName,
                mimeType: uploadData.result.mimeType,
                type: uploadData.result.type,
                text: uploadData.result.text,
                pageCount: uploadData.result.pageCount,
                chunkCount: uploadData.result.chunkCount,
                fileId: uploadData.result.fileId,
              })
            }
          }
        } catch (err) {
          console.error("[ChatWorkspace] Initial file upload error:", err)
        }
      }

      return { fileCtx, uploadAttachments }
    },
    [apiSessionId]
  )

  const syncSessionState = useCallback(
    (currentSession: ChatSession | undefined, controller: AbortController) => {
      if (currentSession?.messages && currentSession.messages.length > 0) {
        setChatMessagesRef.current(
          currentSession.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata || undefined,
          })) as any
        )
        const restoredAttachments: Record<string, AttachmentInfo[]> = {}
        const restoredSources: Record<string, Source[]> = {}
        for (const m of currentSession.messages) {
          const meta = m.metadata as { attachments?: AttachmentInfo[] } | null
          if (meta?.attachments && meta.attachments.length > 0) {
            restoredAttachments[m.id] = meta.attachments
          }
          if (m.sources && m.sources.length > 0) {
            restoredSources[m.id] = m.sources
          }
        }
        if (Object.keys(restoredAttachments).length > 0) {
          setMessageAttachments((prev) => ({ ...prev, ...restoredAttachments }))
        }
        if (Object.keys(restoredSources).length > 0) {
          setMessageSources((prev) => ({ ...prev, ...restoredSources }))
        }
      } else {
        setChatMessagesRef.current([] as any)
      }

      const fallbackArtifacts: PersistedArtifactSnapshot[] = []
      for (const m of currentSession?.messages || []) {
        const meta = m.metadata as { artifacts?: PersistedArtifactSnapshot[] } | null
        if (meta?.artifacts && Array.isArray(meta.artifacts)) {
          fallbackArtifacts.push(...meta.artifacts)
        }
      }
      const dedupedFallbackArtifacts = Array.from(
        new Map(fallbackArtifacts.map((artifact) => [artifact.id, artifact])).values()
      )

      if (currentSession?.artifacts !== undefined) {
        if (currentSession.artifacts.length > 0) {
          loadFromPersisted(currentSession.artifacts)
        } else if (dedupedFallbackArtifacts.length > 0) {
          loadFromPersisted(dedupedFallbackArtifacts)
        } else {
          loadFromPersisted([])
        }
      } else if (currentSession?.id) {
        if (dedupedFallbackArtifacts.length > 0) {
          loadFromPersisted(dedupedFallbackArtifacts)
        }
        void loadFreshSessionArtifacts(false, controller.signal)
      } else {
        loadFromPersisted([])
      }

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
    },
    [loadFromPersisted, loadFreshSessionArtifacts]
  )

  const syncAssistantResources = useCallback(
    (currentAssistant: Assistant | undefined, signal: AbortSignal) => {
      if (!currentAssistant?.id) {
        setAssistantTools([])
        setAssistantSkills([])
        setWebSearchOverride(null)
        setCodeInterpreterOverride(null)
        setSelectedKBGroupIds(null)
        setToolMode("off")
        setSelectedToolNames([])
        setSkillMode("off")
        setSelectedSkillIds([])
        setAssistantDefaultToolNames([])
        setAssistantDefaultSkillIds([])
        setKBGroups([])
        return
      }

      if (!hasInitialAssistantTools) {
        void loadAssistantTools(currentAssistant.id, {
          signal,
          preserveSessionSelection:
            hasSessionToolbarState ||
            preserveInitialToolbarSelectionRef.current ||
            hasPersistedToolbarState(),
        })
      }
      if (!hasInitialAssistantSkills) {
        void loadAssistantSkills(currentAssistant.id, {
          signal,
          preserveSessionSelection:
            hasSessionToolbarState ||
            preserveInitialToolbarSelectionRef.current ||
            hasPersistedToolbarState(),
        })
      }
      // Always refresh KB groups from the active org scope to avoid stale empty hydration.
      void loadKnowledgeBaseGroups(signal)
    },
    [
      hasSessionToolbarState,
      hasPersistedToolbarState,
      hasInitialAssistantSkills,
      hasInitialAssistantTools,
      loadAssistantSkills,
      loadAssistantTools,
      loadKnowledgeBaseGroups,
    ]
  )

  // Reset state and load messages only when switching to a different session.
  // Do not re-run for same-session message updates, or we can clear active artifact UI.
  useEffect(() => {
    const controller = new AbortController()
    syncSessionState(session, controller)
    return () => controller.abort()
  }, [session?.id, syncSessionState])

  useEffect(() => {
    toolbarStateHydratedRef.current = false
    const storageSessionKey = apiSessionId || session?.id
    if (!storageSessionKey || typeof window === "undefined") {
      setHasSessionToolbarState(false)
      toolbarStateHydratedRef.current = true
      return
    }

    const primaryStorageKey = `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${storageSessionKey}`
    const fallbackStorageKey = session?.id
      ? `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${session.id}`
      : null
    const raw =
      window.sessionStorage.getItem(primaryStorageKey) ||
      (fallbackStorageKey ? window.sessionStorage.getItem(fallbackStorageKey) : null)
    if (!raw) {
      setHasSessionToolbarState(false)
      toolbarStateHydratedRef.current = true
      return
    }

    try {
      const parsed = JSON.parse(raw) as SessionToolbarStateSnapshot
      if (!parsed || typeof parsed !== "object") {
        setHasSessionToolbarState(false)
        return
      }

      setSelectedKBGroupIds(Array.isArray(parsed.selectedKBGroupIds) ? parsed.selectedKBGroupIds : null)
      setToolMode(parsed.toolMode === "auto" || parsed.toolMode === "off" || parsed.toolMode === "select" ? parsed.toolMode : "off")
      setSelectedToolNames(Array.isArray(parsed.selectedToolNames) ? parsed.selectedToolNames : [])
      setSkillMode(parsed.skillMode === "auto" || parsed.skillMode === "off" || parsed.skillMode === "select" ? parsed.skillMode : "off")
      setSelectedSkillIds(Array.isArray(parsed.selectedSkillIds) ? parsed.selectedSkillIds : [])
      setWebSearchOverride(typeof parsed.webSearchOverride === "boolean" ? parsed.webSearchOverride : null)
      setCodeInterpreterOverride(typeof parsed.codeInterpreterOverride === "boolean" ? parsed.codeInterpreterOverride : null)
      if (parsed.canvasMode !== undefined) {
        setCanvasMode(parsed.canvasMode)
      }
      setHasSessionToolbarState(true)
      if (!window.sessionStorage.getItem(primaryStorageKey)) {
        window.sessionStorage.setItem(primaryStorageKey, raw)
      }
    } catch {
      setHasSessionToolbarState(false)
    } finally {
      toolbarStateHydratedRef.current = true
    }
  }, [apiSessionId, session?.id])

  useEffect(() => {
    const storageSessionKey = apiSessionId || session?.id
    if (!storageSessionKey || typeof window === "undefined") return
    if (!toolbarStateHydratedRef.current) return

    const storageKey = `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${storageSessionKey}`
    const snapshot: SessionToolbarStateSnapshot = {
      selectedKBGroupIds,
      toolMode,
      selectedToolNames,
      skillMode,
      selectedSkillIds,
      webSearchOverride,
      codeInterpreterOverride,
      canvasMode,
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot))
  }, [
    apiSessionId,
    session?.id,
    selectedKBGroupIds,
    toolMode,
    selectedToolNames,
    skillMode,
    selectedSkillIds,
    webSearchOverride,
    codeInterpreterOverride,
    canvasMode,
  ])

  // Handle lazy-loaded messages (session messages populated after initial mount)
  useEffect(() => {
    if (!session?.id || !session.messages || session.messages.length === 0) return
    // Only sync if chat has no messages yet (lazy-load case)
    if (chat.messages.length > 0) return

    chat.setMessages(
      session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata || undefined,
      })) as any
    )
    // Restore attachments from persisted message metadata
    const restoredAttachments: Record<string, AttachmentInfo[]> = {}
    const restoredSources: Record<string, Source[]> = {}
    for (const m of session.messages) {
      const meta = m.metadata as { attachments?: AttachmentInfo[] } | null
      if (meta?.attachments && meta.attachments.length > 0) {
        restoredAttachments[m.id] = meta.attachments
      }
      if (m.sources && m.sources.length > 0) {
        restoredSources[m.id] = m.sources
      }
    }
    if (Object.keys(restoredAttachments).length > 0) {
      setMessageAttachments(prev => ({ ...prev, ...restoredAttachments }))
    }
    if (Object.keys(restoredSources).length > 0) {
      setMessageSources(prev => ({ ...prev, ...restoredSources }))
    }

    // Restore artifact fallback snapshots from assistant message metadata.
    if ((!session.artifacts || session.artifacts.length === 0) && artifacts.size === 0) {
      const fallbackArtifacts: PersistedArtifactSnapshot[] = []
      for (const m of session.messages) {
        const meta = m.metadata as { artifacts?: PersistedArtifactSnapshot[] } | null
        if (meta?.artifacts && Array.isArray(meta.artifacts)) {
          fallbackArtifacts.push(...meta.artifacts)
        }
      }
      const dedupedFallbackArtifacts = Array.from(
        new Map(fallbackArtifacts.map((artifact) => [artifact.id, artifact])).values()
      )
      if (dedupedFallbackArtifacts.length > 0) {
        loadFromPersisted(dedupedFallbackArtifacts)
      }
    }
  }, [session?.messages?.length, session?.artifacts, artifacts.size, loadFromPersisted])

  // Seed assistant tools, skills, and knowledge groups when hydrated by the server.
  useEffect(() => {
    const controller = new AbortController()
    syncAssistantResources(assistant, controller.signal)
    return () => controller.abort()
  }, [assistant, syncAssistantResources])

  // Derived toolbar values
  const webSearchAvailable = assistantTools.some((t) => t.name === "web_search")
  const effectiveWebSearch = webSearchOverride ?? webSearchAvailable
  const codeInterpreterAvailable = assistantTools.some((t) => t.name === "code_interpreter")
  const effectiveCodeInterpreter = codeInterpreterOverride ?? codeInterpreterAvailable
  const effectiveKBGroupIds = selectedKBGroupIds ?? (assistant.knowledgeBaseGroupIds || [])
  const effectiveKnowledgeBase = selectedKBGroupIds !== null
    ? selectedKBGroupIds.length > 0
    : (assistant.useKnowledgeBase ?? false)
  const effectiveToolsEnabled = toolMode !== "off"
  const effectiveToolNames = toolMode === "select" ? selectedToolNames : undefined
  const effectiveSkillsEnabled = skillMode !== "off"
  const effectiveSkillIds =
    skillMode === "select"
      ? selectedSkillIds
      : skillMode === "auto"
        ? assistantDefaultSkillIds
        : undefined

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
      editHistory?: EditHistoryEntry[],
      fileCtx?: { fileContext?: string; fileDocumentIds?: string[] },
      attachments?: AttachmentInfo[],
      toolOverrides?: {
        enableWebSearch?: boolean
        enableCodeInterpreter?: boolean
        useKnowledgeBase?: boolean
        knowledgeBaseGroupIds?: string[]
        enableTools?: boolean
        enabledToolNames?: string[]
        enableSkills?: boolean
        enabledSkillIds?: string[]
        canvasMode?: CanvasMode
      }
    ) => {
      setIsLoading(true)
      setIsStreaming(false)
      setError(null)

      // Strip transient fileUrl (blob URLs) before persisting, keep fileId
      const persistableAttachments = attachments?.map(({ fileUrl, ...rest }) => rest)

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: userInput,
        ...(replyToId && { replyTo: replyToId }),
        ...(editHistory && editHistory.length > 0 && { editHistory }),
        ...(persistableAttachments && persistableAttachments.length > 0 && {
          metadata: { attachments: persistableAttachments },
        }),
      }
      const assistantMsgId = crypto.randomUUID()

      // Store attachment info for display on user message bubble
      if (attachments && attachments.length > 0) {
        setMessageAttachments(prev => ({ ...prev, [userMessage.id]: attachments }))
      }

      // Enable auto-scroll
      shouldAutoScroll.current = true

      // Add user message AND assistant placeholder immediately for instant feedback.
      // Keep a stable assistant message ID so parent session sync cannot remove it mid-stream.
      chat.setMessages([
        ...baseMessages,
        userMessage,
        { id: assistantMsgId, role: "assistant", content: "" },
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
            {
              id: assistantMsgId,
              role: "assistant" as const,
              content: "",
              createdAt: new Date(),
            },
          ],
          title,
        })
      }

      // Declared at the sendMessage scope (above the try) so the catch
      // block below can clean them up on stream failure / abort. See
      // the streaming-input handler for how these get populated.
      const preStreamSnapshots = new Map<string, Artifact | null>()
      const createdStreamingIds = new Set<string>()

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

        const endpoint = apiEndpoint || "/api/chat"
        const resolvedCanvasMode = toolOverrides?.canvasMode ?? canvasMode
        setIsStreaming(true)

        let assistantContent = ""
        const toolCalls: TransportToolCallMap = new Map()
        // preStreamSnapshots / createdStreamingIds declared above the try
        // so the catch block can clean them up. preStreamSnapshots holds
        // the pre-stream state of any artifact mutated by an
        // `update_artifact` stream; createdStreamingIds tracks every
        // `streaming-${toolCallId}` placeholder we created.

        // isSSE tracks whether we're in SSE mode
        let isSSE = false
        let streamedSources: Source[] = []

        // ── Digital Employee polling mode ──
        // POST returns immediately with messageId; we poll for events.
        if (apiEndpoint) {
          isSSE = true // polling mode has no sources
          const postRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({ message: userInput }),
          })

          if (!postRes.ok) {
            const errorText = await postRes.text()
            console.error("API Error:", postRes.status, errorText)
            throw new Error(`Failed to send message: ${postRes.status}`)
          }

          const { messageId } = await postRes.json()
          let nextSeq = 0

          // Poll for events until done
          while (!abortController.signal.aborted) {
            await new Promise((r) => setTimeout(r, 1000)) // poll every 1s

            const pollRes = await fetch(
              `${endpoint}?messageId=${messageId}&after=${nextSeq}`,
              { signal: abortController.signal }
            )
            if (!pollRes.ok) break

            const pollData = await pollRes.json()
            const events = pollData.events as EmployeePollEvent[]
            nextSeq = pollData.nextSeq

            const pollReduced = reduceEmployeePollEvents({
              events,
              assistantContent,
              toolCalls,
            })
            assistantContent = pollReduced.assistantContent

            // Update message with current content + tool parts
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

            const displayContent = assistantContent.replace(AGENT_HANDOFF_MARKER, "").trim()
            chat.setMessages((prev) => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: displayContent,
                  ...(parts.length > 0 && { parts }),
                } as unknown as typeof updated[number]
              }
              return updated
            })

            if (pollData.done || pollReduced.receivedAgentDone) break
          }

          // Skip SSE stream handling below — jump to post-stream finalization
        } else {
        // ── Standard SSE streaming mode (non-employee chat) ──
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
                messages: normalizedMessages,
                assistantId: assistant.id,
                sessionId: apiSessionId,
                systemPrompt: assistant.systemPrompt,
                useKnowledgeBase: toolOverrides?.useKnowledgeBase ?? effectiveKnowledgeBase,
                knowledgeBaseGroupIds: toolOverrides?.knowledgeBaseGroupIds ?? effectiveKBGroupIds,
                enableWebSearch: toolOverrides?.enableWebSearch ?? effectiveWebSearch,
                enableCodeInterpreter: toolOverrides?.enableCodeInterpreter ?? effectiveCodeInterpreter,
                enableTools: toolOverrides?.enableTools ?? effectiveToolsEnabled,
                enabledToolNames: toolOverrides?.enabledToolNames ?? effectiveToolNames,
                enableSkills: toolOverrides?.enableSkills ?? effectiveSkillsEnabled,
                enabledSkillIds: toolOverrides?.enabledSkillIds ?? effectiveSkillIds,
                ...(resolvedCanvasMode && { canvasMode: resolvedCanvasMode }),
                // Don't point at the old artifact when canvas mode explicitly requests a different type
                targetArtifactId:
                  activeArtifactId &&
                  !(typeof resolvedCanvasMode === "string" && activeArtifact && resolvedCanvasMode !== activeArtifact.type)
                    ? activeArtifactId
                    : undefined,
                ...(fileCtx?.fileContext && { fileContext: fileCtx.fileContext }),
                ...(fileCtx?.fileDocumentIds && { fileDocumentIds: fileCtx.fileDocumentIds }),
                ...(digitalEmployeeId && { digitalEmployeeId }),
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

        // Detect if response is SSE (UIMessageStream) vs plain text
        const contentType = response.headers.get("content-type") || ""
        isSSE =
          response.headers.get("x-vercel-ai-ui-message-stream") === "v1" ||
          contentType.includes("text/event-stream")

        // SSE parsing state
        let sseBuffer = ""

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          if (isSSE) {
            const consumeResult = consumeSseChunk(sseBuffer, chunk)
            sseBuffer = consumeResult.buffer
            for (const part of consumeResult.parts) {
              switch (part.type) {
                case "thinking":
                  // Thinking indicator is already shown via isLoading/TypingIndicator
                  break
                case "reasoning-delta":
                  // Keep spinner active; no direct text append in bubble.
                  break
                case "thinking-done":
                  // LLM finished thinking, tool calls or text will follow
                  break
                case "text-delta":
                  assistantContent += (part.delta as string) || ""
                  break
                case "source":
                  // Provider/source citation event (non-breaking, optional)
                  // Kept for compatibility; primary source payload still uses `sources`.
                  break
                case "tool-call":
                  if (part.toolCallId && part.toolName) {
                    toolCalls.set(part.toolCallId as string, {
                      toolCallId: part.toolCallId as string,
                      toolName: part.toolName as string,
                      state: "call",
                      args: part.input as Record<string, unknown> | undefined,
                    })
                  }
                  break
                case "tool-result": {
                  const toolCallId = part.toolCallId as string | undefined
                  const toolName = part.toolName as string | undefined
                  if (toolCallId && toolCalls.has(toolCallId)) {
                    const tc = toolCalls.get(toolCallId)!
                    tc.output = part.output
                    tc.state = "result"
                  } else if (toolCallId && toolName) {
                    toolCalls.set(toolCallId, {
                      toolCallId,
                      toolName,
                      state: "result",
                      output: part.output,
                    })
                  }
                  break
                }
                case "tool-input-start":
                  toolCalls.set(part.toolCallId as string, {
                    toolCallId: part.toolCallId as string,
                    toolName: part.toolName as string,
                    state: "call",
                  })
                  break
                case "tool-input-available":
                  if (toolCalls.has(part.toolCallId as string)) {
                    const tc = toolCalls.get(part.toolCallId as string)!
                    tc.args = part.input as Record<string, unknown>
                    tc.state = "call"

                    // Progressive artifact rendering — show content as it streams
                    if (
                      (tc.toolName === "create_artifact" || tc.toolName === "update_artifact") &&
                      tc.args
                    ) {
                      const args = tc.args
                      if (args.type && args.content && isValidArtifactType(args.type)) {
                        const isUpdate = tc.toolName === "update_artifact" && args.id
                        const toolCallId = part.toolCallId as string
                        const streamingId = isUpdate
                          ? args.id as string
                          : `streaming-${toolCallId}`
                        if (isUpdate) {
                          // First stream chunk for this update — capture
                          // the existing artifact so we can restore it
                          // if the final tool result reports an error.
                          if (!preStreamSnapshots.has(toolCallId)) {
                            const existing = artifacts.get(args.id as string)
                            preStreamSnapshots.set(toolCallId, existing ?? null)
                          }
                        } else {
                          createdStreamingIds.add(streamingId)
                        }
                        addOrUpdateArtifact({
                          id: streamingId,
                          title: (args.title as string) || "Generating...",
                          type: args.type,
                          content: args.content as string,
                          language: (args.language as string) || undefined,
                        })
                      }
                    }
                  }
                  break
                case "tool-output-available": {
                  const toolCallId = part.toolCallId as string
                  const tc = toolCalls.get(toolCallId)
                  if (tc) {
                    tc.output = part.output
                    tc.state = "result"

                    // Handle create_artifact — replace streaming placeholder with final
                    if (tc.toolName === "create_artifact" && part.output && typeof part.output === "object") {
                      const out = part.output as Record<string, unknown>
                      const placeholderId = `streaming-${toolCallId}`
                      // Gate on `out.persisted === true` — without this, a tool
                      // result that returned the LLM's input alongside
                      // `persisted: false` (validation failure path) would
                      // create a "ghost" artifact in the in-memory map. The
                      // user would see an indicator that opens content the
                      // server rejected, with the LLM's retry sitting next to
                      // it — exactly matching the reported "first artifact
                      // is broken, second one works" pattern.
                      if (
                        out.persisted === true &&
                        out.id &&
                        out.title &&
                        isValidArtifactType(out.type) &&
                        out.content
                      ) {
                        // Remove streaming placeholder, add final artifact
                        removeArtifact(placeholderId)
                        createdStreamingIds.delete(placeholderId)
                        addOrUpdateArtifact({
                          id: out.id as string,
                          title: out.title as string,
                          type: out.type,
                          content: out.content as string,
                          language: (out.language as string) || undefined,
                        })
                      } else {
                        // Tool output was malformed or carries an error (e.g.
                        // validation failure / missing artifact / canvas-mode
                        // mismatch). Without removing the placeholder the user
                        // would see "Generating..." forever. Log so we can
                        // diagnose; the LLM will see the error in tc.output
                        // and can self-correct on the next turn.
                        removeArtifact(placeholderId)
                        createdStreamingIds.delete(placeholderId)
                        if (typeof out.error === "string") {
                          console.warn(
                            "[chat-workspace] create_artifact returned error:",
                            out.error,
                          )
                        } else {
                          console.warn(
                            "[chat-workspace] create_artifact tool output incomplete:",
                            out,
                          )
                        }
                      }
                    }

                    // Handle update_artifact — update existing artifact (versioning handled by hook)
                    if (tc.toolName === "update_artifact" && part.output && typeof part.output === "object") {
                      const out = part.output as Record<string, unknown>
                      if (out.id && out.content && out.updated) {
                        // Apply the result. Earlier code only updated when
                        // `existing` was present in the local map, silently
                        // dropping the update if the artifact wasn't loaded
                        // (race: hard refresh + tool call still in flight).
                        // We now always reflect a successful server update —
                        // we have the full final shape on `out`, so even a
                        // missing local copy can be hydrated.
                        const existing = artifacts.get(out.id as string)
                        const type = existing?.type
                          ?? (isValidArtifactType(out.type) ? out.type : undefined)
                        if (type) {
                          addOrUpdateArtifact({
                            id: out.id as string,
                            title: (out.title as string) || existing?.title || "Untitled",
                            type,
                            content: out.content as string,
                            language: (out.language as string) || existing?.language,
                          })
                        } else {
                          console.warn(
                            "[chat-workspace] update_artifact succeeded but local map has no copy and tool output omitted type",
                            out,
                          )
                        }
                        // Successful update — drop any stale snapshot.
                        preStreamSnapshots.delete(toolCallId)
                      } else if (out.error) {
                        // Update failed. The streaming-input handler already
                        // mutated the in-memory artifact with partial content
                        // using the real artifact id (not a placeholder), so
                        // we restore the pre-stream snapshot — otherwise the
                        // panel shows the invalid partial content locked in
                        // place with only a console.warn for feedback.
                        const snapshot = preStreamSnapshots.get(toolCallId)
                        if (snapshot && out.id) {
                          addOrUpdateArtifact({
                            id: snapshot.id,
                            title: snapshot.title,
                            type: snapshot.type,
                            content: snapshot.content,
                            language: snapshot.language,
                          })
                        }
                        preStreamSnapshots.delete(toolCallId)
                        console.warn(
                          "[chat-workspace] update_artifact returned error:",
                          out.error,
                        )
                      }
                    }
                  }
                  break
                }
                case "tool-output-error": {
                  const tc = toolCalls.get(part.toolCallId as string)
                  if (tc) {
                    tc.errorText = part.errorText as string | undefined
                    tc.state = "error"
                  }
                  break
                }
                case "tool-input-error": {
                  const tc = toolCalls.get(part.toolCallId as string)
                  if (tc) {
                    tc.errorText = part.errorText as string | undefined
                    tc.state = "error"
                  }
                  break
                }
                case "sources":
                  if (Array.isArray(part.sources)) {
                    streamedSources = part.sources as Source[]
                    setMessageSources((prev) => ({ ...prev, [assistantMsgId]: streamedSources }))
                  }
                  break
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
            let displayContent = assistantContent

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
        } // end else (standard SSE streaming mode)

        setIsStreaming(false)

        // Final content and sources
        let finalContent = assistantContent
        const sources = streamedSources

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
        const artifactSnapshots: PersistedArtifactSnapshot[] = Array.from(toolCalls.values())
          .filter(tc => (tc.toolName === "create_artifact" || tc.toolName === "update_artifact") && tc.state === "result" && tc.output)
          .map((tc) => tc.output as Record<string, unknown>)
          .filter((out) => Boolean(out.id && out.content))
          .map((out) => {
            const existing = artifacts.get(out.id as string)
            return {
              id: out.id as string,
              title: (out.title as string) || existing?.title || "Artifact",
              content: out.content as string,
              artifactType: (out.type as string) || existing?.type || "application/code",
              metadata: {
                ...(existing?.language && { artifactLanguage: existing.language }),
              },
            }
          })

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
                ...(sources.length > 0 && { sources }),
                ...((artifactIds.length > 0 || persistedToolCalls.length > 0) && {
                  metadata: {
                    ...(artifactIds.length > 0 && { artifactIds }),
                    ...(artifactSnapshots.length > 0 && { artifacts: artifactSnapshots }),
                    ...(persistedToolCalls.length > 0 && { toolCalls: persistedToolCalls }),
                  },
                }),
              },
            ],
          })
        }
      } catch (err) {
        // Whatever broke the stream, also clean up any
        // `streaming-${toolCallId}` placeholder artifacts we created
        // before the failure. They're forever-spinning "Generating..."
        // cards otherwise — the placeholder is keyed on the toolCallId,
        // so the success path's `removeArtifact("streaming-...")` was
        // never reached. Restore any pre-stream snapshots we captured
        // for `update_artifact` streams that the abort interrupted.
        for (const placeholderId of createdStreamingIds) {
          removeArtifact(placeholderId)
        }
        for (const snapshot of preStreamSnapshots.values()) {
          if (snapshot) {
            addOrUpdateArtifact({
              id: snapshot.id,
              title: snapshot.title,
              type: snapshot.type,
              content: snapshot.content,
              language: snapshot.language,
            })
          }
        }
        createdStreamingIds.clear()
        preStreamSnapshots.clear()

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
      }
    },
    [chat, session, onUpdateSession, assistant, toast, effectiveWebSearch, effectiveKnowledgeBase, effectiveKBGroupIds, effectiveToolsEnabled, effectiveToolNames, effectiveSkillsEnabled, effectiveSkillIds, canvasMode, activeArtifactId, apiSessionId]
  )

  const queueInitialMessageSend = useCallback(async () => {
    if (!initialMessage) return

    onInitialMessageConsumed?.()

    const initialUploads = initialSettings?.files?.length
      ? await uploadInitialFiles(initialSettings.files)
      : { fileCtx: undefined, uploadAttachments: [] as AttachmentInfo[] }

    const overrides = initialSettings ? {
      enableWebSearch: initialSettings.webSearchEnabled,
      enableCodeInterpreter: initialSettings.codeInterpreterEnabled,
      useKnowledgeBase: initialSettings.knowledgeBaseGroupIds
        ? initialSettings.knowledgeBaseGroupIds.length > 0
        : undefined,
      knowledgeBaseGroupIds: initialSettings.knowledgeBaseGroupIds,
      enableTools: initialSettings.toolMode ? initialSettings.toolMode !== "off" : undefined,
      enabledToolNames: initialSettings.toolMode === "select" ? initialSettings.selectedToolNames : undefined,
      enableSkills: initialSettings.skillMode ? initialSettings.skillMode !== "off" : undefined,
      enabledSkillIds: initialSettings.skillMode === "select" ? initialSettings.selectedSkillIds : undefined,
      canvasMode: initialSettings.canvasMode,
    } : undefined

    await sendMessage(
      initialMessage,
      [],
      undefined,
      undefined,
      initialUploads.fileCtx,
      initialUploads.uploadAttachments.length > 0 ? initialUploads.uploadAttachments : undefined,
      overrides
    )
  }, [initialMessage, initialSettings, onInitialMessageConsumed, sendMessage, uploadInitialFiles])

  // Auto-send initial message from ChatHome (runs once on mount).
  // No ref guard — React Strict Mode re-runs the effect after cleanup clears the
  // timer, so the second run naturally starts a fresh timer that fires correctly.
  useEffect(() => {
    if (!initialMessage || !session?.id) return

    const initialMessageKey = `${session.id}:${initialMessage}`
    if (queuedInitialMessageKeyRef.current === initialMessageKey) {
      return
    }
    queuedInitialMessageKeyRef.current = initialMessageKey

    // Apply toolbar overrides to ChatWorkspace state so the toolbar UI reflects them
    if (initialSettings) {
      if (typeof window !== "undefined") {
        const snapshot: SessionToolbarStateSnapshot = {
          selectedKBGroupIds: initialSettings.knowledgeBaseGroupIds ?? null,
          toolMode: initialSettings.toolMode ?? "off",
          selectedToolNames: initialSettings.selectedToolNames ?? [],
          skillMode: initialSettings.skillMode ?? "off",
          selectedSkillIds: initialSettings.selectedSkillIds ?? [],
          webSearchOverride:
            typeof initialSettings.webSearchEnabled === "boolean"
              ? initialSettings.webSearchEnabled
              : null,
          codeInterpreterOverride:
            typeof initialSettings.codeInterpreterEnabled === "boolean"
              ? initialSettings.codeInterpreterEnabled
              : null,
          canvasMode: initialSettings.canvasMode ?? false,
        }
        const serialized = JSON.stringify(snapshot)
        window.sessionStorage.setItem(
          `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${session.id}`,
          serialized
        )
        if (apiSessionId && apiSessionId !== session.id) {
          window.sessionStorage.setItem(
            `${SESSION_TOOLBAR_STATE_STORAGE_PREFIX}${apiSessionId}`,
            serialized
          )
        }
      }
      if (initialSettings.webSearchEnabled !== undefined) {
        setWebSearchOverride(initialSettings.webSearchEnabled)
      }
      if (initialSettings.codeInterpreterEnabled !== undefined) {
        setCodeInterpreterOverride(initialSettings.codeInterpreterEnabled)
      }
      if (initialSettings.knowledgeBaseGroupIds !== undefined) {
        setSelectedKBGroupIds(initialSettings.knowledgeBaseGroupIds)
      }
      if (initialSettings.toolMode) {
        setToolMode(initialSettings.toolMode)
      }
      if (initialSettings.selectedToolNames) {
        setSelectedToolNames(initialSettings.selectedToolNames)
      }
      if (initialSettings.skillMode) {
        setSkillMode(initialSettings.skillMode)
      }
      if (initialSettings.selectedSkillIds) {
        setSelectedSkillIds(initialSettings.selectedSkillIds)
      }
        if (initialSettings.canvasMode) {
          setCanvasMode(initialSettings.canvasMode)
        }
        setHasSessionToolbarState(true)
        toolbarStateHydratedRef.current = true
      }
      void queueInitialMessageSend()
  }, [apiSessionId, initialMessage, initialSettings, queueInitialMessageSend, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fix with AI handler — sends a repair prompt when a 3D artifact has a runtime error
  const handleFixWithAI = useCallback(
    (artifactId: string, errorMessage: string) => {
      const repairPrompt = `The 3D scene artifact has a runtime error that needs to be fixed.

Error: ${errorMessage}

Please fix the Scene component code to resolve this error. Remember:
- Do NOT use <Canvas>, <OrbitControls>, or <Environment> — these are provided by the wrapper.
- Do NOT import Canvas from @react-three/fiber.
- Do NOT load external fonts, textures, or 3D models via URL.
- Only export default a scene component that returns 3D elements like <mesh>, <group>, Drei helpers, etc.
- Use useFrame for animations.

Use update_artifact with id="${artifactId}" to update the existing artifact with the fixed code.`

      sendMessage(repairPrompt, chat.messages)
    },
    [sendMessage, chat.messages]
  )

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
    setMessageAttachments({})
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
    if (!input.trim() || isLoading || isUploading) return

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

    // Upload attached files if present
    let fileCtx: { fileContext?: string; fileDocumentIds?: string[] } | undefined
    const uploadAttachments: AttachmentInfo[] = []
    if (attachedFiles.length > 0) {
      try {
        setIsUploading(true)
        const filesToUpload = [...attachedFiles]

        for (const file of filesToUpload) {
          try {
            const formData = new FormData()
            formData.append("file", file)
            if (apiSessionId) formData.append("sessionId", apiSessionId)

            const uploadRes = await fetch("/api/chat/upload", {
              method: "POST",
              body: formData,
            })

            if (uploadRes.ok) {
              const uploadData = await uploadRes.json()
              if (uploadData.result) {
                // Merge file contexts
                if (uploadData.result.type === "inline" && uploadData.result.text) {
                  const ctx = `[Attached file: ${uploadData.result.fileName}]\n${uploadData.result.text}`
                  fileCtx = {
                    fileContext: fileCtx?.fileContext
                      ? `${fileCtx.fileContext}\n\n${ctx}`
                      : ctx,
                    fileDocumentIds: fileCtx?.fileDocumentIds,
                  }
                } else if (uploadData.result.type === "rag" && uploadData.result.documentId) {
                  fileCtx = {
                    fileContext: fileCtx?.fileContext,
                    fileDocumentIds: [
                      ...(fileCtx?.fileDocumentIds || []),
                      uploadData.result.documentId,
                    ],
                  }
                }
                // Capture attachment info with persistent file ID
                uploadAttachments.push({
                  fileName: uploadData.result.fileName,
                  mimeType: uploadData.result.mimeType,
                  type: uploadData.result.type,
                  text: uploadData.result.text,
                  pageCount: uploadData.result.pageCount,
                  chunkCount: uploadData.result.chunkCount,
                  fileId: uploadData.result.fileId,
                })
              }
            } else {
              console.error("[Chat] File upload failed:", uploadRes.status, file.name)
            }
          } catch (uploadError) {
            console.error("[Chat] File upload error:", uploadError, file.name)
          }
        }
      } finally {
        setIsUploading(false)
        setAttachedFiles([])
      }
    }

    // Merge GitHub import result into file context
    if (githubImportResult) {
      if (githubImportResult.type === "inline" && githubImportResult.text) {
        const ctx = `[GitHub Import: ${githubImportResult.fileName}]\n${githubImportResult.text}`
        fileCtx = {
          fileContext: fileCtx?.fileContext ? `${fileCtx.fileContext}\n\n${ctx}` : ctx,
          fileDocumentIds: fileCtx?.fileDocumentIds,
        }
        uploadAttachments.push({
          fileName: githubImportResult.fileName,
          mimeType: "text/plain",
          type: "inline",
          text: githubImportResult.text,
        })
      } else if (githubImportResult.type === "rag" && githubImportResult.documentId) {
        fileCtx = {
          fileContext: fileCtx?.fileContext,
          fileDocumentIds: [
            ...(fileCtx?.fileDocumentIds || []),
            githubImportResult.documentId,
          ],
        }
        uploadAttachments.push({
          fileName: githubImportResult.fileName,
          mimeType: "text/plain",
          type: "rag",
        })
      }
      setGithubImportResult(null)
    }

    // Send the message using shared logic
    await sendMessage(userInput, chat.messages, replyContext?.id, undefined, fileCtx, uploadAttachments.length > 0 ? uploadAttachments : undefined)
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
          {artifacts.size > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 relative"
                  onClick={() => setArtifactsSheetOpen(true)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full text-[9px] flex items-center justify-center font-medium bg-primary text-primary-foreground">
                    {artifacts.size}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Artifacts</TooltipContent>
            </Tooltip>
          )}
          <CommandPalette
            onNewChat={onNewChat || (() => { })}
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
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <MessagesArea
                    chat={chat}
                    allMessages={allMessages}
                    isLoading={isLoading}
                    isStreaming={isStreaming}
                    assistant={assistant}
                    messageSources={messageSources}
                    messageAttachments={messageAttachments}
                    onViewAttachment={setViewingAttachment}
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
                    openArtifact={handleOpenArtifact}
                    artifacts={artifacts}
                    digitalEmployeeId={digitalEmployeeId}
                  />
                </div>

                {/* Input area in left pane when artifact canvas is open */}
                <div className="px-4 pb-4 pt-2 bg-background border-t">
                  <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
                    <AnimatePresence>
                      {replyingTo && (
                        <ThreadIndicator
                          parentContent={replyingTo.content}
                          onClear={() => setReplyingTo(null)}
                        />
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {(attachedFiles.length > 0 || githubImportResult) && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          <FilePreview
                            files={attachedFiles}
                            onRemove={(index) => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                          />
                          {githubImportResult && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs">
                              <span className="text-muted-foreground">GitHub:</span>
                              <span className="font-medium truncate max-w-[200px]">{githubImportResult.fileName}</span>
                              <span className="text-muted-foreground">({githubImportResult.fileCount} file{githubImportResult.fileCount !== 1 ? "s" : ""})</span>
                              <button type="button" onClick={() => setGithubImportResult(null)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                            </div>
                          )}
                        </div>
                      )}
                    </AnimatePresence>

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
                          disabled={isLoading || isUploading || handoffState === "waiting" || handoffState === "requesting" || handoffState === "resolved"}
                          rows={1}
                        />
                        <Button
                          type={isStreaming ? "button" : "submit"}
                          size="icon"
                          className="absolute right-3 bottom-2 rounded-full h-8 w-8 shadow-sm"
                          disabled={isStreaming ? false : (!input.trim() || isLoading || isUploading)}
                          onClick={isStreaming ? handleStop : undefined}
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isLoading ? (
                            isStreaming ? (
                              <Square className="h-3.5 w-3.5 fill-current" />
                            ) : (
                              <ButtonLoadingIndicator />
                            )
                          ) : (
                            <SendHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {!apiEndpoint && (
                        <div className="px-2 pb-2">
                          <ChatInputToolbar
                            onFileSelect={(files) => setAttachedFiles(prev => [...prev, ...files])}
                            fileAttached={attachedFiles.length > 0 || !!githubImportResult}
                            webSearchEnabled={effectiveWebSearch}
                            onToggleWebSearch={() => setWebSearchOverride((prev) => !(prev ?? webSearchAvailable))}
                            codeInterpreterEnabled={effectiveCodeInterpreter}
                            onToggleCodeInterpreter={() => setCodeInterpreterOverride((prev) => !(prev ?? codeInterpreterAvailable))}
                            knowledgeBaseGroupIds={effectiveKBGroupIds}
                            onKBGroupsChange={setSelectedKBGroupIds}
                            kbGroups={kbGroups}
                            toolMode={toolMode}
                            onSetToolMode={setToolMode}
                            selectedToolNames={selectedToolNames}
                            defaultToolNames={assistantDefaultToolNames}
                            onSetSelectedToolNames={setSelectedToolNames}
                            assistantTools={assistantTools}
                            skillMode={skillMode}
                            onSetSkillMode={setSkillMode}
                            selectedSkillIds={selectedSkillIds}
                            defaultSkillIds={assistantDefaultSkillIds}
                            onSetSelectedSkillIds={setSelectedSkillIds}
                            assistantSkills={assistantSkills}
                            onImportGithub={() => {
                              setGithubUrl("")
                              setGithubDialogOpen(true)
                            }}
                            canvasMode={canvasMode}
                            onSetCanvasMode={setCanvasMode}
                            artifacts={artifacts}
                            activeArtifactId={activeArtifactId}
                            onOpenArtifact={handleOpenArtifact}
                            onCloseArtifact={closeArtifact}
                            disabled={isLoading}
                            onOpenToolsMenu={() => {
                              if (!assistant?.id) return
                              if (assistantTools.length > 0) return
                              void loadAssistantTools(assistant.id, { preserveSessionSelection: true })
                            }}
                            onOpenSkillsMenu={() => {
                              if (!assistant?.id) return
                              if (assistantSkills.length > 0) return
                              void loadAssistantSkills(assistant.id, { preserveSessionSelection: true })
                            }}
                            onOpenKnowledgeMenu={() => {
                              if (kbGroups.length > 0) return
                              void loadKnowledgeBaseGroups()
                            }}
                          />
                        </div>
                      )}
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
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <motion.div
                key={activeArtifactId}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className="h-full"
              >
                <ArtifactPanel
                  artifact={activeArtifact}
                  onClose={closeArtifact}
                  onUpdateArtifact={addOrUpdateArtifact}
                  onDeleteArtifact={removeArtifact}
                  onFixWithAI={handleFixWithAI}
                  sessionId={apiSessionId}
                />
              </motion.div>
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
              messageAttachments={messageAttachments}
              onViewAttachment={setViewingAttachment}
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
              openArtifact={handleOpenArtifact}
              artifacts={artifacts}
              digitalEmployeeId={digitalEmployeeId}
            />
        )}
      </div>

      {/* Input area */}
      {!activeArtifact && (
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
            {(attachedFiles.length > 0 || githubImportResult) && (
              <div className="mb-2 flex flex-wrap gap-2">
                <FilePreview
                  files={attachedFiles}
                  onRemove={(index) => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                />
                {githubImportResult && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">GitHub:</span>
                    <span className="font-medium truncate max-w-[200px]">{githubImportResult.fileName}</span>
                    <span className="text-muted-foreground">({githubImportResult.fileCount} file{githubImportResult.fileCount !== 1 ? "s" : ""})</span>
                    <button type="button" onClick={() => setGithubImportResult(null)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                  </div>
                )}
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
                disabled={isLoading || isUploading || handoffState === "waiting" || handoffState === "requesting" || handoffState === "resolved"}
                rows={1}
              />
              <Button
                type={isStreaming ? "button" : "submit"}
                size="icon"
                className="absolute right-3 bottom-2 rounded-full h-8 w-8 shadow-sm"
                disabled={isStreaming ? false : (!input.trim() || isLoading || isUploading)}
                onClick={isStreaming ? handleStop : undefined}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLoading ? (
                  isStreaming ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <ButtonLoadingIndicator />
                  )
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Toolbar inside container — hidden for employee chat (gateway manages its own tools) */}
            {!apiEndpoint && (
              <div className="px-2 pb-2">
                <ChatInputToolbar
                  onFileSelect={(files) => setAttachedFiles(prev => [...prev, ...files])}
                  fileAttached={attachedFiles.length > 0 || !!githubImportResult}
                  webSearchEnabled={effectiveWebSearch}
                  onToggleWebSearch={() => setWebSearchOverride((prev) => !(prev ?? webSearchAvailable))}
                  codeInterpreterEnabled={effectiveCodeInterpreter}
                  onToggleCodeInterpreter={() => setCodeInterpreterOverride((prev) => !(prev ?? codeInterpreterAvailable))}
                  knowledgeBaseGroupIds={effectiveKBGroupIds}
                  onKBGroupsChange={setSelectedKBGroupIds}
                  kbGroups={kbGroups}
                  toolMode={toolMode}
                  onSetToolMode={setToolMode}
                  selectedToolNames={selectedToolNames}
                  defaultToolNames={assistantDefaultToolNames}
                  onSetSelectedToolNames={setSelectedToolNames}
                  assistantTools={assistantTools}
                  skillMode={skillMode}
                  onSetSkillMode={setSkillMode}
                  selectedSkillIds={selectedSkillIds}
                  defaultSkillIds={assistantDefaultSkillIds}
                  onSetSelectedSkillIds={setSelectedSkillIds}
                  assistantSkills={assistantSkills}
                  onImportGithub={() => {
                    setGithubUrl("")
                    setGithubDialogOpen(true)
                  }}
                  canvasMode={canvasMode}
                  onSetCanvasMode={setCanvasMode}
                  artifacts={artifacts}
                  activeArtifactId={activeArtifactId}
                  onOpenArtifact={handleOpenArtifact}
                  onCloseArtifact={closeArtifact}
                  disabled={isLoading}
                  onOpenToolsMenu={() => {
                    if (!assistant?.id) return
                    if (assistantTools.length > 0) return
                    void loadAssistantTools(assistant.id, { preserveSessionSelection: true })
                  }}
                  onOpenSkillsMenu={() => {
                    if (!assistant?.id) return
                    if (assistantSkills.length > 0) return
                    void loadAssistantSkills(assistant.id, { preserveSessionSelection: true })
                  }}
                  onOpenKnowledgeMenu={() => {
                    if (kbGroups.length > 0) return
                    void loadKnowledgeBaseGroups()
                  }}
                />
              </div>
            )}
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
      )}

      {/* Attachment Content Modal */}
      <Dialog open={!!viewingAttachment} onOpenChange={() => setViewingAttachment(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {viewingAttachment?.fileName}
            </DialogTitle>
            <DialogDescription>
              {viewingAttachment?.type === "inline" ? "Inline attachment" : "Processed for RAG search"}
              {viewingAttachment?.pageCount ? ` · ${viewingAttachment.pageCount} pages` : ""}
              {viewingAttachment?.chunkCount ? ` · ${viewingAttachment.chunkCount} chunks` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] rounded-md border bg-muted/30">
            {(() => {
              const att = viewingAttachment
              if (!att) return null
              const src = att.fileId ? `/api/chat/upload/file/${att.fileId}` : att.fileUrl
              if (src && att.mimeType === "application/pdf") {
                return <iframe src={src} className="w-full h-[60vh] rounded-md" title={att.fileName} />
              }
              if (src && att.mimeType?.startsWith("image/")) {
                return <img src={src} alt={att.fileName} className="w-full h-auto rounded-md object-contain max-h-[60vh]" />
              }
              if (att.text) {
                return <pre className="whitespace-pre-wrap text-sm font-mono p-4">{att.text}</pre>
              }
              return (
                <p className="text-sm text-muted-foreground p-4">
                  Processed for search
                  {att.chunkCount ? ` (${att.chunkCount} chunks)` : ""}
                  {att.pageCount ? ` across ${att.pageCount} pages` : ""}
                  . Content is indexed and available for AI retrieval.
                </p>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* GitHub Import Dialog */}
      <Dialog open={githubDialogOpen} onOpenChange={(open) => { if (!githubImporting) setGithubDialogOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import from GitHub</DialogTitle>
            <DialogDescription>
              Paste a GitHub URL to import a file or entire repository as context.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={githubImporting}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && githubUrl.trim() && !githubImporting) {
                e.preventDefault()
                await handleGithubImport()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGithubDialogOpen(false)} disabled={githubImporting}>
              Cancel
            </Button>
            <Button
              onClick={handleGithubImport}
              disabled={!githubUrl.trim() || githubImporting}
            >
              {githubImporting ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Artifacts Sheet (right sidebar like Claude.ai) */}
      <Sheet open={artifactsSheetOpen} onOpenChange={setArtifactsSheetOpen}>
        <SheetContent side="right" className="w-80 sm:max-w-sm p-0">
          <SheetHeader className="px-4 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Artifacts
              <span className="text-xs text-muted-foreground font-normal">({artifacts.size})</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto py-2">
            {artifacts.size === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No artifacts yet</p>
            ) : (
              <div className="space-y-1 px-2">
                {Array.from(artifacts.values()).map((artifact) => {
                  const Icon = TYPE_ICONS[artifact.type] || FileText
                  const isActive = artifact.id === activeArtifactId
                  return (
                    <div
                      key={artifact.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group",
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => {
                          handleOpenArtifact(artifact.id)
                          setArtifactsSheetOpen(false)
                        }}
                      >
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted/60 shrink-0">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-medium truncate", isActive && "text-primary")}>
                            {artifact.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {TYPE_LABELS[artifact.type] || artifact.type}
                            {artifact.language ? ` · ${artifact.language}` : ""}
                          </p>
                        </div>
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDownloadArtifact(artifact)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Download</TooltipContent>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
