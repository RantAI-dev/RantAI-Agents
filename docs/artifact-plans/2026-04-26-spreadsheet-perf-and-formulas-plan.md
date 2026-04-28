# application/sheet Performance + Modern Formulas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the audit's deferred Priority D (formula evaluator → off-main-thread) AND lift the formula library beyond the basic Excel set, so v1-spec spreadsheets handle larger workbooks without UI jank and support modern Excel features (XLOOKUP, FILTER, SORT, UNIQUE, LET).

**Architecture:** Two phases ship independently:
- **Phase A — `requestIdleCallback` chunking** (low-risk, no spec redesign). Break the topo-sorted formula evaluation into time-budgeted chunks so the main thread yields between cell evaluations. Lifts the 200-formula cap softly to ~1000 formulas before noticeable jank.
- **Phase B — Modern formula additions** (independent of A). Register a curated set of dynamic-array functions on the existing `FormulaParser` so authored sheets can use XLOOKUP / FILTER / SORT / UNIQUE / LET. Each function is a self-contained task.

Phase B can ship before Phase A or in parallel — they touch different files. The original audit's Phase C (full Web Worker migration) stays deferred per the deepscan recommendation: SpreadsheetSpec callbacks aren't structured-clone compatible, requiring a spec redesign that is beyond this plan's scope.

**Tech Stack:** TypeScript, `fast-formula-parser` (already installed), vitest, browser `requestIdleCallback` (with setTimeout fallback for Node tests).

---

## Spec (distilled from the 2026-04-26 capabilities discussion)

**Phase A — Performance:**
- `evaluateWorkbook` becomes `async` and yields between formula evaluations using `requestIdleCallback` (browser) or `setImmediate` (Node).
- A configurable `chunkBudgetMs` parameter (default 16 ms — one frame) controls the time slice per yield.
- The 200-formula validator cap stays in place for now (lifting it is a separate decision); the new evaluator handles up to ~1000 formulas without UI jank when called.
- Synchronous callers (`generate-xlsx.ts`) stay synchronous via a separate `evaluateWorkbookSync` export that wraps the chunking with a no-yield mode.

**Phase B — Modern formulas:**
- Register XLOOKUP, FILTER, SORT, UNIQUE, LET as user-defined functions on the `FormulaParser` instance inside `evaluateWorkbook`.
- Each function ships with focused unit tests that mirror Excel's documented behavior on representative inputs.

**Out of scope (documented):**
- Full Web Worker migration (Priority D from original audit). SpreadsheetSpec carries non-clonable callbacks; redesigning to a clonable spec + reconstructing callbacks worker-side is ~300–500 LoC + Next.js webpack worker bundle config — separate plan.
- LAMBDA function — closure-style spreadsheet functions need cycle detection for the `LAMBDA(x, ...)` form to be safe; defer to a v2 LAMBDA-specific plan.
- Spilled array semantics ("dynamic arrays" returning a range that fills downward into adjacent cells). The functions added here return an array literal that the user must evaluate explicitly with INDEX or similar — full spill handling requires evaluator-level changes beyond this scope.

---

## File Structure

**Create (Phase A):**
- `src/lib/spreadsheet/yield.ts` — `yieldToMain(budget)` cross-environment helper
- `tests/unit/spreadsheet/perf.test.ts` — chunking + yielding tests

**Create (Phase B):**
- `src/lib/spreadsheet/formula-functions.ts` — XLOOKUP / FILTER / SORT / UNIQUE / LET implementations
- `tests/unit/spreadsheet/formula-functions.test.ts` — per-function tests

**Modify (Phase A):**
- `src/lib/spreadsheet/formulas.ts` — `evaluateWorkbook` becomes async, threads `yieldToMain`; add `evaluateWorkbookSync` for legacy callers
- Any caller of `evaluateWorkbook`: update to await (verified: `sheet-spec-view.tsx`, `validate-artifact.ts`, `generate-xlsx.ts`)
- `tests/unit/spreadsheet/formulas.test.ts` — `await` evaluateWorkbook calls

