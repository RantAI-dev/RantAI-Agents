# LaTeX Canvas Redesign — Design Spec

**Date:** 2026-05-04
**Type:** `text/latex` artifact renderer
**Scope:** Visual polish (Overleaf-inspired paper preview) + theorem environments + equation cross-references
**Stack constraint:** No new compile engine. Continue with KaTeX + custom transpiler + CSS.
**Out of scope:** PDF export, tables, TikZ, in-panel editing.

---

## 1. Goal

Transform the `text/latex` artifact panel from a generic prose-styled HTML render into an **Overleaf-inspired paper preview canvas** with first-class support for theorem environments and equation cross-references. The user's experience should be: open the panel, see what looks like an academic paper page floating on a dark canvas, with proofs and theorems set off in colored vertical-bar accents, and clickable equation references that scroll smoothly to their target. Source code is one click away via a tab toggle.

The design honors three constraints from the brainstorming dialogue:

1. **Overleaf reference** — paper-like preview, serif typography, page floating on dark container.
2. **WYSIWYG principle** — preview faithfully represents what the document is. If PDF export is added later (separate Path A work), the print output should match what's on screen.
3. **Light stack** — no LaTeX engine (no tectonic, no pandoc, no pdflatex). KaTeX continues to handle math, the custom transpiler continues to handle structure. The redesign is CSS + parser additions, nothing else.

---

## 2. Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| **Layout** | Tabs (Source / Preview) inside renderer | User picked C in dialogue — keeps panel slim so chat stays visible alongside |
| **Scope** | Polish + theorem envs + cross-refs (no PDF export) | User picked C in scope dialogue — bundle visual and functional improvements into one cohesive change |
| **Theorem block visual** | Vertical-bar accent, color per kind | User picked B — academic feel without the heaviness of full boxed callouts |
| **Equation handling** | Tier 2 — auto-numbering + `\label`/`\eqref`/`\ref` cross-refs | User picked Tier 2 — auto-numbering without cross-ref is half-finished; cross-refs unlock long-doc use case |
| **Body typography** | Source Serif Pro via Google Fonts | Modern serif, readable on screen; loaded via `<link>` consistent with `react-renderer` font handling |
| **Math typography** | KaTeX default (Latin Modern via KaTeX webfont) | Already shipped, no change |
| **Dark mode** | Paper stays white, container background dark | Overleaf-faithful; paper "floats" against dark editor |
| **Source view** | Shiki with `lang="latex"`, read-only, line numbers | Reuse `streamdown-content.tsx` Shiki config; CodeMirror unnecessary for read-only |
| **Page boundaries** | Continuous flowing paper, max-width ~720px, padding ~1" | Page-bounded simulation deferred until PDF export materializes |
| **Toolbar position** | Inside renderer, not panel header | Panel header already crowded; pattern matches notebook |

---

## 3. Architecture

### 3.1 File decomposition

The current single-file renderer (`latex-renderer.tsx`, 536 LoC) already interleaves three concerns: HTML rendering, LaTeX parsing, and error UI. Adding three more (tabs, source view, cross-refs) makes a directory split the right move. New layout:

```
src/features/conversations/components/chat/artifacts/renderers/latex/
├── latex-renderer.tsx          root component, tabs state           (~100 LoC)
├── latex-paper-view.tsx        paper-styled preview                 (~140 LoC)
├── latex-source-view.tsx       Shiki-rendered read-only source      (~50 LoC)
├── latex-toolbar.tsx           Preview/Source tabs + Copy + Retry   (~60 LoC)
└── lib/
    ├── transpiler.ts           latexToHtml refactored from existing (~400 LoC)
    ├── theorem-envs.ts         theorem block recognizer + counters  (~120 LoC)
    └── cross-refs.ts           label registry + eqref/ref resolver  (~100 LoC)
```

The legacy `latex-renderer.tsx` flat file is deleted. Imports of `LatexRenderer` from `artifact-renderer.tsx` resolve to the directory's `index.ts` re-export of the root component.

### 3.2 Two-pass parser

