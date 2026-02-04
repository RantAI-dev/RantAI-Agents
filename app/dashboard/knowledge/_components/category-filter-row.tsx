"use client"

import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import type { Category } from "./category-dialog"

interface CategoryFilterRowProps {
  categories: Category[]
  categoryCounts: Record<string, number>
  selectedCategories: string[]
  onToggleCategory: (name: string) => void
  onNewCategory: () => void
  onClearFilters: () => void
}

export function CategoryFilterRow({
  categories,
  categoryCounts,
  selectedCategories,
  onToggleCategory,
  onNewCategory,
  onClearFilters,
}: CategoryFilterRowProps) {
  const hasSelection = selectedCategories.length > 0

  return (
    <div className="border-b bg-muted/20 px-4 py-2 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-2 py-1 min-w-max" role="group" aria-label="Category filters">
        {categories.map((cat) => {
          const isSelected = selectedCategories.includes(cat.name)
          const count = categoryCounts[cat.name] ?? 0
          return (
            <Badge
              key={cat.name}
              variant={isSelected ? "default" : "outline"}
              role="button"
              tabIndex={0}
              className="cursor-pointer shrink-0"
              style={
                isSelected
                  ? { backgroundColor: cat.color, borderColor: cat.color }
                  : { borderColor: cat.color, color: cat.color }
              }
              onClick={() => onToggleCategory(cat.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onToggleCategory(cat.name)
                }
              }}
            >
              {cat.label} ({count})
            </Badge>
          )
        })}
        <Badge
          variant="outline"
          role="button"
          tabIndex={0}
          aria-label="New category"
          className="cursor-pointer border-dashed shrink-0"
          onClick={onNewCategory}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onNewCategory()
            }
          }}
        >
          <Plus className="h-3 w-3 mr-1" />
          New category
        </Badge>
        {hasSelection && (
          <Badge
            variant="secondary"
            role="button"
            tabIndex={0}
            aria-label="Clear category filters"
            className="cursor-pointer shrink-0"
            onClick={onClearFilters}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClearFilters()
              }
            }}
          >
            Clear filters
          </Badge>
        )}
      </div>
    </div>
  )
}
