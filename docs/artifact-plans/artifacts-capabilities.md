# Artifact Capabilities — per-type spec

> **Audience:** anyone deciding "which artifact type should I (or my
> LLM) use for X?", or implementing a new capability for an existing
> type. Each section is self-contained.
>
> **Last regenerated:** 2026-05-04, post Python notebook redesign +
> validator notebook-cell rewrite + 100-finding cleanup pass, pinned
> to commit `78e2b0a`. Replaces all prior versions. Reflects 48
> commits since `68b9d66` including:
> - **`application/python` rebuilt as a Jupyter-style notebook**
>   (cells JSON; live Pyodide kernel; pin-to-chat outputs).
> - The full `cleanup/artifact-system` close-out and the second-pass
>   re-scan close-out.
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
| Formal deliverable (proposal, white paper, contract) | `text/document` | docx-js script → server-rendered PNG carousel + DOCX/PDF download |
| Source code (any language) for copy-paste | `application/code` | Shiki-highlighted, no execution |
| CSV table or spreadsheet with formulas | `application/sheet` | CSV preview or v1-spec workbook with charts |
| Math-heavy explainer with proofs | `text/latex` | KaTeX subset |
| Slide deck (presentation) | `application/slides` | JSON deck → live preview + PPTX export |
| Runnable Python notebook | `application/python` | **Jupyter-style notebook in Pyodide** with cells, plots, DataFrame display, pin-to-chat |
| 3D scene | `application/3d` | React-Three-Fiber sandbox |

When two types could work, the rule of thumb:

- **Read** vs. **interact**: readers → `text/markdown` or `text/document`;
  clickers → `text/html` or `application/react`.
- **Display code** vs. **run code**: `application/code` is read-only;
  `application/python` actually runs as a notebook.
- **Casual write-up** vs. **deliverable**: `text/markdown` is the README
  path; `text/document` is the printed-and-archived path.
- **Tabular data** vs. **slides**: `application/sheet` for grids/charts
  the user might re-sort or download as XLSX; `application/slides` for
  narrative decks.

---

## Common contracts (apply to every type)

All twelve types share these guarantees:

- **Hard size cap**: 512 KiB persisted content (`MAX_ARTIFACT_CONTENT_BYTES`).
  Enforced by `Buffer.byteLength` in `create-artifact.ts:49-60` and
  `update-artifact.ts:51-65`.
- **Server-side validation** before persist via
  `validateArtifactContent(type, content, ctx?)` — fails the tool call
  with `validationErrors` so the LLM can self-correct.
- **5-second wall-clock timeout** on validation (`VALIDATE_TIMEOUT_MS`).
- **`ValidationContext`** carries `isNew?: boolean` and `language?: string`.
  `validateMarkdown` (128 KiB cap on `isNew`), `validateSlides`
  (`image-text` deprecation hard error, color whitelist hard error on
  `isNew`), and `validateCode` (canonical-language warning) consume it.
  `validateDocument` is the only entry that ignores `ctx`.
- **Optimistic locking** on update via `prisma.document.updateMany` keyed
  on `updatedAt`.
- **Versioning**: `MAX_VERSION_HISTORY = 20` entries, FIFO eviction with
  accumulated `evictedVersionCount`. Versioned S3 key shape `<key>.v<N>`.
  Inline fallback when archive upload fails: ≤ 32 KiB inline, > 32 KiB
  marker `{ archiveFailed: true }`.
- **RAG indexing**: fire-and-forget after both LLM tool persistence and
  HTTP PUT. All current callers pass `artifactType` to
  `indexArtifactContent` (`b23e06f`) so the indexer skips its prior
  per-call DB round-trip. `markRagStatus` is now an atomic `jsonb_set`
  via `prisma.$executeRaw` (D-2 closed).
- **Full delete**: canonical S3 key, all versioned S3 keys, RAG chunks,
  Postgres row.
- **Session delete**: cascades into all of the above.
- **`text/document` exposes `.docx` + `.pdf`** via a split-button.
  Both go through the same server endpoint which routes through
  `getOrComputeDocx` (process-local FIFO cache + single-flight via
  `withRenderSlot`); PDF additionally pipes through
  `soffice --convert-to pdf`. The legacy `.md` option was dropped.
