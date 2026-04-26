# Artifact Capabilities — per-type spec

> **Audience:** anyone deciding "which artifact type should I (or my LLM)
> use for X?", or implementing a new capability for an existing type. Each
> section is self-contained.
>
> **Last regenerated:** 2026-04-25, post-Priority-C, pinned to merge `f0264f8`.
> Replaces all prior versions. Sourced from a 5-agent ground-up rescan.
>
> Companion docs:
> - [`artifacts-deepscan.md`](./artifacts-deepscan.md) — system flow.
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit.
> - [`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md) — 58 unshipped findings (referenced as **N-N** below).

---

## Decision matrix — which type for what?

| User intent | Type | Why |
|-------------|------|-----|
| Interactive page, calculator, dashboard, game | `text/html` | Tailwind v3 + JS in sandboxed iframe |
| Custom UI component with React/Recharts/Lucide | `application/react` | Babel transpile + iframe runtime |
| Logo, icon, simple graphic | `image/svg+xml` | Inline SVG, sanitized |
| Flowchart, sequence, ER, mindmap, Gantt | `application/mermaid` | Mermaid → SVG |
| README, technical docs, articles, reports | `text/markdown` | GFM + KaTeX + mermaid + Shiki |
| Formal deliverable (proposal, white paper, contract) | `text/document` | DocumentAst → DOCX export with cover, TOC, footnotes |
| Source code (any language) for copy-paste | `application/code` | Shiki-highlighted, no execution |
| CSV table or spreadsheet with formulas | `application/sheet` | CSV preview or v1-spec → XLSX export |
| Math-heavy explainer with proofs | `text/latex` | KaTeX subset |
| Slide deck (presentation) | `application/slides` | JSON deck → live preview + PPTX export |
| Runnable Python (data munging, plotting) | `application/python` | Pyodide in browser |
| 3D scene | `application/3d` | React-Three-Fiber sandbox |

When two types could work, the rule of thumb:

- **Read** vs. **interact**: readers → `text/markdown` or `text/document`;
  clickers → `text/html` or `application/react`.
- **Display code** vs. **run code**: `application/code` is read-only;
  `application/python` actually runs.
- **Casual write-up** vs. **deliverable**: `text/markdown` is the README path;
  `text/document` is the printed-and-archived path.

---

## Common contracts (apply to every type)

All twelve types share these guarantees:

- **Hard size cap**: 512 KiB persisted content (`MAX_ARTIFACT_CONTENT_BYTES`).
  Enforced by `Buffer.byteLength` in `create-artifact.ts:51-60` and
  `update-artifact.ts:51-61`.
- **Server-side validation** before persist via
  `validateArtifactContent(type, content, ctx?)` — fails the tool call
  with `validationErrors` so the LLM can self-correct.
- **5-second wall-clock timeout** on validation (`VALIDATE_TIMEOUT_MS`).
- **`ValidationContext.isNew`** is set to `true` on `create_artifact`,
  omitted on `update_artifact`. Two validators (`validateMarkdown`,
  `validateSlides`) apply stricter rules under `isNew=true`. (`validateDocument`
  doesn't accept `ctx` at all — see rescan **N-26**.)
- **Optimistic locking** on update via `prisma.document.updateMany` keyed
  on `updatedAt` — concurrent writers get a 409 (HTTP) or
  `{ updated: false, error: "Concurrent update detected…" }` (LLM tool).
- **Versioned archival** to `<s3Key>.v<N>` up to 20 (`MAX_VERSION_HISTORY`),
  FIFO eviction tracked in `metadata.evictedVersionCount`.
- **RAG indexing** via `indexArtifactContent` is fire-and-forget and
  never rethrows. Failure writes `metadata.ragIndexed: false` so the panel
  can show a "not searchable" badge. **NOTE** (rescan **N-1**): only the
  LLM tool path indexes; the manual-edit HTTP path does not — manual edits
  produce stale RAG until the next LLM update.
- **Deletion** removes the canonical S3 object, every versioned S3 key,
  the RAG chunks, and the Postgres row. **NOTE** (rescan **N-47**):
  session-level delete still leaks versioned S3 keys — it only fetches
  `{ id, s3Key }`, not `metadata`.
- **Canvas-mode lock** — when `context.canvasMode` is set to a specific
  type, both `create_artifact` and `update_artifact` reject any other type.
  `auto` allows any. **NOTE** (rescan **N-7**): `update_artifact`'s lock is
  silently bypassed when `existing.artifactType` is null.

---

## 1. `text/html` — Self-contained interactive pages

**Renderer.** `html-renderer.tsx`. Mounts content in `<iframe srcdoc>`
with `sandbox="allow-scripts allow-modals"`. The nav-blocker shim is
injected before user scripts; Tailwind CDN and Inter font are auto-injected
if absent.

**Runtime guarantees.**
- Tailwind CSS v3 is auto-injected (do **not** add another `<script>` for it).
- The Inter font must be linked via `<link>` from Google Fonts.
- `localStorage` works inside the iframe.
- No external network beyond Google Fonts and the Tailwind CDN.
- Form submission, navigation, `window.open()` blocked by sandbox + nav-blocker.

**Image protocol.** Use `src="unsplash:keyword"` for contextual photos.
Validator's post-Unsplash step (`_validate-artifact.ts:131-144`) resolves
via `resolveImages` before persisting. Rules:
- 2–4 keyword phrases.
- Only works in `src=` attributes (not CSS `background-image` or JS).
- 30-day cache via `prisma.resolvedImage`.
- `placehold.co` fallback when Unsplash key is missing or fails.

**Validator** (`validateHtml`):
- DOCTYPE `<!DOCTYPE html>` required at the top.
- parse5 parse — `<html>`, `<head>`, `<body>`, `<title>` (with non-empty text), viewport meta required.
- `<form action=…>` rejected (sandbox blocks form submission).
- Inline `<style>` block warning at `MAX_INLINE_STYLE_LINES = 10`.

**Drift** (rescan **N-13**): the prompt says inline `<style>` ≤ 10 lines,
but the validator threshold appears to be 15 in the test suite. 11–14
lines satisfy validation but violate the prompt rule.

**Anti-patterns:**
- Static prose. Use `text/markdown`.
- `<base>` tag.
- `fetch()` against real APIs (sandbox blocks).

---

## 2. `application/react` — React components with live preview

**Renderer.** `react-renderer.tsx`. Babel transpiles the component;
mounts in `<iframe srcdoc>` with `sandbox="allow-scripts"`. React 18,
ReactDOM, Recharts 2, lucide-react, framer-motion are exposed as window
globals (CDN-pinned in the iframe template).

**Import whitelist** (`REACT_IMPORT_WHITELIST`): `react`, `react-dom`,
`recharts`, `lucide-react`, `framer-motion`. Any other import is a hard
validation error.

**Mandatory shape.**
- Exactly one `export default` (component or const).
- One file. No multi-file imports.
- No CSS file imports.
- Inline `<style>` blocks ≤ 10 non-blank lines (`MAX_INLINE_STYLE_LINES`).
- No `class extends React.Component` — function components only.
- No `document.querySelector` / `document.getElementById` — use `useRef`.

**Aesthetic directives** (`_react-directives.ts`):
- Line 1: `// @aesthetic: <direction>` from
  `editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic`.
- Line 2 (optional): `// @fonts: Family:wght@spec | Family:wght@spec`.
  Capped at `MAX_FONT_FAMILIES = 3`.
- `validateFontSpec` accepts only 4 axis forms: `wght@`, `ital,wght@`,
  `opsz,wght@`, `ital,opsz,wght@`.
- When `process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"`,
  missing directive is a hard error. **Default behavior is enforced** —
  the env var must be the literal string `"false"` to disable.

**Soft warnings:**
- Editorial/luxury aesthetic without serif in `@fonts`.
- Industrial aesthetic with `Motion.motion` / `Motion.AnimatePresence`.
- ≥ 6 slate/indigo Tailwind class hits with a non-industrial aesthetic.

**postMessage discipline.** The iframe's error boundary forwards runtime
errors to the host via `parent.postMessage({ type: "error", ... }, '*')`.
The host enforces `e.source === iframeRef.current?.contentWindow`
(`react-renderer.tsx:459`) before trusting it. The host's `setError`
lives in `useEffect`, not `useMemo` (a render-time `setState` would warn
or loop).

**Anti-patterns:**
- Importing from `@/lib` or any project-internal alias.
- Server components / `"use client"` directive (every artifact is client-only).
- `next/image` — use a plain `<img>` and a real URL.
- shadcn/ui imports.

---

## 3. `image/svg+xml` — SVG graphics

**Renderer.** `svg-renderer.tsx` — DOMPurify with
`USE_PROFILES: { svg: true, svgFilters: true }` and `ADD_TAGS: ["use"]`.
Renders inline (no iframe — important for the rules below).

**Validator** (hard errors):
- Empty content rejected.
- Missing root `<svg>` rejected.
- Missing `xmlns="http://www.w3.org/2000/svg"` rejected.
- Missing `viewBox` rejected (no responsive scaling without it).
- `width` / `height` on root rejected (use `viewBox` only).
- `<script>` rejected (stripped by sanitizer; surface to LLM).
- `<foreignObject>` rejected.
- External `href` / `xlink:href` rejected; only same-document `#id` allowed.
- Event handler attributes (`on*`) rejected.
- Inline `<style>` blocks rejected — **error** for SVG (because the
  renderer is not iframed and CSS leaks into host page) but only
  **warning** for HTML (which is iframed).

**Soft warnings:**
- Missing `<title>` child of root `<svg>` (unless `aria-hidden="true"`).
- > 5 distinct colors.
- Path coordinates with > 2 decimal places.

**Use cases.** Icons, logos, illustrations that compose into other
artifacts. Icons should use `currentColor`.

**Anti-patterns:**
- Inline `<script>` — stripped.
- Foreign-object HTML embeds — survive sanitization but rarely render usefully.

---

## 4. `application/mermaid` — Diagrams

**Renderer.** `mermaid-renderer.tsx` (live preview, module-level singleton
`mermaidPromise`). Server SVG path (`rendering/server/mermaid-to-svg.ts`)
for DOCX, with jsdom shim + `renderQueue` Promise mutex. Client PNG path
(`rendering/client/mermaid-to-png.ts`) for PPTX export.

**Theme.** Light: `MERMAID_THEME_VARIABLES`. Dark:
`MERMAID_THEME_VARIABLES_DARK`. Factory `getMermaidInitOptions(theme)` in
`mermaid-theme.ts`. The document-renderer's `MermaidPreviewBlock` reads
`useTheme().resolvedTheme` and switches; the server (DOCX) always uses
light because the docx body is white.

**Concurrency hazard** (rescan **N-54**): two separate init paths share
the global mermaid singleton — `mermaid-renderer.tsx` (via
`renderers/mermaid-config.ts`) and `document-renderer.tsx`'s
`MermaidPreviewBlock` (via `lib/rendering/mermaid-theme.ts`). Whichever
calls `mermaid.initialize` last wins. Concurrent renders cause silent
theme drift.

**Validator** (`validateMermaid`):
- Non-empty content.
- First non-empty line must start with one of the whitelisted diagram
  types: `flowchart`, `graph`, `sequenceDiagram`, `erDiagram`,
  `stateDiagram-v2`, `classDiagram`, `gantt`, `pie`, `mindmap`,
  `gitGraph`, `journey`, `quadrantChart`, `timeline`, `sankey-beta`,
  `xychart-beta`, `block-beta`, `kanban`, `C4Context`,
  `requirementDiagram`, `architecture-beta` (24 entries).
- ` ```mermaid ``` ` markdown fences rejected.

**Drift** (rescan **N-14**): the prompt forbids
`%%{init: {'theme':'...'}}%%` directives entirely; the validator only
warns when a regex match hits, and the regex is easily evaded.

**Drift** (rescan **N-15**): `validateSlides`'s inline mermaid-start
list at `_validate-artifact.ts:364` is a strict subset of the global
list and **omits `stateDiagram-v2`** — slides containing `stateDiagram-v2`
trigger a "diagram may be invalid" warning even though the renderer
handles it.

**Drift** (rescan **N-16**): the document-AST validator's whitelist at
`document-ast/validate.ts:19-24` lists 16 diagram types and is missing
`xychart-beta`, `block-beta`, `packet-beta`, `kanban` (added in Mermaid
v10/v11).

**Anti-patterns:**
- `%%{init:` directives — system applies its own theme.
- Manually colored nodes that fight the theme — keep diagrams structural.
- More than 15 nodes in a single flowchart (warning).

---

## 5. `text/markdown` — Documents

**Renderer.** `StreamdownContent` (a streaming-friendly react-markdown
wrapper). GFM enabled. Shiki for code, KaTeX for math (via
`remark-math` + `rehype-katex`), mermaid via fenced ` ```mermaid ` blocks.

**Mandatory contracts:**
- Code fences must declare a language (warning when missing).
- Heading levels must not skip (h1 → h3 emits a warning).

**Strict gates:**
- **128 KiB cap on creates** (`MARKDOWN_NEW_CAP_BYTES`). New markdown
  over the cap is rejected. Existing oversized markdown still validates
  on update so the panel can edit it down to size.
- **`<script>` strict mode** (env-gated, off by default). When
  `ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"`, a `<script>` tag is
  a hard error. Default is a soft warning.

**Raw HTML disallow list:** `details`, `summary`, `kbd`, `mark`,
`iframe`, `video`, `audio`, `object`, `embed`, `table`. Renderer either
strips or mis-renders these — emit warnings.

**Anti-patterns:**
- Embedding `<script>` for "interactivity" (use `text/html`).
- Formal deliverables (use `text/document`).
- Slides (use `application/slides`).
- Raw HTML for layout.

---

## 6. `text/document` — Formal deliverables

**Renderer.** `document-renderer.tsx` — A4/letter preview. Source of
truth is `DocumentAst` JSON; preview renders it directly and the user
downloads the same JSON as `.md` (raw, pretty-printed) or `.docx`
(rendered server-side via `astToDocx`).

**Schema** (`src/lib/document-ast/schema.ts`):

```
{
  meta: {
    title, subtitle?, author?, organization?, documentNumber?, date?,
    pageSize: "letter" | "a4",
    orientation: "portrait" | "landscape",
    margins?: { top?, bottom?, left?, right? },
    font, fontSize, showPageNumbers
  },
  coverPage?: { title, subtitle?, author?, date?, organization?, logoUrl? },
  header?:    { children: BlockNode[] },
  body:       BlockNode[],
  footer?:    { children: BlockNode[] }
}
```

**Block nodes:** `paragraph`, `heading`, `list` (ordered/unordered,
nested), `table`, `image`, `blockquote`, `codeBlock`, `horizontalRule`,
`pageBreak`, `toc`, `mermaid`, `chart`.

**Inline nodes:** `text` (with bold/italic/underline/strike/code/superscript/subscript/color),
`link`, `anchor`, `footnote`, `lineBreak`, `pageNumber`, `tab`.

**`coverPage.logoUrl`.** Schema-typed as `z.string().optional()` —
deliberately *not* `.url()` so `unsplash:keyword` is valid. The DOCX
exporter's `renderCoverPage` (`to-docx.ts:479-540`) fetches the resolved
URL and embeds the bytes as an `ImageRun` (160 × 160 px).

**Footnote rendering.** Preview footnote sink is allocated **per render**
(`document-renderer.tsx:406`), not memoized — memoizing would double
entries on every keystroke. The DOCX exporter **drops `Table` blocks
inside footnotes** (the `docx` library doesn't support nested tables in
`FootnoteReferenceRun`s) and replaces them with an italic-grey paragraph:
*"[table omitted from footnote — see body for full content]"*
(`to-docx.ts:576-592`).

**Mermaid + chart blocks.** The exporter calls `mermaidToSvg` (server)
and `chartToSvg` for these block types, then `svgToPng` for raster
embedding. The server-side mermaid renderer serializes through
`renderQueue` to keep concurrent calls from racing on the global jsdom
shim swap.

**Schema-vs-renderer drift items still present:**

- **Rescan N-18.** `tab.leader: "dot"` accepted by schema and used by
  the `letter.ts` example (line 143) — exporter renders all tabs as `\t`,
  silently dropping the dot leader.
- **Rescan N-19.** `list.startAt` accepted by schema; exporter always
  starts ordered lists at 1 (documented in comment at `to-docx.ts:396-398`).
- **Rescan N-20.** `table.shading: "striped"` accepted; renderer reads
  cell-level `cell.shading` (hex) but never reads table-level
  `node.shading`.
- **Rescan N-21.** TOC `node.title` rendered **twice** when set: once
  as a heading paragraph, once as the `TableOfContents(node.title, …)`
  argument.
- **Rescan N-22.** Heading bookmark IDs not unique-checked. Duplicates
  survive validation; anchors resolve to whichever Word picks.
- **Rescan N-23.** Footnote nesting unbounded — schema permits
  `footnote → paragraph → footnote` recursion to arbitrary depth.
- **Rescan N-24.** `renderChart` has **no try/catch** around
  `svgToPng` — sharp failures propagate as 500 from the download
  endpoint. (Contrast `renderMermaid` which guards with a marker
  paragraph.)
- **Rescan N-25.** `validateDocument` discards warnings from
  `validateDocumentAst` on success.

**Numbering config.** Only 3 bullet levels (`BULLET_CHARS`: `•, ◦, ▪`)
and 3 numbered levels are configured. Deeper nesting overflows silently.

**Cover page and body share one section** (`to-docx.ts:634`): no separate
margins or page numbering for the cover.

**Unsplash resolution.** `resolveUnsplashInAst` (in `resolve-unsplash.ts`)
walks the AST collecting all `unsplash:keyword` strings, calls the shared
`resolveQueries(keywords)`, and rewrites the AST in place. The validator
returns the rewritten AST as `validation.content`.

**Download.** Split-button:
- `.md` — the AST pretty-printed as JSON (the source).
- `.docx` — `astToDocx(ast)` rendered through the `docx` library.

**Anti-patterns:**
- Wrapping the JSON in markdown fences. Validator JSON-parses raw input.
- Trailing prose ("Here is your document"). Whole response must be
  `JSON.parse`-able.
- Tables inside footnotes (silently replaced with marker paragraph).
- LaTeX notation (`$...$`). Use `text/markdown` if you need math.

---

## 7. `application/code` — Source code

**Renderer.** `StreamdownContent` with a fenced block at language
`language`. Fence length is computed dynamically:
`Math.max(3, longestRun + 1)` where `longestRun` is the longest run of
backticks inside the content. Keeps content with embedded ` ``` ` blocks
(tutorials) rendering correctly.

**Mandatory.** The `language` parameter is **required** on the tool call —
`create-artifact.ts:89-101` rejects missing language for this type.
**The `application/code` type does NOT receive a `language` parameter on
update_artifact** (rescan **N-12**) — the language can't be changed
in-place after creation. The download extension is `.txt` regardless of
language (rescan **N-38**).

**No execution.** Display-only. For running code use:
- `application/python` (Pyodide).
- `application/react` / `text/html` (iframe).

**Anti-patterns:**
- `application/code` for runnable Python (use `application/python`).
- `application/code` for React UI (use `application/react`).
- Wrapping in markdown fences.

---

## 8. `application/sheet` — Spreadsheets

**Renderer.** `sheet-renderer.tsx` dispatches on `detectShape(content)`:
- **CSV** (`headers + rows of strings`) → custom CSV table via TanStack.
- **JSON array** (`[{...}, ...]`) → table built from object keys.
- **v1 spec** (`{"kind": "spreadsheet/v1", "sheets": [...]}`) →
  `sheet-spec-view.tsx` with cell evaluator.

**Hard caps (validator):**
- Max 8 sheets per workbook.
- Max 500 cells per sheet.
- Max 200 formulas per workbook.
- Max 64 named ranges.
- Sheet names ≤ 31 chars; letters/numbers/spaces/underscores only.

**Validator branches:**
- **CSV**: header row required; all rows same column count; per-column
  warnings (currency-as-text at ≥ 1 hit, mixed ISO/non-ISO dates at
  ≥ 2 each, identical-values column).
- **JSON array**: object-shape consistency; nested values warning.
- **v1 spec**: `parseSpec(json)` + `evaluateWorkbook(spec)` runs formulas
  to surface circular/REF errors before persisting.

**Quirks** (rescan):
- CSV currency warning fires at ≥ 1 hit while ISO date warning needs
  ≥ 2 of each — noisy asymmetry.
- `tokenizeCsv` doesn't handle bare `\r` (old Mac line endings) — old
  Mac content parses as one giant row.
- v1-spec sheets save with extension `.csv` in the registry but the
  panel downloads them as `.xlsx`.

**Export.** The panel offers `.csv` (raw) or `.xlsx` (via
`generate-xlsx.ts` for v1 specs). `generate-xlsx` returns a `Blob`
(browser API).

**Performance.** `evaluateWorkbook` runs on the main thread. Topological
sort is O(n²) in formula count (rescan **N-50**) — capped at 200, so
~40k iterations, negligible. **Audit Priority D** flagged a Web Worker
migration; deferred because `SpreadsheetSpec` carries non-clonable
callbacks (`onCell`, `onRange`, `onVariable`). Lower-risk first step:
`requestIdleCallback` chunking.

**Anti-patterns:**
- Currency / thousand separators inside numeric columns — sorting is
  lexicographic.
- Mixed ISO + regional date formats in one column.
- `kind: "spreadsheet/v2"` (only v1 supported).

---

## 9. `text/latex` — Math documents

**Renderer.** `latex-renderer.tsx` — KaTeX with `throwOnError: false`
inside a custom transpiler that handles a curated subset of
document-structure commands (`\section`, `\subsection`, `\paragraph`,
`\itemize`, `\enumerate`, basic inline formatting) plus all KaTeX math
environments.

**KaTeX configuration:** `trust: true` — **rescan N-30: combined with
`dangerouslySetInnerHTML`, this allows `\href{javascript:...}` payloads**
from LLM output.

**NOT a full LaTeX engine.** No `\documentclass`, no `\usepackage`, no
preamble.

**Validator** (`validateLatex`, hand-rolled regex parsing, protected by
the 5-second timeout):
- `\documentclass`, `\usepackage`, `\begin{document}` → hard errors,
  short-circuit return (rescan: causes a two-round LLM retry rather than
  one — the unsupported-command scan never runs after).
- Disallowed commands: `\includegraphics`, `\bibliography`, `\cite`,
  `\input`, `\include`, `\begin{tikzpicture}`, `\begin{figure}`,
  `\begin{table}`, `\begin{tabular}`.
- Soft warnings: `\begin{verbatim}`, `\verb`, `\label{}`, `\ref{}`,
  `\eqref{}`.

**Math delimiters:** `$...$` (inline), `$$...$$` (display), `\[...\]`,
`align`, `matrix`, `cases`, `gather`, `multline`.

**Anti-patterns:**
- `\documentclass` / `\usepackage` — hard error.
- Custom commands (`\newcommand`) — not supported in this mode.
- Using `text/latex` when only one equation is needed (embed it in
  `text/markdown`).

---

## 10. `application/slides` — Presentation decks

**Renderer.** `slides-renderer.tsx` mounts the deck in an iframe with
slide navigation. **Sandbox: `allow-scripts allow-same-origin`**
(rescan **N-28**) — most permissive sandbox in the codebase.

**postMessage discipline.** Like React, the iframe sends messages back
to the host. Host enforces
`e.source === iframeRef.current?.contentWindow` (`slides-renderer.tsx:45`)
before trusting events.

**Keyboard nav** (rescan **N-9**): `window.addEventListener("keydown", ...)`
captures arrow keys at the window level, calls `e.preventDefault()`.
Arrow keys in unrelated text inputs (chat composer) trigger slide nav.

**Layouts (17 in total).** The validator's `SLIDE_LAYOUTS` set:
`title`, `content`, `two-column`, `section`, `quote`,
`image-text` *(deprecated)*, `closing`, `diagram`, `image`, `chart`,
`diagram-content`, `image-content`, `chart-content`, `hero`, `stats`,
`gallery`, `comparison`, `features`.

**`image-text` deprecation.** New artifacts trip a hard error
(`ctx.isNew === true`); existing artifacts validate as warnings so
authors of legacy decks can edit them. The migration script
`scripts/migrate-artifact-deprecations.ts` rewrites stored decks
`image-text → content`.

**Per-layout requirements:**
- `title` — non-empty `title`. `subtitle` recommended.
- `content` — must have either non-empty `bullets[]` or non-empty `content`.
- `two-column` — both `leftColumn[]` and `rightColumn[]` arrays.
- `quote` — non-empty `quote`.
- `closing` — `title` recommended.
- `diagram` / `diagram-content` — non-empty `diagram` (Mermaid).
  Validator warns when prefix doesn't match a known mermaid keyword
  (rescan **N-15**: `stateDiagram-v2` flagged here even though globally valid).
- `image` / `image-content` — non-empty `imageUrl` (URL or `unsplash:keyword`).
- `chart` / `chart-content` — `chart.type` ∈ `{bar, bar-horizontal, line, pie, donut}` +
  `chart.data` (bar/pie/donut) or `chart.series` (line). **Rescan: no
  `Array.isArray` check; `chart: []` slips through `typeof === "object"`.**
- `hero` — `backgroundImage` + `title`.
- `stats` — `stats[]` with 2–4 items, each `{ value, label }`.
- `gallery` — `gallery[]` with 4–12 items, each with `imageUrl`.
- `comparison` — `comparisonHeaders[]` (≥ 2) + `comparisonRows[]` (each
  row's `values.length === headers.length - 1`).
- `features` — `features[]` with 3–6 items, each `{ icon, title }`.
- Split layouts (`*-content`) — must have `bullets` or `content` alongside
  the visual.

**Soft conventions.** `MAX_SLIDE_BULLETS = 6`, `MAX_BULLET_WORDS = 10`,
deck size 7–12 slides. Markdown syntax in text fields (`**`, `##`,
backticks) is a warning.

