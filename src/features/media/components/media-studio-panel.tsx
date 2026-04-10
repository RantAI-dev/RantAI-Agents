"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  Sparkles,
  X,
  Wand2,
  Minus,
  Plus,
  Dices,
  ImagePlus,
  Upload,
  Music,
  Maximize2,
} from "lucide-react"
import { ParameterForm } from "./parameter-form"
import { MediaPreviewDialog, type PreviewableAsset } from "./media-preview-dialog"
import { useMediaStudioStore, type StoreJob } from "@/features/media/store"
import { getCapability, referenceRoleLabel } from "@/features/media/model-capabilities"
import {
  GeneratingOverlay,
  MODALITY_META,
  SectionLabel,
  STYLE_PRESETS,
  STYLE_PROMPT_SUFFIX,
  StyleChip,
  type Modality,
} from "./studio-shared"
import { cn } from "@/lib/utils"

interface ModelInfo {
  id: string
  name: string
  provider: string
  pricingOutput: number
  inputModalities: string[]
}

interface Props {
  modality: Modality
  models: ModelInfo[]
  organizationId: string
}

export function MediaStudioPanel({ modality, models }: Props) {
  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [showNegative, setShowNegative] = useState(false)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999_999))
  const [modelId, setModelId] = useState(models[0]?.id ?? "")
  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [stylePreset, setStylePreset] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    jobs,
    upsertJob,
    referenceAssetIds,
    clearReferences,
    toggleFavorite,
    addReference,
    removeReference,
  } = useMediaStudioStore()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<PreviewableAsset | null>(null)

  // Auto-grow the prompt textarea to fit content (up to ~12 lines).
  useEffect(() => {
    const el = promptRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 288)}px`
  }, [prompt])

  const capability = useMemo(
    () => getCapability(modelId, modality),
    [modelId, modality]
  )
  const supportsImageInput = capability.maxReferenceImages > 0
  const refCount = referenceAssetIds.length
  const atCapacity = refCount >= capability.maxReferenceImages
  const refLabel = referenceRoleLabel(
    capability.referenceRole,
    capability.maxReferenceImages
  )

  // Trim references when switching to a model with a smaller cap.
  useEffect(() => {
    if (refCount > capability.maxReferenceImages) {
      const keep = referenceAssetIds.slice(0, capability.maxReferenceImages)
      clearReferences()
      keep.forEach((id) => addReference(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability.maxReferenceImages, modelId])

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/dashboard/media/uploads", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      const { assetId } = (await res.json()) as { assetId: string }
      addReference(assetId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const meta = MODALITY_META[modality]
  const presets = STYLE_PRESETS[modality]
  const Icon = meta.icon

  const handleGenerate = async () => {
    if (!prompt.trim() || !modelId) return
    setLoading(true)
    setError(null)
    try {
      // Split UI-only hints (not supported by OpenRouter) from real provider params.
      const {
        detail,
        fps,
        motionStrength,
        bpm,
        ...providerParams
      } = parameters as {
        detail?: number
        fps?: number
        motionStrength?: number
        bpm?: number
        [k: string]: unknown
      }

      const hints: string[] = []
      if (stylePreset) hints.push(STYLE_PROMPT_SUFFIX[stylePreset] ?? stylePreset)
      if (typeof detail === "number") {
        if (detail >= 80) hints.push("ultra detailed, intricate")
        else if (detail >= 50) hints.push("detailed")
        else if (detail < 30) hints.push("minimal detail, clean")
      }
      if (typeof fps === "number") hints.push(`${fps}fps`)
      if (typeof motionStrength === "number") {
        if (motionStrength >= 75) hints.push("dynamic motion, fast paced")
        else if (motionStrength <= 25) hints.push("subtle motion, slow")
      }
      if (typeof bpm === "number") hints.push(`${bpm} BPM`)

      let styled = prompt.trim()
      if (hints.length) styled += `, ${hints.join(", ")}`
      if (negativePrompt.trim()) {
        styled += `\n\nAvoid: ${negativePrompt.trim()}`
      }

      const res = await fetch("/api/dashboard/media/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modality,
          modelId,
          prompt: styled,
          parameters: { ...providerParams, seed },
          referenceAssetIds,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `${res.status}`)
      }
      const job: StoreJob = await res.json()
      upsertJob(job)
      clearReferences()
      // Auto-open the preview on the first asset of the finished job so the
      // user sees the result in expanded mode immediately after creation.
      if (job.assets?.length) {
        const first = job.assets[0]
        setPreview({ ...first, prompt: job.prompt })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs = useMemo(
    () => jobs.filter((j) => j.modality === modality),
    [jobs, modality]
  )

  const selectedModel = models.find((m) => m.id === modelId)

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Hero prompt card */}
        <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* accent bar */}
          <div className={cn("absolute inset-x-0 top-0 h-[2px]", meta.heroBarGradient)} />
          {/* subtle backdrop glow */}
          <div
            className={cn(
              "pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl",
              meta.accentBgSoft
            )}
          />

          {loading && <GeneratingOverlay modality={modality} prompt={prompt} />}

          <div className="relative p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-3.5 w-3.5", meta.accentText)} />
                <SectionLabel>{meta.promptHint}</SectionLabel>
              </div>
              <span className="font-mono text-[9px] tabular-nums text-muted-foreground/60">
                {prompt.length}
              </span>
            </div>

            <Textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate()
              }}
              placeholder={meta.placeholder}
              rows={3}
              className="min-h-[96px] resize-none overflow-hidden border-0 bg-transparent px-3 text-base leading-relaxed tracking-[-0.005em] shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            {showNegative && (
              <div className="mt-3 border-t pt-3">
                <SectionLabel>Negative prompt</SectionLabel>
                <Textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder={
                    modality === "AUDIO"
                      ? "distortion, clipping, noise…"
                      : "blurry, low quality, distorted, watermark…"
                  }
                  rows={2}
                  className="resize-none border-0 bg-transparent px-3 text-sm leading-relaxed text-muted-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            )}

            {supportsImageInput && (
              <div className="mt-3 border-t pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <SectionLabel>{refLabel}</SectionLabel>
                    <span className="font-mono text-[9px] text-muted-foreground/70">
                      {refCount}/{capability.maxReferenceImages}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {refCount > 0 && (
                      <button
                        type="button"
                        onClick={() => clearReferences()}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      disabled={uploading || atCapacity}
                      title={
                        atCapacity
                          ? `Max ${capability.maxReferenceImages} reference${capability.maxReferenceImages === 1 ? "" : "s"} for this model`
                          : undefined
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                        "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        (uploading || atCapacity) && "cursor-not-allowed opacity-50"
                      )}
                    >
                      {uploading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      Upload image
                    </button>
                  </div>
                </div>

                {refCount === 0 ? (
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-xs text-muted-foreground transition-colors",
                      "hover:border-foreground/30 hover:text-foreground",
                      uploading && "opacity-50"
                    )}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {capability.referenceRole === "i2v" ||
                    capability.referenceRole === "first-last"
                      ? "Add a starting image for image-to-video"
                      : "Add a reference image to edit"}
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {referenceAssetIds.map((id, idx) => {
                      const isFirstLast =
                        capability.referenceRole === "first-last" &&
                        capability.maxReferenceImages > 1
                      const slotLabel = isFirstLast
                        ? idx === 0
                          ? "First"
                          : "Last"
                        : null
                      return (
                        <div
                          key={id}
                          className="group relative h-16 w-16 overflow-hidden rounded-md border bg-muted"
                        >
                          <img
                            src={`/api/dashboard/media/assets/${id}/download`}
                            alt="reference"
                            className="h-full w-full object-cover"
                          />
                          {slotLabel && (
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white">
                              {slotLabel}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeReference(id)}
                            className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                    {/* Add-more tile (hidden at capacity) */}
                    {!atCapacity && (
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={uploading}
                        title="Add another image"
                        className={cn(
                          "flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-all",
                          "hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground",
                          uploading && "opacity-50"
                        )}
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </button>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNegative((s) => !s)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                    showNegative
                      ? cn(meta.accentBorder, meta.accentBgSoft, meta.accentText)
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {showNegative ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  Negative
                </button>
                <button
                  type="button"
                  onClick={() => setSeed(Math.floor(Math.random() * 999_999))}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  title="Reroll seed"
                >
                  <Dices className="h-3 w-3" />
                  seed: {seed}
                </button>
                <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground/70 sm:flex">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">⌘</kbd>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">↵</kbd>
                </span>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim() || !modelId}
                className="ml-auto h-10 gap-2 px-6 shadow-md disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {meta.cta}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Style presets */}
        <div>
          <SectionLabel>Style preset</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <StyleChip
              selected={stylePreset === null}
              icon="∅"
              label="None"
              onClick={() => setStylePreset(null)}
              meta={meta}
            />
            {presets.map((p) => (
              <StyleChip
                key={p.id}
                selected={stylePreset === p.id}
                icon={p.icon}
                label={p.label}
                onClick={() => setStylePreset(p.id)}
                meta={meta}
              />
            ))}
          </div>
        </div>

        {/* Recent results */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <SectionLabel>Recent {modality.toLowerCase()}s</SectionLabel>
            {filteredJobs.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 text-center">
              <div
                className={cn(
                  "mb-3 flex h-12 w-12 items-center justify-center rounded-full",
                  meta.accentBgSoft
                )}
              >
                <Sparkles className={cn("h-5 w-5", meta.accentText)} />
              </div>
              <p className="text-sm font-medium">Nothing here yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your generated {modality.toLowerCase()}s will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filteredJobs.flatMap((j) =>
                j.assets.map((a) => {
                  const previewable: PreviewableAsset = { ...a, prompt: j.prompt }
                  const src = `/api/dashboard/media/assets/${a.id}/download`
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setPreview(previewable)}
                      className="group relative block aspect-square overflow-hidden rounded-xl border bg-muted shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {a.modality === "IMAGE" && (
                        <img
                          src={src}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      )}
                      {a.modality === "VIDEO" && (
                        <video
                          src={src}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                        />
                      )}
                      {a.modality === "AUDIO" && (
                        <div
                          className={cn(
                            "flex h-full w-full items-center justify-center",
                            meta.accentBgSoft
                          )}
                        >
                          <Music className={cn("h-10 w-10", meta.accentText)} />
                        </div>
                      )}
                      {a.isFavorite && (
                        <div className="absolute right-2 top-2 rounded-full bg-background/80 p-1 backdrop-blur">
                          <Sparkles className="h-3 w-3 fill-rose-500 text-rose-500" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                        <div className="rounded-full bg-background/90 p-2 shadow-lg">
                          <Maximize2 className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
        {/* Model */}
        <div className="rounded-xl border bg-card p-4">
          <SectionLabel>Model</SectionLabel>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="h-9 w-full min-w-0 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left">
              <SelectValue placeholder="Pick a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.provider} — {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parameters */}
        <div className="rounded-xl border bg-card p-4">
          <SectionLabel>Parameters</SectionLabel>
          <ParameterForm
            modality={modality}
            parameters={parameters}
            onChange={setParameters}
            capability={capability}
          />
        </div>

        {/* Config readout */}
        <div className="rounded-xl border bg-card p-4">
          <SectionLabel>Config</SectionLabel>
          <dl className="space-y-1.5 font-mono text-[11px]">
            <ConfigRow k="Modality" v={modality} />
            <ConfigRow k="Model" v={selectedModel?.name ?? "—"} />
            <ConfigRow k="Provider" v={selectedModel?.provider ?? "—"} />
            <ConfigRow k="Style" v={stylePreset ?? "none"} />
            <ConfigRow k="Seed" v={String(seed)} />
            {negativePrompt.trim() && <ConfigRow k="Negative" v="on" />}
            {Object.entries(parameters).map(([k, v]) => (
              <ConfigRow key={k} k={k} v={String(v)} />
            ))}
          </dl>
        </div>

      </aside>

      <MediaPreviewDialog
        asset={preview}
        onClose={() => setPreview(null)}
        onToggleFavorite={(a) => {
          const next = !a.isFavorite
          toggleFavorite(a.id, next)
          setPreview({ ...a, isFavorite: next })
          fetch(`/api/dashboard/media/assets/${a.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isFavorite: next }),
          })
        }}
        onUseAsReference={(a) => addReference(a.id)}
      />
    </div>
  )
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground/70">{k}</dt>
      <dd className="truncate text-foreground/80">{v}</dd>
    </div>
  )
}