- **`application/python` exposes `.ipynb`, `.py` (percent), `.html`**
  via a three-item split-button. Built client-side from
  `lib/notebook/{ipynb,percent,html-export}.ts`.
- **All other types use a single Download button.**
- **No in-panel editing**. Preview is view-only across every type.
  Updates go through `update_artifact` tool, the HTTP PUT endpoint,
  or version restore. (The legacy `/edit-document` POST endpoint was
  deleted in `6c1dd82` — orphan since the UI modal was removed in
  `0b25e56`.)
- **Streaming placeholders** with id `streaming-${toolCallId}`.
  `addOrUpdateArtifact` skips `setActiveArtifactId` for `streaming-`
  ids so rapid multi-create does not flicker the active panel
  (D-73 closed).
- **Metrics endpoint** at `/api/dashboard/artifacts/metrics` exposes 6
  Prometheus counters. **`role === "ADMIN"` required** (NEW-D-97).

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
  `allow-modals` — D-26 by-design).

### Boundaries

- **Sandbox**: `sandbox="allow-scripts allow-modals"` (`html-renderer.tsx`).
- No external `fetch()` to real APIs.
- No `window.open()`, `location.*`, `history.*`. Nav blocker
  (`_iframe-nav-blocker.ts`) intercepts.
- No `<form action="...">` (sandbox-blocked + validator hard error).
- No external image URLs (use `unsplash:keyword` instead).
- No second Tailwind CDN script tag.
- ≤ 2 fonts, ≤ 5 colors.
- Inline `<style>` ≤ 10 non-blank lines (validator: warning).
- No emoji as functional icons.

### Renderer

`html-renderer.tsx`. Theme: not synced. Loading state: spinner
cleared on `onLoad`; 5 s `slowLoad` warning. `HEAD_OPEN_RE`
(L23) handles `>` inside attribute values for the Tailwind CDN
injection.

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

- **Sandbox**: `sandbox="allow-scripts"` only (`react-renderer.tsx`).
  No `allow-modals`.
- No imports outside the whitelist.
- No `class extends React.Component`.
- No `document.getElementById` / `querySelector`.
- No CSS imports.
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

`MAX_FONT_FAMILIES = 3`. `FONT_SPEC_REGEX` rejects URL-injection
chars. Template-literal hiding prevents false import matches inside
strings.

### Renderer

`react-renderer.tsx`. Babel standalone transpiles in-iframe.
`window.react = window.React` aliases the lowercase name so Recharts'
peer-dep check passes. postMessage handler is source-checked against
`iframeRef.current?.contentWindow`. `setError` lives in `useEffect`.

---

## 3. `image/svg+xml` — SVG Graphic

**Default for:** logos, icons, illustrations, diagrams that don't need
Mermaid syntax, decorative patterns.

### Capabilities

- All SVG presentation attrs.
- `<defs>` with gradients, patterns, `<use>` for reuse.
- SMIL animation when explicitly requested.
- `<text>` for labels.
- `#fragment` `href` references only.

### Boundaries

- Sanitized by DOMPurify (`USE_PROFILES: { svg: true, svgFilters: true }`,
  `ADD_TAGS: ["use"]`).
- `<script>`, `<foreignObject>`, `<style>` blocks → hard errors.
- External `href` / `xlink:href` to `http(s):` or `data:` → hard error.
- Event handlers → hard error.
- Hardcoded `width=` / `height=` on root `<svg>` → hard error.
- Missing `viewBox` / `xmlns` → hard error.
- Path coordinates: prompt says "round to 1 dp max"; validator warns
  at 2+ dp via `\d{2,}` regex (D-17 narrowed).

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

Mermaid v11. Validator accepts the **shared 25-entry list** in
`lib/rendering/mermaid-types.ts:14-40`, imported by both
`_validate-artifact.ts:31` and (for the slides validator). Validator
error message is generated from the shared array (D-77 closed) so
authors see the canonical list.

### Boundaries

- Markdown fences → hard error.
- Missing diagram type on first non-empty line → hard error.
- `%%{init: {'theme':...}}%%` overrides → warning.
- `click NodeId call fn()` / `click NodeId href` → silently accepted by
  validator, blocked at runtime (`securityLevel: "strict"`).
