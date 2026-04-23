# Artifact Feature Deep Scan — RantAI-Agents Chat System

**Last Updated**: April 2026
**Technology Stack**: Next.js 15+, AI SDK v6, React 18, Prisma 5, TypeScript

## TL;DR

Artifact adalah sistem yang memungkinkan LLM membuat dan mengedit konten interaktif (React, HTML, SVG, Mermaid, Code, Slides, LaTeX, Python, 3D, Spreadsheets, Markdown) dalam panel samping yang dapat diubah ukurannya. Fitur ini mencakup:

- **11 tipe artifact** didukung dengan renderer dinamis yang di-load secara lazy
- **Alur end-to-end**: AI memanggil `create_artifact` atau `update_artifact` → content di-render di panel → user dapat edit/save/download
- **Versioning**: Hingga 20 versi dengan FIFO eviction, archived di S3, metadata inline fallback
- **Integrasi RAG**: Artifact di-index untuk pencarian semantik (dengan status `ragIndexed` badge)
- **Validasi server**: HTML/React/SVG/Mermaid/Python/Code struktural pre-persist
- **Storage**: Prisma `Document` model dengan metadata JSON, S3 untuk konten besar

---

## 1. Arsitektur Tingkat Tinggi

### 1.1 Apa Itu Artifact?

Artifact adalah rich content block yang di-generate oleh AI di dalam chat conversation. Serupa dengan Artifacts di Claude.ai atau Canvas di ChatGPT, tetapi fully integrated dengan system messaging dan version history. User dapat:

- Melihat artifact dalam panel samping yang resizable
- Beralih antara Preview (rendering) dan Code (edit/view source)
- Mengedit content dan save perubahan (dengan validation)
- Lihat version history dan restore versi lama
- Download artifact dalam format yang sesuai
- Search artifact content melalui RAG (Retrieval-Augmented Generation)

### 1.2 Alur End-to-End

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                         │
│                                                                 │
│  1. User: "Build me a React dashboard"                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│              CHAT WORKSPACE (chat-workspace.tsx)                │
│                                                                 │
│  • useChat() dari AI SDK — stream responses                    │
│  • useArtifacts() — manage in-memory artifacts                 │
│  • Messages area + artifact panel (ResizablePanelGroup)       │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│           AI SDK Tool Execution (AI Server)                     │
│                                                                 │
│  2. LLM decides to call create_artifact({                      │
│     title: "Dashboard",                                        │
│     type: "application/react",                                 │
│     content: "function App() { ... }"                          │
│  })                                                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│      createArtifactTool (lib/tools/builtin/create-artifact.ts) │
│                                                                 │
│  3. Validate content (HTML/React structure)                    │
│  4. Resolve images (unsplash: → real URLs)                    │
│  5. Upload to S3 + create Document record in Prisma           │
│  6. Background: Index into RAG (vector store)                 │
│  7. Return { id, title, type, content, persisted: true }      │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│             ArtifactIndicator (artifact-indicator.tsx)          │
│                                                                 │
│  8. Render clickable indicator in message                      │
│     [React Component] Dashboard ▶                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
     User clicks indicator
                 │
┌────────────────▼────────────────────────────────────────────────┐
│         useArtifacts() state update                             │
│                                                                 │
│  9. setActiveArtifactId(artifactId)                            │
│  10. sessionStorage persist (per-session "open artifact")      │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│   ArtifactPanel opens (artifact-panel.tsx)                     │
│                                                                 │
│   ┌─ Header ──────────────────────────────────────┐           │
│   │ React Component  Dashboard   1/1  v  Copy Download │ X     │
│   ├──────────────────────────────────────────────┤           │
│   │ [Preview] [Code] [← →] (tabs + version nav) │           │
│   ├──────────────────────────────────────────────┤           │
│   │ ArtifactRenderer {                           │           │
│   │   switch(artifact.type) → ReactRenderer      │           │
│   │   → iframe with transpiled component         │           │
│   │ }                                             │           │
│   └──────────────────────────────────────────────┘           │
└────────────────┬────────────────────────────────────────────────┘
                 │
    User edits code tab
                 │
┌────────────────▼────────────────────────────────────────────────┐
│  PUT /api/dashboard/chat/sessions/{id}/artifacts/{artifactId}  │
│                                                                 │
│  11. updateDashboardChatSessionArtifact()                      │
│      • Validate content (server-side)                          │
│      • Archive old version → S3 v1 key                        │
│      • Update Document.content + metadata.versions[]           │
│      • Upload new content → S3 main key                       │
│      • Re-index RAG (background)                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ├─ Success: UI updates artifact state locally
                 │
                 └─ Validation error: display inline + API 422
