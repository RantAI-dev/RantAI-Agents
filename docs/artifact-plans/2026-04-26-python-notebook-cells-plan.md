# application/python Notebook-Style Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-script `application/python` artifact into a multi-cell notebook where each cell can run independently against a shared Pyodide global namespace, with per-cell output and a single "Run All" pass — matching the Jupyter / `# %%` workflow data scientists expect.

**Architecture:** Reuse the existing Pyodide worker but restructure execution: instead of `runPython(allContent)`, split content on the standard `# %%` delimiter, run each cell as `runPython(cellCode)` against the shared `globals()`, and capture stdout / stderr / matplotlib plots per-cell. The worker stays singleton across runs (same as today). The renderer becomes a vertical stack of `<CellEditor>` + `<CellOutput>` pairs; "Run" runs one cell, "Run All" walks the cells in order. Validator updates: allow `# %%` markers, run import / banned-package check across the concatenation of all cells.

**Tech Stack:** Pyodide v0.27.6 (already installed), Web Worker pattern (already in place), Streamdown for cell editors (already used), TypeScript, vitest.

---

## Spec (distilled from the 2026-04-26 capabilities discussion)

**In scope (v1):**
- New cell delimiter: `# %%` at the start of a line marks a new cell. The first line is implicitly cell 1.
- Optional cell title after the delimiter: `# %% Cell title here` — surfaced in the UI; defaults to `Cell 1`, `Cell 2`, …
- Single Pyodide worker shared across cells (state persists: defining `x = 5` in cell 1 makes `x` available in cell 2).
- Per-cell `Run` button that runs only that cell's code through `pyodide.runPython(cellCode)`.
- `Run All` button at the top — runs cells in order, stopping on the first cell that errors (later cells stay non-executed; user can re-run after fixing).
- `Restart Kernel` button — terminates the worker and clears all per-cell outputs (next Run cold-starts Pyodide).
- Per-cell output area: stdout + stderr + matplotlib plots + the cell's last expression value. Errors render the same way as the current single-script flow.
- Validator updates: scan banned-package imports across the concatenation of all cells (so `import torch` in cell 3 still trips the validator); content size cap stays at 512 KiB total.
- Backwards compatibility: artifacts authored before this feature have NO `# %%` delimiter — the renderer treats the whole script as cell 1, and the old "Run" button keeps working unchanged. Editing such an artifact and adding a `# %%` delimiter promotes it to multi-cell.

**Out of scope (v1, documented):**
- Markdown cells (notebook-style narrative cells between code cells) — defer to v2.
- Reordering cells via drag-drop — keep cell order tied to source-text order in v1.
- Per-cell output caching across browser sessions — outputs only live for the current panel session.
- Python kernel state inspection panel ("variables view") — defer to v2.

**Non-goals:**
- Kernel choices beyond Pyodide.
- Ability to import Pyodide-incompatible packages.
- Server-side execution (Pyodide stays browser-side).

---

## File Structure

**Create:**
- `src/lib/python-notebook/parse.ts` — `parseCells(content): Cell[]` splits on `# %%`
- `src/lib/python-notebook/types.ts` — `Cell`, `CellOutput`, `CellState` types
- `src/features/conversations/components/chat/artifacts/renderers/python-cell.tsx` — single cell editor + output component
- `src/features/conversations/components/chat/artifacts/renderers/python-worker.ts` — worker code with `executeCell` message handler (extracted from current python-renderer)
- `tests/unit/python-notebook/parse.test.ts` — cell parser tests
- `tests/unit/python-notebook/validate.test.ts` — multi-cell validator tests

**Modify:**
- `src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx` — replace single editor + output with the cell stack; keep top toolbar (`Run All`, `Restart Kernel`)
- `src/lib/tools/builtin/_validate-artifact.ts` — `validatePython` now scans the concatenation of all cells (or a flat string with `# %%` markers stripped) for banned imports / `input()` / `open(write)`
- `src/lib/prompts/artifacts/python.ts` — document the `# %%` delimiter convention for the LLM
- `docs/artifact-plans/artifacts-capabilities.md` — update §11 (`application/python`) to describe the multi-cell model

