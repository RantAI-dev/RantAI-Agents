"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Star, Pencil, Trash2, Database, MessageSquare, Bot, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
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
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAssistants } from "@/hooks/use-assistants"
import { useDefaultAssistant } from "@/hooks/use-default-assistant"
import { useAssistantTestSessions, type TestSession } from "@/hooks/use-assistant-test-sessions"
import { AssistantEditor } from "../_components/chat/assistant-editor"
import { ChatWorkspace } from "../_components/chat/chat-workspace"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { Virtuoso } from "react-virtuoso"
import type { Assistant, AssistantInput } from "@/lib/types/assistant"
import { useIsMobile } from "@/hooks/use-mobile"

function AssistantsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const {
    assistants,
    isLoading,
    addAssistant,
    updateAssistant,
    deleteAssistant,
    refetch,
  } = useAssistants()

  const {
    assistant: defaultAssistant,
    source: defaultSource,
    setUserDefault,
    clearUserDefault,
    refetch: refetchDefault,
  } = useDefaultAssistant()

  // Selected assistant for chat testing
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null)
  const selectedAssistant = assistants.find((a) => a.id === selectedAssistantId)

  // Test sessions for the selected assistant
  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    deleteSession,
    isLoaded: sessionsLoaded,
  } = useAssistantTestSessions(selectedAssistantId)

  // Editor and delete dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null)
  const [assistantPopoverOpen, setAssistantPopoverOpen] = useState(false)

  // Sync selection with URL
  useEffect(() => {
    const assistantIdFromUrl = searchParams.get("assistant")
    if (assistantIdFromUrl && assistants.some((a) => a.id === assistantIdFromUrl)) {
      setSelectedAssistantId(assistantIdFromUrl)
    }
  }, [searchParams, assistants])

  // Auto-select first assistant if none selected
  useEffect(() => {
    if (!selectedAssistantId && assistants.length > 0 && !isLoading) {
      setSelectedAssistantId(assistants[0].id)
    }
  }, [assistants, selectedAssistantId, isLoading])

  const handleSelectAssistant = useCallback((assistant: Assistant) => {
    setSelectedAssistantId(assistant.id)
    setAssistantPopoverOpen(false)
    router.push(`/dashboard/assistants?assistant=${assistant.id}`, { scroll: false })
  }, [router])

  const handleCreate = () => {
    setEditingAssistant(null)
    setEditorOpen(true)
  }

  const handleEdit = (assistant: Assistant) => {
    setEditingAssistant(assistant)
    setEditorOpen(true)
  }

  const handleSave = async (input: AssistantInput) => {
    if (editingAssistant) {
      await updateAssistant(editingAssistant.id, input)
    } else {
      const newAssistant = await addAssistant(input)
      if (newAssistant) {
        handleSelectAssistant(newAssistant)
      }
    }
    refetch()
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteAssistant(deleteTarget.id)
      setDeleteTarget(null)
      if (selectedAssistantId === deleteTarget.id) {
        const remaining = assistants.filter((a) => a.id !== deleteTarget.id)
        setSelectedAssistantId(remaining[0]?.id || null)
      }
      refetch()
      refetchDefault()
    }
  }

  const handleSetDefault = async (assistant: Assistant) => {
    await setUserDefault(assistant.id)
    refetchDefault()
  }

  const handleClearDefault = async () => {
    await clearUserDefault()
    refetchDefault()
  }

  const handleNewTestChat = useCallback(() => {
    if (selectedAssistantId) {
      createSession(selectedAssistantId)
    }
  }, [selectedAssistantId, createSession])

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
  }, [setActiveSessionId])

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<TestSession>) => {
    updateSession(sessionId, updates)
  }, [updateSession])

  const handleDeleteSession = useCallback((sessionId: string) => {
    deleteSession(sessionId)
  }, [deleteSession])

  const isUserDefault = (assistant: Assistant) =>
    defaultSource === "user" && defaultAssistant?.id === assistant.id

  const isEffectiveDefault = (assistant: Assistant) =>
    defaultAssistant?.id === assistant.id

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b pl-14 pr-4">
          <h1 className="text-lg font-semibold">Assistants</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  // Session Panel Component (inline for assistant-specific sessions)
  const SessionPanel = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-panel-from via-panel-via via-[61%] to-panel-to">
      {/* Header with New Chat */}
      <div className="p-3 border-b border-sidebar-border">
        <Button
          onClick={handleNewTestChat}
          className="w-full bg-sidebar-hover hover:bg-sidebar-accent text-sidebar-foreground border-0"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Test Chat
        </Button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-hidden">
        {sessions.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="h-8 w-8 mx-auto text-sidebar-muted mb-2" />
            <p className="text-sm text-sidebar-foreground/70">
              No test conversations yet
            </p>
            <p className="text-xs text-sidebar-muted mt-1">
              Click &quot;New Test Chat&quot; to start
            </p>
          </div>
        ) : (
          <Virtuoso
            data={sessions}
            className="h-full"
            itemContent={(_, session) => (
              <div
                className={cn(
                  "group relative flex items-start gap-3 mx-2 my-1 rounded-lg p-3 cursor-pointer transition-all duration-200",
                  activeSessionId === session.id
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-hover"
                )}
                onClick={() => handleSelectSession(session.id)}
              >
                {/* Animated ink indicator */}
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                    "transition-all duration-150 ease-in-out",
                    activeSessionId === session.id
                      ? "h-10 opacity-100"
                      : "h-2 opacity-0 group-hover:h-6 group-hover:opacity-100"
                  )}
                />
                {/* Assistant Emoji */}
                <span className="text-xl shrink-0">
                  {selectedAssistant?.emoji || "💬"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-sidebar-foreground">
                    {session.title}
                  </p>
                  <span className="text-xs text-sidebar-muted">
                    {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                  </span>
                  {session.messages.length > 0 && (
                    <p className="text-xs text-sidebar-muted truncate mt-1">
                      {session.messages[session.messages.length - 1]?.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-sidebar-foreground/60 hover:text-red-400 hover:bg-sidebar-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSession(session.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  )

  // Assistant Selector Component
  const AssistantSelectorDropdown = () => (
    <Popover open={assistantPopoverOpen} onOpenChange={setAssistantPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="justify-between gap-2 hover:bg-muted px-2 py-1 h-9"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{selectedAssistant?.emoji || "🤖"}</span>
            <span className="text-sm font-medium">{selectedAssistant?.name || "Select Assistant"}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {assistants.map((assistant) => {
            const isSelected = selectedAssistantId === assistant.id
            const isDefault = isEffectiveDefault(assistant)

            return (
              <div
                key={assistant.id}
                className={cn(
                  "group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all",
                  isSelected
                    ? "bg-sidebar-accent"
                    : "hover:bg-sidebar-hover"
                )}
                onClick={() => handleSelectAssistant(assistant)}
              >
                <span className="text-2xl shrink-0">{assistant.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{assistant.name}</p>
                    {isDefault && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                        Default
                      </Badge>
                    )}
                    {assistant.useKnowledgeBase && (
                      <Database className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {assistant.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(assistant)
                          setAssistantPopoverOpen(false)
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 opacity-0 group-hover:opacity-100",
                          isDefault && "text-amber-500 opacity-100"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isUserDefault(assistant)) {
                            handleClearDefault()
                          } else {
                            handleSetDefault(assistant)
                          }
                        }}
                      >
                        <Star className={cn("h-3 w-3", isDefault && "fill-amber-500")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isUserDefault(assistant) ? "Remove as Default" : "Set as Default"}
                    </TooltipContent>
                  </Tooltip>
                  {assistant.isEditable && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(assistant)
                            setAssistantPopoverOpen(false)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 pt-2 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => {
              handleCreate()
              setAssistantPopoverOpen(false)
            }}
          >
            <Plus className="h-4 w-4" />
            New Assistant
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b pl-14 pr-4">
          <h1 className="text-lg font-semibold">Assistants</h1>
          <AssistantSelectorDropdown />
        </header>

        {/* Content - Split View like Chat Page */}
        <div className="flex-1 overflow-hidden">
          {isMobile ? (
            // Mobile: Show either sessions or workspace
            activeSessionId ? (
              <ChatWorkspace
                key={`${activeSessionId}-${selectedAssistant?.id}`}
                session={activeSession ? {
                  id: activeSession.id,
                  title: activeSession.title,
                  assistantId: activeSession.assistantId,
                  createdAt: activeSession.createdAt,
                  messages: activeSession.messages,
                } : undefined}
                assistant={selectedAssistant!}
                onBack={() => setActiveSessionId(null)}
                onUpdateSession={handleUpdateSession}
              />
            ) : (
              <SessionPanel />
            )
          ) : (
            // Desktop: Resizable panels
            <ResizablePanelGroup id="assistants-panel-group" direction="horizontal" className="h-full">
              {/* Left Panel: Session List */}
              <ResizablePanel id="session-panel" defaultSize={25} minSize={18} maxSize={35}>
                <SessionPanel />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Right Panel: Chat Workspace */}
              <ResizablePanel id="chat-workspace-panel" defaultSize={75}>
                {selectedAssistant ? (
                  <ChatWorkspace
                    key={`${selectedAssistantId}-${activeSessionId || "new"}`}
                    session={activeSession ? {
                      id: activeSession.id,
                      title: activeSession.title,
                      assistantId: activeSession.assistantId,
                      createdAt: activeSession.createdAt,
                      messages: activeSession.messages,
                    } : undefined}
                    assistant={selectedAssistant}
                    onUpdateSession={handleUpdateSession}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <Bot className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Select an Assistant</h2>
                    <p className="text-muted-foreground max-w-md">
                      Choose an assistant from the dropdown to start a test conversation,
                      or create a new one.
                    </p>
                  </div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        {/* Editor Dialog */}
        <AssistantEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          assistant={editingAssistant}
          onSave={handleSave}
          onDelete={editingAssistant ? () => setDeleteTarget(editingAssistant) : undefined}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Assistant?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &quot;{deleteTarget?.name}&quot;. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}

// Loading fallback for Suspense
function AssistantsPageFallback() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b pl-14 pr-4">
        <h1 className="text-lg font-semibold">Assistants</h1>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </div>
  )
}

export default function AssistantsPage() {
  return (
    <Suspense fallback={<AssistantsPageFallback />}>
      <AssistantsPageContent />
    </Suspense>
  )
}