```
LaTeX source string
       ↓
[Pass 1: Label scan]    walk source, find every \label{kind:key} inside math envs
                        and theorem envs; assign sequential numbers per kind;
                        produce labelRegistry: { "thm:mvt": "1.2", "eq:foo": "2.1", ... }
       ↓
[Pass 2: Transpile]     existing latexToHtml, now parameterized with labelRegistry;
                        emits anchor IDs on numbered envs; resolves \eqref{} and
                        \ref{} to clickable links; emits theorem blocks as
                        <aside> with vertical-bar styling
       ↓
HTML string + labelRegistry → React render
```

Pass 1 is a lightweight scan (no full transpile). Pass 2 is the existing transpiler, refactored to accept a `labelRegistry` parameter and call into `theorem-envs.ts` and `cross-refs.ts` for the new envs.

### 3.3 Counter model

Following the `amsthm` LaTeX convention:

| Counter pool | Members |
|---|---|
| `theorem-counter` (shared) | theorem, lemma, corollary, proposition |
| `definition-counter` (own) | definition |
| `example-counter` (own) | example |
| `equation-counter` (own) | equation, align (numbered), gather (numbered) |
| (none) | remark, proof — unnumbered |

Numbering format is flat (`1`, `2`, `3`) for v1. Section-prefixed numbering (`1.2` meaning "second theorem in section 1") is deferred — it requires section tracking that the current parser doesn't do. The prompt module will document this so the LLM doesn't expect section-prefixed output.

### 3.4 Label registry shape

```ts
type LabelEntry = {
  kind: "theorem" | "lemma" | "corollary" | "proposition" |
        "definition" | "example" | "equation"
  number: string                    // "1", "2", ...
  displayLabel: string              // "Theorem 1", "Equation (2)", ...
  anchorId: string                  // "thm-mvt", "eq-foo", ...
}

type LabelRegistry = Map<string, LabelEntry>
```

Anchor ID convention: `<kind-prefix>-<key>` where `kind-prefix` is `thm` (theorem/lemma/corollary/proposition), `def` (definition), `ex` (example), `eq` (equation). The LaTeX `\label{kind:key}` provides the `key`.

---

## 4. Components

### 4.1 `LatexRenderer` (root)

**Responsibility:** orchestrate tabs, error state, memoized parse.

**Props:** `{ content: string }` (existing).

**State:**
- `activeTab: "preview" | "source"` — default `"preview"`, persisted in component state only (no sessionStorage; reset on remount).
- `retryCount: number` — existing retry pattern.

**Computed (via `useMemo` on `[content, retryCount]`):**
- `{ html: string | null, labelRegistry: LabelRegistry | null, error: string | null }`

**Render:** `<LatexToolbar>` + tab content. Error state replaces tab content with the existing amber callout (kept).

### 4.2 `LatexPaperView`

**Responsibility:** render the paper preview from already-parsed HTML.

**Props:** `{ html: string }` (labelRegistry not needed at render time — anchors and links are baked into the HTML by the transpiler).

**Layout shell:**

```tsx
<div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
  <article
    className="
      mx-auto max-w-[720px]
      bg-white text-neutral-900
      px-[60px] py-[72px]
      shadow-lg rounded-sm
      font-serif text-[15px] leading-[1.7]
    "
    dangerouslySetInnerHTML={{ __html: html }}
  />
</div>
```

**Body font loading:** Source Serif Pro is loaded via the Next.js `next/font/google` helper at the renderer module level (or registered globally if other artifact types want it). If the font fails to load, fall back to the system serif stack via the `font-serif` Tailwind utility. Implementation detail: prefer `next/font` over a raw `<link>` tag because it's the App Router idiom in this codebase; the existing `_react-directives.ts` font path uses runtime `<link>` injection, which is acceptable inside an iframe-isolated renderer but unnecessary here.

**Theorem block markup** (emitted by `theorem-envs.ts`):

```html
<aside id="thm-mvt" class="latex-theorem latex-theorem-blue">
  <header class="latex-theorem-header">Theorem 1 (Mean Value Theorem).</header>
  <div class="latex-theorem-body">
    Let f be continuous on [a,b]. Then there exists c ∈ [a,b] such that...
  </div>
</aside>
```

CSS in the paper-view container (Tailwind arbitrary selectors):