**Image protocol.** Same `unsplash:keyword` syntax as HTML, applied to
`imageUrl`, `backgroundImage`, `quoteImage`, and `gallery[].imageUrl`.
Validator's post-Unsplash step (`_validate-artifact.ts:140-143`) calls
`resolveSlideImages` so persisted decks carry resolved URLs.

**Export.** Live preview → `.pptx` via `pptxgenjs`. Mermaid diagrams in
slides rasterize through the **client → PNG path** which always uses
the **light theme** (rescan **N-53**) — dark-mode users get
light-theme mermaid in their PPTX.

**Anti-patterns:**
- Markdown syntax in slide text fields.
- Using `image-text` for new decks.
- Decks with > 12 slides (warning; "this is a doc, not a deck" territory).
- Bright `primaryColor` in the theme.
- `application/slides` for static infographics (use `image/svg+xml` or
  `application/react`).

---

## 11. `application/python` — Runnable Python

**Renderer.** `python-renderer.tsx` runs the script in Pyodide v0.27.6
inside a Web Worker. Output (stdout + final value + matplotlib plots
captured as base64 PNG) renders inline.

**Pyodide-supported imports.** The validator scans for imports against a
list of unavailable packages (`PYTHON_UNAVAILABLE_PACKAGES`, 15 entries):
`requests`, `httpx`, `urllib3`, `flask`, `django`, `fastapi`,
`sqlalchemy`, `selenium`, `tensorflow`, `torch`, `keras`, `transformers`,
`cv2`, `pyarrow`, `polars`. These produce a hard error.

