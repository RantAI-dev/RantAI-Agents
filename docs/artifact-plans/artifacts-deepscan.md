# Artifact System — Deepscan

> **Last regenerated:** 2026-04-25, post-Priority-C, pinned to merge `f0264f8`.
> Replaces all prior versions. Sourced from a 5-agent ground-up rescan that
> read every byte of the relevant code.
>
> **Companion docs:**
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit per module.
> - [`artifacts-capabilities.md`](./artifacts-capabilities.md) — per-type capability spec.
> - [`2026-04-25-artifact-system-audit.md`](./2026-04-25-artifact-system-audit.md) — original audit + Priority A/B/C completion status.
> - [`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md) — 58 net-new findings surfaced by the rescan that this document is grounded in. Treat as backlog (none shipped).

---

## TL;DR

The artifact system has **one source of truth** (the registry) and a
**dispatcher pattern** repeated four times — validator, prompt, renderer,
panel chrome. Adding a new type means filling the same slot in each switch;
TypeScript exhaustiveness checking surfaces every missing branch at compile
time.

It also has **two parallel persistence paths** that share validation but
diverge on side effects:

```
LLM tool path                           HTTP service path (manual edit)
─────────────                           ──────────────────────────────
create_artifact / update_artifact       PUT /api/.../artifacts/[id]
        │                                       │
        ▼                                       ▼
validateArtifactContent  ───────────────  validateArtifactContent
   (5s timeout, post-Unsplash for HTML/slides, ctx.isNew on create)
        │                                       │
        ▼                                       ▼
 prisma.document direct                updateDashboardChatSessionArtifact
 + S3 + RAG indexing                   + S3 + (NO RAG re-index — see N-1)
```

The split matters because **the manual-edit path does not re-index RAG**
(rescan finding **N-1**), so an artifact edited from the panel will return
stale content from `knowledge_search` until the next LLM-driven update.

A single `validateArtifactContent(type, content, ctx?)` is the entry point
every persistence path runs through. It does three jobs:

1. Dispatches to the per-type validator with a **5-second wall-clock
   timeout** (`VALIDATE_TIMEOUT_MS`).
2. Carries an optional `ValidationContext.isNew` flag — only `validateMarkdown`
   and `validateSlides` read it (`validateDocument` doesn't even accept the
   parameter — see rescan finding **N-26**).
3. **Post-resolves Unsplash** for `text/html` and `application/slides`
   before returning. `text/document` resolves earlier inside its own
   validator. No other persistence path needs to touch the resolver
   directly any more.

Persistence is **optimistically locked** on the Prisma `Document.updatedAt`
column for both update paths. Concurrent writers hit `count: 0` from
`updateMany` and surface a 409 (HTTP) or
`{ updated: false, error: "Concurrent update detected…" }` (LLM tool).

Deletion is **mostly complete**:
`deleteDashboardChatSessionArtifact` removes the canonical S3 object,
versioned S3 keys from `metadata.versions[].s3Key`, the SurrealDB RAG
chunks, and the Postgres row. **Session delete still leaks versioned S3
keys** (rescan finding **N-47**) because `findArtifactsBySessionId` only
selects `{ id, s3Key }` — not `metadata`.

Twelve types remain. The **`image-text` slide layout is deprecated** —
existing artifacts validate with a warning, new artifacts hard-error
(`ctx.isNew`). The migration script
`scripts/migrate-artifact-deprecations.ts` rewrites `image-text → content`
in stored decks and audits markdown for `<script>` and oversized payloads.

Mermaid rendering exists in **three paths** (server SVG → DOCX, client
PNG → PPTX, browser SVG → live preview) sharing a common theme module —
but the client PPTX path always uses the light theme and the standalone
mermaid renderer + the document preview's mermaid block both call
`mermaid.initialize` on the same global singleton, so concurrent renders
can race on theme state (rescan **N-53, N-54**).

---

## 1. The twelve artifact types

**Source of truth:** `src/features/conversations/components/chat/artifacts/registry.ts`.
Everything else (`ARTIFACT_TYPES`, `VALID_ARTIFACT_TYPES`, `TYPE_ICONS`,
`TYPE_LABELS`, `TYPE_SHORT_LABELS`, `TYPE_COLORS`, the Zod enum on
`create_artifact`, the `Record<ArtifactType, …>` validator dispatch, the
renderer switch, the panel chrome) is derived from `ARTIFACT_REGISTRY`.

| Type | Label | Ext | Code Tab | Renderer | Validator | Prompt |
|------|-------|-----|----------|----------|-----------|--------|
| `text/html` | HTML Page | `.html` | ✓ | `html-renderer.tsx` | `validateHtml` | `prompts/artifacts/html.ts` |
| `application/react` | React Component | `.tsx` | ✓ | `react-renderer.tsx` | `validateReact` | `prompts/artifacts/react.ts` |
| `image/svg+xml` | SVG Graphic | `.svg` | ✓ | `svg-renderer.tsx` | `validateSvg` | `prompts/artifacts/svg.ts` |
| `application/mermaid` | Mermaid Diagram | `.mmd` | ✓ | `mermaid-renderer.tsx` | `validateMermaid` | `prompts/artifacts/mermaid.ts` |
| `text/markdown` | Markdown* | `.md` | ✓ | `StreamdownContent` | `validateMarkdown` | `prompts/artifacts/markdown.ts` |
| `text/document` | Document* | `.docx` | ✗ | `document-renderer.tsx` | `validateDocument` | `prompts/artifacts/document.ts` |
| `application/code` | Code | `.txt` | ✗ | `StreamdownContent` (fenced) | `validateCode` | `prompts/artifacts/code.ts` |
| `application/sheet` | Spreadsheet | `.csv` | ✓ | `sheet-renderer.tsx` | `validateSheet` | `prompts/artifacts/sheet.ts` |
| `text/latex` | LaTeX / Math | `.tex` | ✓ | `latex-renderer.tsx` | `validateLatex` | `prompts/artifacts/latex.ts` |
| `application/slides` | Slides | `.pptx`† | ✓ | `slides-renderer.tsx` | `validateSlides` | `prompts/artifacts/slides.ts` |
| `application/python` | Python Script | `.py` | ✓ | `python-renderer.tsx` | `validatePython` | `prompts/artifacts/python.ts` |
| `application/3d` | 3D Scene | `.tsx` | ✓ | `r3f-renderer.tsx` | `validate3d` | `prompts/artifacts/r3f.ts` |

\* The prompt-module `label` for both `text/markdown` and `text/document`
is the string `"Document"` (rescan **N-17**) — the registry uses
`"Markdown"` and `"Document"` for the two `shortLabel`s. The duplicated
prompt label is a UX gap, not a runtime bug.

† The S3 canonical key for `application/slides` ends in `.pptx` even
though stored content is JSON (rescan **N-43**) — exporters convert on the
fly.

`hasCodeTab: false` for `application/code` (the preview *is* the code) and
`text/document` (the preview is the source of truth). The
`text/document` panel uses a split-button download for `.md` (raw AST) vs
`.docx` (rendered).

---

## 2. End-to-end flow — LLM creates an artifact

```
Chat tool call (AI SDK v6)
     │
     ▼
src/lib/tools/builtin/create-artifact.ts
     │  • Zod params: { title, type (enum from ARTIFACT_TYPES), content, language? }
     │  • 512 KiB content cap (Buffer.byteLength)
     │  • Canvas-mode lock: canvasMode && canvasMode !== "auto" && canvasMode !== type
     │  • application/code requires `language` arg
     ▼
validateArtifactContent(type, content, { isNew: true })
     │  • Promise.race against 5-second timer (VALIDATE_TIMEOUT_MS)
     │  • Per-type validator (sync or async)
     │  • Post-resolve Unsplash for text/html and application/slides
     │  • text/document validator resolves Unsplash internally
     │
     ├── ok=false → return { persisted: false, error, validationErrors }
     │             AI SDK retry loop signals the LLM to self-correct.
     │
     ▼ ok=true
finalContent = validation.content ?? content
     │
     ▼
S3 upload (canonical key: artifacts/<orgId|null>/<sessionId|"orphan">/<id><ext>)
     │
     ▼
prisma.document.create({
  id, title, content: finalContent, artifactType,
  sessionId, organizationId, createdBy, s3Key,
  fileType: "artifact", fileSize, mimeType,
  metadata: { artifactLanguage, validationWarnings? }
})
     │
     ▼ background, fire-and-forget
indexArtifactContent(id, title, finalContent)
     │  • chunkDocument() (1000-char / 200-overlap)
     │  • generateEmbeddings() → storeChunks() (N sequential SurrealDB inserts — see N-49)
     │  • markRagStatus(id, true|false) on metadata
     │  • NEVER rethrows; failure path writes ragIndexed:false and returns
     │
     ▼
return { id, title, type, content: finalContent, language, persisted, warnings? }
     │
     ▼
chat-workspace.tsx onToolUpdate
     │  • addOrUpdateArtifact() → useArtifacts state
     │  • on tool error / malformed output: removeArtifact("streaming-${toolCallId}")
     │  • does NOT auto-open the artifact panel — user must click the indicator
```

**Streaming.** When `tool-input-available` arrives mid-stream, the
chat-workspace adds a placeholder artifact with id `streaming-${toolCallId}`
so the panel can show progressive content. On `tool-output-available` the
placeholder is removed and the real artifact (with the persisted id) takes
its place. **If the user aborts mid-stream**, the placeholder is orphaned
forever (rescan **N-4**) — no cleanup runs in `handleStop`.

**`ctx.isNew = true`** is hardcoded for create. Two validators consume it:
`validateMarkdown` enforces a 128 KiB cap, `validateSlides` rejects the
deprecated `image-text` layout. Every other validator ignores it.

---

## 3. End-to-end flow — LLM updates an artifact

```
update_artifact tool call
     │
     ▼
src/lib/tools/builtin/update-artifact.ts
     │  • Zod params: { id, title?, content }   ← no `type`, no `language`
     │  • 512 KiB cap
     │  • prisma.document.findUnique({ where: { id } })
     │     ↳ existing == null  → return { updated: false, error: "...not found..." }
     │  • Canvas-mode lock against existing.artifactType
     │     ↳ silently bypassed when existing.artifactType is null (rescan N-7)
     ▼
validateArtifactContent(existing.artifactType, content)   ← no ctx, so isNew is false
     │  • failures → { updated: false, error: formatValidationError, validationErrors }
     ▼
finalContent = validation.content ?? content
     │
     ▼
Versioning
     │  • metadata.versions: append { title, timestamp, contentLength, s3Key? }
     │  • archive previous content to <s3Key>.v<N>; on failure → inline if ≤32 KiB else marker
     │  • FIFO eviction at 20 entries (MAX_VERSION_HISTORY); track total in evictedVersionCount
     │  • upload new content to existing.s3Key
     ▼
prisma.document.updateMany({ where: { id, updatedAt: existing.updatedAt }, data: {...} })
     │  • count === 0 → return { updated: false, error: "Concurrent update detected…" }
     │  • count === 1 → continue
     ▼
indexArtifactContent(id, updatedTitle, finalContent, { isUpdate: true })  ← background
     │
     ▼
return { id, title: newTitle, content: finalContent, updated: true, persisted, warnings? }
```

**Three known behavioral quirks of `update_artifact`** (rescan items):

- **N-8.** When `title` is omitted, the success return contains
  `title: undefined` — the LLM cannot read the actual current title from
  the tool result.
- **N-9.** Persistence errors set `persisted = false` but the function
  still returns `updated: true` — misleading. The chat workspace's
  `out.updated` gate fires anyway and applies in-memory state diverging
  from storage.
- **N-12.** No `language` or `type` parameters — code language can't be
  changed in place; type can't be migrated.

**Streaming-update edge** (rescan **N-2**): the chat-workspace's
`tool-input-available` handler updates the artifact with partial streamed
content using the **real** id (not a placeholder). If the final
`tool-output-available` carries an error, the chat-workspace only
`console.warn`s. The artifact is left with the partial invalid content
locked in place.

---

## 4. End-to-end flow — manual edit (panel UI)

```
ArtifactPanel edit-mode save
     │
     ▼
PUT /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
     │  • auth() session check
     │  • Zod-validate params + body (DashboardChatSessionArtifactBodySchema)
     ▼
updateDashboardChatSessionArtifact({ userId, sessionId, artifactId, input })
     │  • Session ownership check (cross-tenant guard)
     │  • Artifact-belongs-to-session check
     ▼
validateArtifactContent(existing.artifactType, content)   ← no ctx
     │  • failure → 422 with formatValidationError text
     │  • finalContent = validation.content ?? content
     ▼
Versioning (same archival + FIFO logic as update-artifact)
     │
     ▼
updateDashboardArtifactByIdLocked(id, expectedUpdatedAt, data)
     │  • prisma.document.updateMany({ where: { id, updatedAt: expectedUpdatedAt } })
     │  • returns null on count === 0 → 409
     │
     ▼
HTTP 200 with the persisted row
```

**The big difference from the LLM tool path: NO RAG re-index** (rescan
**N-1**). After a manual edit, `knowledge_search` keeps returning the old
content until the next LLM-driven update reseeds chunks via
`indexArtifactContent`.

**Two-step optimistic-lock window** (rescan, low-impact): the locked
update is `updateMany` + `findUnique` as separate statements. A third
writer landing between them returns *their* version of the row to the
caller, who just "successfully" updated. Doesn't corrupt data, but the
returned shape may not match what was just written.

---

## 5. End-to-end flow — delete

```
DELETE /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
     │
     ▼
deleteDashboardChatSessionArtifact
     │  • session ownership + artifact-belongs-to-session
     ▼
S3 cleanup (all non-fatal)
     │  • deleteFile(existing.s3Key)
     │  • collect metadata.versions[].s3Key → deleteFiles(versionedKeys)
     │  • per-object error array on DeleteObjects is silently dropped (rescan N-46)
     ▼
RAG cleanup
     │  • deleteChunksByDocumentId(artifactId) on SurrealDB (non-fatal)
     ▼
prisma.document.delete({ where: { id } })
     ▼
HTTP 200 { success: true }
```

**Session-delete is incomplete** (rescan **N-47**):
`deleteDashboardChatSession` calls `findArtifactsBySessionId` which only
fetches `{ id, s3Key }`. Versioned keys in `metadata.versions[].s3Key` are
never collected and remain in S3 indefinitely after the session is deleted.

**Session-delete is also non-atomic** (rescan **N-48**): the steps
(S3 → RAG → `deleteArtifactsBySessionId` → `deleteDashboardSessionById`)
are not wrapped in a transaction. A failure between the artifact-row
delete and the session-row delete leaves Documents gone but the session
alive.

---

## 6. The validator dispatcher

`src/lib/tools/builtin/_validate-artifact.ts` (~2110 LoC, the most-changed
file post-fix). Single contract every persistence path runs through.

```ts
export interface ValidationContext { isNew?: boolean }

export interface ArtifactValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  content?: string  // resolved/transformed content to persist instead of input
}

