# Artifact Capabilities — per-type spec

> **Audience:** anyone deciding "which artifact type should I (or my LLM)
> use for X?", or implementing a new capability for an existing type.
> Each section is self-contained.
>
> **Last regenerated:** 2026-04-30, post text/document AST cleanup +
> RAG indexer artifactType plumbing + sheet `note` themability, pinned
> to commit `68b9d66`. Replaces all prior versions. Reflects commits
> since `a81c343`: `b23e06f` (RAG indexer takes `artifactType`),
> `b3e6cdf` (sheet `note` themable + `formatCellValue` dropped),
> `f738130`/`a05f802` (AST source residue + env-var/test cleanup),
> `6a019db` (Prisma `documentFormat` column drop).
>
> Companion docs:
> - [`artifacts-deepscan.md`](./artifacts-deepscan.md) — system flow.
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit.

---

## Decision matrix — which type for what?

| User intent | Type | Why |
|-------------|------|-----|
| Interactive page, calculator, dashboard, game | `text/html` | Tailwind v3 + JS in sandboxed iframe |
| Custom UI component with React/Recharts/Lucide | `application/react` | Babel transpile + iframe runtime |
| Logo, icon, simple graphic | `image/svg+xml` | Inline SVG, sanitized |
| Flowchart, sequence, ER, mindmap, Gantt | `application/mermaid` | Mermaid → SVG |
| README, technical docs, articles, reports | `text/markdown` | GFM + KaTeX + mermaid + Shiki |
| Formal deliverable (proposal, white paper, contract) | `text/document` | docx-js script → server-rendered PNG carousel + DOCX download |
| Source code (any language) for copy-paste | `application/code` | Shiki-highlighted, no execution |
| CSV table or spreadsheet with formulas | `application/sheet` | CSV preview or v1-spec workbook with charts |
| Math-heavy explainer with proofs | `text/latex` | KaTeX subset |
| Slide deck (presentation) | `application/slides` | JSON deck → live preview + PPTX export |
| Runnable Python (data munging, plotting) | `application/python` | Pyodide in browser |
| 3D scene | `application/3d` | React-Three-Fiber sandbox |

When two types could work, the rule of thumb:

- **Read** vs. **interact**: readers → `text/markdown` or `text/document`;
  clickers → `text/html` or `application/react`.
- **Display code** vs. **run code**: `application/code` is read-only;
  `application/python` actually runs.
- **Casual write-up** vs. **deliverable**: `text/markdown` is the README
  path; `text/document` is the printed-and-archived path.
- **Tabular data** vs. **slides**: `application/sheet` for grids/charts
  the user might re-sort or download as XLSX; `application/slides` for
  narrative decks.

---

## Common contracts (apply to every type)

All twelve types share these guarantees:

- **Hard size cap**: 512 KiB persisted content (`MAX_ARTIFACT_CONTENT_BYTES`).
  Enforced by `Buffer.byteLength` in `create-artifact.ts:58-69` and
  `update-artifact.ts:51-65`.
- **Server-side validation** before persist via
  `validateArtifactContent(type, content, ctx?)` — fails the tool call
  with `validationErrors` so the LLM can self-correct.
- **5-second wall-clock timeout** on validation (`VALIDATE_TIMEOUT_MS`).
- **`ValidationContext.isNew = true`** is set on `create_artifact`,
  omitted on `update_artifact`. `validateMarkdown` (128 KiB cap) and
  `validateSlides` (`image-text` deprecation hard error) are the only
  validators that read it. The interface has no other fields — the prior
  `documentFormat` discriminant was removed when AST mode went away.
- **Optimistic locking** on update via `prisma.document.updateMany` keyed
  on `updatedAt`.
- **Versioning**: `MAX_VERSION_HISTORY = 20` entries, FIFO eviction with
  accumulated `evictedVersionCount`. Versioned S3 key shape `<key>.v<N>`.
  Inline fallback when archive upload fails: ≤ 32 KiB inline, > 32 KiB
  marker `{ archiveFailed: true }`.
- **RAG indexing**: fire-and-forget after both LLM tool persistence and
  HTTP PUT (N-1 fixed). All current callers pass `artifactType` to
  `indexArtifactContent` (`b23e06f`) so the indexer skips its prior
  per-call DB round-trip (D-7 partially closed). Failures patch
  `metadata.ragIndexed = false` instead of throwing.
- **Full delete**: canonical S3 key, all versioned S3 keys, RAG chunks,
  Postgres row.
- **Session delete**: cascades into all of the above (N-47 fixed —
  `findArtifactsBySessionId` selects `metadata` so the cascade can
  flatten versioned keys).
- **`text/document` exposes `.docx` + `.pdf`** via a split-button (the
  prior `.md` option was dropped). Both go through the same server
  endpoint which routes through `getOrComputeDocx` (process-local
  cache + single-flight via `withRenderSlot`); PDF additionally pipes
  through `soffice --convert-to pdf`. Every other type uses a single
  Download button.
- **No in-panel editing**. Preview is view-only across every type
  (post panel-chrome overhaul). Updates go through `update_artifact`
  tool, the HTTP PUT endpoint, or version restore. (The legacy
  `/edit-document` POST endpoint was deleted in `6c1dd82` — orphan
  since the UI modal was removed in `0b25e56`.)