Pre-loaded packages: numpy, micropip, matplotlib, scikit-learn. First
run is slow (CDN download); subsequent runs on the same worker are fast.

**Hard checks:**
- `input()` rejected (no stdin in Pyodide Worker).
- `open(..., "w")` / `open(..., "x")` / `open(..., "a")` rejected (no
  persistent FS).
- `time.sleep(n)` with `n > 2` warns.
- `while True:` without `break` warns. **Rescan**: the regex looks for
  `\bbreak\b` in `codeNoComments` over the whole file — a `break` in an
  unrelated function would silently skip the warning.

**Soft warnings:**
- No `print()` or `plt.show()`.
- Missing matplotlib title/xlabel/ylabel/legend/tight_layout.

**Anti-patterns:**
- Importing Pyodide-unsupported packages.
- File I/O against the host filesystem.
- Long-running loops without yielding.
- `plt.savefig` (only `plt.show` is captured).

---

## 12. `application/3d` — React-Three-Fiber scenes

**Renderer.** `r3f-renderer.tsx` — iframe with **NO sandbox attribute**
(rescan **N-29**, documented as required for WebGL GPU access). Import
map pins React 18.3.1, Three 0.170.0, @react-three/fiber 8.17.10,
@react-three/drei 9.117.0 to specific versions via `esm.sh`.

