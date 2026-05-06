"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Check, Plus, X, Pencil, Trash2 } from "@/lib/icons"
import type { Category } from "./category-dialog"

interface FiltersPanelProps {
  categories: Category[]
  selectedCategories: string[]
  onToggleCategory: (name: string) => void
  onNewCategory?: () => void
  onClearFilters?: () => void
  showUncategorized?: boolean
  onToggleUncategorized?: () => void
  uncategorizedCount?: number
  onEditCategory?: (category: Category) => void
  onDeleteCategory?: (category: Category) => void
  showNoKB?: boolean
  onToggleNoKB?: () => void
  noKBCount?: number
}

export function FiltersPanel({
  categories,
  selectedCategories,
  onToggleCategory,
  onNewCategory,
  onClearFilters,
  showUncategorized = false,
  onToggleUncategorized,
  uncategorizedCount = 0,
  onEditCategory,
  onDeleteCategory,
  showNoKB = false,
  onToggleNoKB,
  noKBCount = 0,
}: FiltersPanelProps) {
  return (
    <Command className="rounded-lg border shadow-md w-[280px]" role="listbox" aria-label="Filter by category">
      <CommandInput placeholder="Search categories..." aria-label="Search categories" />
      <CommandList className="max-h-[240px] overflow-y-auto">
        <CommandEmpty>No category found.</CommandEmpty>
        <CommandGroup heading="Categories">
          {categories.map((cat) => {
            const isSelected = selectedCategories.includes(cat.name)
            return (
              <CommandItem
                key={cat.name}
                value={cat.label}
                onSelect={() => onToggleCategory(cat.name)}
                className="cursor-pointer pr-8"
                aria-selected={isSelected}
              >
                <div
                  className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center"
                  style={{ borderColor: cat.color, backgroundColor: isSelected ? `${cat.color}30` : "transparent" }}
                >
                  {isSelected ? <Check className="h-3 w-3" style={{ color: cat.color } } /> : null}
                </div>
                <span className="flex-1">{cat.label}</span>
                {!cat.isSystem && (onEditCategory || onDeleteCategory) && (
                  <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                    {onEditCategory && (
                      <button
                        type="button"
                        onClick={() => onEditCategory(cat)}
                        className="p-1 hover:bg-accent rounded cursor-pointer"
                        aria-label={`Edit ${cat.label}`}
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    {onDeleteCategory && (
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(cat)}
                        className="p-1 hover:bg-accent rounded cursor-pointer"
                        aria-label={`Delete ${cat.label}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    )}
                  </div>
                )}
              </CommandItem>
            )
          })}
          {onToggleUncategorized && (
            <CommandItem
              value="Uncategorized"
              onSelect={onToggleUncategorized}
              className="cursor-pointer"
              aria-selected={showUncategorized}
            >
              <div
                className="h-4 w-4 rounded border border-dashed shrink-0 mr-2 flex items-center justify-center"
                style={{ borderColor: showUncategorized ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: showUncategorized ? "var(--primary)" : "transparent" }}
              >
                {showUncategorized ? <Check className="h-3 w-3" style={{ color: "white" } } /> : null}
              </div>
              <span className="text-muted-foreground">Uncategorized ({uncategorizedCount})</span>
            </CommandItem>
          )}
          {onToggleNoKB && (
            <CommandItem
              value="No Knowledge Base"
              onSelect={onToggleNoKB}
              className="cursor-pointer"
              aria-selected={showNoKB}
            >
              <div
                className="h-4 w-4 rounded border border-dashed shrink-0 mr-2 flex items-center justify-center"
                style={{ borderColor: showNoKB ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: showNoKB ? "var(--primary)" : "transparent" }}
              >
                {showNoKB ? <Check className="h-3 w-3" style={{ color: "white" } } /> : null}
              </div>
              <span className="text-muted-foreground">No Knowledge Base ({noKBCount})</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
      {(onNewCategory || (onClearFilters && selectedCategories.length > 0)) && (
        <div className="border-t px-1 py-1">
          {onNewCategory && (
            <button
              onClick={onNewCategory}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span>New category</span>
            </button>
          )}
          {onClearFilters && selectedCategories.length > 0 && (
            <button
              onClick={onClearFilters}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
            >
              <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span className="text-muted-foreground">Clear filter</span>
            </button>
          )}
        </div>
      )}
    </Command>
  )
}
