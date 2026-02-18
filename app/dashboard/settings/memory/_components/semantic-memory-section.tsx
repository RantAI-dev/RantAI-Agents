"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Search } from "lucide-react"
import type { MemoryItem } from "@/hooks/use-memory"

interface SemanticMemorySectionProps {
  memories: MemoryItem[]
  onDelete: (id: string) => void
  onClearAll: () => void
}

export function SemanticMemorySection({
  memories,
  onDelete,
  onClearAll,
}: SemanticMemorySectionProps) {
  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="rounded-full bg-cyan-500/10 p-3 mb-3">
          <Search className="h-6 w-6 text-cyan-500/40" />
        </div>
        <p className="text-sm font-medium">No semantic memory entries</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Semantic memories are created from conversation context
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          Clear All Semantic Memory
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {memories.map((memory) => {
          const val = memory.value as Record<string, unknown> | null
          const content =
            typeof val === "object" && val
              ? (val.content as string) ??
                (val.messageContent as string) ??
                JSON.stringify(val).slice(0, 200)
              : String(memory.value ?? "").slice(0, 200)
          const role = val && typeof val === "object" ? (val.role as string) : null
          const threadId =
            val && typeof val === "object" ? (val.threadId as string) : null

          return (
            <Card key={memory.id} className="border-l-2 border-l-cyan-500/30 transition-all duration-200 hover:border-l-cyan-500/50 hover:shadow-md hover:shadow-cyan-500/5">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {role && (
                      <span className="inline-flex items-center rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-2 py-0.5 text-[11px] font-mono uppercase">
                        {role}
                      </span>
                    )}
                    <p className="text-sm mt-1.5 line-clamp-3">{content}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {threadId && (
                        <span className="font-mono text-[11px]">
                          {threadId.slice(0, 8)}
                        </span>
                      )}
                      <span className="font-mono text-[11px]">
                        {new Date(memory.createdAt).toLocaleDateString()}
                      </span>
                      {memory.confidence != null && (
                        <span className="font-mono text-[11px]">
                          {(memory.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onDelete(memory.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
