"use client"

/**
 * Superadmin → Models: manage LLM providers (OpenRouter / any OpenAI-compatible
 * endpoint incl. local vLLM/Ollama) and the model catalog (enable/disable,
 * platform default, discovery, manual add). Backed by /api/admin/providers*
 * and /api/admin/models*.
 */
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Plus, RefreshCw, Search, Star, Trash2 } from "@/lib/icons"

interface Provider {
  id: string
  name: string
  type: "openrouter" | "openai_compatible"
  baseUrl: string | null
  keyHint: string | null
  enabled: boolean
  modelCount: number
}

interface AdminModel {
  id: string
  name: string
  provider: string
  providerId: string | null
  source: string
  enabled: boolean
  isActive: boolean
  isFree: boolean
  hasVision: boolean
  hasToolCalling: boolean
  contextWindow: number
  llmProvider: { name: string } | null
}

export function AdminModels() {
  return (
    <Tabs defaultValue="providers">
      <TabsList>
        <TabsTrigger value="providers">Providers</TabsTrigger>
        <TabsTrigger value="models">Models</TabsTrigger>
      </TabsList>
      <TabsContent value="providers" className="mt-4">
        <ProvidersTab />
      </TabsContent>
      <TabsContent value="models" className="mt-4">
        <ModelsTab />
      </TabsContent>
    </Tabs>
  )
}

// ─── Providers ───────────────────────────────────────────────────────

