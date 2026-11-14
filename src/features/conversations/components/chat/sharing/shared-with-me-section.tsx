"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { Share2, Users } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { useApiResource } from "@/hooks/use-api-resource"
import {
  SHARED_LIST_PATH,
  type SharedSession,
} from "@/features/conversations/sharing/api"

/**
 * "Shared with me" in the chat sidebar: the chats other people shared with this caller through a
 * unit, the company, or directly. It renders nothing when there is nothing to show, so the
 * sidebar stays as it was for someone nobody shared with.
 */
export function SharedWithMeSection() {
  const pathname = usePathname()
  const shared = useApiResource<{ data: SharedSession[]; nextCursor: string | null }>(
    SHARED_LIST_PATH,
  )

  const rows = shared.data?.data ?? []
  if (rows.length === 0) return null

  return (
    <div className="mt-3 space-y-1">
      <p className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-sidebar-muted">
        <Share2 className="h-3 w-3" />
        Shared with me
      </p>
      {rows.map((session) => {
        const href = `/dashboard/chat/shared/${session.id}`
        const active = pathname === href
        return (
          <Link
            key={session.id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
              active
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground",
            )}
          >
            <Users className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{session.title}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
