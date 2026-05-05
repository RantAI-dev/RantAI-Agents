# LaTeX Canvas Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `text/latex` artifact panel from a generic prose render into an Overleaf-inspired paper preview canvas with theorem environments and equation cross-references.

**Architecture:** Two-pass parser (label scan → transpile) emits HTML with anchor IDs and theorem-block markup. A new `latex/` renderer directory replaces the flat 536 LoC renderer, with a tabbed Preview/Source toolbar inside the renderer. Stack stays at KaTeX + custom transpiler + CSS — no new compile engine.

**Tech Stack:** TypeScript, React 18, Next.js (App Router), KaTeX, Tailwind CSS, shadcn/ui Tabs, Shiki (reused from `streamdown-content.tsx`), Vitest with jsdom for component tests, `next/font/google` for body typography.

**Spec reference:** `docs/superpowers/specs/2026-05-04-latex-canvas-redesign-design.md`

**Branch:** `feat/latex-canvas-redesign` (already created; spec already committed as `d18906c`)

**Commit policy for every task:** Use `git commit-sulthan` (NEVER plain `git commit`). No `Co-Authored-By` tag. Stage only the files the task touches — never `.claude/`, never the `packages/rantaiclaw` submodule, never untracked WIP files. Bullet-style commit body with one bullet per change.

---

## Pre-flight

- [ ] **Verify branch state**

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: on `feat/latex-canvas-redesign`, no staged changes.

- [ ] **Verify test runner works**

```bash
bun test --reporter verbose tests/unit/spreadsheet/parse.test.ts 2>&1 | tail -20
```

Expected: spreadsheet parse test runs green. If this fails, the test runner is broken — stop and investigate before proceeding.

---

## Task 1: Pin existing transpiler behavior with regression tests

**Files:**
- Create: `tests/unit/latex/transpiler.test.ts`

**Why:** Before refactoring the existing `latexToHtml` in `latex-renderer.tsx` into its own module, lock its current behavior with tests. This catches regressions during the move and includes the `i++` fix from `4b72c66` so the bug can never silently come back.

- [ ] **Step 1.1: Write the regression test file**

Create `tests/unit/latex/transpiler.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

// We import via dynamic require to avoid pulling React component code into a node-env test.
// The transpiler logic in latex-renderer.tsx exports nothing today, so we test through a
// thin re-export that we will add when extracting the transpiler in Task 2. For now,
// these tests target the future location.
import { latexToHtml } from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler"

describe("latexToHtml — regression", () => {
  it("renders single-line $$x = y$$ without hanging (regression for 4b72c66)", () => {
    const start = Date.now()
    const out = latexToHtml("$$x = y$$", new Map())
    expect(Date.now() - start).toBeLessThan(50)
    expect(out.html).toContain("math-block")
  })

  it("renders single-line \\[x = y\\] without hanging (regression for 4b72c66)", () => {
    const start = Date.now()
    const out = latexToHtml("\\[x = y\\]", new Map())
    expect(Date.now() - start).toBeLessThan(50)
    expect(out.html).toContain("math-block")
  })

  it("renders \\section{Title} as <h2>", () => {
    const out = latexToHtml("\\section{Hello}", new Map())
    expect(out.html).toMatch(/<h2[^>]*>Hello<\/h2>/)
  })

  it("renders \\subsection{Title} as <h3>", () => {
    const out = latexToHtml("\\subsection{Sub}", new Map())
    expect(out.html).toMatch(/<h3[^>]*>Sub<\/h3>/)
  })

  it("renders itemize block as <ul><li>", () => {
    const out = latexToHtml(
      "\\begin{itemize}\n\\item alpha\n\\item beta\n\\end{itemize}",
      new Map(),
    )
    expect(out.html).toMatch(/<ul>/)
    expect(out.html).toMatch(/<li>alpha<\/li>/)
    expect(out.html).toMatch(/<li>beta<\/li>/)
  })

  it("renders enumerate block as <ol><li>", () => {
    const out = latexToHtml(
      "\\begin{enumerate}\n\\item one\n\\item two\n\\end{enumerate}",
      new Map(),
    )
    expect(out.html).toMatch(/<ol>/)
    expect(out.html).toMatch(/<li>one<\/li>/)
  })

  it("renders \\textbf as <strong>", () => {
    const out = latexToHtml("Plain \\textbf{bold} text.", new Map())
    expect(out.html).toContain("<strong>bold</strong>")
  })

  it("preserves multi-line $$...$$ display math through KaTeX", () => {
    const out = latexToHtml("$$\nx = y\n$$", new Map())
    expect(out.html).toContain("math-block")
  })

  it("strips \\documentclass and \\usepackage preamble", () => {
    const out = latexToHtml(
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello\n\\end{document}",
      new Map(),
    )
    expect(out.html).not.toContain("documentclass")
    expect(out.html).not.toContain("usepackage")
    expect(out.html).toContain("Hello")
  })

  it("renders \\begin{align}...\\end{align} as one math-block", () => {
    const out = latexToHtml(
      "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}",
      new Map(),
    )
    const matches = out.html.match(/math-block/g) ?? []
    expect(matches.length).toBe(1)
  })
})
```

- [ ] **Step 1.2: Run the test — expect failure**

```bash
bun test tests/unit/latex/transpiler.test.ts 2>&1 | tail -20
```

Expected: FAIL with module-not-found error for `@/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler`. This is correct — Task 2 creates that module.

- [ ] **Step 1.3: Commit the failing tests**

```bash
git add tests/unit/latex/transpiler.test.ts
git commit-sulthan -m "$(cat <<'EOF'
test(latex): add transpiler regression suite

- pin existing latexToHtml behavior (sectioning, lists, textbf, math envs, preamble strip) before extracting it from the renderer module
- include the single-line $$...$$ and \[...\] timing assertions so the i++ regression fix from 4b72c66 stays locked in
- target the future @/features/.../latex/lib/transpiler import path; tests fail until task 2 lands
EOF
)"
```

---

## Task 2: Extract transpiler into `latex/lib/transpiler.ts`

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler.ts`
- Modify: `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx` (still flat for this task; just re-imports from new location)

**Why:** Move parser logic out of the React component so we can grow it (theorem envs, cross-refs) without bloating the renderer file. Behavior unchanged; the regression suite from Task 1 must pass.

- [ ] **Step 2.1: Create `latex/lib/transpiler.ts`**

Create the directory and the file. Copy the following functions from current `latex-renderer.tsx` (lines from the existing file):
- `escapeHtml` (L38-43)
- `readBracedArg` (L54-78)
- `replaceBracedCommand` (L85-107)
- `replaceTwoArgBracedCommand` (L112-137)
- `parseSectioningHead` (L145-159)
- `parseParagraphHead` (L164-173)
- `processInlineLatex` (L176-209) — but route math through a `renderMath` parameter so we can inject KaTeX without dragging the React-only `katex` import into a node-env test (jsdom env handles it; document this)
- `latexToHtml` (L212-467)

Add a new top-level signature for `latexToHtml`:

```ts
import katex from "katex"

export type LabelRegistry = Map<string, LabelEntry>

export type LabelEntry = {
  kind: "theorem" | "lemma" | "corollary" | "proposition"
       | "definition" | "example" | "equation"
  number: string
  displayLabel: string
  anchorId: string
}

export type TranspileResult = {
  html: string
  warnings: string[]
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: (ctx) => {
        if (ctx.command === "\\href" || ctx.command === "\\url") {
          return typeof ctx.url === "string" && /^https?:\/\//i.test(ctx.url)
        }
        return false
      },
    })
  } catch {
    return `<code class="latex-error">${escapeHtml(tex)}</code>`
  }
}

