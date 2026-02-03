"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Loader2, Bot, User, Copy, Pencil, Trash2, RefreshCw, Check, ArrowDown } from "lucide-react"
import type { ChatSession } from "../page"
import type { Assistant } from "@/lib/types/assistant"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import ReactMarkdown from "react-markdown"

interface ChatWorkspaceProps {
  session?: ChatSession
  assistant: Assistant
  onBack?: () => void
  onUpdateSession?: (sessionId: string, updates: Partial<ChatSession>) => void
}

// Helper to extract text content from UIMessage parts
function getMessageContent(message: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
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

// Message Actions component
function MessageActions({
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
  isUser,
  copied,
}: {
  onCopy: () => void
  onEdit?: () => void
  onDelete?: () => void
  onRegenerate?: () => void
  isUser: boolean
  copied: boolean
}) {
  return (
    <div className={cn(
      "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
      isUser ? "justify-end" : "justify-start"
    )}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={onCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
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
        >
          <Trash2 className="h-3.5 w-3.5" />
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
}: ChatWorkspaceProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Debug: Log the assistant being used (only on mount)
  useEffect(() => {
    console.log("[ChatWorkspace] Mounted with assistant:", assistant.id, assistant.name)
    console.log("[ChatWorkspace] System prompt:", assistant.systemPrompt.substring(0, 80) + "...")
    console.log("[ChatWorkspace] useKnowledgeBase:", assistant.useKnowledgeBase)
  }, [assistant.id, assistant.name, assistant.systemPrompt, assistant.useKnowledgeBase])

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
            ? updatedMessages[0].content.slice(0, 50) + (updatedMessages[0].content.length > 50 ? "..." : "")
            : session.title

        onUpdateSession(session.id, {
          messages: updatedMessages,
          title,
        })
      }
    },
  })

  // Loading state is now managed manually since we bypass useChat's API

  // Reset messages when session changes
  useEffect(() => {
    if (session?.messages && session.messages.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat.setMessages(
        session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })) as any
      )
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat.setMessages([] as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  // Auto-scroll when at bottom and new messages arrive
  useEffect(() => {
    if (atBottom && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: "LAST",
        behavior: "smooth",
      })
    }
  }, [chat.messages, atBottom])

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

  // Handle form submit - manual API call to include assistant info
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userInput = input.trim()
    setInput("")
    setIsLoading(true)

    // Add user message to chat state
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: userInput,
    }

    // Update chat messages with user message
    const currentMessages = chat.messages
    chat.setMessages([...currentMessages, userMessage] as any)

    // Add user message to session
    if (session && onUpdateSession) {
      const title =
        session.title === "New Chat"
          ? userInput.slice(0, 50) + (userInput.length > 50 ? "..." : "")
          : session.title

      onUpdateSession(session.id, {
        messages: [...session.messages, { ...userMessage, createdAt: new Date() }],
        title,
      })
    }

    // Make manual API call with assistant info
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...currentMessages, userMessage],
          assistantId: assistant.id,
          systemPrompt: assistant.systemPrompt,
          useKnowledgeBase: assistant.useKnowledgeBase,
          knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', response.status, errorText)
        throw new Error(`Failed to get response: ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      const assistantMsgId = crypto.randomUUID()

      // Add empty assistant message that we'll update
      chat.setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }] as any)

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        // toTextStreamResponse returns plain text chunks
        const chunk = decoder.decode(value, { stream: true })
        assistantContent += chunk

        // Update the last message with accumulated content
        chat.setMessages(prev => {
          const updated = [...prev]
          const lastIdx = updated.length - 1
          if (updated[lastIdx]?.role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], content: assistantContent }
          }
          return updated
        })
      }

      // Save final assistant message to session
      if (session && onUpdateSession && assistantContent) {
        onUpdateSession(session.id, {
          messages: [
            ...session.messages,
            { ...userMessage, createdAt: new Date() },
            { id: assistantMsgId, role: 'assistant', content: assistantContent, createdAt: new Date() },
          ],
        })
      }
    } catch (error) {
      console.error('Chat error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e)
    }
  }

  if (!session) {
    return <EmptyState />
  }

  const allMessages = [...chat.messages]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mobile back button */}
      {onBack && (
        <div className="flex items-center gap-2 p-4 border-b md:hidden">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium truncate">{session.title}</span>
        </div>
      )}

      {/* Messages with Virtuoso */}
      <div className="flex-1 relative">
        {chat.messages.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-12">
              <div className="text-5xl mb-4">{assistant.emoji}</div>
              <h3 className="text-lg font-medium mb-1">{assistant.name}</h3>
              <p className="text-sm text-muted-foreground">
                {assistant.description}
              </p>
            </div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={allMessages}
            className="h-full"
            followOutput="smooth"
            atBottomStateChange={setAtBottom}
            atBottomThreshold={100}
            overscan={200}
            itemContent={(index, message) => {
              const content = getMessageContent(message)
              const isUser = message.role === "user"
              const isLastMessage = index === allMessages.length - 1
              const isLoadingMessage = isLoading && isLastMessage && message.role === "assistant" && !content

              return (
                <div className="max-w-3xl mx-auto px-4 py-3">
                  <div
                    className={cn(
                      "group flex gap-3",
                      isUser ? "flex-row-reverse" : ""
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {isUser ? (
                        <User className="h-5 w-5" />
                      ) : (
                        <Bot className="h-5 w-5" />
                      )}
                    </div>
                    <div className={cn("flex-1 min-w-0", isUser ? "ml-12" : "mr-12")}>
                      <div
                        className={cn(
                          "rounded-lg py-2 px-3 text-sm",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {isLoadingMessage ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground">Thinking...</span>
                          </div>
                        ) : (
                          <div className="chat-message prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                      {!isLoadingMessage && (
                        <div className="mt-1">
                          <MessageActions
                            onCopy={() => handleCopy(message.id, content)}
                            copied={copiedId === message.id}
                            isUser={isUser}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            }}
          />
        )}

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

      {/* Input */}
      <div className="border-t p-4 bg-background">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[60px] max-h-[200px] pr-12 resize-none rounded-2xl"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 rounded-full"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  )
}
