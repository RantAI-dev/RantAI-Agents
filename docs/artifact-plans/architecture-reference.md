# Artifact System — Architecture Reference

> **Audience:** an engineer who needs to find where something lives in the
> code. Structured as a **file:line audit** — every claim is verified
> against the working tree and points at a specific source location. For
> the system narrative read [`artifacts-deepscan.md`](./artifacts-deepscan.md);
> for per-type capabilities read [`artifacts-capabilities.md`](./artifacts-capabilities.md).
>
> **Last regenerated:** 2026-04-25, post-Priority-C, pinned to merge `f0264f8`.
> Replaces all prior versions. Line numbers verified against `wc -l` and
> `grep -n` output during a 5-agent ground-up rescan.
>
> Cross-references to **N-N** items below point at finding numbers in
> [`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md).

---

## Module map (top-down)

```
src/
├── features/conversations/
│   ├── components/chat/
│   │   ├── chat-workspace.tsx                       artifact lifecycle host
│   │   ├── chat-input-toolbar.tsx                   CanvasMode type definition
│   │   ├── streamdown-content.tsx                   shared markdown renderer
│   │   └── artifacts/
│   │       ├── registry.ts                          single source of truth (218 LoC)
│   │       ├── types.ts                             ArtifactType + Artifact shape (61 LoC)
│   │       ├── use-artifacts.ts                     React hook (143 LoC)
│   │       ├── artifact-renderer.tsx                type-switch dispatcher (139 LoC)
│   │       ├── artifact-panel.tsx                   panel chrome (985 LoC)
│   │       ├── artifact-indicator.tsx               chat-bubble pill (48 LoC)
│   │       └── renderers/                           per-type previews (lazy)
│   └── sessions/
│       ├── service.ts                               chat-session API service (643 LoC)
│       ├── repository.ts                            Prisma query layer (215 LoC)
│       └── schema.ts                                Zod request schemas
├── lib/
│   ├── tools/builtin/
│   │   ├── create-artifact.ts                       LLM tool: create (187 LoC)
│   │   ├── update-artifact.ts                       LLM tool: update (256 LoC)
│   │   └── _validate-artifact.ts                    dispatcher + 12 validators (2110 LoC)
│   ├── prompts/artifacts/                           per-type LLM rules (12 + index + context)
│   ├── document-ast/
│   │   ├── schema.ts                                Zod tree (376 LoC)
│   │   ├── validate.ts                              validateDocumentAst (213 LoC)
│   │   ├── to-docx.ts                               DOCX renderer (699 LoC)
│   │   └── resolve-unsplash.ts                      AST tree-walker (139 LoC)
│   ├── rendering/
│   │   ├── mermaid-theme.ts                         shared light/dark vars + factory (50 LoC)
│   │   ├── server/mermaid-to-svg.ts                 jsdom shim + Promise mutex (140 LoC)
│   │   ├── server/svg-to-png.ts                     sharp rasterizer (25 LoC)
│   │   ├── client/mermaid-to-png.ts                 client-side PNG path (34 LoC)
│   │   ├── client/svg-to-png.ts                     client SVG → PNG (91 LoC)
│   │   ├── chart-to-svg.ts                          chart block → SVG (413 LoC)
│   │   └── resize-svg.ts                            <svg width/height> helper (18 LoC)
│   ├── unsplash/
│   │   ├── client.ts                                searchPhoto via REST (45 LoC)
│   │   ├── resolver.ts                              resolveHtmlImages/SlideImages/Queries (207 LoC)
│   │   ├── index.ts                                 re-exports (61 LoC)
│   │   └── types.ts                                 (24 LoC)
│   ├── spreadsheet/
│   │   ├── parse.ts                                 detectShape + parseSpec (204 LoC)
│   │   ├── formulas.ts                              evaluateWorkbook (274 LoC)
│   │   ├── generate-xlsx.ts                         .xlsx export (144 LoC)
│   │   ├── styles.ts                                (128 LoC)
│   │   └── types.ts                                 SpreadsheetSpec + callback fields (88 LoC)
│   ├── slides/
│   │   ├── types.ts                                 SlideData / ChartData (referenced by validator)
│   │   └── types.zod.ts                             ChartDataSchema (referenced by DocumentAst)
│   ├── rag/
│   │   ├── artifact-indexer.ts                      fire-and-forget indexer (77 LoC)
│   │   ├── chunker.ts                               chunkDocument
│   │   ├── vector-store.ts                          deleteChunksByDocumentId, storeChunks
│   │   └── embeddings.ts                            generateEmbeddings (BATCH_SIZE=128, EMBED_CONCURRENCY=4)
│   └── s3/index.ts                                  S3Paths, uploadFile, deleteFile, deleteFiles (508 LoC)
├── app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/
│   ├── route.ts                                     PUT/DELETE (82 LoC)
│   └── download/route.ts                            GET stream (text/document only)
└── scripts/
    └── migrate-artifact-deprecations.ts             idempotent migration (177 LoC)
```

---

## 1. Registry & Types

### `src/features/conversations/components/chat/artifacts/registry.ts`

| Symbol | Lines | Notes |
|--------|-------|-------|
| `ArtifactRegistryEntry` interface | 35–60 | Shape: `type`, `label`, `shortLabel`, `icon`, `colorClasses`, `extension`, `codeLanguage`, `hasCodeTab` |
| `ARTIFACT_REGISTRY` | 62–183 | Twelve `as const satisfies readonly ArtifactRegistryEntry[]` entries |
| `ArtifactType` type | 185 | `(typeof ARTIFACT_REGISTRY)[number]["type"]` |
| `ARTIFACT_TYPES` | 187 | Derived array |
| `VALID_ARTIFACT_TYPES` | 189 | Derived `Set` |
| `BY_TYPE` | 191–193 | Internal `Map<ArtifactType, Entry>` |
| `getArtifactRegistryEntry(type)` | 196–200 | Safe accessor |
| `TYPE_ICONS` / `TYPE_LABELS` / `TYPE_SHORT_LABELS` / `TYPE_COLORS` | 202–218 | Derived `Record<ArtifactType, …>` maps |

### `src/features/conversations/components/chat/artifacts/types.ts`

| Symbol | Lines |
|--------|-------|
| Re-exports of `ARTIFACT_TYPES`, `VALID_ARTIFACT_TYPES`, `ArtifactType` | 9–13 |
| `isValidArtifactType(value)` | 17–19 |
| `ArtifactVersion` interface | 21–25 |
| `Artifact` interface (incl. `evictedVersionCount?`, `ragIndexed?`) | 27–47 |
| `PersistedArtifact` (wire shape from API) | 50–61 |

### `src/features/conversations/components/chat/artifacts/use-artifacts.ts`

| Lines | Symbol |
|-------|--------|
| 17 | `ACTIVE_ARTIFACT_KEY_PREFIX = "rantai.artifact.active."` |
| 19–35 | sessionStorage restore on `sessionKey` change |
| 37–50 | sessionStorage persist on `activeArtifactId` change |
| 52–83 | `addOrUpdateArtifact` — pushes prior version onto `previousVersions`, bumps `version` |
| 85–92 | `removeArtifact` |
| 94–96 | `closeArtifact` |
| 98–100 | `openArtifact` |
| 102–127 | `loadFromPersisted` — replaces map, reconciles active id |

---

## 2. LLM tool layer

### `src/lib/tools/builtin/create-artifact.ts` (187 LoC)

| Lines | What |
|-------|------|
| 16 | `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` |
| 18–22 | Tool definition: `name: "create_artifact"` |
| 23–40 | Zod params: `title`, `type` (enum from `ARTIFACT_TYPES`), `content`, `language?` — every `.describe()` text is the LLM-facing parameter doc |
| 42–46 | `execute()` entry — `crypto.randomUUID()`, parameter extraction |
| 49–60 | 512 KiB content cap (`Buffer.byteLength`) |
| 67–85 | Canvas-mode lock: `canvasMode && canvasMode !== "auto" && canvasMode !== type` → `{ persisted: false, error: "...", validationErrors: [...] }` |
| 89–101 | `application/code` requires `language` arg → error result on missing |
| 106 | **`validateArtifactContent(type, content, { isNew: true })`** |
| 108–119 | `!validation.ok` → return error result; AI SDK retry signals LLM |
| 124 | **`finalContent = validation.content ?? content`** — picks up Unsplash rewrite |
| 130–143 | S3 upload via `S3Paths.artifact(orgId, sessionId|"orphan", id, ext)` |
| 145–166 | `prisma.document.create({ ..., content: finalContent, metadata: { artifactLanguage, validationWarnings? } })` |
| 168–170 | `indexArtifactContent(id, title, finalContent).catch(...)` — fire-and-forget |
| 177–185 | Return `{ id, title, type, content: finalContent, language, persisted, warnings? }` |

### `src/lib/tools/builtin/update-artifact.ts` (256 LoC)

| Lines | What |
|-------|------|
| 13 | `MAX_VERSION_HISTORY = 20` |
| 16 | `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` |
| 25 | `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` |
| 27–44 | Tool definition + Zod params (`id`, `title?`, `content`); **rescan N-12: no `language` / `type` parameters** |
| 51–61 | 512 KiB cap |
| 67–82 | **Missing-artifact early return** — returns `"Artifact \"${id}\" not found. Call create_artifact instead..."` |
| 89–107 | **Canvas-mode lock against `existing.artifactType`** — **rescan N-7: silently bypassed when `existing.artifactType` is null** |
| 111–127 | Validator dispatch (no `ctx`, so `isNew` is effectively false) |
| 132–134 | **`finalContent = validation.content`** — picks up Unsplash rewrite |
| 141–162 | Versioning: archive previous content to `<s3Key>.v<N>` |
| 168–173 | Inline fallback (≤ 32 KiB) or `archiveFailed: true` marker |
| 175–181 | Push version entry + FIFO eviction at 20 |
| 192–199 | Upload new content to canonical s3Key |
| 201–222 | **Optimistic lock**: `prisma.document.updateMany({ where: { id, updatedAt: existing.updatedAt }, ... })` |
| 223–235 | `lockResult.count === 0` → `{ updated: false, persisted: false, error: "Concurrent update detected: another writer modified this artifact between read and write. Re-fetch the artifact and retry the update." }` |
| 238–240 | Background re-index via `indexArtifactContent(id, updatedTitle, finalContent, { isUpdate: true })` |
| 242–244 | Catch block — sets `persisted = false` and **falls through to success return** (rescan **N-9**) |
| 247–255 | Return `{ id, title: newTitle, content: finalContent, updated: true, persisted, warnings? }` — **rescan N-8: `title: undefined` when not provided** |

---

## 3. Validator dispatcher

### `src/lib/tools/builtin/_validate-artifact.ts` (2110 LoC)

| Lines | Symbol / Purpose |
|-------|-----------------|
| 33–39 | `ArtifactValidationResult` interface (`ok`, `errors`, `warnings`, `content?`) |
| 42–48 | `REACT_IMPORT_WHITELIST` — react, react-dom, recharts, lucide-react, framer-motion |
| 51 | `MAX_INLINE_STYLE_LINES = 10` (rescan **N-13**: validator threshold appears to be 15 in tests) |
| 68–70 | `ValidationContext` interface — `{ isNew?: boolean }` |
| 72–91 | `VALIDATORS: Record<ArtifactType, ...>` — exhaustive |
| 103 | **`export let VALIDATE_TIMEOUT_MS = 5_000`** — rescan **N-55: mutable module-level state** |
| 106–108 | `__setValidateTimeoutMsForTesting(ms)` — test-only hook |
| 110–145 | **`validateArtifactContent(type, content, ctx?)`** |
| 117–130 | Promise.race against timeout; produces `{ ok: false, errors: ["Validation timeout: ${type} validator exceeded ${VALIDATE_TIMEOUT_MS}ms budget. Content may be too complex (e.g. deeply nested structures, oversized formula DAG)."] }` |
| 136–139 | Post-Unsplash for `text/html` via `resolveImages(result.content ?? content)` |
| 140–143 | Post-Unsplash for `application/slides` via `resolveSlideImages(result.content ?? content)` |
| 151–176 | `validateDocument` — **rescan N-26: no `ctx` parameter; rescan N-25: discards warnings from `validateDocumentAst`** |
| 186–206 | `SLIDE_LAYOUTS` set (17 entries; `image-text` is layout #6, deprecated) |
| 207–210 | `MAX_SLIDE_BULLETS=6`, `MAX_BULLET_WORDS=10`, `MIN_DECK_SLIDES=7`, `MAX_DECK_SLIDES=12` |
| 212–636 | `validateSlides(content, ctx?)` — full layout matrix |
| 336–343 | **`image-text` deprecation gate**: hard error when `ctx?.isNew`, warning otherwise |
| 364 | Inline `validMermaidStarts` list — **rescan N-15: omits `stateDiagram-v2`, subset of `MERMAID_DIAGRAM_TYPES`** |
| 400–421 | `validateSlides` chart guard — **rescan: no `Array.isArray` check; `chart: []` slips through `typeof === "object"`** |
| 638–737 | `validate3d` — non-empty + R3F dep whitelist (`R3F_ALLOWED_DEPS` at line 641, 35 entries) + `export default` requirement |
| 790–828 | `tokenizeCsv` — **rescan: doesn't handle bare `\r` (old Mac line endings)** |
| 831–835 | Sheet validation regexes (`ISO_DATE`, `NON_ISO_DATE`, `CURRENCY_NUMBER`, `THOUSANDS_NUMBER`) |
| 837–1061 | `validateSheet` — CSV + JSON-array + v1-spec branches; runs `evaluateWorkbook` for spec validation |
| 1037 | **CSV currency warning fires at `currencyHits >= 1`** — rescan: noisy asymmetry vs ISO date `>= 2` |
| 1068 | `MARKDOWN_NEW_CAP_BYTES = 128 * 1024` |
| 1070–1187 | `validateMarkdown(content, ctx?)` |
| 1082–1089 | **128 KiB cap on creates** (`ctx?.isNew`) |
| 1123–1135 | **Strict-mode `<script>`** — `process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"` |
| 1141–1162 | Raw-HTML disallow list: `details`, `summary`, `kbd`, `mark`, `iframe`, `video`, `audio`, `object`, `embed`, `table` |
| 1166–1183 | Unlabeled fenced-code-block warning — **rescan: fragile under nested fences** |
| 1200–1297 | LaTeX command tables + `validateLatex` — **rescan: preamble errors short-circuit before unsupported-command scan** |
| 1298–1370 | `validateCode` + truncation marker tables |
| 1353 | **Code size warning uses `content.length` (chars)** — rescan **N-57**: should be `Buffer.byteLength` |
| 1372–1508 | `validateMermaid` + diagram-type list (`MERMAID_DIAGRAM_TYPES` at line 1372) — **rescan N-16: missing `xychart-beta`, `block-beta`, `kanban`** |
| 1490 | Mermaid `%%{init: ... theme ...}%%` warning — rescan **N-14**: regex easily evaded |
| 1510–1651 | `validateSvg` |
| 1653–1764 | `validateHtml` (parse5) |
| 1766–1776 | `KNOWN_SERIF_FAMILIES` |
| 1777 | `PALETTE_MISMATCH_THRESHOLD = 6` |
| 1779–~1900 | `appendAestheticWarnings` + `validateReact` |
| 1847 | `aestheticRequired = process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"` — **rescan: enforced by default** |
| ~1900–end | `formatValidationError` — rescan: hidden LLM-retry contract |

### `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`

| Lines | Symbol |
|-------|--------|
| 11 | `AESTHETIC_DIRECTIONS` — 7 entries: `editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic` |
| 23 | `DEFAULT_FONTS_BY_DIRECTION` — per-direction Google Fonts spec |
| 54 | `MAX_FONT_FAMILIES = 3` |
| 67 | `AESTHETIC_LINE_REGEX = /^\s*\/\/\s*@aesthetic\s*:\s*([a-z-]+)\s*$/` |
| 68 | `FONTS_LINE_REGEX = /^\s*\/\/\s*@fonts\s*:\s*(.+?)\s*$/` |
| 110 | `FONT_SPEC_REGEX` — accepts `wght@`, `ital,wght@`, `opsz,wght@`, `ital,opsz,wght@` axis forms only |
| 143–154 | `buildFontLinks` silent fallback to direction defaults |
| 162 | `encodeFontSpec` — only space-to-`+` (no full URL encoding) |

`stripDirectiveLines` at `_validate-artifact.ts:1829-1831` replaces directive
lines with empty strings rather than removing them — Babel parse error
line numbers are off-by-2 from the original source (rescan, low priority).

---

## 4. Prompts

`src/lib/prompts/artifacts/*.ts` — one file per artifact type plus shared
infrastructure:

- `index.ts` — `ALL_ARTIFACTS` tuple (12 entries) with `satisfies` clause
  forcing every entry's `type` to match a registered `ArtifactType`.
- `context.ts` — `assembleArtifactContext(type, mode)` dispatcher.
  - `mode: "summary"` returns one-liner per type for type-pick prompt.
  - `mode: "full"` returns `rules` + design tokens (visual types only) +
    up to 2 few-shot examples.
  - `VISUAL_ARTIFACT_TYPES` Set at lines 47–53: `text/html`,
    `application/react`, `image/svg+xml`, `application/slides`,
    `application/3d` get design tokens; others don't.
- Per-type files: `code.ts`, `document.ts`, `html.ts`, `latex.ts`,
  `markdown.ts`, `mermaid.ts`, `python.ts`, `r3f.ts`, `react.ts`,
  `sheet.ts`, `slides.ts`, `svg.ts` — each exports
  `{ type, label, summary, rules, examples? }`.

**Drift reference** (rescan §B):

- **N-13** `prompts/artifacts/html.ts:78` says inline `<style>` ≤ 10 lines;
  validator threshold appears to be 15.
- **N-14** `prompts/artifacts/mermaid.ts` forbids
  `%%{init: {'theme':'...'}}%%`; validator only warns and the regex is
  evadable.
- **N-17** `prompts/artifacts/markdown.ts` and `prompts/artifacts/document.ts`
  both export `label: "Document"` (UI ambiguity).

---

## 5. Sessions service / repository / API

### `src/features/conversations/sessions/service.ts` (643 LoC)

| Lines | Symbol |
|-------|--------|
| 34–37 | `ServiceError` interface |
| 39–82 | `DashboardChatSession*` summary types |
| 113–172 | `formatSessionSummary` / `formatMessage` / `formatArtifact` — **rescan N-40: drops `mimeType` field** |
| 175–183 | `listDashboardChatSessions` |
| 185–212 | `createDashboardChatSession` — **rescan N-6: no assistantId org-membership check** |
| 214–237 | `getDashboardChatSession` (includes artifacts via repository) |
| 239–262 | `updateDashboardChatSession` (rename) |
| 263–296 | `deleteDashboardChatSession` — **rescan N-47: only fetches `{id, s3Key}` from artifacts; rescan N-48: not transactional** |
| 297–349 | `addDashboardChatSessionMessages` — **rescan N-5: upsert can move messages between sessions** |
| 350–399 | `updateDashboardChatSessionMessage` |
| 401–418 | `deleteDashboardChatSessionMessages` |
| 427 | `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` |
| 429 | `MAX_VERSION_HISTORY = 20` |
| 431–567 | **`updateDashboardChatSessionArtifact`** — manual edit path |
| 463–478 | Validator + `finalContent = validation.content ?? content` |
| 486–498 | Archive prior content to `<s3Key>.v<N>` |
| 504–510 | Inline fallback ≤ 32 KiB or `archiveFailed` marker |
| 522–527 | FIFO eviction tracking |
| 537–558 | **`updateDashboardArtifactByIdLocked`** call — null → 409 with `"Concurrent update detected: another writer changed this artifact while you were editing. Reload to see the latest version, then retry your save."` |
| (no RAG re-index) | **rescan N-1: HTTP path doesn't call `indexArtifactContent`** |
| 569–591 | `getDashboardChatSessionArtifact` |
| 596–643 | **`deleteDashboardChatSessionArtifact`** — canonical S3 + versioned S3 + RAG cleanup |
| 619–634 | Versioned S3 cleanup via `metadata.versions[].s3Key` |
| 637–639 | RAG cleanup via `deleteChunksByDocumentId(artifactId).catch(...)` |

### `src/features/conversations/sessions/repository.ts` (215 LoC)

| Lines | Symbol |
|-------|--------|
| 4–17 | `findDashboardSessionsByUser` |
| 19–28 | `createDashboardSession` |
| 30–50 | `findDashboardSessionByIdAndUser` (includes artifacts; selects `mimeType` then drops) |
| 52–56 | `findDashboardSessionBasicByIdAndUser` |
| 58–69 | session title CRUD |
| 71–105 | `createDashboardMessages` — `prisma.$transaction` upsert; **rescan N-5: no cross-session ownership check** |
| 107–140 | message edit/delete |
| 143–150 | `findDashboardArtifactByIdAndSession` |
| 152–168 | `updateDashboardArtifactById` (legacy unlocked) — **rescan N-39: dead export, no callers** |
| 170–196 | **`updateDashboardArtifactByIdLocked(id, expectedUpdatedAt, data)`** — `prisma.document.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, … })`; returns `null` on `count===0`; two-step (updateMany + findUnique) has tiny race window |
| 198–202 | `deleteDashboardArtifactById` |
| 204–209 | `findArtifactsBySessionId` — **rescan N-47: only selects `{id, s3Key}`** |
| 211–215 | `deleteArtifactsBySessionId` |

### `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts` (82 LoC)

| Lines | What |
|-------|------|
| 13–49 | `PUT` — auth → param schema → body schema → `updateDashboardChatSessionArtifact` |
| 23–25 | param 404: `"Artifact not found"` |
| 28–31 | body 400: `"Invalid request body"` |
| 40–42 | service-error pass-through (404/422/409) |
| 51–81 | `DELETE` — same pattern |

### `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`

| Lines | What |
|-------|------|
| (top) | `runtime = "nodejs"` (required for docx generation) |
| (path) | `format` query param defaults to `"docx"`; only `text/document` accepted — others return 400 `"Unsupported format: ${format}"` |
| (parse) | DocumentAstSchema parse → **rescan N-42: returns 409 on parse fail (should be 422)** |
| (sanitize) | Title → `[^a-z0-9._-]+` → `_`, sliced to 80 chars; sets `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `Content-Disposition: attachment; filename="<safeTitle>.docx"`, `Cache-Control: no-store` |

### `src/app/api/dashboard/chat/sessions/route.ts` (Sessions)

- `POST` body: **rescan N-41: passes `parsedBody.data` (undefined on Zod
  failure) to the service**.

### `src/app/api/dashboard/chat/sessions/[id]/route.ts`

- `PATCH` body: same `parsedBody.data` undefined-pass quirk.

### Auth model

- `auth()` from `@/lib/auth` (NextAuth v5 Credentials provider).
- Session shape: `{ user: { id, email, name, role } }`.
- **No org-membership check** anywhere in this layer.
- **No role check** (USER vs ADMIN are equivalent here).
- Authorization is `userId === DashboardSession.userId` ownership only.
- **Rescan N-6**: `createDashboardChatSession` doesn't validate
  `assistantId` belongs to caller's org.

---

## 6. S3 layer (`src/lib/s3/index.ts`, 508 LoC)

| Lines | Symbol |
|-------|--------|
| 107 | `S3Paths.artifact(orgId, sessionId, artifactId, ext)` → `artifacts/${orgId || "global"}/${sessionId}/${artifactId}${ext}` |
| 116 | `getArtifactExtension(type)` → `getArtifactRegistryEntry(type)?.extension ?? ".txt"` |
| 133 | `uploadFile(key, buffer, contentType, metadata?)` — `PutObjectCommand` + presigned URL generation; **rescan N-45: presigned URL generated but discarded by every artifact-write caller** |
| 261 | `deleteFile(key)` — single `DeleteObjectCommand` |
| 275 | `deleteFiles(keys)` — chunked `DeleteObjectsCommand` (1000-batch); **rescan N-46: per-object `Errors[]` ignored** |

Versioned key format: `<canonicalKey>.v<N>` — produces keys with two
extensions (e.g. `.html.v1`), unusual but harmless.

---

## 7. Prisma schema (artifact-relevant)

`prisma/schema.prisma`:

```prisma
model Document {
  id             String          @id @default(cuid())
  title          String
  content        String                              // ⚠ no @db.Text (DashboardMessage.content has it)
  categories     String[]
  metadata       Json?
  s3Key          String?
  fileType       String?
  fileSize       Int?
  mimeType       String?
  organizationId String?
  organization   Organization?   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy      String?                             // ⚠ no FK to User (rescan N-44)
  sessionId      String?
  session        DashboardSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  artifactType   String?                             // null = file upload; non-null = artifact
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt          // ⚡ optimistic-lock token
  @@index([organizationId])
  @@index([s3Key])
  @@index([sessionId])
}

model DashboardSession {
  id             String              @id @default(cuid())
  userId         String                                 // ⚠ no FK to User
  title          String              @default("New Chat")
  assistantId    String                                 // ⚠ not validated against org membership
  messages       DashboardMessage[]
  artifacts      Document[]
  organizationId String?
  organization   Organization?       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  @@index([userId])
  @@index([assistantId])
  @@index([organizationId])
}

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

`Document.session` uses `onDelete: SetNull` — when a session is deleted,
artifact-type Documents are explicitly deleted by `deleteArtifactsBySessionId`
**before** the session row is removed, so the SetNull cascade never fires
for artifacts. If `deleteArtifactsBySessionId` throws, the SetNull cascade
runs for any survivors (rescan **N-48**).

---

## 8. Renderers (lazy-loaded)

### `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (139 LoC)

| Lines | What |
|-------|------|
| 9–77 | `next/dynamic` lazy imports for every renderer (no `ssr: false` set explicitly — implicit via `"use client"` tree) |
| 79–86 | `RendererLoading` skeleton |
| 96–138 | **`ArtifactRenderer` switch** — exhaustive over `ArtifactType` |
| 116–129 | `application/code` reuses `StreamdownContent` with fence longer than longest backtick run inside content |
| 130–131 | `text/markdown` reuses `StreamdownContent` |
| 132–133 | `text/document` → `DocumentRenderer` |

### Per-renderer locations

| File | LoC | Highlights |
|------|-----|-----------|
| `renderers/html-renderer.tsx` | 135 | `srcDoc` iframe, `sandbox="allow-scripts allow-modals"`; auto-injects Tailwind + Inter; nav-blocker shim; slow-load detector at 5s |
| `renderers/react-renderer.tsx` | 595 | `srcDoc` iframe, `sandbox="allow-scripts"`; Babel-standalone in iframe; postMessage error→host with **origin guard** at line 459 |
| `renderers/svg-renderer.tsx` | 91 | inline `dangerouslySetInnerHTML`; DOMPurify with `USE_PROFILES: { svg: true, svgFilters: true }`, `ADD_TAGS: ["use"]` |
| `renderers/mermaid-renderer.tsx` | 171 | inline; module-level `mermaidPromise` + `lastInitTheme` singleton (lines 21–22); `securityLevel: "strict"`; **rescan N-54: separate init path from document-renderer** |
| `renderers/mermaid-config.ts` | (small) | `getMermaidConfig()` — used only by `mermaid-renderer.tsx` |
| `renderers/sheet-renderer.tsx` | 276 | dispatches via `detectShape(content)` to CSV table or `sheet-spec-view.tsx`; **rescan: state not reset on content change** |
| `renderers/sheet-spec-view.tsx` | 249 | `lazy()`-imports `evaluateWorkbook` inside `useEffect` |
| `renderers/latex-renderer.tsx` | 522 | KaTeX with **`trust: true`** (rescan **N-30**); `readBracedArg` balanced-brace scanner |
| `renderers/slides-renderer.tsx` | 151 | iframe `srcDoc` with **`sandbox="allow-scripts allow-same-origin"`** (rescan **N-28**); origin-guarded postMessage at line 45; **rescan N-9: keyboard handler global at window** at lines 66–78 |
| `renderers/python-renderer.tsx` | 307 | Web Worker (Pyodide v0.27.6); reused across runs, terminated on stop |
| `renderers/r3f-renderer.tsx` | 621 | iframe `srcDoc` with **NO sandbox** (rescan **N-29**); `sceneSig`-keyed remount; **rescan N-27: NO postMessage origin guard at lines 531–551**; 20s `r3f-ready` timeout |
| `renderers/document-renderer.tsx` | 622 | inline AST render; per-render `newFootnoteSink()` at line 406; `MermaidPreviewBlock` at lines 509–570 uses `getMermaidInitOptions(themeKey)` from `lib/rendering/mermaid-theme.ts` (rescan **N-54**: divergent from mermaid-renderer.tsx) |
| `renderers/_iframe-nav-blocker.ts` | (small) | shim injected into HTML iframe `srcDoc`s |

---

## 9. Panel chrome

### `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` (985 LoC)

| Lines | What |
|-------|------|
| 91 | `const [exportError, setExportError] = useState<string | null>(null)` |
| 113–119 | Edit-content effect — **rescan N-32: silently discards unsaved edits when LLM updates artifact** |
| 121–124 | `viewingVersionIdx` reset on `artifact.version` change |
| 127–129 | Tab-switch effect resets `isEditing` |
| 220–226, 277–285 | **Historical version content guards** — show "version content unavailable" when content blob is missing |
| 256–320 | **Split-button download for `text/document`** — `.md` (raw AST) vs `.docx` (rendered) |
| 413–435 | `handleRestoreVersion` — **rescan N-33: optimistic; failure only `console.error`** |
| 452–463 | `handleDelete` — **rescan N-34: ignores response status** |
| 587–647 | Download button logic — split-button for `text/document`, single button for others |
| 626–629 | `DocumentExportError` card render |
| 717–730 | **Inline `exportError` banner for non-document types** |
| 736 | Tab bar hidden when `isCodeOnly` or `isTextDocument` |
| 738–766 | Tab bar buttons — **rescan: not `role="tab"`/`aria-selected`** |
| 781–790 | Edit textarea — **rescan: no `aria-label`** |
| 861–877 | Fullscreen via `createPortal(JSX, document.body)` |
| 943–956 | `getExtension` — derives `.xlsx` for v1 sheet specs (registry says `.csv`) |

---

## 10. Chat-workspace integration

### `src/features/conversations/components/chat/chat-workspace.tsx`

| Lines | What |
|-------|------|
| 974 | `const [error, setError] = useState<{ … } | null>(null)` |
| 1030 | `const [canvasMode, setCanvasMode] = useState<CanvasMode>(false)` |
| 1105 | `removeArtifact` from `useArtifacts` |
| 1128–1138 | Dispatches `"artifact-panel-changed"` custom event on `activeArtifactId` change |
| 1613–1661 | `SessionToolbarStateSnapshot` hydration on `apiSessionId` / `session.id` change |
| 1663–1691 | Persists snapshot (incl. `canvasMode`) to sessionStorage under `chat-toolbar-state:${sessionId}` |
| 1943 | `resolvedCanvasMode = toolOverrides?.canvasMode ?? canvasMode` |
| 2045 | `...(resolvedCanvasMode && { canvasMode: resolvedCanvasMode })` — `false` is omitted from POST body |
| 2144–2163 | **`tool-input-available` handler** for streaming placeholders |
| 2151–2156 | `create_artifact` streaming: id = `streaming-${toolCallId}` |
| 2157–2163 | `update_artifact` streaming: id = real artifact id (rescan **N-2** entry point) |
| 2173–2204 | **`tool-output-available` handler** for `create_artifact` |
| 2177 | `removeArtifact("streaming-${toolCallId}")` on tool error |
| 2192 | Same on malformed/missing-output |
| 2207–2234 | `update_artifact` tool-output-available handler |
| 2210 | **`if (out.id && out.content && out.updated)`** — rescan **N-3: silently discards if `existing` not in map** |
| 2228–2232 | Update error path — only `console.warn`s (rescan **N-2**) |
| 2411–2451 | Catch block — rescan **N-4: doesn't clean up `streaming-` placeholders on abort** |
| 2567–2570 | `handleStop()` — same gap |
| 2668–2685 | `handleFixWithAI` — `useCallback` deps `[sendMessage, chat.messages]` |

### `src/features/conversations/components/chat/chat-input-toolbar.tsx`

| Lines | What |
|-------|------|
| 54 | `export type CanvasMode = false | "auto" | ArtifactType` |

---

## 11. RAG indexer

### `src/lib/rag/artifact-indexer.ts` (77 LoC)

| Lines | What |
|-------|------|
| 21–57 | `indexArtifactContent(documentId, title, content, { isUpdate? })` |
| 28–30 | `if (isUpdate) await deleteChunksByDocumentId(documentId)` |
| 32–35 | `chunkDocument(content, title, "ARTIFACT", undefined, { chunkSize: 1000, chunkOverlap: 200 })` |
| 36–39 | Empty-chunks short-circuit → `markRagStatus(documentId, false)` |
| 41 | `chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)` — title prepended to every chunk |
| 42–43 | `generateEmbeddings` + `storeChunks` — **rescan N-49: storeChunks is N sequential SurrealDB inserts** |
| 45 | `markRagStatus(documentId, true)` |
| 49–56 | **catch block** — logs, calls `markRagStatus(documentId, false).catch(() => {})`, **does NOT rethrow** |
| 60–77 | `markRagStatus(documentId, indexed)` — patches `metadata.ragIndexed` without overwriting siblings |

---

## 12. Document AST → DOCX

### `src/lib/document-ast/schema.ts` (376 LoC)

| Lines | What |
|-------|------|
| 9–29 | `DocumentMetaSchema` — title, author, date, pageSize, orientation, margins, font, fontSize |
| 31–39 | `CoverPageSchema` — `logoUrl` deliberately *not* `.url()` (allows `unsplash:keyword`) |
| 45–60 | `InlineNode` discriminated union: text, link, anchor, footnote, lineBreak, pageNumber, tab |
| 60+ | `BlockNode` discriminated union: paragraph, heading, list, table, image, blockquote, codeBlock, horizontalRule, pageBreak, toc, mermaid, chart |
| 350–368 | `DocumentMeta` hand-written TS type — **rescan: drift with Zod (Zod applies `.default()`)** |

Schema accepts but renderer drops:
- `tab.leader: "dot"` (rescan **N-18**)
- `list.startAt` (rescan **N-19**)
- `table.shading: "striped"` (rescan **N-20**)

### `src/lib/document-ast/validate.ts` (213 LoC)

| Lines | What |
|-------|------|
| 17 | `SIZE_BUDGET = 128 * 1024` |
| 19–24 | Whitelist of mermaid diagram types — **rescan N-16: misses xychart-beta, block-beta, kanban** |
| 26–35 | `validateMermaidNode` |
| 67–95 | `walkBlocks` |
| 114–118 | Heading bookmark collection — **rescan N-22: doesn't enforce uniqueness** |
| 117–131 | Anchor → bookmark resolution check |
| 188 | `JSON.stringify(raw)` for size check |

### `src/lib/document-ast/to-docx.ts` (699 LoC)

| Lines | What |
|-------|------|
| 40–44 | `PAGE_SIZES` (letter/a4 in dxa) |
| 46 | `HEADING_SIZES_PT = [20, 16, 14, 12, 12, 12]` |
| 48 | `BULLET_CHARS` (3 levels) |
| 50 | `DEFAULT_MARGIN = 1440` |
| 53–56 | `PLACEHOLDER_PNG` (1×1 transparent fallback) |
| 62–73 | `RenderCtx` + `newRenderCtx()` |
| 75–131 | `renderInline` — runs, hyperlinks, footnotes |
| 121 | `tab` case — **renders all tabs as `\t`** (rescan **N-18**) |
| 133–154 | `fetchImage` — content-type sniff; rejects SVG (`"svg not supported"` redirected to placeholder) |
| 156–188 | `renderImage` — placeholder on fetch fail |
| 190–236 | `renderMermaid` — try/catch around `mermaidToSvg + svgToPng`, marker on failure |
| 238–271 | `renderChart` — **rescan N-24: NO try/catch around `svgToPng`** |
| 277–294 | `HEADING_LEVELS` map + `alignTo` |
| 296–397 | `renderBlocks` / `renderBlock` |
| 372–385 | TOC rendering — **rescan N-21: title rendered TWICE when `node.title` set** |
| 396–398 | `renderList` comment: `// Note: startAt is accepted by the schema but DOCX v1 always begins ordered lists at 1.` |
| 399–438 | `renderList` |
| 440–477 | `renderTable` — **rescan N-20: `node.shading` (table-level) never read; only cell shading consumed** |
| 479–540 | **`renderCoverPage`** — fetches logoUrl, embeds as `ImageRun(160 × 160)` |
| 542–645 | `astToDocx` — orchestration; cover + header + footer + body + footnote post-pass |
| 576–592 | **Footnote table guard** — drops Table blocks, emits italic-grey paragraph: *"[table omitted from footnote — see body for full content]"* (color `6B7280`) |
| 634 | `children: [...coverChildren, ...bodyChildren]` — **single section; no separate cover margins** |
| 646–698 | `buildHeadingStyles` / `buildNumberingConfig` (only 3 bullet/numbered levels — deeper nesting overflows) |

### `src/lib/document-ast/resolve-unsplash.ts` (139 LoC)

| Lines | What |
|-------|------|
| 9 | `import { resolveQueries } from "@/lib/unsplash/resolver"` |
| 14 | `UNSPLASH_PREFIX = "unsplash:"` |
| 16–28 | `isUnsplash` + `extractKeyword` + `fallback` helpers |
| 37–62 | `collectFromBlocks` / `collectFromListItem` — gathers all `unsplash:keyword` strings |
| 64–91 | `replaceInBlocks` / `replaceInListItem` — applies resolved Map back into AST |
| 93–139 | `resolveUnsplashInAst(ast)` — collects, calls `resolveQueries(keywords)` at line 117, replaces |

---

## 13. Mermaid

### `src/lib/rendering/mermaid-theme.ts` (50 LoC)

| Lines | What |
|-------|------|
| 10–19 | `MERMAID_THEME_VARIABLES` (light) |
| 21–30 | `MERMAID_THEME_VARIABLES_DARK` |
| 32–36 | `MERMAID_INIT_OPTIONS` (light default) |
| 43–50 | **`getMermaidInitOptions(theme: "light" | "dark")`** factory |

### `src/lib/rendering/server/mermaid-to-svg.ts` (140 LoC)

| Lines | What |
|-------|------|
| 16 | `import "server-only"` |
| 18 | `import { MERMAID_INIT_OPTIONS } from "../mermaid-theme"` |
| 20–21 | `SHIM_KEYS = ["window", "document", "DOMParser", "navigator"] as const` |
| 23–41 | `Snapshot` + `captureAndAssign` (uses `defineProperty` because some globals are getter-only) |
| 43–51 | `restore` |
| 56 | **`let renderQueue: Promise<unknown> = Promise.resolve()`** — per-process Promise mutex |
| 58–65 | **`mermaidToSvg(code)`** — chains through `renderQueue.then(() => doRender(...))` with `.catch(() => undefined)` to keep the chain alive |
| 67–139 | `doRender` — JSDOM, shim install, mermaid render, finally restore + close |
| 91–116 | jsdom SVG stubs for `getBBox` / `getComputedTextLength` (8 px/char) |
| 127 | `mermaid.initialize({ ...MERMAID_INIT_OPTIONS, securityLevel: "loose" })` (server uses light theme) |
| 131 | `await mermaid.render(id, trimmed, host)` |
| 133–139 | `finally`: restore globals + `dom.window.close()` |

### `src/lib/rendering/client/mermaid-to-png.ts` (34 LoC)

- Uses `MERMAID_INIT_OPTIONS` directly — **rescan N-53: always light theme; `getMermaidInitOptions(theme)` never called on this path**.
- No serialization queue; concurrent `mermaid.initialize` may race on theme.

### `src/lib/rendering/client/svg-to-png.ts` (91 LoC)

| Lines | What |
|-------|------|
| 70–91 | `fetchImageAsBase64` — **rescan N-52: hardcoded deprecated `https://source.unsplash.com/1600x900/?${keyword}` URL** |

---

## 14. Unsplash

### `src/lib/unsplash/resolver.ts` (207 LoC)

| Lines | What |
|-------|------|
| 10 | `UNSPLASH_REGEX = /src=["']unsplash:([^"']+)["']/gi` |
| 13 | `CACHE_DAYS = 30` |
| 18–24 | `normalize(query)` — lowercase, collapse whitespace, slice to 50 chars |
| 29–33 | `fallbackUrl(query)` — `placehold.co/1200x800/...` |
| 39–56 | `resolveHtmlImages(content)` — extracts URLs, dedupes, calls `resolveQueries`, replaces |
| 70–139 | `resolveSlideImages(content)` — JSON walk over `imageUrl`/`backgroundImage`/`quoteImage`/`gallery[].imageUrl` |
| 150–207 | **`resolveQueries(queries)`** — exported, shared cache + parallel-fetch primitive |
| 154–163 | Cache lookup via `prisma.resolvedImage.findMany({ where: { query: { in: queries } } })` |
| 168–179 | Per-query `try/catch` around `searchPhoto` — failure → placeholder, doesn't poison batch |
| 185–198 | **`prisma.resolvedImage.upsert`** — handles concurrent writers on `@unique query` constraint |

### `src/lib/unsplash/index.ts` (61 LoC)

| Lines | What |
|-------|------|
| 11 | `const ENABLED = true` — **rescan N-58: hardcoded; no env binding** |

### `src/lib/unsplash/client.ts` (45 LoC)

`searchPhoto(query)` — REST call to `api.unsplash.com/search/photos`,
returns first result or null.

---

## 15. Spreadsheet

| File | LoC | Highlights |
|------|-----|-----------|
| `lib/spreadsheet/parse.ts` | 204 | `detectShape(content)` returns `"array"` | `"spec"` | `"csv"` (lines 11–29); `parseSpec(json)` validates v1 spec |
| `lib/spreadsheet/formulas.ts` | 274 | `evaluateWorkbook(spec)` returns `Map<string, EvaluatedCell>` keyed `"SheetName!A1"`; **rescan N-50: O(n²) topological sort lines 147–168**; **rescan N-51: `onCell` collapses errors to `REF` lines 183–188** |
| `lib/spreadsheet/generate-xlsx.ts` | 144 | `generateXlsx(spec)` — uses `ExcelJS`; returns `Blob` (browser API) |
| `lib/spreadsheet/styles.ts` | 128 | `formatCellValue` — minimal number-format interpreter |
| `lib/spreadsheet/types.ts` | 88 | `SpreadsheetSpec` + callbacks (`onCell`, `onRange`, `onVariable`) — **the structured-clone obstacle for Priority D Web Worker migration** |

---

## 16. Migration script

### `scripts/migrate-artifact-deprecations.ts` (177 LoC)

| Lines | What |
|-------|------|
| 25 | `import { PrismaClient } from "@prisma/client"` (standalone, not the singleton) |
| 29–34 | argv flags: `--dry-run`, `--slides`, `--markdown` |
| 36 | `MARKDOWN_CAP_BYTES = 128 * 1024` |
| 38–50 | `SlideStats` / `MarkdownStats` types |
| 52–~110 | **`migrateSlides()`** — Pass A, mutating; idempotent |
| 55–60 | Scoped `findMany({ where: { artifactType: "application/slides" } })` |
| 73–79 | Walks `deck.slides[]`, replaces `layout === "image-text"` → `"content"` |
| ~110–~165 | **`auditMarkdown()`** — Pass B, report-only |
| ~165–177 | `main()` — runSlides, runMarkdown, dry-run gating, prisma.$disconnect |

---

## 17. Audit cross-reference

The 23 issues from the original `2026-04-25-artifact-system-audit.md` map
to specific fix locations. All shipped in Priority A/B/C; rescan items
(N-N) below are unshipped backlog from
[`2026-04-25-deepscan-rescan-findings.md`](./2026-04-25-deepscan-rescan-findings.md).

| Audit ID | Status | Fix Location |
|----------|--------|--------------|
| #1 unsplash post-resolve in dispatcher | ✅ Shipped | `_validate-artifact.ts:131-144` |
| #2 update-artifact discards `validation.content` | ✅ Shipped | `update-artifact.ts:132-134` |
| #3 image-text deprecation | ✅ Shipped | `_validate-artifact.ts:336-343` |
| #4 service Unsplash on manual edit | ✅ Shipped | `service.ts:463-478` (via dispatcher) |
| #5 to-docx renderCoverPage logoUrl | ✅ Shipped | `to-docx.ts:479-540` |
| #6 update-artifact canvas-mode lock | ✅ Shipped | `update-artifact.ts:89-107` (rescan **N-7** flags edge: bypass when `existing.artifactType` is null) |
| #7 react setError out of useMemo | ✅ Shipped | `react-renderer.tsx:393-426` |
| #8 indexer fire-and-forget never throws | ✅ Shipped | `artifact-indexer.ts:49-56` |
| #9 footnote sink not memoized | ✅ Shipped | `document-renderer.tsx:406` |
| #10 mermaid theme dark variant | ✅ Shipped | `mermaid-theme.ts:21-50` |
| #11 docx footnote table guard | ✅ Shipped | `to-docx.ts:576-592` |
| #12 react/slides postMessage source guard | ✅ Shipped | `react-renderer.tsx:459`, `slides-renderer.tsx:45` (rescan **N-27**: R3F still missing the same guard) |
| #13 unsplash resolver upsert | ✅ Shipped | `resolver.ts:185-198` |
| #14 unsplash per-query try/catch | ✅ Shipped | `resolver.ts:168-179` |
| #15 mermaid-to-svg renderQueue | ✅ Shipped | `mermaid-to-svg.ts:56-65` |
| #16 markdown strict <script> | ✅ Shipped | `_validate-artifact.ts:1123-1135` |
| #17 markdown 128KB cap on creates | ✅ Shipped | `_validate-artifact.ts:1068, 1082-1089` |
| #18 update-artifact optimistic lock | ✅ Shipped | `update-artifact.ts:201-235` |
| #19 image-text isNew gate | ✅ Shipped | `_validate-artifact.ts:336-343` |
| #20 spreadsheet Web Worker | 🟡 Deferred | Priority D parked |
| #21 service-side optimistic lock | ✅ Shipped | `service.ts:537-558`, `repository.ts:170-196` |
| #22 delete: versioned S3 + RAG cleanup | ✅ Shipped (artifact-level) | `service.ts:619-639` (rescan **N-47**: session-level still leaks versioned keys) |
| #23 update-artifact missing-artifact | ✅ Shipped | `update-artifact.ts:67-82` |
| NEW-1 chat-workspace clear streaming on error | ✅ Shipped | `chat-workspace.tsx:2173-2233` |
| NEW-2 chat-workspace only apply on `out.updated` | ✅ Shipped | `chat-workspace.tsx:2210` (rescan **N-3**: silent drop when `existing` missing) |
| NEW-3 panel exportError state | ✅ Shipped | `artifact-panel.tsx:91, 717-730` |
| NEW-4 panel historical version content guards | ✅ Shipped | `artifact-panel.tsx:220-226, 277-285` |
| NEW-5 panel split-button download | ✅ Shipped | `artifact-panel.tsx:256-320` |
| NEW-6 validateArtifactContent timeout | ✅ Shipped | `_validate-artifact.ts:103-130` |
| NEW-7 document-renderer themed mermaid | ✅ Shipped | `document-renderer.tsx:512-554` |

---

## 18. Test files

| File | Purpose |
|------|---------|
| `tests/unit/validate-artifact.test.ts` | base validator suite (~1660 lines, 12 types) |
| `tests/unit/tools/validate-artifact-timeout.test.ts` | 5s timeout (`__setValidateTimeoutMsForTesting`) |
| `tests/unit/tools/validate-artifact-resolves-unsplash.test.ts` | dispatcher post-Unsplash for HTML and slides |
| `tests/unit/tools/create-artifact-resolve.test.ts` | `finalContent = validation.content` flow |
| `tests/unit/tools/update-artifact.test.ts` | locked update, missing artifact, canvas-mode |
| `tests/unit/rag/artifact-indexer-rethrow.test.ts` | indexer never rethrows |
| `tests/unit/features/conversations/sessions/delete-artifact.test.ts` | versioned S3 + RAG cleanup |
| `tests/unit/react-artifact/directive-parser.test.ts` | `_react-directives.ts` |
| `tests/unit/react-artifact/fixtures.test.ts` | **rescan N-56: missing `await` at line 29 — likely tests Promise objects vacuously** |