- `classDef` styling: max 3 highlight colors.
- Labels: `<br/>` only.
- Flowchart > 15 nodes → warning (heuristic; only fires for
  flowchart/graph).
- > 3000 chars → warning.

### Renderer

`mermaid-renderer.tsx`. Theme synced via `next-themes`. Module-level
singleton means `mermaid.initialize()` fires only on theme change. Init
options come from `mermaid-config.ts` (`securityLevel: "strict"`,
`theme: "base"`, theme variables derived from design tokens).

---

## 5. `text/markdown` — Markdown

**Default for:** READMEs, technical articles, tutorials with math/code,
casual write-ups.

### Capabilities

Renderer: Streamdown (react-markdown wrapper) with GFM. Supported:

- GFM tables.
- Shiki fenced code blocks (must tag language).
- KaTeX inline (`$...$`) and display (`$$...$$` / `\[...\]`) math.
- Mermaid fenced blocks (rendered through Streamdown's own pipeline —
  separate from `mermaid-config.ts`, D-25 by-design).
- Task lists, strikethrough, clickable links.
- Images via absolute URLs.

### Boundaries

- New artifacts: 128 KiB hard cap (`MARKDOWN_NEW_CAP_BYTES`).
  **Now surfaced in the prompt** at `markdown.ts:38` (D-15 closed).
- Raw HTML in `RAW_HTML_DISALLOWED` (10 entries) → validator warns.
- `<script>` is checked separately via env
  `ARTIFACT_STRICT_MARKDOWN_VALIDATION` — warning by default, hard
  error when env is `"true"`.
- More than one `# H1` → warning.
- Skipping heading levels → warning.
- Code fences without language tag → warning.

### Renderer

`StreamdownContent` (no iframe). Code blocks use Shiki with a dual
light/dark theme. Mermaid blocks use Streamdown's internal mermaid
integration.

---

## 6. `text/document` — Document

**Default for:** formal deliverables (proposals, white papers, reports,
contracts) where DOCX/PDF export and printable layout matter.

**Single format only** (post `a81c343` + Prisma column drop). Content
is an ES module JS script using the `docx` package.

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
- No `fs`, `path`, `http`, `child_process`. `http2` and `node:http2`
  blocked symmetrically by the loader and the wrapper (D-76 closed).
- No `new TableOfContents()`.
- No `WidthType.PERCENTAGE`, no `ShadingType.SOLID`, no standalone
  `new PageBreak()`.

### Validator

`validateDocument` (`_validate-artifact.ts:186-196`) is a thin async
wrapper: dynamic-imports `@/lib/document-script/validator` (single flat
file, 41 LoC) and returns its `{ ok, errors }`. The validator runs TS
syntax check + sandbox dry-run + `.docx` magic-byte check. Now accepts
`_ctx` for shape consistency (D-46 partial close).

### Renderer

`document-script-renderer.tsx` (~224 LoC). Panel routes
`text/document` directly to this component
(`artifact-panel.tsx:747-759`). Server fetches `/render-status` for
`{ hash, pageCount, cached }`, then renders a PNG carousel using
`/render-pages/[contentHash]/[pageIndex]`. While streaming, shows a
faded `CodeView` with a "Generating script…" spinner. Keyboard
navigation guarded against text-entry focus.
**Retry button** (L122-L134) on render error — refetches `/render-status`
with bumped `retryCount` (D-11 closed). Error wrapper has
`role="status" aria-live="polite"` (D-93 closed). Imports cleanly
from `@/lib/icons` at L3.

### Download

`GET /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download`.
Accepts `?format=docx` (default) and `?format=pdf`. Server routes both
through `getOrComputeDocx` (process-local FIFO cache + single-flight
via `withRenderSlot`, `lib/document-script/docx-cache.ts`); PDF
additionally pipes the cached DOCX buffer through `docxToPdf` (soffice).
D-3 + NEW-D-96 closed.

The split-button in the panel exposes `.docx` and `.pdf` only —
the prior `.md` option was dropped (NEW-D-94 closed via removal).

### Edit flow