**Code execution.** Sanitized scene code passed as JSON via a
`<script id="scene-data" type="application/json">` element. Babel
transpiles inside the iframe's module script;
`new Function(...depNames, compiled + ...)` executes it.

**Allowed deps.** `R3F_ALLOWED_DEPS` set (35 entries; `_validate-artifact.ts:641`):
`three`, `@react-three/fiber`, `@react-three/drei` symbols listed in the
prompt. Other imports are a soft warning (not hard error).

**Mandatory shape.**
- `export default` — required (renderer keys off the default export).
- No `<Canvas>` (wrapper provides it).
- No `<OrbitControls>` / `<Environment>` (wrapper provides them).
- No `import` statements — stripped by sanitizer; use globals.
- No `document.querySelector` / `document.getElementById`.
- No `requestAnimationFrame` — use `useFrame`.
- No `new THREE.WebGLRenderer`.

**postMessage** (rescan **N-27**): the iframe sends `r3f-error` and
`r3f-ready` events to the host; **the host has NO origin guard at lines
531-551**. Any frame on the page can spoof these events. R3F is the only
iframe renderer missing the guard.

**20-second `r3f-ready` timeout.** If the iframe never reports ready,
the WebGL help overlay fires. Rescan **N-37**: the timeout effect's
`didReady` is a `let` inside the closure — old `r3f-ready` events landing
in a new closure produce false-positive timeout errors.

