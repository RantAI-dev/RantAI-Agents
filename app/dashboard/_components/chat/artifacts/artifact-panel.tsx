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
  Maximize2,
  Minimize2,
  Pencil,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
}

export function ArtifactPanel({
  artifact,
  onClose,
  onUpdateArtifact,
  sessionId,
}: ArtifactPanelProps) {
  const [tab, setTab] = useState<"preview" | "code" | "edit">("preview")
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewingVersionIdx, setViewingVersionIdx] = useState<number | null>(
    null
  )

  // Edit state
  const [editContent, setEditContent] = useState("")
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const hasVersions = artifact.previousVersions.length > 0
  const totalVersions = artifact.version
  const currentViewVersion =
    viewingVersionIdx !== null ? viewingVersionIdx + 1 : totalVersions

  const displayArtifact = useMemo<Artifact>(() => {
    if (viewingVersionIdx === null) return artifact
    const ver = artifact.previousVersions[viewingVersionIdx]
    return { ...artifact, content: ver.content, title: ver.title }
  }, [artifact, viewingVersionIdx])

  // Initialize edit content when switching to edit tab or artifact changes
  useEffect(() => {
    if (tab === "edit") {
      setEditContent(displayArtifact.content)
      setIsDirty(false)
    }
  }, [tab, displayArtifact.content])

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
      // Update in-memory state
      if (onUpdateArtifact) {
        onUpdateArtifact({
          id: artifact.id,
          title: artifact.title,
          type: artifact.type,
          content: editContent,
          language: artifact.language,
        })
      }

      // Persist to backend
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
      setTab("preview")
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

  const panelContent = (
    <div
      className={cn(
        "flex flex-col bg-background",
        isFullscreen ? "fixed inset-0 z-50" : "h-full border-l"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate">
            {displayArtifact.title}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {TYPE_LABELS[artifact.type] || artifact.type}
            {artifact.language ? ` · ${artifact.language}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy content"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-chart-2" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDownload}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (isFullscreen) setIsFullscreen(false)
              onClose()
            }}
            title="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Version nav bar */}
      {hasVersions && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 border-b bg-muted/30">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToPrevVersion}
            disabled={currentViewVersion <= 1}
            title="Previous version"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            v{currentViewVersion} / {totalVersions}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToNextVersion}
            disabled={currentViewVersion >= totalVersions}
            title="Next version"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b px-4">
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
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
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            tab === "code"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("code")}
        >
          <Code className="h-3.5 w-3.5" />
          Code
        </button>
        {onUpdateArtifact && (
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
              tab === "edit"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-chart-1" />
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "preview" ? (
          <ArtifactRenderer artifact={displayArtifact} />
        ) : tab === "code" ? (
          <StreamdownContent
            content={`\`\`\`${getCodeLanguage(displayArtifact)}\n${displayArtifact.content}\n\`\`\``}
            className="p-4"
          />
        ) : (
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
        )}
      </div>
    </div>
  )

  // When fullscreen, render via portal
  if (isFullscreen) {
    return createPortal(panelContent, document.body)
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
    default:
      return ""
  }
}
