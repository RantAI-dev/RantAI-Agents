"use client"
import { useCallback, useEffect, useState } from "react"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"

interface RenderStatus {
  hash: string
  pageCount: number
  cached: boolean
}

interface Props {
  sessionId: string
  artifactId: string
  /** the JS script — faded preview during streaming, otherwise unused for display */
  content: string
  isStreaming: boolean
}

/**
 * Renders a `text/document` artifact whose content is a docx-js script.
 *
 * Layout mirrors `slides-renderer.tsx`:
 *  - main page area (bg-black/5 backdrop, page image centered)
 *  - bottom-anchored navigation bar (chevrons + counter + dots)
 *  - keyboard arrow nav (guarded against text-entry focus)
 *  - dot strip when pageCount ≤ 20
 */
export function DocumentScriptRenderer({ sessionId, artifactId, content, isStreaming }: Props) {
  const [status, setStatus] = useState<RenderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)

  // Trigger render-status fetch whenever the script changes (or streaming
  // ends). Skip while the LLM is still typing the script.
  useEffect(() => {
    if (isStreaming) return
    setStatus(null)
    setError(null)
    let cancelled = false
    fetch(
      `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-status`,
      { method: "GET" },
    )
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          setError(j.error ?? `HTTP ${r.status}`)
          return
        }
        const s = (await r.json()) as RenderStatus
        setStatus(s)
        setPageIdx(0)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, artifactId, content, isStreaming])

  const goPrev = useCallback(() => setPageIdx((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(
    () => setPageIdx((i) => (status ? Math.min(status.pageCount - 1, i + 1) : i)),
    [status],
  )

  // Keyboard arrow navigation. Slides-renderer pattern: ignore events while
  // a text input has focus so the chat composer / search bars keep their
  // arrow-key behaviour.
  useEffect(() => {
    if (!status || isStreaming) return
    const isTextEntry = (el: Element | null): boolean => {
      if (!el) return false
      const tag = el.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
      if ((el as HTMLElement).isContentEditable) return true
      return false
    }
    const handler = (e: KeyboardEvent) => {
      if (isTextEntry(document.activeElement)) return
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        goNext()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [status, isStreaming, goPrev, goNext])

  // ── streaming: show the JS code being typed ──
  if (isStreaming) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Generating script…</span>
          </div>
        </div>
        <CodeView content={content} subtle />
      </div>
    )
  }

  // ── error ──
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <div className="text-sm text-destructive">Preview unavailable</div>
            <div className="text-xs text-muted-foreground break-words">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── loading: render-status in flight ──
  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        <span className="text-sm">Rendering preview…</span>
      </div>
    )
  }

  const pageUrl = `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-pages/${status.hash}/${pageIdx}`
  const showDots = status.pageCount > 1 && status.pageCount <= 20

  return (
    <div className="flex flex-col h-full">
      {/* Page area — backdrop + centered image */}
      <div className="flex-1 min-h-0 bg-black/5 overflow-auto">
        <div className="min-h-full flex items-start justify-center p-4">
          <img
            key={`${status.hash}-${pageIdx}`}
            src={pageUrl}
            alt={`Page ${pageIdx + 1}`}
            className="max-w-full h-auto shadow-md bg-white"
          />
        </div>
      </div>

      {/* Bottom navigation bar — matches slides-renderer pattern */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={pageIdx <= 0}
            className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground min-w-[48px] text-center">
            {pageIdx + 1} / {status.pageCount}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={pageIdx >= status.pageCount - 1}
            className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Page dots when count is reasonable */}
        {showDots && (
          <div className="flex items-center gap-1">
            {Array.from({ length: status.pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPageIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === pageIdx
                    ? "bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Go to page ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CodeView({ content, subtle }: { content: string; subtle?: boolean }) {
  return (
    <pre
      className={`flex-1 min-h-0 overflow-auto text-xs p-4 bg-muted/20 font-mono leading-relaxed ${
        subtle ? "opacity-60" : ""
      }`}
    >
      <code>{content}</code>
    </pre>
  )
}
