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
import { Check, Plus, X } from "lucide-react"
import type { Category } from "./category-dialog"

interface FiltersPanelProps {
  categories: Category[]
  selectedCategories: string[]
  onToggleCategory: (name: string) => void
  onNewCategory?: () => void
  onClearFilters?: () => void
}

export function FiltersPanel({
  categories,
  selectedCategories,
  onToggleCategory,
  onNewCategory,
  onClearFilters,
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
                className="cursor-pointer"
                aria-selected={isSelected}
              >
                <div
                  className="h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center"
                  style={{ borderColor: cat.color, backgroundColor: isSelected ? `${cat.color}30` : "transparent" }}
                >
                  {isSelected ? <Check className="h-3 w-3" style={{ color: cat.color }} /> : null}
                </div>
                <span>{cat.label}</span>
              </CommandItem>
            )
          })}
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
