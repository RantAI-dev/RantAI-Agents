"use client"

import { Button } from "@/components/ui/button"
import { Heart, Download } from "lucide-react"
import type { StoreAsset } from "@/features/media/store"

interface Props {
  asset: StoreAsset
  onToggleFavorite: () => void
}

export function VideoResult({ asset, onToggleFavorite }: Props) {
  const src = `/api/dashboard/media/assets/${asset.id}/download`
  return (
    <div className="space-y-2 rounded-md border bg-card p-2">
      <video controls src={src} className="aspect-video w-full rounded" preload="metadata" />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{asset.mimeType}</span>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onToggleFavorite}>
            <Heart className={asset.isFavorite ? "fill-red-500 h-4 w-4" : "h-4 w-4"} />
          </Button>
          <a href={src} download>
            <Button size="icon" variant="ghost"><Download className="h-4 w-4" /></Button>
          </a>
        </div>
      </div>
    </div>
  )
}
