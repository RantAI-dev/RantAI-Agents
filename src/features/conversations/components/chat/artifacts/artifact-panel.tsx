"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Copy,
  Download,
  Check,
  Code,
  Eye,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Save,
  Trash2,
  MoreHorizontal,
} from "@/lib/icons"
import { Maximize, Minimize } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Artifact } from "./types"
import { ArtifactRenderer } from "./artifact-renderer"
import { StreamdownContent } from "../streamdown-content"

type ArtifactInput = Omit<Artifact, "version" | "previousVersions"> & {
  version?: number
  previousVersions?: Artifact["previousVersions"]
}

interface ArtifactPanelProps {
  artifact: Artifact
  onClose: () => void
  onUpdateArtifact?: (artifact: ArtifactInput) => void
  onDeleteArtifact?: (artifactId: string) => void
  onFixWithAI?: (artifactId: string, error: string) => void
  sessionId?: string
}

const TYPE_LABELS: Record<string, string> = {
  "text/html": "HTML",
  "text/markdown": "Markdown",
  "image/svg+xml": "SVG",
  "application/react": "React",
  "application/mermaid": "Mermaid",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX",
  "application/slides": "Slides",
  "application/python": "Python",
  "application/3d": "R3F Scene",
}

export function ArtifactPanel({
  artifact,
  onClose,
  onUpdateArtifact,
  onDeleteArtifact,
  onFixWithAI,
  sessionId,
}: ArtifactPanelProps) {
  const isCodeOnly = artifact.type === "application/code"
  const [tab, setTab] = useState<"preview" | "code">(
    isCodeOnly ? "code" : "preview"
  )
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewingVersionIdx, setViewingVersionIdx] = useState<number | null>(
    null
  )

  // Edit state
  const [editContent, setEditContent] = useState("")
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const hasVersions = artifact.previousVersions.length > 0
  const totalVersions = artifact.version
  const currentViewVersion =
    viewingVersionIdx !== null ? viewingVersionIdx + 1 : totalVersions

  const displayArtifact = useMemo<Artifact>(() => {
    if (viewingVersionIdx === null) return artifact
    const ver = artifact.previousVersions[viewingVersionIdx]
    if (!ver) return artifact
    return { ...artifact, content: ver.content, title: ver.title }
  }, [artifact, viewingVersionIdx])

  // Initialize edit content when entering edit mode or artifact changes
  // Skip if a save is in progress to prevent overwriting the editor
  useEffect(() => {
    if (isEditing && !isSaving) {
      setEditContent(displayArtifact.content)
      setIsDirty(false)
    }
  }, [isEditing, displayArtifact.content, isSaving])

  // Reset version view to latest when artifact is updated externally
  useEffect(() => {
    setViewingVersionIdx(null)
  }, [artifact.version])

  // Exit edit mode when switching tabs
  useEffect(() => {
    setIsEditing(false)
  }, [tab])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isFullscreen])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayArtifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayArtifact.content])

  const handleDownload = useCallback(async () => {
    const ext = getExtension(displayArtifact)
    const filename = `${displayArtifact.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}${ext}`

    // For slides, generate a real PPTX file
    if (displayArtifact.type === "application/slides") {
      try {
        const { isJsonPresentation, parseLegacyMarkdown } = await import("@/lib/slides/parse-legacy")
        const { DEFAULT_THEME } = await import("@/lib/slides/types")
        const { generatePptx } = await import("@/lib/slides/generate-pptx")

        let presentation
        if (isJsonPresentation(displayArtifact.content)) {
          const parsed = JSON.parse(displayArtifact.content)
          presentation = { theme: parsed.theme || DEFAULT_THEME, slides: parsed.slides }
        } else {
          presentation = parseLegacyMarkdown(displayArtifact.content)
        }

        const blob = await generatePptx(presentation)
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error("[ArtifactPanel] PPTX generation failed:", err)
      }
      return
    }

    const blob = new Blob([displayArtifact.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [displayArtifact])

  const goToPrevVersion = useCallback(() => {
    if (viewingVersionIdx === null) {
      setViewingVersionIdx(artifact.previousVersions.length - 1)
    } else if (viewingVersionIdx > 0) {
      setViewingVersionIdx(viewingVersionIdx - 1)
    }
  }, [viewingVersionIdx, artifact.previousVersions.length])

  const goToNextVersion = useCallback(() => {
    if (viewingVersionIdx !== null) {
      if (viewingVersionIdx < artifact.previousVersions.length - 1) {
        setViewingVersionIdx(viewingVersionIdx + 1)
      } else {
        setViewingVersionIdx(null)
      }
    }
  }, [viewingVersionIdx, artifact.previousVersions.length])

  const handleSave = useCallback(async () => {
    if (!editContent || !isDirty || isSaving) return
    setIsSaving(true)

    try {
      if (onUpdateArtifact) {
        onUpdateArtifact({
          id: artifact.id,
          title: artifact.title,
          type: artifact.type,
          content: editContent,
          language: artifact.language,
        })
      }

      if (sessionId) {
        await fetch(
          `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifact.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: editContent }),
          }
        )
      }

      setIsDirty(false)
      setIsEditing(false)
    } catch (err) {
      console.error("[ArtifactPanel] Save error:", err)
    } finally {
      setIsSaving(false)
    }
  }, [
    editContent,
    isDirty,
    isSaving,
    artifact,
    onUpdateArtifact,
    sessionId,
  ])

  const handleDelete = useCallback(async () => {
    if (isDeleting) return
    setIsDeleting(true)

    try {
      if (sessionId) {
        await fetch(
          `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifact.id}`,
          { method: "DELETE" }
        )
      }
      onDeleteArtifact?.(artifact.id)
      onClose()
    } catch (err) {
      console.error("[ArtifactPanel] Delete error:", err)
    } finally {
      setIsDeleting(false)
    }
  }, [isDeleting, sessionId, artifact.id, onDeleteArtifact, onClose])

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  const panelContent = (
    <div
      className={cn(
        "flex flex-col bg-background",
        isFullscreen ? "fixed inset-3 z-50 rounded-xl shadow-2xl border" : "h-full border-l"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
        {/* Title area */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold truncate">
              {displayArtifact.title}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
            {TYPE_LABELS[artifact.type] || artifact.type}
            {artifact.language ? ` · ${artifact.language}` : ""}
          </span>

          {/* Version pill (inline in header) */}
          {hasVersions && (
            <span className="flex items-center gap-0.5 tabular-nums text-xs text-muted-foreground bg-muted rounded-full px-1 py-0.5 shrink-0">
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-background/80 transition-colors disabled:opacity-30"
                onClick={goToPrevVersion}
                disabled={currentViewVersion <= 1}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="px-0.5 font-medium">
                {currentViewVersion}/{totalVersions}
              </span>
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-background/80 transition-colors disabled:opacity-30"
                onClick={goToNextVersion}
                disabled={currentViewVersion >= totalVersions}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-chart-2" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy content</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download</TooltipContent>
          </Tooltip>

          {/* More menu (delete lives here) */}
          {onDeleteArtifact && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">More options</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete artifact"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen((prev) => !prev)}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (isFullscreen) setIsFullscreen(false)
                  onClose()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab bar — hidden for application/code (preview == code, redundant) */}
      {!isCodeOnly && (
      <div className="flex border-b border-border/50 px-4">
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
            tab === "preview"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("preview")}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
            tab === "code"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("code")}
        >
          <Code className="h-3.5 w-3.5" />
          Code
          {isDirty && isEditing && (
            <span className="w-1.5 h-1.5 rounded-full bg-chart-1" />
          )}
        </button>
      </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "preview" ? (
          <ArtifactRenderer
            artifact={displayArtifact}
            onFixWithAI={onFixWithAI ? (error: string) => onFixWithAI(displayArtifact.id, error) : undefined}
          />
        ) : isEditing ? (
          /* Code tab — edit mode */
          <div className="flex flex-col h-full">
            <textarea
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value)
                setIsDirty(true)
              }}
              className="flex-1 w-full p-4 font-mono text-sm bg-background text-foreground resize-none outline-none"
              spellCheck={false}
            />
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditContent(displayArtifact.content)
                  setIsDirty(false)
                  setIsEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditContent(displayArtifact.content)
                  setIsDirty(false)
                }}
                disabled={!isDirty}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          /* Code tab — view mode with floating edit button */
          <div className="relative">
            <StreamdownContent
              content={`\`\`\`${getCodeLanguage(displayArtifact)}\n${displayArtifact.content}\n\`\`\``}
              className="p-4"
            />
            {onUpdateArtifact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-3 right-3 h-8 w-8 shadow-sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Edit code</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // When fullscreen, render via portal with backdrop
  if (isFullscreen) {
    return createPortal(
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeFullscreen}
        />
        {panelContent}
      </>,
      document.body
    )
  }

  return panelContent
}

function getExtension(artifact: Artifact): string {
  switch (artifact.type) {
    case "text/html":
      return ".html"
    case "text/markdown":
      return ".md"
    case "image/svg+xml":
      return ".svg"
    case "application/react":
      return ".tsx"
    case "application/mermaid":
      return ".mmd"
    case "application/code":
      return artifact.language ? `.${artifact.language}` : ".txt"
    case "application/sheet":
      return ".csv"
    case "text/latex":
      return ".tex"
    case "application/slides":
      return ".pptx"
    case "application/python":
      return ".py"
    case "application/3d":
      return ".tsx"
    default:
      return ".txt"
  }
}

function getCodeLanguage(artifact: Artifact): string {
  switch (artifact.type) {
    case "text/html":
      return "html"
    case "text/markdown":
      return "markdown"
    case "image/svg+xml":
      return "svg"
    case "application/react":
      return "tsx"
    case "application/mermaid":
      return "mermaid"
    case "application/code":
      return artifact.language || ""
    case "application/sheet":
      return "csv"
    case "text/latex":
      return "latex"
    case "application/slides":
      return "json"
    case "application/python":
      return "python"
    case "application/3d":
      return "tsx"
    default:
      return ""
  }
}