```
[&_.latex-theorem]:border-l-4
[&_.latex-theorem]:pl-4
[&_.latex-theorem]:py-2
[&_.latex-theorem]:my-4

[&_.latex-theorem-blue]:border-blue-500
[&_.latex-theorem-blue]:bg-blue-50/50
[&_.latex-theorem-blue_.latex-theorem-header]:text-blue-900

[&_.latex-theorem-indigo]:border-indigo-500   ...
[&_.latex-theorem-purple]:border-purple-500   ...
[&_.latex-theorem-amber]:border-amber-500     ...
[&_.latex-theorem-teal]:border-teal-500       ...
[&_.latex-theorem-sky]:border-sky-500         ...
[&_.latex-theorem-gray]:border-gray-400       ...

[&_.latex-theorem-header]:font-semibold
[&_.latex-theorem-header]:mb-1
[&_.latex-theorem-body]:text-neutral-800
```

**Display math with equation number:**

```html
<div class="latex-equation" id="eq-foo">
  <div class="katex-display">...</div>
  <span class="latex-equation-number">(1)</span>
</div>
```

```
[&_.latex-equation]:relative
[&_.latex-equation]:my-4
[&_.latex-equation-number]:absolute
[&_.latex-equation-number]:right-0
[&_.latex-equation-number]:top-1/2
[&_.latex-equation-number]:-translate-y-1/2
[&_.latex-equation-number]:text-sm
[&_.latex-equation-number]:text-gray-500
[&_.latex-equation-number]:font-mono
```

**`\eqref{}` link:**

```html
<a href="#eq-foo" data-eqref class="latex-eqref">(1)</a>
```

```
[&_.latex-eqref]:text-blue-600
[&_.latex-eqref]:hover:underline
[&_.latex-eqref]:cursor-pointer
```

**Click handler** (delegated, attached once on the article element):

```ts
const onClick = (e: React.MouseEvent) => {
  const target = (e.target as HTMLElement).closest("[data-eqref]")
  if (!target) return
  e.preventDefault()
  const id = target.getAttribute("href")?.slice(1)
  if (!id) return
  const el = articleRef.current?.querySelector(`#${CSS.escape(id)}`)
  el?.scrollIntoView({ behavior: "smooth", block: "center" })
}
```

**Unknown ref:** rendered as `<span class="latex-eqref-unknown">[?]</span>` with red color. Console warning emitted by transpiler when it cannot resolve a key.

### 4.3 `LatexSourceView`

**Responsibility:** render the raw LaTeX source with Shiki syntax highlighting.

**Props:** `{ source: string }`.

**Implementation:** lazy-import Shiki helper from existing codebase (`streamdown-content.tsx` already configures Shiki). If a standalone Shiki helper exists, reuse it. If not, fall back to inline Shiki highlight call with `lang: "latex"`, `theme: { light: "github-light", dark: "github-dark" }`. Render with line numbers via Shiki transformer.

**Container:**

```tsx
<div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
  <pre className="
    mx-auto max-w-[720px]
    bg-white dark:bg-zinc-800
    rounded-md shadow-lg
    p-6 text-sm font-mono
    leading-relaxed
  " dangerouslySetInnerHTML={{ __html: highlighted }} />
</div>
```

Same paper-floating aesthetic as preview tab, but with code styling instead of serif.

### 4.4 `LatexToolbar`

**Responsibility:** tab toggle + copy + retry (when in error state).

**Props:** `{ activeTab, onTabChange, onCopy, copied, error?, onRetry? }`.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ [Preview │ Source]                          [Copy] [Retry?]  │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:** shadcn `Tabs/TabsList/TabsTrigger` for the toggle; existing `Copy/Check` icon swap pattern from `artifact-panel.tsx:546-562` for the copy button (2-second `Check` confirmation).

**Copy semantics:**
- On Preview tab: copy the rendered article's `innerText` (plain text, math represented as KaTeX-rendered text).
- On Source tab: copy the raw `content` source.

### 4.5 `transpiler.ts`

**Responsibility:** the existing `latexToHtml` function, refactored.

**Signature change:**

```ts
// Before
function latexToHtml(source: string): string

