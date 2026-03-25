"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Settings,
  Zap,
  Folder,
} from "@/lib/icons"
import { CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useTools } from "@/hooks/use-tools"
import { useSkills } from "@/hooks/use-skills"
import {
  useDigitalEmployee,
  type DigitalEmployeeHydrationData,
} from "@/hooks/use-digital-employee"
import { WorkspaceIDE } from "@/src/features/digital-employees/components/detail/workspace-ide"
import { TabChat } from "@/src/features/digital-employees/components/detail/tab-chat"
import {
  TabActivity,
  type ActivityDailySummary,
  type ActivityFeedItem,
} from "@/src/features/digital-employees/components/detail/tab-activity"
import { TabSettings } from "@/src/features/digital-employees/components/detail/tab-settings"
import TabEmployeeTasks from "@/src/features/digital-employees/components/detail/tab-tasks"
import { ChatDrawer } from "@/src/features/digital-employees/components/detail/chat-drawer"
import { CreateToolDialog, ArchiveDialog, DeleteDialog } from "@/src/features/digital-employees/components/detail/dialogs"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { STATUS_STYLES, AUTONOMY_STYLES } from "@/lib/digital-employee/shared-constants"
import type { EmployeeSchedule } from "@/lib/digital-employee/types"
import { type TrustSummaryData } from "@/src/features/digital-employees/components/detail/trust-score-card"
import { type OnboardingStatusData } from "@/src/features/digital-employees/components/detail/onboarding-checklist"

// ─── Types ────────────────────────────────────────────────

type Section = "activity" | "chat" | "tasks" | "workspace" | "settings"

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string }>
  group: "interact" | "configure"
}

const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, group: "interact" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, group: "interact" },
  { id: "activity", label: "Activity", icon: Zap, group: "interact" },
  { id: "workspace", label: "Workspace", icon: Folder, group: "configure" },
  { id: "settings", label: "Settings", icon: Settings, group: "configure" },
]

// ─── Chat types ───────────────────────────────────────────

interface EmployeeChatMsg {
  id: string
  role: string
  content: string
  toolCalls?: unknown
  createdAt: string
}

interface DigitalEmployeeDetailPageClientProps {
  employeeId: string
  initialData?: DigitalEmployeeHydrationData | null
  initialChatHistory?: EmployeeChatMsg[]
  initialTrustSummary?: TrustSummaryData | null
  initialOnboardingStatus?: OnboardingStatusData | null
  initialActivity?: {
    events: ActivityFeedItem[]
    dailySummary: ActivityDailySummary
  } | null
}

// ─── Page Component ───────────────────────────────────────

