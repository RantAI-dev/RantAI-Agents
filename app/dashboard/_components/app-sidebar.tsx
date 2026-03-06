"use client"

import { useState, useEffect, useCallback } from "react"
import React from "react"
import { useSession, signOut } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  MessageSquare,
  Blocks,
  GitBranch,
  Headphones,
  BookOpen,
  Store,
  Settings,
  Bell,
  Search,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  Star,
  Wrench,
  User,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Bot,
  Users,
  type IconComponent,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/branding"
import { useAssistants } from "@/hooks/use-assistants"
import { useWorkflows } from "@/hooks/use-workflows"
import { useDigitalEmployees } from "@/hooks/use-digital-employees"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { AssistantEditor } from "@/app/dashboard/_components/chat/assistant-editor"
import { formatDistanceToNow } from "date-fns"
import type { Assistant, AssistantInput } from "@/lib/types/assistant"
import { useFeaturesContext } from "@/components/providers/features-provider"
import { useProfileStore } from "@/hooks/use-profile"
import { SETTINGS_NAV_ITEMS } from "../settings/settings-nav-items"
import { MARKETPLACE_NAV_ITEMS } from "../marketplace/marketplace-nav-items"

// ─── Types ───────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface AppSidebarProps {
  isOpen: boolean
  onToggle: () => void
}

type FeatureKey = "AGENT" | null

interface NavItem {
  title: string
  url: string
  icon: IconComponent
  feature: FeatureKey
}

// ─── Navigation Items ────────────────────────────────────────────────

const allNavItems: NavItem[] = [
  { title: "Chat", url: "/dashboard/chat", icon: MessageSquare, feature: null },
  { title: "Agent Builder", url: "/dashboard/agent-builder", icon: Blocks, feature: null },
  { title: "Workflows", url: "/dashboard/workflows", icon: GitBranch, feature: null },
  { title: "Digital Employees", url: "/dashboard/digital-employees", icon: Users, feature: null },
  { title: "Live Chat", url: "/dashboard/agent", icon: Headphones, feature: "AGENT" },
  { title: "Knowledge", url: "/dashboard/knowledge", icon: BookOpen, feature: null },
  { title: "Marketplace", url: "/dashboard/marketplace", icon: Store, feature: null },
]

// ─── Sections Config ─────────────────────────────────────────────────

const sections = {
  chat: { title: "Chat", subtitle: "AI Conversations", icon: MessageSquare, path: "/dashboard/chat" },
  agentBuilder: { title: "Agent Builder", subtitle: "Build & Configure", icon: Blocks, path: "/dashboard/agent-builder" },
  workflows: { title: "Workflows", subtitle: "Visual Automations", icon: GitBranch, path: "/dashboard/workflows" },
  digitalEmployees: { title: "Digital Employees", subtitle: "Autonomous Workers", icon: Users, path: "/dashboard/digital-employees" },
  agent: { title: "Live Chat", subtitle: "Customer Support", icon: Headphones, path: "/dashboard/agent" },
  knowledge: { title: "Knowledge", subtitle: "RAG Documents", icon: BookOpen, path: "/dashboard/knowledge" },
  marketplace: { title: "Marketplace", subtitle: "Skills, Tools & More", icon: Store, path: "/dashboard/marketplace" },
  settings: { title: "Settings", subtitle: "Preferences", icon: Settings, path: "/dashboard/settings" },
  account: { title: "Account", subtitle: "Profile", icon: User, path: "/dashboard/account" },
}

// ─── Assistant Selector Header ───────────────────────────────────────

