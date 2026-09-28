"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import {
  Blocks,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Plug,
  Store,
  Users,
  Wrench,
} from "@/lib/icons"
import type { SearchResult } from "@/app/api/dashboard/search/route"
import { createLatestRequestGate } from "./latest-request"

const SEARCH_DEBOUNCE_MS = 300

const TYPE_CONFIG: Record<
  SearchResult["type"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  conversation: { label: "Conversations", icon: MessageSquare },
  assistant: { label: "Assistants", icon: Blocks },
  workflow: { label: "Workflows", icon: GitBranch },
  employee: { label: "Digital Employees", icon: Users },
  file: { label: "Files", icon: FolderOpen },
  skill: { label: "Skills", icon: Wrench },
  marketplace: { label: "Marketplace", icon: Store },
  tool: { label: "Tools", icon: Plug },
}

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [requestGate] = useState(createLatestRequestGate)

  // Only the newest query may write results: each search aborts the one
  // before it, and a response that finished anyway is dropped if stale.
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      requestGate.cancel()
      setResults([])
      setLoading(false)
      return
    }
    const request = requestGate.begin()
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`, {
        signal: request.signal,
      })
      if (!request.isCurrent()) return
      if (res.ok) {
        const data = await res.json()
        if (!request.isCurrent()) return
        setResults(data.results || [])
      }
    } catch {
      // Aborted (superseded) or network failure — nothing to show.
    } finally {
      if (request.isCurrent()) setLoading(false)
    }
  }, [requestGate])

  // Debounce: every keystroke clears the pending timer, so only a pause of
  // SEARCH_DEBOUNCE_MS issues a request. Nothing is sent while closed.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) return
    debounceRef.current = setTimeout(() => search(query), SEARCH_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search, open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      requestGate.cancel()
      setQuery("")
      setResults([])
      setLoading(false)
    }
  }, [open, requestGate])

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  const handleSelect = (url: string) => {
    onOpenChange(false)
    router.push(url)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search conversations, assistants, files..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && query.length >= 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {query.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type to search across everything...
          </div>
        )}

        {Object.entries(grouped).map(([type, items]) => {
          const config = TYPE_CONFIG[type as SearchResult["type"]]
          if (!config) return null
          return (
            <CommandGroup key={type} heading={config.label}>
              {items.map((item) => {
                const Icon = config.icon
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.type}-${item.id}-${item.title}`}
                    onSelect={() => handleSelect(item.url)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-3 w-full min-w-0">
                      {item.icon ? (
                        <span className="text-base shrink-0">{item.icon}</span>
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{item.title}</span>
                        {item.description && (
                          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                        )}
                      </div>
                      {item.meta && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{item.meta}</span>
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
