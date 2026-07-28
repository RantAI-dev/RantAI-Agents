"use client"

import { Component, useState, type ComponentProps, type ErrorInfo, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import type { MermaidErrorComponentProps, ExtraProps } from "streamdown"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { useTheme } from "next-themes"
import { AlertTriangle, RotateCcw, Code } from "@/lib/icons"
import {
  linkifyCitations,
  stripDeadImages,
  parseCiteHref,
  citeAnchorId,
  embedFigures,
  autoEmbedFigures,
  autoPlaceFigures,
  embeddedFigureNumbers,
  citedFigureNumbers,
  type EmbeddableFigure,
} from "./citations"

// Error boundary specifically for Streamdown render failures. Streamdown
// parses markdown + KaTeX + Mermaid + Shiki on every render; a malformed
// fragment streaming mid-message (broken LaTeX, unclosed code fence with
// invalid lang, mid-token markdown) can throw inside one of those parsers
// and tear down the entire message bubble — the user sees their reply
// vanish. Falling back to <pre> preserves the content as plain text so
// at minimum nothing is lost while the user retries or refreshes.
interface StreamdownBoundaryProps {
  content: string
  children: ReactNode
}
interface StreamdownBoundaryState {
  hasError: boolean
}
class StreamdownErrorBoundary extends Component<
  StreamdownBoundaryProps,
  StreamdownBoundaryState
> {
  state: StreamdownBoundaryState = { hasError: false }

  static getDerivedStateFromError(): StreamdownBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log so the failure is observable; the user-facing fallback below
    // keeps the message readable regardless.
    console.error("Streamdown render failed:", error, info)
  }

  // Recover when the content changes (next chunk arrives or final flush)
  // — if the malformed fragment was mid-stream, the completed message may
  // parse fine. Without this the bubble stays in fallback for the rest
  // of its lifetime.
  componentDidUpdate(prevProps: StreamdownBoundaryProps) {
    if (this.state.hasError && prevProps.content !== this.props.content) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="flex items-center gap-2 text-amber-500 mb-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">
              Showing as plain text — markdown render failed
            </span>
          </div>
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono overflow-x-auto">
            {this.props.content}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function MermaidError({ error, chart, retry }: MermaidErrorComponentProps) {
  const [showSource, setShowSource] = useState(false)

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 text-amber-500 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium truncate">
            Diagram could not be rendered
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <Code className="h-3 w-3" />
            {showSource ? "Hide" : "Source"}
          </button>
        </div>
      </div>
      {showSource && (
        <pre className="px-3 py-2 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap font-mono">
          {chart}
        </pre>
      )}
      <div className="px-3 py-1.5 border-t border-amber-500/20 text-[11px] text-amber-500/70 truncate">
        {error}
      </div>
    </div>
  )
}

interface StreamdownContentProps {
  content: string
  isStreaming?: boolean
  className?: string
  /** When set, `[n]` markers become clickable chips scrolling to the matching
   *  source card (RAG answers). count = number of sources for this message.
   *  figures = figure sources the model may embed inline via `[figure:N]`. */
  citations?: { messageId: string; count: number; figures?: EmbeddableFigure[] }
}

/** Renders an inline figure the model embedded via `[figure:N]` (its src points
 *  at our asset route) as a bordered figure block with a caption. Non-figure
 *  images fall back to a plain img. */
function FigureImage({ src, alt, node: _node, ...props }: ComponentProps<"img"> & ExtraProps) {
  const isFigure = typeof src === "string" && src.includes("/asset?key=")
  if (!isFigure) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />
  }
  return (
    <span className="block my-3 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="rounded-lg border border-border/50 max-h-80 w-auto object-contain bg-white mx-auto inline-block"
      />
      {alt && (
        <span className="block text-[11px] text-muted-foreground mt-1.5 text-center">{alt}</span>
      )}
    </span>
  )
}

/** Scroll to a source card and briefly ring it. */
function focusCitation(messageId: string, n: number) {
  const el =
    typeof document !== "undefined"
      ? document.getElementById(citeAnchorId(messageId, n))
      : null
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  // Inset ring draws INSIDE the card, so it's never clipped by the sources
  // row's overflow-x-auto (which also clips vertically). A subtle bg tint adds
  // visibility without spilling outside the element bounds.
  el.classList.add("ring-2", "ring-inset", "ring-primary", "bg-primary/5")
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-inset", "ring-primary", "bg-primary/5")
  }, 1400)
}

/** Anchor renderer: sentinel `#cite-…` hrefs become citation chips; everything
 *  else renders as a normal external link. */
function CitationAnchor({
  href,
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & ExtraProps) {
  const cite = typeof href === "string" ? parseCiteHref(href) : null
  if (cite) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          focusCitation(cite.messageId, cite.n)
        }}
        className="inline-flex items-center justify-center align-super mx-[1px] min-w-[1.25em] h-[1.25em] px-1 rounded-full bg-primary/15 text-primary text-[0.7em] font-bold leading-none no-underline hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
        title={`Lihat sumber ${cite.n}`}
      >
        {cite.n}
      </button>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

export function StreamdownContent({
  content,
  isStreaming,
  className,
  citations,
}: StreamdownContentProps) {
  const { resolvedTheme } = useTheme()

  // Pipeline (once streaming settles so we don't shuffle mid-stream):
  //   strip dead MinerU refs → embed explicit [figure:N] → auto-embed figures
  //   cited [N] next to their citation → auto-place the rest inline next to the
  //   prose their caption matches (so ALL figures live in the answer, none in a
  //   separate strip) → linkify [n] citations into chips.
  const rendered = (() => {
    if (!citations) return content
    const figs = citations.figures ?? []
    const explicit = embeddedFigureNumbers(content)
    let out = embedFigures(stripDeadImages(content), figs)
    if (!isStreaming) {
      out = autoEmbedFigures(out, figs, explicit)
      const inlined = new Set<number>([...explicit, ...citedFigureNumbers(content, figs)])
      out = autoPlaceFigures(out, figs, inlined)
    }
    return linkifyCitations(out, citations.messageId, citations.count)
  })()

  return (
    <div className={className ?? "chat-message max-w-none"}>
      <StreamdownErrorBoundary content={rendered}>
        <Streamdown
          // Remount when streaming ends so the final answer renders from a clean
          // DOM. Streamdown's per-char fadeIn wraps tokens in opacity:0→1
          // animation spans; when isAnimating flips false mid-flight (and the
          // content shifts as figures are placed inline), some spans get stranded
          // at opacity:0 → invisible text that only a refresh fixed. The remount +
          // dropping the animation entirely on the final pass guarantees full
          // opacity. Keyed per-message so only the finishing message remounts.
          key={isStreaming ? "streaming" : "final"}
          {...(isStreaming
            ? { animated: { animation: "fadeIn" as const, sep: "char" as const, duration: 180 }, isAnimating: true }
            : {})}
          caret={isStreaming ? "block" : undefined}
          shikiTheme={
            resolvedTheme === "dark"
              ? ["github-dark", "github-light"]
              : ["github-light", "github-dark"]
          }
          controls={{ code: true, table: true, mermaid: true }}
          mermaid={{ errorComponent: MermaidError }}
          components={citations ? { a: CitationAnchor, img: FigureImage } : undefined}
          plugins={{
            math: {
              name: "katex",
              type: "math",
              remarkPlugin: remarkMath,
              rehypePlugin: rehypeKatex,
            },
          }}
        >
          {rendered}
        </Streamdown>
      </StreamdownErrorBoundary>
    </div>
  )
}
