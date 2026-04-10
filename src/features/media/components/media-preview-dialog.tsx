"use client"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Heart,
  ImagePlus,
  Trash2,
  Download,
  Music,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MODALITY_META } from "./studio-shared"
import type { StoreAsset } from "@/features/media/store"

export interface PreviewableAsset extends StoreAsset {
  prompt?: string
}

export function assetName(a: PreviewableAsset): string {
  const prompt = a.prompt?.trim()
  if (prompt) {
    const firstLine = prompt.split("\n")[0] ?? prompt
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine
  }
  return `${a.modality.toLowerCase()} • ${a.id.slice(0, 6)}`
}

// Pretty-print mime types for display. `audio/mpeg` is the IANA name for MP3
// but reads weirdly in the UI, so we show the common name instead.
const MIME_DISPLAY: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function formatMime(mime: string): string {
  return MIME_DISPLAY[mime] ?? mime.split("/")[1] ?? mime
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

interface Props {
  asset: PreviewableAsset | null
  onClose: () => void
  onToggleFavorite?: (a: PreviewableAsset) => void
  onUseAsReference?: (a: PreviewableAsset) => void
  onDelete?: (a: PreviewableAsset) => void
}

export function MediaPreviewDialog({
  asset,
  onClose,
  onToggleFavorite,
  onUseAsReference,
  onDelete,
}: Props) {
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[min(96vw,1400px)] border-0 bg-background/95 p-0 backdrop-blur-xl sm:rounded-2xl"
        showCloseButton
      >
        {asset && (
          <div className="flex max-h-[90vh] flex-col">
            <DialogTitle className="sr-only">{assetName(asset)}</DialogTitle>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/80 p-4 sm:rounded-t-2xl">
              {asset.modality === "IMAGE" && (
                <img
                  src={`/api/dashboard/media/assets/${asset.id}/download`}
                  alt={assetName(asset)}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-2xl"
                />
              )}
              {asset.modality === "VIDEO" && (
                <video
                  src={`/api/dashboard/media/assets/${asset.id}/download`}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-lg shadow-2xl"
                />
              )}
              {asset.modality === "AUDIO" && (
                <div className="flex w-full max-w-xl flex-col items-center gap-6 p-8">
                  <div
                    className={cn(
                      "flex h-32 w-32 items-center justify-center rounded-full",
                      MODALITY_META.AUDIO.accentBgSoft
                    )}
                  >
                    <Music className={cn("h-16 w-16", MODALITY_META.AUDIO.accentText)} />
                  </div>
                  <audio
                    src={`/api/dashboard/media/assets/${asset.id}/download`}
                    controls
                    autoPlay
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t bg-card p-5 sm:rounded-b-2xl">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  {(() => {
                    const m =
                      MODALITY_META[asset.modality as "IMAGE" | "AUDIO" | "VIDEO"]
                    const I = m.icon
                    return (
                      <>
                        <I className={cn("h-3.5 w-3.5", m.accentText)} />
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {asset.modality} · {formatDate(asset.createdAt)}
                        </span>
                      </>
                    )
                  })()}
                </div>
                <p className="break-words text-base font-semibold leading-snug">
                  {assetName(asset)}
                </p>
                {asset.prompt && asset.prompt.length > 80 && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {asset.prompt}
                  </p>
                )}
                {(asset.width || asset.height || asset.durationMs) && (
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                    {asset.width && asset.height && (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {asset.width}×{asset.height}
                      </span>
                    )}
                    {asset.durationMs && (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {(asset.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 uppercase">
                      {formatMime(asset.mimeType)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onToggleFavorite && (
                  <Button
                    size="sm"
                    variant={asset.isFavorite ? "default" : "outline"}
                    onClick={() => onToggleFavorite(asset)}
                  >
                    <Heart
                      className={cn(
                        "mr-1.5 h-3.5 w-3.5",
                        asset.isFavorite && "fill-current"
                      )}
                    />
                    {asset.isFavorite ? "Favorited" : "Favorite"}
                  </Button>
                )}
                {onUseAsReference && asset.modality === "IMAGE" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onUseAsReference(asset)
                      onClose()
                    }}
                  >
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                    Use as reference
                  </Button>
                )}
                <a
                  href={`/api/dashboard/media/assets/${asset.id}/download?download=1`}
                  download
                >
                  <Button size="sm" variant="outline">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </Button>
                </a>
                {onDelete && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => onDelete(asset)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
