"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Heart,
  ImagePlus,
  Trash2,
  Download,
  Music,
  ImageIcon,
  Maximize2,
} from "lucide-react"
import { MediaPreviewDialog, assetName, type PreviewableAsset } from "./media-preview-dialog"
import { Button } from "@/components/ui/button"
import { useMediaStudioStore } from "@/features/media/store"
import {
  useLibraryAssets,
  type LibraryAsset,
} from "@/features/media/use-library-assets"
import { cn } from "@/lib/utils"
import { MODALITY_META } from "./studio-shared"

function toPreviewable(a: LibraryAsset): PreviewableAsset {
  return { ...a, prompt: a.job?.prompt }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function LibraryTab() {
  const [modality, setModality] = useState<"ALL" | "IMAGE" | "AUDIO" | "VIDEO">(
    "ALL"
  )
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [q, setQ] = useState("")
  const [preview, setPreview] = useState<LibraryAsset | null>(null)

  const { addReference } = useMediaStudioStore()

  const { items, loading, setItems } = useLibraryAssets({
    modality,
    favoritesOnly,
    q,
  })

  const remove = async (id: string) => {
    await fetch(`/api/dashboard/media/assets/${id}`, { method: "DELETE" })
    setItems((prev) => prev.filter((a) => a.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  const toggleFav = async (asset: LibraryAsset) => {
    const next = !asset.isFavorite
    setItems((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, isFavorite: next } : a))
    )
    if (preview?.id === asset.id) {
      setPreview({ ...asset, isFavorite: next })
    }
    await fetch(`/api/dashboard/media/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    })
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search prompts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={modality}
          onValueChange={(v) => setModality(v as typeof modality)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="IMAGE">Image</SelectItem>
            <SelectItem value="AUDIO">Audio</SelectItem>
            <SelectItem value="VIDEO">Video</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart className="mr-1 h-3 w-3" /> Favorites
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((a) => {
          const meta = MODALITY_META[a.modality as "IMAGE" | "AUDIO" | "VIDEO"]
          const MIcon = meta.icon
          const name = assetName(a)
          const src = `/api/dashboard/media/assets/${a.id}/download`
          return (
            <div
              key={a.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Preview */}
              <button
                type="button"
                onClick={() => setPreview(a)}
                className="relative block aspect-square w-full overflow-hidden bg-muted"
              >
                {a.modality === "IMAGE" && (
                  <img
                    src={src}
                    alt={name}
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
                      "flex h-full w-full flex-col items-center justify-center",
                      meta.accentBgSoft
                    )}
                  >
                    <Music className={cn("h-12 w-12", meta.accentText)} />
                  </div>
                )}

                {/* modality chip + favorite indicator */}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider backdrop-blur">
                  <MIcon className={cn("h-3 w-3", meta.accentText)} />
                  {a.modality}
                </div>
                {a.isFavorite && (
                  <div className="absolute right-2 top-2 rounded-full bg-background/80 p-1 backdrop-blur">
                    <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
                  </div>
                )}

                {/* expand hint on hover */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                  <div className="rounded-full bg-background/90 p-2.5 shadow-lg">
                    <Maximize2 className="h-4 w-4" />
                  </div>
                </div>
              </button>

              {/* Name + meta */}
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p
                  className="truncate text-sm font-medium leading-tight"
                  title={name}
                >
                  {name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {formatDate(a.createdAt)}
                </p>

                {/* Action row */}
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleFav(a)}
                    title="Favorite"
                  >
                    <Heart
                      className={cn(
                        "h-3.5 w-3.5",
                        a.isFavorite && "fill-rose-500 text-rose-500"
                      )}
                    />
                  </Button>
                  {a.modality === "IMAGE" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => addReference(a.id)}
                      title="Use as reference"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <a href={`${src}?download=1`} download className="inline-flex">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => remove(a.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No assets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generated images, audio, and video will appear here.
          </p>
        </div>
      )}

      <MediaPreviewDialog
        asset={preview ? toPreviewable(preview) : null}
        onClose={() => setPreview(null)}
        onToggleFavorite={(a) => toggleFav(a as unknown as LibraryAsset)}
        onUseAsReference={(a) => addReference(a.id)}
        onDelete={(a) => remove(a.id)}
      />
    </div>
  )
}
