# Artifact System — Architecture Reference

> **Audience:** an engineer who needs to find where something lives in the
> code. Structured as a **file:line audit** — every claim is verified
> against the working tree and points at a specific source location. For
> the system narrative read [`artifacts-deepscan.md`](./artifacts-deepscan.md);
> for per-type capabilities read [`artifacts-capabilities.md`](./artifacts-capabilities.md).
>
> **Last regenerated:** 2026-04-30, post text/document AST cleanup +
> RAG indexer artifactType plumbing + sheet `note` themability, pinned
> to commit `68b9d66`. Replaces all prior versions. Reflects commits
> since the prior `a81c343` cut: `b23e06f` (RAG indexer accepts
> `artifactType`), `b3e6cdf` (sheet `note` themable + `formatCellValue`
> dropped), `f738130` (text/document AST source residue removal),
> `a05f802` (env var + mermaid test cleanup), `6a019db` (Prisma
> `documentFormat` column drop). Line numbers re-verified file-by-file
> against HEAD by five parallel code-explorer agents.
>
> Cross-references to **D-N** items below point at finding numbers in
> [`artifacts-deepscan.md`](./artifacts-deepscan.md).

---

## Module map (top-down)

```
src/
├── features/conversations/
│   ├── components/chat/
│   │   ├── chat-workspace.tsx                       artifact lifecycle host
│   │   ├── streamdown-content.tsx                   shared markdown renderer (own mermaid path)
│   │   └── artifacts/
│   │       ├── registry.ts                          single source of truth (~218 LoC)
│   │       ├── types.ts                             ArtifactType + Artifact + PersistedArtifact (~61 LoC)
│   │       ├── use-artifacts.ts                     React hook (~143 LoC)
│   │       ├── artifact-renderer.tsx                type-switch dispatcher (~129 LoC)
│   │       ├── artifact-panel.tsx                   panel chrome (post-overhaul, ~841 LoC)
│   │       ├── artifact-indicator.tsx               chat-bubble pill
│   │       └── renderers/                           per-type previews (lazy)
│   │           ├── document-script-renderer.tsx     PNG carousel for text/document
│   │           ├── html-renderer.tsx
│   │           ├── _iframe-nav-blocker.ts           shared (html + react)
│   │           ├── latex-renderer.tsx
│   │           ├── mermaid-config.ts                shared init options
│   │           ├── mermaid-renderer.tsx
│   │           ├── python-renderer.tsx              Pyodide in Web Worker
│   │           ├── r3f-renderer.tsx                 React Three Fiber (no sandbox)
│   │           ├── _react-directives.ts             @aesthetic / @fonts parser
│   │           ├── react-renderer.tsx
│   │           ├── sheet-chart-view.tsx             Recharts dispatch
│   │           ├── sheet-formula-bar.tsx            Excel-style top bar
│   │           ├── sheet-renderer.tsx               detectShape gate
│   │           ├── sheet-spec-view.tsx              SpecWorkbookView (Excel chrome)
│   │           ├── slides-renderer.tsx              iframe-based deck
│   │           └── svg-renderer.tsx                 DOMPurify inline render
│   └── sessions/
│       ├── service.ts                               chat-session API service
│       ├── repository.ts                            Prisma query layer
│       └── schema.ts                                Zod request schemas
├── lib/
│   ├── tools/builtin/
│   │   ├── create-artifact.ts                       LLM tool: create (189 LoC)
│   │   ├── update-artifact.ts                       LLM tool: update (285 LoC)
│   │   └── _validate-artifact.ts                    dispatcher + 12 validators (2034 LoC)
│   ├── prompts/artifacts/                           per-type LLM rules
│   │   ├── index.ts
│   │   ├── context.ts                               shared context block + VISUAL_ARTIFACT_TYPES
│   │   └── {code,document,html,latex,markdown,mermaid,python,r3f,react,sheet,slides,svg}.ts
│   ├── document-script/
│   │   ├── validator.ts                             validateScriptArtifact (TS + sandbox + magic-byte; single flat file, 41 LoC)
│   │   ├── sandbox-runner.ts                        OS child-process sandbox (98 LoC)
│   │   ├── sandbox-loader.mjs                       ESM loader hook (26 LoC)
│   │   ├── sandbox-wrapper.mjs                      globalThis shadows (43 LoC)
│   │   ├── llm-rewrite.ts                           edit-document rewriter (48 LoC)
│   │   ├── cache.ts                                 S3-backed PNG cache (45 LoC)
│   │   ├── extract-text.ts                          pandoc DOCX→plain (44 LoC)
│   │   └── metrics.ts                               9 in-process counters (47 LoC)
│   ├── rendering/
│   │   ├── chart-to-svg.ts                          chart block → SVG (light theme only)
│   │   ├── mermaid-theme.ts                         export-layer mermaid theme keys
│   │   ├── mermaid-types.ts                         shared 25-entry diagram-type list (validator + slides)
│   │   ├── resize-svg.ts                            isomorphic SVG resize
│   │   ├── client/                                  browser-side helpers (svg-to-png, mermaid-to-png)
│   │   └── server/                                  docx-preview-pipeline, soffice/pdftoppm shells
│   ├── unsplash/
│   │   ├── client.ts                                searchPhoto via REST
│   │   ├── resolver.ts                              resolveImages / resolveSlideImages / resolveQueries
│   │   └── index.ts                                 re-exports
│   ├── spreadsheet/
│   │   ├── csv.ts                                   shared tokenizeCsv (post `02e24a6` dedup)
│   │   ├── parse.ts                                 detectShape + parseSpec
│   │   ├── formulas.ts                              evaluateWorkbook
│   │   ├── chart-data.ts                            resolveChartData (chart spec → rows/series)
│   │   └── types.ts                                 SpreadsheetSpec
│   ├── slides/types.ts                              SlideData / ChartData
│   ├── rag/
│   │   ├── artifact-indexer.ts                      fire-and-forget indexer
│   │   ├── chunker.ts                               chunkDocument
│   │   ├── vector-store.ts                          deleteChunksByDocumentId, storeChunks
│   │   └── embeddings.ts                            generateEmbeddings (BATCH_SIZE=128, EMBED_CONCURRENCY=4)
│   └── s3/index.ts                                  S3Paths, uploadFile, deleteFile, deleteFiles
└── app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/
    ├── route.ts                                     PUT/DELETE
    ├── download/route.ts                            GET (text/document only; .docx only — no PDF)
    ├── edit-document/route.ts                       POST (text/document script rewrite)
    ├── render-status/route.ts                       GET hash + pageCount
    └── render-pages/[contentHash]/[pageIndex]/route.ts  GET PNG bytes
```

