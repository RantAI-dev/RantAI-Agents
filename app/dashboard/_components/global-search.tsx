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
  MessageSquare,
  Blocks,
  GitBranch,
  Users,
  Wrench,
} from "@/lib/icons"
import { FolderOpen, Store, Plug } from "lucide-react"
import type { SearchResult } from "@/app/api/dashboard/search/route"

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

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
    }
  }, [open])

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
