# Artifact System — Deep Scan

> **Audience:** an engineer or PM who has never opened the artifact code before. After reading this doc you should understand: what an artifact is, how content flows from the LLM to the screen and to S3, and where to look in the codebase for each part. Companion docs: [architecture-reference.md](./architecture-reference.md) (file:line audit) and [artifacts-capabilities.md](./artifacts-capabilities.md) (per-type capability spec).

**Last regenerated:** 2026-04-25 — fresh scan from `src/`, no carry-over from prior versions of this file.
**Stack:** Next.js 15 (App Router) · React 18 · AI SDK v6 · Prisma 5 · TypeScript · S3 (or MinIO) · Vector store (SurrealDB)

---

## TL;DR

An **artifact** is a substantial piece of LLM-generated content — a React component, an HTML page, a Word document, a Python script, a 3D scene, etc. — rendered in a resizable side panel of the chat UI. There are **12 artifact types**, one row per type in the central registry. The pipeline is:

```
LLM tool-call (create_artifact / update_artifact)
        ↓
validator (per-type, in _validate-artifact.ts)
        ↓
Unsplash resolver rewrites unsplash:keyword → real URLs (for HTML, Slides, Document)
        ↓
S3 upload + Prisma `Document` row
        ↓
fire-and-forget RAG indexing (chunk + embed + store)
        ↓
chat workspace receives tool output → state hook adds it to in-memory Map
        ↓
ArtifactIndicator chip renders inside the chat message
        ↓
user clicks chip → ResizablePanelGroup splits → ArtifactPanel mounts
        ↓
panel routes by type → lazy-loaded renderer renders preview
```

Versioning is FIFO with a hard cap of 20 historical versions per artifact, archived to S3 under `<key>.v<n>` keys with a 32 KB inline fallback when S3 fails. Content is hard-capped at **512 KB**. Deletion cascades S3 + Prisma + RAG.

---

## Table of contents

