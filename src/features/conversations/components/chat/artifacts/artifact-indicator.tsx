"use client"

import { motion } from "framer-motion"
import { Code, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { ArtifactType } from "./types"
import { TYPE_ICONS, TYPE_LABELS } from "./registry"

interface ArtifactIndicatorProps {
  title: string
  type: ArtifactType
  content?: string
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
        "group flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl my-2 transition-all",
        "bg-[var(--artifact-surface)] text-[var(--artifact-ink)] shadow-[var(--artifact-shadow-card)]",
        "hover:shadow-[var(--artifact-shadow-float)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--artifact-accent)]"
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-[var(--artifact-accent-soft)] text-[var(--artifact-accent)] shadow-[inset_0_0_0_1px_var(--artifact-accent-ring)]">
        <Icon className="h-4 w-4 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block text-[var(--artifact-ink)]">{title}</span>
        <span className="text-[11px] text-[var(--artifact-muted)]">{TYPE_LABELS[type] || "Artifact"}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--artifact-faint)] transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  )
}