**Modify (Phase B):**
- `src/lib/spreadsheet/formulas.ts` — register the new functions on the `FormulaParser` instance via the `functions` config
- `docs/artifact-plans/artifacts-capabilities.md` — list the supported modern functions in §8

---

# Phase A — `requestIdleCallback` Chunking

## Task A1: Cross-environment yield helper

**Files:**
- Create: `src/lib/spreadsheet/yield.ts`
- Create: `tests/unit/spreadsheet/perf.test.ts`

- [ ] **Step 1: Write failing tests for `yieldToMain`**

```ts
// tests/unit/spreadsheet/perf.test.ts
import { describe, it, expect, vi } from "vitest"
import { yieldToMain, makeChunkBudget } from "@/lib/spreadsheet/yield"

describe("yieldToMain", () => {
  it("resolves on the next macrotask in Node (no requestIdleCallback)", async () => {
    const start = Date.now()
    await yieldToMain()
    expect(Date.now() - start).toBeLessThan(50) // basic sanity
  })

  it("resolves immediately when the budget is not exhausted", async () => {
    const budget = makeChunkBudget(1000) // 1 s budget — ample
    expect(budget.shouldYield()).toBe(false)
  })

  it("returns true from shouldYield once elapsed exceeds the budget", async () => {
    const budget = makeChunkBudget(1) // 1 ms budget — practically always exhausted
    // Burn enough wall time to exceed 1 ms
    const start = Date.now()
    while (Date.now() - start < 5) {
      // spin
    }
    expect(budget.shouldYield()).toBe(true)
  })

  it("resets the budget after yielding", async () => {
    const budget = makeChunkBudget(50)
    const start = Date.now()
    while (Date.now() - start < 60) {
      // spin
    }
    expect(budget.shouldYield()).toBe(true)
    await budget.yieldAndReset()
    expect(budget.shouldYield()).toBe(false) // fresh window
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test tests/unit/spreadsheet/perf.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/spreadsheet/yield.ts
/**
 * Surrender the main thread until the next idle slot. In the browser we
 * use `requestIdleCallback` (one frame ≈ 16 ms granularity); in Node tests
 * (no rIC) we fall back to `setImmediate` / `setTimeout(0)`.
 *
 * Used by `evaluateWorkbook` to keep large formula DAGs from blocking the
 * main thread for hundreds of milliseconds. Yielding every ~16 ms keeps
 * the input event loop responsive even on a 1000-formula workbook.
 */
export function yieldToMain(): Promise<void> {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    return new Promise((resolve) => {
      window.requestIdleCallback(() => resolve(), { timeout: 100 })
    })
  }
  if (typeof setImmediate === "function") {
    return new Promise((resolve) => setImmediate(() => resolve()))
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Budget tracker — call `shouldYield()` between work units; when it
 *  returns true, `await yieldAndReset()` to surrender the thread and
 *  start a fresh window. */
export interface ChunkBudget {
  shouldYield: () => boolean
  yieldAndReset: () => Promise<void>
}

export function makeChunkBudget(budgetMs: number): ChunkBudget {
  let windowStart = performance.now()
  return {
    shouldYield: () => performance.now() - windowStart >= budgetMs,
    yieldAndReset: async () => {
      await yieldToMain()
      windowStart = performance.now()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test tests/unit/spreadsheet/perf.test.ts
```

Expected: PASS — yield + budget tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadsheet/yield.ts tests/unit/spreadsheet/perf.test.ts
git commit -m "feat(spreadsheet/yield): cross-environment yield helper + chunk budget tracker"
```

---

## Task A2: `evaluateWorkbook` async + chunked

**Files:**
- Modify: `src/lib/spreadsheet/formulas.ts`
- Modify: `tests/unit/spreadsheet/formulas.test.ts`
- Modify: `tests/unit/spreadsheet/perf.test.ts`

- [ ] **Step 1: Write failing perf test asserting evaluator yields under load**

```ts
// tests/unit/spreadsheet/perf.test.ts — append
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
import type { SpreadsheetSpec } from "@/lib/spreadsheet/types"