**Anti-patterns:**
- Allocating objects inside `useFrame` (memory leak).
- Real-world objects from primitives — use glTF models.
- Model URLs outside the verified CDN lists.

---

## 13. Capabilities cross-cutting matrix

| Capability | HTML | React | SVG | Mermaid | Markdown | Document | Code | Sheet | LaTeX | Slides | Python | 3D |
|------------|:----:|:-----:|:---:|:-------:|:--------:|:--------:|:----:|:-----:|:-----:|:------:|:------:|:--:|
| Sandboxed iframe | ✓ | ✓ | – | – | – | – | – | – | – | ✓† | ✓ (worker) | ✗‡ |
| Tailwind CSS | ✓ | ✓ | – | – | – | – | – | – | – | – | – | – |
| Unsplash protocol | ✓ | – | – | – | – | ✓ | – | – | – | ✓ | – | – |
| Code-tab edit mode | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| Native export beyond source | – | – | – | – | – | DOCX | – | XLSX | – | PPTX | – | – |
| Server-side render | – | – | – | ✓ (DOCX) | – | ✓ (DOCX) | – | – | – | – | – | – |
| Theme-aware mermaid | – | – | – | ✓ | ✓ | ✓ (preview only — N-53) | – | – | – | ✗ (always light) | – | – |
| RAG indexed (LLM tool path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| RAG indexed (manual edit path) | ✗ (N-1) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Optimistic-locked update | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `isNew` strict gate | – | – | – | – | ✓ | – | – | – | – | ✓ | – | – |
| postMessage origin guard | n/a | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✓ | n/a | ✗ (N-27) |

† Slides sandbox is `allow-scripts allow-same-origin` — least restrictive.
‡ R3F has no sandbox attribute by design (WebGL GPU access).

---

## 14. Strict gates summary

A gate is "strict" when it applies to creates only or only when an env
flag is set.

| Gate | Where | Trigger |
|------|-------|---------|
| Markdown 128 KiB cap | `validateMarkdown` | `ctx?.isNew === true` |
| Markdown `<script>` hard error | `validateMarkdown` | `process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"` (any path) |
| Slides `image-text` rejection | `validateSlides` | `ctx?.isNew === true` |
| React aesthetic-directive required | `validateReact` | `process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"` (defaults to enforced) |
| Canvas-mode type lock | `create-artifact`, `update-artifact` | `context.canvasMode !== false && canvasMode !== "auto" && canvasMode !== type`. **Rescan N-7**: bypassed when `existing.artifactType` is null. |

When a strict gate fires the tool returns `validationErrors` with the
specific message, and the AI SDK's retry loop fires the LLM with the
error attached so it can self-correct.

---

## 15. Image protocol cheat sheet

The `unsplash:keyword` protocol works in three places:

1. **HTML** — `<img src="unsplash:keyword" alt="…" />`. Only in `src=`
   (not CSS `background-image`, not JS).
2. **Slides JSON** — `imageUrl`, `backgroundImage`, `quoteImage`,
   `gallery[].imageUrl`.
3. **DocumentAst** — any `image` block's `src`, plus `coverPage.logoUrl`.

The validator dispatcher (`_validate-artifact.ts:131-144`) post-resolves
HTML and slides via `resolveImages` / `resolveSlideImages`. The document
validator resolves AST-internally via `resolveUnsplashInAst`. All three
paths share `resolveQueries` from `unsplash/resolver.ts`, which provides:

- 30-day cache (`prisma.resolvedImage`) keyed on the normalized query.
- Per-query `try/catch` so one failing query doesn't poison a batch.
- `prisma.resolvedImage.upsert` for cache writes (handles concurrent
  writers on the unique `query` index).
- `placehold.co` fallback when Unsplash is unavailable / un-keyed.

When `UNSPLASH_ACCESS_KEY` is unset the resolver always returns the
placeholder. The fallback URL embeds the keyword as visible text so the
artifact still reads correctly.

**Stale path** (rescan **N-52**): `lib/rendering/client/svg-to-png.ts:75`
still constructs the deprecated `https://source.unsplash.com/1600x900/?${keyword}`
URL. PPTX exports that hit this path silently return null for most
queries.

---

## 16. Versioning + deletion guarantees

- Every update archives the prior content to `<canonicalKey>.v<N>` in S3
  (up to 20). The `metadata.versions[]` array records each archive's
  `s3Key`, `title`, `timestamp`, and `contentLength`.
- When S3 archival fails, content ≤ 32 KiB inlines into
  `metadata.versions[].content`; otherwise an `archiveFailed: true`
  marker.
- The panel UI shows "+N earlier versions evicted" when
  `metadata.evictedVersionCount > 0`.
- Historical-version preview validates that the content blob is
  recoverable; missing → "version content unavailable" notice.
- **Single-artifact delete** removes canonical S3 + every versioned key
  in `metadata.versions[].s3Key` + RAG chunks + Postgres row.
- **Session delete** removes canonical S3 + RAG chunks + artifact rows +
  session row, but **leaks versioned S3 keys** (rescan **N-47**) and is
  **not transactional** (rescan **N-48**).

---

## 17. RAG indexing per type

Every artifact is chunked + embedded + stored in SurrealDB. The chunker
uses 1000-char chunks with 200-char overlap, and the chunks are tagged
with `category: "ARTIFACT"`. The chunk text is `${title}\n\n${chunk.content}` —
title is prepended to every chunk.

`metadata.ragIndexed` records the latest indexing outcome:
- `true` — chunks present, searchable.
- `false` — empty content, embedding failure, or storage failure. Panel
  shows a "not searchable" badge on the header pill.

The indexer never rethrows — failure path writes
`metadata.ragIndexed: false` and returns. Callers fire-and-forget.

**Indexing latency** (rescan **N-49**): `storeChunks` does N sequential
SurrealDB inserts, no batching. A 128 KiB artifact produces ~140 chunks
→ ~140 sequential round-trips. Noticeable.

**Manual-edit RAG drift** (rescan **N-1**): the HTTP service path
(`updateDashboardChatSessionArtifact`) does **not** call
`indexArtifactContent`. Manual edits via the panel produce stale
`knowledge_search` results until the next LLM-driven update.

---

## 18. Soft warnings (don't fail validation but surface)

The validator returns `warnings[]` alongside errors. Warnings are
persisted into `metadata.validationWarnings` so the panel can show them.
Common warnings per type:

- HTML: missing `<title>`, low color contrast (heuristic).
- React: too many font families, palette mismatch (`PALETTE_MISMATCH_THRESHOLD = 6`).
- Markdown: heading-level skip, unlabeled fenced code, raw HTML tags
  from disallow list, `<script>` (unless strict mode is on).
- Sheet: > 100 rows, > 10 columns, currency-as-text, mixed date formats.
- Slides: > 6 bullets, > 10-word bullets, deck size out of 7–12,
  markdown syntax in text fields, `image-text` (unless `isNew`).
- 3D: missing R3F dep imports.

Warnings never block persist — they exist to flag readability/SEO/style
issues that don't break runtime.

**Quirk** (rescan **N-10**): `validationWarnings` is stored at different
metadata levels by `create-artifact.ts` (sibling of `artifactLanguage`)
vs `update-artifact.ts` (sibling of `versions`). Same key name, different
parent paths.

---

## 19. Build a new type — checklist

When adding a 13th artifact type:

1. **Add registry entry** at `registry.ts` — type, label, shortLabel,
   icon, colorClasses, extension, codeLanguage, hasCodeTab.
2. **Fill the validator slot** at `_validate-artifact.ts` — the
   `Record<ArtifactType, …>` won't compile until you do.
3. **Write the prompt** at `prompts/artifacts/<type>.ts` and register it
   in `prompts/artifacts/index.ts`. The `satisfies` clause forces the
   `type` field to match `ArtifactType`.
4. **Add a renderer** at `renderers/<type>-renderer.tsx` and a `case` in
   `artifact-renderer.tsx`.
5. **Add a panel-chrome label** if the panel needs a custom action button.
6. **Decide if `isNew` matters** — if the type can grow stricter rules
   over time, plumb `ctx?.isNew` into the validator now.
7. **Decide on Unsplash** — if the type carries images, follow §15.
8. **Tests** — add a fixture in `tests/unit/validate-artifact.test.ts`
   and a renderer fixture if non-trivial.
9. **Sandbox decision** for iframe renderers — match the `text/html`
   pattern (`allow-scripts allow-modals`) unless there's a specific need.
   Always include the postMessage `e.source` origin guard if the iframe
   talks to the parent (don't repeat the R3F mistake).
10. **`prompt.label`** — make it distinct from existing labels (don't
    use "Document" again — see N-17).

The exhaustive switches in `artifact-renderer.tsx` and the
`Record<ArtifactType, …>` validator map will surface missing branches at
compile time. The exhaustive `satisfies` constraint on `ALL_ARTIFACTS`
in `prompts/artifacts/index.ts` does the same for prompts.