function ProvidersTab() {
  const { toast } = useToast()
  const [providers, setProviders] = useState<Provider[]>([])
  const [editing, setEditing] = useState<Provider | "new" | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/providers")
    if (res.ok) setProviders((await res.json()).providers)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const test = async (p: Provider) => {
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/admin/providers/${p.id}/test`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: `${p.name}: connection failed`, description: data.error, variant: "destructive" })
      } else {
        toast({ title: `${p.name}: connected`, description: `${data.modelCount} models visible` })
      }
    } finally {
      setBusyId(null)
    }
  }

  const discover = async (p: Provider) => {
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/admin/providers/${p.id}/discover`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: `${p.name}: discovery failed`, description: data.error, variant: "destructive" })
      } else {
        toast({
          title: `${p.name}: models discovered`,
          description: `${data.discovered} found${data.removed ? `, ${data.removed} stale removed` : ""}`,
        })
        void load()
      }
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (p: Provider) => {
    if (!window.confirm(`Delete provider "${p.name}"? Its discovered models are removed too.`)) return
    const res = await fetch(`/api/admin/providers/${p.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast({ title: "Delete failed", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: `Provider "${p.name}" deleted` })
    void load()
  }

  const toggleEnabled = async (p: Provider, enabled: boolean) => {
    const res = await fetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
    if (res.ok) void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Point chat models at OpenRouter or any OpenAI-compatible endpoint (vLLM, Ollama with
          <code className="mx-1">/v1</code>, TGI, LM Studio). Keys are encrypted at rest.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4 mr-1" /> Add provider
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>API key</TableHead>
              <TableHead>Models</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {p.type === "openrouter" ? "OpenRouter" : "OpenAI-compatible"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-56 truncate font-mono text-xs">
                  {p.baseUrl ?? "openrouter.ai"}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.keyHint ?? "—"}</TableCell>
                <TableCell>{p.modelCount}</TableCell>
                <TableCell>
                  <Switch checked={p.enabled} onCheckedChange={(v) => toggleEnabled(p, v)} />
                </TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button variant="outline" size="sm" disabled={busyId === p.id} onClick={() => test(p)}>
                    Test
                  </Button>
                  {p.type === "openai_compatible" && (
                    <Button variant="outline" size="sm" disabled={busyId === p.id} onClick={() => discover(p)}>
                      Discover models
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No managed providers yet — chat uses the OPENROUTER_API_KEY from the environment.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProviderDialog
        editing={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void load()
        }}
      />
    </div>
  )
}

function ProviderDialog({
  editing,
  onOpenChange,
  onSaved,
}: {
  editing: Provider | "new" | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isNew = editing === "new"
  const existing = editing !== null && editing !== "new" ? editing : null
  const [name, setName] = useState("")
  const [type, setType] = useState("openai_compatible")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(existing?.name ?? "")
    setType(existing?.type ?? "openai_compatible")
    setBaseUrl(existing?.baseUrl ?? "")
    setApiKey("")
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name, type, baseUrl: baseUrl || null }
      if (apiKey) body.apiKey = apiKey
      const res = await fetch(isNew ? "/api/admin/providers" : `/api/admin/providers/${existing!.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Save failed", description: data.error, variant: "destructive" })
        return
      }
      toast({ title: isNew ? "Provider added" : "Provider updated" })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add provider" : `Edit ${existing?.name}`}</DialogTitle>
          <DialogDescription>
            For local/self-hosted models use the OpenAI-compatible type with the server&apos;s
            <code className="mx-1">/v1</code> base URL, e.g. <code>http://10.0.0.5:8000/v1</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="On-prem vLLM" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType} disabled={!isNew}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai_compatible">OpenAI-compatible endpoint</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "openai_compatible" && (
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API key {existing?.keyHint ? `(current: ${existing.keyHint})` : ""}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={existing?.keyHint ? "Leave empty to keep the current key" : "Optional for local servers"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Models ──────────────────────────────────────────────────────────

function ModelsTab() {
  const { toast } = useToast()
  const [models, setModels] = useState<AdminModel[]>([])
  const [defaultModelId, setDefaultModelId] = useState("")
  const [providers, setProviders] = useState<Provider[]>([])
  const [search, setSearch] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [addOpen, setAddOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (providerFilter !== "all") params.set("providerId", providerFilter)
    const [modelsRes, providersRes] = await Promise.all([
      fetch(`/api/admin/models?${params}`),
      fetch("/api/admin/providers"),
    ])
    if (modelsRes.ok) {
      const data = await modelsRes.json()
      setModels(data.models)
      setDefaultModelId(data.defaultModelId)
    }
    if (providersRes.ok) setProviders((await providersRes.json()).providers)
  }, [search, providerFilter])

  useEffect(() => {
    void load()
  }, [load])

  const patchModel = async (body: Record<string, unknown>, okMessage: string) => {
    const res = await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ title: "Update failed", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: okMessage })
    void load()
  }

  const removeModel = async (m: AdminModel) => {
    if (!window.confirm(`Remove model "${m.id}" from the catalog?`)) return
    const res = await fetch("/api/admin/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ title: "Remove failed", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: `Model removed`, description: m.id })
    void load()
  }

  const syncOpenRouter = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/models/sync", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" })
      } else {
        toast({ title: "OpenRouter sync complete", description: `${data.synced} models synced` })
        void load()
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search models…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            <SelectItem value="legacy">OpenRouter catalog</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={syncOpenRouter} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync OpenRouter
        </Button>
        <Button onClick={() => setAddOpen(true)} disabled={providers.filter((p) => p.type !== "openrouter").length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add model
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Served by</TableHead>
              <TableHead>Capabilities</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id} className={!m.enabled || !m.isActive ? "opacity-60" : undefined}>
                <TableCell>
                  <div className="flex items-center gap-1.5 font-medium">
                    {m.name}
                    {m.id === defaultModelId && (
                      <Badge variant="default" className="gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5" /> Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{m.id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{m.llmProvider?.name ?? "OpenRouter (env)"}</Badge>
                  {m.source !== "openrouter_sync" && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {m.source}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="space-x-1">
                  {m.hasToolCalling && <Badge variant="outline" className="text-[10px]">tools</Badge>}
                  {m.hasVision && <Badge variant="outline" className="text-[10px]">vision</Badge>}
                  {m.isFree && <Badge variant="outline" className="text-[10px]">free</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : "—"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(v) =>
                      patchModel({ id: m.id, enabled: v }, v ? "Model enabled" : "Model disabled")
                    }
                  />
                </TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  {m.id !== defaultModelId && m.enabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patchModel({ id: m.id, default: true }, `Default model set to ${m.name}`)}
                    >
                      Set default
                    </Button>
                  )}
                  {m.source !== "openrouter_sync" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeModel(m)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {models.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No models found. Run &quot;Sync OpenRouter&quot; or discover models from a provider.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AddModelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        providers={providers.filter((p) => p.type !== "openrouter")}
        onAdded={() => void load()}
      />
    </div>
  )
}

function AddModelDialog({
  open,
  onOpenChange,
  providers,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: Provider[]
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [providerId, setProviderId] = useState("")
  const [contextWindow, setContextWindow] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: name || undefined,
          providerId,
          contextWindow: contextWindow ? Number(contextWindow) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Add failed", description: data.error, variant: "destructive" })
        return
      }
      toast({ title: "Model added", description: id })
      onOpenChange(false)
      setId("")
      setName("")
      setContextWindow("")
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add model manually</DialogTitle>
          <DialogDescription>
            For servers without a /models endpoint. The id must match what the endpoint expects in
            the <code>model</code> field.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model id</Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="qwen3-32b-instruct" />
          </div>
          <div className="space-y-1.5">
            <Label>Display name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Context window (optional)</Label>
            <Input
              type="number"
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
              placeholder="32768"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !id || !providerId}>
            {saving ? "Adding…" : "Add model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