Files **removed since the prior `8b6e69b` cut**: `lib/document-ast/{schema,
validate,to-docx,resolve-unsplash}.ts` plus the `examples/` folder
(`a81c343`); `renderers/document-renderer.tsx`,
`artifacts/edit-document-modal.tsx`, `lib/rendering/server/mermaid-to-svg.ts`
(`a81c343` + `0b25e56`).

---

## 1. Registry — `registry.ts`

All claims verified against `src/features/conversations/components/chat/artifacts/registry.ts`.

| Surface | Location |
|---|---|
| `ARTIFACT_REGISTRY` array (12 entries) | L62-L186 |
| `ARTIFACT_TYPES` (readonly tuple) | L187 |
| `VALID_ARTIFACT_TYPES` (`ReadonlySet`) | L189 |
| `BY_TYPE` (private `Map`) | L191 |
| `getArtifactRegistryEntry(type)` | uses `BY_TYPE` |
| `TYPE_ICONS` / `TYPE_LABELS` / `TYPE_SHORT_LABELS` / `TYPE_COLORS` | L202-L218 |

Per-entry fields: `type, label, shortLabel, color, icon, extension,
hasCodeTab, codeLanguage`. `hasCodeTab: false` only for `text/document`
and `application/code`.

`types.ts` re-exports `ArtifactType`, `VALID_ARTIFACT_TYPES`,
`ARTIFACT_TYPES`. Adds:

| Name | Location |
|---|---|
| `isValidArtifactType(value)` type guard | types.ts L17-L19 |
| `ArtifactVersion` shape | types.ts L21-L25 |
| `Artifact` (client) — `evictedVersionCount?`, `ragIndexed?`. **No `documentFormat` field** post `a81c343`. | types.ts L27-L47 |
| `PersistedArtifact` — `metadata?: { artifactLanguage?, versions?, evictedVersionCount?, ragIndexed? }`. Same — no `documentFormat`. | types.ts L50-L61 |

---

## 2. Validation dispatcher — `_validate-artifact.ts`

`src/lib/tools/builtin/_validate-artifact.ts` (**2034 LoC** post
`a81c343`/`a05f802`).

| Surface | Location |
|---|---|
| `ValidationContext` interface (`isNew?` only — `documentFormat` removed) | L68-L70 |
| `VALIDATORS` map (12 entries, exhaustive) | L72-L91 |
| `DEFAULT_VALIDATE_TIMEOUT_MS = 5_000` | L106 |
| `getValidateTimeoutMs()` + `__setValidateTimeoutMsForTesting` | L116-L125 |
| `validateArtifactContent` entry | L127-L163 |
| 5-second `Promise.race` timeout, `.unref?.()` | L134-L148 |
| Post-validation Unsplash for HTML | L154-L157 |
| Post-validation Unsplash for slides | L158-L161 |
| `formatValidationError(type, result)` | L2027-L2033 |
| Shared mermaid types import | L31 (`MERMAID_DIAGRAM_TYPES_SHARED` from `@/lib/rendering/mermaid-types`) |

The previous "script-document early branch" is gone —
`validateDocument` lives inside the `VALIDATORS` map and dynamic-imports
`validateScriptArtifact` itself.

Per-validator entry points with verified line ranges (HEAD `68b9d66`):

| Type | Validator export | Body range |
|---|---|---|
| `text/document` | `validateDocument` | **L169-L173** — thin async wrapper: `dynamic-import("@/lib/document-script/validator").validateScriptArtifact(content)`. Returns `{ ok, errors, warnings: [] }`. **Signature has no `ctx` parameter** — only entry in `VALIDATORS` whose shape is `(content) => ...` rather than `(content, ctx?) => ...` (D-46). |
| `application/slides` | `validateSlides` | L209-L618. Constants L183-L207: `SLIDE_LAYOUTS` Set (**18 entries**, L183-L203), `MAX_SLIDE_BULLETS=6` (L204), `MAX_BULLET_WORDS=10` (L205), `MIN_DECK_SLIDES=7` (L206), `MAX_DECK_SLIDES=12` (L207). The `image-text` deprecation is the only `ctx`-gated check (L333-L340). No primaryColor/secondaryColor hex whitelist (D-40). first=title (L604-609 warning), last=closing (L610-615 warning), deck size (L581-589 warning). |
| `application/3d` | `validate3d` | L670-L767. `R3F_ALLOWED_DEPS` Set L629-L668 (**34 entries** verified). The previously-claimed "header comment claims 36" is no longer in code at HEAD; the section comment block at L622-L628 describes behaviour without a count. The off-by-N drift is now between the prompt header `r3f.ts:44` ("20 helpers listed below") and the actual 19-row drei table (D-78). |
| `application/sheet` | `validateSheet` | L779-L1003. 3-branch dispatch (CSV / JSON array / spec). Spec branch calls `parseSpec` + `evaluateWorkbook`. CSV branch imports `tokenizeCsv` from `@/lib/spreadsheet/csv` (post `02e24a6`); the inline duplicate is gone. |
| `text/markdown` | `validateMarkdown` | L1012-L1129. `MARKDOWN_NEW_CAP_BYTES = 128 * 1024` (L1010). **Size cap gated on `ctx?.isNew` only** (L1024). `<script>` env-gate via `ARTIFACT_STRICT_MARKDOWN_VALIDATION` (warning by default, hard error when `"true"`). `RAW_HTML_DISALLOWED` **10 entries** L1086-L1097: `["details","summary","kbd","mark","iframe","video","audio","object","embed","table"]`. |
| `text/latex` | `validateLatex` | L1163-L1230. `LATEX_UNSUPPORTED_COMMANDS` ~14 entries L1142-L1161. |
| `application/code` | `validateCode` | L1253-L1307. `CODE_TRUNCATION_MARKERS` ~10 patterns L1240-L1251. HTML doc detection. **`language` parameter never inspected** (D-18) — function signature is `validateCode(content)` with no second arg. |
| `application/mermaid` | `validateMermaid` | L1323-L1419. Alias `const MERMAID_DIAGRAM_TYPES = MERMAID_DIAGRAM_TYPES_SHARED` at L1321 (single-source-of-truth array of **25 entries** in `lib/rendering/mermaid-types.ts:14-40`). >15-node heuristic only fires for flowchart/graph. **Stale prose at L1384** hardcodes a 19-type list — D-77. |
| `image/svg+xml` | `validateSvg` | L1433-L1570. **`<style>` block = error** (D-42, L1553-L1557). Precision regex `/\d\.\d{3,}/` (3+ dp) — drift vs prompt's "1 dp max" (D-17). Color count `> 5` → warning. |
| `text/html` | `validateHtml` | L1576-L1682. `MAX_INLINE_STYLE_LINES = 10` (L51, warning at L1675-L1679, not error — D-43). `<form action>` → error. |
| `application/react` | `validateReact` | L1761-L1912. Helpers + `KNOWN_SERIF_FAMILIES` + `PALETTE_MISMATCH_THRESHOLD = 6` (L1689-L1700). **`ARTIFACT_REACT_AESTHETIC_REQUIRED` default = true when env absent** (`!== "false"`). |
| `application/python` | `validatePython` | L1940-L2021. `PYTHON_UNAVAILABLE_PACKAGES` L1922-L1938 (**15 entries**). **`open()` write-mode regex** L1993: `/\bopen\s*\([^)]*,\s*['"][wax]b?\+?['"]/m` — read-mode passes silently (D-16). `time.sleep > 2s` heuristic. `while True` heuristic. |

