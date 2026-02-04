"use client"

import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { FileText } from "lucide-react"

export interface Source {
  title: string
  section?: string | null
}

interface MessageSourcesProps {
  sources: Source[]
}

export const MessageSources = memo<MessageSourcesProps>(({ sources }) => {
  if (!sources || sources.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
      <FileText className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        Sources:
      </span>
      {sources.map((source, i) => (
        <Badge
          key={i}
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5 font-normal bg-muted/50"
        >
          {source.title}
          {source.section && (
            <span className="text-muted-foreground ml-1">
              · {source.section}
            </span>
          )}
        </Badge>
      ))}
    </div>
  )
})

MessageSources.displayName = "MessageSources"
