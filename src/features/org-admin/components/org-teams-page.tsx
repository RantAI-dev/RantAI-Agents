"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgApi, orgPaths } from "@/features/org-admin/api"
import type { CursorPage, UnitKind, UnitNode } from "@/features/org-admin/types"
import { canMoveUnder, flattenUnits, isSameParent, moveTargets } from "@/features/org-admin/units"
import { UnitMembersDialog } from "./unit-members-dialog"

const KIND_LABELS: Record<UnitKind, string> = { department: "Department", team: "Team" }

/**
 * Teams: the company's departments and teams as a tree. A unit moves by dragging it onto another
 * one, or with "Move to" for the keyboard; the API refuses a cycle with a 409 and the sentence is
 * shown as it comes. Membership (and the lead flag) is per unit.
 */
export default function OrgTeamsPage() {
  const orgFetch = useOrgFetch()
  const { activeOrganization, isAdmin } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const units = useApiResource<CursorPage<UnitNode>>(orgId && isAdmin ? orgPaths.units(orgId) : null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createKind, setCreateKind] = useState<UnitKind>("team")
  const [createParent, setCreateParent] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<UnitNode | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameExternalId, setRenameExternalId] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<UnitNode | null>(null)
  const [membersTarget, setMembersTarget] = useState<UnitNode | null>(null)

  const tree = useMemo(() => units.data?.data ?? [], [units.data])
  const rows = useMemo(() => flattenUnits(tree), [tree])

  if (!orgId || !isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may manage departments and teams.
        </CardContent>
      </Card>
    )
  }

  const run = async (request: () => Promise<Response>, success?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const response = await request()
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return false
      }
      success?.()
      units.reload()
      return true
    } catch {
      setError("We could not reach the server. Try again.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const moveUnit = async (unitId: string, parentId: string | null) => {
    if (!canMoveUnder(tree, unitId, parentId) || isSameParent(tree, unitId, parentId)) return
    await run(() => orgApi.updateUnit(orgFetch, orgId, unitId, { parentId }))
  }

  const parentOptions = (unitId: string | null) => {
    if (!unitId) return [{ id: null as string | null, label: "Top level" }, ...flattenUnits(tree).map(({ unit, depth }) => ({ id: unit.id as string | null, label: `${"— ".repeat(depth)}${unit.name}` }))]
    return moveTargets(tree, unitId)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Departments and teams, nested. Agents and chats are shared with a unit and everyone
            below it.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New unit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                const done = await run(
                  () =>
                    orgApi.createUnit(orgFetch, orgId, {
                      name: createName.trim(),
                      kind: createKind,
                      parentId: createParent,
                    }),
                  () => {
                    setCreateOpen(false)
                    setCreateName("")
                  },
                )
                if (!done) setCreateOpen(true)
              }}
            >
              <DialogHeader>
                <DialogTitle>New department or team</DialogTitle>
                <DialogDescription>
                  A department can hold other departments and teams; a team holds people.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="unit-name">Name</Label>
                  <Input
                    id="unit-name"
                    required
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="Customer Support"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit-kind">Kind</Label>
                  <Select value={createKind} onValueChange={(value) => setCreateKind(value as UnitKind)}>
                    <SelectTrigger id="unit-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="department">Department</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit-parent">Inside</Label>
                  <Select
                    value={createParent ?? "top"}
                    onValueChange={(value) => setCreateParent(value === "top" ? null : value)}
                  >
                    <SelectTrigger id="unit-parent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions(null).map((option) => (
                        <SelectItem key={option.id ?? "top"} value={option.id ?? "top"}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !createName.trim()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {units.error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {units.error}
        </div>
      )}

      <Card>
        <CardContent className="p-2">
          {units.loading && !units.data ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading the tree...
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No departments or teams yet.
            </p>
          ) : (
            <ul className="space-y-0.5" data-testid="unit-tree">
              {rows.map(({ unit, depth }) => {
                const mayDropHere = draggingId !== null && canMoveUnder(tree, draggingId, unit.id)
                return (
                  <li
                    key={unit.id}
                    draggable={!busy}
                    data-testid={`unit-row-${unit.id}`}
                    onDragStart={(event) => {
                      setDraggingId(unit.id)
                      // Firefox refuses a drag with no data on it; the id is state, this is a formality.
                      event.dataTransfer?.setData("text/plain", unit.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDropTargetId(null)
                    }}
                    onDragOver={(event) => {
                      if (!mayDropHere) return
                      event.preventDefault()
                      setDropTargetId(unit.id)
                    }}
                    onDragLeave={() => setDropTargetId((current) => (current === unit.id ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault()
                      const moving = draggingId
                      setDraggingId(null)
                      setDropTargetId(null)
                      if (moving) void moveUnit(moving, unit.id)
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                      dropTargetId === unit.id && "bg-primary/10 ring-1 ring-primary/40",
                      draggingId === unit.id && "opacity-50",
                    )}
                    style={{ paddingLeft: `${depth * 20 + 8}px` }}
                  >
                    {depth > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{unit.name}</span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {KIND_LABELS[unit.kind]}
                    </Badge>
                    {unit.externalId && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        IdP · {unit.externalId}
                      </Badge>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <Select
                        value={unit.parentId ?? "top"}
                        disabled={busy}
                        onValueChange={(value) => void moveUnit(unit.id, value === "top" ? null : value)}
                      >
                        <SelectTrigger
                          className="h-7 w-[150px] text-xs"
                          aria-label={`Move ${unit.name}`}
                        >
                          <SelectValue placeholder="Move to" />
                        </SelectTrigger>
                        <SelectContent>
                          {moveTargets(tree, unit.id).map((option) => (
                            <SelectItem key={option.id ?? "top"} value={option.id ?? "top"}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Members of ${unit.name}`}
                        onClick={() => setMembersTarget(unit)}
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Rename ${unit.name}`}
                        onClick={() => {
                          setRenameTarget(unit)
                          setRenameValue(unit.name)
                          setRenameExternalId(unit.externalId ?? "")
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Delete ${unit.name}`}
                        onClick={() => setDeleteTarget(unit)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Drag a unit onto another to move it, or use its &quot;Move to&quot; select.
      </p>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!renameTarget) return
              const target = renameTarget
              const done = await run(() =>
                orgApi.updateUnit(orgFetch, orgId, target.id, {
                  name: renameValue.trim(),
                  externalId: renameExternalId.trim() || null,
                }),
              )
              if (done) setRenameTarget(null)
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit unit</DialogTitle>
              <DialogDescription>
                The slug stays as it is. The provider group is what a sign-in&apos;s groups claim
                matches to put people in this unit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="unit-rename">Name</Label>
                <Input
                  id="unit-rename"
                  required
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-external-id">Identity provider group</Label>
                <Input
                  id="unit-external-id"
                  value={renameExternalId}
                  onChange={(event) => setRenameExternalId(event.target.value)}
                  placeholder="customer-support"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to keep only the members an admin adds by hand.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its members and any agent or chat shared with it lose that access. Units below it
              must be moved or deleted first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (target) void run(() => orgApi.deleteUnit(orgFetch, orgId, target.id))
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {membersTarget && (
        <UnitMembersDialog
          orgId={orgId}
          unit={membersTarget}
          open={membersTarget !== null}
          onOpenChange={(open) => !open && setMembersTarget(null)}
        />
      )}
    </div>
  )
}
