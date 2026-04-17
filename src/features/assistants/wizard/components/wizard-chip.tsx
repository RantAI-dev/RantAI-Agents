"use client"

import { X, Sparkles } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface Props {
  label: string
  suggested?: boolean
  reason?: string
  onRemove?: () => void
}

export function WizardChip({ label, suggested, reason, onRemove }: Props) {
  const body = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
        suggested
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border bg-muted/40"
      )}
    >
      {suggested && <Sparkles className="h-3 w-3" />}
      <span className="truncate max-w-[160px]">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-70"
          aria-label={`Remove ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )

  if (!reason) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}
