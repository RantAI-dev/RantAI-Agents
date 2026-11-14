"use client"

import { useCallback } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { AlertCircle, Loader2, Link2, Users } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCursorPage } from "@/hooks/use-api-resource"
import { SHARED_LIST_PATH, type SharedSession } from "@/features/conversations/sharing/api"

/** Every chat shared with the caller, newest activity first. */
export default function SharedWithMePage() {
  const page = useCursorPage<SharedSession>(SHARED_LIST_PATH)
  const rows = page.data

  const loadMore = useCallback(() => page.loadMore(), [page])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Link2 className="h-5 w-5" />
          Shared with me
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chats other people shared with you. You can read them; continuing one makes a copy of
          your own.
        </p>

        {page.error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {page.error}
          </div>
        )}

        {page.loading && rows.length === 0 ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nobody has shared a chat with you yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="mt-6 divide-y rounded-xl border">
            {rows.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/dashboard/chat/shared/${session.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="text-xs text-muted-foreground">
                      updated{" "}
                      {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {page.nextCursor && (
          <Button
            variant="outline"
            className="mt-4"
            onClick={loadMore}
            disabled={page.loadingMore}
          >
            {page.loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load more
          </Button>
        )}
      </div>
    </div>
  )
}