---

## 3. LLM tool — `create-artifact.ts`

`src/lib/tools/builtin/create-artifact.ts` (189 LoC).

| Step | Location |
|---|---|
| `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` | L16 |
| `createArtifactTool` export + `execute` | L18 / L41 |
| ID generation (`crypto.randomUUID()`) | L42 |
| Content size cap guard | L49-L60 |
| Canvas-mode type-enforcement guard | L67-L85 |
| `application/code` language guard | L89-L101 |
| `validateArtifactContent(type, content, { isNew: true })` | L106-L108 |
| `finalContent = validation.content ?? content` | L126 |
| S3 upload (`S3Paths.artifact`, `uploadFile`) | L131-L145 |
| Prisma create (no `documentFormat` field — column dropped) | L147-L168 |
| Background `indexArtifactContent(id, title, finalContent, { artifactType: type })` | L170 |
| Persistence-error swallow path (`persisted = false`) | post-create |
| Return shape (incl. `warnings?`) | L179-L188 |

Constants:
- `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` — L16

The earlier `ARTIFACT_DOC_FORMAT_DEFAULT` env switch and the
`DOC_FORMAT = "script"` constant were both removed; the column itself
was dropped by migration `20260429100656_drop_document_format` (`6a019db`).
**Post `b23e06f`**, the indexer call passes `{ artifactType: type }` so
`resolveTextToEmbed` skips its `findUnique` fast path.

---

## 4. LLM tool — `update-artifact.ts`

`src/lib/tools/builtin/update-artifact.ts` (285 LoC).

| Step | Location |
|---|---|
| `MAX_VERSION_HISTORY = 20` | L13 |
| `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` | L16 |
| `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` | L25 |
| `updateArtifactTool` export + `execute` | L27 / L45 |
| Size check (early return) | L51-L65 |
| `prisma.document.findUnique` | L73 |
| Not-found guard (`"Artifact … not found. Call create_artifact instead"`) | L78-L87 |
| Canvas-mode mismatch guard against `existing.artifactType` | L95-L113 |
| `validateArtifactContent(existing.artifactType, content)` (no `isNew`) | L118-L121 |
| `finalContent = validation.content ?? content` | L141-L143 |
| Read existing versions, compute `versionNum = versions.length + 1` | L150-L157 |
| Upload prior content to `${existing.s3Key}.v${versionNum}` | L161-L170 |
| Inline fallback decision (≤ 32 KiB inline, > 32 KiB marker) | L176-L190 |
| Push version record into `versions` array | L184-L191 |
| FIFO eviction (>20 entries) | L195-L199 |
| New content S3 overwrite (`existing.s3Key`) | L202-L208 |
| Optimistic lock `prisma.document.updateMany` (`where: { id, updatedAt }`) | L215-L230 |
| Concurrent-write guard ("Concurrent update detected: another writer modified this artifact between read and write. Re-fetch the artifact and retry the update.") | L232-L244 |
| Background `indexArtifactContent(id, title, finalContent, { isUpdate: true, artifactType: existing.artifactType })` | L247-L250 |
| Persistence-failure return (`updated: false, persisted: false`) | L262-L271 |
| Success return | L273-L282 |

---

## 5. Sessions service — `service.ts` + `repository.ts`

`src/features/conversations/sessions/service.ts` (701 LoC).

| Surface | Location |
|---|---|
| `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` | L471 |
| `MAX_VERSION_HISTORY = 20` | L473 |
| `updateDashboardChatSessionArtifact` | L475 |
| Content-required guard (400) | L482 |
| Session ownership (`findDashboardSessionBasicByIdAndUser`) | L489-L492 |
| Artifact existence (`findDashboardArtifactByIdAndSession`) | L494-L497 |
| `validateArtifactContent(existing.artifactType, String(content))` — no third arg (D-1 closed) | L509-L511 |
| 422 on validation failure | L513-L517 |
| `finalContent = validation.content ?? content` | L519-L521 |
| Versioning + FIFO eviction (mirrors LLM update) | L523-L571 |
| `updateDashboardArtifactByIdLocked(artifactId, existing.updatedAt, ...)` | L581-L594 |
| Concurrent-write 409 ("Concurrent update detected: another writer changed this artifact while you were editing. Reload to see the latest version, then retry your save.") — distinct wording from LLM tool path (D-70) | L596-L602 |
| Background `indexArtifactContent(updated.id, ..., { isUpdate: true, artifactType: existing.artifactType })` — fixes N-1 | L610-L613 |
| `getDashboardChatSessionArtifact` (coerces `null` artifactType to `""`, D-74) | L626 / L645 |
| `deleteDashboardChatSessionArtifact` | L653 |
| Canonical S3 delete | L668-L674 |
| Versioned S3 keys cleanup | L676-L691 |
| RAG chunks delete | L693-L696 |
| DB row delete | L698 |
| `deleteDashboardChatSession` (session-delete cascade) | L286-L336 |
| S3 + versioned keys bulk delete in cascade | L300-L316 |
| Per-artifact RAG cleanup `Promise.allSettled` | L319-L323 |
| Cascade Prisma transaction | L329-L334 |

`src/features/conversations/sessions/repository.ts` (237 LoC).

| Surface | Location |
|---|---|
| `findDashboardArtifactByIdAndSession` (`where: { id, sessionId, artifactType: { not: null } }`) | L173-L180 |
| `updateDashboardArtifactByIdLocked` (returns `null` on count 0) | L193-L212 |
| `deleteDashboardArtifactById` | L214-L218 |
| `findArtifactsBySessionId` — selects `id, s3Key, metadata` (the `metadata` selection enables N-47 cascade) | L220-L230 |
| `deleteArtifactsBySessionId` — **dead code** (D-75); service inlines its own cascade transaction | L232-L236 |

---

## 6. API routes

All under `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/`.

