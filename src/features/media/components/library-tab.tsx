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
import { Heart, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMediaStudioStore } from "@/features/media/store"
import { useLibraryAssets, type LibraryAsset } from "@/features/media/use-library-assets"

export function LibraryTab() {
  const [modality, setModality] = useState<"" | "IMAGE" | "AUDIO" | "VIDEO">("")
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [q, setQ] = useState("")

  const { addReference } = useMediaStudioStore()

  const { items, loading, setItems } = useLibraryAssets({ modality, favoritesOnly, q })

  const remove = async (id: string) => {
    await fetch(`/api/dashboard/media/assets/${id}`, { method: "DELETE" })
    setItems((prev) => prev.filter((a) => a.id !== id))
  }

  const toggleFav = async (asset: LibraryAsset) => {
    const next = !asset.isFavorite
    setItems((prev) => prev.map((a) => (a.id === asset.id ? { ...a, isFavorite: next } : a)))
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
        <Select value={modality} onValueChange={(v) => setModality(v as typeof modality)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((a) => (
          <div key={a.id} className="group relative overflow-hidden rounded-md border bg-muted">
            {a.modality === "IMAGE" && (
              <img
                src={`/api/dashboard/media/assets/${a.id}/download`}
                alt=""
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            )}
            {a.modality === "AUDIO" && (
              <div className="flex aspect-square items-center justify-center bg-amber-50 text-xs text-amber-900">
                🎵 audio
              </div>
            )}
            {a.modality === "VIDEO" && (
              <div className="flex aspect-square items-center justify-center bg-violet-50 text-xs text-violet-900">
                🎬 video
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
              <Button size="icon" variant="secondary" onClick={() => toggleFav(a)} title="Favorite">
                <Heart className={a.isFavorite ? "fill-red-500" : ""} />
              </Button>
              <Button size="icon" variant="secondary" onClick={() => addReference(a.id)} title="Use as reference">
                <ImagePlus />
              </Button>
              <Button size="icon" variant="destructive" onClick={() => remove(a.id)} title="Delete">
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No assets yet.</p>
      )}
    </div>
  )
}
