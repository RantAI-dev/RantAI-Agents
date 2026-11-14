"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  AlertCircle,
  CheckCircle,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { useAssistants } from "@/hooks/use-assistants"
import type { AgentApiKeyResponse } from "@/features/agent-api-keys/service"

const KEYS_PATH = "/api/dashboard/agent-api-keys"

/**
 * Agent API keys: one key per agent, for the platforms that call the agent over HTTP or the
 * WebSocket. The plain key is shown once, on the answer that created it; after that only the mask
 * comes back (design §3.6).
 */
export default function AgentApiKeysPage() {
  const orgFetch = useOrgFetch()
  const { isAdmin } = useOrganization()
  const keys = useApiResource<AgentApiKeyResponse[]>(isAdmin ? KEYS_PATH : null)
  const { assistants } = useAssistants()

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [assistantId, setAssistantId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<AgentApiKeyResponse | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may manage agent API keys.
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
      keys.reload()
      return true
    } catch {
      setError("We could not reach the server. Try again.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await orgFetch(KEYS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), assistantId }),
      })
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      const key = (await response.json()) as AgentApiKeyResponse
      setCreated(key)
      setCreateOpen(false)
      setName("")
      setAssistantId("")
      keys.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const rows = keys.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="h-5 w-5" />
            Agent API keys
          </h2>
          <p className="text-sm text-muted-foreground">
            Keys other platforms use to call an agent over HTTP or the WebSocket. A key acts as the
            agent itself, never as a person.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New key
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {keys.error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {keys.error}
        </div>
      )}

      {created && (
        <Card className="border-chart-2/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Copy this key now</CardTitle>
            <CardDescription>
              It is shown once. Store it where the other platform can read it; it cannot be read
              back here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{created.key}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.key)
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Keys</CardTitle>
          <CardDescription>{rows.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {keys.loading && !keys.data ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading keys...
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {key.name}
                      <Badge variant={key.enabled ? "default" : "secondary"} className="ml-2 text-[10px]">
                        {key.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {key.assistant ? `${key.assistant.emoji ?? ""} ${key.assistant.name}` : key.assistantId}
                      {" · "}
                      <code>{key.key}</code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {key.lastUsedAt
                        ? `last used ${formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}`
                        : "never used"}
                      {" · "}
                      {key.requestCount} requests
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enabled-${key.id}`} className="text-xs text-muted-foreground">
                      Enabled
                    </Label>
                    <Switch
                      id={`enabled-${key.id}`}
                      checked={key.enabled}
                      disabled={busy}
                      onCheckedChange={(value) =>
                        run(() =>
                          orgFetch(`${KEYS_PATH}/${key.id}`, {
                            method: "PUT",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ enabled: value }),
                          }),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete ${key.name}`}
                      disabled={busy}
                      onClick={() => run(() => orgFetch(`${KEYS_PATH}/${key.id}`, { method: "DELETE" }))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>New agent API key</DialogTitle>
              <DialogDescription>
                The key belongs to one agent and carries that agent&apos;s access.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Support widget"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-assistant">Agent</Label>
                <Select value={assistantId} onValueChange={setAssistantId} disabled={busy}>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim() || !assistantId}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
