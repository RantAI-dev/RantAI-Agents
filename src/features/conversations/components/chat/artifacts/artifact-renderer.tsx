"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "@/lib/icons"
import type { Artifact } from "./types"
import { StreamdownContent } from "../streamdown-content"

// Lazy-load heavy renderers
const HtmlRenderer = dynamic(
  () => import("./renderers/html-renderer").then((m) => ({ default: m.HtmlRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const ReactRenderer = dynamic(
  () => import("./renderers/react-renderer").then((m) => ({ default: m.ReactRenderer })),
  {
    loading: () => <RendererLoading message="Transpiling React component..." />,
  }
)

const SvgRenderer = dynamic(
  () => import("./renderers/svg-renderer").then((m) => ({ default: m.SvgRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const MermaidRenderer = dynamic(
  () => import("./renderers/mermaid-renderer").then((m) => ({ default: m.MermaidRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const SheetRenderer = dynamic(
  () => import("./renderers/sheet-renderer").then((m) => ({ default: m.SheetRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const LatexRenderer = dynamic(
  () => import("./renderers/latex-renderer").then((m) => ({ default: m.LatexRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const SlidesRenderer = dynamic(
  () => import("./renderers/slides-renderer").then((m) => ({ default: m.SlidesRenderer })),
  {
    loading: () => <RendererLoading message="Building slide deck..." />,
  }
)

const PythonRenderer = dynamic(
  () => import("./renderers/python-renderer").then((m) => ({ default: m.PythonRenderer })),
  {
    loading: () => <RendererLoading message="Initializing Python runtime..." />,
  }
)

const R3FRenderer = dynamic(
  () => import("./renderers/r3f-renderer").then((m) => ({ default: m.R3FRenderer })),
  {
    loading: () => <RendererLoading message="Compiling 3D scene..." />,
  }
)


function RendererLoading({ message = "Loading preview..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      {message}
    </div>
  )
}

interface ArtifactRendererProps {
  artifact: Artifact
  /** Callback to send an artifact error to the LLM for automated repair. */
  onFixWithAI?: (error: string) => void
}

export function ArtifactRenderer({ artifact, onFixWithAI }: ArtifactRendererProps) {
  switch (artifact.type) {
    case "text/html":
      return <HtmlRenderer content={artifact.content} />
    case "application/react":
      return <ReactRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "image/svg+xml":
      return <SvgRenderer content={artifact.content} />
    case "application/mermaid":
      return <MermaidRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/sheet":
      return <SheetRenderer content={artifact.content} title={artifact.title} />
    case "text/latex":
      return <LatexRenderer content={artifact.content} />
    case "application/slides":
      return <SlidesRenderer content={artifact.content} />
    case "application/python":
      return <PythonRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/3d":
      return <R3FRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/code": {
      // Pick a fence length one longer than the longest backtick run
      // already inside the content, so code that itself contains ``` blocks
      // doesn't break syntax highlighting.
      const longestRun = (artifact.content.match(/`+/g) ?? [])
        .reduce((max, run) => Math.max(max, run.length), 0)
      const fence = "`".repeat(Math.max(3, longestRun + 1))
      return (
        <StreamdownContent
          content={`${fence}${artifact.language || ""}\n${artifact.content}\n${fence}`}
          className="p-4"
        />
      )
    }
    case "text/markdown":
      return <StreamdownContent content={artifact.content} className="p-4" />
    default:
      return (
        <pre className="p-4 text-sm whitespace-pre-wrap">{artifact.content}</pre>
      )
  }
}