// After
function latexToHtml(
  source: string,
  registry: LabelRegistry,
): { html: string; warnings: string[] }
```

The `warnings` array carries unresolved `\eqref{}` keys, used for dev console logging. No behavioral change for content that doesn't use `\label`/`\eqref`.

The two existing single-line display-math branches retain their `i++` fix (already merged on `main` via `fix/latex-renderer-hang`). The refactor is structural only; the bug fix carries forward.

### 4.6 `theorem-envs.ts`

**Responsibility:** detect theorem-style envs in source, emit HTML.

**Public API:**

```ts
type TheoremKind =
  | "theorem" | "lemma" | "corollary" | "proposition"
  | "definition" | "example" | "remark" | "proof"

const THEOREM_KINDS: ReadonlySet<string>
const THEOREM_COLORS: Record<TheoremKind, string>  // "blue" | "indigo" | ...

function isTheoremBegin(line: string): { kind: TheoremKind, optionalName?: string } | null

function renderTheoremBlock(
  kind: TheoremKind,
  number: string | null,        // null for unnumbered (remark, proof)
  optionalName: string | undefined,
  innerHtml: string,
  anchorId: string | null,
): string
```

**Counter wiring:** counters live in the scan pass (`cross-refs.ts`), not here. This module just emits the markup given a number.

**Proof QED:** when `kind === "proof"`, `renderTheoremBlock` appends `<span class="latex-qed">∎</span>` to the body. CSS positions it right-aligned at the end of the last line.

### 4.7 `cross-refs.ts`

**Responsibility:** scan source for labels, build registry, resolve references.

**Public API:**

```ts
function scanLabels(source: string): LabelRegistry

function resolveRef(
  registry: LabelRegistry,
  key: string,
  variant: "ref" | "eqref",
): { displayText: string; anchorId: string } | null
```

**Scan pass implementation:** single regex scan for `\begin{<kind>}` ... `\end{<kind>}` blocks (theorem-family + equation-family), counting each occurrence per counter pool. When a `\label{<key>}` appears within a block, record it in the registry with the current counter value for that pool.

`\label{}` outside any numbered env is silently ignored (no anchor target).

**Performance:** scan is O(n) over source length, small constant. Registry construction is sub-millisecond for typical doc sizes (under 50 KiB).

---

## 5. Validator changes

`src/lib/tools/builtin/_validate-artifact.ts`:

1. Remove `\label`, `\ref`, `\eqref` from `LATEX_UNSUPPORTED_COMMANDS` (around L1221-1240).
2. Theorem envs (`theorem`, `lemma`, etc.) need to NOT be caught by the existing "unsupported environment" rule. Verify the current rule allows-or-rejects by env name; add the new envs to the allow list.
3. Add a soft-warning rule: if `\eqref{key}` appears but no matching `\label{key}` is in source, warn (not error). The renderer will show `[?]` at runtime, but the validator surfaces the issue at create-time so the LLM can self-correct.

---

## 6. Prompt module changes

`src/lib/prompts/artifacts/latex.ts`:

### 6.1 Remove from "Anti-Patterns" section

- `\label{...}` / `\ref{...}` / `\eqref{...}` — these are now supported.

### 6.2 New section: "Theorem Environments"

```
## Theorem Environments

Use these for formal mathematical statements. Each renders as a colored
vertical-bar accent block in the preview:

| Environment              | Counter pool | Color         |
|--------------------------|--------------|---------------|
| \begin{theorem}          | theorem      | blue          |
| \begin{lemma}            | theorem      | indigo        |
| \begin{corollary}        | theorem      | teal          |
| \begin{proposition}      | theorem      | sky           |
| \begin{definition}       | definition   | purple        |
| \begin{example}          | example      | amber         |
| \begin{remark}           | (unnumbered) | gray (italic) |
| \begin{proof}            | (unnumbered) | gray (∎ auto) |

Optional name in brackets:
  \begin{theorem}[Mean Value Theorem]
  ...
  \end{theorem}

Numbering is flat per pool: theorem/lemma/corollary share counter,
definition has its own, example has its own. Section-prefixed numbering
(e.g., "Theorem 1.2") is not supported in v1.
```

### 6.3 New section: "Cross-references"

```
## Cross-references

