"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Calendar,
  MessageSquare,
  Check,
  Clock,
  FileText,
  Loader2,
  Package,
  Pause,
  Play,
  Plus,
  Rocket,
  Save,
  Search,
  Settings,
  Mail,
  Shield,
  Sparkles,
  Square,
  Trash2,
  Users,
  Wrench,
  X,
  Zap,
  Download,
  Star,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { useSkills, type SkillItem } from "@/hooks/use-skills"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { useDigitalEmployee, type DeployProgressEvent } from "@/hooks/use-digital-employee"
import { ChatWorkspace } from "@/app/dashboard/_components/chat/chat-workspace"
import { ScheduleMonitor } from "./_components/schedule-monitor"
import { WorkspaceIDE } from "./_components/workspace-ide"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import type { EmployeeSchedule } from "@/lib/digital-employee/types"

// ─── Constants ────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ONBOARDING: { label: "Onboarding", className: "bg-sky-500/10 text-sky-500" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  SUSPENDED: { label: "Suspended", className: "bg-red-500/10 text-red-500" },
  ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

const AUTONOMY_STYLES: Record<string, { label: string; className: string }> = {
  supervised: { label: "Supervised", className: "bg-blue-500/10 text-blue-500" },
  autonomous: { label: "Autonomous", className: "bg-purple-500/10 text-purple-500" },
}

const BUILTIN_TOOL_ICONS: Record<string, string> = {
  knowledge_search: "📚", customer_lookup: "👥", channel_dispatch: "📤",
  document_analysis: "📄", file_operations: "📁", web_search: "🔍",
  calculator: "🧮", date_time: "⏰", json_transform: "🔄",
  text_utilities: "🔤", create_artifact: "🎨", update_artifact: "✏️",
}

const CATEGORY_LABELS: Record<string, string> = {
  builtin: "Built-in", custom: "Custom", community: "Community", openapi: "OpenAPI", mcp: "MCP",
}

const RUN_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  RUNNING: { label: "Running", className: "bg-blue-500/10 text-blue-500" },
  COMPLETED: { label: "Completed", className: "bg-emerald-500/10 text-emerald-500" },
  FAILED: { label: "Failed", className: "bg-red-500/10 text-red-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
}

type Section = "chat" | "runs" | "schedule" | "inbox" | "files" | "skills" | "tools" | "config"

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string }>
  group: "interact" | "configure"
}

const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, group: "interact" },
  { id: "runs", label: "Jobs", icon: Zap, group: "interact" },
  { id: "schedule", label: "Schedule", icon: Calendar, group: "interact" },
  { id: "inbox", label: "Inbox", icon: Mail, group: "interact" },
  { id: "files", label: "Files", icon: FileText, group: "configure" },
  { id: "skills", label: "Skills", icon: Sparkles, group: "configure" },
  { id: "tools", label: "Tools", icon: Wrench, group: "configure" },
  { id: "config", label: "Config", icon: Settings, group: "configure" },
]

// ─── Chat types ───────────────────────────────────────────

interface EmployeeChatMsg {
  id: string
  role: string
  content: string
  toolCalls?: unknown
  createdAt: string
}

// ─── Page Component ───────────────────────────────────────