```

### 1.3 Component Tree & Layout

```
<ChatWorkspace>
  ├─ <ResizablePanelGroup direction="horizontal">
  │  ├─ <ResizablePanel> (Messages)
  │  │  ├─ <Virtuoso> (infinite scroll messages)
  │  │  │  └─ Message
  │  │  │     ├─ <ArtifactIndicator> ← artifact created/updated
  │  │  │     ├─ <ToolCallIndicator>
  │  │  │     └─ <MarkdownContent> text response
  │  │  │
  │  │  └─ <ChatInputToolbar> (canvas mode selector)
  │  │
  │  ├─ <ResizableHandle> (draggable divider)
  │  │
  │  └─ <ResizablePanel> (IF activeArtifact)
  │     └─ <ArtifactPanel artifact={activeArtifact}>
  │        ├─ Header (title, type badge, version nav)
  │        ├─ Tabs (Preview / Code)
  │        └─ Content
  │           ├─ Preview: <ArtifactRenderer>
  │           │  └─ type-specific renderer (lazy-loaded)
  │           │     ├─ <HtmlRenderer>
  │           │     ├─ <ReactRenderer>
  │           │     ├─ <SvgRenderer>
  │           │     ├─ <MermaidRenderer>
  │           │     ├─ <SheetRenderer>
  │           │     ├─ <LatexRenderer>
  │           │     ├─ <SlidesRenderer>
  │           │     ├─ <PythonRenderer>
  │           │     ├─ <R3FRenderer>
  │           │     └─ <StreamdownContent> (markdown/code)
  │           │
  │           └─ Code: textarea (edit) + StreamdownContent (view)
  │
  └─ <form> (Input area)
     ├─ <Textarea>
     ├─ <ChatInputToolbar> (attach files, canvas mode, tools)
     └─ Buttons (send, speech)
```

---

## 2. File-File Yang Terlibat

### 2.1 Core Components (UI)

#### [`artifact-panel.tsx`](src/features/conversations/components/chat/artifacts/artifact-panel.tsx) (Line 1-828)
**Peran**: Komponen utama panel samping artifact yang menampilkan preview dan editor code.

**Exports/Functions Utama**:
- `ArtifactPanel(props)` — React component dengan 2 tab (Preview/Code)
  - `tab: "preview" | "code"` — state tab aktif
  - `isEditing` — toggle edit mode
  - `editContent` — textarea content saat edit
  - `isSaving` — prevent double-save
  - Version navigation: `viewingVersionIdx`
  - Fullscreen mode (portal rendering)

**Key Features**:
- Copy to clipboard button
- Download artifact (generates `.pptx` for slides, wraps LaTeX for `.tex`)
- Version history browser (prev/next buttons, restore button)
- Edit mode with textarea + Save/Discard/Cancel buttons
- Server-side save via PUT endpoint (lines 216-275)
- Delete artifact via dropdown menu
- Fullscreen mode dengan backdrop
- RAG indexing status badge (lines 426-440)

**Props**:
```typescript
interface ArtifactPanelProps {
  artifact: Artifact
  onClose: () => void
  onUpdateArtifact?: (artifact: ArtifactInput) => void
  onDeleteArtifact?: (artifactId: string) => void
  onFixWithAI?: (artifactId: string, error: string) => void
  sessionId?: string // for REST API calls
}
```

#### [`artifact-indicator.tsx`](src/features/conversations/components/chat/artifacts/artifact-indicator.tsx)
**Peran**: Tombol kecil yang ditampilkan dalam message ketika artifact dibuat/diupdate.

**Exports/Functions**:
- `ArtifactIndicator(props)` — animated button dengan icon + title
  - Motion animation (opacity + translate)
  - Color-coded by artifact type
  - Chevron indicator

**Props**:
```typescript
interface ArtifactIndicatorProps {
  title: string
  type: ArtifactType
  content?: string
  onClick: () => void
}
```

#### [`artifact-renderer.tsx`](src/features/conversations/components/chat/artifacts/artifact-renderer.tsx)
**Peran**: Router yang memilih renderer yang tepat berdasarkan artifact type.

**Exports/Functions**:
- `ArtifactRenderer({ artifact, onFixWithAI })` — switch statement
  - Lazy-loads renderer sesuai type
  - Fallback `<RendererLoading>` component
  - Error handling untuk `onFixWithAI` callback (React, Mermaid, Python, 3D)

**Supported Types** (11 total):
- `text/html` → `HtmlRenderer`
- `application/react` → `ReactRenderer`
- `image/svg+xml` → `SvgRenderer`
- `application/mermaid` → `MermaidRenderer`
- `application/sheet` → `SheetRenderer`
- `text/latex` → `LatexRenderer`
- `application/slides` → `SlidesRenderer`
- `application/python` → `PythonRenderer`
- `application/3d` → `R3FRenderer`
- `application/code` → `StreamdownContent` (code highlighting)
- `text/markdown` → `StreamdownContent` (markdown parsing)

#### [`renderers/`](src/features/conversations/components/chat/artifacts/renderers/) Directory

**Key Renderers**:

- [`react-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx) (541 lines)
  - Transpile JSX via Babel-standalone
  - Strip ES6 imports, convert to window globals
  - Render dalam iframe dengan React 18 hooks pre-injected
  - Sandbox: `allow-scripts` only

- [`html-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/html-renderer.tsx) (135 lines)
  - Inject Tailwind CDN + Inter font
  - Navigation blocker script (prevent `location.href` changes)
  - Render dalam iframe dengan `srcdoc`

- [`python-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx) (307 lines)
  - Pyodide WASM runtime
  - Capture stdout/stderr
  - Run button

