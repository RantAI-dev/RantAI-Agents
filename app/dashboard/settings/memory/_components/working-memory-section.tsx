"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Trash2, ChevronDown, Cpu } from "lucide-react"
import type { MemoryItem } from "@/hooks/use-memory"
import type { WorkingMemoryData } from "@/lib/memory/types"

interface WorkingMemorySectionProps {
  memories: MemoryItem[]
  onDelete: (id: string) => void
  onClearAll: () => void
}

export function WorkingMemorySection({
  memories,
  onDelete,
  onClearAll,
}: WorkingMemorySectionProps) {
  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="rounded-full bg-amber-500/10 p-3 mb-3">
          <Cpu className="h-6 w-6 text-amber-500/40" />
        </div>
        <p className="text-sm font-medium">No working memory entries</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Working memory is temporary and expires after each session
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          Clear All Working Memory
        </Button>
      </div>
      {memories.map((memory) => {
        const data = memory.value as unknown as WorkingMemoryData | null
        const entities = data?.entities ?? []
        const facts = data?.facts ?? []

        return (
          <Card key={memory.id} className="border-l-2 border-l-amber-500/20 transition-all duration-200 hover:border-l-amber-500/40 hover:shadow-md hover:shadow-amber-500/5">
            <Collapsible>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-2 hover:underline group">
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    <CardTitle className="text-sm font-medium">
                      {memory.key}
                    </CardTitle>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {data?.threadId && (
                      <span className="font-mono text-[11px]">
                        {data.threadId.slice(0, 8)}...
                      </span>
                    )}
                    <span className="font-mono text-[11px]">
                      {entities.length} entities, {facts.length} facts
                    </span>
                    {memory.expiresAt && (
                      <span className="font-mono text-[11px]">
                        Expires:{" "}
                        {new Date(memory.expiresAt).toLocaleString()}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onDelete(memory.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  {entities.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium mb-2 text-amber-600 dark:text-amber-400">Entities</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Confidence</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entities.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs font-medium">
                                {e.name}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{e.type}</TableCell>
                              <TableCell>
                                <span className="font-mono text-xs">
                                  {((e.confidence ?? 0) * 100).toFixed(0)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {facts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium mb-2 text-amber-600 dark:text-amber-400">Facts</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subject</TableHead>
                            <TableHead>Predicate</TableHead>
                            <TableHead>Object</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {facts.map((f, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{f.subject}</TableCell>
                              <TableCell className="font-mono text-xs">{f.predicate}</TableCell>
                              <TableCell className="font-mono text-xs">{f.object}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {data?.context && (
                    <div>
                      <h4 className="text-xs font-medium mb-2 text-amber-600 dark:text-amber-400">Context</h4>
                      <div className="text-xs text-muted-foreground space-y-1.5">
                        {data.context.currentTopic && (
                          <p>Topic: <span className="font-mono">{data.context.currentTopic}</span></p>
                        )}
                        {data.context.intent && (
                          <p>Intent: <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-mono">{data.context.intent}</span></p>
                        )}
                        {data.context.sentiment && (
                          <p>Sentiment: <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-mono">{data.context.sentiment}</span></p>
                        )}
                        {data.context.language && (
                          <p>Language: <span className="font-mono">{data.context.language}</span></p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )
      })}
    </div>
  )
}