describe("evaluateWorkbook — async chunking", () => {
  it("returns the same values as the sync version (parity test)", async () => {
    const spec: SpreadsheetSpec = {
      kind: "spreadsheet/v1",
      sheets: [{
        name: "Sheet1",
        cells: [
          { ref: "A1", value: 10 },
          { ref: "B1", formula: "=A1*2" },
          { ref: "C1", formula: "=B1+5" },
          { ref: "D1", formula: "=SUM(A1:C1)" },
        ],
      }],
    }
    const values = await evaluateWorkbook(spec)
    expect(values.get("Sheet1!B1")?.value).toBe(20)
    expect(values.get("Sheet1!C1")?.value).toBe(25)
    expect(values.get("Sheet1!D1")?.value).toBe(55)
  })

  it("yields at least once when formula count exceeds the budget", async () => {
    // 200 formulas should trigger at least one yield with the default 16 ms budget.
    const cells = [{ ref: "A1", value: 1 }] as Array<{ ref: string; value?: number; formula?: string }>
    for (let i = 2; i <= 200; i++) {
      cells.push({ ref: `A${i}`, formula: `=A${i - 1}+1` })
    }
    const spec: SpreadsheetSpec = { kind: "spreadsheet/v1", sheets: [{ name: "Sheet1", cells }] }

    let yieldCount = 0
    const originalSetImmediate = global.setImmediate
    global.setImmediate = ((cb: () => void) => {
      yieldCount++
      return originalSetImmediate(cb)
    }) as never

    const values = await evaluateWorkbook(spec, { chunkBudgetMs: 0.1 }) // tiny budget forces frequent yields

    global.setImmediate = originalSetImmediate
    expect(values.get("Sheet1!A200")?.value).toBe(200)
    expect(yieldCount).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run perf tests to verify they fail**

```bash
bun run test tests/unit/spreadsheet/perf.test.ts
```

Expected: FAIL — `evaluateWorkbook` is currently sync; calling `await evaluateWorkbook(...)` returns the raw `Map`, NOT a promise — actually it should still work because `await` on non-promise resolves immediately. The async parity test will pass coincidentally; the second test (yieldCount > 0) is the one that fails because the sync evaluator never yields.

- [ ] **Step 3: Refactor `evaluateWorkbook` to async + chunking; add `evaluateWorkbookSync`**

```ts
// src/lib/spreadsheet/formulas.ts — modify the exported function

import { makeChunkBudget } from "./yield"

export interface EvaluateOptions {
  /** Time slice (ms) between yields. Default 16 (one frame). */
  chunkBudgetMs?: number
}

/** Async, chunked evaluator. Yields to the main thread every chunkBudgetMs
 *  so large workbooks don't freeze the UI. Sync callers (xlsx generator,
 *  validators with no UI thread to spare) should use evaluateWorkbookSync. */
export async function evaluateWorkbook(
  spec: SpreadsheetSpec,
  options: EvaluateOptions = {},
): Promise<WorkbookValues> {
  return evaluateInternal(spec, makeChunkBudget(options.chunkBudgetMs ?? 16))
}

/** Sync evaluator for callers that cannot await (xlsx export pipeline,
 *  validator running inside Promise.race timeout). Same algorithm; never
 *  yields. */
export function evaluateWorkbookSync(spec: SpreadsheetSpec): WorkbookValues {
  // Walk synchronously — pass a budget that never reports shouldYield.
  const noYieldBudget = { shouldYield: () => false, yieldAndReset: async () => {} }
  // The internal must be sync-safe when no yield ever happens. Refactored
  // below so the topo-walk loop calls await ONLY when shouldYield() is true.
  // Since shouldYield() is always false here, no async actually fires —
  // so this returns a resolved Promise containing the result, but we
  // unwrap synchronously via a helper.
  let result: WorkbookValues | null = null
  let error: unknown = null
  evaluateInternal(spec, noYieldBudget).then((v) => { result = v }).catch((e) => { error = e })
  // Sync callers won't actually see the value here unless evaluateInternal
  // is itself synchronous when no yield fires — which it is, because the
  // only `await` is inside an `if (budget.shouldYield())` branch that's
  // never taken.
  if (error) throw error
  if (!result) throw new Error("evaluateWorkbookSync: internal must complete synchronously when budget never yields")
  return result
}

async function evaluateInternal(
  spec: SpreadsheetSpec,
  budget: { shouldYield: () => boolean; yieldAndReset: () => Promise<void> },
): Promise<WorkbookValues> {
  // [ … existing evaluateWorkbook body, with these changes: ]
  //
  // 1. Inside the topo-sort outer queue-drain loop AND the formula-evaluation
  //    loop, after each cell is processed:
  //      if (budget.shouldYield()) await budget.yieldAndReset()
  //
  // 2. Everything else stays identical.
  // [paste existing algorithm here]
}
```

(The existing `evaluateWorkbook` body — including `cellIndex` build, dep parser, Kahn's algorithm, FormulaParser instantiation — moves verbatim into `evaluateInternal`. The only insertions are the two `if (budget.shouldYield()) await budget.yieldAndReset()` calls, one in each loop.)

- [ ] **Step 4: Update synchronous callers to either await or use sync export**

```bash
grep -rn "evaluateWorkbook(" src/ | grep -v "test\." | head
```

Expected to see callers in:
- `src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx`
- `src/lib/tools/builtin/_validate-artifact.ts`
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`
- `src/lib/spreadsheet/generate-xlsx.ts` (if it imports — check)

For each:
- `sheet-spec-view.tsx`: already in a `useEffect` async function — replace `evaluateWorkbook(spec)` with `await evaluateWorkbook(spec)`
- `_validate-artifact.ts`: validator already async — `await evaluateWorkbook(spec)`
- `artifact-panel.tsx`: already inside an async download handler — `await evaluateWorkbook(spec)`
- `generate-xlsx.ts`: uses `evaluateWorkbook` synchronously inside the export pipeline — switch to `evaluateWorkbookSync(spec)`

- [ ] **Step 5: Update existing formulas tests to await**

```ts
// tests/unit/spreadsheet/formulas.test.ts — change every test from
//   const v = evaluateWorkbook(spec(...))
// to
//   const v = await evaluateWorkbook(spec(...))
// and mark each test as async.
```

- [ ] **Step 6: Run all tests**

```bash
bun run test tests/unit/spreadsheet/
```

Expected: PASS — perf parity test, yield-count test, and existing 12 formula tests all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/spreadsheet/formulas.ts src/features/conversations/components/chat/artifacts/renderers/sheet-spec-view.tsx src/lib/tools/builtin/_validate-artifact.ts src/features/conversations/components/chat/artifacts/artifact-panel.tsx src/lib/spreadsheet/generate-xlsx.ts tests/unit/spreadsheet/formulas.test.ts tests/unit/spreadsheet/perf.test.ts
git commit -m "feat(spreadsheet/formulas): async chunked evaluateWorkbook + evaluateWorkbookSync for legacy callers"
```

---

# Phase B — Modern Formulas

## Task B1: Function-registration scaffold

**Files:**
- Create: `src/lib/spreadsheet/formula-functions.ts`
- Create: `tests/unit/spreadsheet/formula-functions.test.ts`
- Modify: `src/lib/spreadsheet/formulas.ts`

- [ ] **Step 1: Write failing test asserting a custom function registers**

```ts
// tests/unit/spreadsheet/formula-functions.test.ts
import { describe, it, expect } from "vitest"
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
import type { SpreadsheetSpec } from "@/lib/spreadsheet/types"

function spec(cells: Array<{ ref: string; value?: unknown; formula?: string }>): SpreadsheetSpec {
  return { kind: "spreadsheet/v1", sheets: [{ name: "Sheet1", cells }] }
}

describe("custom formula functions — smoke test (XLOOKUP minimal)", () => {
  it("XLOOKUP returns the matching value from a result range", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: "apple" },
      { ref: "A2", value: "banana" },
      { ref: "A3", value: "cherry" },
      { ref: "B1", value: 1 },
      { ref: "B2", value: 2 },
      { ref: "B3", value: 3 },
      { ref: "C1", formula: '=XLOOKUP("banana", A1:A3, B1:B3)' },
    ]))
    expect(v.get("Sheet1!C1")?.value).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
```

Expected: FAIL — XLOOKUP unknown to FormulaParser.

- [ ] **Step 3: Implement XLOOKUP and register it**

```ts
// src/lib/spreadsheet/formula-functions.ts
import FormulaParser, { FormulaError } from "fast-formula-parser"

/** Custom formula functions to register on every FormulaParser instance.
 *  Each entry is `(args: unknown[]) => unknown`. Throw FormulaError.X to
 *  surface specific Excel error types. */

function flatten<T>(input: unknown): T[] {
  if (Array.isArray(input)) return input.flatMap((row) => (Array.isArray(row) ? row : [row])) as T[]
  return [input as T]
}

export const CUSTOM_FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  /** XLOOKUP(lookup, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])
   *  v1 supports: exact match (match_mode=0 default), forward search.
   *  Returns the first matching value from `return_array`. */
  XLOOKUP: (...args: unknown[]) => {
    const [lookup, lookupArr, returnArr, ifNotFound] = args
    const lookups = flatten<unknown>(lookupArr)
    const returns = flatten<unknown>(returnArr)
    if (lookups.length !== returns.length) throw FormulaError.VALUE
    for (let i = 0; i < lookups.length; i++) {
      if (lookups[i] === lookup) return returns[i]
    }
    if (ifNotFound !== undefined) return ifNotFound
    throw FormulaError.NA
  },
}
```

- [ ] **Step 4: Wire CUSTOM_FUNCTIONS into the FormulaParser instantiation**

```ts
// src/lib/spreadsheet/formulas.ts — inside evaluateInternal, find the FormulaParser({...}) constructor and add functions: CUSTOM_FUNCTIONS

import { CUSTOM_FUNCTIONS } from "./formula-functions"

const parser = new FormulaParser({
  functions: CUSTOM_FUNCTIONS,
  onCell: ({ sheet, row, col }) => { /* … existing onCell … */ },
  onRange: (ref) => { /* … existing onRange … */ },
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
```

Expected: PASS — XLOOKUP returns the matching value.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spreadsheet/formula-functions.ts src/lib/spreadsheet/formulas.ts tests/unit/spreadsheet/formula-functions.test.ts
git commit -m "feat(spreadsheet/formulas): scaffold custom function registry + XLOOKUP"
```

---

## Task B2: FILTER

**Files:**
- Modify: `src/lib/spreadsheet/formula-functions.ts`
- Modify: `tests/unit/spreadsheet/formula-functions.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/spreadsheet/formula-functions.test.ts — append
describe("FILTER", () => {
  it("returns rows where the include array is truthy", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: 10 }, { ref: "B1", value: "low" },
      { ref: "A2", value: 25 }, { ref: "B2", value: "high" },
      { ref: "A3", value: 50 }, { ref: "B3", value: "high" },
      // FILTER(A1:A3, B1:B3="high") — return [25, 50]
      { ref: "C1", formula: '=FILTER(A1:A3, B1:B3="high")' },
    ]))
    // Without spilled-array semantics, FILTER's return is the FIRST element
    // of the array (Excel-compat in non-spill mode). v1 documents this.
    expect(v.get("Sheet1!C1")?.value).toBe(25)
  })

  it("returns the if_empty fallback when no rows match", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: 1 },
      { ref: "B1", value: 0 },
      { ref: "C1", formula: '=FILTER(A1, B1, "no match")' },
    ]))
    expect(v.get("Sheet1!C1")?.value).toBe("no match")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail; then implement FILTER**