export default function DigitalEmployeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const {
    employee,
    files,
    runs,
    approvals,
    platformTools,
    customTools,
    skills,
    isLoading,
    deploy,
    start,
    stop,
    pause,
    resume,
    terminate,
    triggerRun,
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
    ideStatus,
    fetchIdeStatus,
    startIde,
    stopIde,
  } = useDigitalEmployee(id)

  // Available platform tools & skills (all items in the system)
  const { tools: allPlatformTools, isLoading: toolsLoading } = useTools()
  const { skills: allPlatformSkills, isLoading: skillsLoading } = useSkills()

  // Which tool/skill IDs are currently enabled on the assistant
  const enabledToolIds = new Set(platformTools.map((t) => t.id))
  const enabledSkillIds = new Set(skills.platform.map((s) => s.id))

  // Search state for tools/skills
  const [toolSearch, setToolSearch] = useState("")
  const [skillSearch, setSkillSearch] = useState("")

  // Navigation
  const [activeSection, setActiveSection] = useState<Section>("chat")

  // Deploy/start progress
  const [deployProgress, setDeployProgress] = useState<DeployProgressEvent | null>(null)
  const [deployStepMessages, setDeployStepMessages] = useState<Record<number, string>>({})
  const [isDeploying, setIsDeploying] = useState(false)

  // Container status
  const [containerRunning, setContainerRunning] = useState(false)
  const [containerLoading, setContainerLoading] = useState(false)

  // Chat state
  const [chatHistory, setChatHistory] = useState<EmployeeChatMsg[] | null>(null)
  const chatFetchedRef = useRef(false)

  // Tool creation dialog
  const [createToolOpen, setCreateToolOpen] = useState(false)
  const [newToolName, setNewToolName] = useState("")
  const [newToolDesc, setNewToolDesc] = useState("")
  const [newToolCode, setNewToolCode] = useState("")

  // ClawHub search state
  const [clawHubQuery, setClawHubQuery] = useState("")
  const [clawHubResults, setClawHubResults] = useState<Array<{ slug: string; name: string; description: string; author: string; downloads?: number; rating?: number; installs?: number }>>([])
  const [clawHubSearching, setClawHubSearching] = useState(false)
  const [clawHubLoaded, setClawHubLoaded] = useState(false)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)

  // Settings form state
  const [settingsName, setSettingsName] = useState("")
  const [settingsDesc, setSettingsDesc] = useState("")
  const [settingsAvatar, setSettingsAvatar] = useState("")
  const [settingsAutonomy, setSettingsAutonomy] = useState("")
  const [settingsInitialized, setSettingsInitialized] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Archive confirm
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Initialize settings from employee
  if (employee && !settingsInitialized) {
    setSettingsName(employee.name)
    setSettingsDesc(employee.description || "")
    setSettingsAvatar(employee.avatar || "")
    setSettingsAutonomy(employee.autonomyLevel)
    setSettingsInitialized(true)
  }

  // Fetch container status when employee is active
  useEffect(() => {
    if (!employee || employee.status !== "ACTIVE") return
    fetch(`/api/dashboard/digital-employees/${id}/status`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setContainerRunning(data.containerRunning)
      })
      .catch(() => {})
  }, [id, employee?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load chat history when container is running
  useEffect(() => {
    if (!id || !containerRunning || chatFetchedRef.current) return
    chatFetchedRef.current = true
    fetch(`/api/dashboard/digital-employees/${id}/chat`)
      .then((r) => r.ok ? r.json() : [])
      .then((msgs: EmployeeChatMsg[]) => setChatHistory(msgs))
      .catch(() => setChatHistory([]))
  }, [id, containerRunning])

  // Load top-rated ClawHub skills on first visit to skills section
  useEffect(() => {
    if (activeSection !== "skills" || clawHubLoaded) return
    setClawHubLoaded(true)
    setClawHubSearching(true)
    fetch(`/api/dashboard/digital-employees/${id}/skills/search`)
      .then((r) => r.ok ? r.json() : { results: [] })
      .then((data) => setClawHubResults(data.results || []))
      .catch(() => setClawHubResults([]))
      .finally(() => setClawHubSearching(false))
  }, [activeSection, clawHubLoaded, id])

  // ─── Handlers ─────────────────────────────────────────────

  const handleProgressEvent = useCallback((event: DeployProgressEvent) => {
    setDeployProgress(event)
    if (event.step > 0) {
      setDeployStepMessages((prev) => ({ ...prev, [event.step]: event.message }))
    }
  }, [])

  const handleStart = useCallback(async () => {
    setContainerLoading(true)
    setIsDeploying(true)
    setDeployProgress(null)
    setDeployStepMessages({})
    try {
      await start(handleProgressEvent)
      setContainerRunning(true)
      chatFetchedRef.current = false
      toast.success("Employee started")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start")
    } finally {
      setContainerLoading(false)
      setTimeout(() => {
        setIsDeploying(false)
        setDeployProgress(null)
        setDeployStepMessages({})
      }, 1500)
    }
  }, [start, handleProgressEvent])

  const handleStop = useCallback(async () => {
    setContainerLoading(true)
    try {
      await stop()
      setContainerRunning(false)
      toast.success("Employee stopped")
    } catch {
      toast.error("Failed to stop")
    } finally {
      setContainerLoading(false)
    }
  }, [stop])

  const handleDeploy = useCallback(async () => {
    setIsDeploying(true)
    setDeployProgress(null)
    setDeployStepMessages({})
    try {
      await deploy(handleProgressEvent)
      toast.success("Employee deployed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy")
    } finally {
      setTimeout(() => {
        setIsDeploying(false)
        setDeployProgress(null)
        setDeployStepMessages({})
      }, 1500)
    }
  }, [deploy, handleProgressEvent])

  const handlePause = useCallback(async () => {
    try {
      await pause()
      toast.success("Employee paused")
    } catch {
      toast.error("Failed to pause")
    }
  }, [pause])

  const handleResume = useCallback(async () => {
    try {
      await resume()
      toast.success("Employee resumed")
    } catch {
      toast.error("Failed to resume")
    }
  }, [resume])

  const handleTerminate = useCallback(async () => {
    try {
      await terminate()
      toast.success("Employee terminated")
    } catch {
      toast.error("Failed to terminate")
    }
  }, [terminate])

  const handleRunNow = useCallback(async () => {
    try {
      await triggerRun()
      toast.success("Run triggered")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger run")
    }
  }, [triggerRun])

  // Auto-redeploy if employee is already deployed, restart container if running
  const autoRedeploy = useCallback(async () => {
    if (!employee || employee.status === "DRAFT") return
    try {
      toast.info("Redeploying to apply changes...")
      await deploy()
      // If container is running, restart it to pick up the new package
      if (containerRunning) {
        toast.info("Restarting container to apply changes...")
        await stop()
        await start()
        setContainerRunning(true)
        chatFetchedRef.current = false
      }
      toast.success("Redeployed successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Redeploy failed")
    }
  }, [employee, deploy, containerRunning, stop, start])

  const handleCreateTool = useCallback(async () => {
    try {
      await createCustomTool({
        name: newToolName,
        description: newToolDesc || undefined,
        code: newToolCode,
      })
      toast.success("Tool created")
      setCreateToolOpen(false)
      setNewToolName("")
      setNewToolDesc("")
      setNewToolCode("")
      await autoRedeploy()
    } catch {
      toast.error("Failed to create tool")
    }
  }, [newToolName, newToolDesc, newToolCode, createCustomTool, autoRedeploy])

  // Debounced ClawHub search
  const clawHubSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchClawHub = useCallback(async (query: string) => {
    try {
      const url = query.trim()
        ? `/api/dashboard/digital-employees/${id}/skills/search?q=${encodeURIComponent(query.trim())}`
        : `/api/dashboard/digital-employees/${id}/skills/search`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setClawHubResults(data.results || [])
    } catch {
      setClawHubResults([])
    } finally {
      setClawHubSearching(false)
    }
  }, [id])

  const handleClawHubSearch = useCallback((query: string) => {
    setClawHubQuery(query)
    if (clawHubSearchTimer.current) clearTimeout(clawHubSearchTimer.current)
    setClawHubSearching(true)
    clawHubSearchTimer.current = setTimeout(() => fetchClawHub(query), 300)
  }, [fetchClawHub])

  const handleInstallFromHub = useCallback(async (slug: string) => {
    setInstallingSlug(slug)
    try {
      await installSkill(slug)
      toast.success("Skill installed")
      await autoRedeploy()
    } catch {
      toast.error("Failed to install skill")
    } finally {
      setInstallingSlug(null)
    }
  }, [installSkill, autoRedeploy])

  const installedClawHubSlugs = useMemo(
    () => new Set(skills.clawhub.map((s: { slug: string }) => s.slug)),
    [skills.clawhub]
  )

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
        await autoRedeploy()
      } catch {
        toast.error("Failed to update tools")
      }
    },
    [employee, platformTools, fetchEmployeeTools, autoRedeploy]
  )

  // Toggle a platform skill on/off the assistant (auto-enables required tools when adding)
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
        // Update skill bindings
        const res = await fetch(`/api/assistants/${assistantId}/skills`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillIds: newIds }),
        })
        if (!res.ok) throw new Error("Failed to update skills")

        // When enabling a skill, auto-enable its required tools
        if (!isEnabled) {
          const skill = allPlatformSkills.find((s) => s.id === skillId)
          if (skill) {
            const currentToolIds = platformTools.map((t) => t.id)
            const toolIdsToEnable = new Set<string>()

            // 1. Related tools (created on community skill install)
            if (skill.relatedToolIds?.length) {
              for (const tid of skill.relatedToolIds) {
                if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
              }
            }

            // 2. Explicitly attached tools from metadata
            const meta = skill.metadata as Record<string, unknown> | null
            const attachedToolIds = Array.isArray(meta?.toolIds) ? (meta.toolIds as string[]) : []
            for (const tid of attachedToolIds) {
              if (!currentToolIds.includes(tid)) toolIdsToEnable.add(tid)
            }

            // 3. Required tools from parsed requirements (match by tool name)
            const reqs = meta?.requirements as { tools?: string[] } | undefined
            if (reqs?.tools) {
              for (const reqToolName of reqs.tools) {
                const match = allPlatformTools.find((t) => t.name === reqToolName)
                if (match && !currentToolIds.includes(match.id)) {
                  toolIdsToEnable.add(match.id)
                }
              }
            }

            // Auto-enable the tools on the assistant
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
              await autoRedeploy()
              return
            }
          }
        }

        await fetchEmployeeSkills()
        toast.success(isEnabled ? "Skill removed" : "Skill added")
        await autoRedeploy()
      } catch {
        toast.error("Failed to update skills")
      }
    },
    [employee, skills.platform, allPlatformSkills, allPlatformTools, platformTools, fetchEmployeeSkills, fetchEmployeeTools, autoRedeploy]
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

  const handleSaveSettings = useCallback(async () => {
    if (!employee) return
    setIsSavingSettings(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingsName.trim(),
          description: settingsDesc.trim() || null,
          avatar: settingsAvatar.trim() || null,
          autonomyLevel: settingsAutonomy,
        }),
      })
      if (!res.ok) throw new Error("Failed to update")
      await fetchEmployee()
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setIsSavingSettings(false)
    }
  }, [employee, settingsName, settingsDesc, settingsAvatar, settingsAutonomy, fetchEmployee])

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
  const historyApprovals = approvals.filter((a) => a.status !== "PENDING")

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
  const syntheticSession: ChatSession | null = chatHistory
    ? {
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
    : null

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
              {containerRunning && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {employee.assistant.emoji} {employee.assistant.name}
              <span className="mx-1.5 text-border">|</span>
              {autonomy.label}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {employee.status === "DRAFT" && (
            <Button size="sm" onClick={handleDeploy}>
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Deploy
            </Button>
          )}
          {employee.status === "ACTIVE" && !containerRunning && (
            <Button size="sm" onClick={handleStart} disabled={containerLoading}>
              {containerLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Start
            </Button>
          )}
          {employee.status === "ACTIVE" && containerRunning && (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={containerLoading}>
              {containerLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 mr-1.5" />
              )}
              Stop
            </Button>
          )}
          {employee.status === "ACTIVE" && (
            <>
              <Button size="sm" variant="ghost" onClick={handlePause}>
                <Pause className="h-3.5 w-3.5" />
              </Button>
              {containerRunning && (
                <Button size="sm" variant="ghost" onClick={handleRunNow}>
                  <Zap className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
          {employee.status === "PAUSED" && (
            <Button size="sm" onClick={handleResume}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Resume
            </Button>
          )}
          {(employee.status === "ACTIVE" || employee.status === "PAUSED") && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={handleTerminate}>
              <X className="h-3.5 w-3.5" />
            </Button>
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
                        onClick={() => setActiveSection(item.id)}
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
                        {item.id === "inbox" && pendingApprovals.length > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-auto bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0 h-4 hidden lg:flex"
                          >
                            {pendingApprovals.length}
                          </Badge>
                        )}
                        {item.id === "inbox" && pendingApprovals.length > 0 && (
                          <span className="lg:hidden absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="lg:hidden">
                      {item.label}
                      {item.id === "inbox" && pendingApprovals.length > 0
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
          {/* ─── Chat ─── */}
          {activeSection === "chat" && (
            <div className="flex-1 min-h-0">
              {!containerRunning ? (
                <div className="flex-1 h-full flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="text-4xl">{employee.avatar || "🤖"}</div>
                    <h3 className="text-lg font-medium">{employee.name} is offline</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {employee.status === "ACTIVE"
                        ? "Start the employee to begin chatting."
                        : employee.status === "DRAFT"
                          ? "Deploy the employee first to start chatting."
                          : "Resume or redeploy to chat."}
                    </p>
                  </div>
                </div>
              ) : syntheticSession ? (
                <ChatWorkspace
                  key={`emp-${id}`}
                  session={syntheticSession}
                  assistant={employeeAssistant}
                  apiEndpoint={`/api/dashboard/digital-employees/${id}/chat`}
                  onUpdateSession={handleUpdateSession}
                />
              ) : (
                <div className="flex-1 h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          {/* ─── Runs ─── */}
          {activeSection === "runs" && (
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Jobs ({runs.length})</h2>
                {employee.status === "ACTIVE" && containerRunning && (
                  <Button size="sm" onClick={handleRunNow}>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Run Now
                  </Button>
                )}
              </div>
              {runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Zap className="h-8 w-8 mb-3 opacity-30" />
                  <p className="text-sm">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => {
                    const runStatus = RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.COMPLETED
                    const duration = run.executionTimeMs
                      ? `${(run.executionTimeMs / 1000).toFixed(1)}s`
                      : "-"
                    const tokens = run.promptTokens + run.completionTokens

                    return (
                      <div
                        key={run.id}
                        className="rounded-lg border bg-card p-3 flex items-center gap-4 text-sm"
                      >
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0.5 shrink-0", runStatus.className)}
                        >
                          {runStatus.label}
                        </Badge>
                        <span className="text-muted-foreground">{run.trigger}</span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {duration}
                        </span>
                        <span className="text-muted-foreground">{tokens.toLocaleString()} tokens</span>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Schedule ─── */}
          {activeSection === "schedule" && (
            <ScheduleMonitor
              schedules={schedules}
              runs={runs}
              heartbeat={(employee?.deploymentConfig as any)?.heartbeat}
              onUpdateHeartbeat={handleUpdateHeartbeat}
            />
          )}

          {/* ─── Inbox (Approvals) ─── */}
          {activeSection === "inbox" && (
            <div className="flex-1 overflow-auto p-5 space-y-6">
              {/* Pending */}
              <div>
                <h2 className="text-sm font-medium mb-3">
                  Pending ({pendingApprovals.length})
                </h2>
                {pendingApprovals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Shield className="h-8 w-8 mb-3 opacity-30" />
                    <p className="text-sm">No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingApprovals.map((approval) => (
                      <div
                        key={approval.id}
                        className="rounded-lg border bg-card p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-medium">{approval.title}</h4>
                            {approval.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{approval.description}</p>
                            )}
                            <Badge variant="outline" className="text-[10px] mt-1.5">{approval.requestType}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              respondToApproval(approval.id, { status: "APPROVED" })
                                .then(() => toast.success("Approved"))
                                .catch(() => toast.error("Failed"))
                            }
                          >
                            <Check className="h-4 w-4 mr-1.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              respondToApproval(approval.id, { status: "REJECTED" })
                                .then(() => toast.success("Rejected"))
                                .catch(() => toast.error("Failed"))
                            }
                          >
                            <X className="h-4 w-4 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* History */}
              {historyApprovals.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">History</h3>
                  <div className="space-y-2">
                    {historyApprovals.map((approval) => (
                      <div
                        key={approval.id}
                        className="rounded-lg border bg-card p-3 flex items-center gap-3 text-sm"
                      >
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 shrink-0",
                            approval.status === "APPROVED"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {approval.status}
                        </Badge>
                        <span className="truncate">{approval.title}</span>
                        <span className="text-muted-foreground ml-auto text-xs shrink-0">
                          {approval.respondedAt
                            ? formatDistanceToNow(new Date(approval.respondedAt), { addSuffix: true })
                            : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Files ─── */}
          {activeSection === "files" && (
            <WorkspaceIDE
              employeeId={id}
              ideStatus={ideStatus}
              fetchIdeStatus={fetchIdeStatus}
              startIde={startIde}
              stopIde={stopIde}
            />
          )}

          {/* ─── Skills ─── */}
          {activeSection === "skills" && (
            <div className="flex-1 overflow-auto p-5 space-y-6">
              {/* Platform Skills — show all available, toggle to enable */}
              <div>
                <h2 className="text-sm font-medium mb-1">Platform Skills</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Toggle skills to enable/disable on {employee.assistant.emoji} {employee.assistant.name}.
                </p>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search skills..."
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                  {skillSearch && (
                    <button
                      onClick={() => setSkillSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {skillsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading skills...</p>
                ) : (() => {
                  const q = skillSearch.toLowerCase()
                  const filtered = allPlatformSkills.filter(
                    (s) => !q || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
                  )
                  return filtered.length === 0 ? (
                    <div className="text-center py-6 border border-dashed rounded-md">
                      <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
                      <p className="text-xs text-muted-foreground">{skillSearch ? "No skills match your search" : "No skills available"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((skill) => {
                        const isEnabled = enabledSkillIds.has(skill.id)
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => handleToggleAssistantSkill(skill.id)}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full border",
                              isEnabled
                                ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                              isEnabled ? "bg-primary/10" : "bg-muted"
                            )}>
                              <DynamicIcon
                                icon={skill.icon ?? undefined}
                                fallback={Sparkles}
                                className={cn("h-4 w-4", isEnabled ? "text-primary" : "text-muted-foreground")}
                                emojiClassName="text-base"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{skill.displayName}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{skill.source}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                            </div>
                            <div className="shrink-0 mt-1">
                              <div className={cn(
                                "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                isEnabled ? "border-primary bg-primary" : "border-muted-foreground/30"
                              )}>
                                {isEnabled && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                      <p className="text-xs text-muted-foreground">
                        {enabledSkillIds.size} skill{enabledSkillIds.size !== 1 ? "s" : ""} enabled
                      </p>
                    </div>
                  )
                })()}
              </div>

              <div className="h-px bg-border" />

              {/* ClawHub Skills */}
              <div>
                <h3 className="text-sm font-medium mb-3">ClawHub Skills</h3>
                <p className="text-xs text-muted-foreground mb-4">Browse and install community skills from ClawHub.</p>

                {/* Installed ClawHub skills */}
                {skills.clawhub.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {skills.clawhub.map((skill) => (
                      <div key={skill.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <span className="text-lg shrink-0">🐾</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{skill.name}</span>
                            {skill.version && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{skill.version}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{skill.slug}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={async (checked) => {
                              try {
                                await toggleSkill(skill.id, checked)
                                await autoRedeploy()
                              } catch {
                                toast.error("Failed to toggle skill")
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              try {
                                await uninstallSkill(skill.id)
                                toast.success("Skill uninstalled")
                                await autoRedeploy()
                              } catch {
                                toast.error("Failed to uninstall skill")
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {skills.clawhub.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md mb-4">No ClawHub skills installed</p>
                )}

                {/* Search ClawHub */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={clawHubQuery}
                    onChange={(e) => handleClawHubSearch(e.target.value)}
                    placeholder="Search ClawHub skills..."
                    className="pl-8 h-9"
                  />
                  {clawHubQuery && (
                    <button
                      onClick={() => { setClawHubQuery(""); fetchClawHub("") }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Search results */}
                {clawHubSearching && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-xs text-muted-foreground">Searching ClawHub...</span>
                  </div>
                )}

                {!clawHubSearching && clawHubQuery.trim() && clawHubResults.length === 0 && (
                  <div className="text-center py-6 border border-dashed rounded-md">
                    <Package className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
                    <p className="text-xs text-muted-foreground">No skills found for &ldquo;{clawHubQuery}&rdquo;</p>
                  </div>
                )}

                {!clawHubSearching && clawHubResults.length > 0 && (
                  <div className="space-y-2">
                    {!clawHubQuery.trim() && (
                      <p className="text-xs font-medium text-muted-foreground mb-1">Top Rated</p>
                    )}
                    {clawHubResults.map((result) => {
                      const isInstalled = installedClawHubSlugs.has(result.slug)
                      const isInstalling = installingSlug === result.slug
                      return (
                        <div key={result.slug} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                          <span className="text-lg shrink-0 mt-0.5">🐾</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{result.name}</span>
                              {result.author && (
                                <span className="text-[10px] text-muted-foreground">by {result.author}</span>
                              )}
                            </div>
                            {result.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{result.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              {result.downloads != null && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Download className="h-3 w-3" />
                                  {result.downloads.toLocaleString()}
                                </span>
                              )}
                              {result.rating != null && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Star className="h-3 w-3" />
                                  {result.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {isInstalled ? (
                              <Badge variant="secondary" className="text-[10px]">Installed</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={isInstalling}
                                onClick={() => handleInstallFromHub(result.slug)}
                              >
                                {isInstalling ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Install
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Tools ─── */}
          {activeSection === "tools" && (
            <div className="flex-1 overflow-auto p-5 space-y-6">
              {/* Platform Tools — show all available, toggle to enable */}
              <div>
                <h2 className="text-sm font-medium mb-1">Platform Tools</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Toggle tools to enable/disable on {employee.assistant.emoji} {employee.assistant.name}.
                </p>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search tools..."
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                  {toolSearch && (
                    <button
                      onClick={() => setToolSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {toolsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading tools...</p>
                ) : (() => {
                  const q = toolSearch.toLowerCase()
                  const filtered = allPlatformTools.filter(
                    (t) => !q || t.displayName.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
                  )
                  return filtered.length === 0 ? (
                    <div className="text-center py-6 border border-dashed rounded-md">
                      <Wrench className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
                      <p className="text-xs text-muted-foreground">{toolSearch ? "No tools match your search" : "No tools available"}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((tool) => {
                        const isEnabled = enabledToolIds.has(tool.id)
                        const toolIcon = tool.icon || (tool.category === "builtin" ? BUILTIN_TOOL_ICONS[tool.name] : undefined)
                        const categoryBadge = (() => {
                          switch (tool.category) {
                            case "builtin":
                              return (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <Package className="h-2.5 w-2.5 mr-0.5" />
                                  Built-in
                                </Badge>
                              )
                            case "community":
                              return (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-indigo-600 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800">
                                  <Users className="h-2.5 w-2.5 mr-0.5" />
                                  Community
                                </Badge>
                              )
                            default:
                              return (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <Wrench className="h-2.5 w-2.5 mr-0.5" />
                                  {CATEGORY_LABELS[tool.category] ?? tool.category}
                                </Badge>
                              )
                          }
                        })()
                        return (
                          <button
                            key={tool.id}
                            type="button"
                            onClick={() => handleToggleAssistantTool(tool.id)}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full border",
                              isEnabled
                                ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                              isEnabled ? "bg-primary/10" : "bg-muted"
                            )}>
                              <DynamicIcon
                                icon={toolIcon ?? undefined}
                                fallback={Wrench}
                                className={cn("h-4 w-4", isEnabled ? "text-primary" : "text-muted-foreground")}
                                emojiClassName="text-base"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{tool.displayName}</span>
                                {categoryBadge}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                              {tool.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {tool.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 mt-1">
                              <div className={cn(
                                "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                isEnabled ? "border-primary bg-primary" : "border-muted-foreground/30"
                              )}>
                                {isEnabled && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                      <p className="text-xs text-muted-foreground">
                        {enabledToolIds.size} tool{enabledToolIds.size !== 1 ? "s" : ""} enabled
                      </p>
                    </div>
                  )
                })()}
              </div>

              <div className="h-px bg-border" />

              {/* Custom Tools */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Custom Tools</h3>
                  <Button size="sm" variant="outline" onClick={() => setCreateToolOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Tool
                  </Button>
                </div>
                {customTools.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md">No custom tools yet</p>
                ) : (
                  <div className="space-y-2">
                    {customTools.map((tool) => (
                      <div key={tool.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <span className="text-lg shrink-0">🛠️</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{tool.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tool.language}</Badge>
                            {tool.approved ? (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500">Approved</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending</Badge>
                            )}
                          </div>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={tool.enabled}
                            onCheckedChange={async (checked) => {
                              try {
                                await toggleCustomTool(tool.id, checked)
                                await autoRedeploy()
                              } catch {
                                toast.error("Failed to toggle tool")
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              try {
                                await deleteCustomTool(tool.id)
                                toast.success("Tool deleted")
                                await autoRedeploy()
                              } catch {
                                toast.error("Failed to delete tool")
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Config ─── */}
          {activeSection === "config" && (
            <div className="flex-1 overflow-auto p-5 space-y-6">
              <div className="max-w-lg space-y-4">
                <h2 className="text-sm font-medium">General</h2>
                <div className="space-y-2">
                  <Label htmlFor="settings-name">Name</Label>
                  <Input
                    id="settings-name"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-desc">Description</Label>
                  <Textarea
                    id="settings-desc"
                    value={settingsDesc}
                    onChange={(e) => setSettingsDesc(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-avatar">Avatar</Label>
                  <Input
                    id="settings-avatar"
                    value={settingsAvatar}
                    onChange={(e) => setSettingsAvatar(e.target.value)}
                    placeholder="🤖"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Autonomy Level</Label>
                  <Select value={settingsAutonomy} onValueChange={setSettingsAutonomy}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supervised">Supervised</SelectItem>
                      <SelectItem value="autonomous">Autonomous</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save Settings
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="max-w-lg pt-6 border-t">
                <h3 className="text-sm font-medium text-red-500 mb-3">Danger Zone</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Archive Employee</p>
                      <p className="text-xs text-muted-foreground">Stop all tasks and set status to archived.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                      Archive
                    </Button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-3">
                    <div>
                      <p className="text-sm font-medium">Delete Employee</p>
                      <p className="text-xs text-muted-foreground">Permanently delete. This cannot be undone.</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Create Tool Dialog */}
      <Dialog open={createToolOpen} onOpenChange={setCreateToolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Tool</DialogTitle>
            <DialogDescription>
              Define a new tool for this digital employee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tool-name">Name</Label>
              <Input
                id="tool-name"
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value)}
                placeholder="my_tool"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-desc">Description (optional)</Label>
              <Input
                id="tool-desc"
                value={newToolDesc}
                onChange={(e) => setNewToolDesc(e.target.value)}
                placeholder="What does this tool do?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-code">Code</Label>
              <Textarea
                id="tool-code"
                value={newToolCode}
                onChange={(e) => setNewToolCode(e.target.value)}
                placeholder="// Tool implementation..."
                className="font-mono text-sm"
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateToolOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTool} disabled={!newToolName.trim() || !newToolCode.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive &quot;{employee.name}&quot; and stop all running tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{employee.name}&quot; and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deploy/Start Progress Dialog */}
      <Dialog open={isDeploying} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deployProgress?.status === "completed" ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : deployProgress?.status === "error" ? (
                <X className="h-5 w-5 text-red-500" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              {deployProgress?.status === "completed"
                ? "Deployment Complete"
                : deployProgress?.status === "error"
                  ? "Deployment Failed"
                  : "Deploying Employee..."}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    deployProgress?.status === "completed"
                      ? "bg-emerald-500"
                      : deployProgress?.status === "error"
                        ? "bg-red-500"
                        : "bg-primary"
                  )}
                  initial={{ width: 0 }}
                  animate={{
                    width: deployProgress
                      ? `${(deployProgress.step / deployProgress.total) * 100}%`
                      : "0%",
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {deployProgress?.message || "Initializing..."}
                </span>
                {deployProgress && deployProgress.total > 0 && (
                  <span>
                    {deployProgress.step}/{deployProgress.total}
                  </span>
                )}
              </div>
            </div>

            {/* Step list */}
            {deployProgress && deployProgress.total > 0 && (
              <div className="space-y-1.5">
                {Array.from({ length: deployProgress.total }, (_, i) => {
                  const stepNum = i + 1
                  const isDone = deployProgress.step > stepNum ||
                    (deployProgress.step === stepNum && deployProgress.status === "completed")
                  const isActive = deployProgress.step === stepNum && deployProgress.status === "in_progress"
                  const isPending = stepNum > deployProgress.step

                  return (
                    <div
                      key={stepNum}
                      className={cn(
                        "flex items-center gap-2.5 text-sm py-1 px-2 rounded transition-colors",
                        isActive && "bg-primary/5"
                      )}
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                      )}
                      <span
                        className={cn(
                          isPending && "text-muted-foreground/50",
                          isActive && "text-foreground font-medium",
                          isDone && "text-muted-foreground"
                        )}
                      >
                        {deployStepMessages[stepNum] || (isPending ? `Step ${stepNum}` : deployProgress.message)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