Mark numbered envs with \label{kind:key}, then refer with \eqref{} (for
equations, renders as "(1)") or \ref{} (for theorems etc., renders as
the bare number "1"):

  \begin{theorem}[Mean Value Theorem]
  \label{thm:mvt}
  Let f be continuous on [a,b]...
  \end{theorem}

  By \ref{thm:mvt}, there exists c such that
  \begin{equation}
  \label{eq:mvt}
  f(c) = \frac{1}{b-a}\int_a^b f(x)\,dx
  \end{equation}

  Substituting \eqref{eq:mvt} into the previous expression...

\eqref{} and \ref{} render as clickable links that smooth-scroll to
the target. Unresolved references render as red [?] — the validator
warns when this happens at create-time.
```

### 6.4 New example #4

A lecture-note style example demonstrating theorem + proof + cross-ref pattern. Roughly the "Mean Value Theorem with proof" structure shown in the spec.

---

## 7. Streaming and error handling

| Condition | Behavior |
|---|---|
| Streaming partial content | Paper skeleton (rectangular gray blocks at typical paragraph positions). Existing transpiler is already lenient — partial input renders best-effort. |
| Parser exception (caught in `useMemo`) | Existing amber callout with Retry + View Source buttons (kept verbatim). |
| KaTeX render error per-equation | Existing red inline `<code class="latex-error">` (kept). |
| Unresolved `\eqref{}` target | `[?]` red span at the reference site; transpiler emits a warning entry; root `LatexRenderer` surfaces a count-style toast on first parse ("3 unresolved references — see source for details") only in dev builds. Production: silent except for the inline `[?]`. |
| Empty content | Empty paper with a faint "Loading…" message centered. |

The toolbar's Retry button is rendered only when `error !== null`. Outside error state, the slot is empty.

---

## 8. Testing

### 8.1 Unit tests — `lib/transpiler.test.ts`

`latexToHtml` regression suite (currently zero coverage):

- **Bug fix regression**: `latexToHtml("$$x = y$$", emptyRegistry)` returns within 50ms (previously infinite-looped — bug fixed in `4b72c66`, locked in by this test).
- **Bug fix regression**: `latexToHtml("\\[x = y\\]", emptyRegistry)` returns within 50ms.
- **Sectioning**: `\section{Title}` produces `<h2>Title</h2>`.
- **Lists**: `\begin{itemize} \item a \item b \end{itemize}` produces `<ul><li>a</li><li>b</li></ul>`.
- **Math env preservation**: `\begin{align} a &= b \end{align}` survives to KaTeX rendering.

### 8.2 Unit tests — `lib/theorem-envs.test.ts`

- Each kind (8 envs) produces correct `<aside>` markup with the right color class.
- Optional name `\begin{theorem}[Pythagoras]` produces `Theorem N (Pythagoras).` header.
- Proof env auto-appends `∎`.
- Remark env is unnumbered (no header number).

### 8.3 Unit tests — `lib/cross-refs.test.ts`

- Single label scan: `\begin{theorem} \label{thm:foo} ... \end{theorem}` registers `thm:foo` → `{ kind: "theorem", number: "1", anchorId: "thm-foo" }`.
- Counter sharing: theorem(1), lemma(2), corollary(3), proposition(4) all increment the same pool.
- Counter independence: definition(1) does not increment with theorem(1) — they're separate pools.
- `\eqref{eq:foo}` resolves to `(1)` link with `href="#eq-foo"`.
- `\ref{thm:foo}` resolves to bare `1` link with `href="#thm-foo"`.
- Unknown ref: `\eqref{eq:nonexistent}` resolves to `null`; transpiler emits warning entry.

### 8.4 Component tests — `latex-paper-view.test.tsx`

- Tab toggle switches active view (verify by querying for distinct DOM markers in Preview vs Source).
- Click on `[data-eqref]` link calls `scrollIntoView` (mocked).
- Copy button copies expected text (mocked clipboard).

### 8.5 No E2E tests in this slice

Integration with the artifact panel (streaming placeholder, version restore, panel chrome) is covered by existing artifact panel E2E tests. The redesign is renderer-internal.

---

## 9. Integration with existing chrome

- **Panel header** (`artifact-panel.tsx`): no change. Type badge, version nav, copy, download remain as is.
- **Streaming placeholder**: same `streaming-${toolCallId}` id pattern. Renderer's existing leniency carries over.
- **RAG indexing**: no change. `resolveTextToEmbed` reads the raw `content` string (LaTeX source), not the rendered HTML.
- **Validator pipeline**: still gated through `validateArtifactContent("text/latex", content, ctx)`. The validator's allow-list expands but the entry point and contract are unchanged.
- **Artifact registry**: `text/latex` registry entry unchanged. Label / shortLabel / icon / color / extension all preserved. The renderer file path moves but the import in `artifact-renderer.tsx:101` is updated.

---

## 10. Out of scope (deliberate)

- **PDF export** — Path A from the strategy discussion. This redesign is renderer-only. PDF export is a follow-up that reuses the print-mode CSS surface this redesign establishes.
- **Tables (`\begin{tabular}`)** — stays banned. Add later if/when print export materializes and tables become a real need.
- **TikZ, `\includegraphics`, `\bibliography`, `\cite`** — stay banned. The architecture choice (KaTeX + transpiler) does not support these; supporting them would require a real LaTeX engine.
- **In-panel editing** — artifact contract: all types are view-only in panel.
- **Section-prefixed theorem numbering** (`Theorem 1.2`) — flat numbering only in v1. Section tracking can be added later without breaking existing behavior.
- **TOC sidebar** — can be added as a follow-up if user demand surfaces.

---

## 11. Effort estimate

| Phase | LoC | Time |
|---|---|---|
| Directory restructure + tabs + paper-view shell | ~290 | ~½ day |
| Theorem envs parser + CSS theming | ~200 | ~½ day |
| Cross-refs (scan + resolve) + validator update + prompt update | ~150 | ~½ day |
| Tests (transpiler regression + theorem + cross-refs + paper-view) | ~150 | ~¼ day |
| **Total** | **~790 LoC** | **~1.75 days** |

---

## 12. Migration & rollout

- Single PR (or single feature branch with multiple atomic commits).
- No DB migration needed.
- No breaking change for existing `text/latex` artifacts: their content is still valid LaTeX, will render through the new pipeline with the same output for content that doesn't use the new features.
- Existing `text/latex` artifacts that included `\label{}` or `\eqref{}` (which the validator previously rejected on create but might exist if pasted via update) will now resolve — net win.
- Prompt update should not invalidate any existing artifact's content.

---

## 13. Acceptance criteria

The redesign is done when:

- [ ] `/dashboard/chat` opens a `text/latex` artifact and shows a white paper floating on a dark canvas with serif body typography.
- [ ] Toolbar shows Preview/Source tabs; switching tabs is instantaneous (no re-parse).
- [ ] Source tab shows Shiki-highlighted LaTeX with line numbers.
- [ ] `\begin{theorem}...\end{theorem}` renders as a blue vertical-bar block with `Theorem N.` header.
- [ ] `\begin{proof}...\end{proof}` renders as a gray vertical-bar block with `Proof.` header and `∎` at the end of the body.
- [ ] All 8 theorem envs render with their assigned color from §3.3.
- [ ] `\begin{align}` produces equation numbers on the right; `\begin{align*}` does not.
- [ ] `\eqref{eq:foo}` renders as a clickable link `(N)` that smooth-scrolls to the target equation.
- [ ] `\ref{thm:foo}` renders as a clickable link `N` that smooth-scrolls to the target theorem.
- [ ] Unknown `\eqref{}` target renders as red `[?]`; validator warns at create-time.
- [ ] Single-line `$$x = y$$` does not hang the panel (regression test for the bug fixed in `4b72c66`).
- [ ] Dark mode: container is dark, paper stays white, KaTeX math stays readable.
- [ ] All tests in §8 pass.
- [ ] Type check (`bun typecheck` or equivalent) passes.

---

## 14. Open questions for spec review

None at this stage — all material decisions were resolved in the brainstorming dialogue. Optional follow-ups (section-prefixed numbering, TOC sidebar, `\href` rendering polish) are documented as out-of-scope and can be picked up separately.