1. [What an artifact is](#1-what-an-artifact-is)
2. [The 12 types at a glance](#2-the-12-types-at-a-glance)
3. [End-to-end lifecycle flows](#3-end-to-end-lifecycle-flows)
4. [The registry — single source of truth](#4-the-registry--single-source-of-truth)
5. [The two LLM tools](#5-the-two-llm-tools)
6. [The validator dispatch](#6-the-validator-dispatch)
7. [The 12 artifact types — full per-type breakdown](#7-the-12-artifact-types--full-per-type-breakdown)
8. [Persistence: S3 + Prisma + versioning](#8-persistence-s3--prisma--versioning)
9. [Unsplash image resolution](#9-unsplash-image-resolution)
10. [Rendering layer](#10-rendering-layer)
11. [RAG indexing](#11-rag-indexing)
12. [Integration with the chat workspace](#12-integration-with-the-chat-workspace)
13. [API surface](#13-api-surface)
14. [Constants reference](#14-constants-reference)

---

## 1. What an artifact is

An artifact is a **first-class side-panel object** in the chat UI. It is created by the LLM through a tool call (not produced as inline text), persisted to S3 + Postgres so it survives reload, and shown in a resizable preview panel that can be edited or downloaded.

**Mental model:** very similar to Claude.ai Artifacts or ChatGPT Canvas — but tighter integration with the rest of the chat platform. Each artifact:

- Has a **canonical type** (one of 12 — full list below) that determines validator, renderer, file extension, and download behavior
- Is **persisted** in the Prisma `Document` table with `artifactType` set non-null (knowledge documents leave it null)
- Is **indexed for RAG** in the background so the assistant can later search across the user's artifacts
- Is **versioned** in place — every update archives the previous content to a versioned S3 key with FIFO eviction at 20 versions
- Is **rendered** by a lazy-loaded React component specific to its type

Content size is hard-capped at **512 KB**. Anything larger is rejected at create/update time with a validation error.

---

## 2. The 12 types at a glance

Order below matches `ARTIFACT_REGISTRY` in `src/features/conversations/components/chat/artifacts/registry.ts`:

| # | Type | Label | Content shape | Renderer | Download |
|--:|---|---|---|---|---|
| 1 | `text/html` | HTML Page | Full HTML doc | Sandboxed iframe (Tailwind CDN, Inter font, navigation blocker) | `.html` |
| 2 | `application/react` | React Component | Single component with `// @aesthetic:` line-1 directive (+ optional `// @fonts:` line 2) | Babel-transpiled iframe; React/Recharts/Lucide/Motion pre-injected as window globals | `.tsx` |
| 3 | `image/svg+xml` | SVG Graphic | Inline SVG markup | Inline DOM, sanitized by DOMPurify | `.svg` |
| 4 | `application/mermaid` | Mermaid Diagram | Raw mermaid syntax | Inline mermaid.js, theme-synced light/dark | `.mmd` |
| 5 | `text/markdown` | Markdown | GFM markdown (+ KaTeX `$…$`, fenced mermaid, fenced code) | Streamdown (react-markdown wrapper) with Shiki + remark-math + rehype-katex | `.md` |
| 6 | `text/document` | Document | **JSON `DocumentAst` tree** (typed block + inline nodes) | A4/Letter paper preview, walks AST, renders mermaid + chart blocks inline | Split-button: `.md` (client-side AST→md walk) + `.docx` (server-side via `astToDocx` + `docx` lib) |
| 7 | `application/code` | Code | Source text + `language` field | Streamdown wrapped in fence with the language tag (display-only, no execution) | `.txt` (extension overridden by language conventions) |
| 8 | `application/sheet` | Spreadsheet | **3 shapes**: CSV, JSON-array-of-objects, or `spreadsheet/v1` spec (multi-sheet workbook with formulas) | TanStack Table for CSV/array; lazy-loaded `SpecWorkbookView` for spec | `.csv` for flat data; `.xlsx` (ExcelJS, with cached values) for spec |
| 9 | `text/latex` | LaTeX / Math | LaTeX subset | Custom parser → KaTeX-rendered HTML, inline DOM | `.tex` (wrapped) |
| 10 | `application/slides` | Slides | JSON deck with theme + slides[]; 17 layout types | Iframe with `slidesToHtml` srcDoc, postMessage navigation | `.pptx` via `pptxgenjs` |
| 11 | `application/python` | Python Script | Python 3 source | Pyodide 0.27.6 in a Web Worker, with matplotlib `plt.show()` capture and stdout/stderr streaming | `.py` |
| 12 | `application/3d` | 3D Scene | R3F component source | Three.js + `@react-three/fiber` + 20 drei helpers; wrapper supplies Canvas, OrbitControls, Environment, lighting | `.tsx` |

Every type's metadata (label, icon, color, extension, whether it has a separate code tab) lives in **one place**: the registry array. Adding a new type means adding one row plus a renderer case + a validator function.

---

## 3. End-to-end lifecycle flows

### 3.1 Creation flow

Step-by-step, from the user typing to the artifact appearing in the panel:

1. **User asks for something:** "Build me a React dashboard" / "Write a proposal for Acme Corp" / etc.
2. **LLM decides to call `create_artifact`** with `{ title, type, content, language? }`. The Zod enum for `type` is derived from `ARTIFACT_TYPES` so the model can only pick from the 12 registered types.
3. **`createArtifactTool.execute()` runs server-side:**
   1. Generate UUID via `crypto.randomUUID()`
   2. Reject if `Buffer.byteLength(content, "utf-8")` > 512 KB
   3. If chat workspace had a Canvas-mode lock (e.g. user picked "HTML" from the toolbar), reject if the LLM tried to emit a different type
   4. If `type === "application/code"` and no `language`, return a validation error so the LLM retries with the language parameter
   5. Run `validateArtifactContent(type, content)` — dispatches to the per-type validator. Returns `{ ok, errors, warnings, content? }`. `content?` is set when the validator rewrote the input — currently used by `validateDocument` to bake resolved Unsplash URLs into the AST before persistence.
   6. For HTML and Slides, run `resolveHtmlImages(content)` / `resolveSlideImages(content)` — these regex-scan or JSON-walk for `unsplash:keyword`, then resolve via the cached Unsplash resolver and rewrite URLs.
   7. Build the S3 key: `artifacts/{orgId | "global"}/{sessionId}/{artifactId}{ext}` and upload with `uploadFile(key, buffer, mime)`.
   8. Create the Prisma `Document` row with `artifactType: type`, `categories: ["ARTIFACT"]`, `s3Key`, `fileSize`, `mimeType`, plus a `metadata` JSON containing `artifactLanguage` (for code) and `validationWarnings`.
   9. Fire `indexArtifactContent(id, title, content)` and `.catch()` log; do not block the response on it.
   10. Return `{ id, title, type, content: finalContent, language, persisted: true, warnings? }`.
4. **AI SDK streams** the tool output back to the chat workspace.
5. **`chat-workspace.tsx` detects** the tool output, calls `addOrUpdateArtifact(...)` from the `useArtifacts()` hook. This:
   1. If the ID doesn't exist: insert into `artifacts: Map<string, Artifact>` with `version: 1`, `previousVersions: []`.
   2. Set `activeArtifactId = id` (auto-open).
   3. Persist `activeArtifactId` to `sessionStorage` under key `rantai.artifact.active.{sessionId}`.
6. **`ArtifactIndicator`** renders a clickable chip inline in the chat message — icon + label + chevron, color-coded by type via `TYPE_COLORS`.
7. **`ArtifactPanel`** mounts in the right side of the `ResizablePanelGroup`. It dispatches the chosen type into `ArtifactRenderer`, which lazy-loads the type-specific renderer (`HtmlRenderer`, `ReactRenderer`, …) and shows it in the Preview tab.

### 3.2 View flow

When a new chat session loads, persisted artifacts come back from `GET /api/dashboard/chat/sessions/{id}` as a `PersistedArtifact[]`. The hook's `loadFromPersisted()` rebuilds the in-memory `Map<string, Artifact>`, restoring version histories from the `metadata.versions[]` blob. If `sessionStorage` had an `activeArtifactId` for that session, the panel reopens automatically.

### 3.3 Update flow (manual edit OR LLM update)

The same code path runs for both cases — the LLM tool and the user-facing edit endpoint share `validateArtifactContent` + the version-archival logic.

1. **Edit source:** the panel toggles into edit mode; the user changes content in a `<textarea>` (or for code-type artifacts, in the code tab of the panel).
2. **Save click:** the panel `PUT`s `/api/dashboard/chat/sessions/{sessionId}/artifacts/{artifactId}` with `{ content, title? }`.
3. **`updateDashboardChatSessionArtifact()`** in `service.ts`:
   1. Verify session ownership.
   2. Run the validator. If it fails, return `422` with formatted error string. The panel surfaces this inline.
   3. Archive the old content: upload the **previous** content to `{originalKey}.v{versionNum}`. If S3 fails AND the previous content was ≤ 32 KB, store it inline in `metadata.versions[].content`. Otherwise mark `archiveFailed: true` so we don't lose the audit trail entirely.
   4. Push a version entry: `{ title, timestamp, contentLength, s3Key? | content? | archiveFailed? }`.
   5. If `versions.length > 20`, FIFO-evict the oldest and increment `evictedVersionCount` so the UI can display "+N earlier versions evicted".
   6. Upload the new content to the original `s3Key` (overwriting).
   7. `prisma.document.update({ data: { content, title, fileSize, metadata } })`.
   8. Re-run RAG indexing with `{ isUpdate: true }` (deletes old chunks first).
4. **Response:** the panel updates its in-memory state via `addOrUpdateArtifact`, which pushes the previous in-memory content into `previousVersions[]` and increments `version`.

The same flow applies when the LLM calls `update_artifact` — only the entry point changes.

### 3.4 Delete flow

`DELETE` on the same route → `deleteDashboardChatSessionArtifact()` → S3 cleanup (non-fatal) → `prisma.document.delete()`. The panel calls `removeArtifact(id)` which closes the panel if the deleted artifact was active.

### 3.5 Document download flow (DOCX)

Specific to `text/document`:

1. Panel split-button → "Word (.docx)" → `GET /api/dashboard/chat/sessions/{id}/artifacts/{artifactId}/download?format=docx`.
2. Route runs in **Node runtime** (`export const runtime = "nodejs"` — required for `astToDocx`).
3. Auth + ownership check; reject with 400 if `artifactType !== "text/document"`.
4. `JSON.parse(content)` → `DocumentAstSchema.safeParse()` → if invalid, return 409.
5. Call `astToDocx(ast)` from `src/lib/document-ast/to-docx.ts`. This uses the `docx` npm package (pure JS) plus the shared rendering module to rasterize embedded mermaid + chart blocks (`mermaidToSvg` via jsdom → `svgToPng` via sharp; `chartToSvg` via D3).
6. Return blob with `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, sanitized filename, `Cache-Control: no-store`.

The `.md` button is fully client-side: the panel walks the AST in the browser to synthesize markdown, no network trip.

---

## 4. The registry — single source of truth

**File:** `src/features/conversations/components/chat/artifacts/registry.ts`

Adding a new artifact type means editing **one** file. Everything else (validator dispatch, renderer dispatch, Zod enum, UI chrome, download extension) is derived.

The registry exports:

```typescript
interface ArtifactRegistryEntry {
  type: ArtifactType
  label: string         // long UI label, e.g. "React Component"
  shortLabel: string    // panel pill label, e.g. "React"
  icon: LucideIcon      // imported from @/lib/icons
  colorClasses: string  // Tailwind classes for type chip
  extension: string     // download extension, e.g. ".tsx"
  codeLanguage: string  // shiki language for code tab; "" if none
  hasCodeTab: boolean   // whether panel exposes a separate code tab
}

const ARTIFACT_REGISTRY: readonly ArtifactRegistryEntry[] = [/* 12 entries */]

type ArtifactType = (typeof ARTIFACT_REGISTRY)[number]["type"]
const ARTIFACT_TYPES: ArtifactType[]                    // for iteration
const VALID_ARTIFACT_TYPES: ReadonlySet<ArtifactType>   // for membership

const TYPE_ICONS: Record<ArtifactType, LucideIcon>
const TYPE_LABELS: Record<ArtifactType, string>
const TYPE_SHORT_LABELS: Record<ArtifactType, string>
const TYPE_COLORS: Record<ArtifactType, string>

function getArtifactRegistryEntry(type: string): ArtifactRegistryEntry | undefined
```

The Zod enum in `create-artifact.ts` is `z.enum(ARTIFACT_TYPES as unknown as [ArtifactType, ...ArtifactType[]])` — so the LLM's allowed-types list updates automatically whenever the registry changes.

`text/document` and `application/code` set `hasCodeTab: false`. For `text/document` the AST JSON *is* the source of truth and showing it in a code tab would be confusing; for `application/code` the preview is the code (display-only).

---

## 5. The two LLM tools

**Files:** `src/lib/tools/builtin/create-artifact.ts`, `src/lib/tools/builtin/update-artifact.ts`. Both registered (alongside ~12 other built-in tools) in `src/lib/tools/builtin/index.ts` and seeded into the database by `src/lib/tools/seed.ts`. Both are flagged **non-user-selectable** — they're triggered by the LLM, not surfaced in the user's tool picker.

### `create_artifact`

| Field | Required | Notes |
|---|---|---|
| `title` | ✓ | 3–8 word descriptive title |
| `type` | ✓ | One of the 12 enum values |
| `content` | ✓ | Complete, self-contained content. Hard cap 512 KB. |
| `language` | optional | Required for `application/code` (e.g. `"python"`, `"rust"`, `"typescript"`). |

Returns: `{ id, title, type, content, language?, persisted, warnings?, error?, validationErrors? }`.

### `update_artifact`

| Field | Required | Notes |
|---|---|---|
| `id` | ✓ | UUID returned by `create_artifact` |
| `title` | optional | Keep existing title if omitted |
| `content` | ✓ | Complete replacement (no diffs / no partial). |

Returns: `{ id, title, content, updated: true, persisted, warnings? }`.

`type` is **not** a parameter of `update_artifact` — the type is derived from the persisted artifact and cannot be changed in-place. To switch types, call `create_artifact` with a new content.

---

## 6. The validator dispatch

**File:** `src/lib/tools/builtin/_validate-artifact.ts` (~2000 lines).

A central `VALIDATORS: Record<ArtifactType, (content) => Result | Promise<Result>>` map dispatches to a per-type function. The result shape is:

```typescript
interface ArtifactValidationResult {
  ok: boolean
  errors: string[]    // hard failures — block create/update
  warnings: string[]  // soft nags — surface in metadata, do not block
  content?: string    // optional rewrite — used by validateDocument to bake in resolved Unsplash URLs
}
```

Key validator behaviors at a glance:

- **`validateHtml`** — parse5 tree walk; require `<!DOCTYPE html>`, `<html>`/`<head>`/`<body>`, non-empty `<title>`, `<meta name="viewport">`. Reject `<form action>` (sandbox blocks submissions). Warn if inline `<style>` block > 10 lines (prefer Tailwind).
- **`validateReact`** — strip directive lines, parse with `@babel/parser` (`sourceType: "module"`, `plugins: ["jsx"]`). Require `export default`. Reject class components. Whitelist imports to `react`, `react-dom`, `recharts`, `lucide-react`, `framer-motion` (relative paths also OK). Reject `document.querySelector` / `getElementById`. Reject CSS imports. The directive layer (next bullet) runs first.
- **React directives** — line 1 must be `// @aesthetic: <direction>` where direction ∈ {editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic}. Optional line 2: `// @fonts: Family:spec | Family:spec | …` (max 3 families, pipe-separated). The env flag `ARTIFACT_REACT_AESTHETIC_REQUIRED` controls enforcement: anything other than `"false"` (the default) hard-errors on a missing/unknown directive; `"false"` downgrades it to a warning. Soft-warn on aesthetic/palette/font/motion mismatches (e.g. `industrial` direction using `Motion.AnimatePresence`).
- **`validateSvg`** — parse5 walk. Reject `<script>`, `<style>`, `<foreignObject>`. Reject external `href`/`xlink:href` (only same-doc `#fragment` refs). Strip event-handler attributes. Warn if > 5 distinct colors, missing viewBox, or path coordinates with > 2 decimal precision.
- **`validateMermaid`** — find first non-comment/non-frontmatter line, require recognized diagram declaration (27 supported types). Reject markdown fence wrappers. Warn if > 3000 chars; for flowcharts, warn if > 15 node definitions. Reject `%%{init: theme: …}%%` (breaks dark mode sync).
- **`validateMarkdown`** — soft warnings only (no hard errors). Warn on missing top-level `#`, heading-level jumps, raw HTML tags (details/iframe/etc), `<script>`, missing language tags on fenced code blocks.
- **`validateDocument`** — `JSON.parse` → `validateDocumentAst()` (Zod schema) → `resolveUnsplashInAst()` → return rewritten JSON in `content`. Semantic checks include: anchor `bookmarkId` must reference an existing heading; `pageNumber` only valid inside header/footer; table `sum(columnWidths) === width` and per-row cell count (with colspan) matches column count; `unsplash:` must have non-empty keyword; `mermaid.code` first token must be one of 16 supported diagram declarations.
- **`validateCode`** — reject HTML doctype (wrong type), reject markdown fence wrapper. Warn on truncation/placeholder markers (`// ... rest`, `TODO: implement`, `unimplemented!()`).
- **`validateSheet`** — peek first non-whitespace char. `{` + has `kind` field → spec validator (full Zod + formula DAG); `[` → JSON-array-of-objects (matching keys, no nested objects, warn on >100 rows / >10 columns); else → CSV (uniform column count, mixed-date warning, currency-leaking warning).
- **`validateLatex`** — reject full-LaTeX preamble (`\documentclass`, `\usepackage`, `\begin{document}`). Reject unsupported KaTeX commands (`\includegraphics`, `\bibliography`, `\begin{tikzpicture}`). Warn if no math delimiter at all (recommend markdown instead).
- **`validateSlides`** — JSON parse, ≥1 slide, layout must be one of 18 valid types. Per-layout required-field checks. Warn on <7 or >12 slides, on first slide not being `title` and last not being `closing`, on bullet count > 6 or words/bullet > 10. Warn on markdown leakage in text fields.
- **`validatePython`** — reject markdown fence wrappers. Reject imports of unavailable packages (requests, urllib3, httpx, flask, django, fastapi, sqlalchemy, selenium, tensorflow, torch, keras, transformers, opencv-python). Reject `input()` and `open(write)`. Warn on missing output (no `print` or `plt.show`), on `time.sleep > 2s`, on `while True` without `break`.
- **`validate3d`** — reject `<Canvas>`, `<OrbitControls>`, `<Environment>` (the wrapper provides them). Reject `document.*`, `requestAnimationFrame`, `new THREE.WebGLRenderer()`. Require `export default`. Warn on imports outside the R3F whitelist (~40 symbols across react / three / @react-three/fiber / @react-three/drei).

---

## 7. The 12 artifact types — full per-type breakdown

This section is the heart of the doc. Each subsection covers: prompt rules at a glance, content shape, validator highlights, renderer behavior, sandbox/security, download. For deeper per-type capability matrices see [artifacts-capabilities.md](./artifacts-capabilities.md); for file:line cites see [architecture-reference.md](./architecture-reference.md).

### 7.1 `text/html` — HTML Page

**Prompt** ([html.ts](../../src/lib/prompts/artifacts/html.ts)) tells the LLM to emit a self-contained HTML document. Tailwind is auto-injected from CDN and Inter is auto-injected from Google Fonts. The LLM may use `unsplash:keyword phrase` in `<img src>` for Unsplash images; the server resolves these to real photo URLs at create-time.

**Renderer** (`renderers/html-renderer.tsx`, ~136 lines):
- Iframe with `srcDoc` and sandbox `allow-scripts allow-modals` — *no* `allow-same-origin`, *no* `allow-top-navigation`, *no* `allow-forms` (so `<form action>` cannot POST).
- A **navigation blocker** script is injected first — before any user code or CDN scripts. It overrides `Location.assign/replace/reload`, intercepts `location.href` assignment, blocks anchor clicks (non-fragment, non-`javascript:`), blocks form submissions, blocks `history.pushState/replaceState`, and stubs `window.open`. This ensures the iframe stays on the artifact's content; users cannot accidentally be navigated away.
- Tailwind CDN (`https://cdn.tailwindcss.com`) and Inter font are conditionally injected if not already present in the user-supplied HTML (regex check).
- Partial HTML (just a body fragment) is auto-wrapped in a full document with charset + viewport + base styles.
- A 5-second slow-load warning is shown but the spinner is only cleared by the actual `onLoad` event.

**Validator** parses with parse5, requires DOCTYPE/html/head/body/title/viewport, rejects `<form action>`, soft-warns on long inline `<style>`.

**Download** is a raw `.html` save.

### 7.2 `application/react` — React Component

**Prompt** ([react.ts](../../src/lib/prompts/artifacts/react.ts), ~169 lines): the LLM writes a single React component. **Line 1 must be** `// @aesthetic: <direction>` where the direction is one of:

| Direction | When to pick | Default fonts |
|---|---|---|
| editorial | articles, brand pages, storytelling, long-form | Fraunces + Inter |
| brutalist | indie tools, manifestos, dev products, "raw" | Space Grotesk + JetBrains Mono |
| luxury | premium, hospitality, fashion | DM Serif Display + DM Sans |
| playful | onboarding, kids, creative tools | Fredoka |
| industrial | dashboards, admin, monitoring | Inter Tight + Space Mono |
| organic | wellness, food, crafts | Fraunces + Public Sans |
| retro-futuristic | gaming, sci-fi, events | VT323 + Space Mono |

Optional line 2: `// @fonts: Family:spec | Family:spec | …` for explicit overrides (max 3 families, pipe-separated). Each spec validates against `/^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|…)$/`.

**Pre-injected globals** (the LLM uses these directly without imports):

| Library | Symbol | Version |
|---|---|---|
| React 18 | `React` (and 26 hooks pre-destructured: `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`, `useReducer`, `useId`, `useTransition`, `useDeferredValue`, `useSyncExternalStore`, `useInsertionEffect`, `useLayoutEffect`, `createContext`, `forwardRef`, `memo`, `Fragment`, `Suspense`, `lazy`, `startTransition`, `Children`, `cloneElement`, `createElement`, `isValidElement`) | 18 (UMD) |
| Recharts | `Recharts.LineChart`, `Recharts.BarChart`, `Recharts.PieChart`, `Recharts.AreaChart`, `Recharts.ResponsiveContainer`, `Recharts.Tooltip`, etc. | 2 (UMD) |
| Lucide React | `LucideReact.ArrowRight`, `LucideReact.Check`, etc. | 0.454.0 (UMD) |
| Framer Motion | `Motion.motion.div`, `Motion.AnimatePresence` | 11 (UMD) |
| Tailwind CSS | utility classes via CDN | v3 |

**Renderer** (`renderers/react-renderer.tsx`, ~574 lines) — the most complex renderer:
1. Strip directive lines (lines 1–2) before transpiling.
2. Hide template literals (`` `…` ``) so import-regex doesn't match inside strings, then collapse multi-line imports onto a single line.
3. Rewrite imports: `import { useState } from 'react'` → `const { useState } = React;` (only for symbols not in the pre-destructured 26). Other-package imports (`recharts`, `framer-motion`, `lucide-react`) become `const X = GLOBAL_NAME;`.
4. Strip side-effect imports (`import './styles.css'`).
5. Transform `export default` into a named const/function so the iframe can mount it.
6. Restore template literals.
7. Build the iframe `srcDoc`: Tailwind CDN + font links from `buildFontLinks(aesthetic, fonts)` + React UMDs + Babel-standalone + Recharts + Lucide + Framer Motion + navigation blocker + a `<script type="text/babel">` block containing the user code wrapped in an `__ArtifactErrorBoundary` class.
8. Sandbox `allow-scripts` only — **no** `allow-modals`. Errors postMessage'd back to parent; parent shows fatal error card with Retry / Fix-with-AI / View Source, or warning banner for non-fatal issues.

**Validator** rejects: missing `export default`, class components, non-whitelisted imports, `document.*` access, CSS imports. The directive layer hard-errors on missing/unknown `@aesthetic:` (gated by `ARTIFACT_REACT_AESTHETIC_REQUIRED` env). Soft-warns on `>= 6 slate-*/indigo-* references` outside of `industrial` direction (palette mismatch), `editorial`/`luxury` without a serif `@fonts`, or `industrial` using `Motion.AnimatePresence`.

**Download** is `.tsx`.

### 7.3 `image/svg+xml` — SVG Graphic

**Prompt** ([svg.ts](../../src/lib/prompts/artifacts/svg.ts), ~150 lines): inline SVG markup. `viewBox` is required (no hardcoded width/height). Four style categories with slightly different conventions: **icon** (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`), **illustration** (`viewBox="0 0 400 300"`, 3–5 colors), **logo / badge** (square or rectangular wordmark, ≤3 colors, bold filled shapes), **diagram** (proportional, 2–4 colors, consistent stroke widths). Animation supported via SMIL only. Maximum 5 distinct colors per SVG.

**Renderer** (`renderers/svg-renderer.tsx`, ~92 lines):
- Inline DOM render (no iframe).
- Validates with `DOMParser` first, checking for `<parsererror>` and `<svg>` root.
- Sanitizes with `DOMPurify` (`USE_PROFILES: { svg: true, svgFilters: true }`, `ADD_TAGS: ["use"]`).
- DOMPurify strips: `<script>`, `<style>` blocks, `<foreignObject>`, event handlers (`onclick`, `onload`), foreign namespaces.
- Renders with `dangerouslySetInnerHTML` after sanitization.

**Validator** also runs the same parse5 tree walk plus shape checks (`scriptCount === 0`, `foreignObjectCount === 0`, `styleBlockCount === 0`, `externalHrefs === 0`, `colorValues ≤ 5`).

**Download** is `.svg`.

### 7.4 `application/mermaid` — Mermaid Diagram

**Prompt** ([mermaid.ts](../../src/lib/prompts/artifacts/mermaid.ts), ~249 lines): raw mermaid syntax. Up to 14 diagram types: `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`/`stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `journey`, `c4Context`, `gitGraph`, `quadrantChart`, `requirementDiagram`, plus `xychart-beta` and `sankey-beta`. Maximum 15 nodes per diagram for readability. Labels ≤ 5 words.

**Renderer** (`renderers/mermaid-renderer.tsx`, ~172 lines):
- Inline DOM render (no iframe).
- Module-level singleton: `import("mermaid")` happens once and is cached. Theme tracked separately — re-initialize only when light/dark changes.
- Theme config from `mermaid-config.ts` (~502 lines!) maps Tailwind design tokens to mermaid theme variables for both modes; `securityLevel: "strict"` and `htmlLabels: false` so user code can't escape.
- `mermaid.parse(content, { suppressErrors: true })` first to validate syntax, then `mermaid.render(id, content)` for the SVG.
- `dangerouslySetInnerHTML` for the resulting SVG.
- Errors get a Retry + View-Source + Fix-with-AI control row.
- Cancellation flag prevents state updates if the user navigates away mid-render.

**Validator** finds the first meaningful line, requires a recognized diagram type declaration, rejects markdown fence wrappers, warns if > 15 node definitions in a flowchart or if `%%{init}%%` is used.

**Download** is `.mmd`.

### 7.5 `text/markdown` — Markdown

**Prompt** ([markdown.ts](../../src/lib/prompts/artifacts/markdown.ts), ~245 lines): GFM markdown. Supports inline math `$…$`, display math `$$…$$`, fenced mermaid blocks, fenced code with language tags (Shiki highlight), GFM tables, task lists, strikethrough. **No raw HTML** — `<details>`, `<kbd>`, `<script>` will be stripped or rendered unreliably.

**Renderer**: there is no dedicated `MarkdownRenderer`; the dispatcher routes `text/markdown` to `StreamdownContent` directly (which is also used for chat-message body rendering elsewhere in the app). It wraps the `streamdown` npm package with:

- Shiki for code syntax highlighting (theme-aware: dark theme uses `["github-dark", "github-light"]`)
- `controls: { code: true, table: true, mermaid: true }` — enables interactive controls
- `mermaid: { errorComponent: MermaidError }` — custom error UI for failed inline mermaid
- `plugins.math: { remarkPlugin: remark-math, rehypePlugin: rehype-katex }` — KaTeX math rendering
- `animated` + `isAnimating` for streaming UI

**Validator** is the most permissive — only soft warnings, no hard errors.

**Download** is `.md`.

### 7.6 `text/document` — Document (the AST type)

This is the most complex type. The LLM emits a **JSON `DocumentAst` tree** (not markdown text), which the validator parses with Zod and which the renderer walks node-by-node.

**Prompt** ([document.ts](../../src/lib/prompts/artifacts/document.ts), ~308 lines):
- **Output format: JSON ONLY** — no markdown fences, no commentary, no text before `{` or after `}`.
- Decision boundaries vs `text/markdown` and `text/html` (heuristic: "if someone will print, sign, send, or archive it → text/document; if someone will read it once on a screen → text/markdown").
- Top-level: `{ meta, coverPage?, header?, footer?, body }`.
- `meta` carries title, author, date (ISO 8601), subtitle, organization, documentNumber, pageSize (`"letter"` | `"a4"`), orientation (`"portrait"` | `"landscape"`), margins (DXA — 1440 = 1 inch), font (default `"Arial"`), fontSize (8–24, default 12), showPageNumbers.
- 11 **block node types**: `paragraph`, `heading` (level 1–6, with optional `bookmarkId` for TOC + anchor targets), `list` (ordered/unordered, with sublists), `table` (column widths in DXA, must sum to width), `image` (URL or `unsplash:keyword`, required `alt`), `blockquote` (with optional attribution), `codeBlock` (with language), `horizontalRule`, `pageBreak`, `toc` (with `maxLevel` 1–6), `mermaid` (raw mermaid code, max 10k chars, dimensions clamped 200–1600 × 150–1200), `chart` (reuses `ChartData` from slides — bar/bar-horizontal/line/pie/donut).
- 7 **inline node types**: `text` (with style flags: bold/italic/underline/strike/code/superscript/subscript, plus `color: "#rrggbb"`), `link`, `anchor` (internal cross-ref), `footnote`, `lineBreak`, `pageNumber` (only valid in header/footer), `tab` (with optional `leader: "dot"` for letter/TOC layouts).

**Schema** (`src/lib/document-ast/schema.ts`, ~376 lines): full Zod schema with discriminated unions and lazy circular references. Hard caps include: `title` 1–200 chars, `author`/`organization` ≤ 120, `date` regex `/^\d{4}-\d{2}-\d{2}$/`, `mermaid.code` 1–10000 chars, color regex `/^#[0-9a-fA-F]{6}$/`. `image.src` is intentionally NOT validated as `.url()` so `"unsplash:keyword"` passes.

**Validator** (`validateDocument`, async): JSON parse → `validateDocumentAst()` (Zod + 128 KB serialized-size cap) → semantic checks (anchor bookmark resolution, pageNumber scope, table column-width invariants, mermaid first-token check, unsplash keyword non-empty) → `resolveUnsplashInAst()` walks the tree, dedups `unsplash:` keywords, parallel-fetches via the cached resolver, deep-clones and rewrites in place. Returns `JSON.stringify(resolvedAst)` as the rewritten content so persistence stores resolved URLs.

**Renderer** (`renderers/document-renderer.tsx`, ~617 lines):
- Inline DOM render (no iframe).
- Walks the AST via `renderInline()` and `renderBlock()` recursive functions.
- Page sized to A4 (794×1123 px) or Letter (816×1056 px) at 96 DPI; margins from `meta.margins` converted DXA → px (`(dxa / 1440) * 96`).
- Headings → `<h1>`–`<h6>` with cascading sizes, `bookmarkId` preserved as the element id.
- Lists are recursive (sublists supported).
- Tables: column widths from spec, header rows styled, cells can have colspan/rowspan + shading + alignment.
- **Mermaid blocks** rendered by `MermaidPreviewBlock` — dynamic-import mermaid, initialize with the **shared** `MERMAID_INIT_OPTIONS` from `src/lib/rendering/mermaid-theme.ts` (note: this is *different* from the standalone `MermaidRenderer` which uses theme-aware `getMermaidConfig`), call `mermaid.render()`, set the SVG via `dangerouslySetInnerHTML`. Caption rendered as `<figcaption>`.
- **Chart blocks** rendered by `ChartPreviewBlock` — call `chartToSvg(chart, 800, 400)` from `src/lib/rendering/chart-to-svg.ts` and inject the SVG.
- TOC built post-walk by traversing body for headings ≤ `maxLevel`.
- Footnotes use a single sink object passed through the entire render tree; rendered in a footnotes section at document end.

**DOCX export** (`src/lib/document-ast/to-docx.ts`, ~657 lines): `astToDocx(ast): Promise<Buffer>` using the [`docx`](https://www.npmjs.com/package/docx) npm package (MIT). Page setup from `meta`. Cover page rendered with 48pt centered title, 28pt italic subtitle, 24/22pt centered author/org/date stack. Inline rendering produces `TextRun` / `ExternalHyperlink` / `InternalHyperlink` (for anchors) / `FootnoteReferenceRun` / `PageNumber.CURRENT`. Block rendering produces `Paragraph` (with mapped alignment, spacing, indentation), `Table` (with col widths in DXA, colspan/rowspan, vertical align, shading, borders), `ImageRun` (fetches over HTTP with 10-second timeout, falls back to a 1×1 transparent PNG on failure; SVG inputs are rejected by the `docx` package). **Mermaid blocks** route through `mermaidToSvg()` (jsdom shim) → `resizeSvg()` → `svgToPng()` (sharp). **Chart blocks** route through `chartToSvg()` → `svgToPng()`. Heading bookmarkIds map to Word bookmarks; the `toc` node renders as a real Word `TableOfContents` field with `hyperlink: true`. Footnotes accumulated during body rendering, attached via `Document.footnotes`. Numbering config defines 3 levels each for bullets (•/◦/▪) and ordered (`%1.`/`%2.`/`%3.`).

**Download** is split-button:
- **Markdown (.md)**: client-side, walks the AST in the browser to synthesize markdown. Lossy — mermaid/chart blocks become placeholder fences.
- **Word (.docx)**: `GET /api/dashboard/chat/sessions/{id}/artifacts/{artifactId}/download?format=docx` — Node runtime, calls `astToDocx`, returns blob. Filename sanitized from `meta.title`.

PDF export is **not shipped**.

### 7.7 `application/code` — Code (display-only)

**Prompt** ([code.ts](../../src/lib/prompts/artifacts/code.ts), ~317 lines): source code with strict no-truncation, no-placeholder rules. The LLM must specify `language` (parameter on the tool call). Per-language conventions (TypeScript: ES modules, no `any`, JSDoc on public functions; Python: 3.10+, type hints, `if __name__ == "__main__":`; Rust: `Result<T, E>`, `?` propagation; Go: check every `error`; SQL: uppercase keywords; Shell: `#!/usr/bin/env bash`, `set -euo pipefail`).

**Renderer**: dispatched to `StreamdownContent` with the content wrapped in a fence + language tag. The dispatcher computes the longest backtick run inside the content and uses `fence-length + 1` so embedded code blocks don't break syntax highlighting.

**Validator** rejects content that looks like HTML (`<!doctype` / `<html`), rejects markdown fence wrappers (the wrapper is added by the renderer, not the LLM), warns on truncation markers (`// ... rest`, `TODO: implement`, `unimplemented!()`).

**Download**: extension determined by `language` param when generating the filename (e.g. `.py`, `.ts`, `.rs`).

### 7.8 `application/sheet` — Spreadsheet (3 content shapes)

**Prompt** ([sheet.ts](../../src/lib/prompts/artifacts/sheet.ts), ~122 lines) — three shapes:

1. **CSV** (default for flat tabular data): header row required, RFC-4180 quoting (escape literal quotes by doubling: `"She said ""hi"""`), every row matching column count.
2. **JSON array of objects**: `[{...}, {...}]` with the same keys in the same order on every object, no nested objects.
3. **`spreadsheet/v1` spec**: structured workbook with formulas, multi-sheet, named ranges, merged cells, frozen panes, cell styles, Excel number formats. Hard caps: 8 sheets per workbook, 500 cells per sheet, 200 formulas per workbook, 64 named ranges, sheet name length ≤ 31 chars.

**Spec schema** (`src/lib/spreadsheet/types.ts`):

```typescript
{
  kind: "spreadsheet/v1",
  theme?: { font?, inputColor?, formulaColor?, crossSheetColor?, highlightFill? },
  namedRanges?: { GrowthRate: "Assumptions!B2", … },
  sheets: [
    {
      name: "Assumptions",
      columns?: [{ width?, format? }, …],
      frozen?: { rows?, columns? },
      cells: [
        { ref: "A1", value: "Metric", style: "header" },
        { ref: "B2", value: 0.18, format: "0.0%", style: "input", note: "Q4 trend" },
        { ref: "B3", formula: "=B2 * (1 + GrowthRate)", style: "formula" },
        …
      ],
      merges?: ["A1:B2", …]
    },
    …
  ]
}
```

Six named cell styles: `header`, `input` (blue, manually editable), `formula` (computed), `cross-sheet` (green), `highlight` (yellow fill), `note` (italic gray).

**Validator** detects shape by peeking the first non-whitespace character. For spec, runs `parseSpec()` then evaluates formulas to surface circular refs / undefined refs as errors at authoring time. For JSON, enforces matching keys and warns on >100 rows / >10 cols / nested objects. For CSV, enforces uniform column count and warns on currency/thousands formatting in flat data (recommend the spec instead).

**Renderer** (`renderers/sheet-renderer.tsx` + `sheet-spec-view.tsx`):
- The base `SheetRenderer` calls `detectShape(content)`. CSV / JSON-array → TanStack React Table with sort + filter + CSV export. Spec → `<SpecWorkbookView>` (lazy-loaded).
- `SpecWorkbookView` (~250 lines): sheet tabs at the bottom; column letters (A, B, …) + row numbers Excel-style; `ƒx` toggle switches between computed values and raw formulas; click-a-cell footer shows the cell's ref + formula + format + note. Formulas evaluated via dynamic import of `evaluateWorkbook()` from `@/lib/spreadsheet/formulas`.

**Formula evaluator** (`src/lib/spreadsheet/formulas.ts`, ~274 lines):
- Library: `fast-formula-parser@1.0.19` (MIT) + `@formulajs/formulajs@4.6.0` (MIT, ~500 Excel functions). `HyperFormula` was rejected because it's GPL-3.0.
- Phases: build cell index → seed literal cells → build dep graph via `DepParser` (resolves named ranges + expands ranges) → topological sort (Kahn's algorithm; remaining cells after pass = circular ref → error `"CIRCULAR"`) → build `FormulaParser` with onCell/onRange/onVariable callbacks → evaluate in topo order, catch `FormulaError` and store result + optional error code.
- Errors surfaced: `#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!`, `CIRCULAR`.

**XLSX export** (`src/lib/spreadsheet/generate-xlsx.ts`, ~145 lines):
- Library: `exceljs@4.4.0` (MIT). Lazy-loaded — zero main bundle cost until user clicks download.
- Writes formulas with cached values (`{ formula, result }`) so Excel/LibreOffice/Google Sheets/Numbers open the file with values **already visible**, no F9 recalc needed.
- Exports: merges, named ranges (via `wb.definedNames`), frozen panes, styles (font color, fill, bold, italic), column widths, cell notes (Excel comments).
- Style `applyStyle()` maps named styles to ExcelJS font + fill objects.
- Color conversion: `#RRGGBB` → `FFRRGGBB` (ExcelJS argb format with alpha=FF).

**Download**: split-button when content is a spec (`.csv` flattens active sheet, `.xlsx` exports the full workbook). For CSV/JSON-array shapes, single button: `.csv`.

### 7.9 `text/latex` — LaTeX / Math

**Prompt** ([latex.ts](../../src/lib/prompts/artifacts/latex.ts), ~212 lines): a LaTeX subset compatible with KaTeX. Supports `\section`/`\subsection`/`\subsubsection`, `\paragraph`, `itemize`/`enumerate`, `\textbf`/`\textit`/`\emph`/`\underline`/`\texttt`/`\href`, `\quote`/`\abstract`. Math environments: `equation`, `align`/`align*`, `gather`/`gather*`, `multline`/`multline*`, `cases`. Inside math: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `array`. Full KaTeX symbol set (Greek, operators, relations, sets, fractions, decorations).

**Not** supported: `\documentclass`, `\usepackage`, `\begin{document}` (silently stripped), `\maketitle`, `\label`/`\ref`/`\eqref`, `\input`/`\include`, `\includegraphics`, `\begin{figure}`, `\begin{tikzpicture}`, `\verb`/`\verbatim`.

**Renderer** (`renderers/latex-renderer.tsx`, ~523 lines):
- Custom LaTeX → HTML parser (no full LaTeX engine).
- KaTeX `katex.renderToString()` with `displayMode` flag for inline vs block math (`throwOnError: false`, `trust: true`).
- **Balanced-brace argument reader** (key trick): handles `\section{$f(x)$}` correctly without breaking at the `}` inside math. All command-arg parsing uses brace-depth tracking, never naive `[^}]*` regex.
- Two-pass: extract preamble (`\title`/`\author`/`\date`), then line-by-line walk handling sectioning, lists, math environments, display math (`\[…\]` and `$$…$$`), `\begin{quote}`/`\begin{abstract}`, regular paragraphs.
- Inline LaTeX processor recursively handles text commands inside math and vice versa (e.g. `\textbf{$x$}` works).
- Styled inline render via `dangerouslySetInnerHTML`. No iframe.

**Validator** errors on `\documentclass`/`\usepackage`/`\begin{document}` and on `\includegraphics`/`\bibliography`/`\begin{tikzpicture}`. Warns if no math delimiter present (recommend markdown instead).

**Download** is `.tex`, wrapped in a minimal compilable preamble (the wrapper, not the artifact, contains `\documentclass{article}`).

### 7.10 `application/slides` — Slides (Presentation Deck)

**Prompt** ([slides.ts](../../src/lib/prompts/artifacts/slides.ts), ~591 lines — by far the largest prompt): JSON-only output, no markdown fences. `{ theme: { primaryColor, secondaryColor, fontFamily }, slides: [...] }`. Approved primaryColors are **dark and desaturated** (`#0F172A` slate-900, `#1E293B` slate-800, `#0C1222`, `#042F2E`, `#1C1917` stone-900, `#1A1A2E`); approved secondaries are vivid accents (`#3B82F6` blue, `#06B6D4` cyan, `#10B981` emerald, `#F59E0B` amber, `#8B5CF6` violet, `#EC4899` pink). Default `fontFamily: "Inter, sans-serif"`.

**17 layouts** (6 text + 11 visual):

- **title** — opening slide, dark gradient, centered. Required: title, subtitle.
- **content** — workhorse, white bg, accent-bar title, bullets (≤ 6, ≤ 10 words each) or content body.
- **two-column** — comparison; `leftColumn` ≤ 5 items + balanced `rightColumn`.
- **section** — chapter divider, dark gradient, centered.
- **quote** — testimonial; `quote` 5–25 words, optional `attribution`, optional `quoteImage` (URL or `unsplash:`), `quoteStyle: "minimal" | "large" | "card"`.
- **closing** — final slide, dark gradient, CTA.
- **diagram** — full-slide mermaid (≤ 15 nodes).
- **image** — full-slide centered image with optional caption.
- **chart** — full-slide ChartData (bar/bar-horizontal/line/pie/donut).
- **diagram-content** / **image-content** / **chart-content** — split layout with text/bullets on the right, visual on the left (≤ 10 nodes for split mermaid).
- **hero** — full-bleed background image with text overlay; `overlay: "dark" | "light" | "none"`.
- **stats** — 2–4 big KPI numbers in a grid; each `{ value, label, trend?, change? }`.
- **gallery** — image grid (4–12 items, 2–6 columns); each `{ imageUrl, caption? }`.
- **comparison** — feature comparison table; `comparisonHeaders` + `comparisonRows[].values` (true→✓, false→✗, or string).
- **features** — icon-based feature grid (3–6 items, 2–4 columns); icons by Lucide name.

Inline `{icon:icon-name}` works in any text field — kebab-case Lucide names get rendered as inline SVG in the HTML preview but stripped in the PPTX export (PowerPoint doesn't support inline SVG).

Deck conventions: 7–12 slides, first slide must be `title`, last must be `closing`, ≥ 3 different layouts.

**Renderer** (`renderers/slides-renderer.tsx`, ~148 lines):
- Iframe with `srcDoc = slidesToHtml(presentation)` and sandbox `allow-scripts allow-same-origin` (same-origin needed for postMessage).
- `slidesToHtml()` (`src/lib/slides/render-html.ts`, ~1325 lines!) generates a full HTML document with inline CSS, all layout types, embedded mermaid divs (rendered client-side by mermaid.js inside the iframe), embedded chart SVGs (from `chartToSvg()`), inline icon SVGs, and a slide-navigation script.
- Parent ↔ iframe via `postMessage`: iframe sends `{ type: "slideChange", current, total }`, parent sends `{ type: "navigate", direction | index }`.
- Keyboard navigation in parent: arrow keys → postMessage to iframe (preventDefault to avoid page scroll).
- Slide-dot indicators visible only when 1 < total ≤ 20 (avoid layout bloat for big decks).

**Legacy markdown parser** (`src/lib/slides/parse-legacy.ts`): if content doesn't parse as JSON or lacks a `slides` array, fall back to splitting on `\n---\n` and parsing title/bullets/content per slide.

**PPTX export** (`src/lib/slides/generate-pptx.ts`, ~1532 lines): `generatePptx(data): Promise<Blob>` using `pptxgenjs@4.0.1`, layout LAYOUT_WIDE (13.333"×7.5"). Per-layout renderers:
- **diagram / chart / image / gallery / hero / quote-with-image** are async — they fetch/render images, mermaid (`mermaidToBase64Png()`), or charts (`chartToSvg() → svgToBase64Png()`) client-side using the browser Canvas API at 2× internal resolution.
- **No native PPTX charts** — charts are rasterized to PNG.
- **No `<svg>` in PPTX** — PowerPoint doesn't support inline SVG; everything visual is embedded as PNG.
- Inline `{icon:name}` syntax stripped via `cleanPptx()`.

**Validator** runs deep per-layout checks (see §6 above).

**Download** is `.pptx`.

### 7.11 `application/python` — Python Script (executable)

**Prompt** ([python.ts](../../src/lib/prompts/artifacts/python.ts), ~191 lines): Python 3.12 source. Pre-loaded packages (no `micropip` install needed): `numpy`, `matplotlib`, `pandas`, `scipy`, `sympy`, `networkx`, `scikit-learn` (as `sklearn`), `pillow` (as `PIL`), `pytz`, `python-dateutil` (as `dateutil`), `regex`, `beautifulsoup4` (as `bs4`), `lxml`, `pyyaml` (as `yaml`), plus the full standard library.

**Not** available — will crash on import: `requests`, `urllib3`, `httpx`, `flask`, `django`, `fastapi`, `sqlalchemy`, `selenium`, `tensorflow`, `torch`, `keras`, `transformers`, `opencv-python`, `pyarrow`, `polars`.

Required: every script must produce visible output (`print()` or `plt.show()`). No `input()`, no `open()`, no real network requests, no `threading`.

**Renderer** (`renderers/python-renderer.tsx`, ~308 lines):
- Off-main-thread execution in a Web Worker.
- Pyodide v0.27.6 from CDN (`pyodide.js`).
- Pre-load on init: `numpy`, `micropip`, `matplotlib`, `scikit-learn`.
- Matplotlib interceptor installed at init: `matplotlib.use('Agg')` then monkey-patch `plt.show` to write the figure to a `BytesIO`, base64-encode the PNG, and append to a `__plot_images__` list. This list is reset per-run.
- stdout / stderr captured via `py.setStdout({ batched: ... })` / `py.setStderr({ batched: ... })`, streamed to the parent via postMessage.
- Worker reused across runs; terminated on component unmount.

**Validator** rejects fence wrappers and imports of unavailable packages. Rejects `input()` and `open(write)`. Warns on missing output, on `time.sleep > 2s`, on `while True:` without `break`.

**Download** is `.py`.

### 7.12 `application/3d` — 3D Scene (R3F)

**Prompt** ([r3f.ts](../../src/lib/prompts/artifacts/r3f.ts), ~280 lines): a single React Three Fiber component. The wrapper provides `<Canvas>`, `<ambientLight>`, `<directionalLight>`, `<Environment preset="city">`, `<OrbitControls makeDefault dampingFactor={0.05}>`, and `<Suspense>` — the LLM must NOT include them. The user component returns `<group>`, `<mesh>`, or a Fragment.

**Pre-injected**: React 18.3.1 + all hooks; Three.js 0.170.0 as `THREE`; `@react-three/fiber` 8.17.10 (`useFrame`, `useThree`); `@react-three/drei` 9.117.0 — exactly 20 helpers exposed: `useGLTF`, `useAnimations`, `Clone`, `Float`, `Sparkles`, `Stars`, `Text`, `Center`, `Billboard`, `Grid`, `Html`, `Line`, `Trail`, `Sphere`, `RoundedBox`, `MeshDistortMaterial`, `MeshWobbleMaterial`, `MeshTransmissionMaterial`, `GradientTexture`. Babel 7.26.10 transpiles JSX + TypeScript.

**Verified glTF CDNs** for `useGLTF`:
- KhronosGroup: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb` — 20+ models including Fox (animated, scale 0.02), Duck, DamagedHelmet, Avocado (scale ~20), CesiumMan, BrainStem, ToyCar, BoomBox, WaterBottle, AntiqueCamera, BarramundiFish, ChronographWatch, DragonAttenuation, etc.
- three.js examples: `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb` — Parrot, Flamingo, Stork, Soldier, Xbot, LittlestTokyo.

**Renderer** (`renderers/r3f-renderer.tsx`, ~622 lines): Babel-transpiled component, mounted inside the wrapper Canvas. Sandboxed iframe similar to the React renderer.

**Validator** rejects `<Canvas>`/`<OrbitControls>`/`<Environment>` (provided by wrapper), `document.*`, `requestAnimationFrame`, `new THREE.WebGLRenderer()`. Requires `export default`. Warns on imports outside the ~40-symbol R3F whitelist.

**Download** is `.tsx`.

---

## 8. Persistence: S3 + Prisma + versioning

### 8.1 Storage layout

Every artifact's primary content lives at the S3 key:

```
artifacts/{orgId | "global"}/{sessionId}/{artifactId}{extension}
```

The extension comes from `getArtifactRegistryEntry(type).extension`. So an HTML artifact in session `abc-123` for org `acme` is at `artifacts/acme/abc-123/<uuid>.html`.

When an artifact is updated, the **previous** content gets archived to a versioned key:

```
artifacts/acme/abc-123/<uuid>.html.v1
artifacts/acme/abc-123/<uuid>.html.v2
…
```

### 8.2 Prisma `Document` row

Artifacts share the `Document` table with knowledge documents. The `artifactType` column (nullable string) is the marker — non-null = artifact, null = knowledge doc. Every artifact query filters on `artifactType: { not: null }`.

```prisma
model Document {
  id             String    @id @default(cuid())
  title          String
  content        String              // current artifact content (also in S3)
  categories     String[]            // ["ARTIFACT"]
  subcategory    String?
  metadata       Json?               // versions, ragIndexed, language, warnings
  s3Key          String?             // primary S3 key
  fileType       String?             // "artifact"
  fileSize       Int?
  mimeType       String?
  organizationId String?
  organization   Organization? @relation(...)
  createdBy      String?
  sessionId      String?
  session        DashboardSession? @relation(...)
  artifactType   String?             // <-- the artifact-vs-knowledge marker
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
  @@index([s3Key])
  @@index([sessionId])
}
```

The `metadata` JSON has roughly this shape for artifacts:

```typescript
{
  artifactLanguage?: string,             // for application/code
  versions?: Array<{
    title: string
    timestamp: number                    // unix ms
    contentLength: number
    s3Key?: string                       // archived version key
    content?: string                     // inline fallback (≤ 32 KB)
    archiveFailed?: boolean              // S3 failed AND too large for inline
  }>,
  evictedVersionCount?: number,
  ragIndexed?: boolean,                  // true / false / undefined
  validationWarnings?: string[]
}
```

### 8.3 Versioning rules

- `MAX_VERSION_HISTORY = 20`. FIFO eviction once exceeded; `evictedVersionCount` increments by however many were evicted in that update.
- `MAX_INLINE_FALLBACK_BYTES = 32 KB`. Only if S3 archive fails *and* the previous content ≤ 32 KB do we inline. Otherwise the version metadata records `archiveFailed: true`.
- `MAX_ARTIFACT_CONTENT_BYTES = 512 KB`. Hard cap; rejected at create/update time.

### 8.4 Service / repository layer

Three top-level functions in `src/features/conversations/sessions/service.ts`:

- `getDashboardChatSessionArtifact({ userId, sessionId, artifactId })` — session-ownership check + return formatted artifact.
- `updateDashboardChatSessionArtifact({ userId, sessionId, artifactId, input: { content, title? } })` — same validation as the LLM tool, same version archival, same FIFO. Returns `422` on validation failure with formatted errors so the panel can show them inline in edit mode.
- `deleteDashboardChatSessionArtifact({ userId, sessionId, artifactId })` — S3 cleanup (non-fatal if it fails) + Prisma delete.

The repository (`repository.ts`) exposes the actual Prisma queries: `findDashboardArtifactByIdAndSession`, `updateDashboardArtifactById`, `deleteDashboardArtifactById`, `findArtifactsBySessionId` (id + s3Key only — for cleanup), `deleteArtifactsBySessionId`.

---

## 9. Unsplash image resolution

**Why this exists:** the LLM doesn't know the URLs of nice photos. Instead of generating placeholder URLs that don't work, it writes `unsplash:keyword phrase` and the server resolves it to a real Unsplash photo URL with attribution, cached for 30 days in Postgres.

**Where it runs:**

| Type | Triggered by | Mechanism |
|---|---|---|
| `text/html` | `create_artifact` / `update_artifact` after validator | Regex-scan `src="unsplash:..."` in `<img>` tags |
| `application/slides` | `create_artifact` / `update_artifact` after validator | JSON-walk fields: `imageUrl`, `backgroundImage`, `quoteImage`, `gallery[].imageUrl` |
| `text/document` | inside `validateDocument` (returned in `content`) | AST-walk all image nodes (block, header, footer, coverPage.logoUrl) |
| Other types | — | Not supported. SVG sanitizer strips externals; Markdown does not auto-resolve `unsplash:` (use a real URL or the `text/document` type). |

**Pipeline** (`src/lib/unsplash/resolver.ts`):

1. **Collect** the unique normalized keywords (lowercase, trim, collapse whitespace, slice to 50 chars).
2. **Cache lookup** against Prisma's `ResolvedImage` table (UNIQUE on `query`, with `expiresAt` 30 days out).
3. **Fetch uncached** in parallel via `searchPhoto(query)` (`src/lib/unsplash/client.ts`): `GET https://api.unsplash.com/search/photos?query=&per_page=1&orientation=landscape`, with `Client-ID` header from `UNSPLASH_API_KEY` env var, 5-second timeout via `AbortSignal.timeout`.
4. **On hit**: use `photo.urls.regular + "&w=1200"` for optimal loading; persist with `attribution: "Photo by {name} on Unsplash"` and `expiresAt` 30 days out. Race conditions on the UNIQUE constraint are swallowed.
5. **On miss / API error / timeout**: fall back to `https://placehold.co/1200x800/f1f5f9/64748b?text={encodedKeyword}`. Resolution **never throws** — always returns valid content.

For `text/document`, the resolver runs *inside* `validateDocument` so the persisted JSON contains real URLs (no client-side resolution needed at render time).

---

## 10. Rendering layer

### 10.1 Lazy-loading dispatcher

`src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (~140 lines) is a thin client component that imports each renderer via `next/dynamic()`. Each `dynamic()` call gets its own `loading: () => <RendererLoading message="..." />` fallback so the user sees a contextual spinner ("Transpiling React component…", "Initializing Python runtime…", "Building slide deck…", "Compiling 3D scene…").

The dispatcher's switch covers all 12 types. `application/code` is special-cased: it wraps the content in a fence with the language tag (computing the fence length based on the longest backtick run inside the content) before passing to `StreamdownContent`. `text/markdown` passes through directly.

### 10.2 Sandboxing strategy

| Renderer | Mode | Sandbox |
|---|---|---|
| HTML | iframe | `allow-scripts allow-modals` + injected navigation blocker |
| React | iframe | `allow-scripts` only + injected navigation blocker |
| SVG | inline DOM | DOMPurify (svg + svgFilters profile, ADD_TAGS use) |
| Mermaid | inline DOM | mermaid.js `securityLevel: "strict"`, `htmlLabels: false` |
| Markdown | inline DOM | Streamdown handles XSS via react-markdown |
| Document | inline DOM | upstream Zod schema validates; AST nodes can't carry executable HTML |
| Code | inline DOM | display-only, no execution |
| Sheet | inline DOM | TanStack Table renders as plain HTML; spec evaluator runs main-thread |
| LaTeX | inline DOM | KaTeX with `trust: true` (filters dangerous commands itself) |
| Slides | iframe | `allow-scripts allow-same-origin` (postMessage requires same-origin) |
| Python | Web Worker | Pyodide isolates Python from DOM; only stdout/stderr/plot postMessage |
| R3F | iframe | similar to React + Three.js |

### 10.3 Shared rendering module

`src/lib/rendering/` is the unification layer used by both slides and documents:

- `mermaid-theme.ts` — `MERMAID_INIT_OPTIONS` (theme variables + base config). One config in the repo.
- `chart-to-svg.ts` — D3-based chart-to-SVG, isomorphic (no browser/server-only deps). Bar / bar-horizontal / line / pie / donut. 8-color default palette.
- `resize-svg.ts` — pure regex resize of root `<svg>` width/height attributes; isomorphic.
- `server/mermaid-to-svg.ts` — `mermaidToSvg(code)` using `jsdom` to shim `window`/`document`/`DOMParser`/`navigator`. Stubs `getBBox()` and `getComputedTextLength()` (jsdom doesn't implement them). Restores globals in `finally` for Node singleton safety.
- `server/svg-to-png.ts` — `svgToPng(svg, w, h)` via `sharp` with `fit: "contain"`, white background, lanczos3 kernel, flatten alpha, PNG compression level 6.
- `client/mermaid-to-png.ts` — `mermaidToBase64Png(code, w, h)` via dynamic-import mermaid + browser Canvas at 2× resolution.
- `client/svg-to-png.ts` — `svgToBase64Png(svg, w, h)` and `fetchImageAsBase64(url)` (with `unsplash:` → `source.unsplash.com` rewrite).

This module replaced an older `src/lib/slides/chart-to-svg.ts` + `src/lib/slides/svg-to-png.ts` pair; slides imports were flipped to it as part of the unification work, so today there is exactly one mermaid theme and one SVG resize helper in the repo.

---

## 11. RAG indexing

`src/lib/rag/artifact-indexer.ts`:

```typescript
export async function indexArtifactContent(
  documentId: string,
  title: string,
  content: string,
  options?: { isUpdate?: boolean }
): Promise<void>
```

Pipeline:

1. If `isUpdate`, call `deleteChunksByDocumentId(documentId)` to clear stale chunks first.
2. `chunkDocument(content, title, "ARTIFACT", undefined, { chunkSize: 1000, chunkOverlap: 200 })` — sliding-window chunks with overlap.
3. Prepend the title to each chunk before embedding (gives every vector access to the artifact's name).
4. `generateEmbeddings(chunkTexts)` — batch embedding API call.
5. `storeChunks(documentId, chunks, embeddings)` → SurrealDB vector store.
6. `markRagStatus(documentId, true)` — patches `metadata.ragIndexed`.

On any failure: `markRagStatus(documentId, false)` instead. Both `create_artifact.ts` and `update_artifact.ts` invoke this with `.catch()` so a failure never breaks the user-visible flow. The panel header surfaces a "Not searchable" badge if `ragIndexed === false`.

---

## 12. Integration with the chat workspace

### 12.1 The `useArtifacts` hook

`src/features/conversations/components/chat/artifacts/use-artifacts.ts` (~144 lines) is the in-memory state hook:

```typescript
useArtifacts(sessionKey?: string | null) → {
  artifacts: Map<string, Artifact>
  activeArtifact: Artifact | null
  activeArtifactId: string | null
  addOrUpdateArtifact(input): void
  removeArtifact(id): void
  loadFromPersisted(persisted: PersistedArtifact[]): void
  openArtifact(id): void
  closeArtifact(): void
}
```

- `Map<string, Artifact>` for O(1) lookup.
- Per-session `sessionStorage` persistence of `activeArtifactId` under key `rantai.artifact.active.{sessionKey}`. Privacy-mode failures are swallowed.
- `addOrUpdateArtifact` pushes the existing in-memory state into `previousVersions[]` before overwriting and increments `version`. Auto-opens the artifact.
- `loadFromPersisted` rebuilds the Map from server data; if the previously active artifact no longer exists, clears the active id.

### 12.2 The panel

`artifact-panel.tsx` (~939 lines) is the chrome around the renderer. Key behaviors:

- **Tabs**: Preview (default) and Code. The Code tab is hidden for types where `hasCodeTab: false` (`text/document`, `application/code`).
- **Version navigation**: arrow buttons cycle through `previousVersions`. "Restore" button when viewing a historical version. "+N earlier versions evicted" tooltip when `evictedVersionCount > 0`.
- **Edit mode**: turns the Code tab into an editable textarea. Save → PUT to the API; on `422`, show the formatted validation error inline.
- **Fullscreen**: portal-rendered fullscreen modal.
- **Download split-button**: type-specific. PPTX for slides, split `.md`/`.docx` for documents, raw download for the rest. Failures are caught into an `exportError` state without crashing the panel.
- **RAG badge**: "Not searchable" if `ragIndexed === false`; absent if `undefined` or `true`.
- **Fix-with-AI**: callback fires for renderers that detected a runtime error (React, Mermaid, Python, R3F) — sends the error back to the assistant for an automated fix attempt.

### 12.3 The indicator chip

`artifact-indicator.tsx` (~48 lines) — the clickable chip that appears in chat messages. Animated entry, color from `TYPE_COLORS`, icon from `TYPE_ICONS`, label from `TYPE_LABELS`. Click opens the panel.

### 12.4 Wiring in `chat-workspace.tsx`

The chat workspace:

1. Calls `useArtifacts(apiSessionId || session?.id || null)` once.
2. Calls `loadFreshSessionArtifacts()` on session-load to populate from `GET /api/dashboard/chat/sessions/{id}`.
3. Detects `create_artifact` / `update_artifact` tool outputs in the streaming response and calls `addOrUpdateArtifact(...)`.
4. Renders `<ArtifactIndicator>` inline in the message list and `<ArtifactPanel>` inside the right `<ResizablePanel>` when `activeArtifact` is set.
5. Dispatches a custom DOM event `artifact-panel-changed` with `{ open: boolean }` so the surrounding layout can collapse the chat sidebar.

---

## 13. API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard/chat/sessions/{id}` | Returns session + `artifacts: PersistedArtifact[]` |
| `PUT` | `/api/dashboard/chat/sessions/{id}/artifacts/{artifactId}` | Update content / title (manual edit). 422 on validation failure. |
| `DELETE` | `/api/dashboard/chat/sessions/{id}/artifacts/{artifactId}` | Delete artifact + S3 cleanup |
| `GET` | `/api/dashboard/chat/sessions/{id}/artifacts/{artifactId}/download?format=docx` | DOCX export for `text/document` (Node runtime) |

There is **no** REST endpoint for create — artifacts are always created via the AI SDK tool call (`create_artifact`).

---

## 14. Constants reference

| Constant | Value | Defined in | Purpose |
|---|---|---|---|
| `MAX_ARTIFACT_CONTENT_BYTES` | 524288 (512 KB) | `create-artifact.ts`, `update-artifact.ts` | Hard cap on artifact content size |
| `MAX_VERSION_HISTORY` | 20 | `update-artifact.ts`, `service.ts` | FIFO cap on stored versions per artifact |
| `MAX_INLINE_FALLBACK_BYTES` | 32768 (32 KB) | `update-artifact.ts`, `service.ts` | Inline-version size cap when S3 fails |
| `ARTIFACT_REACT_AESTHETIC_REQUIRED` | env, default enforce | `_validate-artifact.ts` | Set to `"false"` to downgrade missing/unknown `@aesthetic:` to a warning |
| `MAX_FONT_FAMILIES` | 3 | `_react-directives.ts` | Cap on `// @fonts:` families per React artifact |
| `SPREADSHEET_CAPS.maxSheets` | 8 | `src/lib/spreadsheet/types.ts` | Per-workbook sheet cap |
| `SPREADSHEET_CAPS.maxCellsPerSheet` | 500 | `src/lib/spreadsheet/types.ts` | Per-sheet cell cap |
| `SPREADSHEET_CAPS.maxFormulasPerWorkbook` | 200 | `src/lib/spreadsheet/types.ts` | Cross-workbook formula cap |
| `SPREADSHEET_CAPS.maxNamedRanges` | 64 | `src/lib/spreadsheet/types.ts` | Named-range cap |
| `SPREADSHEET_CAPS.maxSheetNameLength` | 31 | `src/lib/spreadsheet/types.ts` | Excel-compatible sheet name length |
| Mermaid node cap | 15 | prompt + validator (mermaid.ts, _validate-artifact.ts) | Soft cap warned by validator |
| Slide deck size | 7–12 | prompt + validator (slides.ts, _validate-artifact.ts) | Min/max slides per deck (warn outside) |
| Document max content (validator) | 128 KB serialized | `src/lib/document-ast/validate.ts` | Pre-Zod size budget |
| Mermaid block dimensions | 200–1600 × 150–1200 | `src/lib/document-ast/schema.ts` | Per-block image dimensions |

---

## See also

- [architecture-reference.md](./architecture-reference.md) — file:line audit of every artifact surface in the codebase
- [artifacts-capabilities.md](./artifacts-capabilities.md) — per-type capability spec (matrix + constraints + anti-patterns + dependencies)