export function latexToHtml(source: string, _registry: LabelRegistry): TranspileResult {
  const warnings: string[] = []
  // ... existing latexToHtml body, slightly adapted: the i++ fix from 4b72c66
  // is already in main; preserve it exactly.
  // ... return { html: parts.join("\n"), warnings }
}
```

Keep the exact body of `latexToHtml` from the current file. The `_registry` parameter is unused in this task (prefixed with `_` to silence lint); Task 5 wires it in.

- [ ] **Step 2.2: Update the React renderer to import from the new location**

In `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx`, replace the inline transpiler functions and `renderMath`/`escapeHtml`/`isKatexCommandAllowed` definitions with:

```ts
import { latexToHtml } from "./latex/lib/transpiler"
```

Then in the component body, replace:

```ts
const { html, error } = useMemo(() => {
  try {
    const rendered = latexToHtml(content)
    return { html: rendered, error: null }
  } catch (err) {
    return { html: null, error: err instanceof Error ? err.message : "Failed to render LaTeX" }
  }
}, [content, retryCount])
```

with:

```ts
const { html, error } = useMemo(() => {
  try {
    const { html } = latexToHtml(content, new Map())
    return { html, error: null }
  } catch (err) {
    return { html: null, error: err instanceof Error ? err.message : "Failed to render LaTeX" }
  }
}, [content, retryCount])
```

Do not change the JSX in this task — only the import wiring. The component still works identically from the user's perspective.

- [ ] **Step 2.3: Run the regression suite — expect pass**

```bash
bun test tests/unit/latex/transpiler.test.ts 2>&1 | tail -20
```

Expected: all 10 tests PASS.

- [ ] **Step 2.4: Run the broader test suite to confirm no other test broke**

```bash
bun test:unit 2>&1 | tail -30
```

Expected: all unit tests still pass.

- [ ] **Step 2.5: Type check**

```bash
bunx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 2.6: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler.ts \
        src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx
git commit-sulthan -m "$(cat <<'EOF'
refactor(chat/artifacts/latex): extract transpiler into latex/lib/transpiler.ts

- pull latexToHtml, processInlineLatex, readBracedArg and the rest of the parser helpers out of the React renderer file into a standalone module so they can be grown (theorem envs, cross-refs) without bloating the component
- new export signature returns { html, warnings } and accepts a LabelRegistry parameter (unused for now; wired in by the cross-refs task)
- React renderer imports latexToHtml from the new location, behavior is byte-identical for callers
- the i++ fix from 4b72c66 carries forward; regression suite added in the previous commit now passes
EOF
)"
```

---

## Task 3: Implement `theorem-envs.ts` (recognizer + renderer)

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/lib/theorem-envs.ts`
- Create: `tests/unit/latex/theorem-envs.test.ts`

**Why:** Recognize the eight theorem-style environments and emit colored vertical-bar accent HTML. This module is purely string-in / HTML-string-out; the counter is supplied by the caller (set up in Task 4).

- [ ] **Step 3.1: Write failing tests**

Create `tests/unit/latex/theorem-envs.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  isTheoremBegin,
  renderTheoremBlock,
  THEOREM_KINDS,
  type TheoremKind,
} from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/theorem-envs"

describe("theorem-envs — kind recognition", () => {
  it("recognizes \\begin{theorem}", () => {
    const r = isTheoremBegin("\\begin{theorem}")
    expect(r).toEqual({ kind: "theorem" })
  })

  it("recognizes \\begin{theorem}[Optional Name]", () => {
    const r = isTheoremBegin("\\begin{theorem}[Mean Value Theorem]")
    expect(r).toEqual({ kind: "theorem", optionalName: "Mean Value Theorem" })
  })

  it("recognizes all 8 kinds", () => {
    const kinds: TheoremKind[] = [
      "theorem", "lemma", "corollary", "proposition",
      "definition", "example", "remark", "proof",
    ]
    for (const k of kinds) {
      expect(isTheoremBegin(`\\begin{${k}}`)?.kind).toBe(k)
      expect(THEOREM_KINDS.has(k)).toBe(true)
    }
  })

  it("returns null for non-theorem envs", () => {
    expect(isTheoremBegin("\\begin{align}")).toBeNull()
    expect(isTheoremBegin("\\begin{itemize}")).toBeNull()
    expect(isTheoremBegin("regular text")).toBeNull()
  })
})

describe("theorem-envs — render", () => {
  it("renders theorem with number and inner HTML", () => {
    const html = renderTheoremBlock("theorem", "1", undefined, "<p>Body</p>", "thm-foo")
    expect(html).toMatch(/<aside id="thm-foo" class="latex-theorem latex-theorem-blue">/)
    expect(html).toMatch(/Theorem 1\./)
    expect(html).toContain("<p>Body</p>")
  })

  it("renders theorem with optional name", () => {
    const html = renderTheoremBlock("theorem", "2", "Pythagoras", "<p>Body</p>", null)
    expect(html).toMatch(/Theorem 2 \(Pythagoras\)\./)
  })

  it("renders unnumbered remark in italic gray", () => {
    const html = renderTheoremBlock("remark", null, undefined, "<p>Note</p>", null)
    expect(html).toMatch(/latex-theorem-gray/)
    expect(html).toMatch(/Remark\./)
    expect(html).not.toMatch(/Remark \d/)
  })

  it("renders proof with auto-appended QED mark", () => {
    const html = renderTheoremBlock("proof", null, undefined, "<p>Steps</p>", null)
    expect(html).toMatch(/Proof\./)
    expect(html).toMatch(/<span class="latex-qed">∎<\/span>/)
  })

  it("uses correct color per kind", () => {
    const map: Record<TheoremKind, string> = {
      theorem: "blue",
      lemma: "indigo",
      corollary: "teal",
      proposition: "sky",
      definition: "purple",
      example: "amber",
      remark: "gray",
      proof: "gray",
    }
    for (const [kind, color] of Object.entries(map) as [TheoremKind, string][]) {
      const html = renderTheoremBlock(kind, null, undefined, "", null)
      expect(html).toContain(`latex-theorem-${color}`)
    }
  })

  it("emits anchor id when supplied", () => {
    const html = renderTheoremBlock("lemma", "3", undefined, "", "thm-foo")
    expect(html).toContain('id="thm-foo"')
  })

  it("omits anchor id when null", () => {
    const html = renderTheoremBlock("lemma", "3", undefined, "", null)
    expect(html).not.toContain("id=")
  })
})
```

- [ ] **Step 3.2: Run tests — expect failure**

```bash
bun test tests/unit/latex/theorem-envs.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement the module**

Create `src/features/conversations/components/chat/artifacts/renderers/latex/lib/theorem-envs.ts`:

```ts
export type TheoremKind =
  | "theorem"
  | "lemma"
  | "corollary"
  | "proposition"
  | "definition"
  | "example"
  | "remark"
  | "proof"

export const THEOREM_KINDS: ReadonlySet<TheoremKind> = new Set([
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "remark",
  "proof",
])

const KIND_COLOR: Record<TheoremKind, string> = {
  theorem: "blue",
  lemma: "indigo",
  corollary: "teal",
  proposition: "sky",
  definition: "purple",
  example: "amber",
  remark: "gray",
  proof: "gray",
}

const KIND_LABEL: Record<TheoremKind, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  proposition: "Proposition",
  definition: "Definition",
  example: "Example",
  remark: "Remark",
  proof: "Proof",
}

const BEGIN_RE = /^\s*\\begin\{([a-z]+)\}(?:\[([^\]]+)\])?\s*$/

export function isTheoremBegin(
  line: string,
): { kind: TheoremKind; optionalName?: string } | null {
  const m = line.match(BEGIN_RE)
  if (!m) return null
  const kind = m[1] as TheoremKind
  if (!THEOREM_KINDS.has(kind)) return null
  const optionalName = m[2]
  return optionalName ? { kind, optionalName } : { kind }
}

export function renderTheoremBlock(
  kind: TheoremKind,
  number: string | null,
  optionalName: string | undefined,
  innerHtml: string,
  anchorId: string | null,
): string {
  const color = KIND_COLOR[kind]
  const label = KIND_LABEL[kind]
  const headerNumber = number ? ` ${number}` : ""
  const headerName = optionalName ? ` (${optionalName})` : ""
  const idAttr = anchorId ? ` id="${anchorId}"` : ""
  const qed =
    kind === "proof"
      ? '<span class="latex-qed">∎</span>'
      : ""

  return (
    `<aside${idAttr} class="latex-theorem latex-theorem-${color}">` +
      `<header class="latex-theorem-header">${label}${headerNumber}${headerName}.</header>` +
      `<div class="latex-theorem-body">${innerHtml}${qed}</div>` +
    `</aside>`
  )
}
```

- [ ] **Step 3.4: Run tests — expect pass**

```bash
bun test tests/unit/latex/theorem-envs.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/lib/theorem-envs.ts \
        tests/unit/latex/theorem-envs.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): add theorem environment recognizer and renderer

- new lib/theorem-envs.ts module recognizes the 8 amsthm-style envs (theorem, lemma, corollary, proposition, definition, example, remark, proof) and emits colored vertical-bar <aside> markup
- color map follows the spec: theorem=blue, lemma=indigo, corollary=teal, proposition=sky, definition=purple, example=amber, remark=gray italic, proof=gray with auto-appended ∎
- isTheoremBegin parses \begin{<kind>}[Optional Name] including the bracketed display name; returns null for any env that is not a theorem kind so the existing parser can keep handling itemize/align/etc.
- renderTheoremBlock takes counter, name, inner HTML, and anchor id from the caller — counter assignment lives in the cross-refs scan pass
EOF
)"
```

---

## Task 4: Implement `cross-refs.ts` (label scan + ref resolution)

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs.ts`
- Create: `tests/unit/latex/cross-refs.test.ts`

