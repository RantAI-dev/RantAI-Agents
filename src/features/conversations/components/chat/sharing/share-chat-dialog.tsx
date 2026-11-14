"use client"

import { useState } from "react"
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Loader2,
  Trash2,
  User,
  Users,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgPaths } from "@/features/org-admin/api"
import type { CursorPage, OrgMember, UnitNode } from "@/features/org-admin/types"
import { flattenUnits } from "@/features/org-admin/units"
import {
  putShares,
  revokeShare,
  shareTargets,
  sharesPath,
  type ChatShare,
  type ShareSubjectBody,
} from "@/features/conversations/sharing/api"

/**
 * Share one chat with people, teams or the whole company. A recipient reads it; they cannot edit
 * it, and "Continue" forks a copy of their own (design §3.4). The dialog edits a draft and sends
 * it with one `PUT`, which replaces every share.
 */
export function ShareChatDialog({
  sessionId,
  title,
  open,
  onOpenChange,
}: {
  sessionId: string | null
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const orgFetch = useOrgFetch()
  const { activeOrganization } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const orgName = activeOrganization?.name ?? "the whole organisation"

  const shares = useApiResource<CursorPage<ChatShare>>(open && sessionId ? sharesPath(sessionId) : null)
  const units = useApiResource<CursorPage<UnitNode>>(open && orgId ? orgPaths.units(orgId) : null)
  const people = useApiResource<OrgMember[]>(open && orgId ? orgPaths.members(orgId) : null)

  const [draft, setDraft] = useState<ShareSubjectBody[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [choice, setChoice] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!hydrated && shares.data) {
    setHydrated(true)
    setDraft(
      (shares.data.data ?? []).map((share) => ({
        subjectType: share.subjectType,
        subjectId: share.subjectId,
      })),
    )
  }

  const targets =
    orgId && people.data && units.data
      ? shareTargets(orgId, orgName, units.data.data ?? [], people.data, flattenUnits)
      : []

  const labelFor = (subject: ShareSubjectBody) =>
    targets.find(
      (target) =>
        target.subjectType === subject.subjectType && target.subjectId === subject.subjectId,
    )?.label ?? subject.subjectId

  const add = (value: string) => {
    const target = targets.find(
      (candidate) => `${candidate.subjectType}:${candidate.subjectId}` === value,
    )
    if (!target) return
    setDraft((current) =>
      current.some(
        (row) => row.subjectType === target.subjectType && row.subjectId === target.subjectId,
      )
        ? current
        : [...current, { subjectType: target.subjectType, subjectId: target.subjectId }],
    )
    setSaved(false)
  }

  const remove = (subject: ShareSubjectBody) => {
    setDraft((current) =>
      current.filter(
        (row) =>
          !(row.subjectType === subject.subjectType && row.subjectId === subject.subjectId),
      ),
    )
    setSaved(false)
  }

  const revokeOne = async (subject: ShareSubjectBody) => {
    if (!sessionId) return
    const saved = (shares.data?.data ?? []).find(
      (share) =>
        share.subjectType === subject.subjectType && share.subjectId === subject.subjectId,
    )
    remove(subject)
    if (!saved) return
    setBusy(true)
    setError(null)
    try {
      const response = await revokeShare(orgFetch, sessionId, saved.id)
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      shares.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await putShares(orgFetch, sessionId, draft)
      if (!response.ok) {
        // An org-less legacy chat answers 409 with the sentence the caller needs; show it as is.
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      setSaved(true)
      shares.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{title}&rdquo;</DialogTitle>
          <DialogDescription>
            People you share with read this chat. They can continue it in a copy of their own if
            they may use the agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {shares.error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {shares.error}
            </p>
          )}

          {shares.loading && !shares.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading who can read this chat...
            </div>
          ) : draft.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Only you. Add a person, a team, or the whole company.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {draft.map((subject) => (
                <li
                  key={`${subject.subjectType}:${subject.subjectId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  {subject.subjectType === "org" ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : subject.subjectType === "unit" ? (
                    <Users className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{labelFor(subject)}</span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Can read
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label={`Revoke sharing with ${labelFor(subject)}`}
                    disabled={busy}
                    onClick={() => void revokeOne(subject)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <Select value={choice} onValueChange={setChoice} disabled={busy}>
              <SelectTrigger className="flex-1" aria-label="Who to share with">
                <SelectValue placeholder="Add a person, team or the company" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem
                    key={`${target.subjectType}:${target.subjectId}`}
                    value={`${target.subjectType}:${target.subjectId}`}
                  >
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !choice}
              onClick={() => {
                add(choice)
                setChoice("")
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : null}
            Save sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