- **Streaming placeholders** with id `streaming-${toolCallId}`. The
  `sendMessage` catch block iterates `createdStreamingIds` and
  `preStreamSnapshots` to clean up on abort/error.

`hasCodeTab` lives on each registry entry. Post panel-chrome overhaul
**there is no code tab in the panel** for any type — the flag now only
informs renderer-internal decisions (e.g. whether the StreamdownContent
fallback shows fenced code).

---

## 1. `text/html` — HTML Page

**Default for:** interactive widgets, marketing pages, calculators,
dashboards with vanilla JS state.

### Capabilities

- Tailwind CSS v3 (auto-injected from CDN — do not re-add).
- Inter font via Google Fonts (manual link).
- `localStorage` inside iframe.
- Inline `<script>` IIFE or DOMContentLoaded.
- `unsplash:keyword` in `src` attributes — server-resolved post-validation.
- `alert()` / `confirm()` / `prompt()` work (sandbox includes
  `allow-modals` — D-26).

### Boundaries

- **Sandbox**: `sandbox="allow-scripts allow-modals"` (`html-renderer.tsx:128`).
- No external `fetch()` to real APIs.
- No `window.open()`, `location.*`, `history.*`. Nav blocker
  (`_iframe-nav-blocker.ts`) intercepts.
- No `<form action="...">` (sandbox-blocked + validator hard error).
- No external image URLs (use `unsplash:keyword` instead).
- No second Tailwind CDN script tag.
- ≤ 2 fonts, ≤ 5 colors.
- Inline `<style>` ≤ 10 non-blank lines (validator: warning; prompt: rule).
- No emoji as functional icons.

### Schema

```html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Required non-empty</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <h1>Single h1 per document</h1>
  <main>...</main>
  <script>
    (function () { /* IIFE state */ })();
  </script>
</body>
</html>
```

### Renderer

`html-renderer.tsx`. Theme: not synced (iframe is its own document).
Loading state: spinner cleared on `onLoad`; 5 s `slowLoad` warning.
Restoration loop guarded by `restoring` ref to prevent infinite triggers.

---

## 2. `application/react` — React Component

**Default for:** custom React components, dashboards with Recharts,
animated UIs with framer-motion, icon-rich layouts using Lucide.

### Capabilities

Window globals (no imports needed): `React` + all hooks, `Recharts` v2,
`LucideReact` 0.454, `Motion` (framer-motion v11), Tailwind v3.
Imports allowed (preprocessor strips them — globals preferred): `react`,
`react-dom`, `recharts`, `lucide-react`, `framer-motion`.

### Boundaries

- **Sandbox**: `sandbox="allow-scripts"` only (`react-renderer.tsx:588`).
  No `allow-modals` (tighter than HTML).
- No imports outside the whitelist.
- No `class extends React.Component`.
- No `document.getElementById` / `querySelector`.
- No CSS imports (`import './styles.css'`).
- No shadcn/ui.
- No real `fetch()` / `window.open` / `location.href`.
- No `<form action="...">` — use `onSubmit + e.preventDefault()`.
- ≤ 3 font families, ≤ 5 distinct hues.
- **Required directive on line 1**: `// @aesthetic: <direction>`. 7 valid
  directions: `editorial | brutalist | luxury | playful | industrial |
  organic | retro-futuristic`. Hard error when env
  `ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"`.

### Directive grammar

```
// @aesthetic: editorial          ← line 1, REQUIRED
// @fonts: Inter:wght@400;700 | Playfair Display:wght@600  ← line 2, OPTIONAL
import React, { useState } from 'react'
import { Bell } from 'lucide-react'
export default function App() {
  ...
}
```

`MAX_FONT_FAMILIES = 3` (`_react-directives.ts:54`). `FONT_SPEC_REGEX`
(L110) rejects URL-injection chars. Template-literal hiding (L95-L98)
prevents false import matches inside strings.

### Renderer

`react-renderer.tsx`. Babel standalone transpiles in-iframe.
`window.react = window.React` aliases the lowercase name so Recharts'
peer-dep check passes (L267). postMessage handler is source-checked
against `iframeRef.current?.contentWindow` (L454-L467). `setError` lives
in `useEffect` (L414-L427) — not in `useMemo`.

---

## 3. `image/svg+xml` — SVG Graphic

**Default for:** logos, icons, illustrations, diagrams that don't need
Mermaid syntax, decorative patterns.

### Capabilities

- All SVG presentation attrs (`fill`, `stroke`, `stroke-width`, `opacity`,
  `transform`).
- `<defs>` with gradients, patterns, `<use>` for reuse.
- SMIL animation (`<animate>`, `<animateTransform>`) when explicitly
  requested.
- `<text>` for labels.
- `#fragment` `href` references only.

### Boundaries

- Sanitized by DOMPurify (`USE_PROFILES: { svg: true, svgFilters: true }`,
  `ADD_TAGS: ["use"]`). DOMParser pre-validation surfaces parse errors.
- `<script>`, `<foreignObject>`, `<style>` blocks → hard errors.
- External `href` / `xlink:href` to `http(s):` or `data:` → hard error.
- Event handlers (`onclick`, etc.) → hard error.
- Hardcoded `width=` / `height=` on root `<svg>` → hard error (breaks
  responsive scaling).
