"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useDigitalEmployee } from "@/hooks/use-digital-employee"
import { ChatWorkspace } from "@/app/dashboard/_components/chat/chat-workspace"
import type { ChatSession, ChatMessage } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"
import { ArrowLeft, Loader2, Play } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface ContainerStatus {
  containerRunning: boolean
  gatewayUrl?: string
}

interface EmployeeChatMsg {
  id: string
  role: string
  content: string
  toolCalls?: unknown
  createdAt: string
}

export default function EmployeeChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { employee, isLoading } = useDigitalEmployee(id)

  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [chatHistory, setChatHistory] = useState<EmployeeChatMsg[]>([])
  const fetchedRef = useRef(false)

  // Check container status + load chat history in one pass
  useEffect(() => {
    if (!id) return
    setStatusLoading(true)
    fetch(`/api/dashboard/digital-employees/${id}/status`)
      .then((r) => r.ok ? r.json() : null)
      .then(async (data) => {
        setContainerStatus(data)
        // Load chat history immediately if container is running
        if (data?.containerRunning && !fetchedRef.current) {
          fetchedRef.current = true
          try {
            const res = await fetch(`/api/dashboard/digital-employees/${id}/chat`)
            if (res.ok) {
              const msgs: EmployeeChatMsg[] = await res.json()
              setChatHistory(msgs)
            }
          } catch { /* keep empty history */ }
        }
      })
      .catch(() => setContainerStatus(null))
      .finally(() => setStatusLoading(false))
  }, [id])

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${id}/resume`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to start")
      // Re-check status and load chat history
      const [statusRes, historyRes] = await Promise.all([
        fetch(`/api/dashboard/digital-employees/${id}/status`),
        fetch(`/api/dashboard/digital-employees/${id}/chat`),
      ])
      if (statusRes.ok) setContainerStatus(await statusRes.json())
      if (historyRes.ok) {
        const msgs: EmployeeChatMsg[] = await historyRes.json()
        setChatHistory(msgs)
      }
      toast.success("Employee started")
    } catch {
      toast.error("Failed to start employee")
    } finally {
      setStarting(false)
    }
  }, [id])

  // Build synthetic ChatSession from loaded history (always exists, even if empty)
  const syntheticSession: ChatSession = {
    id: `emp-chat-${id}`,
    title: employee ? `Chat with ${employee.name}` : "Employee Chat",
    assistantId: employee?.assistantId || "",
    messages: chatHistory.map((m) => {
      // Rebuild tool call parts from persisted toolCalls metadata
      const toolCalls = m.toolCalls as Array<{
        toolCallId: string
        toolName: string
        input: unknown
        output?: string
      }> | null

      const parts = toolCalls?.map((tc) => ({
        type: "tool-invocation" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        state: "result" as const,
        args: tc.input as Record<string, unknown> | undefined,
        output: tc.output,
      }))

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.createdAt),
        ...(parts && parts.length > 0 ? { parts } : {}),
      }
    }),
    createdAt: new Date(),
  }

  const handleUpdateSession = useCallback(
    (_sessionId: string, updates: Partial<ChatSession>) => {
      if (updates.messages) {
        // Messages managed by ChatWorkspace streaming — no persistence needed (proxy persists)
      }
    },
    []
  )

  // Build assistant-shaped object
  const employeeAssistant: Assistant | null = employee
    ? {
        id: employee.assistant.id,
        name: employee.name,
        emoji: employee.avatar || employee.assistant.emoji || "🤖",
        description: employee.description || `Digital Employee powered by ${employee.assistant.name}`,
        systemPrompt: "",
        model: employee.assistant.model,
        useKnowledgeBase: false,
        knowledgeBaseGroupIds: [],
        liveChatEnabled: false,
        openingMessage: `Hi! I'm ${employee.name}. How can I help you today?`,
        openingQuestions: [],
        tags: [],
        isEditable: false,
        createdAt: new Date(),
      }
    : null

  if (isLoading || statusLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  if (!employee || !employeeAssistant) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h3 className="text-sm font-medium mb-1">Employee not found</h3>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/digital-employees")}>
              Back to Employees
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Not running — show start button
  if (!containerStatus?.containerRunning) {
    return (
      <div className="flex flex-col h-full">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/dashboard/digital-employees/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{employeeAssistant.emoji}</span>
            <div>
              <h2 className="text-sm font-medium">{employee.name}</h2>
              <p className="text-xs text-muted-foreground">Offline</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-4xl">{employeeAssistant.emoji}</div>
            <h3 className="text-lg font-medium">{employee.name} is not running</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {employee.status === "ACTIVE"
                ? "Start the employee to begin chatting. The container will run in the background."
                : "Deploy the employee first, then start it to chat."}
            </p>
            {employee.status === "ACTIVE" && (
              <Button onClick={handleStart} disabled={starting}>
                {starting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1.5" />
                )}
                Start Employee
              </Button>
            )}
            {employee.status !== "ACTIVE" && (
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/digital-employees/${id}`)}
              >
                Go to Employee Settings
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Running — show chat
  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/dashboard/digital-employees/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-lg">{employeeAssistant.emoji}</span>
          <div>
            <h2 className="text-sm font-medium">{employee.name}</h2>
            <p className="text-xs text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
              Online
            </p>
          </div>
        </div>
      </div>

      {/* Chat workspace */}
      <div className="flex-1 min-h-0">
        <ChatWorkspace
          key={`emp-${id}`}
          session={syntheticSession}
          assistant={employeeAssistant}
          apiEndpoint={`/api/dashboard/digital-employees/${id}/chat`}
          onUpdateSession={handleUpdateSession}
        />
      </div>
    </div>
  )
}
