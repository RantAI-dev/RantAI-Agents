"use client"

import { useState } from "react"
import {
  AlertCircle,
  Crown,
  Eye,
  Loader2,
  MoreHorizontal,
  Shield,
  Trash2,
  User,
  UserPlus,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import type { OrgMember, OrgRole } from "@/features/org-admin/types"

const ROLE_ICONS = { owner: Crown, admin: Shield, member: User, viewer: Eye } as const
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

/**
 * Members: who belongs to the company, their role, and the invitations nobody accepted yet.
 * A role change or a removal writes an audit row in the API; the last owner's demotion is a 409
 * whose sentence is shown as it comes.
 */
export default function OrgMembersPage() {
  const orgFetch = useOrgFetch()
  const { activeOrganization, isOwner, isAdmin } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const members = useApiResource<OrgMember[]>(orgId && isAdmin ? orgPaths.members(orgId) : null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<OrgRole>("member")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)

  if (!orgId || !isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may manage members.
        </CardContent>
      </Card>
    )
  }

  const run = async (request: () => Promise<Response>, success: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const response = await request()
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      success()
      members.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    await run(
      () => orgApi.invite(orgFetch, orgId, inviteEmail.trim(), inviteRole),
      () => {
        setInviteOpen(false)
        setInviteEmail("")
        setInviteRole("member")
      },
    )
  }

  const rows = members.data ?? []
  const pending = rows.filter((row) => row.isPending)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Invite people, set their role, and see who has not accepted yet.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={invite}>
              <DialogHeader>
                <DialogTitle>Invite a member</DialogTitle>
                <DialogDescription>
                  They join when they accept the invitation with this address.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="ana@example.com"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as OrgRole)}
                    disabled={busy}
                  >
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — members, teams, agents</SelectItem>
                      <SelectItem value="member">Member — use shared agents</SelectItem>
                      <SelectItem value="viewer">Viewer — read only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !inviteEmail.trim()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send invitation
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
      {members.error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {members.error}
        </div>
      )}

      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending invitations</CardTitle>
            <CardDescription>These people have not accepted yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited as {ROLE_LABELS[member.role].toLowerCase()} · waiting
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Pending</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setRemoveTarget(member)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">People</CardTitle>
          <CardDescription>{rows.length} in this organisation</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {members.loading && !members.data ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members...
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((member) => {
                const RoleIcon = ROLE_ICONS[member.role]
                return (
                  <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                    <RoleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.name?.trim() || member.email}
                        {member.isPending && (
                          <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      {member.units.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {member.units.map((unit) => (
                            <Badge
                              key={unit.unitId}
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              {unit.role === "lead" ? "Lead · " : ""}
                              {unit.unitId.slice(0, 8)}
                              {unit.source === "idp" ? " · IdP" : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <Select
                      value={member.role}
                      disabled={busy || (member.role === "owner" && !isOwner)}
                      onValueChange={(value) =>
                        run(() => orgApi.changeRole(orgFetch, orgId, member.id, value as OrgRole), () => {})
                      }
                    >
                      <SelectTrigger className="h-8 w-[112px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${member.email}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setRemoveTarget(member)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.email} loses access to this organisation&apos;s agents and chats. A
              chat they shared with a unit stays in the unit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = removeTarget
                setRemoveTarget(null)
                if (target) void run(() => orgApi.removeMember(orgFetch, orgId, target.id), () => {})
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
