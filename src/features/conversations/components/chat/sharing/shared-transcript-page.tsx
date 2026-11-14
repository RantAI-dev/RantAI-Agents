"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { AlertCircle, ArrowLeft, Loader2, ShieldAlert, MessageSquarePlus, User } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useOrgFetch } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { MarkdownContent } from "@/features/conversations/components/chat/markdown-content"
import {
  forkSharedChat,
  sharedTranscriptPath,
  type ForkedSession,
  type SharedTranscript,
} from "@/features/conversations/sharing/api"

/**
 * A chat somebody shared, read-only. "Continue" forks a copy into the caller's own sessions — and
 * needs `agents.use` on the agent it ran on, so a reader without it is offered the way to ask for
 * access instead of a button that cannot work.
 */
export default function SharedTranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const orgFetch = useOrgFetch()
  const transcript = useApiResource<SharedTranscript>(sharedTranscriptPath(id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAccess, setNeedsAccess] = useState(false)

  const continueChat = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await forkSharedChat(orgFetch, id)
      if (!response.ok) {
        const failure = await readApiError(response)
        if (failure.status === 403) {
          setNeedsAccess(true)
          return
        }
        setError(failure.message)
        return
      }
      const forked = (await response.json()) as ForkedSession
      router.push(`/dashboard/chat/${forked.id}`)
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (transcript.loading && !transcript.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (transcript.error || !transcript.data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-destructive">{transcript.error ?? "This chat is not available."}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard/chat/shared">Back to shared chats</Link>
          </Button>
        </div>
      </div>
    )
  }

  const chat = transcript.data

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/dashboard/chat/shared" aria-label="Back to shared chats">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{chat.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {chat.assistantName} · shared with you · updated{" "}
            {formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          Read only
        </Badge>
        <Button size="sm" onClick={() => void continueChat()} disabled={busy || needsAccess}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="mr-2 h-4 w-4" />
          )}
          Continue
        </Button>
      </div>

      {needsAccess && (
        <div className="border-b bg-muted/40 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" />
            You need access to {chat.assistantName}
          </p>
          <p className="mt-1 text-muted-foreground">
            Reading this chat is not the right to use its agent. Ask an admin to add you in Agent
            Builder → Deploy → Who can use this agent, then continue.
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
          {chat.messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">This chat has no messages.</p>
          ) : (
            chat.messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {message.role === "user" ? (
                    <>
                      <User className="h-3.5 w-3.5" />
                      They wrote
                    </>
                  ) : (
                    <>Assistant · {chat.assistantName}</>
                  )}
                </p>
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    {message.content}
                  </p>
                ) : (
                  <MarkdownContent content={message.content} className="text-sm" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
