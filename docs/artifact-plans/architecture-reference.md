# Artifact System — Architecture Reference

> **Audience:** an engineer who needs to find where something lives in the code. This doc is structured as a **file:line audit** — every claim points at a specific source file and line range. For the system-level narrative read [artifacts-deepscan.md](./artifacts-deepscan.md); for per-type capabilities read [artifacts-capabilities.md](./artifacts-capabilities.md).

**Last regenerated:** 2026-04-25 — fresh scan from `src/`.

---

## Table of contents

- [A. The single source of truth: registry](#a-the-single-source-of-truth-registry)
- [B. Type definitions and state hook](#b-type-definitions-and-state-hook)
- [C. Prompt layer (`src/lib/prompts/artifacts/`)](#c-prompt-layer)
- [D. AI tool layer (`src/lib/tools/builtin/`)](#d-ai-tool-layer)
- [E. Validator layer (`src/lib/tools/builtin/_validate-artifact.ts`)](#e-validator-layer)
- [F. Renderer layer (`src/features/conversations/components/chat/artifacts/renderers/`)](#f-renderer-layer)
- [G. Document AST module (`src/lib/document-ast/`)](#g-document-ast-module)
- [H. Slides module (`src/lib/slides/`)](#h-slides-module)
- [I. Spreadsheet module (`src/lib/spreadsheet/`)](#i-spreadsheet-module)
- [J. Shared rendering module (`src/lib/rendering/`)](#j-shared-rendering-module)
- [K. Unsplash module (`src/lib/unsplash/`)](#k-unsplash-module)
- [L. RAG indexer (`src/lib/rag/`)](#l-rag-indexer)
- [M. S3 helpers (`src/lib/s3/`)](#m-s3-helpers)
- [N. API routes](#n-api-routes)
- [O. Service / repository (`src/features/conversations/sessions/`)](#o-service--repository)
- [P. Database schema (`prisma/schema.prisma`)](#p-database-schema)
- [Q. UI shell (panel, indicator, dispatcher)](#q-ui-shell)
- [R. Tool registration & seeding](#r-tool-registration--seeding)
- [S. Constants reference](#s-constants-reference)
- [T. Environment flags](#t-environment-flags)

---

## A. The single source of truth: registry

**File:** `src/features/conversations/components/chat/artifacts/registry.ts` (219 lines)
**Purpose:** one array drives type validation, iteration order, UI metadata, download extension, and every Record map elsewhere in the codebase.

### A.1 `ArtifactRegistryEntry` interface (L35–L60)

```typescript
interface ArtifactRegistryEntry {
  type: ArtifactType
  label: string         // e.g., "HTML Page"
  shortLabel: string    // e.g., "HTML"
  icon: LucideIcon      // imported from @/lib/icons
  colorClasses: string  // tailwind chip classes
  extension: string     // download extension, e.g., ".html"
  codeLanguage: string  // shiki language; "" = no separate language
  hasCodeTab: boolean   // true unless preview *is* the source
}
```

### A.2 `ARTIFACT_REGISTRY` array (L62–L183)

12 entries in this order:

| # | Line range | type | label | extension | hasCodeTab |
|--:|---|---|---|---|---|
| 1 | L63–L72 | `text/html` | HTML Page | `.html` | true |
| 2 | L73–L82 | `application/react` | React Component | `.tsx` | true |
| 3 | L83–L92 | `image/svg+xml` | SVG Graphic | `.svg` | true |
| 4 | L93–L102 | `application/mermaid` | Mermaid Diagram | `.mmd` | true |
| 5 | L103–L112 | `text/markdown` | Markdown | `.md` | true |
| 6 | L113–L122 | `text/document` | Document | `.docx` | **false** |
| 7 | L123–L132 | `application/code` | Code | `.txt` | **false** |
| 8 | L133–L142 | `application/sheet` | Spreadsheet | `.csv` | true |
| 9 | L143–L152 | `text/latex` | LaTeX / Math | `.tex` | true |
| 10 | L153–L162 | `application/slides` | Slides | `.pptx` | true |
| 11 | L163–L172 | `application/python` | Python Script | `.py` | true |
| 12 | L173–L182 | `application/3d` | 3D Scene | `.tsx` | true |

### A.3 Derived exports (L185–L218)

- `ArtifactType = (typeof ARTIFACT_REGISTRY)[number]["type"]` — union type (L185)
- `ARTIFACT_TYPES: readonly ArtifactType[]` — for iteration (L187)
- `VALID_ARTIFACT_TYPES: ReadonlySet<ArtifactType>` — for membership (L189)
- `BY_TYPE: Map<ArtifactType, ArtifactRegistryEntry>` — for direct lookup (L191–L193)
- `getArtifactRegistryEntry(type): ArtifactRegistryEntry | undefined` (L196–L200)
- `TYPE_ICONS: Record<ArtifactType, LucideIcon>` (L202–L205)
- `TYPE_LABELS: Record<ArtifactType, string>` (L207–L210)
- `TYPE_SHORT_LABELS: Record<ArtifactType, string>` (L212–L214)
- `TYPE_COLORS: Record<ArtifactType, string>` (L216–L218)

**Adding a new type:** add an entry to `ARTIFACT_REGISTRY`. All maps update automatically. Compile errors will then appear at:
- `src/lib/tools/builtin/_validate-artifact.ts` `VALIDATORS` map (need a new validator)
- `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` switch (need a new case)
- `src/lib/prompts/artifacts/index.ts` `ALL_ARTIFACTS` tuple (need a new prompt config — the compiler enforces the prompt's `type` matches the registry entry)

---

## B. Type definitions and state hook

### B.1 `types.ts`

**File:** `src/features/conversations/components/chat/artifacts/types.ts` (62 lines)

- L9–L13: re-exports `ARTIFACT_TYPES`, `VALID_ARTIFACT_TYPES`, and `ArtifactType` from `./registry`.
- L17–L19: `isValidArtifactType(value): value is ArtifactType` type guard.
- L21–L25: `ArtifactVersion` interface — `{ content: string; title: string; timestamp: number }`.
- L27–L47: `Artifact` interface — `{ id, title, type, content, language?, version, previousVersions[], evictedVersionCount?, ragIndexed? }`.
- L50–L61: `PersistedArtifact` interface — server JSON shape: `{ id, title, content, artifactType, metadata? }` where `metadata` carries `artifactLanguage`, `versions`, `evictedVersionCount`, `ragIndexed`.

### B.2 `use-artifacts.ts`

**File:** `src/features/conversations/components/chat/artifacts/use-artifacts.ts` (144 lines)

- L17: `ACTIVE_ARTIFACT_KEY_PREFIX = "rantai.artifact.active."` — sessionStorage key prefix.
- L19–L21: `useArtifacts(sessionKey?: string | null)` — hook signature.
- L25–L35: sessionStorage **restore** on mount (L28–L30 read, L33 catch privacy errors).
- L37–L50: sessionStorage **persist** on `activeArtifactId` change (L42–L43 write, L44–L46 remove on null, L47 catch).
- L52–L83: `addOrUpdateArtifact(input)` — pushes existing state into `previousVersions[]` before overwriting (L54–L62), increments `version` (L63), or initializes new artifact at version 1 (L74–L79). Auto-opens at L82.
- L85–L92: `removeArtifact(id)` — closes if active (L89).
- L94–L96: `closeArtifact()` — sets `activeArtifactId = null`.
- L98–L100: `openArtifact(id)`.
- L102–L127: `loadFromPersisted(persisted[])` — rebuilds Map; clears `activeArtifactId` if no longer present (L124–L126).

---

## C. Prompt layer

**Directory:** `src/lib/prompts/artifacts/`

### C.1 `index.ts`

```typescript
import { htmlArtifact } from "./html"
import { reactArtifact } from "./react"
import { svgArtifact } from "./svg"
import { mermaidArtifact } from "./mermaid"
import { markdownArtifact } from "./markdown"
import { documentArtifact } from "./document"
import { codeArtifact } from "./code"
import { sheetArtifact } from "./sheet"
import { latexArtifact } from "./latex"
import { slidesArtifact } from "./slides"
import { pythonArtifact } from "./python"
import { r3fArtifact } from "./r3f"

export const ALL_ARTIFACTS = [
  htmlArtifact, reactArtifact, svgArtifact, mermaidArtifact,
  markdownArtifact, documentArtifact, codeArtifact, sheetArtifact,
  latexArtifact, slidesArtifact, pythonArtifact, r3fArtifact,
] as const

export const CANVAS_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.label]))
export const ARTIFACT_TYPE_INSTRUCTIONS: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.rules]))
export const ARTIFACT_TYPE_SUMMARIES: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.summary]))
```

### C.2 Prompt file inventory

| File | Lines | Type | Examples imported from |
|---|--:|---|---|
| `html.ts` | ~164 | `text/html` | inline strings |
| `react.ts` | ~169 | `application/react` | inline strings (4 directions covered; full 7 in test fixtures) |
| `svg.ts` | ~150 | `image/svg+xml` | inline strings |
| `mermaid.ts` | ~249 | `application/mermaid` | inline strings |
| `markdown.ts` | ~245 | `text/markdown` | inline strings (README + backprop tutorial) |
| `document.ts` | ~308 | `text/document` | `@/lib/document-ast/examples/{proposal,report,letter}` |
| `code.ts` | ~317 | `application/code` | inline strings |
| `sheet.ts` | ~122 | `application/sheet` | inline strings (3 shapes) |
| `latex.ts` | ~212 | `text/latex` | inline strings |
| `slides.ts` | ~591 | `application/slides` | inline strings (fintech pitch + microservice migration) |
| `python.ts` | ~191 | `application/python` | inline strings |
| `r3f.ts` | ~280 | `application/3d` | inline strings (geometric + animated Fox) |
| `context.ts` | ~53 | (utility) | — |

Total: ~3000 lines of prompt rules.

### C.3 `context.ts`

**File:** `src/lib/prompts/artifacts/context.ts` (53 lines)
**Purpose:** canvas-mode context injection. When the user picks a specific type from the toolbar, `assembleArtifactContext()` returns the full `rules` for that type plus design tokens (palette / typography / spacing) — but only for **5 visual types** (`text/html`, `application/react`, `image/svg+xml`, `application/slides`, `application/3d`). For other modes only the rules are injected.

### C.4 Per-prompt highlights (file:line)

#### `html.ts`

- Tailwind v3 + Inter font auto-injected: prompt rule explicitly says NOT to add `<link>` for Tailwind / Inter — the renderer injects them.
- `unsplash:keyword` only valid in `<img src>`.
- Sandbox: `allow-scripts allow-modals` (no top-nav, no forms, no popups).

#### `react.ts`

- Aesthetic directive grammar: line 1 mandatory `// @aesthetic: <direction>` (validator hard-errors on missing/unknown).
- Fonts directive: line 2 optional `// @fonts: F:spec | F:spec | F:spec` (max 3).
- 7 aesthetic directions with full design system: editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic.
- Pre-injected globals: `Recharts`, `LucideReact`, `Motion`, plus 26 React hooks pre-destructured (see [F. renderer §react](#f-renderer-layer)).

#### `slides.ts`

- 17 layouts (verified at L1–L6 then enumerated through ~L590).
- Approved primary colors (dark slate-900 family); approved accents (vivid).
- Inline `{icon:name}` syntax (kebab-case Lucide names).
- Mermaid diagrams supported (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`, `classDiagram`, `gantt`, `pie`, `mindmap`, `gitGraph`, `journey`).
- Chart types: `bar`, `bar-horizontal`, `line`, `pie`, `donut`.
- Deck conventions: 7–12 slides, first=`title`, last=`closing`, ≥ 3 different layouts.

#### `document.ts`

Imports examples from `@/lib/document-ast/examples/proposal.ts`, `@/lib/document-ast/examples/report.ts`, `@/lib/document-ast/examples/letter.ts` (L1–L3).

`documentArtifact = { type: "text/document", label: "Document", summary: "...", rules: \`...\`, examples: [...] }` (L5+).

The rules are JSON-only — no markdown fences. The block / inline node inventory matches the Zod schema in `src/lib/document-ast/schema.ts` (see §G.1). 14+ anti-patterns, the most important of which is "no math notation (`$...$` or `$$...$$`) — `text/document` does NOT render LaTeX equations" (~L287).

#### `sheet.ts`

3 content shapes — CSV / JSON array of objects / `spreadsheet/v1` spec. Hard caps for the spec: 8 sheets, 500 cells/sheet, 200 formulas, 64 named ranges, 31 chars max sheet name. 6 named cell styles. Excel number formats. 5 supported error codes.

#### `mermaid.ts`

14 diagram types listed with `flowchart` declaration syntax. Max 15 nodes per flowchart for readability.

---

## D. AI tool layer

### D.1 `create-artifact.ts`

**File:** `src/lib/tools/builtin/create-artifact.ts` (193 lines)

- L1–L18: imports + constants.
  - `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` (L17)
- L19–L41: tool metadata + Zod parameters schema.
  - L19–L24: name="create_artifact", displayName, description, category="builtin"
  - L25–L41: parameters object — `title`, `type` (enum from `ARTIFACT_TYPES`), `content`, optional `language`
- L42–L192: `execute()` async function.
  - L43–L47: parse inputs + `crypto.randomUUID()`
  - L49–L61: content size check (`Buffer.byteLength`)
  - L68–L86: canvas-mode type lock check
  - L88–L102: language requirement for `application/code`
  - L104–L120: `validateArtifactContent(type, content)` dispatch
  - L122–L130: `resolveImages(content)` (HTML), `resolveSlideImages(content)` (slides)
  - L132–L181: persistence:
    - L134–L149: S3 upload via `S3Paths.artifact()` + `uploadFile()`
    - L151–L172: Prisma `document.create()`
    - L173–L176: fire-and-forget `indexArtifactContent(id, title, finalContent)`
    - L177–L181: try/catch around persistence
  - L183–L191: return shape

### D.2 `update-artifact.ts`

**File:** `src/lib/tools/builtin/update-artifact.ts` (197 lines)

- L13–L26: constants.
  - `MAX_VERSION_HISTORY = 20` (L14)
  - `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` (L17)
  - `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` (L26)
- L27–L45: tool metadata + parameters (`id`, optional `title`, `content`).
- L46–L196: `execute()` flow.
  - L51–L62: size check
  - L68: `prisma.document.findUnique({ id })`
  - L72–L89: validator dispatch (only for known artifact types)
  - L91–L97: `resolveImages` for HTML and slides
  - L99–L147: archive old version
    - L100–L106: extract metadata + version info
    - L108–L120: upload old content to `${s3Key}.v${versionNum}`, catch sets `versionS3Key = undefined`
    - L122–L132: inline fallback if S3 failed AND ≤ 32 KB; else mark `archiveFailed`
    - L133–L139: push version metadata
    - L141–L148: FIFO eviction beyond 20, increment `evictedVersionCount`
  - L150–L157: upload new content to original key
  - L159–L176: `prisma.document.update()`
  - L178–L181: re-index RAG with `{ isUpdate: true }`
  - L188–L195: return

### D.3 `builtin/index.ts`

**File:** `src/lib/tools/builtin/index.ts` (~41 lines)

```typescript
export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  knowledge_search: knowledgeSearchTool,
  customer_lookup: customerLookupTool,
  channel_dispatch: channelDispatchTool,
  document_analysis: documentAnalysisTool,
  file_operations: fileOperationsTool,
  web_search: webSearchTool,
  calculator: calculatorTool,
  date_time: dateTimeTool,
  json_transform: jsonTransformTool,
  text_utilities: textUtilitiesTool,
  create_artifact: createArtifactTool,
  update_artifact: updateArtifactTool,
  code_interpreter: codeInterpreterTool,
  ocr_document: ocrDocumentTool,
}
```

Plus `getBuiltinTool(name)` and `getAllBuiltinTools()`.

### D.4 `seed.ts`

**File:** `src/lib/tools/seed.ts` (~94 lines)

- L25–L32: `NON_USER_SELECTABLE_BUILTIN_TOOLS` set (includes `create_artifact`, `update_artifact`, `file_operations`, `knowledge_search`, `web_search`, `code_interpreter`).
- L45–L93: `ensureBuiltinTools()` — DB sync. Calls `zodToJsonSchema()` to convert each tool's Zod parameters to OpenAPI-compatible JSON schema for storage.

---

## E. Validator layer

**File:** `src/lib/tools/builtin/_validate-artifact.ts` (~2022 lines, the largest file in the artifact system)

### E.1 Result shape (L33–L39)

```typescript
interface ArtifactValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  content?: string  // optional content rewrite (used by validateDocument)
}
```

### E.2 Constants (top of file)

- L42–L48: `REACT_IMPORT_WHITELIST` — `react`, `react-dom`, `recharts`, `lucide-react`, `framer-motion`
- L51: `MAX_INLINE_STYLE_LINES = 10`
- L127–L147: `SLIDE_LAYOUTS` — 18 valid layout types (includes deprecated `image-text` for soft-warn)
- L150–L151: `MIN_DECK_SLIDES = 7`, `MAX_DECK_SLIDES = 12`
- L578–L617: `R3F_ALLOWED_DEPS` — ~40 symbols across react / three / @react-three/fiber / @react-three/drei
- L1112–L1131: LATEX unsupported-command patterns
- L1284–L1310: MERMAID_DIAGRAM_TYPES — 27 valid declarations (including beta variants)
- L1911–L1927: `PYTHON_UNAVAILABLE_PACKAGES` — 13 packages that crash on import (requests, urllib3, httpx, flask, django, fastapi, sqlalchemy, selenium, tensorflow, torch, keras, transformers, opencv-python)

### E.3 `VALIDATORS` dispatch (L61–L77)

```typescript
const VALIDATORS: Record<ArtifactType, (content: string) => Result | Promise<Result>> = {
  "text/html": validateHtml,
  "application/react": validateReact,
  "image/svg+xml": validateSvg,
  "application/mermaid": validateMermaid,
  "application/python": validatePython,
  "application/code": validateCode,
  "text/markdown": validateMarkdown,
  "text/document": validateDocument,
  "text/latex": validateLatex,
  "application/sheet": validateSheet,
  "application/slides": validateSlides,
  "application/3d": validate3d,
}
```

### E.4 `validateArtifactContent(type, content)` dispatcher (L79–L86)

Returns `{ ok: true, errors: [], warnings: [] }` for unknown types.

### E.5 Per-validator function locations

| Validator | Line range | Notable behavior |
|---|---|---|
| `validateDocument` | L92–L117 | async; JSON.parse → `validateDocumentAst()` → `resolveUnsplashInAst()`; returns rewritten JSON in `content` |
| `validateSlides` | L153–L568 | Per-layout required-field checks across 18 layouts |
| `validate3d` | L619–L716 | Forbidden constructs: `<Canvas>`, `<OrbitControls>`, `<Environment>`, `document.*`, `requestAnimationFrame`, `new THREE.WebGLRenderer()` |
| `validateSheet` | L774–L998 | Shape detection; per-shape rules |
| `validateMarkdown` | L1004–L1099 | Soft-warnings only |
| `validateLatex` | L1133–L1200 | Reject full-LaTeX preamble |
| `validateCode` | L1223–L1272 | Reject HTML doctype, fence wrapper; warn on placeholders |
| `validateMermaid` | L1312–L1408 | Diagram-type declaration check |
| `validateSvg` | L1422–L1559 | parse5 walk; reject scripts/style/foreignObject |
| `validateHtml` | L1565–L1671 | parse5 walk; require DOCTYPE/html/head/body/title/viewport |
| `validateReact` | L1750–L1901 | Directive parse + Babel parse + import whitelist |
| `validatePython` | L1929–L2009 | Reject unavailable-package imports |

### E.6 React directives

**Helper file:** `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`

- L11–L19: `AESTHETIC_DIRECTIONS` — 7 strings.
- L23–L51: `DEFAULT_FONTS_BY_DIRECTION` — Record mapping each direction to default Google Fonts.
- L54: `MAX_FONT_FAMILIES = 3`.
- L76–L99: `parseDirectives(code)` — regex-extract `@aesthetic` line 1 and `@fonts` line 2 (pipe-separated).
- L112–L114: `validateFontSpec(spec)` — regex `/^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|...)$/`.
- L127–L141: `buildFontLinks(aesthetic, fonts)` — emits `<link>` tags from `fonts.googleapis.com`.

**Validator integration:** `_validate-artifact.ts` L1754–L1806.
- L1758–L1759: read `ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"` env flag.
- L1761–L1788: enforce `@aesthetic` (hard-error or soft-warn).
- L1789–L1806: enforce `@fonts` validity + 3-family cap.
- L1893–L1898: `appendAestheticWarnings()` — soft-warns on direction mismatches.

---

## F. Renderer layer

**Directory:** `src/features/conversations/components/chat/artifacts/renderers/`

### F.1 Dispatcher (`artifact-renderer.tsx`)

**File:** `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (140 lines)

- L1: `"use client"`.
- L9–L77: 10 lazy-loaded renderers via `next/dynamic()` with custom loading messages.
- L88–L94: `ArtifactRendererProps` interface — `{ artifact, onFixWithAI?, onDownloadXlsx? }`.
- L96–L138: switch by `artifact.type`:
  - `"text/html"` → `<HtmlRenderer>`
  - `"application/react"` → `<ReactRenderer>` with `onFixWithAI`
  - `"image/svg+xml"` → `<SvgRenderer>`
  - `"application/mermaid"` → `<MermaidRenderer>` with `onFixWithAI`
  - `"application/sheet"` → `<SheetRenderer>` with `title` + `onDownloadXlsx`
  - `"text/latex"` → `<LatexRenderer>`
  - `"application/slides"` → `<SlidesRenderer>`
  - `"application/python"` → `<PythonRenderer>` with `onFixWithAI`
  - `"application/3d"` → `<R3FRenderer>` with `onFixWithAI`
  - `"application/code"` → `<StreamdownContent>` (wrapped in fence + language)
  - `"text/markdown"` → `<StreamdownContent>`
  - `"text/document"` → `<DocumentRenderer>`
  - `default` → `<pre>` fallback

### F.2 Streamdown wrapper (`streamdown-content.tsx`)

**File:** `src/features/conversations/components/chat/streamdown-content.tsx` (96 lines)

- L1: `"use client"`.
- L4: `import { Streamdown } from "streamdown"`.
- L6–L7: CSS imports (`streamdown/styles.css`, `katex/dist/katex.min.css`).
- L13–L54: `MermaidError` component for streaming-mermaid failures.
- L56–L65: `StreamdownContentProps` — `{ content, isStreaming?, className? }`.
- L67: `useTheme()` for shiki theme awareness.
- L71–L92: `<Streamdown>` config:
  - `animated`, `isAnimating={isStreaming}`, `caret={isStreaming ? "block" : undefined}`
  - `shikiTheme` (theme-aware)
  - `controls: { code: true, table: true, mermaid: true }`
  - `mermaid: { errorComponent: MermaidError }`
  - `plugins.math: { remarkPlugin: remark-math, rehypePlugin: rehype-katex }`

### F.3 Per-renderer file:line summary

| Renderer | File | Lines | Mode | Sandbox / Security |
|---|---|--:|---|---|
| HtmlRenderer | `html-renderer.tsx` | 136 | iframe + srcDoc | `allow-scripts allow-modals` + nav blocker |
| ReactRenderer | `react-renderer.tsx` | 574 | iframe + Babel transpile | `allow-scripts` + nav blocker |
| SvgRenderer | `svg-renderer.tsx` | 92 | inline DOM | DOMPurify (svg + svgFilters profile) |
| MermaidRenderer | `mermaid-renderer.tsx` | 172 | inline DOM | mermaid `securityLevel: "strict"` |
| MermaidConfig | `mermaid-config.ts` | 502 | (config) | — |
| DocumentRenderer | `document-renderer.tsx` | 617 | inline DOM | upstream Zod |
| SheetRenderer | `sheet-renderer.tsx` | 277 | inline DOM | — |
| SpecWorkbookView | `sheet-spec-view.tsx` | 250 | inline DOM | formula evaluator main-thread |
| LatexRenderer | `latex-renderer.tsx` | 523 | inline DOM | KaTeX `trust: true` |
| SlidesRenderer | `slides-renderer.tsx` | 148 | iframe + srcDoc | `allow-scripts allow-same-origin` |
| PythonRenderer | `python-renderer.tsx` | 308 | Web Worker | Pyodide isolated |
| R3FRenderer | `r3f-renderer.tsx` | 622 | iframe + Babel | `allow-scripts` + nav blocker |
| `_iframe-nav-blocker.ts` | (helper) | — | (script) | injected before user code in HTML/React/R3F |
| `_react-directives.ts` | (helper) | — | (parser) | aesthetic + fonts |

### F.4 React renderer (deep-dive citations)

**File:** `react-renderer.tsx` (574 lines)

- L20–L25: `IMPORT_GLOBALS` mapping — `react`→`React`, `recharts`→`Recharts`, `lucide-react`→`LucideReact`, `framer-motion`→`Motion`.
- L33–L58: `REACT_PRE_DESTRUCTURED` set — 26 React symbols.
- L76–L91: parse + strip directive lines.
- L93–L237: import preprocessing pipeline (template-literal hide → multi-line collapse → import rewrites).
- L177–L222: `export default` rewrite into named const/function.
- L242–L377: `buildSrcdoc(code, componentName, directives)` — full HTML template.
- L286: pre-destructure 26 React symbols.
- L293–L332: `__ArtifactErrorBoundary` injected.
- L334–L344: mount via `ReactDOM.createRoot()`.
- L359–L373: global `onerror` + `unhandledrejection` listeners.
- L381: `export function ReactRenderer(...)`.
- L454–L455: fatal-vs-warning error split.
- L566: iframe `sandbox="allow-scripts"`.

### F.5 Document renderer (deep-dive citations)

**File:** `document-renderer.tsx` (617 lines)

- L1: `"use client"`.
- L11–L12: imports — `MERMAID_INIT_OPTIONS`, `chartToSvg`.
- L20–L29: footnote sink type.
- L31–L111: `renderInline()` — handles 7 inline node types.
- L113–L353: `renderBlock()` — handles 12 block node types.
- L121–L122: DXA → px conversion `(dxa / 1440) * 96`.
- L150–L171: `list` recursive rendering.
- L232–L277: `table` rendering with colspan/rowspan + shading.
- L310–L311: `mermaid` block → `<MermaidPreviewBlock>`.
- L313–L314: `chart` block → `<ChartPreviewBlock>`.
- L316–L348: TOC live generation by traversing body.
- L400: `export function DocumentRenderer(...)`.
- L427–L501: page layout (A4 794×1123 px, Letter 816×1056 px).
- L505–L579: `MermaidPreviewBlock` — dynamic-import mermaid + `MERMAID_INIT_OPTIONS`.
- L518–L545: SVG layout shims for jsdom test environment.
- L581–L593: `ChartPreviewBlock` — `chartToSvg(chart, 800, 400)`.
- L595–L605: `parseSafe()` — JSON.parse + Zod safeParse.

### F.6 Python renderer (deep-dive citations)

**File:** `python-renderer.tsx` (308 lines)

- L28: `PYODIDE_CDN` URL constant.
- L40–L78: worker init function.
  - L52: `pyodide.loadPackage(["numpy", "micropip", "matplotlib", "scikit-learn"])`.
  - L57–L74: matplotlib `Agg` backend + `plt.show` interceptor.
- L80–L114: worker message handler.
  - L88–L93: stdout/stderr capture.
  - L97: reset `__plot_images__`.
  - L99: `py.runPythonAsync(code)`.
  - L102–L108: emit captured plots.
- L117–L123: `createWorker()` — blob URL + revoke.
- L141–L184: `runCode()` callback.
- L254–L304: output / error / plot panels.

### F.7 R3F renderer (deep-dive citations)

**File:** `r3f-renderer.tsx` (622 lines)

The renderer wraps user code in a Canvas + lighting + Environment + OrbitControls + Suspense container. The wrapper iframe loads Three.js + drei + @react-three/fiber UMDs and Babel.

(Specific line citations omitted for brevity — pattern parallel to React renderer.)

---

## G. Document AST module

**Directory:** `src/lib/document-ast/`

### G.1 `schema.ts` (376 lines)

- **TypeScript types** (L65–L116):
  - Block nodes: paragraph, heading, list, table, image, blockquote, codeBlock, horizontalRule, pageBreak, toc, mermaid, chart.
  - Inline nodes: text, link, anchor, footnote, lineBreak, pageNumber, tab.
- **Zod schemas** (L223–L330):
  - L313–L320: `MermaidBlockSchema` — `code` 1–10000 chars, `width` 200–1600 (default 1200), `height` 150–1200 (default 800), `caption` ≤ 200, `alt` ≤ 500.
  - L322–L329: `ChartBlockSchema` — `chart: ChartDataSchema` (imported from slides), `width` (default 1200), `height` (default 600), `caption`, `alt`.
- **Document shape** (L337):
  ```typescript
  DocumentAstSchema = z.object({
    meta: DocumentMetaSchema,
    coverPage: CoverPageSchema.optional(),
    header: z.object({ children: z.array(BlockNode) }).optional(),
    footer: z.object({ children: z.array(BlockNode) }).optional(),
    body: z.array(BlockNode).min(1),
  })
  ```
- **Constraints:**
  - `meta.title` 1–200 chars
  - `meta.author` ≤ 120
  - `meta.date` regex `/^\d{4}-\d{2}-\d{2}$/`
  - `meta.fontSize` 8–24 (default 12)
  - color regex `/^#[0-9a-fA-F]{6}$/`
  - `image.src` intentionally NOT validated as `.url()` (allows `unsplash:keyword`)

### G.2 `validate.ts` (214 lines)

- L186–L192: 128 KB serialized-size budget (pre-Zod check).
- L195–L204: `DocumentAstSchema.safeParse(raw)` with formatted error from `.issues[]`.
- L113–L180: `semanticCheck(ast)` — bookmark cross-ref resolution, pageNumber scope, table column-width invariants, unsplash keyword non-empty, mermaid first-token validation.
- L47–L105: tree-walker pattern — `walkInlines()`, `walkBlocks()`, `walkListItems()` with scope tracking ("body" | "header" | "footer").

### G.3 `to-docx.ts` (657 lines)

- **Public API** (L525–L597):
  ```typescript
  export async function astToDocx(ast: DocumentAst): Promise<Buffer>
  ```
- **Page setup** (L527–L533): letter (12240×15840 twips) or a4 (11906×16838); margins from meta.
- **Cover page** (L481–L519): `renderCoverPage()` — 48pt centered title, 28pt italic subtitle, 24/22pt centered author/org/date stack, trailing page break.
- **Inline rendering** (L75–L127): `renderInline()` handles text style flags, ExternalHyperlink, InternalHyperlink (anchor → bookmark), FootnoteReferenceRun (deferred), PageNumber.CURRENT, lineBreak, tab.
- **Block rendering** (L301–L390): `renderBlock()` handles all 12 block node types.
- **Table rendering** (L445–L473): `renderTable()` — async; handles colspan/rowspan + cell shading + borders + vertical alignment.
- **List rendering** (L399–L434): `renderList()` — recursive; level-based indentation; ordered (numbered) vs unordered (bulleted). **Limitation:** `startAt` ignored (always starts at 1).
- **Image fetch** (L190+): 10-second timeout; fallback 1×1 transparent PNG; SVG inputs rejected by docx-js.
- **Mermaid rendering** (L190–L232): `renderMermaid()` — `mermaidToSvg()` (jsdom) → `resizeSvg()` → `svgToPng()` (sharp) → `ImageRun`.
- **Chart rendering** (L238–L271): `renderChart()` — `chartToSvg()` → `resizeSvg()` → `svgToPng()` → `ImageRun`.
- **Numbering config** (L603–L656): 3 levels each for bullets (•/◦/▪) and ordered (`%1.`/`%2.`/`%3.`).
- **Heading styles**: HEADING_1..6 with cascading sizes (20pt..12pt).
- **Footnotes** (L547–L556): accumulated in `RenderCtx` during body rendering, attached to `Document.footnotes`.

### G.4 `resolve-unsplash.ts` (133 lines)

- L94–L102: collect phase — walk body / header / footer / coverPage.logoUrl, identify unique `unsplash:` keywords.
- L105–L117: resolve phase — `searchPhoto()` parallel; fallback to `placehold.co`.
- L119–L131: replace phase — `structuredClone(ast)` + recursive replace.
- Helper: `extractKeyword(raw)` — slice off prefix, lowercase, trim, collapse whitespace, slice 50 chars.

### G.5 Examples directory

- `examples/proposal.ts` (~19 KB) — sales proposal with cover, sections, tables, charts.
- `examples/report.ts` (~14 KB) — business report with TOC, headings, charts, mermaid diagrams.
- `examples/letter.ts` (~6.4 KB) — formal letter with header/footer, signature block.

---

## H. Slides module

**Directory:** `src/lib/slides/`

### H.1 `types.ts` (123 lines)

- `SlideTheme` interface (L1+).
- `DEFAULT_THEME` (L7+) — `{ primaryColor: "#0F172A", secondaryColor: "#3B82F6", fontFamily: "Inter, system-ui, ..." }`.
- `SlideLayout` union — 19 strings (17 layouts + `image-text` deprecated + ?).
- `ChartType` union — `bar | bar-horizontal | line | pie | donut`.
- `ChartData`, `ChartDataPoint`, `ChartSeries` interfaces.
- Advanced layout shapes: `StatItem`, `GalleryItem`, `ComparisonRow`, `FeatureItem`.
- `SlideData` (most fields optional, populated by layout).
- `PresentationData = { theme, slides[] }`.

### H.2 `types.zod.ts` (32 lines)

Zod mirror of `ChartData` for cross-artifact reuse (`text/document` `chart` block also uses this).

### H.3 `render-html.ts` (1325 lines)

- `slidesToHtml(data: PresentationData): string` — entry at L378+.
- L43–L371: `renderSlideContent()` — per-layout renderer.
- L38–L41: `renderText()` — escape + icon resolve via `resolveIconsInText()`.
- L374–L376: `isDarkSlide()` — predicate for dark backgrounds.
- L404–L1325: full inline CSS in `<style>` block — slide containers, animations, dark/light variants, theme injection.

### H.4 `parse-legacy.ts` (69 lines)

- `parseLegacyMarkdown(markdown)` — splits on `\n---\n`, builds slides.
- `isJsonPresentation(content)` — checks for `{` start + presence of `"slides"`.

### H.5 `generate-pptx.ts` (1532 lines)

- Library: `pptxgenjs@4.0.1`. Layout: `LAYOUT_WIDE` (13.333"×7.5").
- `generatePptx(data): Promise<Blob>` at L1458–L1531.
- Per-layout renderers:
  - `renderTitleSlide()` L72–L129
  - `renderContentSlide()` L131–L213
  - `renderTwoColumnSlide()` L215–L295
  - `renderQuoteSlide()` L340–L450
  - `renderDiagramSlide()` (async) L452–L506 — `mermaidToBase64Png()` → `addImage`
  - `renderChartSlide()` (async) L508–L581 — `chartToSvg()` → `svgToBase64Png()` → `addImage`
  - `renderImageSlide()` (async) L583–L634 — `fetchImageAsBase64()` (with `unsplash:` rewrite) → `addImage`
  - `renderGallerySlide()` (async) L1148–L1245
  - `renderComparisonSlide()` L1247–L1355
  - `renderFeaturesSlide()` L1357–L1435
- Helpers: `cleanPptx()` strips markdown + inline icons; `addAccentLine()`, `addSlideNumber()`, `stripHash()`.

---

## I. Spreadsheet module

**Directory:** `src/lib/spreadsheet/`

### I.1 `types.ts` (89 lines)

- `SPREADSHEET_SPEC_VERSION = "spreadsheet/v1"`.
- `SPREADSHEET_CAPS` — `{ maxSheets: 8, maxCellsPerSheet: 500, maxFormulasPerWorkbook: 200, maxNamedRanges: 64, maxSheetNameLength: 31 }`.
- `CellStyleName = "header" | "input" | "formula" | "cross-sheet" | "highlight" | "note"`.
- `CellSpec`, `ColumnSpec`, `FrozenSpec`, `SheetSpec`, `SpreadsheetTheme`, `SpreadsheetSpec` interfaces.
- `DEFAULT_THEME` constant.

### I.2 `formulas.ts` (274 lines)

`evaluateWorkbook(spec): WorkbookValues` (L228–L271) — six phases:

1. L61–L76: Build cell index (qualified `SheetName!A1` keys, strip `$`).
2. L89–L93: Seed literal cells.
3. L96–L143: Build dependency graph with `DepParser`. Resolve named ranges; expand range refs (A1:B2) into individual cell refs.
4. L146–L168: Topological sort (Kahn's). Remaining cells after iteration → `{ value: null, error: "CIRCULAR" }`.
5. L171–L225: Build `FormulaParser` with `onCell` / `onRange` / `onVariable` callbacks. Errors wrapped in `FormulaError.REF` / `.VALUE` / `.DIV0`.
6. L228–L271: Evaluate in topo order. Catch FormulaError; map error code (strip `#` and `!`).

Helpers: `refToRowCol(ref)`, `rowColToRef(row, col)`, `qualify(sheet, ref)`.

### I.3 `generate-xlsx.ts` (145 lines)

`generateXlsx(spec, values): Promise<Blob>`.

- L21–L23: `new ExcelJS.Workbook()` + creator metadata.
- L25–L43: per-sheet creation with frozen panes + column widths + default formats.
- L45–L70: cell writing.
  - **Formulas written as `{ formula, result: cachedValue }`** so Excel/LibreOffice/Sheets/Numbers open with values **already visible** (no F9 recalc).
- L72–L76: merges via `ws.mergeCells(range)`.
- L79–L84: named ranges via `wb.definedNames.add()`.
- L86–L87: `wb.xlsx.writeBuffer()` → `Blob`.
- L90–L137: `applyStyle()` — maps named styles to ExcelJS font + fill objects.
- L139–L144: `hexToArgb()` — `#RRGGBB` → `FFRRGGBB`.

### I.4 `parse.ts`

`detectShape(content)` — peeks first non-whitespace char to dispatch CSV / array / spec.

`parseSpec(content)` — Zod parse + cap checks.

---

## J. Shared rendering module

**Directory:** `src/lib/rendering/`

### J.1 `mermaid-theme.ts` (26 lines)

```typescript
export const MERMAID_THEME_VARIABLES = {
  background: "#ffffff",
  primaryColor: "#ffffff",
  primaryTextColor: "#1c1c1c",
  primaryBorderColor: "#e2e1de",
  lineColor: "#6b6b6b",
  textColor: "#1c1c1c",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "14px",
} as const

export const MERMAID_INIT_OPTIONS = {
  startOnLoad: false,
  theme: "base" as const,
  themeVariables: MERMAID_THEME_VARIABLES,
}
```

Used by both `document-renderer.tsx` (preview) and `to-docx.ts` (server-side render).

### J.2 `chart-to-svg.ts` (414 lines)

`chartToSvg(chart, width=600, height=400): string` — isomorphic D3-based renderer.

- L69–L129: `renderBarChart()` — `scaleBand` X, `scaleLinear` Y, rounded rects.
- L131–L190: `renderBarHorizontalChart()` — axes swapped.
- L192–L279: `renderLineChart()` — `scalePoint` X + `scaleLinear` Y, `curveMonotoneX`, multi-series via `series[]`, legend at bottom.
- L281–L350: `renderPieChart()` — `d3Shape.arc()`, `innerRadius=0` for pie or `radius*0.5` for donut, percentage labels.
- L355–L406: `chartToSvg()` dispatcher.
- L408–L413: `renderEmptyChart()` fallback.
- 8-color default palette: blue, green, amber, red, violet, cyan, pink, teal.

### J.3 `resize-svg.ts` (19 lines)

`resizeSvg(svg, width, height)` — pure regex on root `<svg>`. Removes existing width/height/preserveAspectRatio, adds new values + `preserveAspectRatio="xMidYMid meet"`.

### J.4 `server/mermaid-to-svg.ts` (127 lines)

`mermaidToSvg(code): Promise<string>`:

- L50: `new JSDOM(...)` with `pretendToBeVisual: true`.
- L67–L69: capture global PropertyDescriptors for window/document/DOMParser/navigator.
- L71–L102: stub `getBBox()` returning `{ width: text.length * 8, height: 16 }` and `getComputedTextLength()` returning `text.length * 8` (jsdom doesn't implement these; mermaid needs them for dagre layout).
- L105–L117: dynamic-import mermaid + `mermaid.initialize({ ...MERMAID_INIT_OPTIONS, securityLevel: "loose" })` (loose because DOMPurify binds at module load and reusing across calls would break it).
- L120–L124: `finally` block restores all globals + `dom.window.close()`.

### J.5 `server/svg-to-png.ts` (26 lines)

```typescript
sharp(Buffer.from(svg))
  .resize(width, height, {
    fit: "contain",
    background: "#FFFFFF",
    kernel: sharp.kernel.lanczos3,
  })
  .flatten({ background: "#FFFFFF" })
  .png({ compressionLevel: 6 })
  .toBuffer()
```

### J.6 `client/mermaid-to-png.ts` (35 lines)

`mermaidToBase64Png(code, w=1200, h=800)` — dynamic-import mermaid + browser Canvas at 2× resolution.

### J.7 `client/svg-to-png.ts` (92 lines)

- `svgToBase64Png(svg, w, h)` — Canvas API at 2× internal resolution.
- `fetchImageAsBase64(url)` — handles `unsplash:keyword` → `source.unsplash.com/1600x900/?{keyword}`.

---

## K. Unsplash module

**Directory:** `src/lib/unsplash/`

### K.1 `client.ts` (46 lines)

- `searchPhoto(query): Promise<UnsplashPhoto | null>`.
- Endpoint: `https://api.unsplash.com/search/photos?query=&per_page=1&orientation=landscape`.
- Header: `Client-ID UNSPLASH_API_KEY`.
- Timeout: 5000 ms via `AbortSignal.timeout(5000)`.

### K.2 `resolver.ts` (194 lines)

- L18–L24: `normalize(query)` — lowercase + trim + collapse whitespace + slice 50 chars.
- `resolveHtmlImages(content)` — regex find-replace `src="unsplash:..."` in `<img>` tags.
- `resolveSlideImages(content)` — JSON parse + walk `imageUrl`, `backgroundImage`, `quoteImage`, `gallery[].imageUrl`.
- L145–L193: `resolveQueries()` — shared logic.
  - L149–L158: cache lookup batched via `WHERE { query: { in: queries } }`.
  - L161–L190: parallel Promise.all over uncached queries; on hit cache to Prisma `ResolvedImage` with `expiresAt = now + 30 days` and attribution.
  - Race condition on UNIQUE constraint swallowed.
- `fallbackUrl(query)` — `https://placehold.co/1200x800/f1f5f9/64748b?text={encodedKeyword}`.

### K.3 Prisma `ResolvedImage` model

```prisma
model ResolvedImage {
  id          String   @id @default(cuid())
  query       String   @unique
  url         String
  attribution String
  createdAt   DateTime @default(now())
  expiresAt   DateTime
  @@index([expiresAt])
}
```

---

## L. RAG indexer

**File:** `src/lib/rag/artifact-indexer.ts` (~78 lines)

- `indexArtifactContent(documentId, title, content, options?)`.
- L28–L30: `deleteChunksByDocumentId()` if `options.isUpdate`.
- L32–L35: `chunkDocument(content, title, "ARTIFACT", undefined, { chunkSize: 1000, chunkOverlap: 200 })`.
- L41–L42: prepend title to each chunk before `generateEmbeddings()`.
- L43: `storeChunks()` → SurrealDB vector store.
- L45: `markRagStatus(documentId, true)` — patches `metadata.ragIndexed`.
- On failure: `markRagStatus(documentId, false)`.
- L60–L77: `markRagStatus()` — fetches existing metadata, patches only `ragIndexed`, preserves siblings.

---

## M. S3 helpers

**Directory:** `src/lib/s3/`

### M.1 Path builders (`S3Paths`)

```typescript
S3Paths.artifact(orgId, sessionId, artifactId, ext) =>
  `artifacts/${orgId || "global"}/${sessionId}/${artifactId}${ext}`
```

`getArtifactExtension(type)` returns `getArtifactRegistryEntry(type)?.extension ?? ".txt"`.

### M.2 Upload / download API

```typescript
uploadFile(key: string, buffer: Buffer, contentType: string, metadata?: Record<string, string>):
  Promise<{ key: string; url: string; size: number }>

uploadStream(key: string, body: ReadableStream | Blob | Uint8Array, contentType: string,
             contentLength?: number, metadata?: Record<string, string>):
  Promise<{ key: string; url: string }>

getPresignedDownloadUrl(key: string, expiresIn?: number,
                        options?: { downloadFilename?: string }):
  Promise<string>

getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number = 3600):
  Promise<string>

downloadFile(key: string): Promise<Buffer>
deleteFile(key: string): Promise<void>
deleteFiles(keys: string[]): Promise<void>  // chunks at 1000 (S3 API limit)
```

### M.3 Configuration

`S3_CONFIG`:
- `endpoint`: `S3_ENDPOINT` env (default `http://localhost:9000` for MinIO local dev)
- `accessKeyId`: `S3_ACCESS_KEY_ID` env
- `secretAccessKey`: `S3_SECRET_ACCESS_KEY` env
- `bucket`: `S3_BUCKET` env (default `rantai-files`)
- `region`: `S3_REGION` env (default `us-east-1`)
- `forcePathStyle`: `S3_ENABLE_PATH_STYLE === "1"` (for MinIO)
- `presignedExpire`: `S3_PRESIGNED_URL_EXPIRE` env (default `7200` seconds)

---

## N. API routes

### N.1 Update / delete

**File:** `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts` (82 lines)

#### `PUT` (L13–L49)
- L18–L21: auth check → 401 if no session.
- L23–L26: validate route params → 404.
- L28–L31: validate body → 400.
- L33–L38: `updateDashboardChatSessionArtifact()`.
- L40–L44: HTTP error mapping.

#### `DELETE` (L51–L81)
- Same auth/param flow.
- L66–L70: `deleteDashboardChatSessionArtifact()`.
- L76: `{ success: true }`.

### N.2 Download (DOCX)

**File:** `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts` (82 lines)

- L9: `export const runtime = "nodejs"` (required for `astToDocx`).
- L11–L81: `GET`.
  - L18–L21: auth.
  - L21–L24: validate params.
  - L26: `format` query param (default `"docx"`).
  - L28–L32: `getDashboardChatSessionArtifact()`.
  - L38–L43: enforce `artifactType === "text/document"` → 400 if not.
  - L46–L52: `JSON.parse` → `DocumentAstSchema.parse()` → 409 on parse failure.
  - L55–L67: if format `docx`, call `astToDocx(ast)`, sanitize filename from `meta.title` (lowercase, alphanumeric+dashes, ≤ 80 chars), return blob with:
    - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
    - `Content-Disposition: attachment; filename="{title}.docx"`
    - `Cache-Control: no-store`
  - L70–L73: unsupported format → 400.

### N.3 Read (session including artifacts)

**File:** `src/app/api/dashboard/chat/sessions/[id]/route.ts`

`GET` returns the session including its artifacts (where `artifactType IS NOT NULL`). Used by `chat-workspace.tsx` `loadFreshSessionArtifacts()`.

---

## O. Service / repository

### O.1 `service.ts`

**File:** `src/features/conversations/sessions/service.ts` (~601 lines)

- L422–L428: constants — `MAX_INLINE_FALLBACK_BYTES = 32 * 1024`, `MAX_VERSION_HISTORY = 20`.
- L430–L547: `updateDashboardChatSessionArtifact({ userId, sessionId, artifactId, input: { content, title? } })`.
  - L436–L438: validate required `content`.
  - L444–L447: session-ownership check.
  - L449–L452: artifact existence check.
  - L459–L470: validator dispatch; 422 on failure.
  - L472–L520: version archival (mirrors `update-artifact.ts` flow).
  - L521–L527: upload new content.
  - L529–L547: `prisma.document.update()`.
- L549–L571: `getDashboardChatSessionArtifact()` — auth + return formatted artifact.
- L576–L599: `deleteDashboardChatSessionArtifact()` — auth + S3 delete (non-fatal) + Prisma delete.

### O.2 `repository.ts`

**File:** `src/features/conversations/sessions/repository.ts` (~188 lines)

- L143–L150: `findDashboardArtifactByIdAndSession()` — `prisma.document.findFirst({ where: { id, sessionId, artifactType: { not: null } } })`.
- L152–L168: `updateDashboardArtifactById()` — `prisma.document.update()`.
- L170–L174: `deleteDashboardArtifactById()`.
- L176–L181: `findArtifactsBySessionId()` — id + s3Key only (for cleanup).
- L183–L187: `deleteArtifactsBySessionId()` — bulk delete on session removal.

---

## P. Database schema

**File:** `prisma/schema.prisma` (artifact-relevant section ~L287–L318)

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
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy      String?
  sessionId      String?
  session        DashboardSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  artifactType   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId])
  @@index([s3Key])
  @@index([sessionId])
}
```

`metadata` JSON shape (artifacts):

```typescript
{
  artifactLanguage?: string,
  versions?: Array<{
    title: string
    timestamp: number
    contentLength: number
    s3Key?: string
    content?: string
    archiveFailed?: boolean
  }>,
  evictedVersionCount?: number,
  ragIndexed?: boolean,
  validationWarnings?: string[]
}
```

---

## Q. UI shell

### Q.1 `artifact-panel.tsx` (~939 lines)

Major behaviors and approximate line ranges:

- L46–L48: RAG indexing badge (`Not searchable` if `ragIndexed === false`).
- L65–L74: tab management (Preview / Code; Code hidden if `!hasCodeTab`).
- L238–L292: download split-button for `text/document` (Markdown / Word).
  - L244–L250: client-side `.md` download via Blob.
  - L268–L269: server-side `.docx` fetch.
  - `exportError` state surfaces inline failure messages.
- L294–L320: version navigation (prev/next, restore, evicted-count tooltip).
- L322–L385: edit mode (textarea + Discard/Save/Cancel; 422 → inline validation errors).
- L343–L347: fullscreen toggle.

### Q.2 `artifact-indicator.tsx` (~48 lines)

Animated chip rendered inside chat messages. Uses `TYPE_ICONS`, `TYPE_LABELS`, `TYPE_COLORS` from registry. Click handler opens panel.

### Q.3 `artifact-renderer.tsx`

See [§F.1](#f1-dispatcher-artifact-renderertsx) above.

### Q.4 Wiring in `chat-workspace.tsx`

Approximate locations:

- ~L1100–L1109: `useArtifacts(apiSessionId || session?.id || null)` initialization.
- ~L1131–L1141: custom event `artifact-panel-changed` dispatched on open/close (so layout can collapse sidebar).
- ~L1181–L1208: `loadFreshSessionArtifacts()` on session load.
- ~L584–L603: detect `create_artifact` / `update_artifact` tool outputs in streaming response, call `addOrUpdateArtifact()`, render `<ArtifactIndicator>` inline.
- ~L3295–L3302: `<ArtifactPanel>` inside the right `<ResizablePanel>`.

---

## R. Tool registration & seeding

- **`src/lib/tools/builtin/index.ts`** — `BUILTIN_TOOLS` Record mapping name → `ToolDefinition`. 14 tools total; `create_artifact` and `update_artifact` are positions 11 + 12.
- **`src/lib/tools/seed.ts`** — `ensureBuiltinTools()` syncs `BUILTIN_TOOLS` to the DB. `NON_USER_SELECTABLE_BUILTIN_TOOLS` set excludes artifact tools from the user's tool picker.
- **`src/lib/tools/registry.ts`** — `resolveToolsForAssistant(assistantId)` checks model `functionCalling` capability + AssistantTool bindings + wraps in AI-SDK `aiTool()`.

---

## S. Constants reference

| Constant | Value | Defined in (file:line) | Purpose |
|---|--:|---|---|
| `MAX_ARTIFACT_CONTENT_BYTES` | 524288 (512 KB) | `create-artifact.ts:17`, `update-artifact.ts:17` | Hard cap on artifact content size |
| `MAX_VERSION_HISTORY` | 20 | `update-artifact.ts:14`, `service.ts:428` | FIFO cap on stored versions |
| `MAX_INLINE_FALLBACK_BYTES` | 32768 (32 KB) | `update-artifact.ts:26`, `service.ts:426` | Inline-version size cap when S3 fails |
| `MAX_INLINE_STYLE_LINES` | 10 | `_validate-artifact.ts:51` | Max non-blank lines in HTML `<style>` |
| `MAX_FONT_FAMILIES` | 3 | `_react-directives.ts:54` | React `// @fonts:` cap |
| `REACT_IMPORT_WHITELIST` | 5 libs | `_validate-artifact.ts:42–48` | react, react-dom, recharts, lucide-react, framer-motion |
| `R3F_ALLOWED_DEPS` | ~40 symbols | `_validate-artifact.ts:578–617` | React + three + @react-three/{fiber,drei} |
| `MIN_DECK_SLIDES` / `MAX_DECK_SLIDES` | 7 / 12 | `_validate-artifact.ts:150–151` | Slides per deck |
| `SLIDE_LAYOUTS` | 18 strings | `_validate-artifact.ts:127–147` | Valid slide layouts |
| `MERMAID_DIAGRAM_TYPES` | 27 strings | `_validate-artifact.ts:1284–1310` | Valid mermaid declarations |
| `PYTHON_UNAVAILABLE_PACKAGES` | 13 entries | `_validate-artifact.ts:1911–1927` | Packages that crash on Pyodide import |
| `SPREADSHEET_SPEC_VERSION` | `"spreadsheet/v1"` | `src/lib/spreadsheet/types.ts` | Only valid spec `kind` |
| `SPREADSHEET_CAPS.maxSheets` | 8 | `src/lib/spreadsheet/types.ts` | Per-workbook sheet cap |
| `SPREADSHEET_CAPS.maxCellsPerSheet` | 500 | `src/lib/spreadsheet/types.ts` | Per-sheet cell cap |
| `SPREADSHEET_CAPS.maxFormulasPerWorkbook` | 200 | `src/lib/spreadsheet/types.ts` | Workbook formula cap |
| `SPREADSHEET_CAPS.maxNamedRanges` | 64 | `src/lib/spreadsheet/types.ts` | Named-range cap |
| `SPREADSHEET_CAPS.maxSheetNameLength` | 31 | `src/lib/spreadsheet/types.ts` | Excel-compat sheet name |
| Document validator pre-Zod size cap | 128 KB | `src/lib/document-ast/validate.ts:186–192` | Pre-parse budget |
| Mermaid block dimensions | 200–1600 × 150–1200 | `src/lib/document-ast/schema.ts:313–320` | Per-block image dimensions |
| `mermaid.code` length | 1–10000 chars | `src/lib/document-ast/schema.ts:313` | Document `mermaid` block |
| `meta.title` | 1–200 chars | `src/lib/document-ast/schema.ts` (DocumentMetaSchema) | |
| `meta.fontSize` | 8–24 | `src/lib/document-ast/schema.ts` (DocumentMetaSchema) | |
| `meta.font` default | `"Arial"` | `src/lib/document-ast/schema.ts` (DocumentMetaSchema) | |
| Unsplash cache TTL | 30 days | `src/lib/unsplash/resolver.ts` | |
| Unsplash API timeout | 5 s | `src/lib/unsplash/client.ts` | `AbortSignal.timeout(5000)` |
| Pyodide CDN | `pyodide.js` v0.27.6 | `python-renderer.tsx:28` | |
| RAG chunk size / overlap | 1000 / 200 | `src/lib/rag/artifact-indexer.ts` | `chunkDocument()` |
| DOCX image fetch timeout | 10 s | `src/lib/document-ast/to-docx.ts` `fetchImage()` | Falls back to 1×1 transparent PNG |

---

## T. Environment flags

| Flag | Default | Effect |
|---|---|---|
| `ARTIFACT_REACT_AESTHETIC_REQUIRED` | enforce | Set to `"false"` to downgrade missing/unknown `// @aesthetic:` from hard-error to warning. Read in `_validate-artifact.ts:1759`. |
| `UNSPLASH_API_KEY` | (none — required for live API) | Sent as `Client-ID` header. If unset, all queries fall back to `placehold.co`. |
| `S3_ENDPOINT` | `http://localhost:9000` | S3-compatible endpoint (MinIO for dev). |
| `S3_BUCKET` | `rantai-files` | Bucket name. |
| `S3_REGION` | `us-east-1` | Region. |
| `S3_ENABLE_PATH_STYLE` | unset | Set to `"1"` to use path-style URLs (MinIO). |
| `S3_PRESIGNED_URL_EXPIRE` | `7200` (2 h) | Presigned URL TTL in seconds. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | (none — required) | Credentials. |

---

## See also

- [artifacts-deepscan.md](./artifacts-deepscan.md) — system architecture and end-to-end lifecycle flows
- [artifacts-capabilities.md](./artifacts-capabilities.md) — per-type capability spec (matrix + constraints + anti-patterns + dependencies)