- Missing `viewBox` / `xmlns` → hard error.
- Path coordinates: prompt says "round to 1 dp max"; validator warns at
  3+ dp (D-17).

### Schema

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" role="img" aria-labelledby="title-id">
  <title id="title-id">Description</title>
  ...
</svg>
```

### Renderer

`svg-renderer.tsx`. **No iframe** — renders inline via
`dangerouslySetInnerHTML`. Container scales: `[&>svg]:max-w-full
[&>svg]:h-auto`.

---

## 4. `application/mermaid` — Mermaid Diagram

**Default for:** flowcharts, sequence diagrams, ER schemas, state
diagrams, class diagrams, Gantt charts, mindmaps, gitGraphs, pies,
journeys, quadrant charts.

### Capabilities

Mermaid v11. Primary types (11): flowchart, sequenceDiagram, erDiagram,
stateDiagram-v2, classDiagram, gantt, mindmap, gitGraph, pie, journey,
quadrantChart.
Secondary: timeline, sankey-beta, xychart-beta, block-beta, kanban,
C4Context, requirementDiagram, architecture-beta.
**Validator additionally accepts** (not in prompt — D-13): `graph`,
`stateDiagram` (alongside `stateDiagram-v2`), `packet-beta`,
`C4Container`, `C4Component`, `C4Deployment`. The shared
`MERMAID_DIAGRAM_TYPES_SHARED` constant in
`lib/rendering/mermaid-types.ts:14-40` has **25 entries**, imported by
the validator at `_validate-artifact.ts:31` and aliased locally at
L1321. The 25-vs-19 count drift is now closed at the type-system
level. **Residual prompt-side gap (D-13) and stale validator error
prose at L1384 still references 19 types (D-77).**

### Boundaries

- Markdown fences → hard error.
- Missing diagram type on first non-empty line → hard error.
- `%%{init: {'theme':...}}%%` overrides → warning (breaks dark mode).
- `click NodeId call fn()` / `click NodeId href` → silently accepted by
  validator, but blocked at runtime (`securityLevel: "strict"`).
- `classDef` styling: max 3 highlight colors.
- Labels: `<br/>` only.
- Flowchart > 15 nodes → warning (heuristic; only fires for
  flowchart/graph, not for erDiagram/classDiagram).
- > 3000 chars → warning.

### Renderer

`mermaid-renderer.tsx`. Theme synced via `next-themes`
(`resolvedTheme === "dark"` → mermaid `"dark"`, else `"default"`).
Module-level `mermaidPromise` + `lastInitTheme` cache means
`mermaid.initialize()` fires only on theme change. Init options come
from the shared `mermaid-config.ts` (`securityLevel: "strict"`,
`theme: "base"`, `themeVariables` derived from design tokens).

---

## 5. `text/markdown` — Markdown

**Default for:** READMEs, technical articles, tutorials with math/code,
casual write-ups.

### Capabilities

Renderer: Streamdown (react-markdown wrapper) with GFM. Supported:

- GFM tables (`|---|---|`).
- Shiki fenced code blocks (must tag language).
- KaTeX inline (`$...$`) and display (`$$...$$` / `\[...\]`) math.
- Mermaid fenced blocks (rendered through Streamdown's own pipeline —
  separate from `mermaid-config.ts`, D-25).
- Task lists (`- [ ]`, `- [x]`).
- Strikethrough.
- Clickable links.
- Images via absolute URLs.

### Boundaries

- New artifacts: 128 KiB hard cap (`MARKDOWN_NEW_CAP_BYTES`). **The
  prompt does NOT mention this — D-15.** LLM cannot self-check.
- Raw HTML in `RAW_HTML_DISALLOWED` (10 entries, verified verbatim):
  `<details>`, `<summary>`, `<kbd>`, `<mark>`, `<iframe>`, `<video>`,
  `<audio>`, `<object>`, `<embed>`, `<table>` → validator warns.
- `<script>` is checked separately via env
  `ARTIFACT_STRICT_MARKDOWN_VALIDATION` — warning by default, hard
  error when env is `"true"`. Not part of `RAW_HTML_DISALLOWED`.
- More than one `# H1` → warning.
- Skipping heading levels → warning.
- Code fences without language tag → warning.

### Renderer

`StreamdownContent` (no iframe). Code blocks use Shiki with a dual
light/dark theme. Mermaid blocks use Streamdown's internal mermaid
integration — does **not** call `getMermaidConfig`. KaTeX math via
plugins.

---

## 6. `text/document` — Document

**Default for:** formal deliverables (proposals, white papers, reports,
contracts) where DOCX export and printable layout matter.

**Single format only** (post `a81c343` + `20260429100656_drop_document_format`).
Content is an ES module JS script using the `docx` package. The prior
AST mode and its `documentFormat` discriminant column were both
removed.

### Schema — docx-js script

ES module JS using the `docx` package. Allowed named exports: Document,
Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
InternalHyperlink, Bookmark, FootnoteReferenceRun, PositionalTab (+
PositionalTabAlignment / RelativeTo / Leader), TabStopType,
TabStopPosition, Column, SectionType, TableOfContents, HeadingLevel,
BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber,
PageBreak, Packer.