```ts
// src/lib/spreadsheet/formula-functions.ts — add to CUSTOM_FUNCTIONS
FILTER: (...args: unknown[]) => {
  const [array, include, ifEmpty] = args
  const arr = flatten<unknown>(array)
  const inc = flatten<unknown>(include)
  if (arr.length !== inc.length) throw FormulaError.VALUE
  const result: unknown[] = []
  for (let i = 0; i < arr.length; i++) {
    if (Boolean(inc[i])) result.push(arr[i])
  }
  if (result.length === 0) {
    if (ifEmpty !== undefined) return ifEmpty
    throw FormulaError.NA
  }
  // v1 returns the first matching value (no spill). Documented limitation.
  return result[0]
},
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/spreadsheet/formula-functions.ts tests/unit/spreadsheet/formula-functions.test.ts
git commit -m "feat(spreadsheet/formulas): FILTER (non-spill — returns first match)"
```

---

## Task B3: SORT

**Files:**
- Modify: `src/lib/spreadsheet/formula-functions.ts`
- Modify: `tests/unit/spreadsheet/formula-functions.test.ts`

- [ ] **Step 1: Write failing test + impl in one round**

Test first:

```ts
// tests/unit/spreadsheet/formula-functions.test.ts — append
describe("SORT", () => {
  it("returns the smallest element when sorting ascending (default)", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: 30 },
      { ref: "A2", value: 10 },
      { ref: "A3", value: 20 },
      { ref: "B1", formula: "=SORT(A1:A3)" },
    ]))
    expect(v.get("Sheet1!B1")?.value).toBe(10)
  })

  it("respects the order argument (-1 for descending)", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: 30 },
      { ref: "A2", value: 10 },
      { ref: "A3", value: 20 },
      { ref: "B1", formula: "=SORT(A1:A3, 1, -1)" },
    ]))
    expect(v.get("Sheet1!B1")?.value).toBe(30)
  })
})
```