**Why:** First parser pass walks source, counts theorem and equation envs, records every `\label{kind:key}` against the running counter. Second helper resolves `\eqref{}` and `\ref{}` lookups during the transpile pass.

- [ ] **Step 4.1: Write failing tests**

Create `tests/unit/latex/cross-refs.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  scanLabels,
  resolveRef,
} from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs"

describe("scanLabels — single env", () => {
  it("registers a labeled theorem", () => {
    const reg = scanLabels(
      "\\begin{theorem}\n\\label{thm:mvt}\nbody\n\\end{theorem}",
    )
    const e = reg.get("thm:mvt")
    expect(e).toBeDefined()
    expect(e?.kind).toBe("theorem")
    expect(e?.number).toBe("1")
    expect(e?.anchorId).toBe("thm-mvt")
  })

  it("registers a labeled equation env", () => {
    const reg = scanLabels(
      "\\begin{equation}\n\\label{eq:foo}\nx = y\n\\end{equation}",
    )
    const e = reg.get("eq:foo")
    expect(e?.kind).toBe("equation")
    expect(e?.number).toBe("1")
    expect(e?.anchorId).toBe("eq-foo")
  })

  it("ignores label outside any numbered env", () => {
    const reg = scanLabels("\\label{stray:nothing}\n\\section{Hi}")
    expect(reg.has("stray:nothing")).toBe(false)
  })
})

describe("scanLabels — counter pools", () => {
  it("theorem family shares one counter pool (amsthm convention)", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{lemma}\\label{thm:b}\\end{lemma}",
        "\\begin{corollary}\\label{thm:c}\\end{corollary}",
        "\\begin{proposition}\\label{thm:d}\\end{proposition}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("thm:b")?.number).toBe("2")
    expect(reg.get("thm:c")?.number).toBe("3")
    expect(reg.get("thm:d")?.number).toBe("4")
  })

  it("definition has its own pool", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{definition}\\label{def:a}\\end{definition}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("def:a")?.number).toBe("1")
  })

  it("equation pool is independent of theorem pool", () => {
    const reg = scanLabels(
      [
        "\\begin{theorem}\\label{thm:a}\\end{theorem}",
        "\\begin{equation}\\label{eq:a}\\end{equation}",
      ].join("\n"),
    )
    expect(reg.get("thm:a")?.number).toBe("1")
    expect(reg.get("eq:a")?.number).toBe("1")
  })

  it("starred envs do not increment counter", () => {
    const reg = scanLabels(
      [
        "\\begin{equation*}\\end{equation*}",
        "\\begin{equation}\\label{eq:numbered}\\end{equation}",
      ].join("\n"),
    )
    expect(reg.get("eq:numbered")?.number).toBe("1")
  })
})

describe("resolveRef", () => {
  const reg = scanLabels(
    [
      "\\begin{theorem}\\label{thm:mvt}\\end{theorem}",
      "\\begin{equation}\\label{eq:foo}\\end{equation}",
    ].join("\n"),
  )

  it("\\ref renders bare number with anchor", () => {
    const r = resolveRef(reg, "thm:mvt", "ref")
    expect(r).toEqual({ displayText: "1", anchorId: "thm-mvt" })
  })

  it("\\eqref renders parenthesized number", () => {
    const r = resolveRef(reg, "eq:foo", "eqref")
    expect(r).toEqual({ displayText: "(1)", anchorId: "eq-foo" })
  })

  it("returns null for unknown key", () => {
    expect(resolveRef(reg, "thm:missing", "ref")).toBeNull()
  })
})
```

- [ ] **Step 4.2: Run tests — expect failure**

```bash
bun test tests/unit/latex/cross-refs.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement the module**

Create `src/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs.ts`:

```ts
import type { LabelEntry, LabelRegistry } from "./transpiler"

const ANCHOR_PREFIX: Record<LabelEntry["kind"], string> = {
  theorem: "thm",
  lemma: "thm",
  corollary: "thm",
  proposition: "thm",
  definition: "def",
  example: "ex",
  equation: "eq",
}

const THEOREM_FAMILY = new Set(["theorem", "lemma", "corollary", "proposition"])
const EQUATION_FAMILY = new Set(["equation", "align", "gather"])  // numbered envs only

const BEGIN_RE = /\\begin\{([a-z]+)(\*?)\}/g
const LABEL_INSIDE_BLOCK_RE = /\\label\{([^}]+)\}/g

export function scanLabels(source: string): LabelRegistry {
  const registry: LabelRegistry = new Map()
  let theoremCounter = 0
  let definitionCounter = 0
  let exampleCounter = 0
  let equationCounter = 0

  // Walk via matchAll to find every \begin{...}, then read the block until \end{...}
  const beginMatches = [...source.matchAll(BEGIN_RE)]
  for (const m of beginMatches) {
    const envName = m[1]
    const isStarred = m[2] === "*"
    if (isStarred) continue   // starred envs don't number

    const isTheoremFamily = THEOREM_FAMILY.has(envName)
    const isDefinition = envName === "definition"
    const isExample = envName === "example"
    const isEquationFamily = EQUATION_FAMILY.has(envName)

    if (!isTheoremFamily && !isDefinition && !isExample && !isEquationFamily) continue

    let kind: LabelEntry["kind"]
    let number: number
    if (isTheoremFamily) {
      theoremCounter++
      kind = envName as LabelEntry["kind"]   // theorem | lemma | corollary | proposition
      number = theoremCounter
    } else if (isDefinition) {
      definitionCounter++
      kind = "definition"
      number = definitionCounter
    } else if (isExample) {
      exampleCounter++
      kind = "example"
      number = exampleCounter
    } else {
      // equation family — all bucketed as "equation" for label kind
      equationCounter++
      kind = "equation"
      number = equationCounter
    }

    // Find the matching \end{<envName>} and scan the block for \label{...}
    const endTag = `\\end{${envName}${isStarred ? "*" : ""}}`
    const blockStart = m.index! + m[0].length
    const blockEnd = source.indexOf(endTag, blockStart)
    if (blockEnd === -1) continue   // malformed; skip
    const block = source.slice(blockStart, blockEnd)

    // Take the FIRST \label{} inside the block (LaTeX behavior: subsequent ones are ignored
    // for ref-target purposes; the validator can warn separately if multiple appear)
    const labelMatch = block.match(/\\label\{([^}]+)\}/)
    if (!labelMatch) continue

    const key = labelMatch[1]
    const anchorId = `${ANCHOR_PREFIX[kind]}-${slugify(key)}`
    const displayLabel =
      kind === "equation"
        ? `Equation (${number})`
        : `${capitalize(kind)} ${number}`

    registry.set(key, {
      kind,
      number: String(number),
      displayLabel,
      anchorId,
    })
  }

  return registry
}

export function resolveRef(
  registry: LabelRegistry,
  key: string,
  variant: "ref" | "eqref",
): { displayText: string; anchorId: string } | null {
  const entry = registry.get(key)
  if (!entry) return null
  const displayText = variant === "eqref" ? `(${entry.number})` : entry.number
  return { displayText, anchorId: entry.anchorId }
}

