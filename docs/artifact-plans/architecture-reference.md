# Full Pre-Planning Recon — `text/document` Artifact Upgrade

**Date:** 2026-04-21
**Scope:** Comprehensive audit of all artifact-system surfaces that will be touched by Phases 2–8 (document rendering, DOCX/PDF export, chart rendering, math rendering, image handling).
**Constraint:** Read-only. Every factual claim carries a file:line citation. `[NOT FOUND]` explicit for absent items.

---

## Table of Contents

- [A. Type registry](#a-type-registry--all-sources-of-truth)
- [B. Prompt system](#b-prompt-system)
- [C. Existing markdown render path](#c-existing-markdown-render-path)
- [D. Slides pipeline — full audit (closest analog)](#d-slides-pipeline--full-audit)
- [E. Dependencies — what is actually installed](#e-dependencies)
- [F. Unsplash resolver](#f-unsplash-resolver)
- [G. Create/update artifact pipeline](#g-createupdate-artifact-pipeline)
- [H. API routes](#h-api-routes)
- [I. Download handler](#i-download-handler)
- [J. Math / KaTeX](#j-math--katex)
- [K. Deployment target and runtime constraints](#k-deployment-target-and-runtime-constraints)
- [L. Testing infra](#l-testing-infra)
- [M. Summary matrix](#m-summary-matrix)
- [N. Open questions for roadmap planning](#n-open-questions-for-roadmap-planning)

---

## A. Type Registry — All Sources of Truth

### A1. `src/features/conversations/components/chat/artifacts/types.ts`

[types.ts:1-73](src/features/conversations/components/chat/artifacts/types.ts#L1-L73) — **73 lines total, full file below**:

```typescript
export const VALID_ARTIFACT_TYPES = new Set([
  "text/html",
  "text/markdown",
  "image/svg+xml",
  "application/react",
  "application/mermaid",
  "application/code",
  "application/sheet",
  "text/latex",
  "application/slides",
  "application/python",
  "application/3d",
] as const)

export type ArtifactType =
  | "text/html"
  | "text/markdown"
  | "image/svg+xml"
  | "application/react"
  | "application/mermaid"
  | "application/code"
  | "application/sheet"
  | "text/latex"
  | "application/slides"
  | "application/python"
  | "application/3d"

export function isValidArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && VALID_ARTIFACT_TYPES.has(value as ArtifactType)
}

export interface ArtifactVersion {
  content: string
  title: string
  timestamp: number
}

export interface Artifact {
  id: string
  title: string
  type: ArtifactType
  content: string
  language?: string
  version: number
  previousVersions: ArtifactVersion[]
  /**
   * Number of historical versions that were evicted by the FIFO version
   * cap (currently 20). Used by the UI to show "+N earlier versions
   * evicted" so users aren't surprised when older history disappears.
   */
  evictedVersionCount?: number
  /**
   * Whether this artifact has been successfully indexed into RAG. `false`
   * surfaces a "not searchable" badge in the panel header so users know
   * the indexing pipeline missed (or is still pending) for this artifact.
   */
  ragIndexed?: boolean
}

/** Shape returned from the session API for persisted artifacts */
export interface PersistedArtifact {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content: string; title: string; timestamp: number }>
    evictedVersionCount?: number
    ragIndexed?: boolean
  } | null
}
```

**Current state observation:** The file registers **11 types**. `"text/document"` is **NOT** currently present in either `VALID_ARTIFACT_TYPES` or the `ArtifactType` union. The prompt rules file at [`src/lib/prompts/artifacts/document.ts`](src/lib/prompts/artifacts/document.ts) still exists (see §B5) but has no consumer in the current type registry.

### A2. `src/features/conversations/components/chat/artifacts/constants.ts`

[constants.ts:1-56](src/features/conversations/components/chat/artifacts/constants.ts#L1-L56) — full file below:

```typescript
import {
  Globe,
  FileCode,
  Image,
  GitBranch,
  FileText,
  Code,
  Table2,
  Sigma,
  Presentation,
  Terminal,
  Box,
} from "@/lib/icons"
import type { ArtifactType } from "./types"

export const TYPE_ICONS: Record<ArtifactType, typeof Globe> = {
  "text/html": Globe,
  "application/react": FileCode,
  "image/svg+xml": Image,
  "application/mermaid": GitBranch,
  "text/markdown": FileText,
  "application/code": Code,
  "application/sheet": Table2,
  "text/latex": Sigma,
  "application/slides": Presentation,
  "application/python": Terminal,
  "application/3d": Box,
}

export const TYPE_LABELS: Record<ArtifactType, string> = {
  "text/html": "HTML Page",
  "application/react": "React Component",
  "image/svg+xml": "SVG Graphic",
  "application/mermaid": "Mermaid Diagram",
  "text/markdown": "Document",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX / Math",
  "application/slides": "Slides",
  "application/python": "Python Script",
  "application/3d": "3D Scene",
}

export const TYPE_COLORS: Record<ArtifactType, string> = {
  "text/html": "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "application/react": "text-blue-500 bg-blue-500/10 border-blue-500/20",
  "image/svg+xml": "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "application/mermaid": "text-purple-500 bg-purple-500/10 border-purple-500/20",
  "text/markdown": "text-gray-500 bg-gray-500/10 border-gray-500/20",
  "application/code": "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  "application/sheet": "text-green-500 bg-green-500/10 border-green-500/20",
  "text/latex": "text-rose-500 bg-rose-500/10 border-rose-500/20",
  "application/slides": "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  "application/python": "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  "application/3d": "text-pink-500 bg-pink-500/10 border-pink-500/20",
}
```

**Current state observation:** `BookOpen` is not imported. `text/markdown` carries the UI label `"Document"` ([constants.ts:35](src/features/conversations/components/chat/artifacts/constants.ts#L35)), which is a naming ambiguity to be resolved when the new `text/document` is re-introduced — "Document" is effectively taken.

### A3. `VALID_ARTIFACT_TYPES` usage graph

Grep command (equivalent to `rg -n "VALID_ARTIFACT_TYPES|ARTIFACT_TYPES\s*:" src/`):

| path:line | content | role |
|---|---|---|
| [types.ts:1](src/features/conversations/components/chat/artifacts/types.ts#L1) | `export const VALID_ARTIFACT_TYPES = new Set([` | **DEFINITION** — only one, no duplicate |
| [types.ts:29](src/features/conversations/components/chat/artifacts/types.ts#L29) | `return typeof value === "string" && VALID_ARTIFACT_TYPES.has(value as ArtifactType)` | USAGE — `isValidArtifactType()` type guard |
| [chat-input-toolbar.tsx:141](src/features/conversations/components/chat/chat-input-toolbar.tsx#L141) | `const ARTIFACT_TYPES: ArtifactType[] = [` | **SECOND SOURCE** — module-local parallel array, iterated by the canvas mode selector ([chat-input-toolbar.tsx:696](src/features/conversations/components/chat/chat-input-toolbar.tsx#L696) shows `{ARTIFACT_TYPES.map(...)}`) |

**Finding:** The registry has **two separate iteration sources**. `VALID_ARTIFACT_TYPES` is a `Set` used only for `.has()` membership checks. The toolbar maintains its own `ARTIFACT_TYPES` array for iteration. Consolidation plan lives in [`phase-7-brief.md`](phase-7-brief.md).

### A4. Zod enum block in `create-artifact.ts`

[create-artifact.ts:21-49](src/lib/tools/builtin/create-artifact.ts#L21-L49):

```typescript
  parameters: z.object({
    title: z.string().describe("A concise, descriptive title (3-8 words) that clearly identifies the artifact content"),
    type: z
      .enum([
        "text/html",
        "text/markdown",
        "image/svg+xml",
        "application/react",
        "application/mermaid",
        "application/code",
        "application/sheet",
        "text/latex",
        "application/slides",
        "application/python",
        "application/3d",
      ])
      .describe(
        "The artifact format. Choose based on content: text/html (interactive pages, dashboards, games), application/react (UI components, data visualizations), image/svg+xml (graphics, icons), application/mermaid (flowcharts, diagrams), application/code (source code), text/markdown (documents, reports), application/sheet (CSV tables), text/latex (math equations), application/slides (presentations as JSON), application/python (executable scripts), application/3d (R3F 3D scenes)"
      ),
    content: z
      .string()
      .describe("The complete, self-contained content of the artifact. Must be fully functional — no placeholders, stubs, or TODO comments. For HTML: include full document structure. For React: include all component logic with export default. For code: include all necessary functions. For slides: provide complete JSON with theme and slides array."),
    language: z
      .string()
      .optional()
      .describe(
        "Programming language for application/code type (e.g. python, javascript, typescript)"
      ),
  }),
```

**Finding:** 11 types in enum; no `text/document`.

### A5. Zod enum in `update-artifact.ts`

[update-artifact.ts:34-45](src/lib/tools/builtin/update-artifact.ts#L34-L45):

```typescript
  parameters: z.object({
    id: z
      .string()
      .describe("The ID of the artifact to update (from the create_artifact result)"),
    title: z
      .string()
      .optional()
      .describe("Optional new title. If omitted, keeps the existing title"),
    content: z
      .string()
      .describe("The complete updated content replacing the entire artifact. Include ALL content — unchanged parts must be repeated, not omitted. The artifact must remain fully functional after the update."),
  }),
```

**`[NOT FOUND]`** — there is no `type` enum in `update-artifact.ts`. The tool takes `id`, optional `title`, and `content` only; type is derived from the existing DB row ([update-artifact.ts:72-89](src/lib/tools/builtin/update-artifact.ts#L72-L89)). Future additions to the type union do not require touching this file's schema.

### A6. `text/markdown` references (list-like vs one-off)

Grep command (equivalent to `rg -n "text/markdown" src/ | head -60`):

| path:line | role | list-like? |
|---|---|---|
| [types.ts:3](src/features/conversations/components/chat/artifacts/types.ts#L3) | Set entry | **list** |
| [types.ts:17](src/features/conversations/components/chat/artifacts/types.ts#L17) | union member | **list** |
| [constants.ts:21](src/features/conversations/components/chat/artifacts/constants.ts#L21) | `TYPE_ICONS` key | **list** |
| [constants.ts:35](src/features/conversations/components/chat/artifacts/constants.ts#L35) | `TYPE_LABELS` key | **list** |
| [constants.ts:49](src/features/conversations/components/chat/artifacts/constants.ts#L49) | `TYPE_COLORS` key | **list** |
| [chat-input-toolbar.tsx:146](src/features/conversations/components/chat/chat-input-toolbar.tsx#L146) | toolbar array entry | **list** |
| [create-artifact.ts:26](src/lib/tools/builtin/create-artifact.ts#L26) | Zod enum entry | **list** |
| [create-artifact.ts:38](src/lib/tools/builtin/create-artifact.ts#L38) | mention in `.describe()` prose | one-off |
| [_validate-artifact.ts:48](src/lib/tools/builtin/_validate-artifact.ts#L48) | dispatch `if` entry | **dispatch** |
| [artifact-renderer.tsx:121](src/features/conversations/components/chat/artifacts/artifact-renderer.tsx#L121) | renderer switch case | **dispatch** |
| [artifact-panel.tsx:752](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L752) | `getExtension()` switch case | **dispatch** |
| [artifact-panel.tsx:805](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L805) | `getCodeLanguage()` switch case | **dispatch** |
| [prompts/artifacts/markdown.ts:2](src/lib/prompts/artifacts/markdown.ts#L2) | `type` field of artifact config | dispatch (auto-picked by `ALL_ARTIFACTS`) |
| [prompts/artifacts/markdown.ts:6](src/lib/prompts/artifacts/markdown.ts#L6) | prose inside `rules` | one-off (prompt text) |

**Finding:** The **list-like** (6 entries) and **dispatch** (4 switches) sites are the two classes that any new type must add to. One-off mentions (prompt text, describe strings) need hand-editing for completeness but are not blockers.

---

## B. Prompt System

### B1. `src/lib/prompts/artifacts/index.ts`

[index.ts:1-35](src/lib/prompts/artifacts/index.ts#L1-L35) — full file:

```typescript
import { htmlArtifact } from "./html"
import { reactArtifact } from "./react"
import { svgArtifact } from "./svg"
import { mermaidArtifact } from "./mermaid"
import { slidesArtifact } from "./slides"
import { codeArtifact } from "./code"
import { pythonArtifact } from "./python"
import { sheetArtifact } from "./sheet"
import { markdownArtifact } from "./markdown"
import { latexArtifact } from "./latex"
import { r3fArtifact } from "./r3f"

export const ALL_ARTIFACTS = [
  htmlArtifact,
  reactArtifact,
  svgArtifact,
  mermaidArtifact,
  slidesArtifact,
  codeArtifact,
  pythonArtifact,
  sheetArtifact,
  markdownArtifact,
  latexArtifact,
  r3fArtifact,
] as const

export const CANVAS_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ARTIFACTS.map((a) => [a.type, a.label]),
)

export const ARTIFACT_TYPE_INSTRUCTIONS: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.rules]))

export const ARTIFACT_TYPE_SUMMARIES: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.summary]))
```

**Current state observation:** `documentArtifact` is **NOT imported**. The file at [`src/lib/prompts/artifacts/document.ts`](src/lib/prompts/artifacts/document.ts) exists (see B5) but is an **orphan** — no consumer. Any roadmap that wants the document prompt rules active must re-wire the import.

### B2. Files in `src/lib/prompts/artifacts/`

```
code.ts         317 lines
context.ts       53 lines
document.ts     104 lines   ← orphan (not in index.ts)
html.ts         164 lines
index.ts         35 lines
latex.ts        212 lines
markdown.ts     245 lines
mermaid.ts      249 lines
python.ts       191 lines
r3f.ts          280 lines
react.ts        169 lines
sheet.ts        122 lines
slides.ts       591 lines
svg.ts          150 lines
────────────────────────
TOTAL          2882 lines
```

### B3. `src/lib/prompts/artifacts/markdown.ts`

[markdown.ts:1-70](src/lib/prompts/artifacts/markdown.ts#L1-L70) — config object + rules string (245 lines total; `examples` array L71-L244 contains two long fixtures: a README and a backpropagation tutorial — not pasted here because they are illustrative text fixtures that do not affect the pipeline, but they remain full-length in the file):

```typescript
export const markdownArtifact = {
  type: "text/markdown" as const,
  label: "Document",
  summary:
    "Documents, reports, READMEs, articles, tutorials — rendered Markdown with GFM tables, Shiki-highlighted code blocks, KaTeX math, and mermaid diagrams.",
  rules: `**text/markdown — Documents**

You are generating a long-form document that will be rendered as Markdown in a read-only panel. The reader's goal is to **read and understand**, not to interact. Pick this type for READMEs, technical documentation, reports, comparison articles, tutorials, design notes, and explanatory content.

## Runtime Environment
- **Renderer:** Streamdown (a streaming-friendly react-markdown wrapper) with GitHub Flavored Markdown enabled.
- **Code blocks** are syntax-highlighted by Shiki — you MUST tag every fenced block with a language (\`\`\`typescript, \`\`\`python, \`\`\`bash, \`\`\`json, \`\`\`sql, etc.). Untagged blocks render as unstyled plain text.
- **Tables** (GFM pipe tables) render natively. Use them for structured comparisons.
- **Math:** KaTeX is wired in via remark-math + rehype-katex. Inline math uses \`$...$\` and display math uses \`$$...$$\`. You can include equations directly in a markdown document — you do NOT need to switch to the LaTeX artifact type for an equation or two.
- **Mermaid diagrams:** \`\`\`mermaid fenced blocks render as live diagrams. Use them inline when a diagram clarifies the prose.
- **Task lists:** \`- [ ]\` and \`- [x]\` render as checkboxes (GFM).
- **Strikethrough:** \`~~text~~\` works (GFM).
- **Links** are clickable. **Images** via \`![alt](url)\` work for absolute URLs.
- **Raw HTML is unreliable.** The renderer is not guaranteed to pass HTML through. Do not write \`<details>\`, \`<kbd>\`, \`<sub>\`, \`<script>\`, etc. — express everything in Markdown.

## Type Boundary — Markdown vs. HTML vs. LaTeX
| Use case | Correct type | Why |
|---|---|---|
| README, technical docs, design notes, reports, articles, tutorials | \`text/markdown\` | Document to READ |
| Interactive page, dashboard, calculator, form, landing page | \`text/html\` | Page to INTERACT with |
| Pure mathematical proof or derivation, equation reference sheet | \`text/latex\` | Math-heavy, needs LaTeX environments |
| A document with a few inline equations | \`text/markdown\` | Markdown supports KaTeX inline |
| A diagram with an explanation | \`text/markdown\` (with a \`\`\`mermaid block) | Mixed content |
| Just a diagram | \`application/mermaid\` | Pure visual |

If the user wants to **read words and look at structure**, it's Markdown. If they want to **click, type, or compute**, it's HTML.
```

Rules continues through L69 covering: Document Structure, Formatting Rules, Content Quality, Anti-Patterns. `examples` array spans L71-L244 with two long fixture documents.

### B4. `src/lib/prompts/artifacts/slides.ts`

**591 lines — key structural sections pasted verbatim. `examples` array dominates the bottom half with two long fixtures (fintech pitch + microservice migration) — omitted here because they are illustrative, not load-bearing.**

[slides.ts:1-6](src/lib/prompts/artifacts/slides.ts#L1-L6) — header:

```typescript
export const slidesArtifact = {
  type: "application/slides" as const,
  label: "Slides",
  summary:
    "Presentation decks for stories told in sequence — pitch decks, quarterly reviews, product launches, technical walkthroughs. Renders as a navigable slide viewer with PPTX export; each slide is a discrete visual with a clear focal point.",
  rules: `**application/slides — Presentation Decks**
```

Rules cover (all verified in the file):
- Runtime + output format (JSON only, no markdown fences)
- Theme: `primaryColor` (dark), `secondaryColor` (vivid accent), `fontFamily`
- **17 layouts**: `title`, `content`, `two-column`, `section`, `quote`, `closing`, `diagram`, `image`, `chart`, `diagram-content`, `image-content`, `chart-content`, `hero`, `stats`, `gallery`, `comparison`, `features`
- Mermaid in slides (max 15 nodes full-slide, 10 split-layout)
- Unsplash image integration: `unsplash:keyword` in `imageUrl`, `backgroundImage`, `quoteImage`, `gallery[].imageUrl`
- Chart types via `ChartData`: `bar`, `bar-horizontal`, `line`, `pie`, `donut`
- Inline icons syntax: `{icon:name}` (Lucide names, kebab-case)
- Deck structure rules: 7–12 slides, first=`title`, last=`closing`, ≥3 different layouts

**Relevance to `text/document`:** Phase 2–6 should mirror this prompt-rules scaffolding (detailed layouts, export semantics, anti-patterns) because the same consumer (LLM) produces both.

### B5. `src/lib/prompts/artifacts/document.ts`

[document.ts:1-104](src/lib/prompts/artifacts/document.ts#L1-L104) — full file (orphan; no current consumer):

```typescript
export const documentArtifact = {
  type: "text/document" as const,
  label: "Document",
  summary:
    "Formal deliverables (proposals, reports, book chapters, letters, white papers) rendered as A4-style documents with YAML frontmatter, Unsplash images, Mermaid diagrams, and DOCX/PDF export.",
  rules: `**text/document — Formal Deliverables**

You are generating a formal document that someone will print, sign, send, archive, or submit. The reader is a client, executive, editor, regulator, or counterpart — not a developer scanning a README. Pick this type when the output is a **deliverable**: a proposal, an executive report, a book chapter, an official letter, a tender response, a legal memo, a research paper, or a white paper.

## Runtime Environment
- **Source format:** Markdown body with an optional YAML frontmatter block at the very top.
- **Rendering:** A4-style paper surface in the artifact panel (cover header from frontmatter + body prose). Phase 1 uses a simple markdown render stub; the paper chrome, frontmatter cover, and rich typography land in Phase 2.
- **Export:** \`.md\` today. In later phases, \`.docx\` and \`.pdf\` exports are generated server-side from the same markdown source. Write content that will still read well after that conversion — no constructs that rely on browser-only behavior.
- **Code blocks** are syntax-highlighted by Shiki — tag every fenced block with a language (\`\`\`python, \`\`\`typescript, \`\`\`bash, \`\`\`sql, etc.).
- **Tables** (GFM pipe tables) render natively. Use them for structured comparison.
- **Math:** KaTeX inline \`$...$\` and display \`$$...$$\`.
- **Mermaid diagrams:** \`\`\`mermaid fenced blocks render as live diagrams in the web preview and are rasterized in DOCX/PDF export.
- **Raw HTML is not supported.** Anything that depends on \`<details>\`, \`<kbd>\`, \`<script>\` will be dropped on export. Express everything in Markdown.
```

Rules continue through L101 with: When-to-use table, YAML frontmatter spec, Body conventions, Images, Content Quality, Anti-Patterns (11 items). `examples` array is empty: `examples: [] as { label: string; code: string }[]` ([document.ts:103](src/lib/prompts/artifacts/document.ts#L103)).

**Orphan status:** File exists on disk but is **not imported** by [`index.ts`](src/lib/prompts/artifacts/index.ts). When the registry re-adopts `text/document`, restoring the import will make this prompt active again without further edits.

---

## C. Existing Markdown Render Path

### C1. `artifact-renderer.tsx`

[artifact-renderer.tsx:1-128](src/features/conversations/components/chat/artifacts/artifact-renderer.tsx#L1-L128) — full file:

```tsx
"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "@/lib/icons"
import type { Artifact } from "./types"
import { StreamdownContent } from "../streamdown-content"

// Lazy-load heavy renderers
const HtmlRenderer = dynamic(
  () => import("./renderers/html-renderer").then((m) => ({ default: m.HtmlRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const ReactRenderer = dynamic(
  () => import("./renderers/react-renderer").then((m) => ({ default: m.ReactRenderer })),
  {
    loading: () => <RendererLoading message="Transpiling React component..." />,
  }
)

const SvgRenderer = dynamic(
  () => import("./renderers/svg-renderer").then((m) => ({ default: m.SvgRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const MermaidRenderer = dynamic(
  () => import("./renderers/mermaid-renderer").then((m) => ({ default: m.MermaidRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const SheetRenderer = dynamic(
  () => import("./renderers/sheet-renderer").then((m) => ({ default: m.SheetRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const LatexRenderer = dynamic(
  () => import("./renderers/latex-renderer").then((m) => ({ default: m.LatexRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)

const SlidesRenderer = dynamic(
  () => import("./renderers/slides-renderer").then((m) => ({ default: m.SlidesRenderer })),
  {
    loading: () => <RendererLoading message="Building slide deck..." />,
  }
)

const PythonRenderer = dynamic(
  () => import("./renderers/python-renderer").then((m) => ({ default: m.PythonRenderer })),
  {
    loading: () => <RendererLoading message="Initializing Python runtime..." />,
  }
)

const R3FRenderer = dynamic(
  () => import("./renderers/r3f-renderer").then((m) => ({ default: m.R3FRenderer })),
  {
    loading: () => <RendererLoading message="Compiling 3D scene..." />,
  }
)

function RendererLoading({ message = "Loading preview..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      {message}
    </div>
  )
}

interface ArtifactRendererProps {
  artifact: Artifact
  /** Callback to send an artifact error to the LLM for automated repair. */
  onFixWithAI?: (error: string) => void
}

export function ArtifactRenderer({ artifact, onFixWithAI }: ArtifactRendererProps) {
  switch (artifact.type) {
    case "text/html":
      return <HtmlRenderer content={artifact.content} />
    case "application/react":
      return <ReactRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "image/svg+xml":
      return <SvgRenderer content={artifact.content} />
    case "application/mermaid":
      return <MermaidRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/sheet":
      return <SheetRenderer content={artifact.content} title={artifact.title} />
    case "text/latex":
      return <LatexRenderer content={artifact.content} />
    case "application/slides":
      return <SlidesRenderer content={artifact.content} />
    case "application/python":
      return <PythonRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/3d":
      return <R3FRenderer content={artifact.content} onFixWithAI={onFixWithAI} />
    case "application/code": {
      // Pick a fence length one longer than the longest backtick run
      // already inside the content, so code that itself contains ``` blocks
      // doesn't break syntax highlighting.
      const longestRun = (artifact.content.match(/`+/g) ?? [])
        .reduce((max, run) => Math.max(max, run.length), 0)
      const fence = "`".repeat(Math.max(3, longestRun + 1))
      return (
        <StreamdownContent
          content={`${fence}${artifact.language || ""}\n${artifact.content}\n${fence}`}
          className="p-4"
        />
      )
    }
    case "text/markdown":
      return <StreamdownContent content={artifact.content} className="p-4" />
    default:
      return (
        <pre className="p-4 text-sm whitespace-pre-wrap">{artifact.content}</pre>
      )
  }
}
```

**Current state:** 10 explicit cases (`text/html`, `application/react`, `image/svg+xml`, `application/mermaid`, `application/sheet`, `text/latex`, `application/slides`, `application/python`, `application/3d`, `application/code`) + `text/markdown` falling into a `StreamdownContent` branch + `default` falling into a `<pre>` block. **No `text/document` case.** Silent fallback to `<pre>` for unknown types.

### C2. `StreamdownContent` full file

Located at [`src/features/conversations/components/chat/streamdown-content.tsx`](src/features/conversations/components/chat/streamdown-content.tsx). Per the agent-compiled recon pass (external subagent `toolu_013px1vmF5qUVFFo9i5ZNYEr`), the file is **95 lines**. Key excerpt verified by the subagent:

```tsx
"use client"

import { useState, useCallback } from "react"
import { Streamdown } from "streamdown"
import type { MermaidErrorComponentProps } from "streamdown"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { useTheme } from "next-themes"
import { AlertTriangle, RotateCcw, Code } from "@/lib/icons"

// ...MermaidError component (lines 13-54 — renders an error banner with Retry
// and Source toggle buttons)...

interface StreamdownContentProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamdownContent({
  content,
  isStreaming,
  className,
}: StreamdownContentProps) {
  const { resolvedTheme } = useTheme()

  return (
    <div className={className ?? "chat-message max-w-none"}>
      <Streamdown
        animated
        isAnimating={isStreaming}
        caret={isStreaming ? "block" : undefined}
        shikiTheme={
          resolvedTheme === "dark"
            ? ["github-dark", "github-light"]
            : ["github-light", "github-dark"]
        }
        controls={{ code: true, table: true, mermaid: true }}
        mermaid={{ errorComponent: MermaidError }}
        plugins={{
          math: {
            name: "katex",
            type: "math",
            remarkPlugin: remarkMath,
            rehypePlugin: rehypeKatex,
          },
        }}
      >
        {content}
      </Streamdown>
    </div>
  )
}
```

**Parser in use:** `streamdown` (v2.2.0 — see §E). Not `react-markdown`, not `unified` directly. Features wired in: Shiki syntax highlighting (dark/light theme via `next-themes`), GFM (implicit through Streamdown), Mermaid rendering with custom error component, KaTeX via `remark-math` + `rehype-katex`.

### C3. Markdown parser: Streamdown

Grep output (`rg -n "streamdown|react-markdown|remark|rehype|markdown-it" src/ package.json`):

| Location | Ref | Role |
|---|---|---|
| `package.json` | `"streamdown": "^2.2.0"` | **Active parser** |
| `package.json` | `"react-markdown": "^10.1.0"` | **Installed but unused in artifact panel**; may be used elsewhere (e.g. non-artifact chat messages) |
| `package.json` | `"remark-gfm": "^4.0.1"` | Peer of Streamdown for GFM |
| `package.json` | `"remark-math": "^6.0.0"` | Wired into Streamdown plugin |
| `package.json` | `"rehype-katex": "^7.0.1"` | Wired into Streamdown plugin |
| [streamdown-content.tsx:4](src/features/conversations/components/chat/streamdown-content.tsx#L4) | `import { Streamdown } from "streamdown"` | Active |
| [streamdown-content.tsx:8-9](src/features/conversations/components/chat/streamdown-content.tsx#L8-L9) | `import remarkMath from "remark-math"`, `import rehypeKatex from "rehype-katex"` | Active via plugins prop |

**Conclusion:** `Streamdown` is the sole markdown renderer in the artifact panel. `markdown-it` is `[NOT FOUND]`.

### C4. YAML frontmatter parser

Grep for `gray-matter|js-yaml` in package.json + `src/`:

- `package.json`: `"gray-matter": "^4.0.3"` and `"js-yaml": "^4.1.1"` both present.
- `src/`: `[NOT FOUND]` for any import of `gray-matter` or `js-yaml` in the artifact pipeline. They are installed but not wired.

**Consequence for Phase 2:** Both parsers are already in the dependency graph. Wiring them is purely an application-layer task; no new installs needed.

---

## D. Slides Pipeline — Full Audit

### D1. `slides-renderer.tsx`

[slides-renderer.tsx:1-147](src/features/conversations/components/chat/artifacts/renderers/slides-renderer.tsx#L1-L147):

```tsx
"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import type { PresentationData } from "@/lib/slides/types"
import { DEFAULT_THEME } from "@/lib/slides/types"
import { slidesToHtml } from "@/lib/slides/render-html"
import { parseLegacyMarkdown, isJsonPresentation } from "@/lib/slides/parse-legacy"

interface SlidesRendererProps {
  content: string
}

function parsePresentation(content: string): PresentationData {
  if (isJsonPresentation(content)) {
    try {
      const data = JSON.parse(content) as PresentationData
      if (data.slides && Array.isArray(data.slides) && data.slides.length > 0) {
        return {
          theme: data.theme || DEFAULT_THEME,
          slides: data.slides,
        }
      }
    } catch {
      // Fall through to legacy parser
    }
  }
  return parseLegacyMarkdown(content)
}

export function SlidesRenderer({ content }: SlidesRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)

  const presentation = useMemo(() => parsePresentation(content), [content])
  const srcdoc = useMemo(() => slidesToHtml(presentation), [presentation])

  // ... useEffect for postMessage slideChange event (L39-L49)
  // ... navigate callback (L51-L59)
  // ... Keyboard arrow-key navigation (L61-L73)

  if (presentation.slides.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No slides found
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Slide preview — iframe with srcDoc */}
      <div className="flex-1 min-h-0 bg-black/5">
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          title="Slide Preview"
        />
      </div>

      {/* Navigation bar — prev/next buttons + dot indicators */}
      ...
    </div>
  )
}
```

**Architecture:** Slides render in an `<iframe srcDoc={slidesToHtml(presentation)} sandbox="allow-scripts allow-same-origin">`. `slidesToHtml()` is the server-safe HTML generator at [`src/lib/slides/render-html.ts`](src/lib/slides/render-html.ts) (see D3/D4).

### D2. Companion files in `renderers/`

Directory [`src/features/conversations/components/chat/artifacts/renderers/`](src/features/conversations/components/chat/artifacts/renderers/):

```
_iframe-nav-blocker.ts
html-renderer.tsx
latex-renderer.tsx
mermaid-config.ts
mermaid-renderer.tsx
python-renderer.tsx
r3f-renderer.tsx
react-renderer.tsx
sheet-renderer.tsx
slides-renderer.tsx
svg-renderer.tsx
```

Supporting modules (not under `renderers/`):
- [`src/lib/slides/types.ts`](src/lib/slides/types.ts) — `PresentationData`, `SlideData`, `ChartData`, `DEFAULT_THEME`
- [`src/lib/slides/render-html.ts`](src/lib/slides/render-html.ts) — `slidesToHtml()` produces full iframe srcDoc with embedded charts, mermaid, images
- [`src/lib/slides/chart-to-svg.ts`](src/lib/slides/chart-to-svg.ts) — D3-based SVG generator
- [`src/lib/slides/svg-to-png.ts`](src/lib/slides/svg-to-png.ts) — client Canvas-based raster converter
- [`src/lib/slides/parse-legacy.ts`](src/lib/slides/parse-legacy.ts) — detects JSON vs legacy markdown deck
- [`src/lib/slides/generate-pptx.ts`](src/lib/slides/generate-pptx.ts) — 1530 lines, PptxGenJS-based exporter

### D3. Chart rendering at preview time

**Library:** `d3-scale`, `d3-shape`, `d3-axis` (D3 modular modules — *not* Recharts, *not* Chart.js).

[chart-to-svg.ts:1-27](src/lib/slides/chart-to-svg.ts#L1-L27) excerpt (from subagent read):

```typescript
/**
 * Chart to SVG renderer using D3.js
 *
 * Generates SVG strings for bar, bar-horizontal, line, pie, and donut charts.
 * Works both server-side (for HTML generation) and client-side (for PPTX export).
 */

import * as d3Scale from "d3-scale"
import * as d3Shape from "d3-shape"
import type { ChartData, ChartDataPoint, ChartSeries } from "./types"

// Default color palette (matches mermaid-config.ts pie colors)
const DEFAULT_COLORS = [
  "#3b82f6", // blue-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
]
```

At preview time, `chartToSvg()` returns an SVG string which `slidesToHtml()` embeds directly into the iframe srcDoc. No Canvas rasterization at preview time — SVG renders natively in the browser.

Chart types: `bar`, `bar-horizontal`, `line`, `pie`, `donut` (enforced by `ChartData` type at [`src/lib/slides/types.ts`](src/lib/slides/types.ts)).

### D4. Mermaid rendering at preview time

Two flavors:

1. **Standalone Mermaid artifact** (`application/mermaid`): [`mermaid-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx) (170 lines per prior recon) — uses the client-side `mermaid.render()` API.

2. **Mermaid-in-slides**: `slidesToHtml()` in [`render-html.ts`](src/lib/slides/render-html.ts) embeds Mermaid source in `<pre class="mermaid">` blocks inside the iframe; the iframe then runs `mermaid.initialize()` + `mermaid.run()` to transform them to SVG.

3. **Mermaid-in-markdown** (text/markdown via Streamdown): Streamdown's built-in Mermaid plugin renders ` ```mermaid ` fenced blocks inline with a custom error component (see C2).

### D5. `generatePptx` — PPTX exporter

File: [`src/lib/slides/generate-pptx.ts`](src/lib/slides/generate-pptx.ts), **1530 lines**. Uses `pptxgenjs` v4.0.1. Invoked client-side from the download button (see §I2).

#### D5a. Chart slides — rasterized PNG

Per subagent read of [generate-pptx.ts:620-621](src/lib/slides/generate-pptx.ts#L620-L621):

```typescript
const svgString = chartToSvg(slide.chart, CHART_DIMENSIONS.pptx.fullSlide.width, CHART_DIMENSIONS.pptx.fullSlide.height)
const pngData = await svgToBase64Png(svgString, 900, 500)
```

**Answer:** Charts are **rasterized to PNG** via `svgToBase64Png()` (Canvas API client-side). They are NOT native PPTX chart shapes. This keeps the exporter client-side-only.

#### D5b. Mermaid slides — PNG via client-side mermaid render

Per subagent read of [generate-pptx.ts:504](src/lib/slides/generate-pptx.ts#L504):

```typescript
const pngData = await mermaidToBase64Png(slide.diagram, MERMAID_DIMENSIONS.fullSlide.width, MERMAID_DIMENSIONS.fullSlide.height)
```

`mermaidToBase64Png()` lives in [`src/lib/slides/svg-to-png.ts`](src/lib/slides/svg-to-png.ts) — calls `mermaid.render()` (client), obtains SVG, then rasterizes via Canvas to PNG data URL.

#### D5c. Image slides — fetch to base64, embed in PPTX binary

Slides image URLs (including already-resolved Unsplash URLs from [resolver.ts](src/lib/unsplash/resolver.ts)) are fetched client-side and converted to base64 for PPTX embedding. Unsplash resolution happens **server-side at create/update time** (see §F / §G1), so by the time the client exports PPTX the URLs are real, not `unsplash:` protocol strings.

#### D5d. Text slides — plain text with PptxGenJS formatting

Per subagent read of [generate-pptx.ts:71-128](src/lib/slides/generate-pptx.ts#L71-L128): title/subtitle/content slides use PptxGenJS text options (`bold`, `italic`, `align`, `color`, `fontSize`). **No markdown parsing at export time** — the slides content is plain string with some icon-syntax stripping at [generate-pptx.ts:21-24](src/lib/slides/generate-pptx.ts#L21-L24). Inline `{icon:name}` syntax is stripped for PPTX (works only in HTML preview).

### D6. Mermaid usage (`rg -n "mermaid" src/ -t ts -t tsx | head -40`)

Key references:
- `package.json`: `"mermaid": "^11.12.2"`
- [mermaid-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx) — standalone artifact
- [mermaid-config.ts](src/features/conversations/components/chat/artifacts/renderers/mermaid-config.ts) — shared theme/config
- [streamdown-content.tsx:40-41](src/features/conversations/components/chat/streamdown-content.tsx#L40-L41) — `controls: { mermaid: true }`, `mermaid: { errorComponent: MermaidError }`
- [svg-to-png.ts](src/lib/slides/svg-to-png.ts) — `mermaidToBase64Png()` for PPTX export
- [render-html.ts](src/lib/slides/render-html.ts) — iframe-embedded mermaid for slides preview
- [_validate-artifact.ts:45](src/lib/tools/builtin/_validate-artifact.ts#L45) — `if (type === "application/mermaid") return validateMermaid(content)`

### D7. Headless browser check

`rg -n "puppeteer|playwright|chromium|jsdom|html2canvas|toDataURL" src/ package.json` →

| Term | Result |
|---|---|
| puppeteer | `[NOT FOUND]` |
| playwright | `[NOT FOUND]` |
| chromium | `[NOT FOUND]` |
| jsdom | `[NOT FOUND]` |
| html2canvas | `[NOT FOUND]` |
| toDataURL | Present — Canvas API call in [svg-to-png.ts](src/lib/slides/svg-to-png.ts) for SVG→PNG raster (client-side, native browser Canvas) |

**Finding:** No headless-browser dependency anywhere in the repo. All existing export rasterization (Mermaid, charts) runs client-side via the browser's native Canvas API. This is a notable constraint for Phase 4–5 (DOCX/PDF export will either need client-side rendering OR a new server dependency).

### D8. D3 imports

`rg -n "from ['\"]d3['\"]|from ['\"]d3-" src/` →

- [chart-to-svg.ts:8](src/lib/slides/chart-to-svg.ts#L8): `import * as d3Scale from "d3-scale"`
- [chart-to-svg.ts:9](src/lib/slides/chart-to-svg.ts#L9): `import * as d3Shape from "d3-shape"`
- `d3-axis` imported implicitly via `d3-scale` types (per subagent observation)

**No full `d3` bundle.** Only modular packages `d3-scale`, `d3-shape`, `d3-axis`.

---

## E. Dependencies

### E1. Relevant `dependencies` + `devDependencies`

Grep-filtered entries from `package.json` (exact strings):

```json
"d3-axis": "^3.0.0",
"d3-scale": "^4.0.2",
"d3-shape": "^3.2.0",
"gray-matter": "^4.0.3",
"js-yaml": "^4.1.1",
"mermaid": "^11.12.2",
"pptxgenjs": "^4.0.1",
"react-markdown": "^10.1.0",
"recharts": "2.15.4",
"rehype-katex": "^7.0.1",
"remark-gfm": "^4.0.1",
"remark-math": "^6.0.0",
"streamdown": "^2.2.0"
```

`devDependencies` relevant:
```json
"@types/d3-axis": "^3.0.6",
"@types/d3-scale": "^4.0.9",
"@types/d3-shape": "^3.1.8",
"@types/js-yaml": "^4.0.9"
```

Versions for `d3-*` and `@types/d3-*` sourced from subagent read of the full `package.json`; `rehype-katex` / `remark-*` versions also cross-verified against [streamdown-content.tsx](src/features/conversations/components/chat/streamdown-content.tsx) imports.

### E2. Dependency presence matrix

| Package | Installed? | Version | Notes |
|---|---|---|---|
| `mermaid` | ✅ | `^11.12.2` | Used in standalone artifact, slides iframe, Streamdown markdown, PPTX export raster |
| `d3` (full) | ❌ | — | Only modular sub-packages present |
| `d3-scale` | ✅ | `^4.0.2` | Used by `chart-to-svg.ts` |
| `d3-shape` | ✅ | `^3.2.0` | Used by `chart-to-svg.ts` |
| `d3-axis` | ✅ | `^3.0.0` | Used indirectly via `d3-scale` types |
| `recharts` | ✅ | `2.15.4` | **Installed but not used in slides charts** — usage elsewhere (e.g. dashboards outside artifact system) not confirmed |
| `chart.js` / `chartjs` | ❌ | — | `[NOT FOUND]` |
| `pptxgenjs` | ✅ | `^4.0.1` | Sole PPTX generator |
| `puppeteer` / `puppeteer-core` | ❌ | — | `[NOT FOUND]` |
| `@sparticuz/chromium` | ❌ | — | `[NOT FOUND]` |
| `playwright` | ❌ | — | `[NOT FOUND]` |
| `docx` | ❌ | — | `[NOT FOUND]` — no DOCX library |
| `officegen` | ❌ | — | `[NOT FOUND]` |
| `jspdf` / `pdfkit` / `pdfmake` | ❌ | — | `[NOT FOUND]` — no PDF library |
| `@react-pdf/renderer` | ❌ | — | `[NOT FOUND]` |
| `html-to-docx` | ❌ | — | `[NOT FOUND]` |
| `html-pdf-node` | ❌ | — | `[NOT FOUND]` |
| `gray-matter` | ✅ | `^4.0.3` | Installed, **not yet wired** (frontmatter parse for Phase 2) |
| `js-yaml` | ✅ | `^4.1.1` | Installed, **not yet wired** |
| `unified` | ❌ (direct) | — | Present transitively through `streamdown` + `remark-*` |
| `remark-parse` | ❌ (direct) | — | Transitively via Streamdown |
| `remark-gfm` | ✅ | `^4.0.1` | Implicit via Streamdown + explicit import elsewhere |
| `remark-math` | ✅ | `^6.0.0` | Wired into Streamdown plugin |
| `rehype-katex` | ✅ | `^7.0.1` | Wired into Streamdown plugin |
| `katex` | ✅ (transitive) | — | Pulled in by `rehype-katex`; CSS imported at [streamdown-content.tsx:7](src/features/conversations/components/chat/streamdown-content.tsx#L7) |
| `streamdown` | ✅ | `^2.2.0` | Active markdown parser |
| `react-markdown` | ✅ | `^10.1.0` | Installed, not used in artifact panel (may be used in non-artifact chat surfaces) |

**Key gaps for Phases 4–5:** no DOCX library, no PDF library, no headless browser. Every DOCX/PDF export plan has to pick from: install a new library, OR rely on client-side Canvas rendering.

---

## F. Unsplash Resolver

### F1. `resolver.ts`

[resolver.ts:1-193](src/lib/unsplash/resolver.ts#L1-L193) — full file:

```typescript
/**
 * Image resolution logic for HTML artifacts.
 * Resolves unsplash:keyword URLs to real Unsplash photos.
 */

import { prisma } from "@/lib/prisma"
import { searchPhoto } from "./client"

/** Regex to match src="unsplash:keyword" or src='unsplash:keyword' */
const UNSPLASH_REGEX = /src=["']unsplash:([^"']+)["']/gi

/** Cache duration in days */
const CACHE_DAYS = 30

/**
 * Normalize a search query for consistent caching.
 */
function normalize(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Collapse whitespace
    .slice(0, 50) // Max 50 chars
}

/**
 * Generate a fallback placeholder URL with the keyword as text.
 */
function fallbackUrl(query: string): string {
  const encoded = encodeURIComponent(query)
  // Gray background (#f1f5f9) with dark text (#64748b)
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encoded}`
}

/**
 * Resolve all unsplash:keyword URLs in HTML content to real Unsplash photos.
 * Falls back to placehold.co if Unsplash is unavailable.
 */
export async function resolveHtmlImages(content: string): Promise<string> {
  // 1. Extract all unsplash: URLs
  const matches = [...content.matchAll(UNSPLASH_REGEX)]
  if (matches.length === 0) {
    return content
  }

  // 2. Dedupe and normalize queries
  const queries = [...new Set(matches.map((m) => normalize(m[1])))]
  const resolved = await resolveQueries(queries)

  // 3. Replace all unsplash: URLs with resolved URLs
  return content.replace(UNSPLASH_REGEX, (_, rawQuery) => {
    const normalizedQuery = normalize(rawQuery)
    const url = resolved.get(normalizedQuery) ?? fallbackUrl(rawQuery)
    return `src="${url}"`
  })
}

/** Slide type for resolver (minimal fields we need) */
interface SlideForResolver {
  imageUrl?: string
  backgroundImage?: string
  quoteImage?: string
  gallery?: Array<{ imageUrl?: string; caption?: string }>
}

/**
 * Resolve unsplash:keyword URLs in slides JSON content.
 * Handles: imageUrl, backgroundImage, quoteImage, gallery[].imageUrl
 */
export async function resolveSlideImages(content: string): Promise<string> {
  // Try to parse as JSON
  let data: { slides?: SlideForResolver[] }
  try {
    data = JSON.parse(content)
  } catch {
    return content // Not valid JSON, return as-is
  }

  if (!data.slides || !Array.isArray(data.slides)) {
    return content
  }

  // 1. Collect all unsplash: URLs from slides
  const unsplashUrls: string[] = []
  for (const slide of data.slides) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.imageUrl.slice(9)))
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.backgroundImage.slice(9)))
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.quoteImage.slice(9)))
    }
    // Gallery items
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          unsplashUrls.push(normalize(item.imageUrl.slice(9)))
        }
      }
    }
  }

  if (unsplashUrls.length === 0) {
    return content
  }

  // 2. Resolve all unique queries
  const queries = [...new Set(unsplashUrls)]
  const resolved = await resolveQueries(queries)

  // 3. Replace unsplash: URLs in slides
  for (const slide of data.slides) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      const query = normalize(slide.imageUrl.slice(9))
      slide.imageUrl = resolved.get(query) ?? fallbackUrl(query)
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      const query = normalize(slide.backgroundImage.slice(9))
      slide.backgroundImage = resolved.get(query) ?? fallbackUrl(query)
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      const query = normalize(slide.quoteImage.slice(9))
      slide.quoteImage = resolved.get(query) ?? fallbackUrl(query)
    }
    // Gallery items
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          const query = normalize(item.imageUrl.slice(9))
          item.imageUrl = resolved.get(query) ?? fallbackUrl(query)
        }
      }
    }
  }

  return JSON.stringify(data)
}

/**
 * Resolve a list of queries to URLs (with caching).
 * Shared logic between HTML and Slides resolvers.
 */
async function resolveQueries(queries: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()

  // 1. Check cache first
  try {
    const cached = await prisma.resolvedImage.findMany({
      where: { query: { in: queries } },
    })
    for (const entry of cached) {
      resolved.set(entry.query, entry.url)
    }
  } catch (error) {
    console.warn("[unsplash] Cache lookup failed:", error)
  }

  // 2. Fetch uncached queries in parallel
  const uncached = queries.filter((q) => !resolved.has(q))

  await Promise.all(
    uncached.map(async (query) => {
      const photo = await searchPhoto(query)

      if (photo) {
        // Use regular size with width parameter for optimal loading
        const url = `${photo.urls.regular}&w=1200`
        resolved.set(query, url)

        // Cache the result
        try {
          await prisma.resolvedImage.create({
            data: {
              query,
              url,
              attribution: `Photo by ${photo.user.name} on Unsplash`,
              expiresAt: new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000),
            },
          })
        } catch {
          // Ignore duplicate key errors (race condition)
        }
      } else {
        // Unsplash failed - use placeholder with keyword text
        resolved.set(query, fallbackUrl(query))
      }
    })
  )

  return resolved
}
```

### F2. `client.ts`

[client.ts:1-45](src/lib/unsplash/client.ts#L1-L45) — full file:

```typescript
/**
 * Unsplash API client
 */

import type { UnsplashPhoto, UnsplashSearchResponse } from "./types"

const API_URL = "https://api.unsplash.com/search/photos"
const TIMEOUT_MS = 5000

/**
 * Search for a photo on Unsplash.
 * Returns the first result or null if not found / API unavailable.
 */
export async function searchPhoto(query: string): Promise<UnsplashPhoto | null> {
  const apiKey = process.env.UNSPLASH_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    const url = `${API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${apiKey}`,
        "Accept-Version": "v1",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.warn(`[unsplash] API returned ${response.status} for query: ${query}`)
      return null
    }

    const data: UnsplashSearchResponse = await response.json()
    return data.results?.[0] ?? null
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.warn(`[unsplash] Timeout for query: ${query}`)
    } else {
      console.warn(`[unsplash] Error fetching photo:`, error)
    }
    return null
  }
}
```

### F3. Callers

- [create-artifact.ts:6](src/lib/tools/builtin/create-artifact.ts#L6): `import { resolveImages, resolveSlideImages } from "@/lib/unsplash"`
- [create-artifact.ts:131-136](src/lib/tools/builtin/create-artifact.ts#L131-L136) — dispatch:

```typescript
    // Resolve unsplash: URLs to real images for HTML and slides artifacts
    let finalContent = content
    if (type === "text/html") {
      finalContent = await resolveImages(content)
    } else if (type === "application/slides") {
      finalContent = await resolveSlideImages(content)
    }
```

- [update-artifact.ts:7](src/lib/tools/builtin/update-artifact.ts#L7): same import
- [update-artifact.ts:91-97](src/lib/tools/builtin/update-artifact.ts#L91-L97):

```typescript
        // Resolve unsplash: URLs to real images for HTML and slides artifacts
        let finalContent = content
        if (existing.artifactType === "text/html") {
          finalContent = await resolveImages(content)
        } else if (existing.artifactType === "application/slides") {
          finalContent = await resolveSlideImages(content)
        }
```

Note: the imported name at the call site is `resolveImages` (re-exported from `@/lib/unsplash/index.ts` — underlying function is `resolveHtmlImages`).

### F4. Regex and triggers

| Resolver | Pattern / field | Triggered on artifact type |
|---|---|---|
| `resolveHtmlImages` | regex `/src=["']unsplash:([^"']+)["']/gi` ([resolver.ts:10](src/lib/unsplash/resolver.ts#L10)) | `text/html` only |
| `resolveSlideImages` | JSON field checks on `slide.imageUrl`, `slide.backgroundImage`, `slide.quoteImage`, `slide.gallery[].imageUrl` ([resolver.ts:85-102](src/lib/unsplash/resolver.ts#L85-L102)) | `application/slides` only |

**Confirmation for Phase 3 scoping:** `text/document` currently **does NOT trigger Unsplash resolution**. When it's re-introduced, Phase 3 needs to either (a) add a new `resolveDocumentImages()` that handles the `![alt](unsplash:keyword)` markdown image syntax, OR (b) extend `resolveHtmlImages` to also match the markdown form `\!\[[^\]]*\]\(unsplash:[^)]+\)`.

---

## G. Create/Update Artifact Pipeline

### G1. `create-artifact.ts`

[create-artifact.ts:1-199](src/lib/tools/builtin/create-artifact.ts#L1-L199) — full file (current state, 11 types):

```typescript
import { z } from "zod"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile, S3Paths, getArtifactExtension } from "@/lib/s3"
import { indexArtifactContent } from "@/lib/rag"
import { resolveImages, resolveSlideImages } from "@/lib/unsplash"
import {
  validateArtifactContent,
  formatValidationError,
} from "./_validate-artifact"

/** Maximum artifact content size: 512 KB */
const MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024

export const createArtifactTool: ToolDefinition = {
  name: "create_artifact",
  displayName: "Create Artifact",
  description:
    "Create a rich, polished artifact rendered in a live preview panel. Use for substantial content: HTML pages, React components, SVG graphics, diagrams, code files, documents, spreadsheets, slides, Python scripts, or 3D scenes. Output must be complete, self-contained, and production-quality — no placeholders, no TODOs, no incomplete sections. Always choose the most appropriate type for the content.",
  category: "builtin",
  parameters: z.object({
    title: z.string().describe("A concise, descriptive title (3-8 words) that clearly identifies the artifact content"),
    type: z
      .enum([
        "text/html",
        "text/markdown",
        "image/svg+xml",
        "application/react",
        "application/mermaid",
        "application/code",
        "application/sheet",
        "text/latex",
        "application/slides",
        "application/python",
        "application/3d",
      ])
      .describe(
        "The artifact format. Choose based on content: text/html (interactive pages, dashboards, games), application/react (UI components, data visualizations), image/svg+xml (graphics, icons), application/mermaid (flowcharts, diagrams), application/code (source code), text/markdown (documents, reports), application/sheet (CSV tables), text/latex (math equations), application/slides (presentations as JSON), application/python (executable scripts), application/3d (R3F 3D scenes)"
      ),
    content: z
      .string()
      .describe("The complete, self-contained content of the artifact. Must be fully functional — no placeholders, stubs, or TODO comments. For HTML: include full document structure. For React: include all component logic with export default. For code: include all necessary functions. For slides: provide complete JSON with theme and slides array."),
    language: z
      .string()
      .optional()
      .describe(
        "Programming language for application/code type (e.g. python, javascript, typescript)"
      ),
  }),
  execute: async (params, context) => {
    const id = crypto.randomUUID()
    const content = params.content as string
    const type = params.type as string
    const title = params.title as string
    const language = (params.language as string) || undefined

    // Validate content size
    const contentBytes = Buffer.byteLength(content, "utf-8")
    if (contentBytes > MAX_ARTIFACT_CONTENT_BYTES) {
      return {
        id, title, type, content, language,
        persisted: false,
        error: `Artifact content exceeds maximum size (${Math.round(contentBytes / 1024)}KB > ${MAX_ARTIFACT_CONTENT_BYTES / 1024}KB)`,
      }
    }

    // Canvas-mode type enforcement. When the user has selected a
    // specific artifact type, the LLM is required to use it.
    const canvasMode = context.canvasMode
    if (canvasMode && canvasMode !== "auto" && canvasMode !== type) {
      return {
        id, title, type, content, language,
        persisted: false,
        error: `Canvas mode is locked to "${canvasMode}" but you called create_artifact with type "${type}". ...`,
        validationErrors: [`Wrong artifact type: expected "${canvasMode}", got "${type}".`],
      }
    }

    // application/code requires `language`
    if (type === "application/code" && !language) {
      return {
        id, title, type, content, language,
        persisted: false,
        error: 'application/code artifacts require a `language` parameter ...',
        validationErrors: ["Missing required `language` parameter for application/code."],
      }
    }

    // Structural validation
    const validation = validateArtifactContent(type, content)
    let validationWarnings: string[] = validation.warnings
    if (!validation.ok) {
      return {
        id, title, type, content, language,
        persisted: false,
        error: formatValidationError(type, validation),
        validationErrors: validation.errors,
      }
    }

    // Resolve unsplash: URLs for HTML and slides artifacts
    let finalContent = content
    if (type === "text/html") {
      finalContent = await resolveImages(content)
    } else if (type === "application/slides") {
      finalContent = await resolveSlideImages(content)
    }

    // Persist to S3 + Document (knowledge system)
    let persisted = true
    try {
      const ext = getArtifactExtension(type)
      const s3Key = S3Paths.artifact(
        context.organizationId || null,
        context.sessionId || "orphan",
        id,
        ext
      )
      const mimeType =
        type === "image/svg+xml" ? "image/svg+xml" : "text/plain"

      await uploadFile(s3Key, Buffer.from(finalContent, "utf-8"), mimeType)

      await prisma.document.create({
        data: {
          id, title, content: finalContent,
          categories: ["ARTIFACT"],
          artifactType: type,
          sessionId: context.sessionId || null,
          organizationId: context.organizationId || null,
          createdBy: context.userId || null,
          s3Key,
          fileType: "artifact",
          fileSize: contentBytes,
          mimeType,
          metadata: {
            artifactLanguage: language,
            ...(validationWarnings.length > 0 ? { validationWarnings } : {}),
          },
        },
      })

      // Background: RAG indexing
      indexArtifactContent(id, title, finalContent).catch((err) =>
        console.error("[create_artifact] Background indexing error:", err)
      )
    } catch (err) {
      console.error("[create_artifact] Persistence error:", err)
      persisted = false
    }

    return {
      id, title, type,
      content: finalContent,
      language, persisted,
      ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
    }
  },
}
```

(Block excerpts condensed from [create-artifact.ts:50-198](src/lib/tools/builtin/create-artifact.ts#L50-L198) for readability; full bodies were verified verbatim.)

### G2. `update-artifact.ts`

[update-artifact.ts:1-197](src/lib/tools/builtin/update-artifact.ts#L1-L197) — structural summary with verbatim key sections:

- **Header + imports** ([update-artifact.ts:1-17](src/lib/tools/builtin/update-artifact.ts#L1-L17)) identical pattern to create-artifact
- **Constants:** `MAX_VERSION_HISTORY = 20`, `MAX_INLINE_FALLBACK_BYTES = 32 * 1024`, `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024`
- **Zod schema** [update-artifact.ts:34-45](src/lib/tools/builtin/update-artifact.ts#L34-L45) — just `id`, `title?`, `content` (no type enum)
- **Execute flow:**
  1. Size check ([update-artifact.ts:51-62](src/lib/tools/builtin/update-artifact.ts#L51-L62))
  2. Load existing Document ([update-artifact.ts:68](src/lib/tools/builtin/update-artifact.ts#L68))
  3. Run `validateArtifactContent(existing.artifactType, content)` ([update-artifact.ts:72-89](src/lib/tools/builtin/update-artifact.ts#L72-L89))
  4. Resolve Unsplash if text/html or application/slides ([update-artifact.ts:91-97](src/lib/tools/builtin/update-artifact.ts#L91-L97))
  5. Archive old version to S3 at `${existing.s3Key}.v${versionNum}` with inline fallback for small content ([update-artifact.ts:99-139](src/lib/tools/builtin/update-artifact.ts#L99-L139))
  6. FIFO eviction at 20 versions ([update-artifact.ts:141-148](src/lib/tools/builtin/update-artifact.ts#L141-L148))
  7. Upload new content + update Prisma ([update-artifact.ts:150-176](src/lib/tools/builtin/update-artifact.ts#L150-L176))
  8. Background re-index ([update-artifact.ts:179-181](src/lib/tools/builtin/update-artifact.ts#L179-L181))

### G3. `_validate-artifact.ts`

File is **1790 lines** ([wc -l result](src/lib/tools/builtin/_validate-artifact.ts)). The dispatch function is the only block directly relevant to adding new types:

[_validate-artifact.ts:38-54](src/lib/tools/builtin/_validate-artifact.ts#L38-L54):

```typescript
export function validateArtifactContent(
  type: string,
  content: string
): ArtifactValidationResult {
  if (type === "text/html") return validateHtml(content)
  if (type === "application/react") return validateReact(content)
  if (type === "image/svg+xml") return validateSvg(content)
  if (type === "application/mermaid") return validateMermaid(content)
  if (type === "application/python") return validatePython(content)
  if (type === "application/code") return validateCode(content)
  if (type === "text/markdown") return validateMarkdown(content)
  if (type === "text/latex") return validateLatex(content)
  if (type === "application/sheet") return validateSheet(content)
  if (type === "application/slides") return validateSlides(content)
  if (type === "application/3d") return validate3d(content)
  return { ok: true, errors: [], warnings: [] }
}
```

**Current state:** 11 `if` branches; no `text/document` dispatch. Falls through to permissive `{ ok: true, errors: [], warnings: [] }` for anything unknown.

Remainder of the file (L55-L1790) is per-type validator implementations: `validateSlides` (largest, with layout/bullet/slide-count checks), `validateHtml`, `validateReact`, `validateSvg`, `validateMermaid`, `validatePython`, `validateCode`, `validateMarkdown`, `validateLatex`, `validateSheet`, `validate3d`. They are independent functions and do not interact with the dispatch beyond being called from it.

### G4. `updateDashboardChatSessionArtifact`

Per subagent read: [service.ts:430-546](src/features/conversations/sessions/service.ts#L430-L546) — `updateDashboardChatSessionArtifact(params)` function that:

1. Checks session ownership via `findDashboardSessionByIdAndUser`.
2. Runs `validateArtifactContent(existing.artifactType, content)` (same validator as the LLM tool).
3. Archives old content to S3 with inline fallback (same logic as `update-artifact.ts`).
4. Updates Document via `updateDashboardArtifactById`.
5. Background RAG re-index.

Returns either the updated artifact or an `HttpServiceError` (400/404/422). **Structural equivalence with the LLM update path** — any new type that validates in the tool will also validate in manual-edit PUT.

---

## H. API Routes

### H1. Artifact route

[route.ts:1-81](src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts#L1-L81) — full file:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  DashboardChatSessionArtifactBodySchema,
  DashboardChatSessionArtifactParamsSchema,
} from "@/features/conversations/sessions/schema"
import {
  deleteDashboardChatSessionArtifact,
  updateDashboardChatSessionArtifact,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionArtifactParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
    }

    const parsedBody = DashboardChatSessionArtifactBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const result = await updateDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      artifactId: parsedParams.data.artifactId,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Artifact API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update artifact" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionArtifactParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
    }

    const result = await deleteDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      artifactId: parsedParams.data.artifactId,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Artifact API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete artifact" }, { status: 500 })
  }
}
```

### H2. Routes under `sessions/` namespace

From subagent glob of `src/app/api/dashboard/chat/sessions/`:

- `src/app/api/dashboard/chat/sessions/route.ts` (sessions collection)
- `src/app/api/dashboard/chat/sessions/[id]/route.ts` (single session GET/PUT/DELETE)
- `src/app/api/dashboard/chat/sessions/[id]/messages/route.ts` (messages)
- `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts` (the artifact CRUD above)

### H3. Export endpoints

**`[NOT FOUND]`** — there is no GET artifact endpoint and no export endpoint. Downloads are client-side only (see §I). Phase 4–5 will need to create new routes for DOCX / PDF export.

---

## I. Download Handler

### I1. `getExtension` + helpers

[artifact-panel.tsx:741-775](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L741-L775) — current state (11 types, no `text/document`):

```typescript
function codeExtension(language: string | undefined): string {
  if (!language) return ".txt"
  const key = language.toLowerCase().trim()
  const mapped = CODE_LANGUAGE_EXTENSIONS[key]
  return mapped ? `.${mapped}` : `.${key}`
}

function getExtension(artifact: Artifact): string {
  switch (artifact.type) {
    case "text/html":
      return ".html"
    case "text/markdown":
      return ".md"
    case "image/svg+xml":
      return ".svg"
    case "application/react":
      return ".tsx"
    case "application/mermaid":
      return ".mmd"
    case "application/code":
      return codeExtension(artifact.language)
    case "application/sheet":
      return ".csv"
    case "text/latex":
      return ".tex"
    case "application/slides":
      return ".pptx"
    case "application/python":
      return ".py"
    case "application/3d":
      return ".tsx"
    default:
      return ".txt"
  }
}
```

[artifact-panel.tsx:784-799](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L784-L799) — LaTeX preamble wrapper:

```typescript
function wrapLatexForDownload(body: string): string {
  if (/\\documentclass\b/.test(body)) return body
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsthm}
\\usepackage{hyperref}

\\begin{document}

${body.trim()}

\\end{document}
`
}
```

[artifact-panel.tsx:801-825](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L801-L825) — `getCodeLanguage()` maps type → Shiki language tag for the Code tab (11 cases):

```typescript
function getCodeLanguage(artifact: Artifact): string {
  switch (artifact.type) {
    case "text/html":     return "html"
    case "text/markdown": return "markdown"
    case "image/svg+xml": return "svg"
    case "application/react":    return "tsx"
    case "application/mermaid":  return "mermaid"
    case "application/code":     return artifact.language || ""
    case "application/sheet":    return "csv"
    case "text/latex":           return "latex"
    case "application/slides":   return "json"
    case "application/python":   return "python"
    case "application/3d":       return "tsx"
    default: return ""
  }
}
```

### I2. Download `onClick` handler

[artifact-panel.tsx:149-196](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L149-L196) — verbatim (from subagent read, cross-verified):

```typescript
  const handleDownload = useCallback(async () => {
    const ext = getExtension(displayArtifact)
    const filename = `${displayArtifact.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}${ext}`

    // For slides, generate a real PPTX file
    if (displayArtifact.type === "application/slides") {
      try {
        const { isJsonPresentation, parseLegacyMarkdown } = await import("@/lib/slides/parse-legacy")
        const { DEFAULT_THEME } = await import("@/lib/slides/types")
        const { generatePptx } = await import("@/lib/slides/generate-pptx")

        let presentation
        if (isJsonPresentation(displayArtifact.content)) {
          const parsed = JSON.parse(displayArtifact.content)
          presentation = { theme: parsed.theme || DEFAULT_THEME, slides: parsed.slides }
        } else {
          presentation = parseLegacyMarkdown(displayArtifact.content)
        }

        const blob = await generatePptx(presentation)
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error("[ArtifactPanel] PPTX generation failed:", err)
      }
      return
    }

    // LaTeX artifacts are KaTeX fragments — they have no preamble and won't
    // compile in pdflatex as-is. Wrap them in a minimal article document on
    // download so users get a `.tex` file they can actually compile.
    const downloadContent =
      displayArtifact.type === "text/latex"
        ? wrapLatexForDownload(displayArtifact.content)
        : displayArtifact.content

    const blob = new Blob([downloadContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [displayArtifact])
```

### I3. Special cases

- **Slides** (`application/slides`): Uses dynamic imports of `parse-legacy`, `types`, and `generate-pptx`, produces a real `.pptx` blob. No fallback to text/plain — errors are logged and download is aborted.
- **LaTeX** (`text/latex`): If the body doesn't already start with `\documentclass`, `wrapLatexForDownload` prepends an article preamble loading `amsmath`, `amssymb`, `amsthm`, `hyperref` and wraps in `\begin{document} ... \end{document}`. Output is plain `.tex`.
- **Everything else**: `new Blob([content], { type: "text/plain" })` → `URL.createObjectURL` → synthetic `<a>` click → revoke. No server round-trip.

---

## J. Math / KaTeX

### J1. Hits

`rg -n "katex|remark-math|rehype-katex" src/ package.json`:

- `package.json`: `"remark-math": "^6.0.0"`, `"rehype-katex": "^7.0.1"`
- [streamdown-content.tsx:7](src/features/conversations/components/chat/streamdown-content.tsx#L7): `import "katex/dist/katex.min.css"`
- [streamdown-content.tsx:8](src/features/conversations/components/chat/streamdown-content.tsx#L8): `import remarkMath from "remark-math"`
- [streamdown-content.tsx:9](src/features/conversations/components/chat/streamdown-content.tsx#L9): `import rehypeKatex from "rehype-katex"`
- [streamdown-content.tsx:82-89](src/features/conversations/components/chat/streamdown-content.tsx#L82-L89): plugin configuration

### J2. Streamdown plugin wiring

[streamdown-content.tsx:82-89](src/features/conversations/components/chat/streamdown-content.tsx#L82-L89):

```tsx
        plugins={{
          math: {
            name: "katex",
            type: "math",
            remarkPlugin: remarkMath,
            rehypePlugin: rehypeKatex,
          },
        }}
```

Inline `$...$` and display `$$...$$` are parsed by `remark-math` into MDX math nodes, then transformed to rendered HTML by `rehype-katex`.

### J3. KaTeX delivery method

**Bundled (via NPM).** The CSS is imported from the package at [streamdown-content.tsx:7](src/features/conversations/components/chat/streamdown-content.tsx#L7) (`"katex/dist/katex.min.css"`). No `<link>` tag, no CDN. The JS side is pulled in transitively by `rehype-katex`.

---

## K. Deployment Target and Runtime Constraints

### K1. Deployment platform signals

Files examined:
- [`next.config.mjs`](next.config.mjs): no `output: "export"`, no Vercel-specific config blocks; does set `serverExternalPackages` for native bindings (see K2)
- [`vercel.json`](vercel.json): `[NOT FOUND]` at repo root (subagent glob did not surface it)
- [`Dockerfile`](Dockerfile): present at repo root (gitStatus mentions it, not read here — flagged for direct inspection if deployment target matters)
- [`docker-compose.yml`](docker-compose.yml): present at repo root
- [`.github/workflows/`](.github/workflows/): presence not confirmed in this pass

**Interpretation:** the presence of `Dockerfile` + `docker-compose.yml` + `serverExternalPackages` list with non-portable native bindings (canvas, pdf-img-convert, sharp, @libsql/client, dockerode, ssh2) strongly suggests **self-hosted Node/Docker deployment**, not Vercel Serverless. This matters for Phase 4/5: a server-side headless browser would be viable on Docker but would require a `@sparticuz/chromium` workaround on Vercel.

### K2. `next.config.mjs`

[next.config.mjs:1-56](next.config.mjs#L1-L56) — full file:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // External packages with native bindings (canvas for OCR, LibSQL for database)
  serverExternalPackages: [
    "canvas",
    "pdf-img-convert",
    "sharp",
    "@libsql/client",
    "@libsql/win32-x64-msvc",
    "@mastra/libsql",
    "dockerode",
    "docker-modem",
    "ssh2"
  ],
  async headers() {
    return [
      {
        // Global security headers
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Widget API CORS headers
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Widget-Api-Key" },
        ],
      },
      {
        // MCP Server CORS headers (external MCP clients)
        source: "/api/mcp/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS, DELETE" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version" },
        ],
      },
    ]
  },
}

export default nextConfig
```

(One minor transcription variation across reads in the MCP CORS `Allow-Methods` entry — verbatim above is from the direct file read; treat this line as read-from-source rather than inferred.)

**Observations:**
- `canvas` in `serverExternalPackages` — native dependency present. `canvas` is usable for server-side raster ops; could support server-side SVG→PNG for DOCX/PDF export without headless browser.
- `sharp` present — available for server-side image manipulation.
- `pdf-img-convert` present — potentially useful for PDF-to-image conversion if PDF export ever needs preview thumbnails.
- No `canvas-ng`, no `playwright`, no `puppeteer-core`.

### K3. Serverless timeout/memory limits

**`[NOT FOUND]`** — no `export const runtime = ...`, no `export const maxDuration = ...`, no `export const dynamic = ...` in the artifact API route file. No `vercel.json` functions block. Default Next.js / deployment platform limits apply (typically 30s on Vercel serverless; unlimited on self-hosted Docker).

### K4. S3 upload helper

Grep `rg -n "uploadToS3|s3\.upload|putObject|uploadFile" src/`:

- `uploadFile` imported by [create-artifact.ts:4](src/lib/tools/builtin/create-artifact.ts#L4) and [update-artifact.ts:5](src/lib/tools/builtin/update-artifact.ts#L5) from `@/lib/s3`.
- [create-artifact.ts:151-155](src/lib/tools/builtin/create-artifact.ts#L151-L155):

```typescript
      await uploadFile(
        s3Key,
        Buffer.from(finalContent, "utf-8"),
        mimeType
      )
```

- Helper utilities: `S3Paths.artifact(organizationId, sessionId, id, ext)` produces the canonical key; `getArtifactExtension(type)` returns an extension string for the S3 key ([create-artifact.ts:141](src/lib/tools/builtin/create-artifact.ts#L141)).

**Reusability for binary exports (Phase 4–5):** `uploadFile` takes a `Buffer` + `mimeType` — can upload DOCX/PDF bytes directly. S3 key scheme `orgs/{orgId}/sessions/{sessionId}/artifacts/{id}.{ext}` can extend to `.docx` / `.pdf` without schema changes.

---

## L. Testing Infra

### L1. Test directory structure

From subagent glob:

```
tests/
  unit/
    validate-artifact.test.ts        ← primary artifact tests
    mcp/tool-adapter.test.ts
  integration/
    media/
      api/jobs.test.ts
  bench-kb/
    src/bench-extraction-impact.ts
```

No `__tests__` directories inside `src/`. Tests are centralized under `tests/`.

### L2. Artifact tests

From `tests/unit/validate-artifact.test.ts` — subagent enumerated `describe` blocks:

- `validateArtifactContent — text/html`
- `validateArtifactContent — application/react`
- `validateArtifactContent — image/svg+xml`
- `validateArtifactContent — application/mermaid`
- `validateArtifactContent — application/python`
- `validateArtifactContent — other types pass through`
- `validateArtifactContent — application/code`
- `validateArtifactContent — text/markdown`
- `validateArtifactContent — text/latex`
- `validateArtifactContent — application/sheet (CSV)`
- `validateArtifactContent — application/sheet (JSON)`
- `validateArtifactContent — application/slides`
- `validateArtifactContent — application/3d`
- `create_artifact tool — guard rails`

**`[NOT FOUND]`** for `text/document` tests. Phase 8 (or earlier) needs to add them.

### L3. Example test

[validate-artifact.test.ts:27-45](tests/unit/validate-artifact.test.ts#L27-L45) — verified pattern from subagent:

```typescript
describe("validateArtifactContent — text/html", () => {
  it("accepts a well-formed document", () => {
    const r = validateArtifactContent("text/html", VALID_HTML)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects missing doctype", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<!DOCTYPE html>", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/DOCTYPE/)
  })

  it("rejects missing viewport meta", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace(/<meta name="viewport"[^>]*\/>/, "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/viewport/)
  })
```

Pattern is simple: parametrize the validator, assert on `{ ok, errors, warnings }`. No mocks. Fast.

---

## M. Summary Matrix

| Concern | Already exists? | File path | Library used | Reusability for `text/document` | Notes |
|---|---|---|---|---|---|
| Markdown body rendering | ✅ | [streamdown-content.tsx](src/features/conversations/components/chat/streamdown-content.tsx) | Streamdown v2.2.0 | **HIGH** — direct reuse, same renderer | Works today for `text/markdown` |
| GFM tables | ✅ | Streamdown implicit + `remark-gfm` v4 | — | **HIGH** | Free with Streamdown |
| Mermaid diagram (preview) | ✅ | [streamdown-content.tsx:40-41](src/features/conversations/components/chat/streamdown-content.tsx#L40-L41), [mermaid-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx) | Mermaid v11.12.2 | **HIGH** | Inline in markdown, free reuse |
| Mermaid → PNG (export) | ✅ | [svg-to-png.ts](src/lib/slides/svg-to-png.ts) (`mermaidToBase64Png`) | Mermaid + Canvas API | **HIGH** — call from DOCX/PDF pipeline | Client-side; if export moves server-side, needs replacement |
| Chart rendering (preview) | ✅ (slides-only) | [chart-to-svg.ts](src/lib/slides/chart-to-svg.ts) | `d3-scale`, `d3-shape` | **MEDIUM** — chart JSON schema exists but needs prompt rules extension for document | Recharts is installed but not used in slides |
| Chart → image (export) | ✅ (slides-only) | [generate-pptx.ts:620-621](src/lib/slides/generate-pptx.ts#L620-L621) (`svgToBase64Png`) | D3 + Canvas | **HIGH** | Same flow reusable for DOCX/PDF |
| KaTeX math (preview) | ✅ | [streamdown-content.tsx:82-89](src/features/conversations/components/chat/streamdown-content.tsx#L82-L89) | `remark-math` v6 + `rehype-katex` v7 | **HIGH** | Free with Streamdown |
| KaTeX math → image / OMML (export) | ❌ | — | — | **MUST BUILD** | Current LaTeX artifact just wraps KaTeX in a preamble; DOCX/PDF cannot embed that |
| Image embed from URL | ✅ | Streamdown markdown images + slides `fetchImageAsBase64` | Fetch + Canvas | **HIGH** | Works in Streamdown preview |
| Unsplash resolution | ✅ (HTML + Slides only) | [resolver.ts](src/lib/unsplash/resolver.ts) | Unsplash API + Prisma cache | **MEDIUM** — must add a markdown-image pattern matcher | Phase 3 scope |
| YAML frontmatter parsing | ❌ | [NOT FOUND] usage; `gray-matter` + `js-yaml` installed | — | **HIGH** (just wire) | Phase 2 |
| DOCX generation | ❌ | [NOT FOUND] | — | **MUST BUILD / INSTALL** | Phase 4; candidates `docx`, `html-to-docx`, `officegen` |
| PDF generation | ❌ | [NOT FOUND] | — | **MUST BUILD / INSTALL** | Phase 5; candidates `puppeteer`, `@react-pdf/renderer`, `pdfkit`, `html-pdf-node` |
| Headless browser | ❌ | — | — | — | `[NOT FOUND]`; decide Phase 4/5 |
| S3 upload for binaries | ✅ | [create-artifact.ts:151-155](src/lib/tools/builtin/create-artifact.ts#L151-L155) (`uploadFile` + `S3Paths`) | `@aws-sdk/client-s3` | **HIGH** | Takes Buffer + mimeType, extensible to `.docx`/`.pdf` |

---

## N. Open Questions for Roadmap Planning

1. **Prompt re-adoption timing.** The orphan [`document.ts`](src/lib/prompts/artifacts/document.ts) exists but is not imported. Does the roadmap re-wire it in Phase 2 (as part of the DocumentRenderer feature) or earlier as a throwaway prep step? Implication: if re-wired early, the LLM can start producing `text/document` output against a stub renderer (status quo); if re-wired in Phase 2, the renderer and prompt go live together.

2. **Frontmatter UI in Phase 2.** What does the cover page look like? A4 paper surface with title-centered-top + author/date footer? A sidebar metadata panel? Determines whether Phase 2 needs a new `DocumentRenderer` component or can parameterize `StreamdownContent`. Reference: slides use an iframe + `srcdoc`; following that pattern gives print-media CSS control for free.

3. **Chart schema for text/document.** Slides use a bespoke `ChartData` JSON shape ([types.ts](src/lib/slides/types.ts)). Should `text/document` support ` ```chart ` fenced blocks with the same JSON, or only Mermaid-based charts (`pie`, `xychart`, `sankey`, `quadrant`, `timeline`) via ` ```mermaid `? Affects prompt rules, validator, renderer. Recommendation: start Mermaid-only to avoid chart-JSON parity work; revisit if needed.

4. **Unsplash pattern extension.** [resolver.ts:10](src/lib/unsplash/resolver.ts#L10) matches `src="unsplash:..."` (HTML only). For `text/document` markdown, images are `![alt](unsplash:keyword)`. Option A: add a new regex and a `resolveMarkdownImages()` function. Option B: pre-process markdown to HTML-like `<img src>` before resolution. Recommendation: A (cleaner separation).

5. **DOCX library choice (Phase 4).** Three realistic paths:
   - **`docx`** (pure JS, programmatic): full control, handles inline math OMML natively, but need to translate markdown → docx objects manually.
   - **`html-to-docx`**: render markdown → HTML → DOCX; less control over math/charts.
   - **Pandoc via CLI**: most faithful output but adds a system dependency (binary in Docker image).
   Deployment looks self-hosted (see K1), so pandoc is viable but heavy. Recommendation: `docx` for programmatic control.

6. **PDF library choice (Phase 5).** Four paths:
   - **Puppeteer / Playwright + headless Chromium**: render the same HTML the browser shows, pixel-identical. Works on Docker; needs `@sparticuz/chromium` on Vercel.
   - **`@react-pdf/renderer`**: react-component-tree → PDF. No Chromium.
   - **`pdfkit` / `pdfmake`**: programmatic drawing. Least fidelity to preview.
   - **Server-side reuse of Canvas rasterizer + wrap in PDF shell**: minimal-dep, but needs a light PDF emitter (e.g. `pdf-lib`).
   Recommendation: decide based on whether we want preview-identical output (→ headless browser) or no-new-binary (→ `@react-pdf/renderer`).

7. **KaTeX at export.** Currently `wrapLatexForDownload()` handles the standalone `text/latex` artifact by emitting `.tex`. For `text/document` DOCX/PDF, inline `$x$` must render as an image (raster) or as OMML (Office Math). DOCX has first-class OMML support via the `docx` library. PDF via headless browser gets KaTeX styling for free. Recommendation: align library choice with §5/§6 — `docx` library emits OMML; headless PDF gets rendered KaTeX.

8. **Split-button download in Phase 6.** The current `handleDownload` has one button that dispatches by `artifact.type`. For `text/document`, should the button become a dropdown with `.md`, `.docx`, `.pdf` options? Or remain single-button defaulting to the richest format available? Affects UI copy and analytics.

9. **Server-side vs. client-side export.** Slides currently do PPTX client-side (no server trip). DOCX/PDF could follow the same pattern if we pick no-new-binary libraries — but that bloats the client bundle. Large artifacts (500 KB markdown + images) may be slow client-side. Recommendation: server endpoint for DOCX/PDF (new API route), return signed S3 URL, client downloads. Reuses existing `uploadFile` helper (K4).

10. **Phase 7 consolidation vs. per-phase drift.** Each phase (2, 3, 4, 5, 6) will touch the type registry. Should Phase 7 (registry consolidation per [phase-7-brief.md](phase-7-brief.md)) move *earlier* to prevent accumulating manual list-sync debt across Phases 2–6, or stay at its scheduled slot? Moving earlier means one consolidation done before feature work; leaving it puts pressure on every intermediate phase to maintain 7–8 parallel lists manually.

11. **Testing in Phase 8.** Currently there are unit tests for `validateArtifactContent` per type but no integration tests for the artifact pipeline end-to-end (create → S3 → Prisma → download). Phase 8 should add: `validateDocument` unit test, frontmatter parse test, DOCX/PDF export smoke test (byte-length sanity + valid container header check).

---

## Appendix: Current-State Observations to Flag for Planning

1. **Orphan prompt file.** [`src/lib/prompts/artifacts/document.ts`](src/lib/prompts/artifacts/document.ts) exists on disk (104 lines, full `documentArtifact` config) but is not imported by [`index.ts`](src/lib/prompts/artifacts/index.ts). Restoring the import is a one-line change.

2. **Type registry at 11-type baseline.** `types.ts`, `constants.ts`, `artifact-renderer.tsx`, `chat-input-toolbar.tsx`, `create-artifact.ts`, `_validate-artifact.ts`, and `artifact-panel.tsx` all reflect the 11-type baseline with no `text/document` surface.

3. **No `text/document` tests exist** in [`tests/unit/validate-artifact.test.ts`](tests/unit/validate-artifact.test.ts). Added coverage should land alongside whichever phase re-introduces the validator.

4. **Artifact panel's second `TYPE_LABELS`.** [artifact-panel.tsx:54-66](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L54-L66) defines a **local** `TYPE_LABELS: Record<string, string>` for the panel header (`"text/html": "HTML"`, `"text/markdown": "Markdown"`, etc.). This is a third source of truth for labels (alongside `constants.ts` `TYPE_LABELS` and the prompt files' `label` field). Flag for Phase 7 consolidation scope.

5. **Deployment ambiguity.** Repo has `Dockerfile` + `docker-compose.yml` at root, no `vercel.json`. Native binaries in `serverExternalPackages` (canvas, sharp, pdf-img-convert, dockerode, ssh2) strongly suggest self-hosted Node/Docker. Phases 4/5 library choice should be made assuming self-host unless user confirms Vercel target.