export default function DigitalEmployeeDetailPage({
  employeeId,
  initialData,
  initialChatHistory,
  initialTrustSummary,
  initialOnboardingStatus,
  initialActivity,
}: DigitalEmployeeDetailPageClientProps) {
  const router = useRouter()
  const id = employeeId

  const {
    employee,
    files,
    runs,
    approvals,
    platformTools,
    customTools,
    skills,
    isLoading,
    respondToApproval,
    updateFile,
    installSkill,
    uninstallSkill,
    createCustomTool,
    deleteCustomTool,
    toggleCustomTool,
    toggleSkill,
    deleteEmployee,
    fetchEmployee,
    fetchTools: fetchEmployeeTools,
    fetchSkills: fetchEmployeeSkills,
  } = useDigitalEmployee(id, { initialData })

  // Available platform tools & skills (all items in the system)
  const { tools: allPlatformTools, isLoading: toolsLoading } = useTools()
  const { skills: allPlatformSkills, isLoading: skillsLoading } = useSkills()

  // Which tool/skill IDs are currently enabled on the assistant
  const enabledToolIds = new Set(platformTools.map((t) => t.id))
  const enabledSkillIds = new Set(skills.platform.map((s) => s.id))

  // Navigation
  const [activeSection, setActiveSection] = useState<Section>("chat")

  // Container status (derived from employee's group)
  const [containerRunning, setContainerRunning] = useState(false)

  // Chat state
  const [chatHistory, setChatHistory] = useState<EmployeeChatMsg[]>(initialChatHistory ?? [])

  // Dialog state
  const [createToolOpen, setCreateToolOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Chat drawer state (for chat-guided integration setup)
  const [chatDrawerMessage, setChatDrawerMessage] = useState<string | null>(null)

  // Derive container running from employee status
  useEffect(() => {
    setContainerRunning(employee?.status === "ACTIVE")
  }, [employee?.status])

  // ─── Handlers ─────────────────────────────────────────────

  const handleCreateTool = useCallback(async (input: { name: string; description?: string; code: string }) => {
    try {
      await createCustomTool(input)
      toast.success("Tool created")
      setCreateToolOpen(false)
    } catch {
      toast.error("Failed to create tool")
    }
  }, [createCustomTool])

  // Toggle a platform tool on/off the assistant
  const handleToggleAssistantTool = useCallback(
    async (toolId: string) => {
      if (!employee) return
      const assistantId = employee.assistantId
      const currentIds = platformTools.map((t) => t.id)
      const isEnabled = currentIds.includes(toolId)
      const newIds = isEnabled
        ? currentIds.filter((id) => id !== toolId)
        : [...currentIds, toolId]
      try {
        const res = await fetch(`/api/assistants/${assistantId}/tools`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolIds: newIds }),
        })
        if (!res.ok) throw new Error("Failed to update tools")
        await fetchEmployeeTools()
        toast.success(isEnabled ? "Tool removed" : "Tool added")
      } catch {
        toast.error("Failed to update tools")
      }
    },
    [employee, platformTools, fetchEmployeeTools]
  )

  // Toggle a platform skill on/off the assistant
  const handleToggleAssistantSkill = useCallback(
    async (skillId: string) => {
      if (!employee) return
      const assistantId = employee.assistantId
      const currentIds = skills.platform.map((s) => s.id)
      const isEnabled = currentIds.includes(skillId)
      const newIds = isEnabled
        ? currentIds.filter((id) => id !== skillId)
        : [...currentIds, skillId]
      try {
        const res = await fetch(`/api/assistants/${assistantId}/skills`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillIds: newIds }),
        })
        if (!res.ok) throw new Error("Failed to update skills")

        if (!isEnabled) {
          const skill = allPlatformSkills.find((s) => s.id === skillId)
          if (skill) {
            const currentToolIds = platformTools.map((t) => t.id)
            const toolIdsToEnable = new Set<string>()

            if (skill.relatedToolIds?.length) {
              for (const tid of skill.relatedToolIds) {
                if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
              }
            }

            const meta = skill.metadata as Record<string, unknown> | null
            const attachedToolIds = Array.isArray(meta?.toolIds) ? (meta.toolIds as string[]) : []
            for (const tid of attachedToolIds) {
              if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
            }

            const reqs = meta?.requirements as { tools?: string[] } | undefined
            if (reqs?.tools) {
              for (const reqToolName of reqs.tools) {
                const match = allPlatformTools.find((t) => t.name === reqToolName)
                if (match && !currentToolIds.includes(match.id)) {
                  toolIdsToEnable.add(match.id)
                }
              }
            }

            if (toolIdsToEnable.size > 0) {
              const updatedToolIds = [...currentToolIds, ...toolIdsToEnable]
              await fetch(`/api/assistants/${assistantId}/tools`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toolIds: updatedToolIds }),
              })
              await fetchEmployeeTools()
              toast.success(`Skill added + ${toolIdsToEnable.size} required tool${toolIdsToEnable.size > 1 ? "s" : ""} enabled`)
              await fetchEmployeeSkills()
              return
            }
          }
        }

        await fetchEmployeeSkills()
        toast.success(isEnabled ? "Skill removed" : "Skill added")
      } catch {
        toast.error("Failed to update skills")
      }
    },
    [employee, skills.platform, allPlatformSkills, allPlatformTools, platformTools, fetchEmployeeSkills, fetchEmployeeTools]
  )

  // ─── Schedule handlers ──────────────────────────────────

  const schedules: EmployeeSchedule[] =
    (employee?.deploymentConfig as any)?.schedules ?? []

  const handleUpdateHeartbeat = useCallback(
    async (heartbeat: import("@/lib/digital-employee/types").HeartbeatConfig) => {
      try {
        const config = (employee?.deploymentConfig as any) ?? {}
        const res = await fetch(`/api/dashboard/digital-employees/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deploymentConfig: { ...config, heartbeat },
          }),
        })
        if (!res.ok) throw new Error("Failed to update heartbeat")
        await fetchEmployee()
        toast.success("Heartbeat configuration saved")
      } catch {
        toast.error("Failed to save heartbeat")
      }
    },
    [employee, id, fetchEmployee]
  )

  const handleArchive = useCallback(async () => {
    if (!employee) return
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      })
      if (!res.ok) throw new Error("Failed to archive")
      toast.success("Employee archived")
      router.push("/dashboard/digital-employees")
    } catch {
      toast.error("Failed to archive")
    }
  }, [employee, router])

  const handleDelete = useCallback(async () => {
    if (!employee) return
    setIsDeleting(true)
    try {
      await deleteEmployee()
      toast.success("Employee deleted")
      router.push("/dashboard/digital-employees")
    } catch {
      toast.error("Failed to delete")
    } finally {
      setIsDeleting(false)
    }
  }, [employee, deleteEmployee, router])

  const handleUpdateSession = useCallback(
    (_sessionId: string, _updates: Partial<ChatSession>) => {},
    []
  )

  const handleSectionChange = useCallback(
    async (section: Section) => {
      setActiveSection(section)
      if (section !== "chat" || !containerRunning || chatHistory.length > 0) {
        return
      }
      try {
        const res = await fetch(`/api/dashboard/digital-employees/${id}/chat`)
        if (!res.ok) return
        const msgs: EmployeeChatMsg[] = await res.json()
        setChatHistory(Array.isArray(msgs) ? msgs : [])
      } catch {
        // keep local history state unchanged
      }
    },
    [chatHistory.length, containerRunning, id]
  )

  // ─── Loading & Not Found ──────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!employee) {
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

  // ─── Derived state ────────────────────────────────────────

  const status = STATUS_STYLES[employee.status] || STATUS_STYLES.DRAFT
  const autonomy = AUTONOMY_STYLES[employee.autonomyLevel] || AUTONOMY_STYLES.supervised
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING")
  // Build synthetic assistant for ChatWorkspace
  const employeeAssistant: Assistant = {
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

  // Build synthetic session from chat history
  const syntheticSession: ChatSession = {
        id: `emp-chat-${id}`,
        title: `Chat with ${employee.name}`,
        assistantId: employee.assistantId || "",
        messages: chatHistory.map((m) => {
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

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/digital-employees")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xl">{employee.avatar || "🤖"}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">{employee.name}</h1>
              <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", status.className)}>
                {status.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {employee.assistant.emoji} {employee.assistant.name}
              <span className="mx-1.5 text-border">|</span>
              {autonomy.label}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {containerRunning ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {employee.lastActiveAt && (Date.now() - new Date(employee.lastActiveAt).getTime()) < 60_000
                ? <span className="text-emerald-500">Running task...</span>
                : <span>Idle{employee.lastActiveAt && ` · last active ${formatDistanceToNow(new Date(employee.lastActiveAt), { addSuffix: true })}`}</span>
              }
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              <span>Offline</span>
            </>
          )}
        </div>
      </div>

      {/* ─── Body: Sidebar + Content ─── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <TooltipProvider delayDuration={0}>
          <nav className="w-12 lg:w-44 border-r border-border bg-muted/30 shrink-0 flex flex-col py-2">
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              const showSeparator = i > 0 && NAV_ITEMS[i - 1].group !== item.group

              return (
                <div key={item.id}>
                  {showSeparator && (
                    <div className="h-px bg-border mx-2 my-1.5" />
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => void handleSectionChange(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors relative",
                          isActive
                            ? "text-foreground bg-background font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-indicator"
                            className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r"
                            transition={{ type: "spring" as const, stiffness: 500, damping: 30 }}
                          />
                        )}
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="hidden lg:block truncate">{item.label}</span>
                        {item.id === "activity" && pendingApprovals.length > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-auto bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0 h-4 hidden lg:flex"
                          >
                            {pendingApprovals.length}
                          </Badge>
                        )}
                        {item.id === "activity" && pendingApprovals.length > 0 && (
                          <span className="lg:hidden absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="lg:hidden">
                      {item.label}
                      {item.id === "activity" && pendingApprovals.length > 0
                        ? ` (${pendingApprovals.length})`
                        : ""}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </nav>
        </TooltipProvider>

        {/* Content */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* ─── Activity ─── */}
          {activeSection === "activity" && (
            <TabActivity
              employee={employee}
              containerRunning={containerRunning}
              pendingApprovals={pendingApprovals}
              respondToApproval={respondToApproval}
              runs={runs}
              initialActivity={initialActivity}
              initialOnboardingStatus={initialOnboardingStatus}
              onRefresh={fetchEmployee}
            />
          )}

          {/* ─── Chat ─── */}
          {activeSection === "chat" && (
            <TabChat
              employee={employee}
              containerRunning={containerRunning}
              syntheticSession={syntheticSession}
              employeeAssistant={employeeAssistant}
              onUpdateSession={handleUpdateSession}
            />
          )}

          {/* ─── Tasks ─── */}
          {activeSection === "tasks" && (
            <TabEmployeeTasks employeeId={id} employeeName={employee?.name} />
          )}

          {/* ─── Workspace ─── */}
          {activeSection === "workspace" && (
            <WorkspaceIDE
              employeeId={id}
              containerRunning={containerRunning}
            />
          )}

          {/* ─── Settings ─── */}
          {activeSection === "settings" && (
            <TabSettings
              employee={employee}
              allPlatformTools={allPlatformTools}
              customTools={customTools}
              toolsLoading={toolsLoading}
              enabledToolIds={enabledToolIds}
              onToggleAssistantTool={handleToggleAssistantTool}
              toggleCustomTool={toggleCustomTool}
              deleteCustomTool={deleteCustomTool}
              onCreateToolOpen={() => setCreateToolOpen(true)}
              skills={skills}
              allPlatformSkills={allPlatformSkills}
              skillsLoading={skillsLoading}
              enabledSkillIds={enabledSkillIds}
              onToggleAssistantSkill={handleToggleAssistantSkill}
              toggleSkill={toggleSkill}
              installSkill={installSkill}
              uninstallSkill={uninstallSkill}
              schedules={schedules}
              runs={runs}
              initialTrustData={initialTrustSummary}
              onUpdateHeartbeat={handleUpdateHeartbeat}
              fetchEmployee={fetchEmployee}
              onArchiveOpen={() => setArchiveOpen(true)}
              onDeleteOpen={() => setDeleteOpen(true)}
              onOpenChat={(msg) => setChatDrawerMessage(msg)}
            />
          )}
        </div>
      </div>

      {/* ─── Chat Drawer (FAB on non-chat tabs) ─── */}
      {activeSection !== "chat" && (
        <ChatDrawer
          employee={employee}
          containerRunning={containerRunning}
          syntheticSession={syntheticSession}
          employeeAssistant={employeeAssistant}
          onUpdateSession={handleUpdateSession}
          initialMessage={chatDrawerMessage}
          onInitialMessageSent={() => setChatDrawerMessage(null)}
        />
      )}

      {/* ─── Dialogs ─── */}
      <CreateToolDialog
        open={createToolOpen}
        onOpenChange={setCreateToolOpen}
        onCreateTool={handleCreateTool}
      />
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        employeeName={employee.name}
        onArchive={handleArchive}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        employeeName={employee.name}
        onDelete={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  )
}
