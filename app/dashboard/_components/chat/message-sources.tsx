"use client"

import { memo } from "react"
import { ExternalLink } from "lucide-react"

export interface Source {
  title: string
  section?: string | null
  url?: string | null
}

interface MessageSourcesProps {
  sources: Source[]
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

export const MessageSources = memo<MessageSourcesProps>(({ sources }) => {
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-medium text-muted-foreground">Sources</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {sources.map((source, i) => (
          <a
            key={i}
            href={source.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 group/source flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/50 border border-border/40 hover:border-border/80 hover:bg-muted/80 transition-all cursor-pointer min-w-[180px] max-w-[240px]"
          >
            {source.url ? (
              <img
                src={getFaviconUrl(source.url)}
                alt=""
                className="h-4 w-4 rounded-sm shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none"
                }}
              />
            ) : (
              <div className="h-4 w-4 rounded-sm bg-muted-foreground/20 shrink-0 flex items-center justify-center">
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate leading-tight">
                {source.url ? getDomain(source.url) : source.title}
              </p>
              <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                {source.title}
                {source.section && ` · ${source.section}`}
              </p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover/source:text-muted-foreground transition-colors shrink-0" />
          </a>
        ))}
      </div>
    </div>
  )
})

MessageSources.displayName = "MessageSources"