- [`r3f-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/r3f-renderer.tsx) (621 lines)
  - Three.js + React Three Fiber
  - Canvas 3D scene

- [`mermaid-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx) (171 lines)
  - Mermaid.js diagram rendering
  - Auto-layout

- [`sheet-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx) (264 lines)
  - CSV parser
  - Grid UI (handsontable style)

- [`slides-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/slides-renderer.tsx) (147 lines)
  - JSON slide deck parser (tema + layout + content)
  - Navigation + speaker notes

- [`latex-renderer.tsx`](src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx) (522 lines)
  - KaTeX for math rendering

Renderers lainnya: `svg-renderer.tsx`, `_iframe-nav-blocker.ts`, `mermaid-config.ts`

### 2.2 State Management & Hooks

#### [`use-artifacts.ts`](src/features/conversations/components/chat/artifacts/use-artifacts.ts)
**Peran**: Custom hook untuk manage in-memory artifact state + session persistence.

**Exports/Functions**:
```typescript
export function useArtifacts(sessionKey?: string | null) {
  // In-memory state
  const [artifacts, setArtifacts] = useState<Map<string, Artifact>>(new Map())
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

  // Methods
  const addOrUpdateArtifact = (artifact: ArtifactInput) => {...}
  const removeArtifact = (id: string) => {...}
  const closeArtifact = () => {...}
  const openArtifact = (id: string) => {...}
  const loadFromPersisted = (persisted: PersistedArtifact[]) => {...}

  return {
    artifacts,
    activeArtifact,
    activeArtifactId,
    addOrUpdateArtifact,
    removeArtifact,
    loadFromPersisted,
    openArtifact,
    closeArtifact,
  }
}
```

**Key Features**:
- `sessionStorage` persistence: `rantai.artifact.active.{sessionId}`
- Version tracking: `previousVersions` FIFO array
- Deduplication: `addOrUpdateArtifact` merges dengan existing
- Load from server: `loadFromPersisted()` hydrate dari API response

### 2.3 Type Definitions & Constants

#### [`types.ts`](src/features/conversations/components/chat/artifacts/types.ts)
**Exports**:
```typescript
export const VALID_ARTIFACT_TYPES = new Set([
  "text/html", "text/markdown", "image/svg+xml", "application/react",
  "application/mermaid", "application/code", "application/sheet",
  "text/latex", "application/slides", "application/python", "application/3d"
])

export type ArtifactType = "text/html" | "text/markdown" | ... // union

export interface Artifact {
  id: string                          // UUID
  title: string
  type: ArtifactType
  content: string                     // full source
  language?: string                   // for application/code
  version: number                     // incrementing
  previousVersions: ArtifactVersion[] // { content, title, timestamp }[]
  evictedVersionCount?: number        // FIFO cap=20, track overflow
  ragIndexed?: boolean                // searchable badge status
}

export interface PersistedArtifact {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content, title, timestamp }>
    evictedVersionCount?: number
    ragIndexed?: boolean
  } | null
}
```

#### [`constants.ts`](src/features/conversations/components/chat/artifacts/constants.ts)
**Exports**:
```typescript
export const TYPE_ICONS: Record<ArtifactType, IconComponent> = {
  "text/html": Globe, "application/react": FileCode, ...
}

export const TYPE_LABELS: Record<ArtifactType, string> = {
  "text/html": "HTML Page", "application/react": "React Component", ...
}

export const TYPE_COLORS: Record<ArtifactType, string> = {
  "text/html": "text-orange-500 bg-orange-500/10 border-orange-500/20", ...
}
```

### 2.4 AI SDK Tools

#### [`create-artifact.ts`](src/lib/tools/builtin/create-artifact.ts)
**Peran**: Tool yang dipanggil oleh LLM untuk membuat artifact baru.

**Tool Definition**:
```typescript
export const createArtifactTool: ToolDefinition = {
  name: "create_artifact",
  displayName: "Create Artifact",
  description: "Create a rich, polished artifact...",
  category: "builtin",
  parameters: z.object({
    title: z.string().describe("A concise, descriptive title (3-8 words)"),
    type: z.enum(["text/html", "text/markdown", ...]).describe("The artifact format"),
    content: z.string().describe("The complete, self-contained content"),
    language: z.string().optional().describe("For application/code type"),
  }),
  execute: async (params, context) => {...}
}
```

**Execution Flow** (lines 50-199):
1. Validate content size (max 512 KB)
2. Enforce `canvasMode` type lock (lines 76-94)
3. Validate `application/code` requires `language` (lines 98-110)
4. Structural validation via `validateArtifactContent()` (lines 115-128)
5. Resolve `unsplash:` URLs → real image URLs (lines 131-136)
6. Upload to S3 + create `Document` record in Prisma (lines 138-187)
7. Background RAG indexing (line 180-182, fire-and-forget)
8. Return result: `{ id, title, type, content, persisted, [warnings] }`

**Context Parameters** (from AI SDK):
- `context.organizationId` — org scope
- `context.sessionId` — chat session
- `context.userId` — creator
- `context.canvasMode` — type enforcement (locked mode)

#### [`update-artifact.ts`](src/lib/tools/builtin/update-artifact.ts)
**Peran**: Update artifact content dengan version history tracking.

