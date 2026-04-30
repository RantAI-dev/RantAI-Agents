"use client"

import { useMemo, useRef, useCallback, useEffect, useState } from "react"
import { Loader2 } from "@/lib/icons"
import { IFRAME_NAV_BLOCKER_SCRIPT } from "./_iframe-nav-blocker"

interface HtmlRendererProps {
  content: string
}

const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"><\/script>'
const INTER_FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">'

/**
 * Match a `<head>` open tag whose attributes (if any) cannot contain a `>`
 * outside a quoted string. The previous pattern broke when an attribute
 * value contained `>`; this one explicitly handles single- and double-quoted
 * attribute values so things like `<head data-foo="a > b">` no longer break
 * injection.
 */
const HEAD_OPEN_RE =
  /<head((?:\s+(?:[^\s"'/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`<>=]+))?))*)\s*>/i

/**
 * Inject Tailwind CDN, Inter font, and the navigation blocker into an HTML
 * document. Security relies on the iframe sandbox (`allow-scripts`) — no
 * DOMPurify needed.
 */
function injectDefaults(html: string): string {
  const hasTailwind = /cdn\.tailwindcss\.com|tailwindcss/i.test(html)
  const hasInter = /fonts\.googleapis\.com\/css2\?family=Inter/i.test(html)

  // Full HTML document — inject into <head>
  if (HEAD_OPEN_RE.test(html)) {
    let result = html
    // Navigation prevention must be first (before any user scripts)
    result = result.replace(HEAD_OPEN_RE, (match) => `${match}\n${IFRAME_NAV_BLOCKER_SCRIPT}`)
    if (!hasTailwind) {
      result = result.replace(HEAD_OPEN_RE, (match) => `${match}\n${TAILWIND_CDN}`)
    }
    if (!hasInter) {
      result = result.replace(HEAD_OPEN_RE, (match) => `${match}\n${INTER_FONT_LINK}`)
    }
    return result
  }

  // Partial HTML — wrap in a full document. Declare `lang` for a11y.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${hasTailwind ? "" : TAILWIND_CDN}
  ${hasInter ? "" : INTER_FONT_LINK}
  <style>
    body { margin: 0; padding: 16px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
  </style>
  ${IFRAME_NAV_BLOCKER_SCRIPT}
</head>
<body>${html}</body>
</html>`
}

export function HtmlRenderer({ content }: HtmlRendererProps) {
  const srcdoc = useMemo(() => injectDefaults(content), [content])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const initialLoadDone = useRef(false)
  const restoring = useRef(false)
  const [loading, setLoading] = useState(true)
  const [slowLoad, setSlowLoad] = useState(false)

  // Reset load tracking when content changes
  useEffect(() => {
    initialLoadDone.current = false
    setLoading(true)
    setSlowLoad(false)
  }, [srcdoc])

  // Don't dismiss the spinner unconditionally on a timeout — that masks
  // real load failures (CDN blocked, network error). Instead surface a
  // "still loading" warning after 5s and let `onLoad` actually clear it.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!initialLoadDone.current) setSlowLoad(true)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [srcdoc])

  // Detect iframe navigation and restore srcDoc
  const handleLoad = useCallback(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      setLoading(false)
      setSlowLoad(false)
      return
    }
    if (restoring.current) {
      restoring.current = false
      return
    }
    // The iframe navigated away from srcDoc — force restore
    if (iframeRef.current) {
      restoring.current = true
      iframeRef.current.srcdoc = srcdoc
    }
  }, [srcdoc])

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {slowLoad
                ? "Still loading… an external resource may be slow or blocked."
                : "Loading preview..."}
            </span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        onLoad={handleLoad}
        sandbox="allow-scripts"
        className="w-full h-full border-0 bg-background"
        style={{ minHeight: "100%" }}
        title="HTML Artifact Preview"
      />
    </div>
  )
}
