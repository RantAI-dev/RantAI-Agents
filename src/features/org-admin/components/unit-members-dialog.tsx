"use client"

import { useMemo, useState } from "react"
import { Loader2, UserPlus, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { useOrgFetch } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgApi, orgPaths } from "@/features/org-admin/api"
import type { CursorPage, OrgMember, UnitMember, UnitNode } from "@/features/org-admin/types"

/**
 * The people in one unit, and whether they lead it. A team lead gets `org.units.manage` for their
 * own unit and the ones below it, which is how a department runs its own membership without an
 * admin.
 */
export function UnitMembersDialog({
  orgId,
  unit,
  open,
  onOpenChange,
}: {
  orgId: string
  unit: UnitNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const orgFetch = useOrgFetch()
  const members = useApiResource<CursorPage<UnitMember>>(
    open ? orgPaths.unitMembers(orgId, unit.id) : null,
  )
  const people = useApiResource<OrgMember[]>(open ? orgPaths.members(orgId) : null)
  const [userId, setUserId] = useState<string>("")
  const [isLead, setIsLead] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => {
    const map = new Map<string, OrgMember>()
    for (const person of people.data ?? []) map.set(person.userId, person)
    return map
  }, [people.data])

  const current = members.data?.data ?? []
  const candidates = (people.data ?? []).filter(
    (person) => !person.isPending && !current.some((row) => row.userId === person.userId),
  )

  const run = async (request: () => Promise<Response>, success?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const response = await request()
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      success?.()
      members.reload()
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
          <DialogTitle>Members of {unit.name}</DialogTitle>
          <DialogDescription>
            People here, and in the units below, receive whatever is shared with this unit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {members.loading && !members.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : current.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is in this unit yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {current.map((row) => {
                const person = byId.get(row.userId)
                return (
                  <li key={row.userId} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {person?.name?.trim() || person?.email || row.userId}
                    </span>
                    {row.role === "lead" && <Badge className="text-[10px]">Lead</Badge>}
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {row.source === "idp" ? "From IdP" : "Manual"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remove ${person?.email ?? row.userId}`}
                      disabled={busy}
                      onClick={() => run(() => orgApi.removeUnitMember(orgFetch, orgId, unit.id, row.userId))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-2">
              <Label htmlFor="unit-member">Add a member</Label>
              <Select value={userId} onValueChange={setUserId} disabled={busy}>
                <SelectTrigger id="unit-member">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.name?.trim() || person.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="unit-lead" className="text-sm">
                  Lead this unit
                </Label>
                <p className="text-xs text-muted-foreground">
                  A lead manages this unit and everything below it.
                </p>
              </div>
              <Switch id="unit-lead" checked={isLead} onCheckedChange={setIsLead} disabled={busy} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button
            type="button"
            disabled={busy || !userId}
            onClick={() =>
              run(
                () => orgApi.addUnitMember(orgFetch, orgId, unit.id, userId, isLead),
                () => {
                  setUserId("")
                  setIsLead(false)
                },
              )
            }
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
