"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react"
import type { PresentationData } from "@/lib/slides/types"
import { DEFAULT_THEME } from "@/lib/slides/types"
import { slidesToHtml } from "@/lib/slides/render-html"
import { parseLegacyMarkdown, isJsonPresentation } from "@/lib/slides/parse-legacy"

interface SlidesRendererProps {
  content: string
}

function parsePresentation(content: string): PresentationData {
  if (isJsonPresentation(content)) {
    try {
      const data = JSON.parse(content) as PresentationData
      if (data.slides && Array.isArray(data.slides) && data.slides.length > 0) {
        return {
          theme: data.theme || DEFAULT_THEME,
          slides: data.slides,
        }
      }
    } catch {
      // Fall through to legacy parser
    }
  }
  return parseLegacyMarkdown(content)
}

export function SlidesRenderer({ content }: SlidesRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [downloading, setDownloading] = useState(false)

  const presentation = useMemo(() => parsePresentation(content), [content])
  const srcdoc = useMemo(() => slidesToHtml(presentation), [presentation])

  // Listen for postMessage from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "slideChange") {
        setCurrentSlide(e.data.current)
        setTotalSlides(e.data.total)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  const navigate = useCallback(
    (direction: "next" | "prev") => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "navigate", direction },
        "*"
      )
    },
    []
  )

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        navigate("next")
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        navigate("prev")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [navigate])

  const handleDownloadPptx = useCallback(async () => {
    setDownloading(true)
    try {
      const { generatePptx } = await import("@/lib/slides/generate-pptx")
      const blob = await generatePptx(presentation)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${(presentation.slides[0]?.title || "presentation").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[SlidesRenderer] PPTX generation failed:", err)
    } finally {
      setDownloading(false)
    }
  }, [presentation])

  if (presentation.slides.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No slides found
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Slide preview */}
      <div className="flex-1 min-h-0 bg-black/5">
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title="Slide Preview"
        />
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("prev")}
            disabled={currentSlide <= 0}
            className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground min-w-[48px] text-center">
            {totalSlides > 0 ? `${currentSlide + 1} / ${totalSlides}` : "..."}
          </span>
          <button
            type="button"
            onClick={() => navigate("next")}
            disabled={currentSlide >= totalSlides - 1}
            className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Slide dots */}
        {totalSlides > 1 && totalSlides <= 20 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "navigate", direction: i },
                    "*"
                  )
                }
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentSlide
                    ? "bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleDownloadPptx}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloading ? "Generating..." : "Download PPTX"}
        </button>
      </div>
    </div>
  )
}