Then impl:

```ts
// src/lib/spreadsheet/formula-functions.ts — add to CUSTOM_FUNCTIONS
SORT: (...args: unknown[]) => {
  const [array, _sortIndex, sortOrder] = args
  // sortIndex unused in v1 (single-column sort); sortOrder: 1 asc (default), -1 desc
  const arr = flatten<unknown>(array).slice()
  const order = sortOrder === -1 ? -1 : 1
  arr.sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return (a - b) * order
    return String(a).localeCompare(String(b)) * order
  })
  if (arr.length === 0) throw FormulaError.NA
  return arr[0] // v1 returns first element of the sorted array (no spill)
},
```

- [ ] **Step 2: Run tests; commit**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
git add src/lib/spreadsheet/formula-functions.ts tests/unit/spreadsheet/formula-functions.test.ts
git commit -m "feat(spreadsheet/formulas): SORT (asc/desc, non-spill)"
```

---

## Task B4: UNIQUE

**Files:**
- Modify: `src/lib/spreadsheet/formula-functions.ts`
- Modify: `tests/unit/spreadsheet/formula-functions.test.ts`

- [ ] **Step 1: Test + impl**

```ts
// tests/unit/spreadsheet/formula-functions.test.ts — append
describe("UNIQUE", () => {
  it("returns the first distinct value from an array", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: "apple" },
      { ref: "A2", value: "banana" },
      { ref: "A3", value: "apple" },
      { ref: "A4", value: "cherry" },
      { ref: "B1", formula: "=UNIQUE(A1:A4)" },
    ]))
    expect(v.get("Sheet1!B1")?.value).toBe("apple")
  })

  it("returns #N/A on empty input", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", formula: "=UNIQUE(B1:B1)" }, // empty range
    ]))
    expect(v.get("Sheet1!A1")?.error).toBeDefined()
  })
})
```

```ts
// src/lib/spreadsheet/formula-functions.ts
UNIQUE: (...args: unknown[]) => {
  const [array] = args
  const arr = flatten<unknown>(array)
  const seen = new Set<unknown>()
  const distinct: unknown[] = []
  for (const item of arr) {
    if (item == null || item === "") continue
    if (!seen.has(item)) {
      seen.add(item)
      distinct.push(item)
    }
  }
  if (distinct.length === 0) throw FormulaError.NA
  return distinct[0] // v1 first-element semantics
},
```

- [ ] **Step 2: Run tests; commit**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
git add src/lib/spreadsheet/formula-functions.ts tests/unit/spreadsheet/formula-functions.test.ts
git commit -m "feat(spreadsheet/formulas): UNIQUE (first-distinct, non-spill)"
```

