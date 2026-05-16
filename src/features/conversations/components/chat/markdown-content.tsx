"use client"

import { memo, useEffect, useRef, useState } from "react"
import { StreamdownContent } from "./streamdown-content"

interface MarkdownContentProps {
  content: string
  isStreaming?: boolean
  className?: string
}

// Pace character delivery into Streamdown via requestAnimationFrame so
// the reveal is even regardless of SSE chunk cadence. Without this, a
// chunk carrying 50 chars renders all 50 at once and the user perceives
// a "burst" — Streamdown's own char-fade still animates each char, but
// they all start at the same instant, defeating the typing feel.
//
// Adaptive rate keeps us from lagging far behind the server: baseline
// ~60 chars/sec for natural typing pace, accelerating up to 300/sec
// when we're more than 300 chars behind so a long reply still finishes
// in reasonable time. When isStreaming flips false the loop tears down
// and we snap to the final target.
function useTypewriter(target: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = useState(target)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(targetRef.current)
      return
    }

    let cancelled = false
    let last = performance.now()
    let raf = 0

    const tick = (now: number) => {
      if (cancelled) return
      const dt = now - last
      last = now

      setDisplayed((prev) => {
        const t = targetRef.current
        // Target shrunk (edit/regenerate edge case) — snap.
        if (prev.length > t.length) return t
        // Up to date — bail out so React skips the re-render.
        if (prev.length === t.length) return prev

        const remaining = t.length - prev.length
        let rate = 60
        if (remaining > 300) rate = 300
        else if (remaining > 100) rate = 120
        const charsToAdd = Math.max(1, Math.round((rate * dt) / 1000))
        return t.slice(0, Math.min(t.length, prev.length + charsToAdd))
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [isStreaming])

  return displayed
}

// React.memo so non-streaming (historical) bubbles skip the Streamdown
// re-parse — markdown/KaTeX/Mermaid/Shiki are the dominant per-chunk
// cost in a long chat. The streaming bubble's `content` changes every
// chunk so memo bails out there (correct, it has to re-render); every
// other bubble's `content` is reference-equal across stream ticks so
// memo short-circuits the whole subtree.
export const MarkdownContent = memo(function MarkdownContent({
  content,
  isStreaming,
  className,
}: MarkdownContentProps) {
  const displayed = useTypewriter(content, isStreaming ?? false)
  return (
    <StreamdownContent
      content={displayed}
      isStreaming={isStreaming}
      className={className}
    />
  )
})