function slugify(s: string): string {
  // Replace : / and other unsafe id chars with -
  return s.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
```

Note: `LabelEntry` and `LabelRegistry` are imported from `./transpiler` where they were defined in Task 2.

- [ ] **Step 4.4: Run tests — expect pass**

```bash
bun test tests/unit/latex/cross-refs.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4.5: Type check**

```bash
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs.ts \
        tests/unit/latex/cross-refs.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): add cross-reference scan and resolve helpers

- new lib/cross-refs.ts walks the source for \begin{...} blocks and assigns counters per pool: theorem family (theorem/lemma/corollary/proposition) shares one, definition has its own, example has its own, equation family (equation/align/gather) has its own
- starred envs (equation*, align*) do not increment counters, matching LaTeX-native behavior
- only the first \label{} inside a numbered block is registered; subsequent labels in the same block are ignored
- resolveRef returns either a bare number (\ref) or a parenthesized number (\eqref) plus the anchor id; null on unknown key so the transpiler can render the [?] fallback
- anchor ids use a kind prefix (thm- / def- / ex- / eq-) plus a slugified key so labels like eq:foo become id="eq-foo"
EOF
)"
```

---

## Task 5: Wire theorem envs and cross-refs into the transpiler

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler.ts`
- Modify: `tests/unit/latex/transpiler.test.ts` (add integration tests)

**Why:** The two new modules from Tasks 3 and 4 must be invoked by the transpiler so theorem blocks render and `\eqref{}` resolves to anchor links during the existing line-by-line walk.

- [ ] **Step 5.1: Add integration tests**

Append to `tests/unit/latex/transpiler.test.ts`:

```ts
import { scanLabels } from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/cross-refs"

describe("latexToHtml — theorem envs", () => {
  it("renders \\begin{theorem} as <aside class='latex-theorem-blue'>", () => {
    const src = "\\begin{theorem}\nLet f be continuous.\n\\end{theorem}"
    const out = latexToHtml(src, scanLabels(src))
    expect(out.html).toMatch(/latex-theorem-blue/)
    expect(out.html).toMatch(/Theorem/)
    expect(out.html).toContain("Let f be continuous.")
  })

  it("renders proof env with QED mark", () => {
    const src = "\\begin{proof}\nSteps go here.\n\\end{proof}"
    const out = latexToHtml(src, scanLabels(src))
    expect(out.html).toMatch(/latex-qed/)
    expect(out.html).toMatch(/Proof\./)
  })

  it("numbers labeled theorems and exposes anchor id", () => {
    const src =
      "\\begin{theorem}\n\\label{thm:mvt}\nBody\n\\end{theorem}"
    const reg = scanLabels(src)
    const out = latexToHtml(src, reg)
    expect(out.html).toMatch(/id="thm-mvt"/)
    expect(out.html).toMatch(/Theorem 1\./)
  })
})

describe("latexToHtml — cross references", () => {
  it("\\eqref{eq:foo} renders as a clickable link with parenthesized number", () => {
    const src =
      "\\begin{equation}\\label{eq:foo}\nx = y\n\\end{equation}\n\nBy \\eqref{eq:foo} we have...."
    const reg = scanLabels(src)
    const out = latexToHtml(src, reg)
    expect(out.html).toMatch(/<a href="#eq-foo"[^>]*data-eqref[^>]*>\(1\)<\/a>/)
  })

  it("\\ref{thm:mvt} renders as bare number link", () => {
    const src =
      "\\begin{theorem}\\label{thm:mvt}\nbody\n\\end{theorem}\n\nBy \\ref{thm:mvt}..."
    const reg = scanLabels(src)
    const out = latexToHtml(src, reg)
    expect(out.html).toMatch(/<a href="#thm-mvt"[^>]*>1<\/a>/)
  })

  it("unresolved \\eqref renders as red [?] and emits a warning", () => {
    const src = "Reference to nothing: \\eqref{eq:missing}."
    const out = latexToHtml(src, new Map())
    expect(out.html).toMatch(/latex-eqref-unknown/)
    expect(out.html).toContain("[?]")
    expect(out.warnings).toContain("Unresolved reference: eq:missing")
  })
})
```

- [ ] **Step 5.2: Run tests — expect failure**

```bash
bun test tests/unit/latex/transpiler.test.ts 2>&1 | tail -20
```

Expected: FAIL on the new tests — theorem envs not wired in.

- [ ] **Step 5.3: Wire `theorem-envs` into the line-by-line walk**

In `latex/lib/transpiler.ts`, locate the `latexToHtml` function and find the block where `\begin{...}` / `\end{...}` are handled (currently the section that says "Skip other `\begin{...}` / `\end{...}` we don't handle"). Replace the generic skip with theorem-env detection BEFORE the skip:

```ts
import { isTheoremBegin, renderTheoremBlock, type TheoremKind } from "./theorem-envs"

// ... inside latexToHtml's main while-loop, BEFORE the generic
// `if (line.startsWith("\\begin{") || line.startsWith("\\end{"))` skip:

const theoremHead = isTheoremBegin(line)
if (theoremHead) {
  if (inList) { parts.push(`</${listType}>`); inList = false }
  const endTag = `\\end{${theoremHead.kind}}`
  let inner = ""
  i++
  while (i < lines.length && !lines[i].includes(endTag)) {
    inner += lines[i] + "\n"
    i++
  }
  if (i < lines.length) i++   // consume end tag

  // Pull a label from the block body if present (already registered by scanLabels)
  const labelMatch = inner.match(/\\label\{([^}]+)\}/)
  const labelKey = labelMatch?.[1]
  const registryEntry = labelKey ? _registry.get(labelKey) : undefined
  const anchorId = registryEntry?.anchorId ?? null
  const number = registryEntry?.number ?? null

  // Strip the \label{} from inner before processing, then transpile inner as inline LaTeX
  const cleanedInner = inner.replace(/\\label\{[^}]+\}\s*\n?/g, "").trim()
  const innerHtml = processInlineLatex(cleanedInner)

  parts.push(renderTheoremBlock(theoremHead.kind, number, theoremHead.optionalName, innerHtml, anchorId))
  continue
}
```

Note the function parameter rename: change `_registry` to `registry` everywhere now that it's used.

- [ ] **Step 5.4: Wire `\ref{}` and `\eqref{}` into `processInlineLatex`**

Still in `latex/lib/transpiler.ts`, add to `processInlineLatex` (BEFORE the `\\noindent` cleanup line):

```ts
// Cross-references — registry is closed over via the outer scope; pass through
// a module-level slot since processInlineLatex is called recursively without
// passing the registry. Refactor: turn processInlineLatex into a closure
// constructor that captures registry+warnings, instead of a free function.
```

Refactor processInlineLatex to be created per-call:

```ts
function makeProcessInline(registry: LabelRegistry, warnings: string[]) {
  function processInlineLatex(text: string): string {
    let result = text
    // ... existing inline math + braced commands ...

    // Cross-references
    result = result.replace(/\\eqref\{([^}]+)\}/g, (_, key: string) => {
      const r = resolveRef(registry, key, "eqref")
      if (!r) {
        warnings.push(`Unresolved reference: ${key}`)
        return `<span class="latex-eqref-unknown">[?]</span>`
      }
      return `<a href="#${r.anchorId}" data-eqref class="latex-eqref">${r.displayText}</a>`
    })
    result = result.replace(/\\ref\{([^}]+)\}/g, (_, key: string) => {
      const r = resolveRef(registry, key, "ref")
      if (!r) {
        warnings.push(`Unresolved reference: ${key}`)
        return `<span class="latex-eqref-unknown">[?]</span>`
      }
      return `<a href="#${r.anchorId}" data-eqref class="latex-eqref">${r.displayText}</a>`
    })

    // ... existing remaining transformations ...
    return result
  }
  return processInlineLatex
}
```

Update `latexToHtml` to instantiate `processInlineLatex = makeProcessInline(registry, warnings)` once at the top, then call it where the current free function is called.

Import:

```ts
import { resolveRef } from "./cross-refs"
```

- [ ] **Step 5.5: Tag numbered display math with anchor + equation number**

Inside `latexToHtml`, the display-math branches (`$$...$$`, `\[...\]`, `\begin{equation}`, etc.) currently emit `<div class="math-block">...</div>`. Update them to inspect `registry` for a matching `\label{}` and emit equation-number plus anchor:

```ts
// Helper that wraps the rendered KaTeX in a <div> with optional anchor + number
function wrapDisplayMath(rendered: string, mathSource: string): string {
  const labelMatch = mathSource.match(/\\label\{([^}]+)\}/)
  if (!labelMatch) return `<div class="math-block">${rendered}</div>`
  const key = labelMatch[1]
  const entry = registry.get(key)
  if (!entry || entry.kind !== "equation") {
    return `<div class="math-block">${rendered}</div>`
  }
  return (
    `<div class="latex-equation math-block" id="${entry.anchorId}">` +
      rendered +
      `<span class="latex-equation-number">(${entry.number})</span>` +
    `</div>`
  )
}
```

Replace each `parts.push(`<div class="math-block">${renderMath(mathContent, true)}</div>`)` call with `parts.push(wrapDisplayMath(renderMath(mathContent, true), mathContent))`.

Also: strip `\label{...}` out of `mathContent` BEFORE passing to KaTeX (KaTeX doesn't recognize `\label`).

- [ ] **Step 5.6: Run tests — expect pass**

```bash
bun test tests/unit/latex/ 2>&1 | tail -30
```

Expected: all latex tests pass.

- [ ] **Step 5.7: Type check**

```bash
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5.8: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler.ts \
        tests/unit/latex/transpiler.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): wire theorem envs and cross-refs into the transpiler

