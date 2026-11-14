"use client"

import React, { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { MoreHorizontal, Pencil, Link2, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import { EditableSessionTitle } from "@/features/conversations/components/chat/editable-session-title"
import { ShareChatDialog } from "@/features/conversations/components/chat/sharing/share-chat-dialog"
import { SharedWithMeSection } from "@/features/conversations/components/chat/sharing/shared-with-me-section"
import { getSessionActivityDate } from "@/features/conversations/sessions/session-sync"
import type { Assistant } from "@/lib/types/assistant"

// ─── Chat Section Content ────────────────────────────────────────────

export function ChatSectionContent({
  getAssistantById,
}: {
  getAssistantById: (id: string) => Assistant | undefined
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { sessions, deleteSession, updateSession } = useChatSessions()
  // Session awaiting delete confirmation. Deleting used to fire on a single
  // click of an invisible (opacity-0) trash icon right next to the
  // timestamp, so a stray click silently removed chats (QA CHAT-011).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null)
  // Radix returns focus to the menu trigger when the menu closes; after
  // "Rename" that would immediately blur (and close) the new title input.
  const skipMenuFocusReturnRef = React.useRef(false)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return null
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const target = sessions.find((s) => s.id === pendingDelete.id)
    const urlId = target?.dbId || pendingDelete.id
    const wasActive = pathname === `/dashboard/chat/${urlId}`
    deleteSession(pendingDelete.id)
    setPendingDelete(null)
    if (wasActive) router.push("/dashboard/chat")
  }

  return (
    <div className="space-y-1">
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.title}&quot; and all of its messages will be permanently
              deleted. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {sessions.length > 0 && (
        <div className="space-y-1">
          <p className="px-3 py-1 text-xs font-medium text-sidebar-muted uppercase tracking-wider">
            Recent Chats
          </p>
          {sessions.map((session) => {
            const sessionAssistant = getAssistantById(session.assistantId)
            const sessionUrlId = session.dbId || session.id
            const isActive = pathname === `/dashboard/chat/${sessionUrlId}`
            const isRenaming = renamingId === session.id
            return (
              <div
                key={session.id}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                )}
                onClick={() => {
                  if (isRenaming) return
                  router.push(`/dashboard/chat/${sessionUrlId}`)
                }}
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
                  {isRenaming ? (
                    <EditableSessionTitle
                      title={session.title}
                      editing
                      hideTrigger
                      onEditingChange={(editing) => {
                        if (!editing) setRenamingId(null)
                      }}
                      onRename={(title) => updateSession(session.id, { title })}
                      className="text-sm"
                    />
                  ) : (
                    <p className="font-medium truncate text-sm">{session.title}</p>
                  )}
                  <p className="text-xs text-sidebar-muted truncate">
                    {formatDistanceToNow(getSessionActivityDate(session), { addSuffix: true })}
                  </p>
                </div>
                {/* modal={false}: a modal menu that opens an AlertDialog can
                    leave `pointer-events: none` stuck on <body> (Radix). */}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover",
                        "opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      )}
                      aria-label={`Chat options for ${session.title}`}
                      title="Chat options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                    onCloseAutoFocus={(e) => {
                      if (skipMenuFocusReturnRef.current) {
                        skipMenuFocusReturnRef.current = false
                        e.preventDefault()
                      }
                    }}
                  >
                    <DropdownMenuItem
                      onSelect={() => {
                        skipMenuFocusReturnRef.current = true
                        setRenamingId(session.id)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        setShareTarget({
                          id: session.dbId || session.id,
                          title: session.title,
                        })
                      }
                    >
                      <Link2 className="mr-2 h-3.5 w-3.5" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setPendingDelete({ id: session.id, title: session.title })}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}
      <SharedWithMeSection />
      {shareTarget && (
        <ShareChatDialog
          key={shareTarget.id}
          sessionId={shareTarget.id}
          title={shareTarget.title}
          open={shareTarget !== null}
          onOpenChange={(open) => !open && setShareTarget(null)}
        />
      )}
    </div>
  )
}

