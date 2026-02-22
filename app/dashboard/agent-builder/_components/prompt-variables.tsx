"use client"

import { memo } from "react"
import { Variable } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AVAILABLE_VARIABLES,
  VARIABLE_DESCRIPTIONS,
} from "@/lib/prompts/variables"

interface PromptVariablesProps {
  onInsert?: (variable: string) => void
}

export const PromptVariables = memo<PromptVariablesProps>(({ onInsert }) => {
  const handleClick = (varName: string) => {
    const token = `{{${varName}}}`
    if (onInsert) {
      onInsert(token)
    } else {
      navigator.clipboard.writeText(token)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Variable className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs font-medium text-muted-foreground">
          Prompt Variables
        </Label>
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_VARIABLES.map((varName) => (
            <Tooltip key={varName}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleClick(varName)}
                  className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border transition-colors cursor-pointer"
                >
                  {`{{${varName}}}`}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>{VARIABLE_DESCRIPTIONS[varName]}</p>
                <p className="text-muted-foreground mt-0.5">Click to {onInsert ? "insert" : "copy"}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
})

PromptVariables.displayName = "PromptVariables"
