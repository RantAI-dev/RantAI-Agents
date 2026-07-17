"use client"

/**
 * Superadmin → Users: platform-wide (cross-org) user table with suspend/
 * reactivate, role change, forced password reset (temp password shown once)
 * and manual user creation. Backed by /api/admin/users*.
 */
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Plus, Search, ShieldCheck, UserX } from "@/lib/icons"
import { formatDistanceToNow } from "date-fns"

interface AdminUser {
  id: string
  email: string
  name: string
  role: "USER" | "ADMIN"
  suspendedAt: string | null
  lastActiveAt: string | null
  createdAt: string
  organizations: { id: string; name: string; role: string }[]
}

export function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [secret, setSecret] = useState<{ title: string; email: string; password: string } | null>(null)

  const pageSize = 25

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) params.set("search", search)
    if (roleFilter !== "all") params.set("role", roleFilter)
    if (statusFilter !== "all") params.set("suspended", statusFilter === "suspended" ? "true" : "false")
    try {
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
    } catch (err) {
      toast({
        title: "Failed to load users",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, statusFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (id: string, body: Record<string, unknown>, okMessage: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast({ title: "Action failed", description: data.error || res.statusText, variant: "destructive" })
      return
    }
    toast({ title: okMessage })
    void load()
  }

  const resetPassword = async (user: AdminUser) => {
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ title: "Reset failed", description: data.error || res.statusText, variant: "destructive" })
      return
    }
    setSecret({ title: "Temporary password", email: user.email, password: data.tempPassword })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="USER">User</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create user
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className={user.suspendedAt ? "opacity-60" : undefined}>
                <TableCell>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </TableCell>
                <TableCell>
                  {user.role === "ADMIN" ? (
                    <Badge variant="default" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </Badge>
                  ) : (
                    <Badge variant="secondary">User</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.suspendedAt ? (
                    <Badge variant="destructive" className="gap-1">
                      <UserX className="h-3 w-3" /> Suspended
                    </Badge>
                  ) : (
                    <Badge variant="outline">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-52">
                  <div className="flex flex-wrap gap-1">
                    {user.organizations.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {user.organizations.slice(0, 3).map((org) => (
                      <Badge key={org.id} variant="outline" className="text-[10px]">
                        {org.name} · {org.role}
                      </Badge>
                    ))}
                    {user.organizations.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{user.organizations.length - 3}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {user.lastActiveAt
                    ? formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })
                    : "never"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {user.role === "USER" ? (
                        <DropdownMenuItem onClick={() => patch(user.id, { role: "ADMIN" }, "Promoted to admin")}>
                          Make admin
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => patch(user.id, { role: "USER" }, "Demoted to user")}>
                          Make regular user
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => resetPassword(user)}>
                        Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.suspendedAt ? (
                        <DropdownMenuItem onClick={() => patch(user.id, { suspended: false }, "User reactivated")}>
                          Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => patch(user.id, { suspended: true }, "User suspended")}
                        >
                          Suspend
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No users match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} user{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(email, generatedPassword) => {
          void load()
          if (generatedPassword) {
            setSecret({ title: "Generated password", email, password: generatedPassword })
          }
        }}
      />

      {/* Shown ONCE — the password is not retrievable later. */}
      <Dialog open={!!secret} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{secret?.title}</DialogTitle>
            <DialogDescription>
              For <span className="font-medium">{secret?.email}</span>. Copy it now — it is shown only
              once. Ask the user to change it after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm select-all">
            {secret?.password}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (secret) void navigator.clipboard.writeText(secret.password)
              }}
              variant="outline"
            >
              Copy
            </Button>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (email: string, generatedPassword: string | null) => void
}) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("USER")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password: password || undefined, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Create failed", description: data.error || res.statusText, variant: "destructive" })
        return
      }
      toast({ title: "User created", description: email })
      onOpenChange(false)
      setEmail("")
      setName("")
      setPassword("")
      setRole("USER")
      onCreated(email, data.generatedPassword ?? null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Leave the password empty to generate a random one (shown once after creation).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-new-email">Email</Label>
            <Input
              id="admin-new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-new-name">Name</Label>
            <Input id="admin-new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-new-password">Password (optional)</Label>
            <Input
              id="admin-new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Generate randomly"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !email}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