**Execution Flow** (lines 46-197):
1. Validate content size
2. Load existing Document from Prisma (line 68)
3. Structural validation (lines 72-89)
4. Archive old version to S3 with versioned key: `{s3Key}.v{num}` (lines 108-120)
5. Inline fallback if S3 fails & content small (≤32 KB) (lines 122-131)
6. FIFO eviction: cap 20 versions, track `evictedVersionCount` (lines 144-148)
7. Upload new content to main S3 key (lines 151-156)
8. Update Document record + metadata (lines 161-176)
9. Re-index RAG (line 179)

**Key Constraint**:
- `MAX_VERSION_HISTORY = 20` — hard cap to prevent unbounded growth
- `MAX_INLINE_FALLBACK_BYTES = 32 KB` — fallback only for small artifacts
- `MAX_ARTIFACT_CONTENT_BYTES = 512 KB` — global limit

#### [`_validate-artifact.ts`](src/lib/tools/builtin/_validate-artifact.ts)
**Peran**: Server-side validation sebelum persist.

**Validations** (by type):
- `text/html` — HTML structure (parse5), viewport meta, no <script> injection
- `application/react` — Babel parse, `export default`, allowed imports
- `image/svg+xml` — SVG well-formedness
- `application/mermaid` — Mermaid syntax
- `application/python` — Basic syntax check
- `application/code` — Language-specific checks
- `text/markdown` — Markdown structure
- `text/latex` — LaTeX structure
- `application/sheet` — CSV well-formedness
- `application/slides` — JSON schema (theme, slides, layout)
- `application/3d` — React code validation

Returns: `{ ok: boolean, errors: string[], warnings: string[] }`

### 2.5 API Routes & Services

#### [`route.ts` — Artifact API Endpoint](src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts)
**Routes**:
- `PUT /api/dashboard/chat/sessions/{sessionId}/artifacts/{artifactId}` — Update artifact
- `DELETE /api/dashboard/chat/sessions/{sessionId}/artifacts/{artifactId}` — Delete artifact

**PUT Handler** (lines 13-49):
1. Auth check
2. Validate params (sessionId, artifactId)
3. Validate body (content + optional title)
4. Call `updateDashboardChatSessionArtifact()`
5. Return updated artifact or HTTP error (400/404/422)

**DELETE Handler** (lines 51-81):
1. Auth check
2. Validate params
3. Call `deleteDashboardChatSessionArtifact()`
4. Return success or error

#### [`service.ts` — Business Logic](src/features/conversations/sessions/service.ts)

**Functions**:
- `updateDashboardChatSessionArtifact(params)` (lines 430-547)
  - Session ownership check
  - Structural validation (same as LLM tool)
  - Version archival to S3
  - Inline fallback (small artifacts only)
  - FIFO eviction tracking
  - Update Prisma Document
  - Background re-index

- `deleteDashboardChatSessionArtifact(params)` (lines 552-577)
  - Permission check
  - S3 cleanup (non-fatal)
  - Delete Prisma Document

#### [`repository.ts` — Data Access](src/features/conversations/sessions/repository.ts)

**Functions**:
- `findDashboardSessionByIdAndUser(id, userId)` (lines 30-50)
  - Load session + messages + artifacts (where `artifactType != null`)

- `updateDashboardArtifactById(artifactId, data)` (lines 152-168)
  - Update Document: content, title, fileSize, metadata

- `deleteDashboardArtifactById(artifactId)` (lines 170-174)
  - Delete Document

- `findArtifactsBySessionId(sessionId)` (lines 176-181)
  - Load artifacts for S3 cleanup (id + s3Key only)

### 2.6 Prompt Instructions

#### [`src/lib/prompts/artifacts/`](src/lib/prompts/artifacts/) Directory
**Files** (each defines LLM instructions for that artifact type):
- `index.ts` — aggregates all artifact types
- `react.ts` — React component rules + design system
- `html.ts` — HTML page rules
- `svg.ts` — SVG graphics rules
- `mermaid.ts` — Mermaid diagram rules
- `code.ts` — Generic code files
- `python.ts` — Python scripts
- `sheet.ts` — Spreadsheets (CSV)
- `markdown.ts` — Documents
- `latex.ts` — Math/LaTeX
- `slides.ts` — Presentation decks
- `r3f.ts` — 3D scenes (React Three Fiber)
- `context.ts` — Canvas mode context injection

**Structure** (per artifact type):
```typescript
export const reactArtifact = {
  type: "application/react",
  label: "React Component",
  summary: "...",
  rules: `**Detailed LLM instructions**
    - Required shape, imports, design patterns
    - Anti-patterns to avoid
    - Code quality standards
  `
}
```

### 2.7 RAG Integration

#### [`artifact-indexer.ts`](src/lib/rag/artifact-indexer.ts)
**Peran**: Async indexing artifact content ke vector store.

**Exports**:
```typescript
export async function indexArtifactContent(
  documentId: string,
  title: string,
  content: string,
  options?: { isUpdate?: boolean }
)
```

