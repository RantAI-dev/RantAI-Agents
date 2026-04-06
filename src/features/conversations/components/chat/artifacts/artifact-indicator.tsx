"use client"

import { motion } from "framer-motion"
import { Code, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { ArtifactType } from "./types"
import { TYPE_ICONS, TYPE_LABELS, TYPE_COLORS } from "./constants"

interface ArtifactIndicatorProps {
  title: string
  type: ArtifactType
  onClick: () => void
}

export function ArtifactIndicator({
  title,
  type,
  onClick,
}: ArtifactIndicatorProps) {
  const Icon = TYPE_ICONS[type] || Code
  const colorClasses = TYPE_COLORS[type] || "text-muted-foreground bg-muted/50 border-border"
  // Extract just the text color class for the icon wrapper background
  const textColorClass = colorClasses.split(" ")[0]

  return (
    <motion.button
      type="button"
      className={cn(
        "flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl border transition-all my-2",
        "hover:shadow-sm active:scale-[0.99]",
        colorClasses
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={cn("flex items-center justify-center h-7 w-7 rounded-md shrink-0 bg-current/10", textColorClass)}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{title}</span>
        <span className="text-[11px] opacity-70">{TYPE_LABELS[type] || "Artifact"}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
    </motion.button>
  )
}