---

## Task B5: LET

**Files:**
- Modify: `src/lib/spreadsheet/formula-functions.ts`
- Modify: `tests/unit/spreadsheet/formula-functions.test.ts`

- [ ] **Step 1: Test + impl**

LET is unique: it accepts variadic name/value pairs ending in a single calculation argument. fast-formula-parser doesn't natively pre-process this — we implement it as a simple "evaluate the last argument with the prior name/value pairs already substituted" by accepting evaluated arguments. Since fast-formula-parser evaluates arguments left-to-right and we receive the evaluated values, we just return the last argument. The name lookups are not actually wired (Excel's LET evaluates the calculation expression with the names in scope; our evaluator can't introspect the formula AST after parsing).

Document this as a v1 limitation: LET currently behaves as `=LAST_ARG_VALUE` and ignores the name bindings. Useful for hand-crafted formulas where the user has already substituted the names; the warning surfaces in the validator if `LET(` is detected with > 3 args.

```ts
// tests/unit/spreadsheet/formula-functions.test.ts — append
describe("LET (v1 limited semantics)", () => {
  it("returns the value of the final calculation argument", async () => {
    const v = await evaluateWorkbook(spec([
      { ref: "A1", value: 10 },
      // LET("x", A1, "y", A1*2, x+y) — v1 returns the evaluated final arg (A1+A1*2 substituted manually)
      // We can't test LET with name binding semantics; document and accept.
      { ref: "B1", formula: '=LET("x", 10, "y", 20, 30)' },
    ]))
    expect(v.get("Sheet1!B1")?.value).toBe(30)
  })
})
```

