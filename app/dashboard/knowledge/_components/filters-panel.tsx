"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check } from "lucide-react"
import type { Category } from "./category-dialog"

interface FiltersPanelProps {
  categories: Category[]
  selectedCategories: string[]
  onToggleCategory: (name: string) => void
}

export function FiltersPanel({
  categories,
  selectedCategories,
  onToggleCategory,
}: FiltersPanelProps) {
  return (
    <Command className="rounded-lg border shadow-md w-[280px]" role="listbox" aria-label="Filter by category">
      <CommandInput placeholder="Search categories..." aria-label="Search categories" />
      <CommandList>
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
    </Command>
  )
}
