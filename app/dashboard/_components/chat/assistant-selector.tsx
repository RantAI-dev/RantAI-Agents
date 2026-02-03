"use client"

import { useState } from "react"
import { ChevronDown, Plus, Database, Pencil, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Assistant } from "@/lib/types/assistant"

interface AssistantSelectorProps {
  assistants: Assistant[]
  selectedAssistant: Assistant
  defaultAssistantId?: string | null
  onSelect: (assistant: Assistant) => void
  onCreateNew: () => void
  onEdit?: (assistant: Assistant) => void
  compact?: boolean
}

export function AssistantSelector({
  assistants,
  selectedAssistant,
  defaultAssistantId,
  onSelect,
  onCreateNew,
  onEdit,
  compact = false,
}: AssistantSelectorProps) {
  const [open, setOpen] = useState(false)
  const isDefault = (id: string) => defaultAssistantId === id

  const handleSelect = (assistant: Assistant) => {
    onSelect(assistant)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "justify-between gap-2 hover:bg-muted",
            compact ? "px-2 py-1 h-9" : "w-full px-3 py-6 h-auto hover:bg-sidebar-hover"
          )}
        >
          <div className="flex items-center gap-2">
            <span className={compact ? "text-lg" : "text-2xl"}>{selectedAssistant.emoji}</span>
            {compact ? (
              <span className="text-sm font-medium">{selectedAssistant.name}</span>
            ) : (
              <div className="text-left">
                <p className="text-sm font-medium text-sidebar-foreground">
                  {selectedAssistant.name}
                </p>
                <p className="text-xs text-sidebar-muted">
                  {selectedAssistant.description}
                </p>
              </div>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="space-y-1">
          {assistants.map((assistant) => (
            <div
              key={assistant.id}
              className={cn(
                "group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all",
                selectedAssistant.id === assistant.id
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-hover"
              )}
              onClick={() => handleSelect(assistant)}
            >
              <span className="text-2xl shrink-0">{assistant.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{assistant.name}</p>
                  {isDefault(assistant.id) && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                      Default
                    </Badge>
                  )}
                  {assistant.useKnowledgeBase && (
                    <Database className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {assistant.description}
                </p>
              </div>
              {assistant.isEditable && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 absolute right-2 top-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(assistant)
                    setOpen(false)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => {
              onCreateNew()
              setOpen(false)
            }}
          >
            <Plus className="h-4 w-4" />
            New Assistant
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
