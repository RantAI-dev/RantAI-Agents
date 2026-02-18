"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
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
    loading: () => <RendererLoading />,
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
    loading: () => <RendererLoading />,
  }
)

const PythonRenderer = dynamic(
  () => import("./renderers/python-renderer").then((m) => ({ default: m.PythonRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

function RendererLoading() {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading preview...
    </div>
  )
}

interface ArtifactRendererProps {
  artifact: Artifact
}

export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  switch (artifact.type) {
    case "text/html":
      return <HtmlRenderer content={artifact.content} />
    case "application/react":
      return <ReactRenderer content={artifact.content} />
    case "image/svg+xml":
      return <SvgRenderer content={artifact.content} />
    case "application/mermaid":
      return <MermaidRenderer content={artifact.content} />
    case "application/sheet":
      return <SheetRenderer content={artifact.content} />
    case "text/latex":
      return <LatexRenderer content={artifact.content} />
    case "application/slides":
      return <SlidesRenderer content={artifact.content} />
    case "application/python":
      return <PythonRenderer content={artifact.content} />
    case "application/code":
      return (
        <StreamdownContent
          content={`\`\`\`${artifact.language || ""}\n${artifact.content}\n\`\`\``}
          className="p-4"
        />
      )
    case "text/markdown":
      return <StreamdownContent content={artifact.content} className="p-4" />
    default:
      return (
        <pre className="p-4 text-sm whitespace-pre-wrap">{artifact.content}</pre>
      )
  }
}