| Route | File | Method | Notes |
|---|---|---|---|
| Update / Delete | `route.ts` (82 LoC) | PUT, DELETE | Auth → params → body → service. **No GET handler (D-9)**. |
| Document download | `download/route.ts` (79 LoC) | GET | `?format=docx` (default). Calls `runScriptInSandbox` → `.docx` bytes. **Any other `format` value returns 400 `Unsupported format: <x>` (D-3)** — no PDF path. |
| Edit document | `edit-document/route.ts` (93 LoC) | POST | Rate limit token bucket (`buckets` Map L18, `RATE_LIMIT=10` L16, `RATE_WINDOW_MS=60_000` L17 — **in-process only — D-4**). Guards `artifactType === "text/document"`. Calls `llmRewriteWithRetry` then `updateDashboardChatSessionArtifact`. **Skips Zod schema validation on params** (D-71). |
| Render status | `render-status/route.ts` (32 LoC) | GET | `text/document` only. `renderArtifactPreview(artifactId, content)` → `{ hash, pageCount, cached }`. |
| Render pages | `render-pages/[contentHash]/[pageIndex]/route.ts` (28 LoC) | GET | `getCachedPngs(...)`. PNG bytes with `Cache-Control: public, max-age=31536000, immutable`. Returns 404 on miss — **never triggers a re-render** (D-35). **Bypasses session-ownership check** — only auth + content-hash (D-72). |

---

## 7. Renderers (audit by file)

### `artifact-renderer.tsx` (129 LoC)

| Surface | Location |
|---|---|
| Type-switch dispatch | L89-L128 |
| `text/html` → `HtmlRenderer` | L91 |
| `application/react` → `ReactRenderer` | L93 |
| `image/svg+xml` → `SvgRenderer` | L95 |
| `application/mermaid` → `MermaidRenderer` | L97 |
| `application/sheet` → `SheetRenderer` | L99 |
| `text/latex` → `LatexRenderer` | L101 |
| `application/slides` → `SlidesRenderer` | L103 |
| `application/python` → `PythonRenderer` | L105 |
| `application/3d` → `R3FRenderer` | L107 |
| `application/code` → `StreamdownContent` with adaptive fence | L108-L121 |
| `text/markdown` → `StreamdownContent` raw | L123 |
| `text/document` — **no case** (post `a81c343`); falls to `default <pre>`. The panel intercepts above (D-10 closed). | L125-L128 (default branch) |

### `artifact-panel.tsx` (841 LoC)

| Surface | Location |
|---|---|
| Direct `import { Maximize, Minimize } from "lucide-react"` (D-28 relocated to this file) | L18 |
| `text/document + sessionId` → `DocumentScriptRenderer` | L696-L705 |
| `text/document` no-session fallback ("Preview unavailable…") | L706-L708 |
| Other types → `<ArtifactRenderer>` | L710-L713 |
| Default content area (no Preview/Code tabs) — comment | L690-L694 |
| Title (truncated `<h3>`) | L435-L438 |
| Type badge — language suffix only for `application/code` | L439-L447 |
| Version navigator pill (chevrons + counter, hidden when `!hasVersions`) | L451-L482 |
| Tooltip on version pill (surfaces `evictedVersionCount`) | L476-L481 |
| Restore button (visible when `isViewingHistorical && onUpdateArtifact`) | L486-L505 |
| RAG-not-searchable badge (`ragIndexed === false`) | L508-L522 |
| Copy button (Check for 2 s after copy) | L527-L543 |
| Document split-button download (`.md` + `.docx`, no `.pdf`) — DropdownMenu | L545-L590 |
| Single-button download (others) | L591-L605 |
| More menu (Delete) — DropdownMenu | L607-L631 |
| Fullscreen toggle (`Maximize`/`Minimize` from lucide-react direct) | L633-L651 |
| Close button | L653-L668 |
| Export-error banner (gated on `exportError && !isTextDocument`) | L675-L688 |
| `handleDelete` (pessimistic, server-first) | mid |
| `handleRestoreVersion` (`isSaving` guard) | mid |
| `handleDocumentDownload` `.md` path lacks `isExporting` guard (NEW finding) | L249-L265 |

### `use-artifacts.ts` (143 LoC)

| Surface | Location |
|---|---|
| `useArtifacts(sessionKey?)` | L19 |
| `artifacts` Map state | L20 |
| `activeArtifactId` state | L21 |
| Effect: restore active id from sessionStorage | L25-L35 |
| Effect: persist `activeArtifactId` | L38-L50 |
| `addOrUpdateArtifact` (push to previousVersions on existing id; **always sets active id** even for streaming placeholders, D-73 L82) | L52-L83 |
| `removeArtifact` (clears `activeArtifactId` on match) | L85-L92 |
| `closeArtifact` / `openArtifact` | L94-L100 |
| `loadFromPersisted` | L102-L127 |
| `previousVersions` from `metadata.versions` | L113-L117 |
| `evictedVersionCount` from metadata | L118 |
| `ragIndexed` from metadata | L119 |
| (No `documentFormat` hydration — field removed from `Artifact`/`PersistedArtifact`.) | — |

### `chat-workspace.tsx` — artifact-related ranges

| Surface | Location |
|---|---|
| `preStreamSnapshots` + `createdStreamingIds` declarations | mid (around L1940) |
| `tool-input-available` handler | following |
| `tool-output-available` create success (no `documentFormat` propagation any more) | following |
| Create failure ghost cleanup | following |
| Update success | following |
| Update failure restore | following |
| Abort cleanup (D-fixed N-4) | following |
| `AbortError` guard — skip toast | following |
| `handleStop` (3-line minimal) | mid |
| `<ArtifactPanel isStreaming={isStreaming}>` (D-fixed) | render block |

The `documentFormat`-propagation lines that earlier versions of this
table cited at L2195/L2237-L2239/L2285-L2288 were removed with
`a81c343`.

### Renderer-by-renderer

#### `html-renderer.tsx`

| Surface | Location |
|---|---|
| `sandbox="allow-scripts allow-modals"` | L128 |
| Nav blocker injection (full doc) | L38 |
| Nav blocker injection (partial wrap) | L60 |
| Tailwind CDN injection | L39 |
| `loading` cleared on `onLoad`, 5s `slowLoad` warning | L71-L89 |
| `restoring` ref to prevent infinite nav-restoration | L99-L107 |

No postMessage listener; no theme sync.

#### `react-renderer.tsx`

| Surface | Location |
|---|---|
| `sandbox="allow-scripts"` (tighter than html) | L588 |
| postMessage origin guard `e.source !== iframeRef.current?.contentWindow` | L454-L467 |
| Origin-guard rationale comment | L456-L459 |
| `setError` in `useEffect` (moved out of `useMemo`) | L414-L427 |
| `processError` `useMemo` (returns plain value) | L394-L410 |
| Window globals (React 18 UMD, ReactDOM, Babel, Recharts, lucide-react, framer-motion) | L261-L270 |
| `window.react = window.React` Recharts peer-dep alias | L267 |
| `preprocessCode` directive parsing | L81 area |
| Directive stripping from lines 0/1 | L83-L91 area |
| Iframe error boundary postMessage | L293-L332 |
| Window `onerror` / `unhandledrejection` | L359-L373 |
| Loading state set/clear | L388, L432 |
| Error skips spinner | L532 |
| Nav blocker injection at body level (srcdoc) | L282 area |