The `/edit-document` POST endpoint and its UI modal are gone. To edit
a `text/document` artifact, regenerate via `update_artifact` tool, the
HTTP PUT endpoint, or restore a previous version. D-4, D-54, D-55,
D-71 are MOOT.

---

## 7. `application/code` — Code

**Default for:** sharing code snippets that should NOT execute, in any
language.

### Capabilities

Any language. Canonical Shiki names: typescript, tsx, javascript, jsx,
python, rust, go, java, csharp, cpp, c, ruby, php, swift, kotlin, sql,
bash, shell, yaml, json, toml, dockerfile, html, css, scss, markdown.

### Boundaries

- `language` parameter REQUIRED on `create_artifact`. **Validator
  now enforces canonical Shiki list** via `ctx.language` cross-check
  in `validateCode` (D-18 closed). Non-canonical values warn.
- Markdown fence wrapping → hard error.
- HTML document content (`<!DOCTYPE html>` / `<html`) → hard error.
- Truncation markers (`...`, `// ...`) → warnings.
- Placeholder bodies (`pass`, `todo!()`, `unimplemented!()`,
  `throw new Error("not implemented")`) → warnings.
- 512 KiB → warning (also outer cap; effectively unreachable, see
  D-N-4 in deepscan).

### Renderer

Routed to `StreamdownContent` with adaptive fence length:
`max(3, longestRun + 1)` where `longestRun` is the longest backtick run
in `content` (`artifact-renderer.tsx:114-127`).

---

## 8. `application/sheet` — Spreadsheet

**Default for:** tabular data, CSV exports, spreadsheets with formulas,
data ready for chart visualisation.

### Capabilities

Three accepted shapes:

- **Shape A — CSV**.
- **Shape B — JSON array of objects**.
- **Shape C — JSON spec**: `{ kind: "spreadsheet/v1", theme?,
  namedRanges?, sheets: SheetSpec[], charts?: ChartSpec[] }`.

#### Shape C details

- `SheetSpec`: `{ name, columns?, frozen?, cells: CellSpec[], merges? }`.
- `CellSpec`: `{ ref, value?, formula?, format?, style?, note? }`.
- Cell `style`: `"header" | "input" | "formula" | "cross-sheet" |
  "highlight" | "note"`.
- Format strings: Excel number-format notation.
- Named ranges: `"SheetName!A1:B5"` or `"A1:B5"`.
- Charts: `bar`, `line`, `area`, `pie`. `stacked: true` for bar/area.
  `categoryRange` and `series[].range` use single-row / single-column
  A1 ranges. **`$`-absolute refs now supported** (D-79 closed).

### Boundaries

- Wrong `kind` → hard error.
- Cell with both `value` and `formula` → hard error.
- Circular references → hard error (`evaluateWorkbook` runs full DAG).
- REF / NAME errors in formulas → hard error.
- Duplicate refs / sheet names → hard error.
- Sheet names with `!:*?/\[]` → hard error.
- Caps: 8 sheets, 500 cells/sheet, 200 formulas/workbook, 64 named
  ranges, 8 charts.
- CSV column-count mismatches, JSON-array key mismatches → hard error.
- Nested values, > 100 rows, > 10 cols, currency/thousands in CSV,
  mixed date formats → warnings.

### Renderer

`sheet-renderer.tsx` → `detectShape(content)` →
- spec → lazy `SpecWorkbookView` (`sheet-spec-view.tsx`)
- csv/array → `CsvOrArrayView` (TanStack Table + Search)

`SpecWorkbookView` (~324 LoC):
- `SheetFormulaBar` at top.
- Optional **Data/Charts toggle** rendered only when
  `spec.charts.length > 0`. **Resets to `"data"` on content change AND
  on tab switch** (D-20 closed).
- Sticky corner cell, A/B/C column letters, sticky row gutter, frozen
  borders.
- Cells: click → `selectedRef`; selected outline `outline outline-2
  outline-blue-600`; `highlight` style `bg-yellow-200/80`; error
  `text-red-600` + `#ERR!`.

`SheetChartView` dispatches to Recharts: `BarChart` (with `stackId`),
`LineChart` (`type="monotone"`, `strokeWidth={2}`), `AreaChart`
(`fillOpacity={0.4}`), `PieChart`. Pie has
`fillOpacity={Math.max(0.25, 1 - i * 0.1)}` — **slice opacity floored
at 0.25** so 11+ slices stay visible (D-19 closed).

