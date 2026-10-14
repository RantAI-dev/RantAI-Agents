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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Copy, Check, AlertTriangle } from "@/lib/icons"
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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
    setSubmitError(null)
    setCreatedKey(null)
    setCopied(false)
  }, [editingKey, open])

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleCopy = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setSaving(true)
    setSubmitError(null)
    try {
      const ips = ipWhitelist
        .split("\n")
        .map((ip) => ip.trim())
        .filter(Boolean)

      const result = await onSave({
        name,
        assistantId,
        scopes,
        ipWhitelist: ips,
        ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
      })
      if (editingKey) {
        onOpenChange(false)
      } else if (result && typeof result === "object" && "key" in result && typeof (result as { key: unknown }).key === "string") {
        setCreatedKey((result as { key: string }).key)
      } else {
        onOpenChange(false)
      }
    } catch (err) {
      // Surface the real reason (plan limit, permissions, …) instead of closing
      // the dialog with no feedback.
      setSubmitError(
        err instanceof Error ? err.message : "Couldn't save the API key. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (createdKey) {
    return (
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            setCreatedKey(null)
            setCopied(false)
          }
          onOpenChange(val)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Your API Key</DialogTitle>
            <DialogDescription>
              Please copy your API key now. You won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Copy it now — you won&apos;t be able to see it again once you close this dialog.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdKey}
                  className="font-mono text-xs select-all bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy API key"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setCreatedKey(null)
                setCopied(false)
                onOpenChange(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
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

        {submitError && (
          <p className="text-sm text-destructive px-1">{submitError}</p>
        )}

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
