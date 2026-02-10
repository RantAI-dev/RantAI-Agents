"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Save,
  MoreHorizontal,
  Settings,
  Wrench,
  BookOpen,
  Brain,
  MessageSquare,
  Rocket,
  Copy,
  Star,
  Trash2,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

export type TabId = "configure" | "tools" | "knowledge" | "memory" | "test" | "deploy"

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: "configure", label: "Configure", icon: Settings },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "test", label: "Test", icon: MessageSquare },
  { id: "deploy", label: "Deploy", icon: Rocket },
]

interface AgentEditorLayoutProps {
  agentName: string
  agentEmoji: string
  isNew: boolean
  isDirty: boolean
  isSaving: boolean
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onSave: () => void
  onDuplicate?: () => void
  onSetDefault?: () => void
  onDelete?: () => void
  isDefault?: boolean
  children: React.ReactNode
}

export function AgentEditorLayout({
  agentName,
  agentEmoji,
  isNew,
  isDirty,
  isSaving,
  activeTab,
  onTabChange,
  onSave,
  onDuplicate,
  onSetDefault,
  onDelete,
  isDefault,
  children,
}: AgentEditorLayoutProps) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center gap-3 min-h-14 border-b bg-background pl-12 pr-4 py-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/dashboard/agent-builder")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-2xl shrink-0">{agentEmoji}</span>
          <h1 className="text-base font-semibold truncate">
            {isNew ? "New Agent" : agentName}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={onSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                {isNew ? "Create" : "Save"}
              </>
            )}
          </Button>

          {!isNew && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                {onSetDefault && (
                  <DropdownMenuItem onClick={onSetDefault}>
                    <Star className="mr-2 h-4 w-4" />
                    {isDefault ? "Remove Default" : "Set as Default"}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content: vertical tabs + panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tab Sidebar */}
        <div className="w-44 shrink-0 border-r bg-muted/30 flex flex-col gap-0.5 p-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left w-full",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{agentName}&quot;. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false)
                onDelete?.()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
