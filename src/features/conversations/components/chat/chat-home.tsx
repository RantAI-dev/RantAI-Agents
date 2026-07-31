"use client"

import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  Search,
  SendHorizontal,
  Sparkles,
  Square,
} from "@/lib/icons"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { ChatInputToolbar, type CanvasMode, type ToolMode, type SkillMode } from "./chat-input-toolbar"
import { FilePreview } from "./file-preview"
import { VisionAttachmentHint } from "./vision-attachment-hint"
import { FreePlanBanner } from "@/components/free-plan-banner"
import type {
  AssistantSkillInfo,
  AssistantToolInfo,
  KBGroup,
  ChatToolbarHydrationData,
} from "./pages/chat-hydration-data"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionItem {
  id: string
  title: string
  assistantId: string
  createdAt: Date
}

interface AgentItem {
  id: string
  name: string
  description: string
  emoji: string
  model?: string
  chatConfig?: { defaultCanvasMode?: string }
  tags?: string[]
  useKnowledgeBase?: boolean
  knowledgeBaseGroupIds?: string[]
}

/** Settings collected from the toolbar to pass along with the initial message */
export interface InitialChatSettings {
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

export interface ChatHomeProps {
  sessions: SessionItem[]
  assistants: AgentItem[]
  selectedAssistantId?: string | null
  getAssistantById: (id: string) => { emoji: string; name: string } | undefined
  onSelectAssistant: (id: string) => void
  onSelectSession: (id: string) => void
  onCreateSession: (
    assistantId: string,
    initialMessage?: string,
    settings?: InitialChatSettings,
  ) => void | Promise<void>
  initialToolbarData?: ChatToolbarHydrationData | null
  /** When true, the input + create buttons disable so the user knows the session is being persisted before navigation. */
  creatingSession?: boolean
}

// ─── Home content ────────────────────────────────────────────────────────────

const HOME_HEADLINES = [
  "Let's finish your task",
  "Explore the future of AI",
  "What would you like to create?",
  "Ready when you are",
] as const

interface PromptSuggestion {
  label: string
  prompt: string
}

const DEFAULT_PROMPTS: PromptSuggestion[] = [
  {
    label: "Start a task",
    prompt: "Help me break down a task and decide the best next steps.",
  },
  {
    label: "Summarize content",
    prompt: "Summarize this content and highlight the most important points.",
  },
  {
    label: "Brainstorm ideas",
    prompt: "Help me brainstorm practical ideas for this topic.",
  },
]

function getPromptSuggestions(agent?: AgentItem): PromptSuggestion[] {
  if (!agent) return DEFAULT_PROMPTS

  const context = [
    agent.name,
    agent.description,
    ...(agent.tags ?? []),
  ].join(" ").toLowerCase()

  if (context.includes("research") || context.includes("rag")) {
    return [
      {
        label: "Research a topic",
        prompt: "Research this topic and summarize the key findings.",
      },
      {
        label: "Summarize a source",
        prompt: "Summarize this source and highlight the most important points.",
      },
      {
        label: "Compare findings",
        prompt: "Compare these findings and explain the key differences.",
      },
    ]
  }

  if (context.includes("data") || context.includes("analytic")) {
    return [
      {
        label: "Analyze my data",
        prompt: "Analyze this data and identify the most important patterns.",
      },
      {
        label: "Create a chart",
        prompt: "Recommend the clearest chart for this data and explain why.",
      },
      {
        label: "Find key insights",
        prompt: "Find the key insights, anomalies, and actionable takeaways in this data.",
      },
    ]
  }

  if (
    context.includes("write") ||
    context.includes("creative") ||
    context.includes("marketing")
  ) {
    return [
      {
        label: "Draft content",
        prompt: "Draft clear and engaging content for this topic.",
      },
      {
        label: "Improve my writing",
        prompt: "Improve this writing while preserving its original meaning and tone.",
      },
      {
        label: "Brainstorm ideas",
        prompt: "Brainstorm fresh content ideas for this audience and goal.",
      },
    ]
  }

  if (
    context.includes("code") ||
    context.includes("develop") ||
    context.includes("debug")
  ) {
    return [
      {
        label: "Debug an issue",
        prompt: "Help me diagnose this issue and identify the likely root cause.",
      },
      {
        label: "Review my code",
        prompt: "Review this code for correctness, clarity, and meaningful risks.",
      },
      {
        label: "Explain a concept",
        prompt: "Explain this technical concept with a practical example.",
      },
    ]
  }

  return DEFAULT_PROMPTS
}

// ─── Animation variants ──────────────────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 26 },
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatHome({
  sessions,
  assistants,
  selectedAssistantId,
  getAssistantById,
  onSelectAssistant,
  onSelectSession,
  onCreateSession,
  initialToolbarData,
  creatingSession = false,
}: ChatHomeProps) {
  const orgFetch = useOrgFetch()
  const { activeOrganization } = useOrganization()
  const [headline, setHeadline] = useState<string>(HOME_HEADLINES[0])
  const [clientReady, setClientReady] = useState(false)

  // Pick once when Chat Home is entered, then keep the headline still.
  // The deterministic initial value avoids a server/client hydration mismatch.
  useEffect(() => {
    const nextHeadline =
      HOME_HEADLINES[Math.floor(Math.random() * HOME_HEADLINES.length)]
    setHeadline(nextHeadline)
    setClientReady(true)
  }, [])

  // The server cannot read the locally selected assistant. Keep the first
  // render deterministic, then restore the user's selection after hydration.
  const activeAssistant = clientReady && selectedAssistantId
    ? assistants.find((assistant) => assistant.id === selectedAssistantId) ?? assistants[0]
    : assistants[0]
  const [assistantPickerOpen, setAssistantPickerOpen] = useState(false)
  const [assistantSearch, setAssistantSearch] = useState("")
  const promptSuggestions = useMemo(
    () => getPromptSuggestions(activeAssistant),
    [activeAssistant],
  )
  const filteredAssistants = useMemo(() => {
    const query = assistantSearch.trim().toLowerCase()
    if (!query) return assistants
    return assistants.filter((assistant) =>
      [assistant.name, assistant.description, ...(assistant.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
  }, [assistantSearch, assistants])

  // Input state
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Soft-autofocus the input on mount so users can start typing without
  // clicking. Skip if another element is already focused (e.g. the user
  // tabbed into the toolbar before the effect fired) so we don't steal
  // focus from intentional keyboard navigation.
  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === document.body) {
      textareaRef.current?.focus()
    }
  }, [])

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])

  // Toolbar state
  const [webSearchOverride, setWebSearchOverride] = useState<boolean | null>(null)
  const [codeInterpreterOverride, setCodeInterpreterOverride] = useState<boolean | null>(null)
  const [selectedKBGroupIds, setSelectedKBGroupIds] = useState<string[] | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>("auto")
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([])
  const [skillMode, setSkillMode] = useState<SkillMode>("auto")
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  // Seed Canvas mode from the selected agent's configured default (canvas
  // starter agents) so the first message produces their artifact; reset when
  // the user switches agents. The user can still change it in the toolbar.
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(
    (activeAssistant?.chatConfig?.defaultCanvasMode as CanvasMode | undefined) ?? false,
  )
  useEffect(() => {
    setCanvasMode((activeAssistant?.chatConfig?.defaultCanvasMode as CanvasMode | undefined) ?? false)
  }, [activeAssistant?.id, activeAssistant?.chatConfig?.defaultCanvasMode])

  const handleAssistantSelect = useCallback((assistantId: string) => {
    onSelectAssistant(assistantId)
    setAssistantPickerOpen(false)
    setAssistantSearch("")

    // Clear assistant-scoped overrides before the new defaults are loaded.
    setWebSearchOverride(null)
    setCodeInterpreterOverride(null)
    setSelectedKBGroupIds(null)
    setSelectedToolNames([])
    setSelectedSkillIds([])
    setToolMode("auto")
    setSkillMode("auto")

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [onSelectAssistant])

  // GitHub import
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")
  const [githubImporting, setGithubImporting] = useState(false)
  const { toast } = useToast()

  const handleGithubImport = useCallback(async () => {
    const url = githubUrl.trim()
    if (!url || !url.includes("github.com/")) {
      toast({ title: "Invalid URL", description: "Please enter a GitHub URL", variant: "destructive" })
      return
    }
    setGithubImporting(true)
    try {
      const res = await orgFetch("/api/chat/github-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Import failed: ${res.status}`)

      // Create a synthetic file from the imported content
      if (data.type === "inline" && data.text) {
        const file = new File([data.text], data.fileName || "github-import.txt", { type: "text/plain" })
        setAttachedFiles((prev) => [...prev, file])
      }
      setGithubDialogOpen(false)
      setGithubUrl("")
      const desc = data.fileCount === 1
        ? `${data.fileName} attached`
        : `${data.fileCount} files from ${data.fileName} attached`
      toast({ title: "Imported from GitHub", description: desc })
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Could not import from GitHub", variant: "destructive" })
    } finally {
      setGithubImporting(false)
    }
  }, [githubUrl, toast])

  // Assistant tools/skills/KB fetched for toolbar
  const [assistantTools, setAssistantTools] = useState<AssistantToolInfo[]>([])
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkillInfo[]>([])
  const [assistantDefaultToolNames, setAssistantDefaultToolNames] = useState<string[]>([])
  const [assistantDefaultSkillIds, setAssistantDefaultSkillIds] = useState<string[]>([])
  const [kbGroups, setKBGroups] = useState<KBGroup[]>([])
  const [toolbarLoadedForAssistantId, setToolbarLoadedForAssistantId] = useState<string | null>(null)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [kbGroupsLoaded, setKbGroupsLoaded] = useState(false)

  useEffect(() => {
    if (!activeAssistant?.id) {
      setToolbarLoadedForAssistantId(null)
      setAssistantDefaultToolNames([])
      setAssistantDefaultSkillIds([])
      return
    }

    if (initialToolbarData?.assistantId === activeAssistant.id) {
      const availableToolNames = new Set(
        (initialToolbarData.availableTools || []).map((tool) => tool.name)
      )
      const defaultToolNames = initialToolbarData.assistantTools
        .map((tool) => tool.name)
        .filter((name) => availableToolNames.has(name))
      const defaultSkillIds = initialToolbarData.assistantSkills.map((skill) => skill.id)
      setAssistantTools(initialToolbarData.availableTools || initialToolbarData.assistantTools)
      setAssistantSkills(initialToolbarData.availableSkills || initialToolbarData.assistantSkills)
      setAssistantDefaultToolNames(defaultToolNames)
      setAssistantDefaultSkillIds(defaultSkillIds)
      setSelectedToolNames(defaultToolNames)
      setSelectedSkillIds(defaultSkillIds)
      setToolMode(defaultToolNames.length > 0 ? "auto" : "off")
      setSkillMode(defaultSkillIds.length > 0 ? "auto" : "off")
      setKBGroups(initialToolbarData.kbGroups)
      setToolbarLoadedForAssistantId(activeAssistant.id)
      setCatalogLoaded(true)
      // If hydration has no groups, allow a client refetch once org context is ready.
      setKbGroupsLoaded(initialToolbarData.kbGroups.length > 0)
      return
    }

    setAssistantDefaultToolNames([])
    setAssistantDefaultSkillIds([])
    setToolbarLoadedForAssistantId(null)
  }, [activeAssistant?.id, initialToolbarData])

  useEffect(() => {
    // Organization can hydrate after first render. Force KB groups refresh for new org scope.
    setKbGroupsLoaded(false)
  }, [activeOrganization?.id])

  const loadToolbarData = useCallback(async () => {
    // Snapshot the active assistant id at the start so all subsequent
    // setState calls can short-circuit if the user switched assistants
    // before our fetches resolved. Without this guard, slow network
    // would race with assistant-switching and apply tool/skill state
    // from the previous assistant to the new one.
    const requestedAssistantId = activeAssistant?.id ?? null

    let visibleToolNames = new Set(assistantTools.map((tool) => tool.name))
    let toolNameById = new Map(
      assistantTools
        .filter((tool) => typeof tool.id === "string" && tool.id.length > 0)
        .map((tool) => [tool.id as string, tool.name])
    )

    if (!catalogLoaded) {
      try {
        const [allToolsRes, allSkillsRes] = await Promise.all([
          orgFetch("/api/dashboard/tools"),
          orgFetch("/api/dashboard/skills"),
        ])

        const allTools = allToolsRes.ok ? await allToolsRes.json() : []
        visibleToolNames = new Set<string>()
        toolNameById = new Map<string, string>()
        if (Array.isArray(allTools)) {
          const visibleTools = allTools
            .filter((t: { enabled?: boolean }) => t.enabled !== false)
            .map((t: { id?: string; name: string; displayName: string; description: string; category: string; icon?: string | null }) => ({
              id: t.id,
              name: t.name,
              displayName: t.displayName,
              description: t.description,
              category: t.category,
              icon: t.icon,
            }))
          for (const tool of visibleTools) {
            visibleToolNames.add(tool.name)
            if (tool.id) {
              toolNameById.set(tool.id, tool.name)
            }
          }
          setAssistantTools(visibleTools)
        } else {
          setAssistantTools([])
        }

        const allSkills = allSkillsRes.ok ? await allSkillsRes.json() : []
        setAssistantSkills(
          Array.isArray(allSkills)
            ? allSkills
                .filter((s: { enabled?: boolean }) => s.enabled !== false)
                .map((s: {
                  id: string
                  displayName: string
                  description: string
                  icon?: string | null
                  relatedToolIds?: string[]
                  metadata?: Record<string, unknown> | null
                }) => {
                  const autoToolNames = new Set<string>()
                  const addToolName = (value: unknown) => {
                    if (typeof value !== "string" || value.length === 0) return
                    autoToolNames.add(toolNameById.get(value) ?? value)
                  }
                  if (Array.isArray(s.relatedToolIds)) {
                    for (const toolId of s.relatedToolIds) {
                      const toolName = toolNameById.get(toolId)
                      if (toolName) autoToolNames.add(toolName)
                    }
                  }
                  const metadata = s.metadata
                  const attachedToolIds = Array.isArray(metadata?.toolIds) ? metadata.toolIds : []
                  for (const toolId of attachedToolIds) addToolName(toolId)
                  const requiredTools =
                    metadata &&
                    typeof metadata === "object" &&
                    !Array.isArray(metadata) &&
                    metadata.requirements &&
                    typeof metadata.requirements === "object" &&
                    !Array.isArray(metadata.requirements) &&
                    Array.isArray((metadata.requirements as { tools?: unknown }).tools)
                      ? (metadata.requirements as { tools: unknown[] }).tools
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
                  const sharedTools = Array.isArray(metadata?.sharedTools) ? metadata.sharedTools : []
                  for (const tool of sharedTools) addToolName(tool)
                  const directTools = Array.isArray(metadata?.tools) ? metadata.tools : []
                  for (const tool of directTools) addToolName(tool)

                  return {
                    id: s.id,
                    displayName: s.displayName,
                    description: s.description,
                    icon: s.icon,
                    autoToolNames: Array.from(autoToolNames),
                  }
                })
            : []
        )
        setCatalogLoaded(true)
      } catch {
        setAssistantTools([])
        setAssistantSkills([])
      }
    }

    if (activeAssistant?.id && toolbarLoadedForAssistantId !== activeAssistant.id) {
      try {
        const [boundToolsRes, boundSkillsRes] = await Promise.all([
          orgFetch(`/api/assistants/${activeAssistant.id}/tools`),
          orgFetch(`/api/assistants/${activeAssistant.id}/skills`),
        ])

        // Bail out if the user switched assistants while these fetches
        // were in flight. Applying the previous assistant's defaults to
        // the new one would silently corrupt the toolbar state.
        if (activeAssistant.id !== requestedAssistantId) return

        const boundTools = boundToolsRes.ok ? await boundToolsRes.json() : []
        if (Array.isArray(boundTools)) {
          const defaults = boundTools
            .filter((t: { enabledForAssistant?: boolean }) => t.enabledForAssistant !== false)
            .map((t: { name: string }) => t.name)
            .filter((name: string) => visibleToolNames.has(name))
          setAssistantDefaultToolNames(defaults)
          setSelectedToolNames(defaults)
          setToolMode(defaults.length > 0 ? "auto" : "off")
        } else {
          setAssistantDefaultToolNames([])
          setSelectedToolNames([])
          setToolMode("off")
        }

        const boundSkills = boundSkillsRes.ok ? await boundSkillsRes.json() : []
        if (Array.isArray(boundSkills)) {
          const defaults = boundSkills
            .filter((s: { enabled?: boolean }) => s.enabled !== false)
            .map((s: { id: string }) => s.id)
          setAssistantDefaultSkillIds(defaults)
          setSelectedSkillIds(defaults)
          setSkillMode(defaults.length > 0 ? "auto" : "off")
        } else {
          setAssistantDefaultSkillIds([])
          setSelectedSkillIds([])
          setSkillMode("off")
        }

        setToolbarLoadedForAssistantId(activeAssistant.id)
      } catch {
        setAssistantDefaultToolNames([])
        setAssistantDefaultSkillIds([])
      }
    }

    if (!kbGroupsLoaded) {
      try {
        const res = await orgFetch("/api/dashboard/files/groups")
        const data = await res.json()
        setKBGroups(data.groups || [])
      } catch {
        setKBGroups([])
      } finally {
        setKbGroupsLoaded(true)
      }
    }
  }, [activeAssistant?.id, catalogLoaded, kbGroupsLoaded, orgFetch, toolbarLoadedForAssistantId])

  // Derived toolbar values
  const webSearchAvailable = assistantTools.some((t) => t.name === "web_search")
  const effectiveWebSearch = webSearchOverride ?? webSearchAvailable
  const codeInterpreterAvailable = assistantTools.some((t) => t.name === "code_interpreter")
  const effectiveCodeInterpreter = codeInterpreterOverride ?? codeInterpreterAvailable
  const effectiveKBGroupIds = selectedKBGroupIds ?? (activeAssistant?.knowledgeBaseGroupIds || [])

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

  const handlePromptSelect = useCallback((prompt: string) => {
    setInput(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const message = input.trim()
      if (!message || !activeAssistant) return

      // Collect toolbar settings
      const settings: InitialChatSettings = {
        files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
        webSearchEnabled: effectiveWebSearch,
        codeInterpreterEnabled: effectiveCodeInterpreter,
        knowledgeBaseGroupIds: selectedKBGroupIds !== null ? selectedKBGroupIds : undefined,
        toolMode,
        selectedToolNames: toolMode === "select" ? selectedToolNames : undefined,
        skillMode,
        selectedSkillIds: skillMode === "select" ? selectedSkillIds : undefined,
        canvasMode: canvasMode || undefined,
      }

      setInput("")
      setAttachedFiles([])
      onCreateSession(activeAssistant.id, message, settings)
    },
    [input, activeAssistant, attachedFiles, effectiveWebSearch, effectiveCodeInterpreter, selectedKBGroupIds, toolMode, selectedToolNames, skillMode, selectedSkillIds, canvasMode, onCreateSession],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit],
  )

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 6),
    [sessions],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center border-b border-border/50 py-3 pl-14 pr-4">
        <h1 className="truncate font-medium">New Chat</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5">
          {/* Free-plan upsell banner (cloud; hides itself on paid/OSS) */}
          <div className="w-full pt-4">
            <FreePlanBanner />
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-center py-10 sm:py-14">
            {/* ── Visit-level greeting ─────────────────────────────────── */}
            <div className="mb-6 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {headline}
              </h2>
            </div>

            {/* ── Active assistant selector ────────────────────────────── */}
            <Popover
          open={assistantPickerOpen}
          onOpenChange={(open) => {
            setAssistantPickerOpen(open)
            if (!open) setAssistantSearch("")
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={
                activeAssistant
                  ? `Select agent. Current agent: ${activeAssistant.name}`
                  : "Select an agent"
              }
            >
              <span className="text-muted-foreground">Using</span>
              {activeAssistant ? (
                <>
                  <span aria-hidden>{activeAssistant.emoji}</span>
                  <span className="max-w-[220px] truncate font-medium text-foreground">
                    {activeAssistant.name}
                  </span>
                </>
              ) : (
                <span className="font-medium text-foreground">
                  Select an agent
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(320px,calc(100vw-2rem))] p-2" align="center">
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={assistantSearch}
                onChange={(event) => setAssistantSearch(event.target.value)}
                placeholder="Search agents..."
                aria-label="Search agents"
                className="h-9 pl-8"
              />
            </div>
            <div
              className="max-h-72 space-y-1 overflow-y-auto"
              role="listbox"
              aria-label="Available agents"
            >
              {filteredAssistants.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No agents found
                </p>
              ) : (
                filteredAssistants.map((assistant) => {
                  const selected = assistant.id === activeAssistant?.id
                  return (
                    <button
                      key={assistant.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleAssistantSelect(assistant.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "bg-muted text-foreground"
                          : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span className="text-lg" aria-hidden>{assistant.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {assistant.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {assistant.description || "No description"}
                        </span>
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
            </Popover>

            {/* ── Contextual prompt suggestions ─────────────────────────── */}
            <motion.div
          key={`prompt-suggestions-${activeAssistant?.id ?? "default"}`}
          className="scrollbar-none mb-4 mt-4 flex w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0"
          variants={stagger}
          initial="hidden"
          animate="show"
          role="group"
          aria-label={
            activeAssistant
              ? `Suggested prompts for ${activeAssistant.name}`
              : "Suggested prompts"
          }
        >
          {promptSuggestions.map((suggestion) => (
            <motion.div
              key={suggestion.label}
              className="shrink-0"
              variants={scaleIn}
            >
              <button
                type="button"
                onClick={() => handlePromptSelect(suggestion.prompt)}
                className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground/80 transition-all hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                {suggestion.label}
              </button>
            </motion.div>
          ))}
            </motion.div>
          </div>

          {/* ── Chat input ──────────────────────────────────────────── */}
          <motion.div
          className="w-full shrink-0 pb-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <form onSubmit={handleSubmit}>
            {/* File preview */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <div className="mb-2">
                  <FilePreview
                    files={attachedFiles}
                    onRemove={(index) => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                  />
                </div>
              )}
            </AnimatePresence>

            {/* Non-vision model + image attachment hint */}
            <VisionAttachmentHint
              modelId={activeAssistant?.model}
              files={attachedFiles}
              className="mb-2"
            />

            <div className="rounded-2xl border border-border/60 bg-muted/30 shadow-sm transition-all focus-within:border-foreground/20 focus-within:shadow-md focus-within:bg-muted/40">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  aria-label="Message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => void loadToolbarData()}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    creatingSession
                      ? "Creating chat..."
                      : "Ask, create, or start a task. Press Shift+Enter for a new line..."
                  }
                  disabled={creatingSession}
                  className="min-h-[52px] max-h-[200px] pr-12 resize-none !border-none !shadow-none bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-2xl rounded-b-none disabled:opacity-60 disabled:cursor-wait"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-3 bottom-2 rounded-full h-8 w-8 shadow-sm"
                  aria-label={creatingSession ? "Creating chat" : "Send message"}
                  disabled={!input.trim() || creatingSession}
                >
                  {creatingSession ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Toolbar */}
              <div className="px-2 pb-2">
                <ChatInputToolbar
                  onFileSelect={(files) => setAttachedFiles(prev => [...prev, ...files])}
                  fileAttached={attachedFiles.length > 0}
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
                  onImportGithub={() => setGithubDialogOpen(true)}
                  canvasMode={canvasMode}
                  onSetCanvasMode={setCanvasMode}
                  artifacts={new Map()}
                  activeArtifactId={null}
                  onOpenArtifact={() => {}}
                  onCloseArtifact={() => {}}
                  disabled={false}
                  onOpenToolsMenu={() => {
                    void loadToolbarData()
                  }}
                  onOpenSkillsMenu={() => {
                    void loadToolbarData()
                  }}
                  onOpenKnowledgeMenu={() => {
                    void loadToolbarData()
                  }}
                />
              </div>
            </div>
          </form>

          {/* Keyboard hints */}
          <div className="mt-2.5 hidden items-center justify-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <kbd className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">Enter</kbd>
            <span>to send</span>
            <span className="mx-0.5">·</span>
            <kbd className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">Shift+Enter</kbd>
            <span>new line</span>
            <span className="mx-0.5">·</span>
            <kbd className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">⌘K</kbd>
            <span>commands</span>
          </div>
        </motion.div>

        {/* Recent Conversations are already available in the desktop sidebar. */}
        <div className="mt-10 w-full md:hidden">
          <Section title="Recent Conversations" delay={0.3}>
              {recentSessions.length === 0 ? (
                <EmptyHint icon={MessageSquare} text="No conversations yet" />
              ) : (
                <ScrollRow>
                  {recentSessions.map((s) => {
                    const agent = getAssistantById(s.assistantId)
                    return (
                      <motion.button
                        key={s.id}
                        type="button"
                        variants={scaleIn}
                        onClick={() => onSelectSession(s.id)}
                        className="group snap-start shrink-0 w-[220px] rounded-xl border border-border/50 bg-card/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/40 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 mb-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-base shrink-0">
                            {agent?.emoji || "💬"}
                          </span>
                          <span className="text-[11px] text-muted-foreground/60 font-medium">
                            {formatDistanceToNow(s.createdAt, { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
                          {s.title}
                        </p>
                        {agent && (
                          <p className="text-xs text-muted-foreground/50 mt-1 truncate">
                            {agent.name}
                          </p>
                        )}
                      </motion.button>
                    )
                  })}
                </ScrollRow>
              )}
          </Section>
        </div>
      </div>
      </div>

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
            <Button onClick={handleGithubImport} disabled={!githubUrl.trim() || githubImporting}>
              {githubImporting ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  title,
  delay = 0,
  children,
}: {
  title: string
  delay?: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="text-xs font-medium tracking-widest uppercase text-muted-foreground/60 mb-4">
        {title}
      </h2>
      {children}
    </motion.section>
  )
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory scrollbar-none"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

function EmptyHint({
  icon: Icon,
  text,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  text: string
  href?: string
}) {
  const inner = (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-dashed border-border/40 px-5 py-4",
      href && "hover:border-primary/30 hover:bg-muted/30 transition-colors cursor-pointer",
    )}>
      <Icon className="h-4 w-4 text-muted-foreground/40" />
      <span className="text-sm text-muted-foreground/50">{text}</span>
      {href && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto" />}
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}
