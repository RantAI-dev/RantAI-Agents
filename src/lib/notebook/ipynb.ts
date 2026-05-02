import {
  makeEmptyNotebook,
  type Cell,
  type NotebookContent,
  type Output,
} from "./types"
import { nanoid } from "nanoid"

type IpynbCell = {
  cell_type: "code" | "markdown"
  source: string[] | string
  metadata: Record<string, unknown>
  execution_count?: number | null
  outputs?: IpynbOutput[]
}

type IpynbOutput =
  | { output_type: "stream"; name: "stdout" | "stderr"; text: string[] | string }
  | { output_type: "error"; ename: string; evalue: string; traceback: string[] }
  | { output_type: "display_data"; data: Record<string, string | string[]>; metadata: Record<string, unknown> }
  | { output_type: "execute_result"; data: Record<string, string | string[]>; metadata: Record<string, unknown>; execution_count: number }

export type IpynbFile = {
  nbformat: 4
  nbformat_minor: 5
  metadata: Record<string, unknown>
  cells: IpynbCell[]
}

function splitLines(s: string): string[] {
  if (s === "") return []
  const parts = s.split("\n")
  return parts.map((line, i) => (i < parts.length - 1 ? line + "\n" : line)).filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""))
}

function joinLines(s: string[] | string): string {
  return Array.isArray(s) ? s.join("") : s
}

function outputToIpynb(o: Output): IpynbOutput {
  switch (o.type) {
    case "stream":
      return { output_type: "stream", name: o.name, text: splitLines(o.text) }
    case "error":
      return { output_type: "error", ename: o.ename, evalue: o.evalue, traceback: o.traceback }
    case "display_data":
      return {
        output_type: "display_data",
        data: Object.fromEntries(
          Object.entries(o.data).map(([k, v]) => [k, k === "image/png" ? v : splitLines(v)])
        ) as Record<string, string | string[]>,
        metadata: {},
      }
    case "execute_result":
      return {
        output_type: "execute_result",
        data: Object.fromEntries(Object.entries(o.data).map(([k, v]) => [k, splitLines(v)])) as Record<string, string | string[]>,
        metadata: {},
        execution_count: o.executionCount,
      }
  }
}

function outputFromIpynb(o: IpynbOutput): Output | null {
  switch (o.output_type) {
    case "stream":
      return { type: "stream", name: o.name, text: joinLines(o.text) }
    case "error":
      return { type: "error", ename: o.ename, evalue: o.evalue, traceback: o.traceback }
    case "display_data":
      return {
        type: "display_data",
        data: {
          "image/png": typeof o.data["image/png"] === "string" ? (o.data["image/png"] as string) : undefined,
          "text/html": o.data["text/html"] ? joinLines(o.data["text/html"]) : undefined,
          "text/plain": o.data["text/plain"] ? joinLines(o.data["text/plain"]) : undefined,
        },
      }
    case "execute_result":
      return {
        type: "execute_result",
        data: {
          "text/html": o.data["text/html"] ? joinLines(o.data["text/html"]) : undefined,
          "text/plain": o.data["text/plain"] ? joinLines(o.data["text/plain"]) : undefined,
        },
        executionCount: o.execution_count,
      }
    default:
      return null
  }
}

export function toIpynb(nb: NotebookContent): IpynbFile {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: nb.metadata,
    cells: nb.cells.map((c) => {
      const base: IpynbCell = {
        cell_type: c.type,
        source: splitLines(c.source),
        metadata: {},
      }
      if (c.type === "code") {
        base.execution_count = c.executionCount
        base.outputs = c.outputs.map(outputToIpynb)
      }
      return base
    }),
  }
}

export function fromIpynb(file: IpynbFile): NotebookContent {
  const nb = makeEmptyNotebook()
  nb.cells = file.cells.map((c): Cell => ({
    id: nanoid(8),
    type: c.cell_type === "markdown" ? "markdown" : "code",
    source: joinLines(c.source),
    outputs: c.cell_type === "code" ? (c.outputs ?? []).map(outputFromIpynb).filter((x): x is Output => x !== null) : [],
    executionCount: c.cell_type === "code" ? (c.execution_count ?? null) : null,
  }))
  return nb
}