#### `_react-directives.ts`

| Surface | Location |
|---|---|
| `MAX_FONT_FAMILIES = 3` | L54 |
| `FONT_SPEC_REGEX` (rejects URL-injection chars) | L110 |
| `preprocessCode` entry | L81 area |
| Template-literal hiding (avoids false import matches inside strings) | L95-L98 |

#### `svg-renderer.tsx`

| Surface | Location |
|---|---|
| DOMParser pre-validation | L29-L53 |
| Server-side regexp fallback (safe — DOMPurify runs client-side) | L52-L54 |
| DOMPurify `USE_PROFILES: { svg: true, svgFilters: true }`, `ADD_TAGS: ["use"]` | L56-L60 |
| Container scaling (`[&>svg]:max-w-full [&>svg]:h-auto`) | L87 |
| `dangerouslySetInnerHTML` mount | L88 |

No iframe, no theme sync, no loading state (sync useMemo).

#### `mermaid-renderer.tsx` + `mermaid-config.ts`

| Surface | Location |
|---|---|
| `mermaidPromise` module cache | mermaid-renderer.tsx top |
| `getMermaid()` re-init only on theme change | early |
| `useTheme()` from next-themes | mid |
| `resolvedTheme === "dark"` mapping | mid |
| `mermaid.parse({ suppressErrors: true })` | mid |
| Trimmed catch path | mid |
| Retry counter | mid |
| Per-render UUID id | mid |
| Spinner condition | mid |
| `getMermaidConfig(theme)` export | mermaid-config.ts L475 |
| Init options (securityLevel: strict, theme: base, themeVariables) | mermaid-config.ts L475-L499 area |

The earlier `containerRef` (D-22), `lastInitTheme` cache, and
`deterministicIDSeed` (D-23) were removed with `0b25e56` /
`02e24a6` (commit message: "tighten mermaid-config exports").

#### `latex-renderer.tsx`

| Surface | Location |
|---|---|
| `isKatexCommandAllowed` trust callback (`https?://` only) | L18-L23 |
| Balanced-brace scanner (`readBracedArg`) | L54-L78 |
| `\href` HTML emission with `escapeHtml` | L188-L191 |
| `dangerouslySetInnerHTML` mount in `prose dark:prose-invert` | L532 |

No iframe, no MathJax, no macros.

#### `r3f-renderer.tsx` (633 LoC)

| Surface | Location |
|---|---|
| Iframe **without** `sandbox` attribute (WebGL needs GPU) — comment | L580-L581 |
| postMessage origin guard `event.source !== iframeRef.current?.contentWindow` | L544 |
| `didReadyRef` `useRef(false)` (replaces closure-local `let`) | L525 |
| `didReadyRef.current = false` reset on content change | L529-L533 |
| 20 s timeout reads `didReadyRef.current` | L562-L566 |
| Importmap inside srcdoc (esm.sh) | early |
| Babel standalone via unpkg | early |
| Scene code via JSON `<script id="scene-data" type="application/json">` | early |
| Scene parse | mid |
| WebGL error bifurcation (`isWebGLError`) → `WebGLHelpOverlay` | L437-L507 |
| `<color attach="background">` explicitly preserved (D-29 closed at renderer) | L118-L123 (comment in `sanitizeSceneCode`) |

The earlier `setReady`/`ready` dead state (D-21) was removed with
`0b25e56`. Only `didReadyRef` remains.

#### `_iframe-nav-blocker.ts`

| Surface | Location |
|---|---|
| `IFRAME_NAV_BLOCKER_SCRIPT` export | top |
| `window.open` stub with `postMessage: noop` | L16 area |

Blocks: `Location.assign/replace/reload`, `href` setter, direct `window.location` assignment, non-fragment anchor clicks, form submits, `history.pushState/replaceState` to non-empty URLs, `window.open`.

#### `sheet-renderer.tsx`

| Surface | Location |
|---|---|
| `detectShape(content)` from `lib/spreadsheet/parse.ts` | L28-L38 |
| `"spec"` → `React.lazy(SpecWorkbookView)` + Suspense | L43 area |
| `"csv"`/`"array"` → `CsvOrArrayView` | L53-L236 |
| Toolbar (Search + CSV download with `-filtered` suffix) | L53-L236 |
| Error state (amber + raw `<pre>`) | L98-L109, L159-L176 |

#### `sheet-spec-view.tsx`

| Surface | Location |
|---|---|
| State (`activeSheet`, `selectedRef`, `values`, `evalError`, `view`) | L60-L64 |
| `view` reset on content change | L71 |
| Async formula eval (cancellable) | L76-L93 |
| `SheetFormulaBar` mount (always) | L141 |
| **Data/Charts toggle (only when `spec.charts.length > 0`)** | L144-L167 |
| Data view (sticky corner, A/B/C headers, frozen borders, selected outline, `bg-yellow-200/80` highlight, error `#ERR!`) | L169-L289 |
| Column width formula `width * 7 + 16` | L194 |
| Frozen border classes | L237-L241 |
| Bottom sheet tabs | L270-L288 |
| `<SheetChartView />` mount | L292-L294 |
| evalError footer | L296-L299 |
| Comment "XLSX download lives in the panel header, not duplicated here" | L171-L172 |

#### `sheet-formula-bar.tsx`

| Surface | Location |
|---|---|
| 36 px (h-9) bar | L30-L49 |
| Left zone (96 px min, ChevronDown decorative) | L30-L49 |
| Right zone (FunctionSquare + mono span; formulas italicised) | L30-L49 |

#### `sheet-chart-view.tsx`

| Surface | Location |
|---|---|
| `renderChart` switch (bar/line/area/pie) | L63-L124 |
| `BarChart` `stackId="stack"` when `chart.stacked` | within renderChart |
| `LineChart` `type="monotone"`, `strokeWidth={2}` | within renderChart |
| `AreaChart` `fillOpacity={0.4}` | within renderChart |
| **Pie `fillOpacity={1 - i * 0.1}` (D-19)** | L118 |
| `resolveChartData(chart, values)` | L36 area |
| Empty rows → empty-state card | L36-L41 |

#### `slides-renderer.tsx`

| Surface | Location |
|---|---|
| `sandbox="allow-scripts"` only | L116 |
| Sandbox-tightening rationale comment | L109-L116 |
| postMessage source check | L40-L53 |
| Keyboard nav scope guard (`isTextEntryElement`) | L71-L92 |
| Navigation bar (chevrons + counter) | L123-L169 |
| Dot strip when `1 < totalSlides ≤ 20` | L147-L168 |
| Empty state | L94-L100 |