Required suffix:

```js
Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
```

### Boundaries

- No JSON output, no markdown fences.
- No `require()`. Imports only from `"docx"`.
- No `fs`, `path`, `http`, `child_process`.
- No `new TableOfContents()` (LibreOffice won't fill it — use manual
  dot-leader paragraphs).
- No `WidthType.PERCENTAGE`, no `ShadingType.SOLID`, no standalone
  `new PageBreak()`.

### Validator

`validateDocument` (`_validate-artifact.ts:169-173`) is a thin async
wrapper: dynamic-imports `@/lib/document-script/validator` (a single
flat file, 41 LoC) and returns its `{ ok, errors }`. The validator
itself runs TS syntax check (TypeScript `createSourceFile` AST parse,
L9-L26) + sandbox dry-run (`DRY_RUN_TIMEOUT_MS = 5000`, L7) + `.docx`
magic-byte check (PK header `[0x50, 0x4b, 0x03, 0x04]`, L6).
**`validateDocument`'s signature does not accept a `ctx` parameter**
(D-46) — it is the only entry in the `VALIDATORS` map whose shape is
`(content) => …` rather than `(content, ctx?) => …`.
`ValidationContext.isNew` cannot be plumbed into it without a
signature change.

### Renderer

`document-script-renderer.tsx` (210 LoC). Panel routes `text/document`
directly to this component (`artifact-panel.tsx:696-708`); the generic
`ArtifactRenderer` no longer has a case for this type. Server fetches
`/render-status` for `{ hash, pageCount, cached }`, then renders a PNG
carousel using `/render-pages/[contentHash]/[pageIndex]`. While
streaming, shows a faded `CodeView` with a "Generating script…" spinner
— no fetch fires. Keyboard navigation guarded against text-entry focus.
**No retry button on error (D-11).** Imports cleanly from `@/lib/icons`
at L3 — the prior direct `lucide-react` import is gone. **D-28 has
relocated to `artifact-panel.tsx:18`** (`Maximize`, `Minimize` still
direct from lucide-react).

### Download

`GET /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download`.
Accepts `?format=docx` (default) and `?format=pdf`. Server routes both
through `getOrComputeDocx` (process-local cache + single-flight via
`withRenderSlot`); the PDF branch additionally pipes the cached DOCX
buffer through `docxToPdf` (soffice). D-3 + NEW-D-96 closed.

### Edit flow

The `/edit-document` POST endpoint was deleted in `6c1dd82` — orphan
since the UI modal was removed in `0b25e56`. To edit a `text/document`
artifact, regenerate via `update_artifact` tool, the HTTP PUT
endpoint, or restore a previous version. D-4, D-54, D-55, D-71 are
MOOT.

---

## 7. `application/code` — Code

**Default for:** sharing code snippets that should NOT execute, in any
language.

### Capabilities

Any language. Canonical Shiki names: typescript, tsx, javascript, jsx,
python, rust, go, java, csharp, cpp, c, ruby, php, swift, kotlin, sql,
bash, shell, yaml, json, toml, dockerfile, html, css, scss, markdown.

### Boundaries

- `language` parameter REQUIRED on `create_artifact`. **The validator
  does not check it (D-18)** — wrong/missing language silently passes.
- Markdown fence wrapping → hard error.
- HTML document content (`<!DOCTYPE html>` / `<html`) → hard error.
- Truncation markers (`...`, `// ...`) → warnings.
- Placeholder bodies (`pass`, `todo!()`, `throw new Error("not implemented")`,
  `unimplemented!()`) → warnings.
- 512 KiB → warning.

### Renderer

Routed to `StreamdownContent` with adaptive fence length:
`max(3, longestRun + 1)` where `longestRun` is the longest backtick run
in `content` (`artifact-renderer.tsx:114-127`). Prevents content with
nested triple-backticks from breaking syntax highlighting.

---

## 8. `application/sheet` — Spreadsheet

**Default for:** tabular data, CSV exports, spreadsheets with formulas,
data ready for chart visualisation.

### Capabilities

Three accepted shapes:

- **Shape A — CSV**: standard CSV. First row = headers.
- **Shape B — JSON array of objects**: `[{ "col": value, ... }, ...]`.
- **Shape C — JSON spec**: `{ kind: "spreadsheet/v1", theme?,
  namedRanges?, sheets: SheetSpec[], charts?: ChartSpec[] }`.

#### Shape C details

- `SheetSpec`: `{ name, columns?, frozen?, cells: CellSpec[], merges? }`.
- `CellSpec`: `{ ref, value?, formula?, format?, style?, note? }`.
- Cell `style`: `"header" | "input" | "formula" | "cross-sheet" |
  "highlight" | "note"`.
- Format strings: Excel number-format notation.
- Named ranges: `"SheetName!A1:B5"` or `"A1:B5"` for same sheet.
- Charts (`ChartSpec`): types `bar`, `line`, `area`, `pie`. `stacked: true`
  for bar/area. `categoryRange` and `series[].range` use single-row /
  single-column A1 ranges.

### Boundaries

