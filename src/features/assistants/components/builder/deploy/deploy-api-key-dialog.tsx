"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "@/lib/icons"
import type { AgentApiKeyResponse } from "@/features/agent-api-keys/service"

const AVAILABLE_SCOPES = [
  { value: "chat", label: "Chat", description: "Send messages and receive responses" },
  { value: "chat:stream", label: "Chat (Streaming)", description: "Stream responses via SSE" },
]

interface DeployApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingKey: AgentApiKeyResponse | null
  assistantId: string
  onSave: (input: {
    name: string
    assistantId: string
    scopes?: string[]
    ipWhitelist?: string[]
    expiresAt?: string
  }) => Promise<unknown>
}

export function DeployApiKeyDialog({
  open,
  onOpenChange,
  editingKey,
  assistantId,
  onSave,
}: DeployApiKeyDialogProps) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["chat", "chat:stream"])
  const [ipWhitelist, setIpWhitelist] = useState("")
  const [expiresAt, setExpiresAt] = useState("")

  useEffect(() => {
    if (editingKey) {
      setName(editingKey.name)
      setScopes(editingKey.scopes.length > 0 ? editingKey.scopes : ["chat", "chat:stream"])
      setIpWhitelist(editingKey.ipWhitelist.join("\n"))
      setExpiresAt(editingKey.expiresAt ? editingKey.expiresAt.split("T")[0] : "")
    } else {
      setName("")
      setScopes(["chat", "chat:stream"])
      setIpWhitelist("")
      setExpiresAt("")
    }
  }, [editingKey, open])

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setSaving(true)
    try {
      const ips = ipWhitelist
        .split("\n")
        .map((ip) => ip.trim())
        .filter(Boolean)

      await onSave({
        name,
        assistantId,
        scopes,
        ipWhitelist: ips,
        ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingKey ? "Edit API Key" : "Create API Key"}</DialogTitle>
          <DialogDescription>
            {editingKey
              ? "Update the API key settings."
              : "Create a new API key for programmatic access to this agent."}
          </DialogDescription>
        </DialogHeader>

        <form id="api-key-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Backend"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="space-y-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <div key={scope.value} className="flex items-start gap-2">
                  <Checkbox
                    id={`scope-${scope.value}`}
                    checked={scopes.includes(scope.value)}
                    onCheckedChange={() => toggleScope(scope.value)}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor={`scope-${scope.value}`} className="text-sm font-medium cursor-pointer">
                      {scope.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{scope.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ip-whitelist">IP Whitelist</Label>
            <Textarea
              id="ip-whitelist"
              value={ipWhitelist}
              onChange={(e) => setIpWhitelist(e.target.value)}
              placeholder="192.168.1.1&#10;10.0.0.0/24"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              One IP or CIDR per line. Leave empty to allow all IPs.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires-at">Expiration Date</Label>
            <Input
              id="expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Leave empty for no expiration.
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="api-key-form" type="submit" disabled={saving || !name}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingKey ? "Save Changes" : "Create Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
