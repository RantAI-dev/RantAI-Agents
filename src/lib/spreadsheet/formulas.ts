import FormulaParser, { DepParser, FormulaError } from "fast-formula-parser"
import type { SpreadsheetSpec, WorkbookValues, CellValue, EvaluatedCell } from "./types"

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

/** Convert an Excel column letter string + row number string to { row, col } (1-based) */
function refToRowCol(ref: string): { row: number; col: number } {
  const clean = ref.replace(/\$/g, "")
  const match = clean.match(/^([A-Z]+)([0-9]+)$/)
  if (!match) throw new Error(`Malformed ref: ${ref}`)
  const letters = match[1]
  const row = parseInt(match[2], 10)
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return { row, col }
}

/** Convert 1-based row/col back to an Excel ref string like "A1" */
function rowColToRef(row: number, col: number): string {
  let letters = ""
  let c = col
  while (c > 0) {
    const rem = (c - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    c = Math.floor((c - 1) / 26)
  }
  return `${letters}${row}`
}

/** Build a qualified ref "SheetName!A1" */
function qualify(sheet: string, ref: string): string {
  return `${sheet}!${ref.replace(/\$/g, "")}`
}

/** Extract the short error code from a FormulaError name like "#REF!" → "REF" */
function errorCode(errorName: string): string {
  return errorName.replace(/^#|[!?]$/g, "")
}

// ────────────────────────────────────────────────────────────
// main export
// ────────────────────────────────────────────────────────────

export function evaluateWorkbook(spec: SpreadsheetSpec): WorkbookValues {
  const values: WorkbookValues = new Map()

  type Cell = {
    sheet: string
    ref: string
    row: number
    col: number
    formula?: string
    value?: CellValue
  }

  // ── 1. Build a complete cell index ──────────────────────────
  const cellIndex = new Map<string, Cell>()
  for (const sheet of spec.sheets) {
    for (const cell of sheet.cells) {
      const cleanRef = cell.ref.replace(/\$/g, "")
      const { row, col } = refToRowCol(cleanRef)
      const key = qualify(sheet.name, cleanRef)
      cellIndex.set(key, {
        sheet: sheet.name,
        ref: cleanRef,
        row,
        col,
        formula: cell.formula,
        value: cell.value ?? null,
      })
    }
  }

  const namedRanges = spec.namedRanges ?? {}

  // Resolve a named range to a qualified cell/range key.
  // Returns the qualified ref string of the target, or null if unknown.
  function resolveNamedRange(name: string, currentSheet: string): string | null {
    const target = namedRanges[name]
    if (!target) return null
    return target.includes("!") ? target.replace(/\$/g, "") : qualify(currentSheet, target)
  }

  // ── 2. Seed literal cells into the values map ────────────────
  for (const [key, cell] of cellIndex) {
    if (cell.formula === undefined) {
      values.set(key, { value: cell.value ?? null })
    }
  }

  // ── 3. Build dependency graph using DepParser ────────────────
  const depParser = new DepParser({
    onVariable: (name: string, sheetName: string) => {
      const qualified = resolveNamedRange(name, sheetName)
      if (!qualified) return null
      // Return a cell ref object { sheet, row, col }
      if (!qualified.includes(":")) {
        const [s, r] = qualified.split("!")
        try {
          const { row, col } = refToRowCol(r)
          return { sheet: s, row, col }
        } catch {
          return null
        }
      }
      return null
    },
  })

  const deps = new Map<string, string[]>()

  for (const [key, cell] of cellIndex) {
    if (cell.formula === undefined) continue
    const formulaBody = cell.formula.startsWith("=") ? cell.formula.slice(1) : cell.formula
    const position = { row: cell.row, col: cell.col, sheet: cell.sheet }
    let parsedDeps: ReturnType<typeof depParser.parse> = []
    try {
      parsedDeps = depParser.parse(formulaBody, position)
    } catch {
      // Parsing error — treat as no deps, will fail during evaluation
    }

    const cellDeps: string[] = []
    for (const dep of parsedDeps) {
      const depSheet = dep.sheet ?? cell.sheet
      if (dep.row != null && dep.col != null && dep.from == null) {
        // Single cell reference
        cellDeps.push(qualify(depSheet, rowColToRef(dep.row, dep.col)))
      } else if (dep.from != null && dep.to != null) {
        // Range reference — expand to individual cells
        for (let r = dep.from.row; r <= dep.to.row; r++) {
          for (let c = dep.from.col; c <= dep.to.col; c++) {
            cellDeps.push(qualify(depSheet, rowColToRef(r, c)))
          }
        }
      }
    }
    deps.set(key, cellDeps)
  }

  // ── 4. Topological sort (Kahn's algorithm) ─────────────────
  //
  // Build an in-degree map and a reverse-edge map so we can pop
  // zero-degree nodes in O(1). Earlier code used a naive scan that
  // re-iterated `remaining` on every outer loop iteration, making it
  // O(n²) in the formula count. At the current 200-formula cap that
  // was ~40k iterations — fine in practice but quadratic if anyone
  // raises the cap. Kahn's runs in O(V + E).
  const order: string[] = []
  const formulaCells = new Set(deps.keys())
  const inDegree = new Map<string, number>()
  const reverseEdges = new Map<string, string[]>()

  for (const key of formulaCells) {
    const myDeps = deps.get(key) ?? []
    // A dep only blocks us if it is also a formula cell still pending —
    // dependencies on literal cells are always already-resolved.
    const formulaDeps = myDeps.filter((d) => formulaCells.has(d) && d !== key)
    inDegree.set(key, formulaDeps.length)
    for (const dep of formulaDeps) {
      const list = reverseEdges.get(dep) ?? []
      list.push(key)
      reverseEdges.set(dep, list)
    }
  }

  const queue: string[] = []
  for (const [key, degree] of inDegree) {
    if (degree === 0) queue.push(key)
  }

  while (queue.length > 0) {
    const key = queue.shift()!
    order.push(key)
    const dependents = reverseEdges.get(key) ?? []
    for (const dependent of dependents) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, remaining)
      if (remaining === 0) queue.push(dependent)
    }
  }

  // Any cell whose in-degree is still > 0 is part of (or downstream of)
  // a cycle. Mark them CIRCULAR so the renderer can flag the affected
  // cells instead of leaving a stale empty value.
  for (const [key, degree] of inDegree) {
    if (degree > 0) {
      values.set(key, { value: null, error: "CIRCULAR" })
    }
  }

  // ── 5. Build the formula evaluator parser ───────────────────
  const parser = new FormulaParser({
    onCell: ({ sheet, row, col }: { sheet: string; row: number; col: number }) => {
      const sheetName = sheet || spec.sheets[0].name
      const ref = rowColToRef(row, col)
      const key = qualify(sheetName, ref)

      // If the cell doesn't exist in the index, throw REF error
      if (!cellIndex.has(key)) {
        throw FormulaError.REF
      }

      const entry = values.get(key)
      if (!entry) return null
      if (entry.error) {
        // Propagate the dependency's actual error type instead of always
        // collapsing to #REF!. A cell that depended on a #VALUE! source
        // used to surface as #REF!, hiding the root cause and confusing
        // users debugging a formula chain. Map our string error codes
        // back to the FormulaParser sentinels (`#NAME?`, `#VALUE!`,
        // `#DIV/0!`, `#NUM!`, `#N/A`, `#NULL!`, `#CIRCULAR!`); fall back
        // to #REF! when the code is unknown or just "REF".
        switch (entry.error) {
          case "NAME":
            throw FormulaError.NAME
          case "VALUE":
            throw FormulaError.VALUE
          case "DIV0":
          case "DIV/0":
            throw FormulaError.DIV0
          case "NUM":
            throw FormulaError.NUM
          case "NA":
          case "N/A":
            throw FormulaError.NA
          case "NULL":
            throw FormulaError.NULL
          case "REF":
          default:
            throw FormulaError.REF
        }
      }
      return entry.value ?? null
    },

    onRange: (ref: {
      sheet?: string
      from: { row: number; col: number }
      to: { row: number; col: number }
    }) => {
      const sheetName = ref.sheet || spec.sheets[0].name
      const out: (CellValue | null)[][] = []
      for (let r = ref.from.row; r <= ref.to.row; r++) {
        const rowVals: (CellValue | null)[] = []
        for (let c = ref.from.col; c <= ref.to.col; c++) {
          const key = qualify(sheetName, rowColToRef(r, c))
          const entry = values.get(key)
          rowVals.push(entry?.value ?? null)
        }
        out.push(rowVals)
      }
      return out
    },

    onVariable: (name: string, sheetName: string) => {
      const qualified = resolveNamedRange(name, sheetName)
      if (!qualified) return null
      // Return cell ref object for single cell named ranges
      if (!qualified.includes(":")) {
        const [s, r] = qualified.split("!")
        try {
          const { row, col } = refToRowCol(r)
          return { sheet: s, row, col }
        } catch {
          return null
        }
      }
      return null
    },
  })

  // ── 6. Evaluate in topological order ────────────────────────
  for (const key of order) {
    const cell = cellIndex.get(key)!
    const formulaBody = cell.formula!.startsWith("=") ? cell.formula!.slice(1) : cell.formula!
    const position = { row: cell.row, col: cell.col, sheet: cell.sheet }

    let result: EvaluatedCell
    try {
      const raw = parser.parse(formulaBody, position)

      // fast-formula-parser returns a FormulaError instance for formula errors (not throws)
      if (raw != null && typeof raw === "object" && "error" in (raw as Record<string, unknown>)) {
        const fe = raw as { error: string }
        result = { value: null, error: errorCode(fe.error) }
      } else {
        result = { value: raw as CellValue }
      }
    } catch (err) {
      // Parser wraps thrown errors in FormulaError.ERROR (#ERROR!) with .details = original error.
      // We need to check details first to get the real error code (e.g. #REF! from onCell throw).
      let errorStr = "#ERROR!"
      if (err != null && typeof err === "object") {
        const fe = err as Record<string, unknown>
        // If there is a details sub-error (the original thrown error), use it
        if (
          fe.details != null &&
          typeof fe.details === "object" &&
          "error" in (fe.details as Record<string, unknown>)
        ) {
          errorStr = String((fe.details as Record<string, unknown>).error)
        } else if ("error" in fe) {
          errorStr = String(fe.error)
        } else if ("message" in fe) {
          errorStr = String(fe.message)
        }
      } else {
        errorStr = String(err)
      }
      const code =
        /#?(REF|NAME|VALUE|DIV\/0|NUM|N\/A)!?/i.exec(errorStr)?.[1]?.toUpperCase() ?? "REF"
      result = { value: null, error: code }
    }

    values.set(key, result)
  }

  return values
}
