"use client"

import { Button } from "@/components/ui/button"
import { Heart, Download, ImagePlus } from "lucide-react"
import type { StoreAsset } from "@/features/media/store"

interface Props {
  asset: StoreAsset
  onToggleFavorite: () => void
  onUseAsReference: () => void
}

export function ImageResult({ asset, onToggleFavorite, onUseAsReference }: Props) {
  const src = `/api/dashboard/media/assets/${asset.id}/download`
  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted">
      <img
        src={src}
        alt=""
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 p-2 opacity-0 transition group-hover:opacity-100">
        <Button size="icon" variant="secondary" onClick={onToggleFavorite} title="Favorite">
          <Heart className={asset.isFavorite ? "fill-red-500" : ""} />
        </Button>
        <Button size="icon" variant="secondary" onClick={onUseAsReference} title="Use as reference">
          <ImagePlus />
        </Button>
        <a href={src} download className="inline-flex">
          <Button size="icon" variant="secondary" title="Download">
            <Download />
          </Button>
        </a>
      </div>
    </div>
  )
}