**Flow**:
1. Delete old chunks (if update)
2. Chunk document (1000-char chunks, 200-char overlap)
3. Generate embeddings via API
4. Store chunks in SurrealDB vector store
5. Mark `metadata.ragIndexed: true` on Document
6. On failure: mark `ragIndexed: false` (UI shows "Not searchable" badge)

**Background Execution**:
- Fire-and-forget `.catch()` in `create_artifact.ts` (line 180-182)
- Fire-and-forget `.catch()` in `update_artifact.ts` (line 179)
- No blocking of user experience

### 2.8 Database Schema (Prisma)

#### `Document` Model Snippet
```prisma
model Document {
  id          String          @id @default(cuid())
  title       String
  content     String          // Full artifact content
  categories  String[]        // ["ARTIFACT"]
  metadata    Json?           // {
                              //   artifactLanguage?: string
                              //   versions?: Array<{
                              //     title, timestamp, contentLength,
                              //     s3Key?, content?, archiveFailed?
                              //   }>
                              //   evictedVersionCount?: number
                              //   ragIndexed?: boolean
                              // }

  // S3 storage
  s3Key       String?         // s3://{org-id}/{session-id}/{artifact-id}.{ext}
  fileType    String?         // "artifact"
  fileSize    Int?            // bytes
  mimeType    String?         // "text/plain" or "image/svg+xml"

  // Session association
  sessionId   String?
  organizationId String?
  createdBy   String?         // userId

  // Timestamps
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}
```

**Why `metadata` JSON?**
- Flexible schema per artifact type
- Version history stored inline (small) or referenced via S3 key
- RAG status tracking
- No schema migration on feature add

### 2.9 Integration dengan Chat Workspace

#### [`chat-workspace.tsx`](src/features/conversations/components/chat/chat-workspace.tsx)

**Key Integration Points**:

1. **Hook Initialization** (lines 1100-1109):
```typescript
const {
  artifacts,
  activeArtifact,
  activeArtifactId,
  addOrUpdateArtifact,
  removeArtifact,
  loadFromPersisted,
  openArtifact,
  closeArtifact,
} = useArtifacts(apiSessionId || session?.id || null)
```

2. **Load Persisted Artifacts** (lines 1181-1208):
```typescript
const loadFreshSessionArtifacts = useCallback(
  async (hasFallbackArtifacts: boolean, signal?: AbortSignal) => {
    const response = await fetch(`/api/dashboard/chat/sessions/${apiSessionId}`)
    const data = response.ok ? await response.json() : null
    if (data?.artifacts?.length > 0) {
      loadFromPersisted(data.artifacts)
    }
  },
  [apiSessionId, loadFromPersisted]
)
```

3. **Render ArtifactIndicator dalam Message** (lines 584-603):
- Detect `create_artifact` / `update_artifact` tool call
- Extract output: `{ id, title, type, content }`
- Call `addOrUpdateArtifact()` to state
- Render `<ArtifactIndicator onClick={() => openArtifact(id)} />`

4. **Render ArtifactPanel dalam ResizablePanelGroup** (lines 3295-3302):
```jsx
{activeArtifact && (
  <motion.div>
    <ArtifactPanel
      artifact={activeArtifact}
      onClose={closeArtifact}
      onUpdateArtifact={addOrUpdateArtifact}
      onDeleteArtifact={removeArtifact}
      onFixWithAI={handleFixWithAI}
      sessionId={apiSessionId}
    />
  </motion.div>
)}
```

5. **Custom Event Dispatch** (lines 1131-1141):
- Notify layout when artifact panel opens/closes
- Event: `artifact-panel-changed` dengan detail `{ open: boolean }`
- Allows main layout to auto-adjust sidebar

---

## 3. Tipe Artifact Yang Didukung

| Type | Label | Renderer | Interactif | Editable | Downloadable |
|------|-------|----------|-----------|----------|-------------|
| `text/html` | HTML Page | HtmlRenderer (iframe) | ✓ Forms, scripts | ✓ Source edit | ✓ .html |
| `application/react` | React Component | ReactRenderer (Babel transpile) | ✓ Full React | ✓ Source edit | ✓ .tsx |
| `image/svg+xml` | SVG Graphic | SvgRenderer (DOM render) | ✓ Inline SVG | ✓ Source edit | ✓ .svg |
| `application/mermaid` | Diagram | MermaidRenderer (mermaid.js) | ✗ Static | ✓ Source edit | ✓ .mmd |
| `text/markdown` | Markdown | StreamdownContent (custom MD parser) | ✗ Static | ✓ Source edit | ✓ .md |
| `text/document` | Document | DocumentRenderer (docx-preview WYSIWYG) | ✗ Static | ✓ Source edit | ✓ .md + .docx (split-button) |
| `application/code` | Code | StreamdownContent (syntax highlight) | ✗ Static | ✓ Source edit | ✓ .{lang} |
| `application/sheet` | Spreadsheet | SheetRenderer (CSV grid) | ✓ Editable grid | ✓ Source edit | ✓ .csv |
| `text/latex` | LaTeX / Math | LatexRenderer (KaTeX) | ✗ Static | ✓ Source edit | ✓ .tex (wrapped) |
| `application/slides` | Slides | SlidesRenderer (JSON deck) | ✓ Navigation | ✓ Source edit | ✓ .pptx (generated) |
| `application/python` | Python Script | PythonRenderer (Pyodide WASM) | ✓ Runtime | ✓ Source edit | ✓ .py |
| `application/3d` | 3D Scene | R3FRenderer (Three.js) | ✓ Interactive | ✓ Source edit | ✓ .tsx |