XLSX download is in the panel header. XLSX export does **not** emit
chart objects (D-64 by-design).

**Theming.** `note` cell color is fully themable end-to-end via
`SpreadsheetTheme.noteColor?` (`spreadsheet/types.ts:58`,
`DEFAULT_THEME.noteColor = "#666666"`). HTML preview reads it via
`styles.ts:54`; XLSX export reads it via `generate-xlsx.ts:138`
(D-65 closed).

---

## 9. `text/latex` — LaTeX / Math

**Default for:** math-heavy explanations, proofs, lecture notes, formal
formula reference cards.

### Capabilities

Subset of LaTeX rendered by KaTeX (math envs, document structure,
inline emphasis, `\href` / `\url` restricted to `https?://`).

### Boundaries

Hard errors: `\documentclass`, `\usepackage`, `\begin{document}`,
`\includegraphics`, `\bibliography`, `\cite`, `\input`, `\include`,
`\begin{tikzpicture}`, `\begin{figure}`, `\begin{table}`,
`\begin{tabular}`.

Warnings: `\begin{verbatim}`, `\verb`, `\label{}`, `\ref{}`, `\eqref{}`,
no math delimiter.

### Renderer

`latex-renderer.tsx` (~536 LoC). KaTeX with `trust` callback restricting
`\href`/`\url` to `https?://` URLs. Balanced-brace scanner handles
nested `{}` and `\{`/`\}`.

---

## 10. `application/slides` — Slides

**Default for:** narrative slide decks, pitch decks, technical-overview
presentations.

### Capabilities

**18 layouts** in `SLIDE_LAYOUTS` Set: `title`, `content`,
`two-column`, `section`, `quote`, `image-text` (deprecated), `closing`,
`diagram`, `image`, `chart`, `diagram-content`, `image-content`,
`chart-content`, `hero`, `stats`, `gallery`, `comparison`, `features`.

Chart types: `bar`, `bar-horizontal`, `line`, `pie`, `donut`. (Note:
`area` is allowed in spreadsheet charts but NOT in slides.)

`unsplash:keyword` allowed in `imageUrl`, `backgroundImage`,
`quoteImage`. `{icon:name}` inline syntax for Lucide icons in text
fields.

### Boundaries

- All per-layout required-field rules are hard errors (per
  `939d277` — D-14 partially closed; the prompt language still uses
  "validator convention" for first/last slide rules).
- **Color whitelist** (post `939d277`): primaryColor must be one of 6
  approved hexes; secondaryColor must be one of 6 approved hexes.
  Hard error on `ctx.isNew`, warning otherwise (D-40 closed). Error
  message echoes the normalized (uppercase) form (NEW-D-91 closed).
- `image-text` layout deprecated: hard error on `isNew`, warning
  otherwise.
- > 6 bullets per slide → warning; bullets > 10 words → warning.
- Markdown syntax in text fields → warning.
- Deck size 7-12 slides → warning outside.

### Renderer

`slides-renderer.tsx`. Iframe with `sandbox="allow-scripts"` only.
postMessage source-checked. Keyboard navigation scope-guarded against
text entry. Navigation bar with chevron + counter; dot strip when
`1 < totalSlides ≤ 20`.

### Export

PPTX export via the slides export pipeline. Charts are rendered through
`chart-to-svg.ts` with a derived theme (`inferChartTheme(theme.primaryColor)`)
so dark-themed decks get the dark chart palette (NEW-R-4 closed).

---

## 11. `application/python` — Python Notebook (REDESIGNED)

**Default for:** runnable data-science notebooks, plotting,
math demonstrations, simulations, multi-cell exploration.

The legacy flat-script Python artifact is **gone**. Content is now a
**Jupyter-style notebook JSON** executed cell-by-cell in a Pyodide Web
Worker.

### LLM wire format

```json
{
  "cells": [
    { "type": "code" | "markdown", "source": "..." },
    ...
  ]
}
```

The model must NOT emit `id`, `outputs`, or `executionCount` —
those are runtime fields populated by the kernel.

### Capabilities

- **Pyodide v0.28.0** (Python 3.12), persistent kernel — globals carry
  across cells.
