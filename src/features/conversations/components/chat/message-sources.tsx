"use client"

import { memo } from "react"
import { ExternalLink, FileText } from "@/lib/icons"
import { citeAnchorId, isMeaningfulFigureCaption } from "./citations"

export interface Source {
  title: string
  section?: string | null
  url?: string | null
  /** KB document id — source card links to /dashboard/files/{id} when set. */
  documentId?: string | null
  /** Figure asset (multimodal RAG): object key of a cropped figure to render. */
  assetKey?: string | null
  page?: number | null
  chunkType?: string | null
  /** Reading-order position of this chunk, and — for a figure — the position of
   *  the chunk it follows (its anchor). The anchor is how a figure with no
   *  printed caption still lands next to the prose it illustrates. */
  chunkIndex?: number | null
  anchorChunkIndex?: number | null
}

interface MessageSourcesProps {
  sources: Source[]
  /** Message id — scopes citation anchor ids so `[n]` chips scroll here. */
  messageId?: string
  /** Figure source numbers the model embedded inline in the answer — hidden
   *  from the Figures card row so they don't render twice. */
  hiddenFigureNums?: Set<number>
}

// Extract domain from URL
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "")
  } catch {
    return url
  }
}

// Get favicon URL for a domain
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ""
  }
}

export const MessageSources = memo<MessageSourcesProps>(({ sources, messageId, hiddenFigureNums }) => {
  if (!sources || sources.length === 0) return null

  // Number in the SAME order the model was given the source list, so an inline
  // `[n]` citation lines up with the badge here. Then split for rendering.
  const numbered = sources.map((s, i) => ({ ...s, n: i + 1 }))
  // Figures shown in the strip: real book figures only (caption like
  // "Gambar 1.1 …"), and not the ones already embedded inline. Decorative page
  // ornaments Mistral cropped (caption = "Ayo Membaca", a name, …) are dropped
  // so the strip carries only figures that matter to the answer.
  const figures = numbered.filter(
    (s) =>
      s.assetKey &&
      s.documentId &&
      !hiddenFigureNums?.has(s.n) &&
      isMeaningfulFigureCaption(s.section),
  )
  const textSources = numbered.filter((s) => !s.assetKey)
  const anchorId = (n: number) => (messageId ? citeAnchorId(messageId, n) : undefined)

  // Build the secondary meta line: page and section, whichever exist, without
  // repeating the title.
  const metaLine = (s: (typeof numbered)[number]) => {
    const parts: string[] = []
    if (s.page != null) parts.push(`hal. ${s.page + 1}`)
    if (s.section && s.section.trim() && s.section.trim() !== s.title.trim()) {
      parts.push(s.section.trim())
    }
    return parts.join(" · ")
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
      {figures.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Figures
          </span>
          <div className="flex gap-2.5 overflow-x-auto pb-1 mt-2 scrollbar-thin">
            {figures.map((source, i) => (
              <a
                key={`fig-${i}`}
                id={anchorId(source.n)}
                href={`/dashboard/files/${source.documentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex-shrink-0 group/fig rounded-xl border border-border/50 hover:border-primary/50 hover:shadow-sm transition-all bg-card scroll-mt-8"
                title={source.title}
              >
                <span className="absolute top-2 left-2 z-10 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none shadow-sm ring-2 ring-background">
                  {source.n}
                </span>
                {/* overflow-hidden lives on the image wrapper (not the card) so
                    the number badge in the corner isn't clipped by the card's
                    rounded corner. */}
                <div className="overflow-hidden rounded-t-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/dashboard/files/${source.documentId}/asset?key=${encodeURIComponent(source.assetKey as string)}`}
                    alt={source.title}
                    className="h-32 w-auto max-w-[280px] object-contain bg-white"
                    loading="lazy"
                  />
                </div>
                <div className="px-2.5 py-1.5 max-w-[280px] border-t border-border/40">
                  <p className="text-[11px] font-medium text-foreground truncate leading-tight">
                    {source.title}
                  </p>
                  {source.page != null && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      hal. {source.page + 1}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      {textSources.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Sources
          </span>
          <div className="flex gap-2.5 overflow-x-auto pb-1 mt-2 scrollbar-thin">
            {textSources.map((source, i) => {
              const meta = metaLine(source)
              return (
                <a
                  key={i}
                  id={anchorId(source.n)}
                  href={source.documentId ? `/dashboard/files/${source.documentId}` : source.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 group/source flex items-start gap-2.5 p-2.5 rounded-xl bg-card border border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer w-[230px] scroll-mt-8"
                >
                  <span className="mt-0.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none shrink-0">
                    {source.n}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {source.url ? (
                        <img
                          src={getFaviconUrl(source.url)}
                          alt=""
                          className="h-3.5 w-3.5 rounded-sm shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none"
                          }}
                        />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <p className="text-[11px] font-medium text-foreground truncate leading-tight">
                        {source.url ? getDomain(source.url) : source.title}
                      </p>
                    </div>
                    {meta && (
                      <p className="text-[10px] text-muted-foreground truncate leading-tight mt-1">
                        {meta}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover/source:text-muted-foreground transition-colors shrink-0 mt-0.5" />
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

MessageSources.displayName = "MessageSources"
