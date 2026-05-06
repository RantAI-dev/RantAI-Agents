/**
 * Version-vs-version diff computation for code artifacts.
 *
 * Built on `diff` (jsdiff). Produces structured `DiffLine` arrays for both
 * unified and split layouts. Pure functions — no React, no DOM.
 *
 * Sentinel: when the previous version's content is unavailable (S3
 * archive failed during update — see update-artifact.ts:184-191) the
 * panel passes `ARCHIVED_SENTINEL` as `before`. We surface that as a
 * dedicated `{ kind: "archived" }` result so the renderer can show the
 * Restore-prompt UI rather than a misleading diff.
 */

import { diffLines } from "diff"

/**
 * Sentinel string the panel uses to signal that a previous version's
 * content failed inline-fallback storage and is not available for diff.
 * The token is unmistakable — it should never appear in real source code.
 */
export const ARCHIVED_SENTINEL = "__ARTIFACT_VERSION_ARCHIVED__"

export type DiffLineKind = "context" | "added" | "removed"

export interface DiffLine {
  kind: DiffLineKind
  /** 1-indexed line number in the "before" content, or null for added lines / split-padding. */
  beforeLineNum: number | null
  /** 1-indexed line number in the "after" content, or null for removed lines / split-padding. */
  afterLineNum: number | null
  text: string
}

export type UnifiedDiffResult =
  | { kind: "ok"; lines: DiffLine[]; identical: boolean }
  | { kind: "archived" }
  | { kind: "error"; message: string }

export type SplitDiffResult =
  | { kind: "ok"; left: DiffLine[]; right: DiffLine[] }
  | { kind: "identical" }
  | { kind: "archived" }
  | { kind: "error"; message: string }

/** Split a `diff` change value into individual lines, dropping the trailing newline if present. */
function splitChangeValue(value: string): string[] {
  if (value === "") return []
  const trimmed = value.endsWith("\n") ? value.slice(0, -1) : value
  return trimmed.split("\n")
}

/**
 * Compute a unified line-level diff. Identical inputs return
 * `{ ok, identical: true, lines: [] }`. The archived sentinel as `before`
 * returns `{ archived }`. Library throws are caught and surfaced as
 * `{ error }`.
 */
export function computeUnifiedDiff(before: string, after: string): UnifiedDiffResult {
  if (before === ARCHIVED_SENTINEL) return { kind: "archived" }
  if (before === after) return { kind: "ok", identical: true, lines: [] }

  try {
    const changes = diffLines(before, after)
    const lines: DiffLine[] = []
    let beforeNum = 1
    let afterNum = 1

    for (const change of changes) {
      const segments = splitChangeValue(change.value)
      for (const text of segments) {
        if (change.added) {
          lines.push({ kind: "added", beforeLineNum: null, afterLineNum: afterNum++, text })
        } else if (change.removed) {
          lines.push({ kind: "removed", beforeLineNum: beforeNum++, afterLineNum: null, text })
        } else {
          lines.push({
            kind: "context",
            beforeLineNum: beforeNum++,
            afterLineNum: afterNum++,
            text,
          })
        }
      }
    }

    return { kind: "ok", identical: false, lines }
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown diff error",
    }
  }
}

/**
 * Compute a split (side-by-side) diff. Built on top of `computeUnifiedDiff`
 * and projects the unified line stream into two columns, padding empty
 * context lines to keep adds/removes aligned.
 */
export function computeSplitDiff(before: string, after: string): SplitDiffResult {
  const unified = computeUnifiedDiff(before, after)
  if (unified.kind === "archived") return { kind: "archived" }
  if (unified.kind === "error") return unified
  if (unified.identical) return { kind: "identical" }

  const left: DiffLine[] = []
  const right: DiffLine[] = []
  for (const line of unified.lines) {
    if (line.kind === "context") {
      left.push(line)
      right.push(line)
    } else if (line.kind === "removed") {
      left.push(line)
      right.push({ kind: "context", beforeLineNum: null, afterLineNum: null, text: "" })
    } else {
      left.push({ kind: "context", beforeLineNum: null, afterLineNum: null, text: "" })
      right.push(line)
    }
  }
  return { kind: "ok", left, right }
}
