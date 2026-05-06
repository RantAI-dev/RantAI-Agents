"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "@/lib/icons"
import type { Artifact } from "./types"
import type { PrevVersionFetchResult } from "./renderers/code/code-diff-view"
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
  () => import("./renderers/latex").then((m) => ({ default: m.LatexRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const CodeRenderer = dynamic(
  () => import("./renderers/code").then((m) => ({ default: m.CodeRenderer })),
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

const NotebookRenderer = dynamic(
  () => import("./renderers/notebook/notebook-renderer").then((m) => ({ default: m.NotebookRenderer })),
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
  /** True when the artifact has at least one previous version (drives diff toggle). */
  hasPreviousVersion?: boolean
  /** Version number of the previous version (1-indexed). */
  previousVersionNum?: number
  /** Lazy fetcher for previous-version content (used by application/code's diff view). */
  fetchPreviousVersion?: () => Promise<PrevVersionFetchResult>
  /** Wired to the panel's handleRestoreVersion. */
  onRestoreVersion?: (versionNum: number) => void
  /** Controlled mode for application/code's source-vs-diff view. Defaults to "source" if omitted. */
  codeMode?: "source" | "diff"
  /** Callback when application/code's mode changes. No-op if omitted. */
  onCodeModeChange?: (mode: "source" | "diff") => void
}

export function ArtifactRenderer({
  artifact,
  onFixWithAI,
  hasPreviousVersion,
  previousVersionNum,
  fetchPreviousVersion,
  onRestoreVersion,
  codeMode,
  onCodeModeChange,
}: ArtifactRendererProps) {
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
      return (
        <NotebookRenderer
          artifactId={artifact.id}
          content={artifact.content}
          onFixWithAI={onFixWithAI}
        />
      )
    case "application/3d":
      return <R3FRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/code":
      return (
        <CodeRenderer
          artifact={artifact}
          hasPreviousVersion={hasPreviousVersion ?? false}
          previousVersionNum={previousVersionNum}
          fetchPreviousVersion={fetchPreviousVersion}
          onRestoreVersion={onRestoreVersion}
          mode={codeMode ?? "source"}
          onModeChange={onCodeModeChange ?? (() => {})}
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
