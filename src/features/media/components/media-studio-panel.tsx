"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, X } from "lucide-react"
import { ParameterForm } from "./parameter-form"
import { ImageResult } from "./result-renderers/image-result"
import { AudioResult } from "./result-renderers/audio-result"
import { useMediaStudioStore, type StoreJob } from "@/features/media/store"

interface ModelInfo {
  id: string
  name: string
  provider: string
  pricingOutput: number
  inputModalities: string[]
}

interface Props {
  modality: "IMAGE" | "AUDIO" | "VIDEO"
  models: ModelInfo[]
  organizationId: string
}

export function MediaStudioPanel({ modality, models, organizationId }: Props) {
  const [prompt, setPrompt] = useState("")
  const [modelId, setModelId] = useState(models[0]?.id ?? "")
  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    jobs,
    upsertJob,
    referenceAssetIds,
    clearReferences,
    toggleFavorite,
    addReference,
  } = useMediaStudioStore()

  const handleGenerate = async () => {
    if (!prompt.trim() || !modelId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/media/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modality,
          modelId,
          prompt,
          parameters,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs = jobs.filter((j) => j.modality === modality)

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Describe the ${modality.toLowerCase()} you want to generate…`}
          rows={5}
        />

        <div>
          <label className="text-xs font-medium uppercase text-muted-foreground">Model</label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger><SelectValue placeholder="Pick a model" /></SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.provider} — {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {referenceAssetIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">References:</span>
            {referenceAssetIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
                {id.slice(0, 8)}…
                <button onClick={() => clearReferences()}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <ParameterForm
          modality={modality}
          parameters={parameters}
          onChange={setParameters}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">
          Recent {modality.toLowerCase()}s
        </h3>
        {filteredJobs.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing yet. Generate something!</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredJobs.flatMap((j) =>
            j.assets.map((a) => {
              const onToggle = () => {
                toggleFavorite(a.id, !a.isFavorite)
                fetch(`/api/dashboard/media/assets/${a.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ isFavorite: !a.isFavorite }),
                })
              }
              if (a.modality === "IMAGE") {
                return (
                  <ImageResult
                    key={a.id}
                    asset={a}
                    onToggleFavorite={onToggle}
                    onUseAsReference={() => addReference(a.id)}
                  />
                )
              }
              if (a.modality === "AUDIO") {
                return <AudioResult key={a.id} asset={a} onToggleFavorite={onToggle} />
              }
              return (
                <div key={a.id} className="rounded border bg-muted p-3 text-xs text-muted-foreground">
                  Video preview coming next
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
