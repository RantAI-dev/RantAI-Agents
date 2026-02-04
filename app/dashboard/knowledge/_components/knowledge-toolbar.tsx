"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type SortOption = "newest" | "oldest" | "title"

interface KnowledgeToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
  sortOption: SortOption
  onSortChange: (value: SortOption) => void
  filtersPopover?: React.ReactNode
}

export function KnowledgeToolbar({
  searchQuery,
  onSearchChange,
  hasActiveFilters,
  onClearFilters,
  sortOption,
  onSortChange,
  filtersPopover,
}: KnowledgeToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center border-b px-4 py-3 bg-background">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
        <Input
          type="search"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors w-full"
          aria-label="Search documents"
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {filtersPopover}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear all filters"
          >
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
        <Select value={sortOption} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="w-[140px]" aria-label="Sort documents">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="title">Title A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