- Wrong `kind` → hard error.
- Cell with both `value` and `formula` → hard error.
- Circular references → hard error (`evaluateWorkbook` runs full DAG).
- REF / NAME errors in formulas → hard error.
- Duplicate refs / sheet names → hard error.
- Sheet names with `!:*?/\[]` → hard error.
- Caps (hard errors via `parseSpec`):
  - 8 sheets max
  - 500 cells per sheet
  - 200 formulas per workbook
  - 64 named ranges
  - 8 charts
- CSV with mismatched column counts → hard error.
- JSON array with mismatched keys → hard error.
- Nested values in JSON array, > 100 rows, > 10 cols, currency symbols /
  thousand separators in CSV, mixed date formats → warnings.

### Renderer

`sheet-renderer.tsx` → `detectShape(content)` →
- spec → lazy `SpecWorkbookView` (`sheet-spec-view.tsx`)
- csv/array → `CsvOrArrayView` (TanStack Table + Search)

`SpecWorkbookView` provides Excel-feel chrome:
- `SheetFormulaBar` at top (Name Box + ƒx + formula display).
- Optional **Data/Charts toggle** rendered only when
  `spec.charts.length > 0`. Resets to `"data"` on content change.
- Sticky corner cell, A/B/C column letters with active-column blue
  highlight, sticky row gutter, frozen borders.
- Cells: click → `selectedRef`; selected cell `outline outline-2
  outline-blue-600`; `highlight` style `bg-yellow-200/80`; error
  `text-red-600` + `#ERR!`.
- Bottom sheet tabs reset `selectedRef` on switch but **share `view`
  state across sheets** (D-20).

`SheetChartView` dispatches to Recharts: `BarChart` (with `stackId`),
`LineChart` (`type="monotone"`, `strokeWidth={2}`), `AreaChart`
(`fillOpacity={0.4}`), `PieChart`. Pie has `fillOpacity={1 - i * 0.1}`
which floors at 0 (D-19 — bug at 11+ slices). Empty rows render
empty-state card.

XLSX download is in the panel header only — no in-sheet button (commit
4d3d199). XLSX export does **not** emit chart objects (D-64) — charts
exist only in the browser preview.

**Theming.** `note` cell color is now fully themable end-to-end (post
`b3e6cdf`): `SpreadsheetTheme.noteColor?` (`spreadsheet/types.ts:58`)
with default `"#666666"` (L67). HTML preview reads it via
`styles.ts:54` (`fontColor: t.noteColor`); XLSX export reads it via
`generate-xlsx.ts:138` (`hexToArgb(theme.noteColor)`). **D-65 closed.**
The `formatCellValue` helper that previously lived in `styles.ts` was
also dropped by the same commit; the live grid uses
`format.ts.formatNumber` (`numfmt` wrapper) exclusively.

---

## 9. `text/latex` — LaTeX / Math

**Default for:** math-heavy explanations, proofs, lecture notes, formal
formula reference cards.

### Capabilities

Subset of LaTeX rendered by KaTeX:

