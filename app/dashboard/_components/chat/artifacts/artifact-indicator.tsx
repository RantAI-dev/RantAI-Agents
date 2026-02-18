"use client"

import { motion } from "framer-motion"
import { Code, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ArtifactType } from "./types"
import { TYPE_ICONS, TYPE_COLORS } from "./constants"

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

  return (
    <motion.button
      type="button"
      className={cn(
        "flex items-center gap-2 w-full text-left text-xs px-3 py-2 rounded-lg border transition-all my-2",
        "hover:shadow-sm active:scale-[0.99]",
        TYPE_COLORS[type] || "text-muted-foreground bg-muted/50 border-border"
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium truncate">{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </motion.button>
  )
}
