"use client"

/**
 * Superadmin → Knowledge: KB/RAG configuration (embedding, rerank, extraction)
 * stored in the DB and merged over env. Each field shows where its effective
 * value comes from (DB override / env / default). Embedding model or dimension
 * changes require typed confirmation because they invalidate existing vectors.
 * Backed by /api/admin/settings/kb.
 */
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { ModelCombobox, type ComboOption } from "./model-combobox"

interface KbField {
  key: string
  source: "db" | "env" | "default" | "provider"
  secret: boolean
  value?: unknown
  set?: boolean
}

const SECTIONS: { title: string; description: string; keys: string[] }[] = [
  {
    title: "Embedding",
    description:
      "Model + endpoint used to embed documents and queries. Changing the model or dimension " +
      "invalidates existing vectors until documents are re-embedded.",
    keys: ["embeddingModel", "embeddingDim", "embeddingBaseUrl", "embeddingApiKey"],
  },
  {
    title: "Retrieval",
    description: "How many chunks are returned and optional LLM reranking.",
    keys: ["defaultMaxChunks", "rerankEnabled", "rerankModel", "rerankInitialK", "rerankFinalK"],
  },
  {
    title: "Extraction",
    description:
      "How PDFs/scans are turned into text. On-prem setups typically use \"mineru\" as the smart " +
      "fallback with a MinerU sidecar URL.",
    keys: [
      "extractPrimary",
      "extractSmartFallback",
      "extractFallback",
      "extractVisionBaseUrl",
      "extractVisionApiKey",
      "extractMineruBaseUrl",
    ],
  },
]

const LABELS: Record<string, string> = {
  embeddingModel: "Embedding model",
  embeddingDim: "Embedding dimension",
  embeddingBaseUrl: "Embedding base URL",
  embeddingApiKey: "Embedding API key",
  defaultMaxChunks: "Max chunks per query",
  rerankEnabled: "Rerank enabled",
  rerankModel: "Rerank model",
  rerankInitialK: "Rerank initial K",
  rerankFinalK: "Rerank final K",
  extractPrimary: "Primary extractor",
  extractSmartFallback: "Smart-router fallback",
  extractFallback: "Fallback extractor",
  extractVisionBaseUrl: "Vision extraction base URL",
  extractVisionApiKey: "Vision extraction API key",
  extractMineruBaseUrl: "MinerU sidecar URL",
}

const BOOL_KEYS = new Set(["rerankEnabled"])
const INT_KEYS = new Set(["embeddingDim", "defaultMaxChunks", "rerankInitialK", "rerankFinalK"])

// Fields whose value is an LLM id from the model catalog.
const LLM_FIELDS = new Set(["rerankModel"])
// Extraction fields accept non-model sentinels plus a (vision) model id.
const EXTRACT_SENTINELS: Record<string, ComboOption[]> = {
  extractPrimary: [
    { value: "smart", hint: "recommended", description: "Fast text layer first, OCR only when needed" },
    { value: "unpdf", description: "Text-layer only, no OCR (fastest)" },
    { value: "mineru", description: "MinerU sidecar (on-prem OCR) — needs the sidecar URL below" },
    { value: "hybrid", description: "Text layer + vision LLM merge" },
  ],
  extractSmartFallback: [
    { value: "mineru", hint: "on-prem", description: "MinerU sidecar — needs the sidecar URL below" },
    { value: "unpdf", description: "Text-layer only (no OCR fallback)" },
    { value: "hybrid", description: "Text layer + vision LLM merge" },
  ],
  extractFallback: [
    { value: "unpdf", hint: "default", description: "Text-layer only" },
  ],
}
// Known-good embedding models; picking one auto-fills the dimension so the
// classic model/dim mismatch can't happen by accident.
const EMBEDDING_PRESETS: (ComboOption & { dim: number })[] = [
  { value: "qwen/qwen3-embedding-8b", hint: "default · 4096d", dim: 4096 },
  { value: "openai/text-embedding-3-large", hint: "3072d", dim: 3072 },
  { value: "openai/text-embedding-3-small", hint: "1536d", dim: 1536 },
  { value: "baai/bge-m3", hint: "multilingual · 1024d", dim: 1024 },
  { value: "nomic-ai/nomic-embed-text-v1.5", hint: "CPU-friendly · 768d", dim: 768 },
]