### Handler Strategy

**Client-side**: Renderer lazy-loads on type match (code-split, perf optimized)

**Server-side**: Validation in `_validate-artifact.ts` catches structural errors pre-persist

**Download**: File extension mapping derived from `ARTIFACT_REGISTRY` (Phase 7) — see `getArtifactRegistryEntry(type).extension`. Special handling:
- Slides: generate PPTX blob via `generatePptx()`
- Document: split-button download — `.md` (synchronous) or `.docx` (dynamic-imports `generateDocx`)
- LaTeX: wrap KaTeX fragment in compilable document
- Others: raw content download

### `text/document` — Pipeline (Phase 9 rebuild in progress)

**Status (2026-04-23):** the Phase 1-8 markdown-walker pipeline (DocumentRenderer → generateDocx → docx-preview) has been reverted in preparation for a rebuild around Anthropic Claude's `docx` skill (LLM-authored JS code executed in a sandbox).

What survives the revert:
- The `text/document` registry entry ([registry.ts](src/features/conversations/components/chat/artifacts/registry.ts)) — Phase 7 work, all 12 artifact types remain registered
- The `DocumentRenderer` switch case in [artifact-renderer.tsx](src/features/conversations/components/chat/artifacts/artifact-renderer.tsx) — routes to a placeholder component until Phase 9 ships
- The split-button download structure in [artifact-panel.tsx](src/features/conversations/components/chat/artifacts/artifact-panel.tsx) — Phase 6 UI; "Markdown (.md)" still works, "Word (.docx)" surfaces a "rebuild in progress" error
- The `validateDocument()` function in [_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) — reduced to permissive no-op until Phase 9 reimplements

Phase 9 architecture (planned):
- LLM authors JavaScript code that uses the `docx` package directly (vs walker translating markdown)
- Code executes in Piston Node sandbox
- Output DOCX blob → `docx-preview` renders for in-browser preview (same library reused)
- Native OMML math equations via the `Math` API
- Full creative control over typography, layout, page setup

Context: [phase-9-revert.md](phase-9-revert.md). Rebuild brief: TBD.

---

## 4. Alur Data & State Management

### 4.1 Creation Flow

```
LLM (AI SDK)
  ↓
create_artifact tool call
  ↓
createArtifactTool.execute()
  ├─ Validation (size, type, structure)
  ├─ S3 upload
  ├─ Prisma Document.create()
  ├─ Background: indexArtifactContent()
  └─ Return { id, title, type, content, ... }
  ↓
AI SDK message streaming
  ↓
chat-workspace detects tool output
  ↓
addOrUpdateArtifact() — in-memory state
  ↓
<ArtifactIndicator> renders in message
  ↓
User clicks indicator
  ↓
useArtifacts: setActiveArtifactId()
  ├─ sessionStorage save
  └─ Fire custom event (artifact-panel-changed)
  ↓
<ArtifactPanel> mounts + renders <ArtifactRenderer>
```

### 4.2 Update Flow

**User edits in Code tab**:
```
textarea onChange
  ↓
setEditContent() — local state
  ↓
setIsDirty(true)
  ↓
User clicks Save
  ↓
handleSave()
  ├─ PUT /api/dashboard/chat/sessions/{id}/artifacts/{artifactId}
  │  └─ Server-side validation
  │  └─ Version archival
  │  └─ S3 upload
  │  └─ Database update
  │  └─ RAG re-index (background)
  │
  └─ onUpdateArtifact() — in-memory sync
  └─ setIsDirty(false), exit edit mode
```

**Error handling**:
- Server validation failure (422) → display inline error in panel
- Network error → catch block, toast/error state

### 4.3 Session Persistence

**Load on mount**:
```
useEffect(() => {
  loadFreshSessionArtifacts()
    ↓
  GET /api/dashboard/chat/sessions/{id}
    ↓
  response.artifacts[] (PersistedArtifact[])
    ↓
  loadFromPersisted()
    ├─ Hydrate artifacts Map
    ├─ Restore activeArtifactId from sessionStorage
    └─ Render panel if active
})
```

**Versioning**:
- In-memory: `artifact.previousVersions: ArtifactVersion[]` (FIFO)
- Database: `metadata.versions[]` with S3 keys + inline fallback
- Version max: 20 (FIFO eviction with `evictedVersionCount` tracking)

### 4.4 State Transitions

```
┌─ Session Load ─────────────────────────┐
│ artifacts = new Map()                  │
│ activeArtifactId = null (from session) │
└─────────────────────────────────────────┘
           │
           ├─ AI creates artifact
           │  ├─ addOrUpdateArtifact()
           │  └─ activeArtifactId = id
           │     (auto-open)
           │
           ├─ User opens artifact
           │  └─ openArtifact(id)
           │
           ├─ User edits + saves
           │  └─ addOrUpdateArtifact()
           │     (version increment)
           │
           ├─ User browses history
           │  └─ viewingVersionIdx = N
           │
           ├─ User restores version
           │  └─ Server PUT (creates new version)
           │  └─ addOrUpdateArtifact()
           │
           └─ User closes panel
              └─ closeArtifact()
                 (activeArtifactId = null)
```