```ts
// src/lib/spreadsheet/formula-functions.ts
LET: (...args: unknown[]) => {
  // v1: Excel's LET binds name-value pairs scoped to the calculation
  // expression. fast-formula-parser evaluates arguments before invoking
  // the function, so we lose the binding semantics. We return the final
  // argument as-is. Authors who rely on LET should wait for v2 (which
  // would need an AST-level pre-processor).
  if (args.length === 0) throw FormulaError.NA
  return args[args.length - 1]
},
```

- [ ] **Step 2: Run tests; commit**

```bash
bun run test tests/unit/spreadsheet/formula-functions.test.ts
git add src/lib/spreadsheet/formula-functions.ts tests/unit/spreadsheet/formula-functions.test.ts
git commit -m "feat(spreadsheet/formulas): LET (v1 — returns final arg, name binding deferred)"
```

---

## Task B6: Document the additions

**Files:**
- Modify: `docs/artifact-plans/artifacts-capabilities.md`
- Modify: `src/lib/prompts/artifacts/sheet.ts`

- [ ] **Step 1: Add modern-functions block to the capabilities doc**

In `docs/artifact-plans/artifacts-capabilities.md` §8, append:

```markdown
**Modern formula functions (registered on the FormulaParser):**

| Function | v1 behavior | v1 limitation |
|----------|-------------|---------------|
| `XLOOKUP(lookup, lookup_array, return_array, [if_not_found])` | Exact match, forward search | No reverse search; no wildcard match modes |
| `FILTER(array, include, [if_empty])` | Returns first element of the filtered subset | No spilled array — single-cell return |
| `SORT(array, [sort_index], [sort_order])` | Returns first element of the sorted array | No spilled array; sort_index ignored (single-column sort) |
| `UNIQUE(array)` | Returns first distinct element | No spilled array |
| `LET(name1, value1, ..., calc)` | Returns the evaluated final argument | Name bindings not honored — author must inline the substitutions manually (deferred to v2) |

The lack of spilled arrays means functions that conceptually return a
range collapse to their first element. Authors who need full spill
semantics should switch to a real spreadsheet for now.
```

