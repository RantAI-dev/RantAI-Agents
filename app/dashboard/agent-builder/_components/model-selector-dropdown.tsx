"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Eye, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { AVAILABLE_MODELS, getModelById, type LLMModel } from "@/lib/models"

interface ModelSelectorDropdownProps {
  selectedModelId: string
  onSelect: (modelId: string) => void
}

export function ModelSelectorDropdown({ selectedModelId, onSelect }: ModelSelectorDropdownProps) {
  const [open, setOpen] = useState(false)
  const selectedModel = getModelById(selectedModelId)

  // Group by provider
  const grouped: Record<string, LLMModel[]> = {}
  for (const model of AVAILABLE_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = []
    grouped[model.provider].push(model)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto py-2.5"
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{selectedModel.name}</span>
              <span className="text-xs text-muted-foreground">{selectedModel.provider}</span>
              {selectedModel.pricing.input === 0 && selectedModel.pricing.output === 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  Free
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Select a model...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {Object.entries(grouped).map(([provider, models]) => (
              <CommandGroup key={provider} heading={provider}>
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={`${model.provider} ${model.name} ${model.id}`}
                    onSelect={() => {
                      onSelect(model.id)
                      setOpen(false)
                    }}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        selectedModelId === model.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{model.name}</span>
                        {model.pricing.input === 0 && model.pricing.output === 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            Free
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {model.capabilities.functionCalling && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5">
                            <Wrench className="h-2.5 w-2.5" />
                            Tools
                          </Badge>
                        )}
                        {model.capabilities.vision && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5">
                            <Eye className="h-2.5 w-2.5" />
                            Vision
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {(model.contextWindow / 1000).toFixed(0)}k ctx
                        </span>
                        {model.pricing.input > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ${model.pricing.input}/${model.pricing.output} per M
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
