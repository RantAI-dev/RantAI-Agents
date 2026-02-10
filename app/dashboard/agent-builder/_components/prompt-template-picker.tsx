"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PROMPT_TEMPLATES } from "@/lib/assistants/prompt-templates"

interface PromptTemplatePickerProps {
  onSelect: (systemPrompt: string, emoji: string, suggestedTools?: string[]) => void
  currentPrompt: string
}

export function PromptTemplatePicker({ onSelect, currentPrompt }: PromptTemplatePickerProps) {
  const handleSelect = (templateId: string) => {
    const template = PROMPT_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    if (currentPrompt && currentPrompt.trim().length > 0) {
      const confirmed = window.confirm(
        "This will replace your current system prompt. Continue?"
      )
      if (!confirmed) return
    }

    onSelect(template.systemPrompt, template.emoji, template.suggestedTools)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal text-muted-foreground">
          Start from a template...
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]" align="start">
        {PROMPT_TEMPLATES.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onClick={() => handleSelect(template.id)}
          >
            <span className="mr-2">{template.emoji}</span>
            <span>{template.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              — {template.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