function AssistantSelectorHeader({
  assistants,
  selectedAssistant,
  onSelectAssistant,
  onCreateAssistant,
  onEditAssistant,
}: {
  assistants: Assistant[]
  selectedAssistant: Assistant | undefined
  onSelectAssistant: (assistant: Assistant) => void
  onCreateAssistant: () => void
  onEditAssistant: (assistant: Assistant) => void
}) {
  const [open, setOpen] = useState(false)
  const { assistant: defaultAssistant } = useDefaultAssistant()

  if (!selectedAssistant) {
    return (
      <div className="px-2 py-1.5 mb-2">
        <h3 className="text-sm font-medium text-sidebar-foreground">Chat</h3>
        <p className="text-xs text-sidebar-muted">Loading assistants...</p>
      </div>
    )
  }

  return (
    <div className="px-2 py-1.5 mb-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full flex items-center gap-2 hover:bg-sidebar-hover rounded-lg p-1 -m-1 transition-colors">
            <span className="text-xl">{selectedAssistant.emoji}</span>
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-sidebar-foreground truncate">
                  {selectedAssistant.name}
                </h3>
                {defaultAssistant?.id === selectedAssistant.id && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 gap-0.5 shrink-0">
                    <Star className="h-2 w-2" />
                  </Badge>
                )}
              </div>
              <p className="text-xs text-sidebar-muted truncate">{selectedAssistant.description}</p>
            </div>
            <ChevronDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start" side="bottom">
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {assistants.map((assistant) => {
              const isSelected = selectedAssistant.id === assistant.id
              const isDefault = defaultAssistant?.id === assistant.id
              return (
                <div
                  key={assistant.id}
                  className={cn(
                    "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all",
                    isSelected ? "bg-sidebar-accent" : "hover:bg-sidebar-hover"
                  )}
                  onClick={() => { onSelectAssistant(assistant); setOpen(false) }}
                >
                  <span className="text-lg shrink-0">{assistant.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{assistant.name}</span>
                      {isDefault && <Star className="h-3 w-3" />}
                      {assistant.useKnowledgeBase && <Database className="h-3 w-3" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{assistant.description}</p>
                  </div>
                  {assistant.isEditable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onEditAssistant(assistant); setOpen(false) }}
                      aria-label={`Edit ${assistant.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => { onCreateAssistant(); setOpen(false) }}
            >
              <Plus className="h-4 w-4" />
              New Assistant
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Chat Section Content ────────────────────────────────────────────

function ChatSectionContent({
  assistants,
  selectedAssistant,
  onSelectAssistant,
  onCreateAssistant,
  onEditAssistant,
  getAssistantById,
}: {
  assistants: Assistant[]
  selectedAssistant: Assistant
  onSelectAssistant: (assistant: Assistant) => void
  onCreateAssistant: () => void
  onEditAssistant: (assistant: Assistant) => void
  getAssistantById: (id: string) => Assistant | undefined
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { sessions, createSession, deleteSession } = useChatSessions()

  const handleNewChat = async () => {
    if (selectedAssistant) {
      const newSession = await createSession(selectedAssistant.id)
      const urlId = newSession.dbId || newSession.id
      router.push(`/dashboard/chat/${urlId}`)
    }
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div className="space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-hover mb-2"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-hover mb-2"
        onClick={handleNewChat}
      >
        <Plus className="h-4 w-4" />
        New Chat
      </Button>

      {sessions.length > 0 && (
        <div className="space-y-1">
          <p className="px-3 py-1 text-xs font-medium text-sidebar-muted uppercase tracking-wider">
            Recent Chats
          </p>
          {sessions.map((session) => {
            const sessionAssistant = getAssistantById(session.assistantId)
            const sessionUrlId = session.dbId || session.id
            const isActive = pathname === `/dashboard/chat/${sessionUrlId}`
            return (
              <div
                key={session.id}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                )}
                onClick={() => router.push(`/dashboard/chat/${sessionUrlId}`)}
              >
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                    "transition-all duration-150 ease-in-out",
                    isActive
                      ? "h-8 opacity-100"
                      : "h-2 opacity-0 group-hover:h-5 group-hover:opacity-100"
                  )}
                />
                <span className="text-base shrink-0">{sessionAssistant?.emoji || "💬"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{session.title}</p>
                  <p className="text-xs text-sidebar-muted truncate">
                    {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-hover"
                  onClick={(e) => {
                    e.stopPropagation()
                    const wasActive = isActive
                    deleteSession(session.id)
                    if (wasActive) router.push("/dashboard/chat")
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Sidebar Component ──────────────────────────────────────────

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const { isAgentEnabled } = useFeaturesContext()

  const { avatarUrl, fetchProfile } = useProfileStore()

  React.useEffect(() => { fetchProfile() }, [fetchProfile])

  // Filter nav items based on enabled features
  const mainNavItems = allNavItems.filter((item) => {
    if (item.feature === "AGENT") return isAgentEnabled
    return true
  })

  // Knowledge Base state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKBId, setSelectedKBId] = useState<string | null>(null)

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/knowledge/groups")
      if (response.ok) {
        const data = await response.json()
        setKnowledgeBases(data.groups)
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }, [])

  useEffect(() => {
    fetchKnowledgeBases()
    const handleUpdate = () => fetchKnowledgeBases()
    window.addEventListener("knowledge-bases-updated", handleUpdate)
    return () => window.removeEventListener("knowledge-bases-updated", handleUpdate)
  }, [fetchKnowledgeBases])

  useEffect(() => {
    const kbId = searchParams.get("kb")
    setSelectedKBId(kbId)
  }, [searchParams])

  const handleSelectKB = (kbId: string | null) => {
    setSelectedKBId(kbId)
    if (kbId) {
      router.push(`/dashboard/knowledge?kb=${kbId}`)
    } else {
      router.push("/dashboard/knowledge")
    }
  }

  // Assistant management
  const {
    assistants, selectedAssistant, selectAssistant,
    addAssistant, updateAssistant, deleteAssistant, getAssistantById,
  } = useAssistants()

  const { assistant: defaultAssistant } = useDefaultAssistant()
  const { workflows } = useWorkflows()
  const { employees: digitalEmployees } = useDigitalEmployees()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null)

  const handleSelectAssistant = (assistant: Assistant) => selectAssistant(assistant.id)
  const handleCreateAssistant = () => { setEditingAssistant(null); setEditorOpen(true) }
  const handleEditAssistant = (assistant: Assistant) => { setEditingAssistant(assistant); setEditorOpen(true) }

  const handleSaveAssistant = async (input: AssistantInput) => {
    if (editingAssistant) {
      await updateAssistant(editingAssistant.id, input)
    } else {
      const newAssistant = await addAssistant(input)
      if (newAssistant) selectAssistant(newAssistant.id)
    }
  }

  const handleDeleteAssistant = (id: string) => deleteAssistant(id)

  // Current section detection
  const getCurrentSection = () => {
    if (pathname.startsWith("/dashboard/chat")) return sections.chat
    if (pathname.startsWith("/dashboard/agent-builder")) return sections.agentBuilder
    if (pathname.startsWith("/dashboard/workflows")) return sections.workflows
    if (pathname.startsWith("/dashboard/digital-employees")) return sections.digitalEmployees
    if (pathname.startsWith("/dashboard/agent")) return sections.agent
    if (pathname.startsWith("/dashboard/knowledge")) return sections.knowledge
    if (pathname.startsWith("/dashboard/marketplace")) return sections.marketplace
    if (pathname.startsWith("/dashboard/settings")) return sections.settings
    if (pathname.startsWith("/dashboard/account")) return sections.account
    return sections.chat
  }

  const currentSection = getCurrentSection()

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/")

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  // Keyboard shortcut: Cmd/Ctrl+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onToggle])

  // ─── Collapsed Sidebar (icon-only) ─────────────────────────────────

  if (!isOpen) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col h-full w-[56px] bg-sidebar border-r border-sidebar-border transition-all duration-200">
          {/* Logo */}
          <div className="flex items-center justify-center py-3">
            <Link href="/dashboard/chat">
              <img
                src={brand.logoMain}
                alt={brand.productName}
                className="h-8 w-8 rounded-lg"
              />
            </Link>
          </div>

          {/* Toggle button */}
          <div className="flex items-center justify-center pb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                  aria-label="Expand sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>

          {/* Search icon */}
          <div className="flex items-center justify-center pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center justify-center w-10 h-10 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all">
                  <Search className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search</TooltipContent>
            </Tooltip>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 flex flex-col items-center gap-1 py-2">
            {mainNavItems.map((item) => {
              const active = isActive(item.url)
              return (
                <Tooltip key={item.url}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.url}
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                        active
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              )
            })}
          </nav>

          {/* Bottom: Settings + Notifications */}
          <div className="flex flex-col items-center gap-1 py-2 border-t border-sidebar-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dashboard/settings"
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                    isActive("/dashboard/settings")
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <Settings className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center justify-center w-10 h-10 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all">
                  <Bell className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Notifications</TooltipContent>
            </Tooltip>
          </div>

          {/* User Avatar */}
          <div className="flex items-center justify-center py-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md" aria-label="User menu">
                  <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-sidebar-ring transition-all">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={session?.user?.name || "User"} />}
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium">{session?.user?.name || "Agent"}</p>
                  <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/account" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // ─── Expanded Sidebar ──────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-[260px] bg-sidebar border-r border-sidebar-border transition-all duration-200">
      {/* Header: Logo + toggle */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/chat" className="flex items-center gap-2">
            <img
              src={brand.logoMain}
              alt={brand.productName}
              className="h-8 w-8 rounded-lg"
            />
            <span className="font-semibold text-sidebar-foreground">{brand.productName}</span>
          </Link>
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-sidebar-hover border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-muted"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-muted">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav className="px-2 space-y-0.5">
        {mainNavItems.map((item) => {
          const active = isActive(item.url)
          return (
            <Link
              key={item.url}
              href={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.title}</span>
            </Link>
          )
        })}
      </nav>

      {/* Contextual Panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-2 mt-2 border-t border-sidebar-border">
        {/* Section Header */}
        <div className="shrink-0">
          {currentSection === sections.chat ? (
            <AssistantSelectorHeader
              assistants={assistants}
              selectedAssistant={selectedAssistant}
              onSelectAssistant={handleSelectAssistant}
              onCreateAssistant={handleCreateAssistant}
              onEditAssistant={handleEditAssistant}
            />
          ) : (
            <div className="px-2 py-1.5 mb-2">
              <h3 className="text-sm font-medium text-sidebar-foreground">{currentSection.title}</h3>
              <p className="text-xs text-sidebar-muted">{currentSection.subtitle}</p>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {currentSection === sections.chat && (
            <ChatSectionContent
              assistants={assistants}
              selectedAssistant={selectedAssistant}
              onSelectAssistant={handleSelectAssistant}
              onCreateAssistant={handleCreateAssistant}
              onEditAssistant={handleEditAssistant}
              getAssistantById={getAssistantById}
            />
          )}

          {currentSection === sections.agent && (
            <div className="space-y-1">
              <div className="px-3 py-2 rounded-lg bg-sidebar-hover">
                <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
                  <div className="h-2 w-2 rounded-full bg-chart-2" />
                  <span>Queue Status</span>
                </div>
                <p className="text-xs text-sidebar-muted mt-1">Ready for customers</p>
              </div>
            </div>
          )}

          {currentSection === sections.knowledge && (
            <div className="space-y-1">
              <div
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer",
                  selectedKBId === null && pathname === "/dashboard/knowledge"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                )}
                onClick={() => handleSelectKB(null)}
              >
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                    "transition-all duration-150 ease-in-out",
                    selectedKBId === null && pathname === "/dashboard/knowledge"
                      ? "h-8 opacity-100"
                      : "h-2 opacity-0 group-hover:h-5 group-hover:opacity-100"
                  )}
                />
                <Database className="h-4 w-4" />
                <span className="flex-1">All Documents</span>
                <span className="text-xs text-sidebar-muted">
                  {knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0)}
                </span>
              </div>

              {knowledgeBases.map((kb) => {
                const isSelected = selectedKBId === kb.id
                return (
                  <div
                    key={kb.id}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer",
                      isSelected
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                    onClick={() => handleSelectKB(kb.id)}
                  >
                    <div
                      className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm",
                        "transition-all duration-150 ease-in-out",
                        isSelected
                          ? "h-8 opacity-100"
                          : "h-2 opacity-0 group-hover:h-5 group-hover:opacity-100"
                      )}
                      style={{ backgroundColor: kb.color ?? "var(--chart-3)" }}
                    />
                    <div
                      className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: kb.color ?? "var(--chart-3)" }}
                    >
                      <Folder className="h-2.5 w-2.5" />
                    </div>
                    <span className="flex-1 truncate">{kb.name}</span>
                    <span className="text-xs text-sidebar-muted">{kb.documentCount}</span>
                  </div>
                )
              })}

              <Link
                href="/dashboard/knowledge?action=new-kb"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>New Knowledge Base</span>
              </Link>
            </div>
          )}

          {currentSection === sections.agentBuilder && (
            <div className="space-y-1">
              {assistants.map((assistant) => (
                <Link
                  key={assistant.id}
                  href={`/dashboard/agent-builder/${assistant.id}`}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    pathname === `/dashboard/agent-builder/${assistant.id}`
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <span className="text-lg">{assistant.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{assistant.name}</span>
                      {assistant.useKnowledgeBase && <Database className="h-3 w-3" />}
                      {(assistant.toolCount ?? 0) > 0 && <Wrench className="h-3 w-3" />}
                    </div>
                  </div>
                </Link>
              ))}
              <Link
                href="/dashboard/agent-builder/new"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Create Agent</span>
              </Link>
            </div>
          )}

          {currentSection === sections.workflows && (
            <div className="space-y-1">
              {workflows.map((workflow) => (
                <Link
                  key={workflow.id}
                  href={`/dashboard/workflows/${workflow.id}`}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    pathname === `/dashboard/workflows/${workflow.id}`
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <GitBranch className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{workflow.name}</span>
                </Link>
              ))}
              <Link
                href="/dashboard/workflows"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>New Workflow</span>
              </Link>
            </div>
          )}

          {currentSection === sections.digitalEmployees && (
            <div className="space-y-1">
              {digitalEmployees.map((emp) => {
                const statusColors: Record<string, string> = {
                  ACTIVE: "bg-chart-2",
                  PAUSED: "bg-chart-4",
                  DRAFT: "bg-sidebar-muted",
                  SUSPENDED: "bg-destructive",
                }
                return (
                  <Link
                    key={emp.id}
                    href={`/dashboard/digital-employees/${emp.id}`}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                      pathname === `/dashboard/digital-employees/${emp.id}`
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                  >
                    <div className="relative">
                      <Bot className="h-4 w-4 shrink-0" />
                      <div className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar", statusColors[emp.status] || "bg-sidebar-muted")} />
                    </div>
                    <span className="flex-1 truncate font-medium">{emp.name}</span>
                  </Link>
                )
              })}
              <Link
                href="/dashboard/digital-employees/new"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>New Employee</span>
              </Link>
            </div>
          )}

          {currentSection === sections.marketplace && (
            <div className="space-y-1 overflow-y-auto">
              {MARKETPLACE_NAV_ITEMS.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.title}</span>
                    {active && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />}
                  </Link>
                )
              })}
            </div>
          )}

          {currentSection === sections.settings && (
            <div className="space-y-1 overflow-y-auto">
              {SETTINGS_NAV_ITEMS.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.title}</span>
                    {active && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Settings + Notifications */}
      <div className="px-2 py-2 border-t border-sidebar-border space-y-0.5">
        <Link
          href="/dashboard/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
            isActive("/dashboard/settings")
              ? "bg-sidebar-accent text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
          )}
        >
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </Link>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
        >
          <Bell className="h-5 w-5" />
          <span>Notifications</span>
        </button>
      </div>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-sidebar-hover transition-colors focus:outline-none" aria-label="User menu">
              <Avatar className="h-8 w-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={session?.user?.name || "User"} />}
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left" suppressHydrationWarning>
                <p className="text-sm font-medium text-sidebar-foreground truncate" suppressHydrationWarning>
                  {session?.user?.name || "Agent"}
                </p>
                <p className="text-xs text-sidebar-muted truncate" suppressHydrationWarning>
                  {session?.user?.email}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-muted shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/account" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Assistant Editor Dialog */}
      <AssistantEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        assistant={editingAssistant}
        onSave={handleSaveAssistant}
        onDelete={handleDeleteAssistant}
      />
    </div>
  )
}