---

## 5. Integrasi dengan Chat

### 5.1 Tampilan Artifact dalam Message

**Dalam chat message**:
1. AI response dibuat
2. Tool call `create_artifact` dieksekusi (live streaming)
3. Tool output (artifact) ditangkap oleh chat-workspace
4. `ArtifactIndicator` inline di message (bukan di sidebar awalnya)
5. User clicks indicator → panel membuka (ResizablePanelGroup resize)

**Visual Hierarchy**:
```
Message                                 Panel
─────────────────────────────────────────────────────
"Here's your dashboard..."              ┌─ Artifact ─┐
                                        │ React Comp │
[React Component] Dashboard ▶            │ version 1/1│
                                        │ Preview    │
- Built with Recharts                  │ Code       │
- Dark mode support                     │            │
                                        │ (iframe)   │
                                        └────────────┘
```

### 5.2 Canvas Mode

**Definition**: User dapat memilih artifact type sebelum prompt.

**Implementation**:
- `<ChatInputToolbar>` shows canvas mode selector (dropdown)
- Selected mode stored in `canvasMode` state
- Passed as AI SDK context: `context.canvasMode`
- Tool validation in `create_artifact.ts` (lines 76-94): enforce atau reject wrong type

**UX**:
- Default: `canvasMode = "auto"` (LLM picks type)
- User selects "HTML" → only HTML artifacts allowed
- LLM tries other type → validation error → auto-retry with correct type

### 5.3 Switching Between Artifacts

**Multiple artifacts in same message**:
```
[React Component] Dashboard ▶
[SVG Graphic] Chart ▶
[HTML Page] Form ▶
```

**User clicks different indicator**:
- `openArtifact(id)` → switch active in panel
- No state loss (artifact preserved in artifacts Map)
- sessionStorage updated (new active id)

### 5.4 Version Navigation

**In panel header**:
```
Version Pill: [◀] 1/5 [▶]    (if 5 versions exist)
                ▲
                │
         1 = current (latest)
         5 = 4 previous versions
```

**Navigation**:
- Click left arrow → view previous version
- Click right arrow → view next version
- "Restore" button appears when viewing historical version
- Version count + evicted count displayed in tooltip

---

## 6. Tool/AI Integration

### 6.1 Tool Registry

**Tool Names**:
- `create_artifact` — create new artifact
- `update_artifact` — update existing artifact

**Where Registered**:
- `src/lib/tools/seed.ts` — tool definitions
- `src/lib/tools/types.ts` — ToolDefinition interface
- Exposed to AI SDK via provider configuration

### 6.2 Tool Definitions (Full Schema)

#### Create Artifact Tool
```typescript
name: "create_artifact"
displayName: "Create Artifact"
description: "Create a rich, polished artifact rendered in a live preview panel..."
category: "builtin"

parameters: {
  title: string (3-8 words, required)
  type: enum (11 types, required)
  content: string (complete, self-contained, required)
  language: string (optional, required if type="application/code")
}

returns: {
  id: string
  title: string
  type: string
  content: string
  language?: string
  persisted: boolean
  error?: string
  validationErrors?: string[]
  warnings?: string[]
}
```

#### Update Artifact Tool
```typescript
name: "update_artifact"
displayName: "Update Artifact"
description: "Update an existing artifact with new content..."
category: "builtin"

parameters: {
  id: string (from create_artifact result, required)
  title: string (optional, keeps existing if omitted)
  content: string (complete replacement, required)
}

returns: {
  id: string
  title: string
  content: string
  updated: boolean
  persisted: boolean
  error?: string
  validationErrors?: string[]
  warnings?: string[]
}
```

### 6.3 LLM Capability Requirements

**Model**: Claude 3.5 Sonnet (tested), Claude 4 Opus (supported)

**Required Capabilities**:
- Tool use (structured tool calls)
- Long context (for large artifact content)
- JSON output (for slides type)

**Prompt Injection** (via system message):
- All artifact type instructions injected from `src/lib/prompts/artifacts/`
- Canvas mode context (if selected)
- Canvas type rules (locked enforcement)

---

## 7. Database Schema

### 7.1 Document Model (Simplified)