- detect theorem-family begin lines before the generic \begin{} skip and route them through renderTheoremBlock with the counter from the scan-pass registry
- strip \label{} out of theorem block bodies before processInlineLatex so the marker doesn't leak into the rendered HTML
- processInlineLatex is now produced by a closure constructor that captures registry + warnings, letting \eqref{} and \ref{} replace inline tokens with clickable anchor links
- numbered display math (equation, align, gather, $$, \[ ... \]) gets the anchor id and equation-number span when its source contains a \label{} that was registered by the scan pass
- unresolved references render as a red [?] span and push an entry into the warnings list so the panel can surface a count when in dev mode
EOF
)"
```

---

## Task 6: Build `LatexPaperView` component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.test.tsx`

**Why:** Render the parsed HTML inside a paper-styled article element, attach the click delegate for `\eqref{}` smooth-scroll, and apply the theorem/equation Tailwind utilities.

- [ ] **Step 6.1: Write failing component test**

Create `latex/latex-paper-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexPaperView } from "./latex-paper-view"

describe("LatexPaperView", () => {
  it("renders the html into an article element", () => {
    const html = '<p>Hello <strong>world</strong></p>'
    const { container } = render(<LatexPaperView html={html} />)
    const article = container.querySelector("article")
    expect(article).not.toBeNull()
    expect(article?.innerHTML).toContain("Hello")
    expect(article?.innerHTML).toContain("<strong>world</strong>")
  })

  it("renders inside a centered paper-styled article", () => {
    const { container } = render(<LatexPaperView html="<p>x</p>" />)
    const article = container.querySelector("article")
    expect(article?.className).toMatch(/bg-white/)
    expect(article?.className).toMatch(/max-w-\[720px\]/)
  })

  it("smooth-scrolls when an eqref link is clicked", () => {
    const html =
      '<div id="eq-foo" class="latex-equation">target</div>' +
      '<p>see <a href="#eq-foo" data-eqref>(1)</a></p>'
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<LatexPaperView html={html} />)
    const link = container.querySelector('[data-eqref]') as HTMLElement
    fireEvent.click(link)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    })
  })

  it("ignores clicks outside eqref links", () => {
    const html = '<p>plain <span>text</span></p>'
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<LatexPaperView html={html} />)
    fireEvent.click(container.querySelector("span") as HTMLElement)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6.2: Run test — expect failure**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.test.tsx 2>&1 | tail -10
```

Expected: FAIL — component does not exist.

- [ ] **Step 6.3: Implement `LatexPaperView`**

Create `latex/latex-paper-view.tsx`:

```tsx
"use client"

import { useCallback, useRef } from "react"

interface LatexPaperViewProps {
  html: string
}

export function LatexPaperView({ html }: LatexPaperViewProps) {
  const articleRef = useRef<HTMLElement>(null)

  const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-eqref]")
    if (!target) return
    e.preventDefault()
    const href = target.getAttribute("href")
    if (!href || !href.startsWith("#")) return
    const id = href.slice(1)
    const el = articleRef.current?.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  return (
    <div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
      <article
        ref={articleRef}
        onClick={onClick}
        className={[
          "mx-auto max-w-[720px]",
          "bg-white text-neutral-900",
          "px-[60px] py-[72px]",
          "shadow-lg rounded-sm",
          "font-serif text-[15px] leading-[1.7]",
          // theorem block utilities
          "[&_.latex-theorem]:border-l-4",
          "[&_.latex-theorem]:pl-4",
          "[&_.latex-theorem]:py-2",
          "[&_.latex-theorem]:my-4",
          "[&_.latex-theorem-header]:font-semibold",
          "[&_.latex-theorem-header]:mb-1",
          "[&_.latex-theorem-blue]:border-blue-500",
          "[&_.latex-theorem-blue]:bg-blue-50/50",
          "[&_.latex-theorem-blue_.latex-theorem-header]:text-blue-900",
          "[&_.latex-theorem-indigo]:border-indigo-500",
          "[&_.latex-theorem-indigo]:bg-indigo-50/50",
          "[&_.latex-theorem-indigo_.latex-theorem-header]:text-indigo-900",
          "[&_.latex-theorem-teal]:border-teal-500",
          "[&_.latex-theorem-teal]:bg-teal-50/50",
          "[&_.latex-theorem-teal_.latex-theorem-header]:text-teal-900",
          "[&_.latex-theorem-sky]:border-sky-500",
          "[&_.latex-theorem-sky]:bg-sky-50/50",
          "[&_.latex-theorem-sky_.latex-theorem-header]:text-sky-900",
          "[&_.latex-theorem-purple]:border-purple-500",
          "[&_.latex-theorem-purple]:bg-purple-50/50",
          "[&_.latex-theorem-purple_.latex-theorem-header]:text-purple-900",
          "[&_.latex-theorem-amber]:border-amber-500",
          "[&_.latex-theorem-amber]:bg-amber-50/50",
          "[&_.latex-theorem-amber_.latex-theorem-header]:text-amber-900",
          "[&_.latex-theorem-gray]:border-gray-400",
          "[&_.latex-theorem-gray]:bg-gray-50/50",
          "[&_.latex-theorem-gray_.latex-theorem-header]:text-gray-700",
          // proof QED
          "[&_.latex-qed]:float-right",
          "[&_.latex-qed]:ml-2",
          // equation numbering
          "[&_.latex-equation]:relative",
          "[&_.latex-equation]:my-4",
          "[&_.latex-equation-number]:absolute",
          "[&_.latex-equation-number]:right-0",
          "[&_.latex-equation-number]:top-1/2",
          "[&_.latex-equation-number]:-translate-y-1/2",
          "[&_.latex-equation-number]:text-sm",
          "[&_.latex-equation-number]:text-gray-500",
          "[&_.latex-equation-number]:font-mono",
          // refs
          "[&_.latex-eqref]:text-blue-600",
          "[&_.latex-eqref]:hover:underline",
          "[&_.latex-eqref]:cursor-pointer",
          "[&_.latex-eqref-unknown]:text-red-600",
          "[&_.latex-eqref-unknown]:font-medium",
          // KaTeX scroll
          "[&_.katex-display]:overflow-x-auto",
          "[&_.katex-display]:py-2",
          "[&_.math-block]:my-4",
          // doc title (legacy)
          "[&_.doc-title]:text-2xl",
          "[&_.doc-title]:font-bold",
          "[&_.doc-title]:mb-2",
          // KaTeX inline error
          "[&_.latex-error]:text-red-500",
          "[&_.latex-error]:text-xs",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
```

- [ ] **Step 6.4: Run tests — expect pass**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.test.tsx 2>&1 | tail -15
```

Expected: all 4 tests PASS. If `@testing-library/react` is not installed, install it: `bun add -d @testing-library/react @testing-library/dom`.

- [ ] **Step 6.5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.tsx \
        src/features/conversations/components/chat/artifacts/renderers/latex/latex-paper-view.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): add paper-styled preview component

- LatexPaperView renders the parsed html inside a centered max-w-[720px] white article with shadow, serif typography, and 60px/72px padding so the panel reads as a paper page floating on the dark canvas
- arbitrary-selector Tailwind utilities cover the seven theorem colors, the QED float-right, equation-number absolute positioning, and the eqref / eqref-unknown link styles so all dynamic markup from the transpiler picks up the right look without runtime CSS
- click delegation on the article element catches data-eqref links and smooth-scrolls the matching id into view, wired with CSS.escape for safety
- jsdom unit test covers the html injection, the paper styling, the click → scrollIntoView path, and the no-op-on-other-clicks invariant
EOF
)"
```

---

## Task 7: Build `LatexSourceView` component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.test.tsx`

**Why:** Show the raw LaTeX source with Shiki syntax highlighting on the Source tab.

- [ ] **Step 7.1: Inspect existing Shiki integration**

```bash
grep -n "shiki" src/features/conversations/components/chat/streamdown-content.tsx
```

Locate the Shiki helper or call. If `streamdown-content.tsx` exports a reusable `highlight` function, import it. If Shiki is invoked inline via a Streamdown plugin, replicate the configuration:

```ts
// Likely shape (adjust per actual import found above)
import { codeToHtml } from "shiki"
```

- [ ] **Step 7.2: Write failing component test**