#### `python-renderer.tsx`

| Surface | Location |
|---|---|
| Pyodide v0.27.6 from jsdelivr | L28 |
| Pre-loaded packages (numpy, micropip, matplotlib, scikit-learn) | L52 |
| `plt.show` monkey-patch into `__plot_images__` | L57-L73 (worker source) |
| `__plot_images__` reset per run | L97 |
| Web Worker creation (Blob URL revoked immediately) | L40-L123 |
| **Hardcoded triple-backtick fence (D-27)** | L204-L208 |
| Output panel responsive height | L259 |
| "Fix with AI" error banner | L262-L281 |

#### `document-script-renderer.tsx` (210 LoC)

| Surface | Location |
|---|---|
| Imports `Loader2`, `ChevronLeft`, `ChevronRight` from `@/lib/icons` (no longer direct `lucide-react`) | L3 |
| Props (`sessionId`, `artifactId`, `content`, `isStreaming`) | L11-L16 |
| Streaming branch — `<CodeView>` with subtle opacity + spinner | L96-L108 |
| Fetch effect deps `[sessionId, artifactId, content, isStreaming]` (skips when `isStreaming`) | L35-L61 |
| GET `/render-status` | L35-L61 |
| Image with `key={hash-pageIdx}` (force remount on hash change) | L134 |
| `goPrev` / `goNext` callbacks (clamp on pageIdx) | L63-L67 |
| Keyboard nav (`isTextEntry` guard against text inputs/contentEditable) | L72-L93 |
| Dot strip when `1 < pageCount ≤ 20` | L135 |
| **Error state without retry (D-11)** — plain "Preview unavailable" + error text, no Fix-with-AI | L111-L122 |
| Loading "Rendering preview…" | L124-L132 |
| Success render with `<img>` carousel | L137-L197 |
| `CodeView` subcomponent | L200-L210 |

**D-28 was relocated**: the direct `lucide-react` import that lived
here at the prior cut now sits in `artifact-panel.tsx:18` (`Maximize`,
`Minimize`).

#### `streamdown-content.tsx`

| Surface | Location |
|---|---|
| Streamdown wrapper props (`shikiTheme`, `controls: { code, table, mermaid }`, KaTeX plugins) | L62-L95 |
| `MermaidError` (Retry + Source toggle) | within file |

**Note:** Streamdown's internal mermaid pipeline is a **separate path
that does not use `mermaid-config.ts`** (D-25). No fix in tree.

---

## 8. Prompt modules

`src/lib/prompts/artifacts/` — one file per type plus `index.ts` and
`context.ts`.

| File | LoC | Label | Visual? | Notable line |
|---|---|---|---|---|
| `code.ts` | 317 | "Code" | no | `language` REQUIRED (no validator enforcement — D-18) |
| `context.ts` | 54 | shared context | — | `VISUAL_ARTIFACT_TYPES` Set L47-L53 (5 members: html, react, svg+xml, slides, 3d) |
| `document.ts` | 429 | "Document" | no | Script-only after `a81c343`. Required suffix `Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))` at L419. `examples: []` empty by design (L428). Zero AST residue. |
| `html.ts` | 164 | "HTML Page" | yes | structural rules + Unsplash flow |
| `index.ts` | 49 | — | — | `satisfies` enforces only `type, label, summary, rules` — `examples` not validated at compile time (D-83) |
| `latex.ts` | 213 | "LaTeX / Math" | no | full alignment with `LATEX_UNSUPPORTED_COMMANDS` |
| `markdown.ts` | 249 | "Markdown" | no | **Zero size mention** despite validator's 128 KiB cap (D-15). Zero env vars. |
| `mermaid.ts` | 249 | "Mermaid Diagram" | no | 19 documented vs **25** in shared `mermaid-types.ts` (D-13) — silent acceptance of 6 extras |
| `python.ts` | 191 | "Python Script" | no | **15 forbidden imports** verbatim — matches validator's 15 (no count drift) |
| `r3f.ts` | 280 | "R3F 3D Scene" | yes | **L4 label `"R3F 3D Scene"` differs from registry `"3D Scene"` and `shortLabel "R3F Scene"`** (D-68). L44 claims "20 helpers listed below" — table has 19 rows (D-78). |
| `react.ts` | 435 | "React Component" | yes | `@aesthetic` + `@fonts` directive grammar |
| `sheet.ts` | 263 | "Spreadsheet" | no | three shapes; spec chart types incl. `area` (not in slides validator) |
| `slides.ts` | 591 | "Slides" | yes | 17 active layouts + 1 deprecated (`image-text`); 6 approved primaryColor hexes L40-L47 + 6 secondaryColor hexes L50-L56 |
| `svg.ts` | 150 | "SVG Graphic" | yes | "round to 1 dp max" (validator warns at 3+ dp — D-17) |

**No prompt module references any `ARTIFACT_*` env var.** The
`ARTIFACT_STRICT_MARKDOWN_VALIDATION` env-gate lives only in the
validator (`_validate-artifact.ts`), not in `markdown.ts`.

---

## 9. RAG indexer — `artifact-indexer.ts`

`src/lib/rag/artifact-indexer.ts` (128 LoC).

| Surface | Location |
|---|---|
| `indexArtifactContent(documentId, title, content, options?: { isUpdate?, artifactType? })` — **post `b23e06f`** signature | L25 |
| `await deleteChunksByDocumentId` (when `isUpdate`) | L32-L34 |
| `resolveTextToEmbed(documentId, content, type)` call | L42 |
| `resolveTextToEmbed` body | L79 |
| **Conditional `findUnique` round-trip** — gated on `if (type === undefined)` (D-7 partial close: skipped when caller passes `artifactType`; all 3 current callers do) | L86 / L87-L91 |
| `text/document` branch — `runScriptInSandbox` + `extractDocxText` (D-47) | L96-L103 |
| `chunkDocument(...)` with `chunkSize: 1000, chunkOverlap: 200` | within function |
| `markRagStatus(false)` on zero chunks | within function |
| `generateEmbeddings(chunkTexts)` (`embeddings.ts`: BATCH_SIZE=128 L15, EMBED_CONCURRENCY=4 L16, MAX_RETRIES=3 L13) | within function |
| `storeChunks(documentId, chunks, embeddings)` (concurrency 8 — `STORE_CHUNKS_CONCURRENCY` in `vector-store.ts:513`) | within function |
| `markRagStatus(documentId, true)` (read-then-write — D-2) | L113-L128 |
| Outer-catch exception swallow + `markRagStatus(false).catch(()=>{})` | L61 |

---

## 10. S3 — `s3/index.ts`

`src/lib/s3/index.ts` (528 LoC).

