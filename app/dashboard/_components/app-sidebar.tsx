"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Search,
  Plus,
  MessageSquare,
  Headphones,
  BookOpen,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Database,
  Pencil,
  Folder,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAssistants } from "@/hooks/use-assistants"
import { AssistantEditor } from "@/app/dashboard/chat/_components/assistant-editor"
import type { Assistant, AssistantInput } from "@/lib/types/assistant"

interface KnowledgeBase {
  id: string
  name: string
  color: string | null
  documentCount: number
}

interface AppSidebarProps {
  isOpen: boolean
}

// Navigation sections with their content panels
const sections = {
  chat: {
    title: "Chat",
    subtitle: "AI Conversations",
    icon: MessageSquare,
    path: "/dashboard/chat",
  },
  agent: {
    title: "Agent",
    subtitle: "Customer Support",
    icon: Headphones,
    path: "/dashboard/agent",
  },
  knowledge: {
    title: "Knowledge",
    subtitle: "RAG Documents",
    icon: BookOpen,
    path: "/dashboard/knowledge",
  },
  dashboard: {
    title: "Dashboard",
    subtitle: "Overview",
    icon: LayoutDashboard,
    path: "/dashboard",
    exact: true,
  },
  settings: {
    title: "Settings",
    subtitle: "Preferences",
    icon: Settings,
    path: "/dashboard/settings",
  },
  account: {
    title: "Account",
    subtitle: "Profile",
    icon: null,
    path: "/dashboard/account",
  },
}

export function AppSidebar({ isOpen }: AppSidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")

  // Knowledge Base state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKBId, setSelectedKBId] = useState<string | null>(null)

  // Fetch knowledge bases
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

    // Listen for updates from the knowledge page
    const handleUpdate = () => fetchKnowledgeBases()
    window.addEventListener("knowledge-bases-updated", handleUpdate)
    return () => window.removeEventListener("knowledge-bases-updated", handleUpdate)
  }, [fetchKnowledgeBases])

  // Sync selectedKBId with URL
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
    assistants,
    selectedAssistant,
    selectAssistant,
    addAssistant,
    updateAssistant,
    deleteAssistant,
  } = useAssistants()

  // Assistant editor dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null)

  const handleSelectAssistant = (assistant: Assistant) => {
    selectAssistant(assistant.id)
  }

  const handleCreateAssistant = () => {
    setEditingAssistant(null)
    setEditorOpen(true)
  }

  const handleEditAssistant = (assistant: Assistant) => {
    setEditingAssistant(assistant)
    setEditorOpen(true)
  }

  const handleSaveAssistant = (input: AssistantInput) => {
    if (editingAssistant) {
      updateAssistant(editingAssistant.id, input)
    } else {
      const newAssistant = addAssistant(input)
      selectAssistant(newAssistant.id)
    }
  }

  const handleDeleteAssistant = (id: string) => {
    deleteAssistant(id)
  }

  // Determine current section based on pathname
  const getCurrentSection = () => {
    if (pathname.startsWith("/dashboard/chat")) return sections.chat
    if (pathname.startsWith("/dashboard/agent")) return sections.agent
    if (pathname.startsWith("/dashboard/knowledge")) return sections.knowledge
    if (pathname.startsWith("/dashboard/settings")) return sections.settings
    if (pathname.startsWith("/dashboard/account")) return sections.account
    if (pathname === "/dashboard") return sections.dashboard
    return sections.dashboard
  }

  const currentSection = getCurrentSection()

  if (!isOpen) {
    return null
  }

  return (
    <div className="flex flex-col h-full w-[260px] bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center p-3 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img
            src="/logo/logo-rantai.png"
            alt="RantAI Agents"
            className="h-8 w-8 rounded-lg"
          />
          <span className="font-semibold text-sidebar-foreground">RantAI Agents</span>
        </Link>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-muted" />
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

      {/* Current Section Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* Section Header */}
        <div className="px-2 py-1.5 mb-2">
          <h3 className="text-sm font-medium text-sidebar-foreground">{currentSection.title}</h3>
          <p className="text-xs text-sidebar-muted">{currentSection.subtitle}</p>
        </div>

        {/* Quick Actions based on section */}
        {currentSection === sections.chat && (
          <div className="space-y-1">
            {/* Assistant List */}
            {assistants.map((assistant) => {
              const isSelected = selectedAssistant.id === assistant.id
              return (
                <div
                  key={assistant.id}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer",
                    isSelected
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                  onClick={() => handleSelectAssistant(assistant)}
                >
                  {/* Selection indicator */}
                  <div
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                      "transition-all duration-150 ease-in-out",
                      isSelected
                        ? "h-8 opacity-100"
                        : "h-2 opacity-0 group-hover:h-5 group-hover:opacity-100"
                    )}
                  />
                  <span className="text-lg">{assistant.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{assistant.name}</span>
                      {assistant.useKnowledgeBase && (
                        <Database className="h-3 w-3 text-sidebar-muted shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-sidebar-muted truncate">{assistant.description}</p>
                  </div>
                  {assistant.isEditable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditAssistant(assistant)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}

            {/* Add New Assistant */}
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
              onClick={handleCreateAssistant}
            >
              <Plus className="h-4 w-4" />
              New Assistant
            </Button>
          </div>
        )}

        {currentSection === sections.agent && (
          <div className="space-y-1">
            <div className="px-3 py-2 rounded-lg bg-sidebar-hover">
              <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <span>Queue Status</span>
              </div>
              <p className="text-xs text-sidebar-muted mt-1">Ready for customers</p>
            </div>
          </div>
        )}

        {currentSection === sections.knowledge && (
          <div className="space-y-1">
            {/* All Documents */}
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

            {/* Knowledge Bases List */}
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
                    style={{ backgroundColor: kb.color || "#3b82f6" }}
                  />
                  <div
                    className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: kb.color || "#3b82f6" }}
                  >
                    <Folder className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="flex-1 truncate">{kb.name}</span>
                  <span className="text-xs text-sidebar-muted">{kb.documentCount}</span>
                </div>
              )
            })}

            {/* Add New Knowledge Base - links to the page where KB creation happens */}
            <Link
              href="/dashboard/knowledge?action=new-kb"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>New Knowledge Base</span>
            </Link>
          </div>
        )}

        {currentSection === sections.settings && (
          <div className="space-y-1">
            {["General", "Channels", "About"].map((item) => {
              const href = `/dashboard/settings/${item.toLowerCase()}`
              const isActive = pathname === href
              return (
                <Link
                  key={item}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <span className="flex-1">{item}</span>
                  {isActive && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60" />}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {session?.user?.name || "Agent"}
            </p>
            <p className="text-xs text-sidebar-muted truncate">
              {session?.user?.email}
            </p>
          </div>
        </div>
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