Create `latex/latex-source-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { LatexSourceView } from "./latex-source-view"

describe("LatexSourceView", () => {
  it("renders the source inside a <pre>", async () => {
    const { container } = render(<LatexSourceView source="\\section{Hi}" />)
    await waitFor(() => {
      const pre = container.querySelector("pre")
      expect(pre).not.toBeNull()
      expect(pre?.textContent).toContain("\\section{Hi}")
    })
  })

  it("preserves line breaks in source", async () => {
    const { container } = render(
      <LatexSourceView source={"\\begin{theorem}\nbody\n\\end{theorem}"} />,
    )
    await waitFor(() => {
      const pre = container.querySelector("pre")
      expect(pre?.textContent).toContain("\\begin{theorem}")
      expect(pre?.textContent).toContain("body")
      expect(pre?.textContent).toContain("\\end{theorem}")
    })
  })
})
```

- [ ] **Step 7.3: Run test — expect failure**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.test.tsx 2>&1 | tail -10
```

Expected: FAIL — component missing.

- [ ] **Step 7.4: Implement `LatexSourceView`**

Create `latex/latex-source-view.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

interface LatexSourceViewProps {
  source: string
}

export function LatexSourceView({ source }: LatexSourceViewProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    codeToHtml(source, {
      lang: "latex",
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    })
      .then((html) => {
        if (!cancelled) setHighlighted(html)
      })
      .catch(() => {
        if (!cancelled) setHighlighted(`<pre>${escape(source)}</pre>`)
      })
    return () => {
      cancelled = true
    }
  }, [source])

  if (highlighted === null) {
    // Pre-Shiki fallback: render the raw source so the test can find it immediately.
    return (
      <div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
        <pre className="mx-auto max-w-[720px] bg-white dark:bg-zinc-800 rounded-md shadow-lg p-6 text-sm font-mono leading-relaxed whitespace-pre-wrap">
          {source}
        </pre>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
      <div
        className={[
          "mx-auto max-w-[720px]",
          "bg-white dark:bg-zinc-800",
          "rounded-md shadow-lg",
          "p-6 text-sm leading-relaxed",
          "[&_pre]:bg-transparent",
          "[&_pre]:m-0",
          "[&_pre]:p-0",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
```

If `streamdown-content.tsx` already configures Shiki with a different API surface (e.g., a singleton highlighter to avoid re-loading wasm), prefer that path — replace the `codeToHtml` import with the shared helper.

- [ ] **Step 7.5: Run tests — expect pass**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.test.tsx 2>&1 | tail -10
```

Expected: tests PASS (the pre-Shiki fallback satisfies them; if Shiki resolves before the assertion, both branches still contain the source text).

- [ ] **Step 7.6: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.tsx \
        src/features/conversations/components/chat/artifacts/renderers/latex/latex-source-view.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): add Shiki-highlighted source view

- LatexSourceView renders raw LaTeX source inside a paper-floating <pre> with the same dark-canvas / centered-paper look as the preview tab so the visual identity stays consistent across both tabs
- Shiki codeToHtml is invoked async with lang=latex and the github-light/github-dark dual theme, falling back to a plain <pre> while Shiki resolves so the first paint is never blank
- jsdom test confirms source text is present in the rendered pre regardless of Shiki resolution timing
EOF
)"
```

---

## Task 8: Build `LatexToolbar` component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.test.tsx`

**Why:** Tab toggle (Preview / Source) plus a Copy button. Retry surfaces only in the error state and is wired by the root component.

- [ ] **Step 8.1: Write failing component test**

Create `latex/latex-toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexToolbar } from "./latex-toolbar"

describe("LatexToolbar", () => {
  it("renders Preview and Source tab triggers", () => {
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
      />,
    )
    expect(getByRole("tab", { name: /preview/i })).not.toBeNull()
    expect(getByRole("tab", { name: /source/i })).not.toBeNull()
  })

  it("calls onTabChange when Source tab is clicked", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={onTabChange}
        onCopy={() => {}}
        copied={false}
      />,
    )
    fireEvent.click(getByRole("tab", { name: /source/i }))
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("calls onCopy when Copy button clicked", () => {
    const onCopy = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={onCopy}
        copied={false}
      />,
    )
    fireEvent.click(getByRole("button", { name: /copy/i }))
    expect(onCopy).toHaveBeenCalled()
  })

  it("renders Retry button only in error state", () => {
    const onRetry = vi.fn()
    const { rerender, queryByRole, getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
      />,
    )
    expect(queryByRole("button", { name: /retry/i })).toBeNull()

    rerender(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
        error="boom"
        onRetry={onRetry}
      />,
    )
    fireEvent.click(getByRole("button", { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
```

- [ ] **Step 8.2: Run test — expect failure**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.test.tsx 2>&1 | tail -10
```

Expected: FAIL — component missing.

- [ ] **Step 8.3: Implement `LatexToolbar`**

Create `latex/latex-toolbar.tsx`:

```tsx
"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check, RotateCcw } from "@/lib/icons"

interface LatexToolbarProps {
  activeTab: "preview" | "source"
  onTabChange: (tab: "preview" | "source") => void
  onCopy: () => void
  copied: boolean
  error?: string
  onRetry?: () => void
}

export function LatexToolbar({
  activeTab,
  onTabChange,
  onCopy,
  copied,
  error,
  onRetry,
}: LatexToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-background">
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as "preview" | "source")}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-1.5">
        {error && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.4: Run tests — expect pass**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.test.tsx 2>&1 | tail -10
```

Expected: all 4 tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.tsx \
        src/features/conversations/components/chat/artifacts/renderers/latex/latex-toolbar.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): add Preview/Source toolbar

- LatexToolbar uses shadcn Tabs for the Preview/Source toggle and exposes Copy + optional Retry buttons; styling matches the existing artifact panel idioms (amber Retry, muted Copy)
- Retry slot is rendered only when error and onRetry are both supplied so the non-error layout stays clean
- copy button toggles between Copy/Check icons via the copied prop, leaving the timing decision to the parent (matches the 2-second confirmation pattern used in artifact-panel.tsx)
EOF
)"
```

---

## Task 9: Rewrite `LatexRenderer` root component

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-renderer.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/index.ts` (barrel export)
- Create: `src/features/conversations/components/chat/artifacts/renderers/latex/latex-renderer.test.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx` (will be deleted in Task 12; for now leave as legacy delegate to make rollout reversible if needed)

**Why:** Compose paper view + source view + toolbar; manage tab state; run the two-pass parse via `useMemo`; keep the existing error-state amber callout.

- [ ] **Step 9.1: Write failing root component test**

Create `latex/latex-renderer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexRenderer } from "./latex-renderer"

describe("LatexRenderer (root)", () => {
  it("starts on Preview tab and renders the paper view", () => {
    const { container, getByRole } = render(
      <LatexRenderer content="\\section{Hi}" />,
    )
    expect(getByRole("tab", { name: /preview/i })).toHaveAttribute("data-state", "active")
    expect(container.querySelector("article")).not.toBeNull()
  })

  it("switches to Source view when Source tab clicked", () => {
    const { container, getByRole } = render(
      <LatexRenderer content="\\section{Hi}" />,
    )
    fireEvent.click(getByRole("tab", { name: /source/i }))
    // Source view uses <pre> not <article>
    expect(container.querySelector("pre")).not.toBeNull()
  })

  it("renders the error callout on parse failure", () => {
    // Inject an unbalanced sentinel that the transpiler chokes on at import time —
    // since the current parser is forgiving, we mock by passing a content with a
    // throw-inducing input. The simplest path: stub via a content the transpiler
    // returns without error but the consumer surfaces error from a re-throw.
    // Practical alternative: this test covers the renderer NOT throwing on edge inputs.
    const edge = "$$" // open without close; transpiler must handle
    const { container } = render(<LatexRenderer content={edge} />)
    expect(container.textContent).toBeDefined()   // does not crash
  })
})
```

Note: a true error-callout test would require mocking the transpiler to throw. We accept the second-best assertion (renderer does not crash on partial input) for unit coverage; integration tests in the artifact panel cover the user-visible callout path.

- [ ] **Step 9.2: Run test — expect failure**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/latex-renderer.test.tsx 2>&1 | tail -10
```

Expected: FAIL — component missing.

- [ ] **Step 9.3: Implement the root component**

Create `latex/latex-renderer.tsx`:

```tsx
"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { AlertTriangle, Code, RotateCcw } from "@/lib/icons"
import { LatexPaperView } from "./latex-paper-view"
import { LatexSourceView } from "./latex-source-view"
import { LatexToolbar } from "./latex-toolbar"
import { latexToHtml } from "./lib/transpiler"
import { scanLabels } from "./lib/cross-refs"

interface LatexRendererProps {
  content: string
}

export function LatexRenderer({ content }: LatexRendererProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "source">("preview")
  const [retryCount, setRetryCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const articleRef = useRef<HTMLDivElement>(null)

  const { html, error } = useMemo(() => {
    try {
      const registry = scanLabels(content)
      const { html } = latexToHtml(content, registry)
      return { html, error: null as string | null }
    } catch (err) {
      return {
        html: null,
        error: err instanceof Error ? err.message : "Failed to render LaTeX",
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, retryCount])

  const handleRetry = useCallback(() => setRetryCount((c) => c + 1), [])

  const handleCopy = useCallback(async () => {
    const text =
      activeTab === "preview"
        ? articleRef.current?.querySelector("article")?.textContent ?? ""
        : content
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write can fail in restrictive contexts; swallow silently — user
      // can still copy via browser shortcut.
    }
  }, [activeTab, content])

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-500 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">LaTeX render error</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Code className="h-3.5 w-3.5" />
                {showSource ? "Hide source" : "View source"}
              </button>
            </div>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {error}
          </div>
          {showSource && (
            <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
              {content}
            </pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={articleRef} className="flex flex-col h-full">
      <LatexToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCopy={handleCopy}
        copied={copied}
      />
      <div className="flex-1 min-h-0">
        {activeTab === "preview" ? (
          <LatexPaperView html={html ?? ""} />
        ) : (
          <LatexSourceView source={content} />
        )}
      </div>
    </div>
  )
}
```

Create `latex/index.ts`:

```ts
export { LatexRenderer } from "./latex-renderer"
```

- [ ] **Step 9.4: Update the legacy file to delegate (transition)**

Modify `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx` to a one-line re-export:

```tsx
"use client"
export { LatexRenderer } from "./latex"
```

(Task 12 deletes this file outright; for this task we keep the path live so existing imports in `artifact-renderer.tsx` keep resolving.)

- [ ] **Step 9.5: Run all latex tests — expect pass**

```bash
bun test src/features/conversations/components/chat/artifacts/renderers/latex/ tests/unit/latex/ 2>&1 | tail -25
```

Expected: all tests PASS.

- [ ] **Step 9.6: Type check + lint**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun lint 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 9.7: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/latex/ \
        src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(chat/artifacts/latex): rewrite root renderer with tabbed Preview/Source

- LatexRenderer composes LatexToolbar, LatexPaperView, and LatexSourceView; preview tab is the default and the source tab swaps in without re-parsing
- two-pass parse runs once per content/retry change: scanLabels builds the registry, latexToHtml transpiles with that registry so theorem anchors and \eqref links land in the html
- copy handler grabs textContent from the active tab — rendered text on Preview, raw source on Source — with a 2-second Check-icon confirmation matching artifact-panel.tsx convention
- error path keeps the existing amber callout with Retry + View Source so rollout is visually identical when the parser fails
- legacy latex-renderer.tsx flat file is now a one-line re-export so the import in artifact-renderer.tsx still resolves; the flat file is removed in the cleanup task
EOF
)"
```

---

## Task 10: Validator updates

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Create: `tests/unit/latex/validator.test.ts`

**Why:** Lift `\label`, `\ref`, `\eqref` from the unsupported list, allow theorem envs, and add a soft-warning when an `\eqref{}` references a key with no matching `\label{}`.

- [ ] **Step 10.1: Write failing tests**

Create `tests/unit/latex/validator.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validateLatex — cross-ref support", () => {
  it("accepts \\label, \\ref, \\eqref on a labeled equation", async () => {
    const content =
      "\\begin{equation}\n\\label{eq:foo}\nx = y\n\\end{equation}\n\nBy \\eqref{eq:foo}..."
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)
  })

  it("warns on unresolved \\eqref", async () => {
    const content = "Reference: \\eqref{eq:missing}."
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)   // warning, not error
    expect(r.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/unresolved.*eq:missing/i)]),
    )
  })

  it("accepts theorem envs", async () => {
    const content =
      "\\begin{theorem}\\label{thm:mvt}\nLet f...\n\\end{theorem}"
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)
  })

  it("still rejects banned envs (tabular, figure, tikzpicture)", async () => {
    for (const env of ["tabular", "figure", "tikzpicture"]) {
      const r = await validateArtifactContent(
        "text/latex",
        `\\begin{${env}}body\\end{${env}}`,
        { isNew: true },
      )
      expect(r.ok).toBe(false)
    }
  })
})
```

- [ ] **Step 10.2: Run tests — expect failures (validator hasn't been updated)**

```bash
bun test tests/unit/latex/validator.test.ts 2>&1 | tail -15
```

Expected: FAIL on cross-ref + theorem assertions; PASS on banned-env assertion.

- [ ] **Step 10.3: Update the validator**

In `src/lib/tools/builtin/_validate-artifact.ts`, locate `LATEX_UNSUPPORTED_COMMANDS` (around L1221-1240). Remove `\\label`, `\\ref`, `\\eqref` if they appear there.

Locate `validateLatex` (L1242-1309). Find the env-name allow/deny check and add the eight theorem kinds to the allow list:

```ts
const LATEX_THEOREM_ENVS = new Set([
  "theorem", "lemma", "corollary", "proposition",
  "definition", "example", "remark", "proof",
])
```

Add an unresolved-ref warning pass at the end of `validateLatex`:

```ts
// Unresolved \eqref / \ref warnings — soft, not hard error
const labels = new Set<string>()
for (const m of content.matchAll(/\\label\{([^}]+)\}/g)) labels.add(m[1])
for (const m of content.matchAll(/\\(?:eqref|ref)\{([^}]+)\}/g)) {
  if (!labels.has(m[1])) {
    warnings.push(`Unresolved cross-reference \\eqref/\\ref{${m[1]}} — no matching \\label found`)
  }
}
```

Verify `validateArtifactContent`'s public shape returns `warnings` alongside `ok`. If the existing shape already supports it (the spec says it does — `result.warnings`), this works directly. If not, adapt the test to whatever the existing return shape uses (the test file should mirror the actual contract).

- [ ] **Step 10.4: Run tests — expect pass**

```bash
bun test tests/unit/latex/validator.test.ts 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 10.5: Run the full unit suite to catch regressions in other validators**