- **Pre-loaded packages**: `numpy`, `micropip`, `matplotlib`,
  `scikit-learn`.
- **Auto-loaded on import**: pandas, scipy, sympy, networkx, pillow,
  bs4, lxml, yaml, etc., via `pyodide.loadPackagesFromImports`.
- **Markdown cells** rendered via Streamdown (click to edit).
- **Plot capture**: `plt.show()` is monkey-patched at init to write
  base64 PNG into `__display_buffer__`; the worker drains the buffer
  after `runPythonAsync` and posts `display` messages at DPI 150.
- **Last-expression display**: bare final-line expressions are
  captured; DataFrames produce both `text/html` (table) and
  `text/plain` (repr).
- **Stream output**: `print()` and stderr land as `stream` messages.
- **Pin-to-chat**: pin individual outputs (images by default) into a
  pinned-outputs bar above the chat composer; `collectAutoAttachments`
  sends them with the next message.

### Boundaries

#### Validator hard errors (`validatePython`,
`_validate-artifact.ts:2065-L2174`):

- Empty content.
- Bare script (not starting with `{`).
- Invalid JSON.
- Missing top-level `cells` array.
- Empty `cells`.
- Cell missing `type` / `source` / non-object cell.
- (code cells) Imports of `PYTHON_UNAVAILABLE_PACKAGES`: 15 entries
  with reason strings — `requests, httpx, urllib3, flask, django,
  fastapi, sqlalchemy, selenium, tensorflow, torch, keras,
  transformers, cv2, pyarrow, polars`.
- (code cells) `input(` (no stdin), `open(` (no persistent fs).

#### Warnings:

- `time.sleep(N)` with N > 2.
- `while True` without `break`.
- No cell produces visible output (heuristic).

#### Runtime:

- Per-cell `timeoutMs` default 30 s (`python-worker.ts:87`); kernel
  terminated past that.
- `IMAGE_BUDGET_BYTES = 100 KiB` per image; oversize images flagged
  but still rendered.
- Single worker, sequential queue (kernel concurrency = 1).

### Schema

Standard Python source per cell, expected to follow the
imports → constants → helpers → main pattern across cells. Markdown
cells between code cells to explain phases.

### Renderer

