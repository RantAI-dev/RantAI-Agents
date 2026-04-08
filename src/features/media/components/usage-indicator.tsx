"use client"

import { cn } from "@/lib/utils"

interface Props {
  usedCents: number
  limitCents: number | null
}

export function UsageIndicator({ usedCents, limitCents }: Props) {
  if (limitCents == null) {
    return (
      <span className="text-xs text-muted-foreground">
        Used today: ${(usedCents / 100).toFixed(2)} (no limit)
      </span>
    )
  }
  const ratio = limitCents > 0 ? usedCents / limitCents : 0
  const color =
    ratio >= 1
      ? "text-red-600"
      : ratio >= 0.8
      ? "text-amber-600"
      : "text-emerald-600"
  return (
    <span className={cn("text-xs font-medium", color)}>
      ${(usedCents / 100).toFixed(2)} / ${(limitCents / 100).toFixed(2)} today
    </span>
  )
}
