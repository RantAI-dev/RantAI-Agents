"use client"

import { useMemo } from "react"
import DOMPurify from "dompurify"
import { AlertTriangle } from "@/lib/icons"

interface SvgRendererProps {
  content: string
}

interface ParseResult {
  ok: boolean
  sanitized?: string
  error?: string
}

/**
 * Parse the SVG with DOMParser before sanitizing so malformed input
 * surfaces an error card instead of silently rendering as an empty `<div>`.
 * On the server (no `DOMParser`) we fall back to "looks like SVG" sniffing.
 */
function parseAndSanitize(content: string): ParseResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, error: "SVG content is empty." }
  }

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(trimmed, "image/svg+xml")
      const parserError = doc.getElementsByTagName("parsererror")[0]
      if (parserError) {
        return {
          ok: false,
          error:
            parserError.textContent?.trim() ||
            "SVG failed to parse — check for unclosed tags or invalid attribute values.",
        }
      }
      if (!doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== "svg") {
        return {
          ok: false,
          error: "Root element is not <svg>. Wrap the markup in an <svg> element with xmlns and viewBox.",
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "SVG failed to parse.",
      }
    }
  } else if (!/<svg[\s>]/i.test(trimmed)) {
    return { ok: false, error: "Content does not contain an <svg> element." }
  }

  const sanitized = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
  })
  return { ok: true, sanitized }
}

export function SvgRenderer({ content }: SvgRendererProps) {
  const result = useMemo(() => parseAndSanitize(content), [content])

  if (!result.ok) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Could not render SVG</span>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {result.error}
          </div>
          <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
            {content}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center p-4 min-h-[100px] [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: result.sanitized! }}
    />
  )
}
