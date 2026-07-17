"use client"

/**
 * Searchable model picker for admin config fields. Options come from the
 * enabled model catalog (so managed/discovered local models show up too) and
 * optional non-model sentinels (e.g. extraction modes). Free typing is always
 * allowed — on-prem endpoints can serve ids that aren't in the catalog.
 */
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "@/lib/icons"
import { cn } from "@/lib/utils"

export interface ComboOption {
  value: string
  label?: string
  /** Small right-aligned hint, e.g. provider name or "recommended". */
  hint?: string
  description?: string
}

export function ModelCombobox({
  id,
  value,
  onChange,
  options,
  sentinels,
  sentinelsLabel = "Modes",
  optionsLabel = "Models",
  placeholder = "Select or type a model id…",
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  /** Non-model values shown in their own group above the model list. */
  sentinels?: ComboOption[]
  sentinelsLabel?: string
  optionsLabel?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const known = useMemo(() => {
    const all = new Set<string>()
    for (const o of options) all.add(o.value)
    for (const o of sentinels ?? []) all.add(o.value)
    return all
  }, [options, sentinels])

  const trimmed = query.trim()
  const showCustom = trimmed.length > 0 && !known.has(trimmed)

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No match — keep typing to use a custom id.</CommandEmpty>
            {sentinels && sentinels.length > 0 && (
              <>
                <CommandGroup heading={sentinelsLabel}>
                  {sentinels.map((o) => (
                    <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                      <Check
                        className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{o.value}</span>
                          {o.hint && (
                            <Badge variant="secondary" className="text-[10px]">
                              {o.hint}
                            </Badge>
                          )}
                        </div>
                        {o.description && (
                          <p className="text-xs text-muted-foreground truncate">{o.description}</p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading={optionsLabel}>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => pick(o.value)}>
                  <Check
                    className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{o.label ?? o.value}</span>
                      {o.hint && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{o.hint}</span>
                      )}
                    </div>
                    {o.label && (
                      <p className="text-xs text-muted-foreground font-mono truncate">{o.value}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {showCustom && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Custom">
                  <CommandItem value={`custom:${trimmed}`} onSelect={() => pick(trimmed)}>
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    Use “<span className="font-mono text-xs">{trimmed}</span>”
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
