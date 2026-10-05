"use client"

import { memo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Copy, Pencil, Check } from "@/lib/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface EditHistoryEntry {
  content: string
  assistantResponse?: string
  editedAt: Date
}

interface EditVersionIndicatorProps {
  currentContent: string
  editHistory: EditHistoryEntry[]
  viewingVersion: number // 1-indexed, controlled by parent
  onVersionChange: (version: number) => void
  onCopy: (content: string) => void
  onEdit?: () => void
  copied?: boolean
  isUserMessage?: boolean
}

export const EditVersionIndicator = memo<EditVersionIndicatorProps>(
  ({
    currentContent,
    editHistory,
    viewingVersion,
    onVersionChange,
    onCopy,
    onEdit,
    copied,
  }) => {
    // All versions: history + current (current is the latest)
    const allVersions = [...editHistory.map((h) => h.content), currentContent]
    const totalVersions = allVersions.length

    const handlePrevVersion = useCallback(() => {
      onVersionChange(Math.max(1, viewingVersion - 1))
    }, [viewingVersion, onVersionChange])

    const handleNextVersion = useCallback(() => {
      onVersionChange(Math.min(totalVersions, viewingVersion + 1))
    }, [viewingVersion, totalVersions, onVersionChange])

    const currentViewContent = allVersions[viewingVersion - 1]

    // Use muted-foreground for all cases - works well in both light/dark themes
    const buttonClass = "text-muted-foreground hover:text-foreground hover:bg-muted"
    const textClass = "text-muted-foreground"

    return (
      <div className="flex items-center gap-1">
        {/* Copy button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-6 w-6 ${buttonClass}`}
              onClick={() => onCopy(currentViewContent)}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{copied ? "Copied!" : "Copy this version"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Edit button (only for user messages) */}
        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 ${buttonClass}`}
                onClick={onEdit}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Edit message</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Version navigation */}
        <div className={`flex items-center gap-0.5 text-xs ${textClass}`}>
          <Button
            variant="ghost"
            size="icon"
            className={`h-5 w-5 ${buttonClass}`}
            onClick={handlePrevVersion}
            disabled={viewingVersion <= 1}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="min-w-[32px] text-center tabular-nums">
            {viewingVersion}/{totalVersions}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={`h-5 w-5 ${buttonClass}`}
            onClick={handleNextVersion}
            disabled={viewingVersion >= totalVersions}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }
)

EditVersionIndicator.displayName = "EditVersionIndicator"

// Helper to get the content for a specific version
export function getVersionContent(
  currentContent: string,
  editHistory: EditHistoryEntry[] | undefined,
  viewingVersion: number
): string {
  if (!editHistory || editHistory.length === 0) {
    return currentContent
  }
  const allVersions = [...editHistory.map((h) => h.content), currentContent]
  return allVersions[viewingVersion - 1] || currentContent
}

/**
 * What the assistant bubble should show when its preceding user message is
 * viewing an older version. Returns `undefined` when the latest version is
 * selected or no historical response was captured for that version —
 * caller falls back to the live assistant content. Returning `""` would
 * blank the bubble, which is the wrong default for the "edited before any
 * response" / "old data missing assistantResponse" edges.
 */
export function getVersionedAssistantContent(
  previousUserEditHistory: EditHistoryEntry[] | undefined,
  viewingVersion: number,
  totalVersions: number
): string | undefined {
  if (!previousUserEditHistory || previousUserEditHistory.length === 0) {
    return undefined
  }
  if (viewingVersion >= totalVersions) return undefined
  const entry = previousUserEditHistory[viewingVersion - 1]
  return typeof entry?.assistantResponse === "string"
    ? entry.assistantResponse
    : undefined
}
