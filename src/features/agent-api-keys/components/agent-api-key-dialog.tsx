"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, ShieldCheck } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
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
import type { Assistant } from "@/lib/types/assistant"
import type { AgentApiReadiness } from "@/hooks/use-agent-api-readiness"
import {
  API_KEY_SCOPES,
  EMPTY_KEY_FORM,
  capabilityWarning,
  createKeyBody,
  formFromKey,
  updateKeyBody,
  type AgentApiKey,
  type KeyForm,
} from "./key-types"

/**
 * Mint or edit one key. On a create the agent is chosen here, and the capability warning sits
 * next to the submit button: a key for an agent bound to the knowledge base, MCP, a skill or a
 * workflow would answer 409 `capability_not_ported` on every call.
 */
export function AgentApiKeyDialog({
  open,
  editing,
  assistants,
  readiness,
  assistantId,
  onAssistantChange,
  busy,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  editing: AgentApiKey | null
  assistants: Assistant[]
  readiness: AgentApiReadiness
  /** The agent chosen in the parent, so the capability check follows it. */
  assistantId: string
  onAssistantChange: (assistantId: string) => void
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (body: ReturnType<typeof createKeyBody> | ReturnType<typeof updateKeyBody>) => void
}) {
  const [form, setForm] = useState<KeyForm>(() =>
    editing
      ? formFromKey(editing)
      : { ...EMPTY_KEY_FORM, assistantId },
  )

  const toggleScope = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      scopes: checked
        ? [...new Set([...current.scopes, id])]
        : current.scopes.filter((scope) => scope !== id),
    }))
  }

  const warning = capabilityWarning(readiness.blockers)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(editing ? updateKeyBody(form) : createKeyBody(form))
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? `Edit “${editing.name}”` : "New agent API key"}</DialogTitle>
            <DialogDescription>
              A key belongs to one agent and carries that agent&apos;s access; it acts as the
              agent, never as a person.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Support widget"
                disabled={busy}
              />
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="key-assistant">Agent</Label>
                <Select
                  value={form.assistantId}
                  onValueChange={(value) => {
                    setForm((current) => ({ ...current, assistantId: value }))
                    onAssistantChange(value)
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="key-assistant">
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants.map((assistant) => (
                      <SelectItem key={assistant.id} value={assistant.id}>
                        {assistant.emoji} {assistant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Scopes</legend>
              <p className="text-xs text-muted-foreground">
                No scope selected allows both, as an empty list does.
              </p>
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={form.scopes.includes(scope.id)}
                    onCheckedChange={(checked) => toggleScope(scope.id, checked === true)}
                    disabled={busy}
                    aria-label={scope.label}
                  />
                  <span>
                    <span className="font-medium">{scope.label}</span>{" "}
                    <code className="text-xs text-muted-foreground">{scope.id}</code>
                    <span className="block text-xs text-muted-foreground">{scope.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="key-allowlist">IP allowlist</Label>
              <Input
                id="key-allowlist"
                value={form.ipWhitelist}
                onChange={(event) => setForm({ ...form, ipWhitelist: event.target.value })}
                placeholder="203.0.113.9, 10.0.0.0/8"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Empty allows every address. Behind a proxy the address is the proxy&apos;s unless
                the deployment lists its ranges in <code>TRUSTED_PROXIES</code> —{" "}
                <span className="whitespace-nowrap">docs/operations/network.md</span>.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-expiry">Expires</Label>
              <Input
                id="key-expiry"
                type="datetime-local"
                step={1}
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for a key that never expires.
              </p>
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="key-enabled" className="text-sm">
                    Enabled
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A disabled key is refused on both transports.
                  </p>
                </div>
                <Switch
                  id="key-enabled"
                  checked={form.enabled}
                  onCheckedChange={(value) => setForm({ ...form, enabled: value })}
                  disabled={busy}
                />
              </div>
            )}

            {readiness.loading && !editing && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking what the agent is bound to...
              </p>
            )}
            {warning && (
              <div className="flex items-start gap-2 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-4" />
                <span>
                  {warning}
                  <a
                    className="ml-1 underline underline-offset-2"
                    href="https://github.com/RantAI-dev/RantAI-Agents/blob/main/docs/operations/agent-api.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    The agent API runbook
                  </a>
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy || !form.name.trim() || (!editing && !form.assistantId)
              }
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {editing ? "Save key" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