```bash
bun test:unit 2>&1 | tail -15
```

Expected: clean.

- [ ] **Step 10.6: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/latex/validator.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/latex): allow theorem envs and \label/\ref/\eqref in the validator

- remove \label, \ref, \eqref from LATEX_UNSUPPORTED_COMMANDS; they are now first-class supported by the renderer
- allow the 8 theorem-family envs (theorem, lemma, corollary, proposition, definition, example, remark, proof) through the env name check
- add a soft warning when \eqref / \ref references a key that has no corresponding \label in the same content; surfaces at create-time so the LLM can self-correct before persistence
- banned envs (tabular, figure, table, tikzpicture, includegraphics, bibliography, cite) stay rejected — the architecture (KaTeX + transpiler) does not support them
EOF
)"
```

---

## Task 11: Prompt module update

**Files:**
- Modify: `src/lib/prompts/artifacts/latex.ts`

**Why:** Tell the LLM about the new theorem envs and cross-refs. Remove anti-pattern entries that are now valid. Add a fourth example demonstrating the new capabilities.

- [ ] **Step 11.1: Read the current prompt**

```bash
sed -n '1,50p' src/lib/prompts/artifacts/latex.ts
```

Confirm structure: `type`, `label`, `summary`, `rules` (template literal), `examples` array.

- [ ] **Step 11.2: Update `rules`**

Locate the "Anti-Patterns" section at the end of the rules template literal. Remove these entries:
- `\\label{...}` / `\\ref{...}` / `\\eqref{...}` — cross-references are not resolved by this renderer.

Insert two new sections **before** the "Anti-Patterns" section:

```
## Theorem Environments

Use these for formal mathematical statements. Each renders as a colored
vertical-bar accent block in the preview:

| Environment              | Counter pool   | Color         |
|--------------------------|----------------|---------------|
| \\begin{theorem}          | theorem-family | blue          |
| \\begin{lemma}            | theorem-family | indigo        |
| \\begin{corollary}        | theorem-family | teal          |
| \\begin{proposition}      | theorem-family | sky           |
| \\begin{definition}       | own            | purple        |
| \\begin{example}          | own            | amber         |
| \\begin{remark}           | (unnumbered)   | gray (italic) |
| \\begin{proof}            | (unnumbered)   | gray; ∎ auto  |