function SourceBadge({ source }: { source: KbField["source"] }) {
  if (source === "provider") return <Badge className="text-[10px]">from provider</Badge>
  if (source === "db") return <Badge className="text-[10px]">DB override</Badge>
  if (source === "env") return <Badge variant="secondary" className="text-[10px]">env</Badge>
  return <Badge variant="outline" className="text-[10px]">default</Badge>
}

export function AdminKb() {
  const { toast } = useToast()
  const [fields, setFields] = useState<KbField[]>([])
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [catalog, setCatalog] = useState<ComboOption[]>([])
  const [visionCatalog, setVisionCatalog] = useState<ComboOption[]>([])
  const [providers, setProviders] = useState<{ id: string; name: string; baseUrl: string | null; type: string; enabled: boolean }[]>([])
  const [embeddingProviderId, setEmbeddingProviderId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings/kb")
    if (res.ok) {
      const data = await res.json()
      setFields(data.fields)
      setEmbeddingProviderId(data.embeddingProviderId ?? null)
      setEdits({})
    }
    const providersRes = await fetch("/api/admin/providers")
    if (providersRes.ok) {
      setProviders(((await providersRes.json()).providers as typeof providers).filter((p) => p.enabled))
    }
    // Enabled model catalog feeds the model dropdowns (managed local models too).
    const modelsRes = await fetch("/api/admin/models")
    if (modelsRes.ok) {
      const { models } = (await modelsRes.json()) as {
        models: {
          id: string
          name: string
          enabled: boolean
          isActive: boolean
          hasVision: boolean
          llmProvider: { name: string } | null
          provider: string
        }[]
      }
      const usable = models.filter((m) => m.enabled && m.isActive)
      const toOption = (m: (typeof usable)[number]): ComboOption => ({
        value: m.id,
        label: m.name,
        hint: m.llmProvider?.name ?? m.provider,
      })
      setCatalog(usable.map(toOption))
      setVisionCatalog(usable.filter((m) => m.hasVision).map(toOption))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const dirty = Object.keys(edits).length > 0

  const save = async (confirmEmbeddingChange = false) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings/kb", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: edits, confirmEmbeddingChange }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.requiresEmbeddingConfirmation) {
        setConfirming(true)
        return
      }
      if (!res.ok) {
        toast({ title: "Save failed", description: data.error, variant: "destructive" })
        return
      }
      toast({ title: "KB configuration saved" })
      setConfirming(false)
      setConfirmText("")
      setFields(data.fields)
      setEmbeddingProviderId(data.embeddingProviderId ?? null)
      setEdits({})
    } finally {
      setSaving(false)
    }
  }

  const renderField = (key: string) => {
    const field = fieldByKey.get(key)
    if (!field) return null
    const edited = key in edits
    const currentValue = edited ? edits[key] : field.value

    return (
      <div key={key} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={`kb-${key}`}>{LABELS[key] ?? key}</Label>
          <SourceBadge source={edited ? "db" : field.source} />
          {field.source === "db" && !edited && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setEdits((e) => ({ ...e, [key]: null }))}
            >
              clear override
            </button>
          )}
        </div>
        {BOOL_KEYS.has(key) ? (
          <Switch
            id={`kb-${key}`}
            checked={edited ? edits[key] === true : field.value === true}
            onCheckedChange={(v) => setEdits((e) => ({ ...e, [key]: v }))}
          />
        ) : key === "embeddingModel" ? (
          <ModelCombobox
            id={`kb-${key}`}
            value={currentValue === null ? "" : String(currentValue ?? "")}
            options={EMBEDDING_PRESETS}
            optionsLabel="Known embedding models"
            placeholder="Select or type an embedding model id…"
            onChange={(v) => {
              const preset = EMBEDDING_PRESETS.find((p) => p.value === v)
              // Auto-fill the matching dimension for known models.
              setEdits((prev) =>
                preset ? { ...prev, [key]: v, embeddingDim: preset.dim } : { ...prev, [key]: v }
              )
            }}
          />
        ) : key in EXTRACT_SENTINELS ? (
          <ModelCombobox
            id={`kb-${key}`}
            value={currentValue === null ? "" : String(currentValue ?? "")}
            options={visionCatalog}
            optionsLabel="Vision models"
            sentinels={EXTRACT_SENTINELS[key]}
            sentinelsLabel="Extraction modes"
            placeholder="Select a mode or vision model…"
            onChange={(v) => setEdits((prev) => ({ ...prev, [key]: v }))}
          />
        ) : LLM_FIELDS.has(key) ? (
          <ModelCombobox
            id={`kb-${key}`}
            value={currentValue === null ? "" : String(currentValue ?? "")}
            options={catalog}
            onChange={(v) => setEdits((prev) => ({ ...prev, [key]: v }))}
          />
        ) : field.secret ? (
          <Input
            id={`kb-${key}`}
            type="password"
            placeholder={field.set ? "•••••• (set — leave empty to keep)" : "Not set"}
            value={typeof edits[key] === "string" ? (edits[key] as string) : ""}
            onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
          />
        ) : (
          <Input
            id={`kb-${key}`}
            type={INT_KEYS.has(key) ? "number" : "text"}
            value={currentValue === null ? "" : String(currentValue ?? "")}
            onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
          />
        )}
      </div>
    )
  }

  // Embedding source: a linked managed provider derives endpoint + key, so the
  // manual URL/key fields disappear while one is selected.
  const effectiveEmbeddingProvider =
    "embeddingProviderId" in edits ? (edits.embeddingProviderId as string | null) : embeddingProviderId
  const linkedProvider = providers.find((p) => p.id === effectiveEmbeddingProvider)

  const renderSection = (section: (typeof SECTIONS)[number]) => {
    let keys = section.keys
    if (section.title === "Embedding" && effectiveEmbeddingProvider) {
      keys = keys.filter((k) => k !== "embeddingBaseUrl" && k !== "embeddingApiKey")
    }
    return (
      <section key={section.title} className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{section.title}</h2>
          <p className="text-sm text-muted-foreground">{section.description}</p>
        </div>
        {section.title === "Embedding" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="kb-embedding-source">Embedding source</Label>
              {effectiveEmbeddingProvider && <SourceBadge source="provider" />}
            </div>
            <Select
              value={effectiveEmbeddingProvider ?? "manual"}
              onValueChange={(v) =>
                setEdits((prev) => ({ ...prev, embeddingProviderId: v === "manual" ? null : v }))
              }
            >
              <SelectTrigger id="kb-embedding-source" className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (URL + API key below)</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linkedProvider && (
              <p className="text-xs text-muted-foreground">
                Requests go to{" "}
                <code>
                  {(linkedProvider.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "")}
                  /embeddings
                </code>{" "}
                with that provider&apos;s stored key.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">{keys.map(renderField)}</div>
      </section>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {SECTIONS.map(renderSection)}

      <div className="flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {dirty && (
          <Button variant="outline" onClick={() => setEdits({})} disabled={saving}>
            Discard
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embedding change — re-embedding required</DialogTitle>
            <DialogDescription>
              You are changing the embedding model and/or dimension. Existing documents were
              embedded with the old settings, so retrieval will degrade (or break, on a dimension
              change) until every document is re-embedded. Type <b>REEMBED</b> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="REEMBED"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "REEMBED" || saving}
              onClick={() => save(true)}
            >
              Apply anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