| Surface | Location |
|---|---|
| `S3Paths.artifact(orgId, sessionId, id, ext)` | L107-L108 |
| `getArtifactExtension(type)` (uses `getArtifactRegistryEntry`) | L116-L118 |
| `uploadFile(key, body, contentType)` (returns `url: ""` by default — D-52) | L139 / L158 |
| `uploadStream` (always presigns — inconsistent with `uploadFile` opt-in, D-80) | L170 / L190 |
| `deleteFile(key)` | mid file |
| `deleteFiles(keys[])` (batches ≤ 1000; per-object errors logged but not thrown — D-5) | L282 / L308-L314 |

Canonical key shape: `artifacts/${orgId || "global"}/${sessionId}/${id}${ext}`.
**No `"orphan"` fallback for `sessionId`** (D-69) — the `||` fallback
is only applied to `orgId`. If `sessionId` is null/undefined the
segment becomes `"undefined"` or `""`. Prior docs claimed
`sessionId|"orphan"`; the code does not.

Versioned key shape: `<canonical>.v<N>` where `N = versions.length + 1`.

---

## 11. Document-script subsystem — `lib/document-script/*`

| File | LoC | Purpose |
|---|---|---|
| `sandbox-runner.ts` | 98 | OS-process sandbox (`spawn(process.execPath, ...)`). Spawn args (L41-44): `[--max-old-space-size=${maxHeapMb}, WRAPPER_PATH, scriptPath]`. `NODE_OPTIONS: ""` clears any inherited options (L49). Caps: `DEFAULT_MAX_HEAP_MB = 256` (L22), `DEFAULT_TIMEOUT_MS = 10_000` (L20), `DEFAULT_MAX_OUTPUT = 100 MiB` (L21). **No cgroup/seccomp/namespace.** Inherits full `process.env`. |
| `sandbox-loader.mjs` | 26 | ESM loader hook via `module.register()`. `FORBIDDEN_SPECIFIERS` Set L10-L19 — **14 entries** (incl. `"http2"` and `"node:http2"`). Fires before any module code runs. |
| `sandbox-wrapper.mjs` | 43 | `Object.defineProperty(globalThis, m, { get() { throw … } })` for `FORBIDDEN_MODULES` L8-L14 — **13 entries, missing `http2` and `node:http2`** (D-76 asymmetry vs loader). Blocks `fetch` (L21). **Does NOT block `Function`/`eval`** (L22-L27, with explanatory comment — docx uses function-bind). `register()` for loader hook L36. |
| `validator.ts` | 41 | **Single flat file (NOT a directory).** Two-phase: `quickSyntaxCheck` (TypeScript `createSourceFile` AST parse, L9-L26) → `runScriptInSandbox` with `DRY_RUN_TIMEOUT_MS = 5_000` (L7) and PK magic-byte check `[0x50, 0x4b, 0x03, 0x04]` (L6). `validateScriptArtifact` export L28-L41. |
| `cache.ts` | 45 | `computeContentHash`: SHA-256[:16 hex chars] of script source (D-87). `getCachedPngs` / `putCachedPngs` — **S3-only**, no memory/disk/Redis layer (D-36). Layout: `artifact-preview/{artifactId}/{hash}/manifest.json + page-N.png`. `KEY_PREFIX = "artifact-preview"` L13. |
| `extract-text.ts` | 44 | Receives rendered DOCX `Buffer`, writes temp file, spawns `pandoc -f docx -t plain`. `TIMEOUT_MS = 15_000` (L7). **No fallback if `pandoc` missing** (D-86) — caller in `artifact-indexer.ts:104-106` handles the failure by falling back to raw script source. |
| `llm-rewrite.ts` | 48 | `MAX_RETRIES = 2` (L6 — 3 attempts total). Self-correction prepends prior validator error to `editPrompt` (L22-L48). |
| `metrics.ts` | 47 | **9 in-memory counters** (`Counters` interface L3-L12, `counters` module-level let L21). `metrics()` (L23-L25), `resetMetrics()` (L27-L29 — test-only), `recordSandbox` / `recordRender` / `recordLlmRewrite`. **No external sink** — no Prometheus/StatsD/Datadog. Process-local. (D-38) |
| `types.ts` | 22 | `SandboxOptions`, `SandboxResult`, `ScriptValidationResult`. |

`lib/rendering/server/`:

| File | Purpose |
|---|---|
| `docx-preview-pipeline.ts` | Orchestrates sandbox → soffice → pdftoppm. |
| `docx-to-pdf.ts` | `soffice --headless --convert-to pdf`. 30 s timeout. **Cold-start every call.** |
| `pdf-to-pngs.ts` | `pdftoppm -png -r 120 -l 50`. 30 s timeout. Max 50 pages. |
| `render-queue.ts` | Counting semaphore. `RENDER_CONCURRENCY` env (default 3). **Process-local. No TTL. No single-flight per `(artifactId, hash)`**. |
| `svg-to-png.ts` | sharp PNG encoder used by the chart export path. |

The earlier `mermaid-to-svg.ts` (JSDOM + DOMPurify "loose") was removed
with `a81c343` — its only consumer was the deleted AST `to-docx.ts`.

## 12. `lib/document-ast/*` (removed)

The directory no longer exists. The legacy AST mode for `text/document`
was retired with `a81c343`; the orphan `_mermaid-types.ts` was relocated
to `src/lib/rendering/mermaid-types.ts` (now §14) and the empty directory
was removed. The `text/document` artifact type is now exclusively
served by the script-format pipeline in §11.

Files deleted (~2,032 LoC total): `schema.ts`, `validate.ts`,
`to-docx.ts`, `resolve-unsplash.ts`, and the `examples/{letter,
proposal,report}.ts` example tree.

## 13. `lib/spreadsheet/*`