---

## Task 1: Cell parser

**Files:**
- Create: `src/lib/python-notebook/types.ts`
- Create: `src/lib/python-notebook/parse.ts`
- Create: `tests/unit/python-notebook/parse.test.ts`

- [ ] **Step 1: Write failing tests for `parseCells`**

```ts
// tests/unit/python-notebook/parse.test.ts
import { describe, it, expect } from "vitest"
import { parseCells } from "@/lib/python-notebook/parse"

describe("parseCells", () => {
  it("treats no-delimiter content as a single cell", () => {
    const cells = parseCells("print('hi')\nx = 1")
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({ index: 0, title: "Cell 1", code: "print('hi')\nx = 1" })
  })

  it("splits on the # %% delimiter", () => {
    const src = `import numpy\n# %%\nx = 5\n# %%\nprint(x)`
    const cells = parseCells(src)
    expect(cells).toHaveLength(3)
    expect(cells[0].code.trim()).toBe("import numpy")
    expect(cells[1].code.trim()).toBe("x = 5")
    expect(cells[2].code.trim()).toBe("print(x)")
  })

  it("captures titles after the delimiter", () => {
    const src = `# %% Setup\nimport numpy\n# %% Compute\nx = 5`
    const cells = parseCells(src)
    expect(cells[0].title).toBe("Setup")
    expect(cells[1].title).toBe("Compute")
  })

  it("falls back to default titles when title is missing", () => {
    const src = `# %%\nx = 1\n# %%\ny = 2`
    const cells = parseCells(src)
    expect(cells[0].title).toBe("Cell 1")
    expect(cells[1].title).toBe("Cell 2")
  })

  it("requires the delimiter at line start (no false matches mid-line)", () => {
    const src = `print("# %% not a cell marker")\nx = 1`
    const cells = parseCells(src)
    expect(cells).toHaveLength(1)
  })

  it("preserves the original code line numbering inside each cell for error reporting", () => {
    const src = `import x\n# %%\nbroken syntax\n# %%\nok = 1`
    const cells = parseCells(src)
    // Cell 2 starts at source line 3 (line 1 = import x, line 2 = delimiter)
    expect(cells[1].sourceStartLine).toBe(3)
    expect(cells[2].sourceStartLine).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test tests/unit/python-notebook/parse.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement types + parser**

```ts
// src/lib/python-notebook/types.ts
export interface Cell {
  index: number
  title: string
  code: string
  /** 1-based line number in the original source where this cell's code starts.
   *  Used to map Pyodide tracebacks back to source line numbers. */
  sourceStartLine: number
}

export interface CellOutput {
  stdout: string
  stderr: string
  /** Last expression value when the cell ends with an expression statement. */
  result?: string
  /** Base64-encoded PNG strings collected from `plt.show()` calls. */
  plots: string[]
  /** Set when the cell raised an exception. */
  error?: { type: string; message: string; traceback: string }
}

export type CellState = "idle" | "running" | "completed" | "errored"
```

```ts
// src/lib/python-notebook/parse.ts
import type { Cell } from "./types"

/** Cell delimiter: `# %%` at the start of a line, optionally followed by a
 *  title. Standard convention used by VS Code's Python notebook + Jupyter
 *  text format. Deliberately requires the marker to be at the line start
 *  so a string literal containing `# %%` doesn't split a cell. */
const CELL_DELIMITER = /^# %%(.*)$/

export function parseCells(content: string): Cell[] {
  const lines = content.split("\n")
  const cells: Cell[] = []
  let currentCode: string[] = []
  let currentTitle: string | null = null
  let currentStartLine = 1
  let cellIndex = 0
  let lineNumber = 1

  const finalizeCell = () => {
    cells.push({
      index: cellIndex,
      title: currentTitle?.trim() || `Cell ${cellIndex + 1}`,
      code: currentCode.join("\n"),
      sourceStartLine: currentStartLine,
    })
    cellIndex++
    currentCode = []
    currentTitle = null
  }

  for (const line of lines) {
    const match = line.match(CELL_DELIMITER)
    if (match) {
      // Encountered a delimiter — flush current buffer (unless empty AND no
      // cells yet, which means the file opens with `# %%`).
      if (currentCode.length > 0 || cells.length > 0) {
        finalizeCell()
      }
      currentTitle = match[1] ?? ""
      currentStartLine = lineNumber + 1
    } else {
      currentCode.push(line)
    }
    lineNumber++
  }
  // Flush the trailing cell (always, even if empty — preserves cell count
  // when content ends with an empty cell).
  if (currentCode.length > 0 || cells.length === 0) {
    finalizeCell()
  }

  return cells
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test tests/unit/python-notebook/parse.test.ts
```

Expected: PASS — all 6 parser tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/python-notebook/types.ts src/lib/python-notebook/parse.ts tests/unit/python-notebook/parse.test.ts
git commit -m "feat(python-notebook): cell parser splitting on # %% delimiter"
```

---

## Task 2: Validator update — multi-cell scan

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Create: `tests/unit/python-notebook/validate.test.ts`

- [ ] **Step 1: Write failing tests for validator on multi-cell content**

```ts
// tests/unit/python-notebook/validate.test.ts
import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validatePython — multi-cell content", () => {
  it("accepts a deck of cells separated by # %%", async () => {
    const content = `import numpy as np\n# %% Compute\nx = np.array([1, 2, 3])\n# %% Display\nprint(x.sum())`
    const r = await validateArtifactContent("application/python", content)
    expect(r.ok).toBe(true)
  })

  it("rejects banned imports anywhere across cells", async () => {
    const content = `print('hi')\n# %% Train\nimport torch\nx = torch.tensor([1])`
    const r = await validateArtifactContent("application/python", content)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/torch/)
  })

  it("rejects input() in any cell", async () => {
    const content = `# %% Setup\nx = 1\n# %% Bad\nname = input("name? ")`
    const r = await validateArtifactContent("application/python", content)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/input/)
  })

  it("warns once when no cell prints or shows output", async () => {
    const content = `# %%\nx = 1\n# %%\ny = 2`
    const r = await validateArtifactContent("application/python", content)
    expect(r.ok).toBe(true)
    const printWarnings = r.warnings.filter((w) => /print\(\) or plt\.show\(\)/.test(w))
    expect(printWarnings).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test tests/unit/python-notebook/validate.test.ts
```

Expected: FAIL — current validator doesn't strip cell delimiters; the `# %%` lines may interfere with import detection (or not, depending on regex). Confirm exact failure.

- [ ] **Step 3: Update `validatePython` to strip delimiters before scanning**

```ts
// src/lib/tools/builtin/_validate-artifact.ts — inside validatePython, before the existing scans

// Multi-cell support: strip # %% delimiters so the rest of the validator
// sees the full concatenated script. The delimiter is purely a UI hint
// and never executes; banned-import / input() / open() checks should fire
// on banned content in ANY cell, not be fooled by the delimiter line.
const cellMarkerRegex = /^# %%.*$/gm
const flattened = content.replace(cellMarkerRegex, "")
// Now run all existing checks against `flattened` instead of `content`.
// Replace each `content.split(...)` / `content.match(...)` reference inside
// validatePython with `flattened` for the scanning steps; keep `content`
// only for the "is empty?" / total-size guard at the top.
```

(In the actual edit: rename `content` to `originalContent` at the function entry, define `flattened`, and use `flattened` for all subsequent regex tests. Keep the empty-content guard against `originalContent` so a notebook with delimiters but no code still rejects as empty.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test tests/unit/python-notebook/validate.test.ts tests/unit/tools/validate-artifact.test.ts
```

Expected: PASS — multi-cell tests green AND existing single-script python tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/python-notebook/validate.test.ts
git commit -m "feat(validate-python): scan banned imports across multi-cell content"
```

---

## Task 3: Worker module — extract executeCell handler

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/python-worker.ts`

- [ ] **Step 1: Read the current worker code in `python-renderer.tsx`**

```bash
grep -n "Worker\|workerRef\|onmessage\|postMessage\|importScripts" src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx | head
```

Expected output: lines ~136–193 manage worker lifecycle; the worker code itself is constructed via `Blob` + `URL.createObjectURL` inline.

- [ ] **Step 2: Extract the worker source to a dedicated module**

```ts
// src/features/conversations/components/chat/artifacts/renderers/python-worker.ts
/**
 * Pyodide worker. Each `runCell` message executes the supplied code
 * fragment against the SHARED global namespace, posting per-cell outputs
 * back to the host. The Pyodide instance is initialized lazily on the
 * first run — subsequent runs reuse the same VM, so a variable defined
 * in cell A is visible in cell B (Jupyter-style).
 *
 * Message protocol:
 *   host → worker:  { type: "runCell"; cellIndex: number; code: string }
 *   host → worker:  { type: "stop" }                  // terminate worker
 *   worker → host:  { type: "ready" }                  // first init done
 *   worker → host:  { type: "stdout"; cellIndex; data }
 *   worker → host:  { type: "stderr"; cellIndex; data }
 *   worker → host:  { type: "plot";   cellIndex; data: base64 }
 *   worker → host:  { type: "result"; cellIndex; value }
 *   worker → host:  { type: "error";  cellIndex; error: { type, message, traceback } }
 *   worker → host:  { type: "done";   cellIndex }
 */
export const PYTHON_WORKER_SOURCE = `
self.importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.6/full/pyodide.js")

let pyodideReadyPromise = null
async function getPyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      const pyodide = await self.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.6/full/",
      })
      await pyodide.loadPackage(["numpy", "matplotlib", "scikit-learn"])
      // Inject helpers for stdout/stderr/plot capture. These run once.
      pyodide.runPython(\`
import sys, io, base64
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

__plot_images__ = []
__cell_index__ = 0

class _Capture:
    def __init__(self, stream):
        self.stream = stream
    def write(self, data):
        if data:
            from js import postMessage
            postMessage({"type": self.stream, "cellIndex": __cell_index__, "data": data})
    def flush(self):
        pass

sys.stdout = _Capture("stdout")
sys.stderr = _Capture("stderr")

_orig_show = plt.show
def _capture_show(*args, **kwargs):
    fig = plt.gcf()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    encoded = base64.b64encode(buf.getvalue()).decode()
    from js import postMessage
    postMessage({"type": "plot", "cellIndex": __cell_index__, "data": encoded})
    plt.close(fig)
plt.show = _capture_show
\`)
      self.postMessage({ type: "ready" })
      return pyodide
    })()
  }
  return pyodideReadyPromise
}

self.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === "stop") {
    self.close()
    return
  }
  if (msg.type === "runCell") {
    const pyodide = await getPyodide()
    pyodide.globals.set("__cell_index__", msg.cellIndex)
    try {
      const result = await pyodide.runPythonAsync(msg.code)
      if (result !== undefined && result !== null) {
        self.postMessage({ type: "result", cellIndex: msg.cellIndex, value: String(result) })
      }
      self.postMessage({ type: "done", cellIndex: msg.cellIndex })
    } catch (err) {
      const errMsg = err && err.message ? String(err.message) : String(err)
      const errType = err && err.type ? String(err.type) : "PyodideError"
      const traceback = err && err.traceback ? String(err.traceback) : ""
      self.postMessage({
        type: "error",
        cellIndex: msg.cellIndex,
        error: { type: errType, message: errMsg, traceback },
      })
      self.postMessage({ type: "done", cellIndex: msg.cellIndex })
    }
  }
}
`
```

- [ ] **Step 3: Sanity-check the module compiles**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "python-worker" | head
```

Expected: empty output (no errors — the file is just an exported template-string constant).

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/python-worker.ts
git commit -m "feat(python-worker): extract worker source as a module-scoped string with cell-aware messaging"
```

---

## Task 4: PythonCell component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/python-cell.tsx`

- [ ] **Step 1: Implement the cell UI component**

```tsx
// src/features/conversations/components/chat/artifacts/renderers/python-cell.tsx
"use client"

import { Loader2, Play, Square } from "@/lib/icons"
import { StreamdownContent } from "../../streamdown-content"
import type { Cell, CellOutput, CellState } from "@/lib/python-notebook/types"

interface PythonCellProps {
  cell: Cell
  state: CellState
  output: CellOutput | null
  onRun: () => void
  onStop?: () => void
}

export function PythonCell({ cell, state, output, onRun, onStop }: PythonCellProps) {
  const isRunning = state === "running"
  const fence = "\`\`\`"
  return (
    <div className="border rounded-md mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
        <div className="text-xs font-medium text-muted-foreground">
          [{cell.index + 1}] {cell.title}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {isRunning ? "Running…" : "Run"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-background">
        <StreamdownContent content={`${fence}python\n${cell.code}\n${fence}`} className="p-3" />
      </div>

      {output && (
        <div className="px-3 py-2 border-t bg-muted/20 space-y-2">
          {output.stdout && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{output.stdout}</pre>
          )}
          {output.stderr && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-orange-700">{output.stderr}</pre>
          )}
          {output.plots.map((plot, i) => (
            <img key={i} src={`data:image/png;base64,${plot}`} alt={`Cell ${cell.index + 1} plot ${i + 1}`} className="max-w-full" />
          ))}
          {output.result && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-primary">{output.result}</pre>
          )}
          {output.error && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-red-700">
              {output.error.type}: {output.error.message}
              {output.error.traceback ? `\n${output.error.traceback}` : ""}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Sanity-check it compiles**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "python-cell" | head
```

Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/python-cell.tsx
git commit -m "feat(python-cell): per-cell editor + output component"
```

---

## Task 5: Wire python-renderer to multi-cell + worker

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx`

- [ ] **Step 1: Replace the renderer with the cell-stack version**

```tsx
// src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx
"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Play, RotateCw } from "@/lib/icons"
import { parseCells } from "@/lib/python-notebook/parse"
import type { Cell, CellOutput, CellState } from "@/lib/python-notebook/types"
import { PythonCell } from "./python-cell"
import { PYTHON_WORKER_SOURCE } from "./python-worker"

interface PythonRendererProps {
  content: string
  onFixWithAI?: (error: string) => void
}

interface CellRunState {
  state: CellState
  output: CellOutput | null
}

export function PythonRenderer({ content, onFixWithAI }: PythonRendererProps) {
  const cells = useMemo(() => parseCells(content), [content])
  const [runStates, setRunStates] = useState<Map<number, CellRunState>>(new Map())
  const [workerReady, setWorkerReady] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const runQueueRef = useRef<{ cellIndex: number; resolve: () => void }[]>([])

  // Reset run states when the content changes structurally (number of cells
  // changed). Same-cell-count, different-code edits keep the prior outputs
  // visible — the user re-runs to refresh.
  useEffect(() => {
    setRunStates((prev) => {
      const next = new Map<number, CellRunState>()
      for (const cell of cells) {
        next.set(cell.index, prev.get(cell.index) ?? { state: "idle", output: null })
      }
      return next
    })
  }, [cells.length])

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const blob = new Blob([PYTHON_WORKER_SOURCE], { type: "application/javascript" })
    const worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === "ready") {
        setWorkerReady(true)
        return
      }
      const cellIndex = msg.cellIndex as number
      setRunStates((prev) => {
        const next = new Map(prev)
        const existing = next.get(cellIndex) ?? { state: "running" as CellState, output: null }
        const out: CellOutput = existing.output ?? { stdout: "", stderr: "", plots: [] }
        switch (msg.type) {
          case "stdout":
            next.set(cellIndex, { ...existing, output: { ...out, stdout: out.stdout + msg.data } })
            break
          case "stderr":
            next.set(cellIndex, { ...existing, output: { ...out, stderr: out.stderr + msg.data } })
            break
          case "plot":
            next.set(cellIndex, { ...existing, output: { ...out, plots: [...out.plots, msg.data] } })
            break
          case "result":
            next.set(cellIndex, { ...existing, output: { ...out, result: msg.value } })
            break
          case "error":
            next.set(cellIndex, { state: "errored", output: { ...out, error: msg.error } })
            break
          case "done": {
            const finalState: CellState = existing.state === "errored" ? "errored" : "completed"
            next.set(cellIndex, { state: finalState, output: existing.output ?? { stdout: "", stderr: "", plots: [] } })
            // Resolve the next item in the queue if any
            const head = runQueueRef.current.shift()
            head?.resolve()
            break
          }
        }
        return next
      })
    }
    workerRef.current = worker
    return worker
  }, [])

  // Tear down the worker on unmount
  useEffect(() => () => {
    workerRef.current?.postMessage({ type: "stop" })
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  const runCell = useCallback(async (cellIndex: number) => {
    const cell = cells.find((c) => c.index === cellIndex)
    if (!cell) return
    setRunStates((prev) => new Map(prev).set(cellIndex, { state: "running", output: { stdout: "", stderr: "", plots: [] } }))
    const worker = ensureWorker()
    await new Promise<void>((resolve) => {
      runQueueRef.current.push({ cellIndex, resolve })
      worker.postMessage({ type: "runCell", cellIndex, code: cell.code })
    })
  }, [cells, ensureWorker])

  const runAll = useCallback(async () => {
    for (const cell of cells) {
      await runCell(cell.index)
      const state = runStates.get(cell.index)?.state
      if (state === "errored") break
    }
  }, [cells, runCell, runStates])

  const restartKernel = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" })
    workerRef.current?.terminate()
    workerRef.current = null
    setWorkerReady(false)
    setRunStates(new Map(cells.map((c) => [c.index, { state: "idle" as const, output: null }])))
  }, [cells])

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="flex items-center justify-between mb-3 sticky top-0 bg-background z-10 py-2 border-b">
        <button
          type="button"
          onClick={runAll}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Play className="h-3 w-3" /> Run All
        </button>
        <button
          type="button"
          onClick={restartKernel}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-muted hover:bg-muted/80"
        >
          <RotateCw className="h-3 w-3" /> Restart Kernel
        </button>
      </div>
      {cells.map((cell) => {
        const rs = runStates.get(cell.index) ?? { state: "idle" as const, output: null }
        return (
          <PythonCell
            key={cell.index}
            cell={cell}
            state={rs.state}
            output={rs.output}
            onRun={() => runCell(cell.index)}
          />
        )
      })}
      {!workerReady && cells.length > 0 && (
        <p className="text-xs text-muted-foreground italic">Pyodide loads on first run; the first cell may take 5–10 s.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manual smoke test**

```bash
bun run dev
```

Manual steps:
1. Open an existing single-script `application/python` artifact. It renders as a single cell (backwards compat).
2. Edit the artifact, add `# %%` between two statements. Save → renderer now shows two cells.
3. Click "Run" on cell 1 (`x = 5`). Output area appears (empty stdout but no error).
4. Click "Run" on cell 2 (`print(x)`). Output area shows `5`. State persisted.
5. Click "Restart Kernel". Cell outputs clear, worker terminates.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx
git commit -m "feat(python-renderer): cell stack with shared Pyodide worker + Run All / Restart Kernel"
```

---

## Task 6: Prompt update + capabilities doc

**Files:**
- Modify: `src/lib/prompts/artifacts/python.ts`
- Modify: `docs/artifact-plans/artifacts-capabilities.md`

- [ ] **Step 1: Add cell-delimiter guidance to the python prompt**

In `src/lib/prompts/artifacts/python.ts`, after the existing "Output Format" section:

```text
### Multi-cell scripts

Long scripts can be split into cells using the standard `# %%` delimiter at
the start of a line. Each cell can be run independently, and state persists
across cells (variables defined in cell 1 are available in cell 2). An
optional title after the marker surfaces in the UI:

\`\`\`python
# %% Setup
import numpy as np

# %% Compute
x = np.linspace(0, 10, 100)
y = np.sin(x)

# %% Plot
import matplotlib.pyplot as plt
plt.plot(x, y)
plt.show()
\`\`\`

Use cells to break up long workflows into runnable steps. The user can
iterate on a cell without re-running the entire script. If you need only
one block of code, no delimiter is necessary — single-cell scripts work
exactly as before.
```

- [ ] **Step 2: Update the capabilities doc §11**

In `docs/artifact-plans/artifacts-capabilities.md`, replace the §11 (`application/python`) "Renderer." paragraph:

```markdown
**Renderer.** `python-renderer.tsx` runs the script in Pyodide v0.27.6
inside a Web Worker. Content is split on the `# %%` delimiter into a
notebook-style stack of cells. Each cell has its own Run button and
output area; "Run All" walks the cells in order, stopping on the first
error. State persists across cells (variables from cell 1 are visible in
cell 2). "Restart Kernel" terminates the worker and clears all outputs.
Single-cell scripts (no `# %%`) keep the original single-Run UX.
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts/artifacts/python.ts docs/artifact-plans/artifacts-capabilities.md
git commit -m "docs(python): document multi-cell # %% delimiter convention"
```

---

## Task 7: Final regression sweep

- [ ] **Step 1: Run the full python + validator + artifact suite**

```bash
bun run test tests/unit/python-notebook/ tests/unit/tools/validate-artifact.test.ts tests/unit/tools/update-artifact.test.ts
```

Expected: ALL green.

- [ ] **Step 2: Run `tsc` project-wide and filter to changed files**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(python-notebook|python-renderer|python-cell|python-worker|prompts/artifacts/python)" | head
```

Expected: empty.

- [ ] **Step 3: Manual smoke test of legacy single-script artifact**

```bash
bun run dev
```

Manual steps:
1. Open an existing python artifact authored before this feature shipped (no `# %%`). Verify it renders as exactly one cell with the same Run UX as today.
2. Run it. stdout / plt.show outputs surface as before.

- [ ] **Step 4: Final commit summarising the feature**

```bash
git log --oneline -10  # review commit history
```

Expected: ~7 atomic commits, one per task.

---

## Self-Review

**Spec coverage:**
- ✅ `# %%` delimiter parser (Task 1)
- ✅ Optional cell title (Task 1)
- ✅ Single Pyodide worker shared across cells, state persists (Task 3 + 5)
- ✅ Per-cell Run button (Task 4 + 5)
- ✅ Run All button stopping on first error (Task 5)
- ✅ Restart Kernel button (Task 5)
- ✅ Per-cell stdout / stderr / plot / error / result rendering (Task 4 + 5)
- ✅ Validator scans across cells (Task 2)
- ✅ Backwards compat — no-delimiter content renders as one cell (Task 1 falls through to default)
- ✅ Out-of-scope items (markdown cells, drag-drop, output caching, kernel inspector) explicitly deferred

**Placeholder scan:** every step has actual code or a concrete command. No "TBD" / "TODO" / "fill in details".

**Type consistency:**
- `Cell`, `CellOutput`, `CellState` defined in Task 1 (`types.ts`), reused across Task 4 (`PythonCell`) and Task 5 (`PythonRenderer`)
- `PYTHON_WORKER_SOURCE` exported in Task 3, consumed in Task 5
- `parseCells` exported in Task 1, consumed in Task 5
- Worker message protocol (`runCell`, `stop`, `ready`, `stdout`, `stderr`, `plot`, `result`, `error`, `done`) consistent between Task 3 (worker side) and Task 5 (host side)

**Risk acknowledgement:**
- The renderer is now substantially more complex than the single-script version; if the worker dies (Pyodide crash) the cells go stale. Restart Kernel is the recovery path.
- Run All sequencing relies on `runQueueRef` resolving in order; this works because the worker only advances to the next cell after posting `done`. If two `Run` clicks land before the queue drains, they queue serially.
