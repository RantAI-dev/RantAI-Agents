import { z } from "zod"
import { nanoid } from "nanoid"

export const OutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stream"), name: z.enum(["stdout", "stderr"]), text: z.string() }),
  z.object({ type: z.literal("error"), ename: z.string(), evalue: z.string(), traceback: z.array(z.string()) }),
  z.object({
    type: z.literal("display_data"),
    data: z.object({
      "image/png": z.string().optional(),
      "text/html": z.string().optional(),
      "text/plain": z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("execute_result"),
    data: z.object({ "text/html": z.string().optional(), "text/plain": z.string().optional() }),
    executionCount: z.number(),
  }),
])

// The LLM's wire format only carries `type` and `source`. Everything else is
// runtime state that the renderer fills in. Defaulting these here means the
// parser accepts the same minimal shape the validator does, instead of
// rejecting it and rendering an empty notebook.
//
// Markdown cells never produce outputs — the refinement below normalises
// any incoming runtime fields on markdown cells back to defaults so the
// schema and prompt agree.
export const CellSchema = z
  .object({
    id: z.string().default(() => nanoid(8)),
    type: z.enum(["code", "markdown"]),
    source: z.string(),
    outputs: z.array(OutputSchema).default([]),
    executionCount: z.number().nullable().default(null),
  })
  .transform((cell) =>
    cell.type === "markdown" ? { ...cell, outputs: [], executionCount: null } : cell,
  )

const DEFAULT_METADATA = {
  kernelspec: { name: "python3" as const, display_name: "Python 3 (Pyodide)" },
  language_info: { name: "python" as const, version: "3.12" },
}

export const NotebookContentSchema = z.object({
  cells: z.array(CellSchema).min(1),
  metadata: z
    .object({
      kernelspec: z.object({ name: z.literal("python3"), display_name: z.string() }),
      language_info: z.object({ name: z.literal("python"), version: z.string() }),
    })
    .default(DEFAULT_METADATA),
})

export type Output = z.infer<typeof OutputSchema>
export type Cell = z.infer<typeof CellSchema>
export type NotebookContent = z.infer<typeof NotebookContentSchema>

export function makeCodeCell(source = ""): Cell {
  return { id: nanoid(8), type: "code", source, outputs: [], executionCount: null }
}

export function makeMarkdownCell(source = ""): Cell {
  return { id: nanoid(8), type: "markdown", source, outputs: [], executionCount: null }
}

export function makeEmptyNotebook(): NotebookContent {
  return {
    cells: [makeCodeCell("")],
    metadata: {
      kernelspec: { name: "python3", display_name: "Python 3 (Pyodide)" },
      language_info: { name: "python", version: "3.12" },
    },
  }
}