```prisma
model Document {
  id           String    @id @default(cuid())
  title        String
  content      String    // Full artifact content (up to 512 KB)

  // Artifact-specific fields
  artifactType String?   // e.g., "application/react"
  categories   String[]  // ["ARTIFACT"]

  // Metadata (JSON)
  metadata     Json?
  // {
  //   artifactLanguage?: string
  //   versions?: [
  //     {
  //       title: string
  //       timestamp: number (ms)
  //       contentLength: number
  //       s3Key?: string (archived version)
  //       content?: string (inline fallback, small only)
  //       archiveFailed?: boolean
  //     },
  //     ...
  //   ]
  //   evictedVersionCount?: number (FIFO overflow count)
  //   ragIndexed?: boolean (searchable status)
  //   validationWarnings?: string[] (non-blocking issues)
  // }

  // S3 Storage Reference
  s3Key        String?   // e.g., "orgs/{orgId}/sessions/{sessionId}/artifacts/{id}.tsx"
  fileType     String?   // "artifact"
  fileSize     Int?      // bytes
  mimeType     String?   // "text/plain" or "image/svg+xml"

  // Session Association
  sessionId    String?
  organizationId String?
  createdBy    String?

  // Timestamps
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

### 7.2 Relasi

**Document → DashboardSession** (implicit via `sessionId`)
- One artifact can belong to one session
- Cascade delete on session delete

**Document → Organization** (via `organizationId`)
- Organization scope (null = global/shared)

**Document → RAG Vector Store** (via `chunkId`)
- Chunks stored in SurrealDB
- Indexed for semantic search

---

## 8. Performance & Optimization

### 8.1 Lazy Loading

**Renderers**: Dynamic imports dengan Suspense fallback
```typescript
const ReactRenderer = dynamic(
  () => import("./renderers/react-renderer"),
  { loading: () => <RendererLoading message="Transpiling React..." /> }
)
```

**Benefits**:
- Bundle size reduction (renderers code-split)
- Faster initial chat load
- Load only when artifact type encountered

### 8.2 Storage Strategy

**In-Memory State**:
- `artifacts: Map<string, Artifact>` — all artifacts in session
- Fast lookup by ID, O(1) access

**Persisted State**:
- Database: `Document` model (SQLite/Postgres)
- S3: Full content + versioned archives
- sessionStorage: Currently open artifact ID

**Hybrid Strategy**:
- S3 for large content (>32 KB versions)
- Inline metadata for small content (version fallback)

### 8.3 Network Optimization

**Streaming**:
- Tool output streamed as part of chat message
- Don't wait for S3/DB persist before rendering

**Background Tasks**:
- RAG indexing: fire-and-forget, non-blocking
- S3 version archival: retry-safe

### 8.4 Version History Cap

**Limit**: 20 versions per artifact
- Prevents unbounded metadata row growth
- `evictedVersionCount` tracks overflow
- UI shows "+N earlier versions evicted"
- Oldest versions deleted (FIFO)

---

## 9. Error Handling & Validation

### 9.1 Validation Levels

**Client-side** (artifact-panel.tsx):
- Content size check (catch before submit)
- Change detection (dirty flag)

**Server-side** (create_artifact.ts, _validate-artifact.ts):
- Content size (512 KB limit)
- Structural validation (HTML, React, SVG, JSON, etc.)
- Canvas mode type enforcement
- Language parameter requirement

**Format** (formatValidationError):
```
"React: Missing 'export default'. Expected: export default function App() {...}"
```

### 9.2 Error Recovery

**LLM Tool Retry Loop**:
1. Tool executes, validation fails
2. Returns error + validationErrors array
3. AI SDK built-in retry detects error
4. LLM gets error context, regenerates call
5. Second attempt succeeds

**User Manual Edit**:
1. Submit content via PUT
2. Server validation fails (422)
3. Error displayed inline in panel
4. User corrects and re-saves
5. No artifact corruption

---

## 10. Security Considerations

### 10.1 Sandboxing

**HTML/React Renderers**: iframe with `sandbox="allow-scripts"`
- Prevents: navigation, form submission, top-level access
- Allows: dynamic script execution within sandbox

**Navigation Blocker** (iframe-nav-blocker.ts):
- Intercepts `window.location` changes
- Prevents unintended navigation
- Preserves interactive scripts

### 10.2 Content Validation

**SVG Sanitization**: Parse and validate structure
- Prevent XXE attacks
- No `<script>` tags

**React Code Validation**: Babel parse + import whitelist
- Only whitelisted libs (React, Recharts, Lucide, Motion)
- No `eval()` or dynamic requires

### 10.3 Permissions

**Session Ownership**:
- API endpoint checks: user owns session
- Cross-tenant isolation via `userId` + `sessionId`

**Organization Scope**:
- Artifact inherits organization context
- No cross-org artifact access

---

## Summary: Key Takeaways

| Aspek | Detail |
|-------|--------|
| **Architecture** | LLM → tool call → render in panel + save to DB + index in RAG |
| **Supported Types** | 11 types (React, HTML, SVG, Mermaid, Code, Slides, LaTeX, Python, 3D, Sheet, Markdown) |
| **State Management** | `useArtifacts()` hook + Prisma Document + S3 + sessionStorage |
| **Versioning** | FIFO 20-version cap, S3 archive, inline fallback |
| **Validation** | Server-side structural (pre-persist) + client-side (pre-submit) |
| **RAG Integration** | Background indexing with `ragIndexed` status badge |
| **API** | `PUT /artifacts/{id}` for update, `DELETE` for removal |
| **Download** | Type-specific handling (PPTX for slides, wrapped LaTeX, raw others) |
| **Performance** | Lazy-loaded renderers, background RAG, fire-and-forget indexing |
| **Security** | iframe sandbox, SVG sanitization, import whitelist, permission checks |
