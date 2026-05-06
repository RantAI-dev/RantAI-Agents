"use client"

import { useMemo } from "react"
import { Loader2, RotateCcw } from "@/lib/icons"
import {
  computeSplitDiff,
  computeUnifiedDiff,
  type DiffLine,
} from "./lib/diff"

export type DiffLayout = "unified" | "split"

export type PrevVersionFetchResult =
  | { kind: "ok"; content: string }
  | { kind: "archived" }
  | { kind: "error"; message: string }

export type PrevVersionState = "idle" | "loading" | PrevVersionFetchResult

interface CodeDiffViewProps {
  /** State of the previous-version fetch driven by the parent CodeRenderer. */
  prevState: PrevVersionState
  after: string
  layout: DiffLayout
  onLayoutChange: (next: DiffLayout) => void
  wrap: boolean
  /** Called with the version number to restore when the archived-state Restore button is clicked. */
  onRestorePrevious?: (versionNum: number) => void
  /** Version number of the "before" side — used for the Restore button payload. */
  previousVersionNum: number
  /** Re-invokes the parent's fetcher; surfaced on the error-state Retry button. */
  onRetry?: () => void
}

const LARGE_DIFF_LINE_THRESHOLD = 5000

export function CodeDiffView({
  prevState,
  after,
  layout,
  onLayoutChange,
  wrap,
  onRestorePrevious,
  previousVersionNum,
  onRetry,
}: CodeDiffViewProps) {
  if (prevState === "idle") {
    return <NoticeCard>Preparing diff…</NoticeCard>
  }
  if (prevState === "loading") {
    return (
      <NoticeCard>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading previous version…
        </span>
      </NoticeCard>
    )
  }
  if (prevState.kind === "error") {
    return (
      <NoticeCard>
        Could not load previous version: {prevState.message}.
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-foreground/10 hover:bg-foreground/20"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </NoticeCard>
    )
  }
  if (prevState.kind === "archived") {
    return (
      <NoticeCard>
        Diff unavailable — the previous version&apos;s content was archived to
        storage and isn&apos;t loaded into the panel.
        {onRestorePrevious && (
          <button
            type="button"
            onClick={() => onRestorePrevious(previousVersionNum)}
            className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-foreground/10 hover:bg-foreground/20"
          >
            <RotateCcw className="h-3 w-3" />
            Restore v{previousVersionNum}
          </button>
        )}
      </NoticeCard>
    )
  }

  return (
    <DiffBody
      before={prevState.content}
      after={after}
      layout={layout}
      onLayoutChange={onLayoutChange}
      wrap={wrap}
      previousVersionNum={previousVersionNum}
    />
  )
}

interface DiffBodyProps {
  before: string
  after: string
  layout: DiffLayout
  onLayoutChange: (next: DiffLayout) => void
  wrap: boolean
  previousVersionNum: number
}

function DiffBody({ before, after, layout, onLayoutChange, wrap, previousVersionNum }: DiffBodyProps) {
  const unified = useMemo(() => computeUnifiedDiff(before, after), [before, after])
  const split = useMemo(
    () => (layout === "split" ? computeSplitDiff(before, after) : null),
    [before, after, layout],
  )

  if (unified.kind === "error") {
    return (
      <NoticeCard>
        Could not compute diff: {unified.message}.
      </NoticeCard>
    )
  }
  if (unified.kind === "ok" && unified.identical) {
    return (
      <NoticeCard>
        No changes between v{previousVersionNum} and the current version.
      </NoticeCard>
    )
  }
  if (unified.kind === "archived") {
    return <NoticeCard>Diff unavailable.</NoticeCard>
  }

  const lineCount = unified.lines.length
  const showLargeWarning = lineCount > LARGE_DIFF_LINE_THRESHOLD

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/20 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {lineCount} line{lineCount === 1 ? "" : "s"}
          {showLargeWarning && (
            <span className="ml-2 text-amber-500">large diff — rendering may be slow</span>
          )}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Diff layout">
          <button
            type="button"
            aria-label="Unified layout"
            onClick={() => onLayoutChange("unified")}
            data-active={layout === "unified" ? "true" : "false"}
            className={
              "px-2 py-0.5 rounded " +
              (layout === "unified" ? "bg-background outline outline-1 outline-foreground/40" : "hover:bg-muted")
            }
          >
            Unified
          </button>
          <button
            type="button"
            aria-label="Split layout"
            onClick={() => onLayoutChange("split")}
            data-active={layout === "split" ? "true" : "false"}
            className={
              "px-2 py-0.5 rounded " +
              (layout === "split" ? "bg-background outline outline-1 outline-foreground/40" : "hover:bg-muted")
            }
          >
            Split
          </button>
        </div>
      </div>
      {layout === "unified" ? (
        <UnifiedTable lines={unified.lines} wrap={wrap} />
      ) : split && split.kind === "ok" ? (
        <SplitTable left={split.left} right={split.right} wrap={wrap} />
      ) : (
        <NoticeCard>Could not compute split diff.</NoticeCard>
      )}
    </div>
  )
}

function UnifiedTable({ lines, wrap }: { lines: DiffLine[]; wrap: boolean }) {
  return (
    <div className="overflow-auto flex-1">
      <table className="w-full font-mono text-xs">
        <tbody>
          {lines.map((line, i) => (
            <DiffRow key={i} line={line} wrap={wrap} showBothNums />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitTable({ left, right, wrap }: { left: DiffLine[]; right: DiffLine[]; wrap: boolean }) {
  return (
    <div className="overflow-auto flex-1 grid grid-cols-2 gap-px bg-border/40">
      <div data-diff-column="left" className="bg-background overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <tbody>
            {left.map((line, i) => (
              <DiffRow key={`l-${i}`} line={line} wrap={wrap} showBothNums={false} side="before" />
            ))}
          </tbody>
        </table>
      </div>
      <div data-diff-column="right" className="bg-background overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <tbody>
            {right.map((line, i) => (
              <DiffRow key={`r-${i}`} line={line} wrap={wrap} showBothNums={false} side="after" />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiffRow({
  line,
  wrap,
  showBothNums,
  side,
}: {
  line: DiffLine
  wrap: boolean
  showBothNums: boolean
  side?: "before" | "after"
}) {
  const bg =
    line.kind === "added"
      ? "bg-green-500/10"
      : line.kind === "removed"
      ? "bg-red-500/10"
      : "bg-transparent"
  const marker =
    line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
  const num = (n: number | null) =>
    n === null ? "" : String(n)

  return (
    <tr data-diff-kind={line.kind} className={bg}>
      {showBothNums && (
        <td className="select-none text-right pr-2 pl-3 text-muted-foreground/70 tabular-nums w-10">
          {num(line.beforeLineNum)}
        </td>
      )}
      <td className="select-none text-right pr-2 text-muted-foreground/70 tabular-nums w-10">
        {showBothNums ? num(line.afterLineNum) : num(side === "before" ? line.beforeLineNum : line.afterLineNum)}
      </td>
      <td className="pr-2 text-muted-foreground/80 select-none w-4">{marker}</td>
      <td className={wrap ? "whitespace-pre-wrap break-words pr-3" : "whitespace-pre pr-3"}>
        {line.text}
      </td>
    </tr>
  )
}

function NoticeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center p-8 text-sm text-muted-foreground text-center">
      <div className="max-w-md">{children}</div>
    </div>
  )
}
