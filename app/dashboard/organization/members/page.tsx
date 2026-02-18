"use client"

import { useState } from "react"
import { Users, UserPlus, Crown, Shield, User, Eye, MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useOrganization, useOrganizationMembers, type OrganizationMember } from "@/hooks/use-organization"
import { DashboardPageHeader } from "../../_components/dashboard-page-header"
import { PlanGate } from "../_components/plan-gate"

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
}

const ROLE_DESCRIPTIONS = {
  admin: "Can manage members and all resources",
  member: "Can create and edit resources",
  viewer: "Can only view resources",
}

export default function MembersPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader title="Members" subtitle="Manage your team members" />
      <div className="flex-1 overflow-auto p-6">
        <PlanGate>
          <MembersContent />
        </PlanGate>
      </div>
    </div>
  )
}

function MembersContent() {
  const { activeOrganization, isOwner, isAdmin } = useOrganization()
  const {
    members,
    isLoading,
    error,
    inviteMember,
    updateMemberRole,
    removeMember,
  } = useOrganizationMembers(activeOrganization?.id || null)

  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  if (!activeOrganization) return null

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError("Email is required")
      return
    }

    setIsInviting(true)
    setInviteError(null)

    const result = await inviteMember(inviteEmail.trim(), inviteRole)

    if (result) {
      setShowInviteDialog(false)
      setInviteEmail("")
      setInviteRole("member")
    } else {
      setInviteError("Failed to invite member. They may already be invited.")
    }

    setIsInviting(false)
  }

  const handleRoleChange = async (memberId: string, newRole: string) => {
    await updateMemberRole(memberId, newRole)
  }

  const handleRemoveMember = async () => {
    if (!memberToRemove) return

    setIsRemoving(true)
    await removeMember(memberToRemove.id)
    setMemberToRemove(null)
    setIsRemoving(false)
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default" as const
      case "admin":
        return "secondary" as const
      default:
        return "outline" as const
    }
  }

  const canManageMember = (member: OrganizationMember) => {
    if (isOwner && member.role !== "owner") return true
    if (isAdmin && !isOwner && ["member", "viewer"].includes(member.role)) return true
    return false
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {isAdmin && (
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join {activeOrganization.name}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <div>
                            <div>Admin</div>
                            <div className="text-xs text-muted-foreground">
                              {ROLE_DESCRIPTIONS.admin}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="member">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <div>
                            <div>Member</div>
                            <div className="text-xs text-muted-foreground">
                              {ROLE_DESCRIPTIONS.member}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <div>
                            <div>Viewer</div>
                            <div className="text-xs text-muted-foreground">
                              {ROLE_DESCRIPTIONS.viewer}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteError && (
                  <div className="text-sm text-destructive">{inviteError}</div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={isInviting}>
                  {isInviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members
            <Badge variant="secondary" className="ml-2">
              {members.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            People with access to this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading members...
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              {error}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No members found.
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] || User
                const canManage = canManageMember(member)

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <RoleIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {member.name || member.email}
                          </span>
                          {member.isPending && (
                            <Badge variant="outline" className="text-xs">
                              Pending
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {member.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </Badge>

                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Member options">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isOwner && (
                              <>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, "admin")}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Make Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, "member")}>
                                  <User className="h-4 w-4 mr-2" />
                                  Make Member
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, "viewer")}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Make Viewer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => setMemberToRemove(member)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role Permissions</CardTitle>
          <CardDescription>
            What each role can do in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <Crown className="h-5 w-5 text-chart-1 mt-0.5" />
              <div>
                <div className="font-medium">Owner</div>
                <div className="text-sm text-muted-foreground">
                  Full access. Can delete organization and transfer ownership.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-chart-4 mt-0.5" />
              <div>
                <div className="font-medium">Admin</div>
                <div className="text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS.admin}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-chart-2 mt-0.5" />
              <div>
                <div className="font-medium">Member</div>
                <div className="text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS.member}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Viewer</div>
                <div className="text-sm text-muted-foreground">
                  {ROLE_DESCRIPTIONS.viewer}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.name || memberToRemove?.email}</strong> from{" "}
              {activeOrganization.name}? They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
