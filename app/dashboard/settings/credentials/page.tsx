"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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
  Plus,
  KeyRound,
  Trash2,
  Edit,
  Search,
  ShieldCheck,
} from "lucide-react"

interface Credential {
  id: string
  name: string
  type: string
  createdAt: string
  updatedAt: string
}

const CREDENTIAL_TYPES = [
  { value: "api_key", label: "API Key", description: "Single API key for authentication" },
  { value: "bearer", label: "Bearer Token", description: "Bearer token for Authorization header" },
  { value: "basic_auth", label: "Basic Auth", description: "Username and password" },
  { value: "oauth2", label: "OAuth 2.0", description: "OAuth client credentials" },
]

const TYPE_COLORS: Record<string, string> = {
  api_key: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  bearer: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  basic_auth: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  oauth2: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Credential | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState("api_key")
  const [formApiKey, setFormApiKey] = useState("")
  const [formToken, setFormToken] = useState("")
  const [formUsername, setFormUsername] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formClientId, setFormClientId] = useState("")
  const [formClientSecret, setFormClientSecret] = useState("")
  const [formAccessToken, setFormAccessToken] = useState("")

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/credentials")
      const data = await res.json()
      if (Array.isArray(data)) setCredentials(data)
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const resetForm = () => {
    setFormName("")
    setFormType("api_key")
    setFormApiKey("")
    setFormToken("")
    setFormUsername("")
    setFormPassword("")
    setFormClientId("")
    setFormClientSecret("")
    setFormAccessToken("")
  }

  const openCreate = () => {
    resetForm()
    setEditingCredential(null)
    setDialogOpen(true)
  }

  const openEdit = (cred: Credential) => {
    setEditingCredential(cred)
    setFormName(cred.name)
    setFormType(cred.type)
    // Data fields are cleared — we don't expose encrypted data back
    setFormApiKey("")
    setFormToken("")
    setFormUsername("")
    setFormPassword("")
    setFormClientId("")
    setFormClientSecret("")
    setFormAccessToken("")
    setDialogOpen(true)
  }

  const buildData = (): Record<string, string> | null => {
    switch (formType) {
      case "api_key":
        if (!formApiKey && !editingCredential) return null
        return formApiKey ? { apiKey: formApiKey } : {}
      case "bearer":
        if (!formToken && !editingCredential) return null
        return formToken ? { token: formToken } : {}
      case "basic_auth":
        if ((!formUsername || !formPassword) && !editingCredential) return null
        if (formUsername && formPassword) return { username: formUsername, password: formPassword }
        return {}
      case "oauth2":
        if (!formClientId && !editingCredential) return null
        const oauth: Record<string, string> = {}
        if (formClientId) oauth.clientId = formClientId
        if (formClientSecret) oauth.clientSecret = formClientSecret
        if (formAccessToken) oauth.accessToken = formAccessToken
        return Object.keys(oauth).length > 0 ? oauth : {}
      default:
        return null
    }
  }

  const handleSave = async () => {
    if (!formName.trim()) return

    const data = buildData()

    setIsSaving(true)
    try {
      if (editingCredential) {
        // Update
        const body: Record<string, unknown> = { name: formName, type: formType }
        if (data && Object.keys(data).length > 0) body.data = data
        await fetch(`/api/dashboard/credentials/${editingCredential.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        // Create
        if (!data || Object.keys(data).length === 0) return
        await fetch("/api/dashboard/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName, type: formType, data }),
        })
      }

      setDialogOpen(false)
      resetForm()
      setEditingCredential(null)
      await fetchCredentials()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    await fetch(`/api/dashboard/credentials/${deleteConfirm.id}`, { method: "DELETE" })
    setDeleteConfirm(null)
    await fetchCredentials()
  }

  const filtered = credentials.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys and authentication for workflow nodes
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys and authentication for workflow nodes
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Credential
        </Button>
      </div>

      <div className="space-y-4">
          {/* Search */}
          {credentials.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search credentials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Empty state */}
          {credentials.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ShieldCheck className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-sm font-medium mb-1">No Credentials Yet</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                  Add API keys or authentication credentials to use in HTTP and Tool nodes in your workflows.
                </p>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Your First Credential
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Credential list */}
          {filtered.map((cred) => (
            <Card key={cred.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{cred.name}</span>
                    <Badge variant="secondary" className={TYPE_COLORS[cred.type] || ""}>
                      {CREDENTIAL_TYPES.find((t) => t.value === cred.type)?.label || cred.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {new Date(cred.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(cred)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirm(cred)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && credentials.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No credentials match &ldquo;{searchQuery}&rdquo;
            </p>
          )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setEditingCredential(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCredential ? "Edit Credential" : "Add Credential"}
            </DialogTitle>
            <DialogDescription>
              {editingCredential
                ? "Update credential details. Leave secret fields empty to keep existing values."
                : "Store authentication credentials securely for use in workflow nodes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Stripe Production"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <span>{t.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {t.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type-specific fields */}
            {formType === "api_key" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={editingCredential ? "Leave empty to keep current" : "sk-..."}
                />
              </div>
            )}

            {formType === "bearer" && (
              <div className="space-y-2">
                <Label>Token</Label>
                <Input
                  type="password"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder={editingCredential ? "Leave empty to keep current" : "Enter bearer token"}
                />
              </div>
            )}

            {formType === "basic_auth" && (
              <>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingCredential ? "Leave empty to keep current" : "Password"}
                  />
                </div>
              </>
            )}

            {formType === "oauth2" && (
              <>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={formClientId}
                    onChange={(e) => setFormClientId(e.target.value)}
                    placeholder="Client ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={formClientSecret}
                    onChange={(e) => setFormClientSecret(e.target.value)}
                    placeholder={editingCredential ? "Leave empty to keep current" : "Client Secret"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access Token (optional)</Label>
                  <Input
                    type="password"
                    value={formAccessToken}
                    onChange={(e) => setFormAccessToken(e.target.value)}
                    placeholder="Pre-obtained access token"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formName.trim()}>
              {isSaving ? "Saving..." : editingCredential ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteConfirm?.name}&rdquo;.
              Any workflow nodes using this credential will lose their authentication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
