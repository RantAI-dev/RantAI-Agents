"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Table2, ImageIcon, Maximize2 } from "@/lib/icons"
import type { DocumentFigure } from "./document-viewer-client"

interface DocumentFiguresProps {
  documentId: string
  figures: DocumentFigure[]
  /** Whether the source doc is a PDF — enables "jump to page" in Preview. */
  isPdf?: boolean
  /** Jump the Preview tab to a 1-based page. Only wired for PDFs. */
  onOpenPage?: (page1Based: number) => void
}

const TYPE_META: Record<
  NonNullable<DocumentFigure["type"]>,
  { label: string; Icon: typeof ImageIcon }
> = {
  chart: { label: "Chart", Icon: BarChart3 },
  table: { label: "Tabel", Icon: Table2 },
  image: { label: "Gambar", Icon: ImageIcon },
  figure: { label: "Figure", Icon: ImageIcon },
}

function assetUrl(documentId: string, assetKey: string) {
  return `/api/dashboard/files/${documentId}/asset?key=${encodeURIComponent(assetKey)}`
}

/**
 * Gallery of figures/charts/tables cropped from a document at ingest
 * (multimodal RAG). Thumbnails stream through the app's asset route (never a
 * presigned URL); clicking one opens a lightbox with the full-res crop and,
 * for PDFs, a jump-to-page action back into the Preview tab.
 */
type FilterKey = NonNullable<DocumentFigure["type"]>

export default function DocumentFigures({
  documentId,
  figures,
  isPdf,
  onOpenPage,
}: DocumentFiguresProps) {
  const [active, setActive] = useState<DocumentFigure | null>(null)
  const [filter, setFilter] = useState<FilterKey | null>(null)

  const meta = (f: DocumentFigure) => TYPE_META[f.type ?? "figure"] ?? TYPE_META.figure

  // Count per type so we only show chips for types actually present, with a
  // running tally. Order chips by a stable, human-friendly sequence.
  const counts = figures.reduce<Record<string, number>>((acc, f) => {
    const key = (f.type ?? "figure") as FilterKey
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const order: FilterKey[] = ["image", "table", "chart", "figure"]
  const present = order.filter((k) => counts[k])

  const visible = filter ? figures.filter((f) => (f.type ?? "figure") === filter) : figures

  return (
    <>
      {present.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge
            role="button"
            tabIndex={0}
            variant={filter === null ? "default" : "outline"}
            onClick={() => setFilter(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setFilter(null)
              }
            }}
            className="h-6 px-2.5 cursor-pointer select-none gap-1 text-xs"
          >
            Semua
            <span className="tabular-nums opacity-70">{figures.length}</span>
          </Badge>
          {present.map((key) => {
            const { label, Icon } = TYPE_META[key]
            const on = filter === key
            return (
              <Badge
                key={key}
                role="button"
                tabIndex={0}
                variant={on ? "default" : "outline"}
                onClick={() => setFilter(on ? null : key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setFilter(on ? null : key)
                  }
                }}
                className="h-6 px-2.5 cursor-pointer select-none gap-1 text-xs"
              >
                <Icon className="h-3 w-3" />
                {label}
                <span className="tabular-nums opacity-70">{counts[key]}</span>
              </Badge>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((fig, i) => {
          const { label, Icon } = meta(fig)
          return (
            <button
              key={`${fig.assetKey}-${i}`}
              type="button"
              onClick={() => setActive(fig)}
              className="group text-left rounded-xl overflow-hidden border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all"
            >
              <div className="relative aspect-[4/3] bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(documentId, fig.assetKey)}
                  alt={fig.caption ?? label}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-90 drop-shadow transition-opacity" />
                </div>
              </div>
              <div className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 gap-1 text-[10px] font-medium"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    hal. {fig.page + 1}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                  {fig.caption?.trim() || <span className="italic">Tanpa keterangan</span>}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle className="text-sm font-medium pr-8">
            {active && meta(active).label}
            {active && (
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                halaman {active.page + 1}
              </span>
            )}
          </DialogTitle>
          {active && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-white flex items-center justify-center overflow-hidden max-h-[65vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(documentId, active.assetKey)}
                  alt={active.caption ?? meta(active).label}
                  className="max-h-[65vh] max-w-full object-contain"
                />
              </div>
              {active.caption?.trim() && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {active.caption.trim()}
                </p>
              )}
              {isPdf && onOpenPage && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenPage(active.page + 1)
                    setActive(null)
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Lihat di halaman {active.page + 1} →
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
