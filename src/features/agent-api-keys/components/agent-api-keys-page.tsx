"use client"

import { useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  AlertCircle,
  CheckCircle,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { useAgentApiReadiness } from "@/hooks/use-agent-api-readiness"
import { useAssistants } from "@/hooks/use-assistants"
import { readApiError } from "@/lib/api/error"
import { AgentApiKeyDialog } from "./agent-api-key-dialog"
import type { AgentApiKey } from "./key-types"

const KEYS_PATH = "/api/dashboard/agent-api-keys"

const AGENT_API_DOCS =
  "https://github.com/RantAI-dev/RantAI-Agents/blob/main/docs/operations/agent-api.md"

/**
 * Agent API keys: one key per agent, for the platforms that reach the agent over HTTP or the
 * WebSocket. The whole key is shown once, on the 201 that minted it; every later read carries
 * the mask (design §3.6).
 */
export default function AgentApiKeysPage() {
  const orgFetch = useOrgFetch()
  const { isAdmin } = useOrganization()
  const keys = useApiResource<AgentApiKey[]>(isAdmin ? KEYS_PATH : null)
  const { assistants } = useAssistants()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AgentApiKey | null>(null)
  const [formAgentId, setFormAgentId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<AgentApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  const formAgent = useMemo(
    () => assistants.find((assistant) => assistant.id === formAgentId) ?? null,
    [assistants, formAgentId],
  )
  const readiness = useAgentApiReadiness(dialogOpen ? formAgentId || null : null, formAgent)

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may manage agent API keys.
        </CardContent>
      </Card>
    )
  }

  const openCreate = () => {
    setEditing(null)
    setFormAgentId("")
    setError(null)
    setDialogOpen(true)
  }

  const openEdit = (key: AgentApiKey) => {
    setEditing(key)
    setFormAgentId(key.assistantId)
    setError(null)
    setDialogOpen(true)
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

  const submit = async (body: unknown) => {
    if (editing) {
      const done = await run(() =>
        orgFetch(`${KEYS_PATH}/${editing.id}`, {
          // PUT, not PATCH: Rust takes both, and the TypeScript route only takes PUT, so the
          // screen works before and after the `agent-api` cut-over.
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      )
      if (done) setDialogOpen(false)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const response = await orgFetch(KEYS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      const key = (await response.json()) as AgentApiKey
      setCreated(key)
      setDialogOpen(false)
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
            Keys other platforms use to call an agent over HTTP (<code>/v1/chat/completions</code>)
            or the WebSocket. A key acts as the agent itself, never as a person.{" "}
            <a className="underline underline-offset-2" href={AGENT_API_DOCS} target="_blank" rel="noreferrer">
              The runbook
            </a>
            .
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
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
              It is in this answer and in no other. Store it where the other platform can read it;
              the list below shows only its mask.
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
          <CardDescription>
            {rows.length} configured. An empty IP allowlist lets every address in; behind a proxy
            the address is the proxy&apos;s unless the deployment lists its ranges in{" "}
            <code>TRUSTED_PROXIES</code> (docs/operations/network.md).
          </CardDescription>
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
                <li key={key.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-sm font-medium">
                      {key.name}
                      <Badge variant={key.enabled ? "default" : "secondary"} className="text-[10px]">
                        {key.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {key.expiresAt && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          expires {new Date(key.expiresAt).toLocaleDateString()}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {key.assistant
                        ? `${key.assistant.emoji ?? ""} ${key.assistant.name}`
                        : `${key.assistantId} (deleted)`}
                      {" · "}
                      <code>{key.key}</code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      scopes {key.scopes.length > 0 ? key.scopes.join(", ") : "all"} · allowlist{" "}
                      {key.ipWhitelist.length > 0 ? key.ipWhitelist.join(", ") : "any address"}
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => openEdit(key)}
                      aria-label={`Edit ${key.name}`}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
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

      {dialogOpen && (
        <AgentApiKeyDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          editing={editing}
          assistants={assistants}
          readiness={readiness}
          assistantId={formAgentId}
          onAssistantChange={setFormAgentId}
          busy={busy}
          error={error}
          onOpenChange={setDialogOpen}
          onSubmit={(body) => void submit(body)}
        />
      )}
    </div>
  )
}