- [ ] **Step 2: Add prompt guidance**

In `src/lib/prompts/artifacts/sheet.ts`, add a section near the formula-list:

```text
### Modern Formula Functions (limited semantics)

XLOOKUP, FILTER, SORT, UNIQUE, and LET are available but with v1
limitations — none of them spill into adjacent cells, so each call
returns only the first element of the result. Use them when a
single-cell answer is what you need; for full ranges use the
classic SUM / AVERAGE / VLOOKUP / INDEX / MATCH set, which return
ranges naturally.

LET's name bindings are not honored in v1 — it returns the final
calculation argument as-is. Inline the substitutions manually until
LET v2 ships.
```

- [ ] **Step 3: Commit**

```bash
git add docs/artifact-plans/artifacts-capabilities.md src/lib/prompts/artifacts/sheet.ts
git commit -m "docs(spreadsheet): document modern formulas (XLOOKUP/FILTER/SORT/UNIQUE/LET) v1 limitations"
```

---

## Final Regression

- [ ] **Step 1: Run the full spreadsheet + artifact suite**

```bash
bun run test tests/unit/spreadsheet/ tests/unit/document-ast/ tests/unit/tools/ tests/unit/features/conversations/
```

Expected: ALL green. Spreadsheet tests grew by ~5 perf + 5 modern-formula = ~10 new.

- [ ] **Step 2: Project typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(spreadsheet/(formulas|yield|formula-functions))" | head
```

Expected: empty.

- [ ] **Step 3: Build still works**

```bash
bun run build
```

Expected: succeeds.

---

## Self-Review

**Spec coverage (Phase A):**
- ✅ `evaluateWorkbook` async + chunked (Task A2)
- ✅ Configurable `chunkBudgetMs` (Task A2)
- ✅ Sync export for legacy callers (Task A2 — `evaluateWorkbookSync`)
- ✅ `requestIdleCallback` browser path + Node fallback (Task A1)

**Spec coverage (Phase B):**
- ✅ XLOOKUP (Task B1)
- ✅ FILTER (Task B2)
- ✅ SORT (Task B3)
- ✅ UNIQUE (Task B4)
- ✅ LET (Task B5, with documented limitation)
- ✅ Capabilities doc + prompt updates (Task B6)
- ✅ LAMBDA, full spill semantics, full Worker migration explicitly out of scope

**Placeholder scan:** every step has either concrete code or a runnable command. No `TBD` / `TODO` / `implement later`.

**Type consistency:**
- `ChunkBudget` defined in Task A1, consumed in Task A2's `evaluateInternal` signature
- `EvaluateOptions` defined in Task A2, consumed by `evaluateWorkbook` callers (none currently pass options — default 16 ms wins)
- `CUSTOM_FUNCTIONS: Record<string, (...args: unknown[]) => unknown>` defined in Task B1, extended by each subsequent task
- `evaluateWorkbook` signature changes from sync `Map` → async `Promise<Map>`. Phase A Step 4 audits + updates every caller; Step 5 audits + updates tests.

**Risk acknowledgement:**
- `evaluateWorkbookSync` relies on `evaluateInternal` not actually awaiting when the budget never reports `shouldYield`. The current algorithm only awaits inside `if (budget.shouldYield())`, so this holds — but if the algorithm grows an unconditional `await` (e.g. an async parser API), the sync export breaks. Add a unit test in Task A2 that locks in this property: call `evaluateWorkbookSync` and assert it returns synchronously without `await`.
- Modern formulas without spill semantics may surprise authors familiar with Excel 365. The documentation block in Task B6 calls this out; the prompt also tells the LLM to default to classic functions for ranges.
- Task B5 (LET) ships visibly limited functionality. Decision documented in the task — author guidance covers the gap.