Notebook subsystem under `renderers/notebook/` (see
[architecture-reference §13](./architecture-reference.md#13-notebook-subsystem-new--applicationpython)
for the full file map).

- `NotebookRenderer` parses content with `parseNotebookContentStreaming`
  (works for both streaming + complete content), maintains kernel via
  `useKernel`, dispatches per-cell render to `cell.tsx`.
- `NotebookToolbar` exposes Run-all (with hero pulse), Interrupt, Restart.
- `useKernel` lazy-creates the worker on first run; `interrupt` calls
  `worker.terminate()`.
- `usePinToChat` stores pin state in `sessionStorage` under
  `"notebook-pins:<artifactId>"`. Pins survive page refresh within
  the same tab session; runtime outputs do not (kernel is ephemeral).

### Download

Three-item split-button in the panel header
(`artifact-panel.tsx:610-L641`):

- `.ipynb` — round-trip nbformat 4 (`lib/notebook/ipynb.ts`).
- `.py` — percent-format script (`lib/notebook/percent.ts`).
- `.html` — self-contained static HTML export
  (`lib/notebook/html-export.ts`).

### Wiring drift

The registry exports `label = "Python Script"` while the prompt module
exports `label = "Python Notebook"`. The prompt label is what surfaces
in canvas headers; the registry label surfaces in panel chrome and
pills. Same root issue as `application/3d`'s D-68 label drift.

---

## 12. `application/3d` — R3F 3D Scene

**Default for:** 3D scenes, animated geometric primitives, glTF model
viewers.

### Capabilities

React 18.3.1 hooks. THREE namespace 0.170.0. `useFrame` / `useThree`
(fiber 8.17.10). 19 drei helpers: useGLTF, useAnimations, Clone,
Float, Sparkles, Stars, Text, Center, Billboard, Grid, Html, Line,
Trail, Sphere, RoundedBox, MeshDistortMaterial, MeshWobbleMaterial,
MeshTransmissionMaterial, GradientTexture. **Prompt header now says
"19 helpers"** (D-78 closed).

**Wrapper provides** (do NOT include in your code): `<Canvas>`,
`<ambientLight>`, `<directionalLight>`, `<Environment>`,
`<OrbitControls>`, `<Suspense>`.

`<color attach="background" args={["#hex"]} />` is **explicitly
preserved** by `sanitizeSceneCode` (D-29 closed end-to-end). Other
`<color>` variants (fog, environment) are silently stripped (NEW-D-98).

Verified glTF model URLs: KhronosGroup glTF samples (20 models),
three.js examples via jsDelivr (6 models).

### Boundaries

#### Hard errors

`<Canvas>`, `<OrbitControls>`, `<Environment>`, `document.*`,
`requestAnimationFrame`, `new THREE.WebGLRenderer`, missing
`export default`, markdown fences.

#### Warnings

Imports from non-whitelisted packages (`R3F_ALLOWED_DEPS`, 34 entries)
or non-whitelisted symbols.

### Renderer

`r3f-renderer.tsx` (~641 LoC). Iframe **without** `sandbox` (WebGL
needs GPU). postMessage source-checked. `didReadyRef` reset on
content change. Bundle delivered via importmap (esm.sh) inside
srcdoc; Babel standalone via unpkg. WebGL errors detected via
keyword sniff and routed to a `WebGLHelpOverlay`.

**Label drift (D-68).** Registry exports `label = "3D Scene"` and
`shortLabel = "R3F Scene"`. The prompt module also exports
`label = "3D Scene"` (canonicalized in `10ad714`). The remaining
`shortLabel` divergence is cosmetic.

---

## Sandbox + render pipeline depth

The `text/document` script and the server-side chart rendering paths
share an isolation model worth calling out:

- **Script execution** is in an OS child process via
  `spawn(process.execPath, ...)`. Caps: heap
  (`--max-old-space-size=256`), wall-clock SIGKILL, 100 MiB stdout.
  No cgroup/seccomp/namespace; child inherits full `process.env`.
  `Function`/`eval` deliberately unblocked because `docx` transitively
  uses `function-bind`. Threat model: trusted-but-fallible LLM, not
  adversary. `http2` and `node:http2` are now blocked symmetrically by
  the loader and the wrapper (D-76).
- **Render pipeline** is sandbox → `soffice --headless --convert-to pdf`
  (30 s timeout, cold-start every call, D-37 deferred) →
  `pdftoppm -png -r 120 -l 50` (max 50 pages, **numeric page sort**
  per D-84). Concurrency capped at 3 by `withRenderSlot` (process-local
  counting semaphore). **Single-flight per `(artifactId, hash)`**
  enforced inside `docx-preview-pipeline.ts` (D-89 closed). The
  download path also uses the same semaphore + a 16-entry FIFO DOCX
  cache (NEW-D-96).
- **Cache layout** is S3-only at `artifact-preview/{artifactId}/{hash}/`:
  `manifest.json` plus `page-N.png`. `hash = sha256[:16 hex]` of the
  script source. **Cache reads are parallel** via `Promise.all`
  (D-36 closed). `/render-pages/...` route returns 404 if not cached;
  it never triggers a re-render (D-35 by-design two-step protocol).
  **Session-ownership is enforced** before serving cached PNGs
  (D-72 closed).
- **RAG embedding** for script documents extracts text via
  `pandoc -f docx -t plain` on the rendered DOCX, with a 128-entry
  process-local FIFO cache keyed on SHA-256[:16] of content
  (D-47 closed).
- **`chart-to-svg.ts` accepts a theme parameter** (light or dark);
  slides exporters now pass `inferChartTheme(theme.primaryColor)`
  so dark decks get the dark chart palette (D-51 closed end-to-end).

## Spreadsheet engine depth

`lib/spreadsheet/` is an 8-file pure-TS library:

- **`evaluateWorkbook` is pure** — safe concurrent calls.
- **Topological sort** is Kahn's O(V+E). Cells in cycles get
  `{ value: null, error: "CIRCULAR" }`.
- **Function set** is whatever `fast-formula-parser` ships
  (~150+ native Excel functions). No application-level whitelist.
- **No array spillover** — `SORT`, `FILTER`, `UNIQUE` results assign
  only to the formula's own cell.
- **Range-type named ranges silently `null`** (D-59 by-design).
- **Error propagation preserves upstream type** (DIV0 → DIV0 in
  dependents, not REF).
- **CSV tokenizer is shared** (D-60 closed).
- **`numfmt` is the single number formatter** post `formatCellValue`
  removal.
- **XLSX export emits no chart objects** (D-64 by-design).
- **`SpecWorkbookView` is a two-pass render**: synchronous `parseSpec`
  in `useMemo`, async `evaluateWorkbook` in `useEffect`, "Calculating
  formulas…" footer fires on every re-eval (NEW-D-92 closed).
- **`$`-absolute refs are stripped** before range matching
  (D-79 closed).

## Notebook subsystem depth

The Python notebook is a separate library/runtime layered on top of
the artifact system:

- **`lib/notebook/`** is the engine: types (Zod), serializer with
  streaming-tolerant parser, percent/ipynb/html exporters, chat
  attachment helper.
- **`lib/workers/python-worker.ts`** is the kernel: Pyodide v0.28.0,
  pre-loaded `numpy`/`micropip`/`matplotlib`/`scikit-learn`,
  `loadPackagesFromImports` autoload, `plt.show` capture,
  `__format_last__` for last-expression display, per-cell timeout.
- **`renderers/notebook/`** is the React UI: toolbar, cell shell,
  CodeMirror editor, markdown editor, output renderer, pin overlay,
  `useKernel` (worker lifecycle + run queue), `usePinToChat`
  (sessionStorage-backed).
- **Kernel is ephemeral** — runtime outputs are not persisted to the
  artifact's `content` in DB. Cells must be re-run on page refresh.
- **Pin state survives** within a tab session via
  `sessionStorage["notebook-pins:<artifactId>"]`.

## Open gaps at HEAD `78e2b0a`

Closed / by-design / dead-code findings have been pruned. Full
descriptions and file:line citations live in
[`artifacts-deepscan.md`](./artifacts-deepscan.md) §12.

**New gaps surfaced by this rescan:**

- **D-101.** `validatePython` visible-output heuristic misses
  literal-only final lines.
- **D-102.** Worker-side `case "interrupt"` is a dead branch.
- **D-103.** `executionCount` declared on `WorkerRequest.run`,
  ignored by the worker.
- **D-104.** `CellSchema` accepts `outputs`/`executionCount` on
  markdown cells; prompt forbids them.
- **D-105.** Notebook pin state is sessionStorage-only and points
  at ephemeral kernel outputs.
- **D-106.** `validateSlides` markdown-leakage regex false-positives
  on legitimate `**$10**` strings.
- **D-107.** `validateSheet` constant-column check breaks after first
  match.
- **D-108.** `validateCode` 512 KiB byte-size warning is unreachable.
- **D-109.** `validateMermaid` node-count heuristic double-counts
  `subgraph`-internal nodes.
- **D-110.** `validateReact` `@fonts` orphan warning misses the
  invalid-`@aesthetic` case.
- **D-111.** `update-artifact.ts:264` leaks `title: undefined` when
  `findUnique` throws before reaching the not-found path.

**Residual gaps from prior cuts (still open):**

- **D-13.** Mermaid prompt summary lists fewer diagram types than
  validator accepts.
- **D-14.** Slides MUST-rules validator-enforced; prompt copy still
  uses "convention" wording.
- **D-16 (inverted).** `validatePython` bans all `open(`; prompt
  doesn't distinguish modes — validator stricter than prompt.
- **D-17.** SVG decimal-place mismatch (prompt 1 dp, validator 2+ dp).
- **D-46.** `validateDocument` accepts `_ctx` but doesn't plumb it
  to `validateScriptArtifact`.
- **D-68.** Type-label drift across registry / shortLabel / prompt:
  `application/python` ("Python Script" vs "Python Notebook"),
  `application/3d` (`shortLabel "R3F Scene"`).

**Deferred (open, separate plan):**

- **D-37.** `soffice` cold-start.
- **D-64.** XLSX export emits no chart objects.
- **D-81.** `vector-store.ts` storeDocument vs storeChunks divergence.