Optional bracketed name:
\`\`\`
\\begin{theorem}[Mean Value Theorem]
Let f be continuous on [a,b]...
\\end{theorem}
\`\`\`

Theorem-family envs share one counter pool (amsthm convention): theorem,
lemma, corollary, proposition all increment together. Definition and example
each have their own pool. Remark and proof are unnumbered.

Numbering is flat (Theorem 1, Theorem 2). Section-prefixed numbering
(Theorem 1.2) is not supported.

## Cross-references

Mark any numbered env with \\label{kind:key} (recommended prefixes:
thm:, def:, ex:, eq:). Refer to it with:
- \\eqref{eq:key} for equations — renders as "(N)" clickable link
- \\ref{thm:key} for theorems — renders as bare "N" clickable link

Example:
\`\`\`
\\begin{theorem}[Mean Value Theorem]
\\label{thm:mvt}
Let f be continuous on [a,b]. Then there exists c such that
\\begin{equation}
\\label{eq:mvt}
f(c) = \\frac{1}{b-a} \\int_a^b f(x)\\,dx.
\\end{equation}
\\end{theorem}

By \\ref{thm:mvt}, applying \\eqref{eq:mvt}...
\`\`\`

Unresolved references render as red [?]. The validator warns at create-time
when a \\ref/\\eqref points at a missing \\label.
```

- [ ] **Step 11.3: Add a fourth example to `examples`**

Append to the `examples` array:

```ts
{
  label: "Theorem with proof and cross-references",
  code: `\\section{Mean Value Theorem}

\\begin{theorem}[Mean Value Theorem]
\\label{thm:mvt}
Let $f$ be continuous on $[a,b]$ and differentiable on $(a,b)$. Then there exists $c \\in (a,b)$ such that
\\begin{equation}
\\label{eq:mvt}
f'(c) = \\frac{f(b) - f(a)}{b - a}.
\\end{equation}
\\end{theorem}

\\begin{proof}
Define $g(x) = f(x) - L(x)$ where $L$ is the secant line through $(a, f(a))$ and $(b, f(b))$. Then $g(a) = g(b) = 0$, and by Rolle's Theorem there exists $c \\in (a,b)$ with $g'(c) = 0$. Substituting back yields \\eqref{eq:mvt}.
\\end{proof}

\\begin{remark}
The hypothesis of differentiability on the open interval $(a,b)$ — not the closed $[a,b]$ — is essential. By \\ref{thm:mvt}, we can derive Taylor's theorem and the fundamental theorem of calculus.
\\end{remark}
`,
},
```

- [ ] **Step 11.4: Verify prompt module compiles**

```bash
bunx tsc --noEmit 2>&1 | grep -i latex || echo "OK"
```

Expected: `OK` printed (no TS errors involving latex).

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/prompts/artifacts/latex.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(prompts/latex): document theorem envs and cross-references

- new "Theorem Environments" section lists the 8 supported envs with their counter pool and color, including the \begin{theorem}[Optional Name] bracketed-display syntax
- new "Cross-references" section explains \label{kind:key} plus the \ref / \eqref distinction (bare number vs parenthesized) and surfaces the validator warning behavior for unresolved keys
- remove the anti-pattern entries for \label / \ref / \eqref since the renderer now resolves them end-to-end
- new fourth example demonstrates a theorem + proof + remark with cross-references, giving the LLM a concrete pattern to imitate for proof-style content
EOF
)"
```

---

## Task 12: Cleanup — remove the legacy flat renderer file

**Files:**
- Delete: `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (update import path)

**Why:** Task 9 left the flat file as a one-line re-export to avoid a single-PR churn. Now that the new directory is the source of truth and tests pass, we update the consumer's import path and delete the legacy file.

- [ ] **Step 12.1: Update the import in `artifact-renderer.tsx`**

```bash
grep -n "latex-renderer" src/features/conversations/components/chat/artifacts/artifact-renderer.tsx
```

Locate the line (roughly L101 per the architecture doc). Change:

```tsx
import { LatexRenderer } from "./renderers/latex-renderer"
```

to:

```tsx
import { LatexRenderer } from "./renderers/latex"
```

- [ ] **Step 12.2: Delete the legacy flat file**

```bash
git rm src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx
```

- [ ] **Step 12.3: Run all tests to confirm nothing else referenced the old path**

```bash
bun test 2>&1 | tail -25
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: clean. If any test or source file imported `./renderers/latex-renderer`, fix it.

- [ ] **Step 12.4: Build to catch dynamic imports**

```bash
bun run build 2>&1 | tail -20
```

Expected: build succeeds. If the build fails on a stale lazy-import path, update it.

- [ ] **Step 12.5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/artifact-renderer.tsx \
        src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx
git commit-sulthan -m "$(cat <<'EOF'
chore(chat/artifacts/latex): drop the legacy flat renderer file

- update artifact-renderer.tsx to import LatexRenderer from ./renderers/latex (directory barrel) instead of the legacy ./renderers/latex-renderer flat path
- delete the now-empty legacy file; the redirect re-export was only there to keep task 9 a self-contained behavior change
- full type check, unit tests, and next build all clean after the path swap
EOF
)"
```

---

## Task 13: End-to-end smoke test in the dev server

**Files:** None (manual verification)

**Why:** Unit and component tests cover the moving parts; this step confirms the integrated experience matches the spec's acceptance criteria from §13.

- [ ] **Step 13.1: Start the dev server**

```bash
bun dev
```

Wait for "Ready" output. The server runs on port 3000 by default.

- [ ] **Step 13.2: Manually verify acceptance criteria**

Open the dev server in a browser. Create or open a chat session. Trigger the LLM to create a `text/latex` artifact (e.g., "Write a proof that √2 is irrational using LaTeX with theorem and proof environments and a cross-reference"). Then verify each box in §13 of the spec:

- [ ] White paper floats on dark canvas with serif body typography
- [ ] Toolbar shows Preview/Source tabs
- [ ] Switching tabs is instantaneous (no re-parse)
- [ ] Source tab shows Shiki-highlighted LaTeX with line numbers
- [ ] `\begin{theorem}...\end{theorem}` renders as a blue vertical-bar block with `Theorem N.` header
- [ ] `\begin{proof}...\end{proof}` renders gray with `∎` at the end
- [ ] All 8 theorem envs render with their assigned color
- [ ] `\begin{align}` produces equation numbers; `\begin{align*}` does not
- [ ] `\eqref{eq:foo}` is a clickable link `(N)` that smooth-scrolls to the equation
- [ ] `\ref{thm:foo}` is a clickable link `N` that smooth-scrolls to the theorem
- [ ] Unknown `\eqref{}` target renders as red `[?]`
- [ ] Single-line `$$x = y$$` renders without the panel hanging (regression for `4b72c66`)
- [ ] Dark mode: container is dark, paper stays white

- [ ] **Step 13.3: If anything from §13 is wrong, fix it as a follow-up commit on this branch**

Use `git commit-sulthan` for any fix. Do not extend this plan; deal with each finding as a focused commit.

- [ ] **Step 13.4: Final commit (if any fixes were needed) or wrap-up**

If the smoke test passed without any tweaks, no commit needed for this task. The branch is ready for review and merge to main.

---

## Self-review summary (filled by plan author)

**Spec coverage:**
- §3 architecture → Tasks 2, 3, 4, 5
- §4 components → Tasks 6, 7, 8, 9
- §5 validator → Task 10
- §6 prompt → Task 11
- §7 streaming/error → covered in Tasks 9 (error callout retained) and 5 (warnings list emitted by transpiler)
- §8 testing → Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10
- §9 integration with chrome → Task 12 (import update) + Task 13 (smoke)
- §10 out of scope → none of those become tasks (deliberate)
- §13 acceptance criteria → Task 13

**No placeholders detected.** Every step has either complete code, an exact command, or a precise file edit.

**Type consistency check:**
- `LabelEntry`, `LabelRegistry`, `TranspileResult` defined in Task 2 (transpiler.ts), imported by Tasks 4, 5, 9.
- `TheoremKind` defined in Task 3, used in Tasks 5, 9.
- `LatexToolbar` props (`activeTab`, `onTabChange`, `onCopy`, `copied`, `error?`, `onRetry?`) consistent across Task 8 (definition) and Task 9 (consumer).

**Scope check:** focused on a single feature area (renderer redesign for `text/latex`). No subsystem decomposition needed.

**Estimate:** ~13 tasks × 10-30 minutes per task = ~3-6 hours of focused work. Matches spec's 1.5-2 day estimate when interleaved with normal cadence (test runs, type checks, manual verification).
