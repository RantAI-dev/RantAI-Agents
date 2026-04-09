"use client"

import { motion } from "framer-motion"
import { Code, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { ArtifactType } from "./types"
import { TYPE_ICONS, TYPE_LABELS, TYPE_COLORS } from "./constants"

interface ArtifactIndicatorProps {
  title: string
  type: ArtifactType
  /**
   * Optional content snippet — used to render a tiny inline preview so
   * users can disambiguate artifacts in long chat histories without having
   * to click each one.
   */
  content?: string
  onClick: () => void
}

/**
 * Build a 1-line preview of the artifact content. We strip whitespace
 * collapsing, fence markers, and HTML/JSX tag noise so the snippet shows
 * the actual textual gist instead of leading boilerplate.
 */
function buildPreviewSnippet(type: ArtifactType, content: string): string | null {
  if (!content) return null
  let text = content
  if (type === "image/svg+xml") {
    return "<svg> graphic"
  }
  // Strip leading code fences from markdown-y types
  text = text.replace(/^\s*```[a-z0-9_-]*\s*\n/i, "")
  // Drop common boilerplate first lines so the preview is informative
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false
      if (/^<!doctype/i.test(l)) return false
      if (/^<\/?(html|head|body|meta|link|script|style)\b/i.test(l)) return false
      if (/^import\b/.test(l)) return false
      if (/^['"]use client['"]/.test(l)) return false
      if (/^\\(documentclass|usepackage|begin|end)\b/.test(l)) return false
      return true
    })
    .join(" ")
  // Collapse remaining whitespace
  text = text.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > 90 ? text.slice(0, 90).trimEnd() + "…" : text
}

export function ArtifactIndicator({
  title,
  type,
  content,
  onClick,
}: ArtifactIndicatorProps) {
  const Icon = TYPE_ICONS[type] || Code
  const colorClasses = TYPE_COLORS[type] || "text-muted-foreground bg-muted/50 border-border"
  // Extract just the text color class for the icon wrapper background
  const textColorClass = colorClasses.split(" ")[0]
  const preview = content ? buildPreviewSnippet(type, content) : null

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
        {preview ? (
          <span className="text-[11px] opacity-70 truncate block">{preview}</span>
        ) : (
          <span className="text-[11px] opacity-70">{TYPE_LABELS[type] || "Artifact"}</span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
    </motion.button>
  )
}
