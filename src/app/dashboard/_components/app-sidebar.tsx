"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { useKnowledgeBases, type KnowledgeBase } from "@/hooks/use-knowledge-bases"
import React from "react"
import { useSession, signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Blocks,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clapperboard,
  Database,
  Folder,
  FolderOpen,
  GitBranch,
  Headphones,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Network,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Store,
  Sun,
  Trash2,
  User,
  Users,
  Wrench,
  type IconComponent,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { PlanUsageBadge } from "@/components/plan-usage-badge"
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
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/branding"
import { BrandLogo } from "@/components/brand-logo"
import { useAssistants } from "@/hooks/use-assistants"
import { useWorkflows } from "@/hooks/use-workflows"
import { useDigitalEmployees } from "@/hooks/use-digital-employees"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { formatDistanceToNow, differenceInMinutes } from "date-fns"
import type { Assistant } from "@/lib/types/assistant"
import { useFeaturesContext } from "@/components/providers/features-provider"
import { useProfileStore } from "@/hooks/use-profile"
import { SETTINGS_NAV_ITEMS } from "../settings/settings-nav-items"
import { MARKETPLACE_NAV_ITEMS } from "../marketplace/marketplace-nav-items"

// ─── Types ───────────────────────────────────────────────────────────


interface AppSidebarProps {
  isOpen: boolean
  onToggle: () => void
  onSearchOpen?: () => void
  mobile?: boolean
}

type FeatureKey = "AGENT" | "DIGITAL_EMPLOYEES" | "MEDIA" | null

interface NavItem {
  title: string
  url: string
  icon: IconComponent
  feature: FeatureKey
}

// ─── Navigation Items ────────────────────────────────────────────────

// Cloud-only edition gate — mirrors settings-nav-items' cloudOnlyNavItems.
// The Design studio lives at the top-level /design route (apps/cloud) and is
// absent from OSS builds, so its nav entry only renders when edition === cloud.
const isCloudEdition = process.env.NEXT_PUBLIC_EDITION === "cloud"

const allNavItems: NavItem[] = [
  { title: "Chat", url: "/dashboard/chat", icon: MessageSquare, feature: null },
  { title: "Agent Builder", url: "/dashboard/agent-builder", icon: Blocks, feature: null },
  { title: "Workflows", url: "/dashboard/workflows", icon: GitBranch, feature: null },
  { title: "Digital Employees", url: "/dashboard/digital-employees", icon: Users, feature: "DIGITAL_EMPLOYEES" },

  { title: "Live Chat", url: "/dashboard/agent", icon: Headphones, feature: "AGENT" },
  { title: "Media Studio", url: "/dashboard/media", icon: Clapperboard, feature: "MEDIA" },
  // Cloud-only: full navigation OUT of the dashboard into the standalone studio.
  ...(isCloudEdition
    ? [{ title: "Design", url: "/design", icon: Sparkles, feature: null } as NavItem]
    : []),
  { title: "Files", url: "/dashboard/files", icon: FolderOpen, feature: null },
  { title: "Marketplace", url: "/dashboard/marketplace", icon: Store, feature: null },
]

// ─── Sections Config ─────────────────────────────────────────────────

const sections = {
  chat: { title: "Chat", subtitle: "AI Conversations", icon: MessageSquare, path: "/dashboard/chat" },
  agentBuilder: { title: "Agent Builder", subtitle: "Build & Configure", icon: Blocks, path: "/dashboard/agent-builder" },
  workflows: { title: "Workflows", subtitle: "Visual Automations", icon: GitBranch, path: "/dashboard/workflows" },
  digitalEmployees: { title: "Digital Employees", subtitle: "Autonomous Workers", icon: Users, path: "/dashboard/digital-employees" },
  groups: { title: "Teams", subtitle: "Employee Groups", icon: Network, path: "/dashboard/groups" },
  agent: { title: "Live Chat", subtitle: "Customer Support", icon: Headphones, path: "/dashboard/agent" },
  media: { title: "Media Studio", subtitle: "Generate Images & Video", icon: Clapperboard, path: "/dashboard/media" },
  knowledge: { title: "Files", subtitle: "Documents & Knowledge Bases", icon: FolderOpen, path: "/dashboard/files" },
  marketplace: { title: "Marketplace", subtitle: "Skills, Tools & More", icon: Store, path: "/dashboard/marketplace" },
  settings: { title: "Settings", subtitle: "Preferences", icon: Settings, path: "/dashboard/settings" },
  account: { title: "Account", subtitle: "Profile", icon: User, path: "/dashboard/account" },
}

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

function ThemeMenuSelector() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const currentTheme = mounted && themeOptions.some((option) => option.value === theme)
    ? theme!
    : "system"
  const currentOption = themeOptions.find((option) => option.value === currentTheme)!
  const CurrentIcon = currentOption.icon

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <CurrentIcon className="mr-2 h-4 w-4" />
        <span>Theme</span>
        <span className="ml-auto mr-2 text-xs text-muted-foreground">
          {currentOption.label}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-40" sideOffset={8}>
          <DropdownMenuRadioGroup value={currentTheme} onValueChange={setTheme}>
            {themeOptions.map((option) => {
              const Icon = option.icon
              return (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer"
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

// ─── Chat navigation ─────────────────────────────────────────────────

function ChatNavigationItem({
  active,
  onMobileNavigate,
}: {
  active: boolean
  onMobileNavigate?: () => void
}) {
  return (
    <Link
      href="/dashboard/chat"
      aria-current={active ? "page" : undefined}
      onClick={onMobileNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
        active
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground"
      )}
    >
      <MessageSquare className="h-5 w-5 shrink-0" />
      <span>Chat</span>
    </Link>
  )
}

// ─── Chat Section Content ────────────────────────────────────────────

function ChatSectionContent({
  getAssistantById,
}: {
  getAssistantById: (id: string) => Assistant | undefined
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { sessions, deleteSession } = useChatSessions()

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className="space-y-1">
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
                  aria-label={`Delete chat ${session.title}`}
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

export function AppSidebar({ isOpen, onToggle, onSearchOpen, mobile = false }: AppSidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAgentEnabled, isDigitalEmployeesEnabled, isMediaEnabled } = useFeaturesContext()

  const { avatarUrl, fetchProfile } = useProfileStore()

  React.useEffect(() => { fetchProfile() }, [fetchProfile])

  // Filter nav items based on enabled features
  const mainNavItems = allNavItems.filter((item) => {
    if (item.feature === "AGENT") return isAgentEnabled
    if (item.feature === "DIGITAL_EMPLOYEES") return isDigitalEmployeesEnabled
    if (item.feature === "MEDIA") return isMediaEnabled
    return true
  })

  // Platform administration — only for role=ADMIN (superadmin) accounts.
  if (session?.user?.role === "ADMIN") {
    mainNavItems.push({ title: "Admin", url: "/dashboard/admin", icon: Shield, feature: null })
  }

  // Knowledge Base state — fetch + auto-refresh on `knowledge-bases-updated`
  // events is owned by the shared hook so the Agent Builder Knowledge tab and
  // any future consumer stay byte-identical with what the sidebar shows.
  const { knowledgeBases, totalDocumentCount } = useKnowledgeBases()
  const [selectedKBId, setSelectedKBId] = useState<string | null>(null)

  useEffect(() => {
    const kbId = searchParams.get("kb")
    setSelectedKBId(kbId)
  }, [searchParams])

  const handleSelectKB = (kbId: string | null) => {
    setSelectedKBId(kbId)
    if (kbId) {
      router.push(`/dashboard/files?kb=${kbId}`)
    } else {
      router.push("/dashboard/files")
    }
  }

  const { toast: sidebarToast } = useToast()

  // Assistant management
  const {
    assistants, getAssistantById,
    missingSelection, acknowledgeMissingSelection,
  } = useAssistants()

  // Surface "your assistant disappeared" instead of silently snapping. Common
  // causes: another teammate deleted the agent, org switch revoked access,
  // local cache holds an id that no longer exists server-side.
  useEffect(() => {
    if (!missingSelection) return
    const fallbackName = missingSelection.fallbackId
      ? getAssistantById(missingSelection.fallbackId)?.name ?? null
      : null
    sidebarToast({
      title: "Selected assistant unavailable",
      description: fallbackName
        ? `Switched to "${fallbackName}". The previous assistant may have been removed or moved out of this organization.`
        : "The previous assistant may have been removed or moved out of this organization.",
      variant: "default",
    })
    acknowledgeMissingSelection()
  }, [missingSelection, getAssistantById, sidebarToast, acknowledgeMissingSelection])

  const { workflows } = useWorkflows()

  // Only load digital employees when feature is enabled
  const { employees: digitalEmployees, fetchEmployees: refreshEmployees } = useDigitalEmployees()

  // Auto-refresh employee list when navigating back to sidebar or after creation
  useEffect(() => {
    // Only refresh when feature is enabled
    if (isDigitalEmployeesEnabled) {
      refreshEmployees()
    }
  }, [pathname, isDigitalEmployeesEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Current section detection
  const getCurrentSection = () => {
    if (pathname.startsWith("/dashboard/chat")) return sections.chat
    if (pathname.startsWith("/dashboard/agent-builder")) return sections.agentBuilder
    if (pathname.startsWith("/dashboard/workflows")) return sections.workflows
    // Skip digital employees section if feature is disabled
    if (isDigitalEmployeesEnabled && pathname.startsWith("/dashboard/digital-employees")) return sections.digitalEmployees
    if (isDigitalEmployeesEnabled && pathname.startsWith("/dashboard/groups")) return sections.digitalEmployees
    if (pathname.startsWith("/dashboard/agent")) return sections.agent
    if (pathname.startsWith("/dashboard/media")) return sections.media
    if (pathname.startsWith("/dashboard/files")) return sections.knowledge
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

  // ─── Collapsed Sidebar (icon-only) ─────────────────────────────────

  if (!isOpen) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col h-full w-[56px] bg-sidebar border-r border-sidebar-border transition-all duration-200">
          {/* Logo — click to expand sidebar */}
          <div className="flex items-center justify-center py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="group/logo relative flex items-center justify-center w-8 h-8 rounded-lg"
                  aria-label="Expand sidebar"
                >
                  <BrandLogo className="h-8 w-8 rounded-lg transition-opacity group-hover/logo:opacity-0" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-sidebar-hover opacity-0 transition-opacity group-hover/logo:opacity-100">
                    <ChevronsRight className="h-4 w-4 text-sidebar-foreground" />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>

          {/* Search icon */}
          <div className="flex items-center justify-center pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onSearchOpen}
                  className="flex items-center justify-center w-10 h-10 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                  aria-label="Search"
                >
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
                      aria-label={item.title}
                      aria-current={active ? "page" : undefined}
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
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <ThemeMenuSelector />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  variant="destructive"
                  className="cursor-pointer"
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
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          mobile ? "w-full" : "w-[260px]"
        )}
      >
        {/* Collapse button — on the sidebar border edge */}
        {!mobile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="absolute -right-3 top-4 z-50 flex items-center justify-center w-6 h-6 rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover shadow-sm transition-all"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        )}

        {/* Header: Logo + title */}
        <div className={cn("border-b border-sidebar-border p-3", mobile && "pr-12")}>
          <Link href="/dashboard/chat" className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-sidebar-foreground">{brand.productName}</span>
          </Link>
        </div>

      {/* Primary Navigation */}
      <nav className="px-2 space-y-0.5">
        {/* Search */}
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
        >
          <Search className="h-5 w-5" />
          <span>Search</span>
        </button>
        {mainNavItems.map((item) => {
          const active = isActive(item.url)
          if (item.url === "/dashboard/chat") {
            return (
              <ChatNavigationItem
                key={item.url}
                active={active}
                onMobileNavigate={mobile ? onToggle : undefined}
              />
            )
          }

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
        {currentSection !== sections.chat && (
          <div className="shrink-0">
            <div className="px-2 py-1.5 mb-2">
              <h3 className="text-sm font-medium text-sidebar-foreground">{currentSection.title}</h3>
              <p className="text-xs text-sidebar-muted">{currentSection.subtitle}</p>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {currentSection === sections.chat && (
            <ChatSectionContent
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
                  selectedKBId === null && pathname === "/dashboard/files"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                )}
                onClick={() => handleSelectKB(null)}
              >
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                    "transition-all duration-150 ease-in-out",
                    selectedKBId === null && pathname === "/dashboard/files"
                      ? "h-8 opacity-100"
                      : "h-2 opacity-0 group-hover:h-5 group-hover:opacity-100"
                  )}
                />
                <Database className="h-4 w-4" />
                <span className="flex-1">All Documents</span>
                <span className="text-xs text-sidebar-muted">
                  {totalDocumentCount}
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
                href="/dashboard/files?action=new-kb"
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

          {isDigitalEmployeesEnabled && currentSection === sections.digitalEmployees && (
            <div className="space-y-1">
              {[...digitalEmployees]
                .sort((a, b) => {
                  const order: Record<string, number> = { ACTIVE: 0, PAUSED: 1, DRAFT: 2, ONBOARDING: 3, SUSPENDED: 4, ARCHIVED: 5 }
                  const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9)
                  if (diff !== 0) return diff
                  // Within ACTIVE, sort by most recently active
                  if (a.status === "ACTIVE" && b.status === "ACTIVE") {
                    const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
                    const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
                    return bTime - aTime
                  }
                  return 0
                })
                .map((emp) => {
                  const isRecent = emp.lastActiveAt && differenceInMinutes(new Date(), new Date(emp.lastActiveAt)) < 5
                  const activityText = emp.status === "ACTIVE"
                    ? (isRecent ? "Active now" : emp.lastActiveAt ? `Idle ${formatDistanceToNow(new Date(emp.lastActiveAt))}` : "Active")
                    : emp.status === "PAUSED" ? "Paused"
                    : emp.status === "DRAFT" ? "Draft"
                    : emp.status.charAt(0) + emp.status.slice(1).toLowerCase()

                  return (
                    <Link
                      key={emp.id}
                      href={`/dashboard/digital-employees/${emp.id}`}
                      className={cn(
                        "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                        pathname === `/dashboard/digital-employees/${emp.id}`
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                      )}
                    >
                      <div className="relative">
                        {emp.avatar ? (
                          <span className="text-base leading-none">{emp.avatar}</span>
                        ) : (
                          <Bot className="h-4 w-4 shrink-0" />
                        )}
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar",
                          emp.status === "ACTIVE" && isRecent && "bg-chart-2 animate-pulse",
                          emp.status === "ACTIVE" && !isRecent && "bg-chart-2",
                          emp.status === "PAUSED" && "bg-chart-4",
                          emp.status === "SUSPENDED" && "bg-destructive",
                          !["ACTIVE", "PAUSED", "SUSPENDED"].includes(emp.status) && "bg-sidebar-muted",
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block truncate font-medium">{emp.name}</span>
                        <span className="block text-[10px] text-sidebar-muted truncate">{activityText}</span>
                      </div>
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

      {/* Free-plan usage + upgrade (cloud; hides on paid/OSS) */}
      <PlanUsageBadge />

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
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <ThemeMenuSelector />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              variant="destructive"
              className="cursor-pointer"
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