- Math: `$...$` inline, `$$...$$` / `\[...\]` display.
- Math envs: equation/*, align/*, gather/*, multline/*, cases,
  eqnarray/* (starred + unstarred).
- Inside math: matrix, pmatrix, bmatrix, vmatrix, Vmatrix, Bmatrix,
  array, cases, aligned, gathered, split.
- `\newcommand`, `\renewcommand`, `\def`.
- Document structure: `\section`, `\subsection`, `\subsubsection`,
  `\paragraph`, itemize, enumerate, quote, abstract.
- Text: `\textbf`, `\textit`/`\emph`, `\underline`, `\texttt`.
- `\href` / `\url` (KaTeX trust callback restricts to `https?://`).

### Boundaries

Hard errors: `\documentclass`, `\usepackage`, `\begin{document}`,
`\includegraphics`, `\bibliography`, `\cite`, `\input`, `\include`,
`\begin{tikzpicture}`, `\begin{figure}`, `\begin{table}`,
`\begin{tabular}`.

Warnings: `\begin{verbatim}`, `\verb`, `\label{}`, `\ref{}`, `\eqref{}`,
no math delimiter (use markdown instead).

`\maketitle` is forbidden by the prompt but not checked by the validator
— renders as nothing silently.

### Renderer

`latex-renderer.tsx`. KaTeX with `trust` callback
(`isKatexCommandAllowed`) restricting `\href`/`\url` to `https?://` URLs
only. Balanced-brace scanner (`readBracedArg`) handles nested `{}` and
`\{`/`\}` escaping. `dangerouslySetInnerHTML` into a `prose
dark:prose-invert` container.

---

## 10. `application/slides` — Slides

**Default for:** narrative slide decks, pitch decks, technical-overview
presentations.

### Capabilities

**18 layouts** in `SLIDE_LAYOUTS` Set (verified verbatim): `title`,
`content`, `two-column`, `section`, `quote`, `image-text` (deprecated),
`closing`, `diagram`, `image`, `chart`, `diagram-content`,
`image-content`, `chart-content`, `hero`, `stats`, `gallery`,
`comparison`, `features`. The deprecated `image-text` is in the set —
it errors on `isNew`, warns otherwise.

Chart types: `bar`, `bar-horizontal`, `line`, `pie`, `donut`. (Note:
`area` is allowed in spreadsheet charts but NOT in slides charts —
cross-validator inconsistency worth noting.)

`unsplash:keyword` allowed in `imageUrl`, `backgroundImage`,
`quoteImage`. `{icon:name}` inline syntax for Lucide icons in text
fields.

### Boundaries

#### Hard errors (per-layout required fields)

- `title` / `hero` → `title`.
- `quote` → `quote`.
- `two-column` → `leftColumn`, `rightColumn`.
- `diagram` / `diagram-content` → `diagram`.
- `image` / `image-content` → `imageUrl`.
- `chart` / `chart-content` → `chart` with valid type.
- `hero` → `backgroundImage`.
- `stats` → `stats[]` with `value`, `label`.
- `gallery` → `gallery[]` with `imageUrl`.
- `comparison` → `comparisonHeaders`, `comparisonRows`.
- `features` → `features[]` with `icon`, `title`.

#### Warnings (D-14 — prompt presents as MUSTs but validator only warns)

- First slide ≠ `title`.
- Last slide ≠ `closing`.
- < 7 or > 12 slides.
- < 3 distinct layouts in ≥ 5-slide deck.
- Bright primaryColor (prompt forbids; validator does not enforce).
- > 6 bullets per slide; bullets > 10 words.
- Markdown syntax in text fields (validator checks `title, subtitle,
  content, quote, attribution, note` — NOT `bullets[]`).

### Schema

```json
{
  "theme": { "primaryColor": "#hex", "secondaryColor": "#hex", "fontFamily": "..." },
  "slides": [
    { "layout": "title", "title": "..." },
    { "layout": "content", "title": "...", "bullets": ["...", "..."] },
    ...
  ]
}
```

6 approved primaryColor hexes + 6 approved secondaryColor hexes (per
prompt).

### Renderer

`slides-renderer.tsx`. Iframe with `sandbox="allow-scripts"` only
(post-tightening). postMessage source-checked. Keyboard navigation
scope-guarded against text entry. Navigation bar with chevron + counter;
dot strip when `1 < totalSlides ≤ 20`.

---

## 11. `application/python` — Python Script

**Default for:** runnable data-science snippets, plotting, math
demonstrations, simulation.

### Capabilities

Pyodide v0.27.x (Python 3.12). Auto-loaded packages: numpy, matplotlib,
pandas, scipy, sympy, networkx, scikit-learn (sklearn), pillow (PIL),
pytz, dateutil, regex, bs4, lxml, yaml.

Stdlib whitelist: math, statistics, random, itertools, functools,
collections, heapq, bisect, json, re, datetime, decimal, fractions,
hashlib, textwrap, string, typing, dataclasses, enum.

Output via `print()` and `plt.show()`. PNG output via matplotlib is
captured to `__plot_images__` (worker monkey-patches `plt.show` once at
init).

### Boundaries

#### Hard errors

Forbidden imports in `PYTHON_UNAVAILABLE_PACKAGES` (15 entries,
verified): requests, httpx, urllib3, flask, django, fastapi, sqlalchemy,
selenium, tensorflow, torch, keras, transformers, cv2, pyarrow, polars.

`input()`. `open()` in **write modes only** (`w`, `a`, `x`, `b+`).
Markdown fences.

#### Warnings

Missing `print()` / `plt.show()`. `time.sleep` > 2 s. `while True`
without break.

#### Prompt-only (NOT validator-enforced)

- All `open()` (including read mode — D-16).
- threading, multiprocessing, subprocess.
- File system reads.
- Runtime > 10 s.

### Schema

Standard Python with structure imports → constants → helpers → `main()`
→ `if __name__ == "__main__": main()`. Type hints + docstrings expected.

### Renderer

`python-renderer.tsx`. **No iframe** — Pyodide runs in an inline Web
Worker. Worker source is an embedded string; Blob URL revoked
immediately after `new Worker(url)`. Pre-loaded packages: numpy,
micropip, matplotlib, scikit-learn. `plt.show` monkey-patched at init.
Output panel with responsive `max-h`. "Fix with AI" error banner when
`onFixWithAI` prop is wired. Code display uses **hardcoded triple-
backtick fence** (D-27 — content with nested triple-backticks would
break Streamdown rendering).

---

## 12. `application/3d` — R3F 3D Scene

**Default for:** 3D scenes, animated geometric primitives, glTF model
viewers.

### Capabilities

React 18.3.1 hooks (same set as React prompt). THREE namespace 0.170.0.
`useFrame` / `useThree` (fiber 8.17.10). 19 drei helpers: useGLTF,
useAnimations, Clone, Float, Sparkles, Stars, Text, Center, Billboard,
Grid, Html, Line, Trail, Sphere, RoundedBox, MeshDistortMaterial,
MeshWobbleMaterial, MeshTransmissionMaterial, GradientTexture.

**Wrapper provides** (do NOT include in your code): `<Canvas>`,
`<ambientLight>`, `<directionalLight>`, `<Environment>`,
`<OrbitControls>`, `<Suspense>`.

Verified glTF model URLs: KhronosGroup glTF samples (20 models),
three.js examples via jsDelivr (6 models).

### Boundaries

#### Hard errors

`<Canvas>`, `<OrbitControls>`, `<Environment>`, `document.*`,
`requestAnimationFrame`, `new THREE.WebGLRenderer`, missing
`export default`, markdown fences.

#### Warnings

Imports from non-whitelisted packages or non-whitelisted symbols from
react / three / fiber / drei.

#### Prompt-only

Model URLs not from verified CDN lists. Allocating `new THREE.*` inside
`useFrame` (perf). Building real-world objects from primitives.

### Schema

```jsx
export default function Scene() {
  return (
    <group>
      ...
    </group>
  )
}
```

No `<Canvas>` in return. Imports stripped by sanitizer; deps injected
as function arguments.

### Renderer

`r3f-renderer.tsx` (633 LoC). Iframe **without** `sandbox` attribute
(WebGL needs GPU access — comment at L580-L581). postMessage
source-checked at L544 (`event.source !== iframeRef.current?.contentWindow`).
`didReadyRef` (`useRef(false)`, L525) replaces prior closure-local
`let`, reset on content change (L529-L533) so rapid swaps don't
trigger false-positive 20 s timeouts (L562-L566). Bundle delivered via
importmap (esm.sh) inside srcdoc; Babel standalone via unpkg. Scene
code passed as JSON inside
`<script id="scene-data" type="application/json">` to avoid
HTML-escaping issues. WebGL errors detected via `isWebGLError()`
keyword sniff and routed to a `WebGLHelpOverlay` instead of generic
error UI (L437-L507).

**`<color attach="background">` is now explicitly preserved** by
`sanitizeSceneCode` (L118-L123 with explanatory comment): "User-
specified `<color attach="background">` is kept by the renderer." The
prior silent stripping is gone. **D-29 is closed at the renderer**;
the prompt still does not document this — silent pass on the LLM side.

**Label drift (D-68).** Registry exports `label = "3D Scene"` and
`shortLabel = "R3F Scene"` (`registry.ts:177`). The prompt module
exports `label = "R3F 3D Scene"` (`prompts/artifacts/r3f.ts:4`).
Three different strings for the same type across three surfaces.
`CANVAS_TYPE_LABELS` and the panel chrome surface different copy
depending on which source they read. Cosmetic; no functional break.

---

## Sandbox + render pipeline depth

The `text/document` script and the server-side chart rendering paths
share an isolation model worth calling out explicitly:

- **Script execution** is in an OS child process via `spawn(process.execPath, ...)`.
  Caps are heap (`--max-old-space-size=256`), wall-clock SIGKILL,
  and 100 MiB stdout. **No cgroup/seccomp/namespace** — child
  inherits full `process.env` including DB credentials. `Function`
  and `eval` are deliberately unblocked because `docx` transitively
  uses `function-bind`. The threat model in code: trusted-but-fallible
  LLM, not malicious adversary.
- **Render pipeline** is sandbox → `soffice --headless --convert-to pdf`
  (30 s timeout, **cold-start every call**, no daemon mode) →
  `pdftoppm -png -r 120 -l 50` (30 s, max 50 pages). Concurrency
  capped at 3 by a process-local counting semaphore (no TTL, no
  single-flight per `(artifactId, hash)`).
- **Cache layout** is S3-only at `artifact-preview/{artifactId}/{hash}/`:
  `manifest.json` plus `page-N.png`. `hash = sha256[:16 hex]` of
  the script source. **Cache reads are sequential** — a 50-page
  document = 51 sequential S3 GETs. The `/render-pages/...` route
  returns 404 if not cached; it never triggers a re-render. Client
  must call `/render-status` first.
- **RAG embedding** for script documents extracts text via `pandoc -f
  docx -t plain` on the rendered DOCX (not the script source) — adds
  another sandbox spawn per index/re-index (D-47).
- **Server-side mermaid SVG path was removed** with `a81c343` (the
  prior `lib/rendering/server/mermaid-to-svg.ts` is gone). DOCX
  exports built via the script path emit mermaid through whatever the
  script writes; no dedicated server-side mermaid renderer is wired in
  any longer.
- **`chart-to-svg.ts` is hardcoded light theme** for both DOCX and
  PPTX exports — charts in dark documents render with light palettes
  (D-51).

## Spreadsheet engine depth

`lib/spreadsheet/` is an 8-file pure-TS library:

- **`evaluateWorkbook` is pure** — no input mutation. Safe to call
  concurrently for the same spec.
- **Topological sort** is Kahn's O(V+E) (batch-7 rewrite of the
  earlier O(n²) scan). Cells in cycles get `{ value: null, error:
  "CIRCULAR" }`.
- **Function set** is whatever `fast-formula-parser` ships (~150+
  native Excel functions). No application-level whitelist.
- **No array spillover** — `SORT`, `FILTER`, `UNIQUE` returning
  multi-cell ranges are not implemented; results assign only to the
  formula's own cell.
- **Range-type named ranges silently `null`** at evaluation. No user
  warning.
- **Error propagation preserves upstream type** (DIV0 source → DIV0
  in dependents, not REF).
- **CSV tokenizer is duplicated across three files** (not in
  `parse.ts` despite the name). Same drift for the JSON-array-of-objects
  parser.
- **Two parallel number formatters** (`format.ts` numfmt wrapper,
  `styles.ts` handwritten) with different capabilities at different
  call sites.
- **XLSX export emits no chart objects** — ExcelJS lacks a stable
  chart API. Charts exist only in the browser preview.
- **`SpecWorkbookView` is a two-pass render**: synchronous `parseSpec`
  in `useMemo`, async `evaluateWorkbook` in `useEffect`. No loading
  spinner during evaluation.

## Cross-cutting capability gaps

Documented in [`artifacts-deepscan.md`](./artifacts-deepscan.md) §12
as numbered findings (D-N). User-facing gaps still open on HEAD
(`68b9d66`):

- ~~**D-3**: PDF download~~ — closed in `b886805`; route accepts `?format=pdf` and pipes through `getOrComputeDocx` + `docxToPdf` post-`9aeb8b7`.
- **D-11**: `DocumentScriptRenderer` has no retry button on render
  error.
- **D-13**: Mermaid prompt lists 19 types; validator accepts 25 via
  the shared `lib/rendering/mermaid-types.ts` (incl. `graph`,
  `stateDiagram`, `packet-beta`, `C4Container`, `C4Component`,
  `C4Deployment`). The validator's user-facing error message at
  `_validate-artifact.ts:1384` still hardcodes the stale 19-type
  list (D-77).
- **D-14**: Slides MUST-rules (first=title, last=closing, deck size
  7-12, dark primaryColor) only warn or are absent in validator.
- **D-15**: Markdown 128 KiB new-creates cap not surfaced in prompt;
  LLM cannot self-check.
- **D-16**: Python read-mode `open()` allowed by validator, forbidden
  by prompt.
- **D-17**: SVG decimal-place mismatch (prompt 1 dp, validator 3+ dp).
- **D-18**: Code `language` parameter unvalidated.
- **D-19**: Pie chart `fillOpacity={1 - i * 0.1}` floors at 0 — slices
  invisible past 11.
- **D-20**: Sheet Data/Charts `view` state shared across sheet tabs —
  switching from a charts-having sheet to one without leaves the user
  on the empty-state screen with no toggle to escape.
- **D-25**: Streamdown's internal mermaid pipeline is a separate config
  source-of-truth from `mermaid-config.ts`.
- **D-26**: HTML `allow-modals` widens sandbox vs React's
  `allow-scripts` only.
- **D-27**: Python renderer hardcodes triple-backtick fence (no
  adaptive length like `application/code`).
- **D-28** (relocated): the remaining direct `lucide-react` import
  lives in `artifact-panel.tsx:18` (`Maximize`, `Minimize`).
  `document-script-renderer.tsx` no longer holds this gap.
- **D-29** (residual prompt-side): R3F renderer now explicitly
  preserves `<color attach="background">`, but the prompt does not
  document that `<color>` is permitted.
- **D-46** (changed shape): `validateDocument` no longer accepts a
  `ctx` parameter at all — the only `VALIDATORS` entry that does not
  match the `(content, ctx?)` shape; cannot be given `isNew`-only
  rules without a signature change.
- **D-68**: `application/3d` has three different label strings across
  registry / shortLabel / prompt.
- **D-69**: `S3Paths.artifact` lacks an `"orphan"` fallback for
  null/undefined `sessionId`.
- **D-70**: Concurrent-write error messages diverge between the LLM
  tool path and the HTTP path.
- **D-71**: `edit-document/route.ts` skips Zod schema validation on
  params.
- **D-72**: `render-pages` route bypasses session-ownership check —
  IDOR by design (`contentHash` is the unguessable token).
- **D-73**: `addOrUpdateArtifact` always calls `setActiveArtifactId`,
  including for streaming placeholders — minor flicker.
- **D-74**: `getDashboardChatSessionArtifact` coerces null
  `artifactType` to `""`.
- **D-75**: `repository.ts deleteArtifactsBySessionId` is dead code.
- **D-76**: Sandbox `http2` block asymmetry — loader blocks both
  `http2` and `node:http2`; wrapper blocks neither.
- **D-77**: Mermaid validator error message hardcodes 19 types
  (shared array has 25).
- **D-78**: `r3f.ts:44` claims "20 helpers"; table has 19 rows.
- **D-79**: Sheet chart `RANGE_RE` does not handle `$`-absolute
  refs — silent empty chart.
- **D-80**: `s3.uploadStream` always presigns (inconsistent with
  `uploadFile` opt-in).
- **D-81**: Two divergent SurrealDB chunk-write paths
  (`storeChunks` vs legacy `storeDocument`).
- **D-82**: Embedding `BATCH_SIZE` / `EMBED_CONCURRENCY` are
  compile-time constants — no env override.

**Findings closed since the prior `8b6e69b`/`a81c343` cuts:** D-1,
D-6, D-7 (mostly), D-10, D-12, D-13 (at type-system level), D-21,
D-22, D-23, D-29 (at renderer level), D-31, D-44, D-45, D-49, D-50,
D-60, D-65, D-68 (legacy mermaid-svg), D-69 (legacy mermaid-svg),
D-70 (legacy mermaid AST footnote bug), D-67 (mermaid-types
relocation). See deepscan §12 for resolution notes.