| File | LoC | Purpose |
|---|---|---|
| `csv.ts` | 47 | **Shared `tokenizeCsv`** (post `02e24a6`). Single source of truth for CSV parsing in both validator and renderer. Closes D-60. |
| `types.ts` | 117 | `SPREADSHEET_CAPS` L6-L13 (8/500/200/64/31/8). `SPREADSHEET_SPEC_VERSION = "spreadsheet/v1"` L1. `XLSX_MIME_TYPE` L3-L4. `DEFAULT_THEME` L61-L68 — **now includes `noteColor: "#666666"` (post `b3e6cdf`, closes D-65)**. `SpreadsheetTheme.noteColor?` L58. |
| `parse.ts` | 241 | `detectShape` L38-L57 (no JSON parse on `"csv"` branch). `parseSpec` L70-L241 (171-line accumulating validator — complexity hotspot). |
| `formulas.ts` | 324 | `evaluateWorkbook` — pure (L48 export). Kahn's O(V+E) topological sort L145-L194. CIRCULAR marking before eval (L190-L194). **No function whitelist** — `fast-formula-parser` handles ~150+ Excel functions. **No array spillover.** Range-type named ranges → `null` silently. |
| `chart-data.ts` | 84 | `RANGE_RE` L19 sheet-qualified only — **does NOT match `$`-absolute refs** (D-79). `resolveChartData` L59 clips to shortest range. Missing series values default to `0` (L73). Cross-sheet refs work. |
| `generate-xlsx.ts` | 151 | ExcelJS v4.4 client-side. Bakes in cached formula results. **Charts NOT emitted** L86-L90 (ExcelJS API limitation, D-64). **`note` style now reads `theme.noteColor` via `hexToArgb` (L138, post `b3e6cdf`)** — D-65 closed end-to-end. |
| `styles.ts` | 81 | `resolveCellStyle` 6 styles (L21). **`formatCellValue` removed by `b3e6cdf`** — file is 81 LoC down from prior 149. **Tailwind classes diverge from theme hex** (D-66) — `note` style now returns `fontColor: t.noteColor` (L54). |
| `format.ts` | 26 | `numfmt` wrapper (`formatNumber` L11). Early-return at L19-L20 makes the catch unreachable for the missing-format case; catch at L23 is still live for malformed format strings (`numfmt` throws) — D-62 narrowed. |
| `cell-classify.ts` | 30 | 6 priority rules. `EXTERNAL_REF` L5 / `SHEET_REF` L6 regexes. **Renderer-only — not used by validator.** |

## 14. `lib/unsplash/*` + `lib/s3/index.ts` + Rendering helpers

| File | LoC | Purpose |
|---|---|---|
| `unsplash/client.ts` | 45 | `searchPhoto(query)` — `per_page=1&orientation=landscape`, `TIMEOUT_MS=5000`. No retry. |
| `unsplash/index.ts` | 66 | Public wrappers. **Kill switch `UNSPLASH_RESOLUTION_DISABLED=true`** (L13). Catch-all → original on throw. |
| `unsplash/resolver.ts` | 206 | `UNSPLASH_REGEX` L10 (matches HTML `src=...` only). `normalize` L18 (lowercase + truncate 50). `fallbackUrl` L29 — never null. `resolveQueries` L149 — Prisma 30-day cache (`CACHE_DAYS = 30` L13), parallel fetch (no rate-limit throttle), per-query catch isolates failures. |
| `s3/index.ts` | 528 | See §10 above for full surface. |
| `rendering/mermaid-theme.ts` | 41 | `MERMAID_THEME_VARIABLES_LIGHT` L6-L15 + `_DARK` L17-L26 and `getMermaidInitOptions(theme)` L33 for the client PPTX path. Comment at L37: "DOCX export path no longer exists — only PPTX uses this module" — correct post `a81c343`. |
| `rendering/mermaid-types.ts` | 43 | **Single source of truth** for diagram-type allow-list. `MERMAID_DIAGRAM_TYPES` L14-L40 — **25 entries**. Imported by validator and slides validator (D-13 closed at the type level). |
| `rendering/chart-to-svg.ts` | 414 | Pure D3. Hardcoded light theme (D-51). Default 600×400. 8-color palette matching mermaid pie colors. |
| `rendering/resize-svg.ts` | 18 | Pure regex rewrite of root `<svg>` tag. Strips existing `width`/`height`/`preserveAspectRatio`, injects new. Isomorphic. |
| `rendering/server/svg-to-png.ts` | 25 | sharp. `fit: "contain"`, white background, lanczos3, flatten alpha, PNG compression 6. |
| `rendering/client/svg-to-png.ts` | 100 | Canvas API, **2× internal scale (HiDPI)**. **Secondary `unsplash:` fallback** L73-L78 if URL slips through. |
| `rendering/client/mermaid-to-png.ts` | 41 | Browser-only mermaid → PNG via `getMermaidInitOptions(theme)`. Returns `null` on error. |

Files **deleted with `a81c343`**: `lib/rendering/server/mermaid-to-svg.ts`
(was the JSDOM + DOMPurify "loose" path; D-49/D-50/D-68/D-69 closed by
its removal).

## 15. RAG (artifact subset) — `lib/rag/`

| File | LoC | Purpose |
|---|---|---|
| `artifact-indexer.ts` | 128 | `indexArtifactContent` post `b23e06f` signature `(documentId, title, content, options?: { isUpdate?, artifactType? })` (L25). `resolveTextToEmbed` L79 — fast path skips `findUnique` when `type !== undefined` (L86); fallback at L87-L91 (D-7 partially closed). For script docs: sandbox + pandoc to embed rendered text (L96-L103, D-47). `markRagStatus` L113-L128 — **read-then-write, NOT atomic** (D-2). |
| `chunker.ts` | 196 | Default `chunkSize=1000`, `chunkOverlap=200`. Separator priority `["\n## ","\n### ","\n#### ","\n\n","\n",". "," "]`. Overlap **prepended** (not appended). `prepareChunkForEmbedding` adds Category/Topic/Section/Context prefix. |
| `embeddings.ts` | 233 | `MAX_RETRIES = 3` (L13), `RETRY_DELAY_MS = 1000` (L14), `BATCH_SIZE = 128` (L15), `EMBED_CONCURRENCY = 4` (L16). All compile-time constants — **no env override** (D-82). Model from `KB_EMBEDDING_MODEL` (default `qwen/qwen3-embedding-8b`). API key `KB_EMBEDDING_API_KEY` or fallback `OPENROUTER_API_KEY`. |
| `vector-store.ts` | 562 | `STORE_CHUNKS_CONCURRENCY = 8` L513. `storeChunks` L515 (batched parallel). **Legacy `storeDocument` L36 (sequential loop L69) used by knowledge upload — D-81 divergence.** Chunk ID: `${documentId}_${i}`. `deleteChunksByDocumentId` L250 single DELETE-WHERE; throws on failure (no swallow). |

## 16. Where the line numbers come from

This document was regenerated by reading every cited file at commit
`68b9d66` (HEAD on `main`, 2026-04-30) via five parallel
code-explorer agents — one per region (validation core, tools+
persistence+API, renderers+panel+state, subsystem libs, registry+
prompts). Each agent reported HEAD line numbers exactly. Line numbers
should be treated as **stable to the line** for that commit; edits
since then may shift them. Run `git log -p <file>` between this
commit and HEAD for a delta when reading older versions of this doc.

The few ranges still marked **"(L… area)" or positional hints
("upper", "mid", "post-find")** are sections where exact lines weren't
the focus of the agent's reporting. Re-grep against the cited file
when you need the precise line; the surface itself still lives where
the row says it does.

**D-N references** point to numbered findings in
[`artifacts-deepscan.md`](./artifacts-deepscan.md) §12. New findings
introduced by this regen are numbered D-67 through D-88.