const VALIDATORS: Record<ArtifactType, (content, ctx?) =>
  ArtifactValidationResult | Promise<ArtifactValidationResult>> = { ... }

export let VALIDATE_TIMEOUT_MS = 5_000   // ⚠ mutable module-level — see N-55

export async function validateArtifactContent(
  type: string,
  content: string,
  ctx?: ValidationContext,
): Promise<ArtifactValidationResult>
```

Internals:

1. Look up `VALIDATORS[type]`. **Unknown types pass through with `ok: true`** —
   silent permissive default (pragmatic; any future type added to the
   registry without a validator slot would still persist).
2. `Promise.race` the validator against a 5-second timer. The timer uses
   `setTimeout(...).unref?.()` so it doesn't keep the event loop alive.
   Timeout produces `{ ok: false, errors: ["Validation timeout: ${type} validator exceeded 5000ms budget…"] }`.
3. If `ok === false`, return immediately — Unsplash resolution is skipped.
4. For `text/html`: dynamic-import `@/lib/unsplash`, run
   `resolveImages(result.content ?? content)`, return with `content` set.
5. For `application/slides`: same pattern with `resolveSlideImages`.
6. Other types: pass through unchanged.

**Hidden contract** (rescan): the dispatcher's post-Unsplash overwrite of
`result.content` is a quiet rule — every consumer must check
`validation.content` and persist it instead of the original. Both
`create-artifact.ts` and `update-artifact.ts` do (`finalContent = validation.content ?? content`),
and the manual-edit service does too. Adding a new persistence path that
forgets this would silently lose Unsplash resolution.

The exhaustive `Record<ArtifactType, …>` constraint guarantees every
registered type has a validator slot — adding a new type to the registry
without a validator branch is a TypeScript error.

---

## 7. Per-validator strict-gate map

A "strict gate" is a rule that fires only on creates (`ctx.isNew === true`)
or only when an env flag is set.

| Validator | Strict gate | Trigger | Rescan ref |
|-----------|-------------|---------|------------|
| `validateMarkdown` | 128 KiB cap | `ctx.isNew` | — |
| `validateMarkdown` | `<script>` hard error (default soft warning) | `process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"` | — |
| `validateSlides` | `image-text` layout hard error | `ctx.isNew` | — |
| `validateReact` | aesthetic-directive required | `process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"` (defaults to enforced) | — |
| `validateDocument` | (none — doesn't accept `ctx`) | — | **N-26** |

Both env flags also gate the migration script's audit pass.

---

## 8. Persistence model

**Postgres `Document` model** (artifact-relevant fields):

```
id              String   @id   @default(cuid())
title           String
content         String                    -- canonical, kept in sync with S3
artifactType    String?                   -- non-null = artifact (vs file upload)
categories      String[]                  -- contains "ARTIFACT" for artifacts
sessionId       String?  → DashboardSession (onDelete: SetNull)
organizationId  String?  → Organization   (onDelete: Cascade)
createdBy       String?                   -- loose user reference, no FK (rescan N-44)
s3Key           String?                   -- canonical key
fileType        String?                   -- "artifact"
fileSize        Int?
mimeType        String?
metadata        Json?                     -- versions[], evictedVersionCount, ragIndexed,
                                          --   artifactLanguage, validationWarnings,
                                          --   archiveFailed
updatedAt       DateTime @updatedAt        -- ⚡ optimistic-lock token
@@index([organizationId])
@@index([s3Key])
@@index([sessionId])
```

Notable: `Document.content` has no `@db.Text` annotation while
`DashboardMessage.content` does. Postgres treats both as `text` regardless
but the inconsistency is a hygiene smell.

**`ResolvedImage` model** (Unsplash cache):

```
id            String   @id   @default(cuid())
query         String   @unique             -- normalized search term
url           String
attribution   String                       -- "Photo by … on Unsplash"
expiresAt     DateTime                     -- 30 days from creation
@@index([expiresAt])
```

No background expiry job — stale entries accumulate.

**S3 layout** (`S3Paths.artifact`):

```
artifacts/<orgId|"global">/<sessionId>/<artifactId><ext>      ← canonical
artifacts/<orgId|"global">/<sessionId>/<artifactId><ext>.v1   ← prior version 1
artifacts/<orgId|"global">/<sessionId>/<artifactId><ext>.v2   ← prior version 2
…                                                             up to .v20
```

`getArtifactExtension(type)` derives the extension from the registry. For
`application/code` it's `.txt` regardless of language (rescan **N-38**);
for `application/slides` it's `.pptx` even though content is JSON
(rescan **N-43**).

**Version metadata** entries:

```json
// Normal: archive succeeded
{ "title": "...", "timestamp": 1714000000000, "contentLength": 4321, "s3Key": "artifacts/.../<id>.html.v3" }

// Archive failed but content small: inline up to 32 KiB
{ "title": "...", "timestamp": ..., "contentLength": 4321, "content": "<old>" }

// Archive failed and content too large: marker only
{ "title": "...", "timestamp": ..., "contentLength": 532000, "archiveFailed": true }
```

The 32 KiB inline cap (`MAX_INLINE_FALLBACK_BYTES`) prevents repeated
edits of a 512 KiB artifact from ballooning the row indefinitely.

FIFO eviction at 20 entries (`MAX_VERSION_HISTORY`); the count of evicted
entries lives in `metadata.evictedVersionCount` so the panel can show
"+N earlier versions evicted" instead of silently losing history.

---

## 9. Rendering layer

### Per-type renderers

Lazy-loaded via `next/dynamic` in `artifact-renderer.tsx`. Each owns its
own runtime. The dispatch switch is exhaustive over `ArtifactType` —
adding a new type without a `case` is a TypeScript error.

| Renderer | Mounting | Sandbox | Notes |
|----------|----------|---------|-------|
| `html-renderer.tsx` | iframe `srcDoc` | `allow-scripts allow-modals` | Auto-injects Tailwind CDN + Inter; nav-blocker shim before user scripts |
| `react-renderer.tsx` | iframe `srcDoc` | `allow-scripts` | Babel-standalone in iframe; React/Recharts/Lucide/framer-motion as window globals |
| `svg-renderer.tsx` | inline `dangerouslySetInnerHTML` | — | DOMPurify with `USE_PROFILES.svg + svgFilters`, `ADD_TAGS: ["use"]` |
| `mermaid-renderer.tsx` | inline `dangerouslySetInnerHTML` | — | Module-level singleton `mermaidPromise`; `securityLevel: "strict"` |
| `sheet-renderer.tsx` | inline TanStack Table | — | Dispatches to `sheet-spec-view.tsx` for v1 specs |
| `latex-renderer.tsx` | inline `dangerouslySetInnerHTML` | — | KaTeX with `trust: true` (rescan **N-30**) |
| `slides-renderer.tsx` | iframe `srcDoc` | **`allow-scripts allow-same-origin`** | Most permissive; rescan **N-28** flags this |
| `python-renderer.tsx` | Web Worker (Pyodide) | — | Worker created on first run, terminated on stop |
| `r3f-renderer.tsx` | iframe `srcDoc` | **(no sandbox)** | WebGL-required; documented as intentional |
| `document-renderer.tsx` | inline React | — | Pure rendering of validated AST |
| `application/code` | `StreamdownContent` | — | Fenced block; fence length grows past content's longest backtick run |
| `text/markdown` | `StreamdownContent` | — | Same Streamdown wrapper as chat messages |

### postMessage discipline

Every iframe renderer EXCEPT `r3f-renderer.tsx` checks
`e.source === iframeRef.current?.contentWindow` before trusting an
incoming postMessage. **R3F is the only iframe missing the origin guard**
(rescan **N-27**) — any frame on the page can spoof `r3f-error` /
`r3f-ready` events.

All iframe → parent postMessages target `'*'` origin (rescan **N-31**) —
parent guards prevent inbound spoofing but messages could leak to
attackers if a malicious sibling iframe proxies events.

### Mermaid — three rasterization paths sharing one global

| Path | File | Theme handling | Concurrency |
|------|------|----------------|-------------|
| Server SVG → DOCX | `lib/rendering/server/mermaid-to-svg.ts` | Light only | `renderQueue` Promise mutex serializes calls |
| Client PNG → PPTX | `lib/rendering/client/mermaid-to-png.ts` | **Always light** (rescan **N-53**) | No serialization |
| Browser SVG live | `mermaid-renderer.tsx` + `document-renderer.tsx`'s `MermaidPreviewBlock` | Theme-aware via `getMermaidInitOptions(theme)` | None — global singleton |

`mermaid` is a global singleton; whichever path calls `mermaid.initialize`
last wins for the next render. **Two separate init code paths exist**
(rescan **N-54**): `renderers/mermaid-config.ts` (`getMermaidConfig()`)
used by `mermaid-renderer.tsx`, and `lib/rendering/mermaid-theme.ts`
(`getMermaidInitOptions()`) used by `document-renderer.tsx`'s preview
block. They produce *different* config objects; concurrent renders cause
silent theme drift.

### Document AST (`text/document`)

Schema in `src/lib/document-ast/schema.ts` — Zod tree of `BlockNode` /
`InlineNode` types covering paragraphs, headings, lists, tables,
blockquotes, mermaid, chart, pageBreak, footnotes, TOC, anchors, plus an
optional `coverPage`. Runtime preview in `document-renderer.tsx`; DOCX
export in `to-docx.ts`.

**Key correctness fixes shipped in Priority B:**

- Footnote sink allocated **per render** (`document-renderer.tsx:406`),
  not memoized — memoizing would reuse the populated sink and double
  entries on every keystroke.
- `coverPage.logoUrl` renders as an `ImageRun` (160×160 px) in the DOCX
  output (`renderCoverPage` in `to-docx.ts:479-540`).
- Tables inside footnotes are dropped from DOCX (the `docx` library
  doesn't support nested tables in `FootnoteReferenceRun`s) and replaced
  with an italic-grey marker paragraph: *"[table omitted from footnote — see body for full content]"*.

**Schema-vs-renderer drift items still present** (rescan **N-18, N-19,
N-20, N-21**):

- `tab.leader: "dot"` accepted by schema, used by the `letter.ts` example,
  silently dropped — exporter renders all tabs as `\t`.
- `list.startAt` accepted, ordered lists always start at 1.
- `table.shading: "striped"` accepted, never applied.
- TOC `node.title` rendered **twice** when set: once as a heading
  paragraph, once as the `TableOfContents(node.title, ...)` first arg.

**Other DocumentAst weaknesses** (rescan):

- **N-22.** Heading bookmark uniqueness not enforced — duplicate
  `bookmarkId`s survive validation.
- **N-23.** Footnote nesting unbounded — schema permits
  `footnote → paragraph → footnote` to arbitrary depth.
- **N-24.** `renderChart` has **no try/catch** around `svgToPng` — a
  malformed chart SVG propagates as 500 from the download endpoint.
  Contrast `renderMermaid` which guards with a marker paragraph.
- **N-25.** `validateDocument` discards warnings from `validateDocumentAst`
  on the success path.

---

## 10. Per-type validator quick reference

For full per-type capability detail see
[`artifacts-capabilities.md`](./artifacts-capabilities.md). High-level:

- **`text/html`** — parse5 parse + structural checks (DOCTYPE, viewport,
  title, no `<form action=>`, no `<base>`); inline `<style>` ≤ 10 lines
  warning. Post-resolves Unsplash via `resolveImages`.
- **`application/react`** — Babel parse + import whitelist
  (react, react-dom, recharts, lucide-react, framer-motion). Aesthetic
  directives (`@aesthetic`, `@fonts`) parsed by `_react-directives.ts`.
- **`image/svg+xml`** — parse5 + DOMPurify hard-rules: `viewBox` required,
  no width/height on root, no `<script>` / `<foreignObject>` / `<style>`,
  no external href, no event handlers.
- **`application/mermaid`** — diagram-type prefix check against a
  whitelist (rescan **N-16**: missing `xychart-beta`, `block-beta`,
  `kanban`).
- **`text/markdown`** — heading-level skip detection, raw-HTML disallow
  list, unlabeled fenced-code warning, `<script>` warning (or hard error
  in strict mode), 128 KiB cap on creates.
- **`text/document`** — JSON.parse → `validateDocumentAst` (Zod) →
  `resolveUnsplashInAst` → return resolved AST as `validation.content`.
- **`application/code`** — minimal validation; size warning uses
  `content.length` (chars) not `Buffer.byteLength` (rescan **N-57**).
- **`application/sheet`** — CSV / JSON-array / v1-spec branches; spec
  branch runs `evaluateWorkbook` to validate formulas. CSV currency
  warning fires at ≥ 1 hit (asymmetric vs ISO date warning at ≥ 2;
  rescan, low priority).
- **`text/latex`** — disallowed-command list (`\documentclass`,
  `\usepackage`, etc.); preamble errors short-circuit before unsupported-command
  scan (rescan, low priority — extra LLM retry round).
- **`application/slides`** — 17 layouts; per-layout field requirements;
  bullet/word/deck-size warnings; `image-text` deprecated (warn → error
  on `ctx.isNew`).
- **`application/python`** — non-empty + Pyodide-package-availability
  scan; `input()`, file-write, network checks.
- **`application/3d`** — `R3F_ALLOWED_DEPS` whitelist (35 entries);
  `export default` required; bans `<Canvas>`, `<OrbitControls>`,
  `<Environment>`, `requestAnimationFrame`, `document.*` access.

**Slides chart validation guard is type-loose** (rescan):
`s.chart` is cast `as Record<string, unknown> | undefined` without
`Array.isArray` check, so `chart: []` slips through as
`typeof === "object"` and produces "invalid type undefined" downstream.

---

## 11. Migration script

`scripts/migrate-artifact-deprecations.ts` (177 LoC, idempotent):

```bash
bun run scripts/migrate-artifact-deprecations.ts             # apply slides + audit markdown
bun run scripts/migrate-artifact-deprecations.ts --dry-run   # preview only
bun run scripts/migrate-artifact-deprecations.ts --slides    # slides pass only
bun run scripts/migrate-artifact-deprecations.ts --markdown  # markdown audit only
```

**Pass A (mutating)** — rewrites every `application/slides` deck whose
slides contain `layout === "image-text"` to `layout === "content"`. Renderer
and PPTX exporter treat the two layouts identically, so this is non-visual.
Idempotent — re-running on rewritten decks finds nothing to change.

**Pass B (report-only)** — counts `text/markdown` artifacts containing
`<script>` tags and/or exceeding the 128 KiB cap. Produces a list per
session/user. No mutation.

Both passes scan only `Document` rows where
`artifactType IN ('application/slides', 'text/markdown')` so the script
is safe at any database size.

---

## 12. Chat-workspace integration

`src/features/conversations/components/chat/chat-workspace.tsx` hosts the
artifact lifecycle:

- **Streaming placeholders.** `tool-input-available` for `create_artifact`
  builds an artifact with id `streaming-${toolCallId}` so the panel can
  show progressive content. `tool-input-available` for `update_artifact`
  uses the **real** artifact id (rescan **N-2** edge — see §3).
- **`tool-output-available` cleanup.** Success: replace placeholder with
  the persisted shape. Failure / malformed output: `removeArtifact("streaming-${toolCallId}")` +
  `console.warn`. No user-visible toast.
- **`out.updated` gate.** Update results only apply when
  `out.id && out.content && out.updated`. **If `existing` is missing from
  the local map, the update is silently dropped** (rescan **N-3**).
- **Abort during streaming.** `handleStop()` cancels the request but does
  NOT clean up streaming placeholders (rescan **N-4**).

**Active-artifact persistence.** The active artifact id lives in
`sessionStorage` under `rantai.artifact.active.<sessionKey>`. Survives a
same-tab refresh; resets across browser sessions.

**Canvas mode wiring:**

- Type: `false | "auto" | ArtifactType` (defined in `chat-input-toolbar.tsx`).
- Storage: part of the `SessionToolbarStateSnapshot` in `sessionStorage`
  under `chat-toolbar-state:${sessionId}`.
- Path UI → tool: ChatInputToolbar setter → `setCanvasMode` →
  POST body field `canvasMode` (omitted when `false`) → server tool
  context → `create_artifact` / `update_artifact` consume
  `context.canvasMode` for the type-lock check.

---

## 13. ArtifactPanel UI (`artifact-panel.tsx` ~985 LoC)

Major state variables:

| State | Purpose |
|-------|---------|
| `tab` | "preview" or "code" |
| `isEditing` | Edit-mode toggle (only reachable on the code tab) |
| `viewingVersionIdx` | `null` = current, otherwise an index into `previousVersions` |
| `editContent`, `isDirty`, `isSaving`, `saveError` | Edit-form state |
| `isFullscreen` | Portal fullscreen mode |
| `isExporting`, `exportError` | Export-button state |

**Hidden state machine** (rescan **N-32**): if the user is mid-edit on
the code tab and the LLM produces a new version of the artifact (via
`update_artifact`), `artifact.version` increments, `viewingVersionIdx`
resets, and the edit-content effect reinitializes `editContent` from the
new content. **The orange "dirty" dot disappears without saving.** No
warning, no confirmation.

**Save vs Restore asymmetry** (rescan **N-33**): `handleSave` is
pessimistic (await API → set state); `handleRestoreVersion` is optimistic
(set state → await API → ignore failure with `console.error`). A failed
restore leaves the panel showing content the server rejected, with no
banner.

**Delete is also fire-and-forget** (rescan **N-34**): `handleDelete`
awaits the DELETE but never checks `response.ok` — UI removes the
artifact even on a 5xx.

**Download paths:**

- `text/document`: split-button DropdownMenu — `.md` (raw AST JSON,
  pretty-printed) or `.docx` (rendered server-side).
- `application/sheet` v1 specs: `.xlsx` via `lib/spreadsheet/generate-xlsx.ts`.
- Everything else: `.{registry.extension}` direct blob.

**Historical-version content guards.** When the user picks an older
version that lacks both `metadata.versions[N].content` (inline fallback)
and `s3Key` (archived), the panel surfaces a "Download isn't available
for this version — its content was archived to storage…" notice rather
than producing a corrupted blob. The same guard applies to
`text/document` `.docx` export.

**RAG-status badge.** `metadata.ragIndexed === false` → header pill shows
"not searchable". Drawn from the indexer's failure-case write of
`metadata.ragIndexed`.

**Accessibility gaps** (rescan **B-section**): version nav buttons and
most action-bar buttons have no `aria-label`; tab bar uses plain
`<button>` not `role="tab"` / `aria-selected`; SpecWorkbookView table
has no caption / aria-label / scope.

---

## 14. RAG indexing

`src/lib/rag/artifact-indexer.ts` is the single fire-and-forget indexer
used by `create_artifact` and `update_artifact` (rescan **N-1**: NOT used
by the manual-edit service path).

```ts
indexArtifactContent(documentId, title, content, options?: { isUpdate?: boolean }): Promise<void>
```

- `isUpdate: true` → `deleteChunksByDocumentId(documentId)` first.
- `chunkDocument()` produces 1000-char chunks with 200-char overlap.
- `generateEmbeddings()` (batched 128, 4-way parallel internally).
- `storeChunks()` does **N sequential SurrealDB inserts** (rescan
  **N-49**) — for a 128 KiB artifact, ~140 round-trips with no batching.
- On success: `markRagStatus(id, true)`.
- On failure or zero chunks: `markRagStatus(id, false).catch(() => {})`.
- **Function does not rethrow.** Callers `.catch(...)` for habit; nothing
  escapes.

Deletion calls `deleteChunksByDocumentId(artifactId)` directly — failures
logged but non-fatal.

---

## 15. API surface

```
GET    /api/dashboard/chat/sessions
POST   /api/dashboard/chat/sessions
GET    /api/dashboard/chat/sessions/[id]
PATCH  /api/dashboard/chat/sessions/[id]
DELETE /api/dashboard/chat/sessions/[id]

POST   /api/dashboard/chat/sessions/[id]/messages
PATCH  /api/dashboard/chat/sessions/[id]/messages
DELETE /api/dashboard/chat/sessions/[id]/messages

PUT    /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
DELETE /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
GET    /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download
```

**Auth model.** All routes require an authenticated NextAuth session.
The entire authorization model is `userId` ownership of the
`DashboardSession`. **No org-membership check, no role check.** (Rescan
**N-6**: `createDashboardChatSession` doesn't validate `assistantId`
belongs to the caller's org.)

**Artifact PUT status codes:**

| Status | Trigger |
|--------|---------|
| 200 | Updated successfully |
| 400 | Body schema validation failed (Zod) |
| 401 | No auth session |
| 404 | Session or artifact not found, or cross-tenant lookup hit |
| 409 | Concurrent-update conflict (optimistic lock returned 0 rows) |
| 422 | Validator failure |
| 500 | Unhandled |

**Artifact DELETE status codes:** 200, 401, 404, 500.

**Artifact download:** GET serves the rendered DOCX for `text/document`
and the canonical S3 object for everything else. `format=docx` is the
only accepted value; **returns 409 for "Invalid document AST"** which
should semantically be 422 (rescan **N-42**).

**Quirk** (rescan **N-41**): `POST /sessions` and
`PATCH /sessions/[id]` silently pass `undefined` to the service when
Zod parse fails (no early 400 with error details).

**Quirk** (rescan **N-5**): `createDashboardMessages` upsert can move a
message between sessions if a client supplies an existing id; no
cross-session ownership check before the update branch.

---

## 16. Constants reference

| Constant | Value | Where | Why |
|----------|-------|-------|-----|
| `MAX_ARTIFACT_CONTENT_BYTES` | 512 KiB | `create-artifact.ts`, `update-artifact.ts` | Hard cap on persisted content |
| `MAX_INLINE_FALLBACK_BYTES` | 32 KiB | `update-artifact.ts`, `service.ts` | Inline-fallback cap when S3 archival fails |
| `MAX_VERSION_HISTORY` | 20 | `update-artifact.ts`, `service.ts` | FIFO eviction cap |
| `VALIDATE_TIMEOUT_MS` | 5000 ms (mutable; rescan **N-55**) | `_validate-artifact.ts` | Wall-clock budget on validators |
| `MARKDOWN_NEW_CAP_BYTES` | 128 KiB | `_validate-artifact.ts` | Per-type cap on creates only |
| `MAX_INLINE_STYLE_LINES` | 10 | `_validate-artifact.ts` | HTML inline `<style>` length warning (rescan **N-13**: real threshold ~15) |
| `REACT_IMPORT_WHITELIST` | 5 | `_validate-artifact.ts` | react, react-dom, recharts, lucide-react, framer-motion |
| `MAX_FONT_FAMILIES` | 3 | `_react-directives.ts` | React `@fonts` cap |
| `MAX_SLIDE_BULLETS` / `MAX_BULLET_WORDS` | 6 / 10 | `_validate-artifact.ts` | Slides warnings |
| `MIN_DECK_SLIDES` / `MAX_DECK_SLIDES` | 7 / 12 | `_validate-artifact.ts` | Deck-size convention |
| `CACHE_DAYS` | 30 | `unsplash/resolver.ts` | `ResolvedImage.expiresAt` lifetime |
| `MERMAID` chunker chunk size | 1000 chars | `lib/rag/chunker.ts` | RAG chunking |
| `chunkOverlap` | 200 chars | `lib/rag/chunker.ts` | RAG chunking |
| `BATCH_SIZE` (embeddings) | 128 | `lib/rag/embeddings.ts` | Parallel-fetch batching |
| `EMBED_CONCURRENCY` | 4 | `lib/rag/embeddings.ts` | Parallel workers |

---

## 17. Environment flags

| Flag | Default | Effect |
|------|---------|--------|
| `ARTIFACT_REACT_AESTHETIC_REQUIRED` | enforced (must explicitly equal `"false"` to disable) | When enforced, missing aesthetic directive on a React artifact is a hard error |
| `ARTIFACT_STRICT_MARKDOWN_VALIDATION` | unset (soft warning) | When `"true"`, `<script>` tags in markdown are a hard error |
| `UNSPLASH_ACCESS_KEY` | unset | When unset, `searchPhoto` returns null → resolver falls back to `placehold.co` |
| `S3_*` | required | Artifact persistence; envelope errors degrade history (inline fallback up to 32 KiB) |

Note: `ARTIFACT_REACT_AESTHETIC_REQUIRED` is **enforced by default** —
the env var must be the literal string `"false"` to disable. The variable
name suggests opt-in but the implementation is opt-out.

---

## 18. Test coverage

```
tests/unit/validate-artifact.test.ts                                  — base validator suite (~1660 lines)
tests/unit/tools/validate-artifact-timeout.test.ts                    — 5s timeout + __setValidateTimeoutMsForTesting hook
tests/unit/tools/validate-artifact-resolves-unsplash.test.ts          — dispatcher post-Unsplash for HTML and slides
tests/unit/tools/create-artifact-resolve.test.ts                      — finalContent flow
tests/unit/tools/update-artifact.test.ts                              — locked update + canvas-mode + missing artifact
tests/unit/rag/artifact-indexer-rethrow.test.ts                       — fire-and-forget never throws
tests/unit/features/conversations/sessions/delete-artifact.test.ts    — versioned S3 + RAG cleanup on delete
tests/unit/react-artifact/directive-parser.test.ts                    — _react-directives.ts
tests/unit/react-artifact/fixtures.test.ts                            — ⚠ rescan N-56: missing `await`, may test Promise objects vacuously
```

The 7 pre-existing failures in `react-artifact/fixtures.test.ts` are
likely caused by the missing `await` (rescan **N-56**) — once fixed, the
fixtures may need actual repair.

Coverage gaps (rescan §G in
[`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md)):
streaming dirty-state, `out.updated` map-miss, abort-during-stream
cleanup, canvasMode sessionStorage roundtrip, mermaid theme-override
warning, slides visual layouts (comparison/features/stats/gallery),
`unsplash:` in CSS/JS, canvas-mode-bypass with null artifactType,
`text/document` mermaid/chart blocks.

---

## 19. What was deferred

**Priority D (audit Fix #20)** — moving `evaluateWorkbook` from main thread
to a Web Worker. Deferred because the `SpreadsheetSpec` carries callback
fields (`onCell`, `onRange`, `onVariable` for FormulaParser) that are not
structured-clone compatible across the postMessage boundary. ~300–500 LoC
plus Next.js webpack worker bundle config.

If jank is reported in production, the lower-risk first step is
`requestIdleCallback` chunking inside `evaluateWorkbook` (~50 LoC, no
spec redesign, no bundle config) before committing to a full Worker
migration.

Topological sort is currently O(n²) in formula count (rescan **N-50**) —
capped at 200 formulas it's negligible, but Kahn's algorithm with an
in-degree map would be linear.

---

## 20. Recap — key inconsistencies that matter for callers

A short list of "things to remember" for anyone touching this code:

1. **The two persistence paths diverge on RAG** (rescan **N-1**). LLM tool
   path indexes; manual-edit HTTP path doesn't. Don't expect search
   results to reflect manual edits until the next LLM update.
2. **The validator dispatcher rewrites content** for HTML and slides
   (Unsplash). Every consumer must persist `validation.content ?? content`.
3. **Optimistic locking is on `updatedAt`**. Failures surface as 409
   (HTTP) or `{ updated: false }` (LLM tool). The two-step
   `updateMany + findUnique` has a tiny race window where the returned
   row may be from a third writer.
4. **`update_artifact` has minor wire-shape gotchas** — `title: undefined`
   when omitted (rescan **N-8**), `updated: true, persisted: false` on
   catch (rescan **N-9**), canvas-mode bypass with null artifactType
   (rescan **N-7**).
5. **Streaming `update_artifact` mutates the live artifact** before the
   final result lands (rescan **N-2**). Validation failure leaves the
   artifact in the partial state.
6. **Mermaid is a global singleton** with two competing init paths and
   three render paths; expect occasional theme drift (rescan **N-53,
   N-54**).
7. **Sandbox flags are not uniform** across iframe renderers
   (rescan **N-27, N-28, N-29**). R3F has none; slides has
   `allow-same-origin`; HTML and React are properly sandboxed.
8. **Session delete is incomplete**: versioned S3 keys leak, and the
   sequence isn't transactional (rescan **N-47, N-48**).
9. **`createDashboardMessages` upsert is cross-session unsafe** (rescan
   **N-5**) — known issue.
10. **DocumentAst has 4+ schema-vs-renderer drift items** —
    `tab.leader`, `list.startAt`, `table.shading`, TOC title duplication,
    chart error guard (rescan **N-18, N-19, N-20, N-21, N-24**).

For the full backlog of 58 rescan findings, see
[`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md).
