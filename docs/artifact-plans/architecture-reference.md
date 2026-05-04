# Artifact System — Architecture Reference

> **Audience:** an engineer who needs to find where something lives in
> the code. Structured as a **file:line audit** — every claim is
> verified against the working tree and points at a specific source
> location. For the system narrative read
> [`artifacts-deepscan.md`](./artifacts-deepscan.md); for per-type
> capabilities read [`artifacts-capabilities.md`](./artifacts-capabilities.md).
>
> **Last regenerated:** 2026-05-04, post Python notebook redesign +
> validator notebook-cell rewrite + 100-finding cleanup pass, pinned
> to commit `78e2b0a`. Replaces all prior versions. Reflects the
> **48 commits** between the previous `68b9d66` cut and HEAD,
> including:
> - **Python artifact redesigned as Jupyter-style notebook**
>   (`78e2b0a` merge of `feature/python-canvas-llm-first`):
>   `python-renderer.tsx` deleted, replaced by a notebook subsystem
>   (`renderers/notebook/*`, `lib/notebook/*`, `lib/workers/*`); the
>   prompt now requires `{ "cells": [...] }` JSON; `validatePython`
>   rewritten end-to-end.
> - **`cleanup/artifact-system` branch (`2e17641`)** closed ~100 D-N
>   findings: `.md` document download dropped, retry button on
>   document-script renderer (D-11), R3F `<color attach="background">`
>   restricted, sandbox `http2` symmetry (D-76), DOCX text cache
>   (D-47), atomic `markRagStatus` (D-2), single-flight DOCX cache
>   for download path (NEW-D-96), Prometheus metrics endpoint with
>   ADMIN gate (NEW-D-97), pdf-to-pngs numeric sort (D-84),
>   `chart-to-svg` theme parameter (D-51), uploadStream and
>   resize-svg removed as dead code, edit-document subsystem deleted.
>
> Cross-references to **D-N** items below point at finding numbers in
> [`artifacts-deepscan.md`](./artifacts-deepscan.md) §12.

---

## Module map (top-down)

```
src/
├── features/conversations/
│   ├── components/chat/
│   │   ├── chat-workspace.tsx                       artifact lifecycle host
│   │   ├── streamdown-content.tsx                   shared markdown renderer (own mermaid path)
│   │   └── artifacts/
│   │       ├── registry.ts                          single source of truth (~219 LoC)
│   │       ├── types.ts                             ArtifactType + Artifact + PersistedArtifact (~62 LoC)
│   │       ├── use-artifacts.ts                     React hook (~151 LoC)
│   │       ├── artifact-renderer.tsx                type-switch dispatcher (~136 LoC)
│   │       ├── artifact-panel.tsx                   panel chrome (~892 LoC)
│   │       ├── artifact-indicator.tsx               chat-bubble pill
│   │       └── renderers/                           per-type previews (lazy)
│   │           ├── document-script-renderer.tsx     PNG carousel for text/document (with retry)
│   │           ├── html-renderer.tsx
│   │           ├── _iframe-nav-blocker.ts           shared (html + react)
│   │           ├── latex-renderer.tsx
│   │           ├── mermaid-config.ts                shared init options
│   │           ├── mermaid-renderer.tsx
│   │           ├── notebook/                        Jupyter-style Python notebook (NEW)
│   │           │   ├── notebook-renderer.tsx        root, parses + dispatches
│   │           │   ├── notebook-toolbar.tsx         Run-all / Interrupt / Restart
│   │           │   ├── cell.tsx                     cell shell (gutter + run + footer)
│   │           │   ├── code-cell-editor.tsx         CodeMirror 6 Python editor
│   │           │   ├── markdown-cell.tsx            click-to-edit markdown
│   │           │   ├── cell-output.tsx              stream/error/display/result rendering
│   │           │   ├── output-pin-overlay.tsx       Pin / View Large hover overlay
│   │           │   ├── use-kernel.ts                worker lifecycle + run queue
│   │           │   └── use-pin-to-chat.ts           sessionStorage pin state
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
│       ├── service.ts                               chat-session API service (~700 LoC)
│       ├── repository.ts                            Prisma query layer (~232 LoC)
│       └── schema.ts                                Zod request schemas
├── lib/
│   ├── tools/builtin/
│   │   ├── create-artifact.ts                       LLM tool: create
│   │   ├── update-artifact.ts                       LLM tool: update
│   │   └── _validate-artifact.ts                    dispatcher + 12 validators (~2160 LoC)
│   ├── prompts/artifacts/                           per-type LLM rules
│   │   ├── index.ts                                 satisfies-typed registry
│   │   ├── context.ts                               shared context block + VISUAL_ARTIFACT_TYPES
│   │   └── {code,document,html,latex,markdown,mermaid,python,r3f,react,sheet,slides,svg}.ts
│   ├── notebook/                                    notebook engine library (NEW)
│   │   ├── types.ts                                 Zod schemas: NotebookContent, Cell, Output
│   │   ├── serialize.ts                             parseNotebookContent / parseNotebookContentStreaming
│   │   ├── percent.ts                               percent-format `.py` export
│   │   ├── ipynb.ts                                 nbformat-4 round-trip
│   │   ├── html-export.ts                           static HTML export
│   │   └── chat-attachment.ts                       collectAutoAttachments helper
│   ├── workers/                                     Web Worker code (NEW)
│   │   ├── python-worker.ts                         Pyodide kernel
│   │   └── python-worker-types.ts                   WorkerRequest / WorkerResponse contracts
│   ├── document-script/
│   │   ├── validator.ts                             validateScriptArtifact (single flat file, 41 LoC)
│   │   ├── sandbox-runner.ts                        OS child-process sandbox (~99 LoC)
│   │   ├── sandbox-loader.mjs                       ESM loader hook
│   │   ├── sandbox-wrapper.mjs                      globalThis shadows (incl. http2 + node:http2)
│   │   ├── cache.ts                                 S3-backed PNG cache, parallel fan-out (~51 LoC)
│   │   ├── docx-cache.ts                            process-local DOCX bytes cache + single-flight (~67 LoC)
│   │   ├── extract-text.ts                          pandoc DOCX→plain text (~60 LoC)
│   │   └── metrics.ts                               6 in-process counters (post-llm_rewrite_* deletion)
│   ├── rendering/
│   │   ├── chart-to-svg.ts                          chart → SVG, themable via options.theme + inferChartTheme(hex) (~485 LoC)
│   │   ├── mermaid-theme.ts                         export-layer mermaid theme keys
│   │   ├── mermaid-types.ts                         shared diagram-type list
│   │   ├── client/                                  browser-side helpers (svg-to-png, mermaid-to-png)
│   │   └── server/                                  docx-preview-pipeline (single-flight via inFlight Map),
│   │                                                soffice + pdftoppm shells, render-queue semaphore
│   ├── unsplash/
│   │   ├── client.ts                                searchPhoto via REST
│   │   ├── resolver.ts                              resolveImages / resolveSlideImages / resolveQueries
│   │   └── index.ts                                 re-exports + UNSPLASH_RESOLUTION_DISABLED kill switch
│   ├── spreadsheet/
│   │   ├── csv.ts                                   shared tokenizeCsv
│   │   ├── parse.ts                                 detectShape + parseSpec
│   │   ├── formulas.ts                              evaluateWorkbook (Kahn's O(V+E))
│   │   ├── chart-data.ts                            resolveChartData (handles $-absolute refs)
│   │   ├── generate-xlsx.ts                         ExcelJS workbook (no chart objects)
│   │   ├── styles.ts                                resolveCellStyle (HTML preview palette)
│   │   ├── format.ts                                numfmt wrapper
│   │   └── types.ts                                 SPREADSHEET_CAPS, SpreadsheetSpec, DEFAULT_THEME
│   ├── slides/types.ts                              SlideData / ChartData
│   ├── rag/
│   │   ├── artifact-indexer.ts                      fire-and-forget indexer (~165 LoC, atomic markRagStatus)
│   │   ├── chunker.ts                               chunkDocument
│   │   ├── vector-store.ts                          deleteChunksByDocumentId, storeChunks
│   │   └── embeddings.ts                            generateEmbeddings (BATCH_SIZE/CONCURRENCY env-overridable)
│   └── s3/index.ts                                  S3Paths, uploadFile, deleteFile, deleteFiles
└── app/api/dashboard/
    ├── chat/sessions/[id]/artifacts/[artifactId]/
    │   ├── route.ts                                 GET/PUT/DELETE (~119 LoC)
    │   ├── download/route.ts                        GET — text/document only, ?format=docx (default) | pdf
    │   ├── render-status/route.ts                   GET hash + pageCount
    │   └── render-pages/[contentHash]/[pageIndex]/route.ts  GET PNG bytes (session-ownership gated)
    └── artifacts/metrics/route.ts                   GET Prometheus exposition (ADMIN-only)
```

**Files removed since the prior `68b9d66` cut:**
- `lib/document-script/llm-rewrite.ts` — the edit-document LLM-rewrite helper (orphan after edit-document route deletion).
- `lib/rendering/resize-svg.ts` — removed as dead code (commit `6c1dd82`).
- `app/api/dashboard/.../edit-document/route.ts` — removed (commit `6c1dd82`).
- `renderers/python-renderer.tsx` — replaced by the notebook subsystem (commit `ee9fdf5`).
- `s3/index.ts uploadStream` — removed (commit `6c1dd82`, zero callers).

**Files added since the prior cut:**
- All of `lib/notebook/*`, `lib/workers/*`, and `renderers/notebook/*`.
- `lib/document-script/docx-cache.ts` — single-flight + FIFO cache for download path.

---

## 1. Registry — `registry.ts`

`src/features/conversations/components/chat/artifacts/registry.ts` (~219 LoC).

| Surface | Location |
|---|---|
| `ARTIFACT_REGISTRY` array (12 entries) | L62-L183 |
| `ARTIFACT_TYPES` (readonly tuple) | L187 |
| `VALID_ARTIFACT_TYPES` (`ReadonlySet`) | L189 |
| `BY_TYPE` (private `Map`) | L191-L193 |
| `getArtifactRegistryEntry(type)` | L196-L200 |
| `TYPE_ICONS` / `TYPE_LABELS` / `TYPE_SHORT_LABELS` / `TYPE_COLORS` | L202-L218 |

Per-entry fields: `type, label, shortLabel, color, icon, extension,
hasCodeTab, codeLanguage`. `hasCodeTab: false` only for `text/document`
and `application/code`.

**Label drift to flag (D-68 residual):** `application/python` is
`label = "Python Script"` in the registry but `label = "Python
Notebook"` in the prompt module (`prompts/artifacts/python.ts`). The
prompt-module label is what surfaces in canvas headers; registry
labels surface in panel chrome and pills. Same root issue as `application/3d`'s
three-string drift (registry `"3D Scene"` / shortLabel `"R3F Scene"` /
prompt `"3D Scene"`).

`types.ts` re-exports `ArtifactType`, `VALID_ARTIFACT_TYPES`,
`ARTIFACT_TYPES`. Adds:

| Name | Location |
|---|---|
| `isValidArtifactType(value)` type guard | types.ts L17-L19 |
| `ArtifactVersion` shape | types.ts L21-L25 |
| `Artifact` (client) — `evictedVersionCount?`, `ragIndexed?`. No `documentFormat`. | types.ts L27-L47 |
| `PersistedArtifact` — `metadata?: { artifactLanguage?, versions?, evictedVersionCount?, ragIndexed? }` | types.ts L50-L61 |

---

## 2. Validation dispatcher — `_validate-artifact.ts`

`src/lib/tools/builtin/_validate-artifact.ts` (~2160 LoC).

| Surface | Location |
|---|---|
| `ValidationContext` interface (`isNew?`, `language?`) | L84-L87 |
| `VALIDATORS` map (12 entries, exhaustive) | L89-L108 |
| `DEFAULT_VALIDATE_TIMEOUT_MS = 5_000` | L123 |
| `__testTimeoutOverride` | L129 |
| `VALIDATE_TIMEOUT_MS` (exported alias) | L133 |
| `getValidateTimeoutMs()` | L134-L136 |
| `__setValidateTimeoutMsForTesting()` | L140-L142 |
| `validateArtifactContent(type, content, ctx?)` entry | L144-L180 |
| Post-validation Unsplash for HTML | within L166-L179 |
| Post-validation Unsplash for slides | within L166-L179 |
| Shared mermaid types import (`MERMAID_DIAGRAM_TYPES_SHARED`) | L31 |

`validateDocument` lives inside the `VALIDATORS` map and dynamic-imports
`validateScriptArtifact` itself.

Per-validator entry points with verified line ranges (HEAD `78e2b0a`):

| Type | Validator export | Body range | Notable constants |
|---|---|---|---|
| `text/document` | `validateDocument` | **L186-L196** | thin async wrapper that dynamic-imports `@/lib/document-script/validator`. Now accepts `_ctx` for shape consistency (D-46 closed). |
| `application/slides` | `validateSlides` | **L263-L697** | `SLIDE_LAYOUTS` Set L206-L226 (18 entries). `MAX_SLIDE_BULLETS=6` L227, `MAX_BULLET_WORDS=10` L228, `MIN_DECK_SLIDES=7` L229, `MAX_DECK_SLIDES=12` L230. `APPROVED_SLIDE_PRIMARY_COLORS` L236-L243, `APPROVED_SLIDE_SECONDARY_COLORS` L247-L254 (6+6 hexes), `normalizeHex()` L256-L261. Hex whitelist hard-errors on `ctx.isNew` (D-40 closed). |
| `application/3d` | `validate3d` | **L749-L846** | `R3F_ALLOWED_DEPS` Set L708-L747 (34 entries). |
| `application/sheet` | `validateSheet` | **L858-L1082** | `ISO_DATE` L852, regex helpers L853-L856. 3-branch dispatch (CSV / JSON array / spec). Spec branch calls `parseSpec` + `evaluateWorkbook`. |
| `text/markdown` | `validateMarkdown` | **L1091-L1208** | `MARKDOWN_NEW_CAP_BYTES = 128 * 1024` L1089, gated on `ctx?.isNew`. `RAW_HTML_DISALLOWED` 10 entries L1162-L1173. `<script>` env-gate via `ARTIFACT_STRICT_MARKDOWN_VALIDATION` L1149. Fence-language check L1187-L1205. |
| `text/latex` | `validateLatex` | **L1242-L1309** | `LATEX_UNSUPPORTED_COMMANDS` L1221-L1240. |
| `application/code` | `validateCode` | **L1345-L1412** | `CODE_TRUNCATION_MARKERS` L1319-L1330, `CANONICAL_CODE_LANGUAGES` L1336-L1343. **`ctx.language` cross-validation** L1356-L1367 (D-18 closed). Byte-based size guard L1404. |
| `application/mermaid` | `validateMermaid` | **L1428-L1524** | `MERMAID_DIAGRAM_TYPES` alias to shared L1426 (single source of truth: `mermaid-types.ts:14-40`, ~25 entries). Error message generated from the shared array (D-77 closed). |
| `image/svg+xml` | `validateSvg` | **L1538-L1677** | `<style>` block = error. Path precision warning at 2+ dp via `\d{2,}` regex L1597 (D-17 narrowed). |
| `text/html` | `validateHtml` | **L1683-L1799** | `MAX_INLINE_STYLE_LINES = 10` (module-level L64) — warning, not error. `<form action>` → error. `alert/confirm/prompt` → warning L1788-L1796 (D-26 surfaced). |
| `application/react` | `validateReact` | **L1878-L2037** | `KNOWN_SERIF_FAMILIES` L1806-L1814, `PALETTE_MISMATCH_THRESHOLD = 6` L1817. `appendAestheticWarnings()` L1819-L1862, `stripDirectiveLines()` L1864-L1876. `@aesthetic` directions enforcement L1886-L1924, `@fonts` validation L1925-L1942. |
| `application/python` | `validatePython` | **L2065-L2174** | **Rewritten end-to-end for the notebook schema** (see §13). `PYTHON_UNAVAILABLE_PACKAGES` Map at L2047-L2063 (15 entries with reason strings). |

---

## 3. LLM tool — `create-artifact.ts`

`src/lib/tools/builtin/create-artifact.ts`.

| Step | Location |
|---|---|
| `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` | L16 |
| `createArtifactTool` export + `execute` | L18 / L41 |
| ID generation (`crypto.randomUUID()`) | L42 |
| Content size cap guard | L49-L60 |
| Canvas-mode type-enforcement guard | L62-L85 |
| `application/code` language guard | L88-L101 |
| `validateArtifactContent(type, content, { isNew: true, language })` | L106-L109 |
| `finalContent = validation.content ?? content` (Unsplash pickup) | L127 |
| S3 upload (`S3Paths.artifact`, `uploadFile`) | L131-L145 |
| Prisma create (no `documentFormat` field — column dropped) | L148-L169 |
| Background `indexArtifactContent(id, title, finalContent, { artifactType: type })` | L171 |
| Persistence-error swallow path (`persisted = false`) | post-create |
| Return shape (incl. `warnings?`) | tail |

`isNew: true` and `language` are both forwarded to the validator;
the latter feeds `validateCode`'s canonical-language check (D-18).

---

## 4. LLM tool — `update-artifact.ts`

`src/lib/tools/builtin/update-artifact.ts`.

| Step | Location |
|---|---|
| `MAX_VERSION_HISTORY = 20` | L13 |
| `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` | L16 |
| `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` | L25 |
| `updateArtifactTool` export + `execute` | L27 / L45 |
| Size check (early return) | L51-L65 |
| `prisma.document.findUnique` | L73 |
| Not-found guard (Fix #23 — explicit not-found return) | L78-L87 |
| Canvas-mode mismatch guard against `existing.artifactType` | L95-L113 |
| `validateArtifactContent(existing.artifactType, content)` | L118-L121 |
| `finalContent = validation.content ?? content` (Fix #2) | L141-L143 |
| Read existing versions, compute `versionNum = versions.length + 1` | L150-L157 |
| Upload prior content to `${existing.s3Key}.v${versionNum}` | L161-L170 |
| Inline fallback decision (≤ 32 KiB inline, > 32 KiB marker) | L176-L190 |
| Push version record into `versions` array | L184-L191 |
| FIFO eviction (>20 entries) | L195-L199 |
| New content S3 overwrite (`existing.s3Key`) | L202-L208 |
| Optimistic lock `prisma.document.updateMany` (`where: { id, updatedAt }`) | L215-L230 |
| Concurrent-write guard (LLM-flavored message — D-70) | L232-L244 |
| Background `indexArtifactContent(id, title, finalContent, { isUpdate: true, artifactType: existing.artifactType })` | L247-L251 |
| Persistence-failure return (`updated: false, persisted: false`) | L262-L271 |
| Success return | L273-L282 |

---

## 5. Sessions service — `service.ts` + `repository.ts`

`src/features/conversations/sessions/service.ts` (~700 LoC).

| Surface | Location |
|---|---|
| `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` | L471 |
| `MAX_VERSION_HISTORY = 20` | L473 |
| `updateDashboardChatSessionArtifact` | **L475-L624** |
| Content-required guard (400) | L482 |
| Session ownership (`findDashboardSessionBasicByIdAndUser`) | L489-L492 |
| Artifact existence (`findDashboardArtifactByIdAndSession`) | L494-L497 |
| `validateArtifactContent(existing.artifactType, String(content))` (no third arg) | L509-L511 |
| 422 on validation failure | L513-L517 |
| `finalContent = validation.content ?? content` | L519-L521 |
| Versioning + FIFO eviction (mirrors LLM update) | L523-L571 |
| `updateDashboardArtifactByIdLocked(artifactId, existing.updatedAt, ...)` | L581-L594 |
| Concurrent-write 409 (HTTP-flavored message — D-70) | L596-L602 |
| Background `indexArtifactContent(updated.id, ..., { isUpdate: true, artifactType: existing.artifactType })` | L610-L613 |
| `getDashboardChatSessionArtifact` (coerces `null` artifactType to `""` — D-74) | **L626-L648** |
| `deleteDashboardChatSessionArtifact` | **L653-L700** |
| Canonical S3 delete | L668-L674 |
| Versioned S3 keys cleanup | L676-L691 |
| RAG chunks delete | L693-L696 |
| DB row delete | L698 |
| `deleteDashboardChatSession` (session-delete cascade) | L286-L336 |
| S3 + versioned keys bulk delete in cascade | L300-L316 |
| Per-artifact RAG cleanup `Promise.allSettled` | L319-L323 |
| Cascade Prisma transaction (inline `deleteMany`) | L329-L334 |

`src/features/conversations/sessions/repository.ts` (~232 LoC).

| Surface | Location |
|---|---|
| `findDashboardArtifactByIdAndSession` (`where: { id, sessionId, artifactType: { not: null } }`) | L173-L180 |
| `updateDashboardArtifactByIdLocked` (returns `null` on count 0) | L193-L212 |
| `deleteDashboardArtifactById` | L214-L218 |
| `findArtifactsBySessionId` — selects `id, s3Key, metadata` (enables N-47 cascade) | L220-L230 |

The earlier `deleteArtifactsBySessionId` dead-code export is **gone**
(D-75 closed). The service inlines its own `deleteMany` inside the
cascade transaction at `service.ts:329-334`.

---

## 6. API routes

All under `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/`
(except metrics).

| Route | File | Methods | Notes |
|---|---|---|---|
| Get / Update / Delete | `route.ts` (~119 LoC) | GET, PUT, DELETE | Auth → params → body → service. GET added per D-9 closure (`2a3f110`). |
| Document download | `download/route.ts` (~110 LoC) | GET | `?format=docx` (default) and `?format=pdf`. Routes through `getOrComputeDocx` (process-local FIFO cache + single-flight via `withRenderSlot`); PDF additionally pipes through `docxToPdf` (soffice). D-3 closed; NEW-D-96 closed. |
| Metrics | `/api/dashboard/artifacts/metrics/route.ts` (~45 LoC) | GET | Prometheus exposition format; 6 counters (sandbox + render). **`role === "ADMIN"` required** (NEW-D-97 closed in `3ea9e3e`). |
| Render status | `render-status/route.ts` (~31 LoC) | GET | `text/document` only. `renderArtifactPreview(artifactId, content)` → `{ hash, pageCount, cached }`. |
| Render pages | `render-pages/[contentHash]/[pageIndex]/route.ts` (~44 LoC) | GET | `getCachedPngs(...)`. PNG bytes with `Cache-Control: public, max-age=31536000, immutable`. Returns 404 on miss — never triggers a re-render (D-35 by-design). Calls `getDashboardChatSessionArtifact` for session ownership before serving (D-72 closed). |

The `edit-document/route.ts` POST endpoint (rate-limited
`llmRewriteWithRetry`) was deleted in `6c1dd82`. D-4, D-54, D-55,
D-71 are MOOT.

---

## 7. Renderers (audit by file)

### `artifact-renderer.tsx` (~136 LoC)

| Surface | Location |
|---|---|
| Lazy-load notebook bundle (loading message "Initializing Python runtime…") | L58-L63 |
| Type-switch dispatch | L89-L133 |
| `text/html` → `HtmlRenderer` | L91 |
| `application/react` → `ReactRenderer` | L93 |
| `image/svg+xml` → `SvgRenderer` | L95 |
| `application/mermaid` → `MermaidRenderer` | L97 |
| `application/sheet` → `SheetRenderer` | L99 |
| `text/latex` → `LatexRenderer` | L101 |
| `application/slides` → `SlidesRenderer` | L103 |
| **`application/python` → `NotebookRenderer`** (passes `artifactId, content, onFixWithAI`) | L104-L111 |
| `application/3d` → `R3FRenderer` | L112-L113 |
| `application/code` → `StreamdownContent` with adaptive fence | L114-L127 |
| `text/markdown` → `StreamdownContent` raw | L128-L129 |
| `text/document` — no case (panel intercepts above); falls to `default <pre>` | L130-L133 |

### `artifact-panel.tsx` (~892 LoC)

| Surface | Location |
|---|---|
| Notebook download imports (`parseNotebookContentStreaming`, `toIpynb`, `toPercent`, `toHtml`) | L37-L40 |
| `isTextDocument` guard | L73 |
| State (`isSaving`, `saveError`, `isDeleting`) | L80-L83 |
| State (`isExporting`, `exportError`) | L88-L89 |
| `handleDocumentDownload(format: "docx" | "pdf")` (no `.md`) | L276-L277 |
| `handleNotebookDownload` | L130-L165 |
| `handleRestoreVersion` (pessimistic, `isSaving` guard) | L341-L399 |
| `handleDelete` (server-first, surfaces error inline) | L401-L436 |
| Title (truncated `<h3>`) | L455 |
| Type badge — language suffix only for `application/code` | L458-L466 |
| Version navigator pill (chevrons + counter, hidden when `!hasVersions`) | L470-L500 |
| Restore button (visible when `isViewingHistorical && onUpdateArtifact`) | L505-L524 |
| RAG-not-searchable badge (`ragIndexed === false`) | L527-L541 |
| Copy button (Check for 2 s after copy) | L546-L562 |
| **Document split-button download (`.docx` + `.pdf`, no `.md`)** | L564-L609 |
| **Python notebook split-button download (`.ipynb`, `.py`, `.html`)** | L610-L641 |
| Single-button download (other types) | L642-L656 |
| More menu (Delete) | L659-L682 |
| Fullscreen toggle (`Maximize2`/`Minimize2`) | L684-L702 |
| Close button | L704-L719 |
| Export-error banner (gated on `exportError && !isTextDocument`) | L726-L739 |
| `text/document + sessionId` → `DocumentScriptRenderer` | L747-L759 |
| Other types → `<ArtifactRenderer>` | L761-L765 |
| Fullscreen portal | L776-L787 |
| `getExtension` helper (handles `application/sheet` xlsx detection) | L852-L867 |
| `wrapLatexForDownload` helper | L876-L891 |

### `use-artifacts.ts` (~151 LoC)

| Surface | Location |
|---|---|
| `ACTIVE_ARTIFACT_KEY_PREFIX` | L17 |
| `useArtifacts(sessionKey?)` | L19 |
| Effect: restore active id from sessionStorage | L25-L35 |
| Effect: persist `activeArtifactId` | L38-L50 |
| `addOrUpdateArtifact` (push to previousVersions on existing id; **skips `setActiveArtifactId` for `streaming-` placeholders** post D-73 fix) | L52-L90 |
| `removeArtifact` | L92-L99 |
| `closeArtifact` / `openArtifact` | L101-L107 |
| `loadFromPersisted` | L109-L134 |
| Returned shape | L140-L149 |

### `chat-workspace.tsx` — artifact-related anchors

| Surface | Location |
|---|---|
| Direct `lucide-react` import (`SendHorizontal` only — D-28 relocated here) | L28 |
| `useArtifacts` hook | L1125-L1134 |
| `usePinToChat` (notebook pins) | L1136-L1137 |
| `handleDownloadArtifact` (artifacts sheet fallback) | L1141-L1154 |
| `artifact-panel-changed` custom event dispatch | L1159-L1166 |
| `sendMessage` — `preStreamSnapshots` / `createdStreamingIds` init | L1960-L1961 |
| `tool-input-available` streaming placeholder | L2177-L2215 |
| `tool-output-available` create commit | L2225-L2273 |
| `tool-output-available` update commit | L2277-L2302 |
| `ResizablePanelGroup` (artifact open) | L3276-L3498 |
| Pinned notebook outputs bar (gated on `application/python`) | L3351-L3371 |
| `<ArtifactPanel>` mount with `isStreaming={isStreaming}` | L3487-L3495 |

### Renderer-by-renderer

#### `html-renderer.tsx` (~136 LoC)

| Surface | Location |
|---|---|
| `HEAD_OPEN_RE` (handles `>` inside attribute values) | L23 |
| `injectDefaults` (Tailwind CDN + nav blocker) | L30-L64 |
| `HtmlRenderer` | L66 |
| 5 s `slowLoad` warning | L83-L89 |
| `sandbox="allow-scripts allow-modals"` | inside iframe element |

#### `react-renderer.tsx` (~595 LoC)

| Surface | Location |
|---|---|
| `preprocessCode` directive parsing | L67 |
| `buildSrcdoc` | L242 |
| `ReactRenderer` | L381 |
| `processError` (no setState in render) | L394 |
| Fatal error card | L476-L528 |
| Iframe + floating error overlay | L530-L594 |
| `event.source !== iframeRef.current?.contentWindow` guard | L459 |
| `sandbox="allow-scripts"` | within iframe element |

#### `_react-directives.ts` (~165 LoC)

| Surface | Location |
|---|---|
| `AESTHETIC_DIRECTIONS` const | L11-L19 |
| `DEFAULT_FONTS_BY_DIRECTION` | L23-L51 |
| `parseDirectives` | L76 |
| `buildFontLinks` | L127 |
| `MAX_FONT_FAMILIES = 3`, `FONT_SPEC_REGEX` | within file |

#### `svg-renderer.tsx` (~92 LoC)

| Surface | Location |
|---|---|
| `parseAndSanitize` (DOMParser + DOMPurify) | L22 |
| `SvgRenderer` | L63 |

#### `mermaid-renderer.tsx` (~170 LoC) + `mermaid-config.ts` (~499 LoC)

| Surface | Location |
|---|---|
| Module-scope singleton (mermaid promise + theme cache) | mermaid-renderer L21 |
| `MermaidRenderer` | mermaid-renderer L36 |
| `handleRetry` | mermaid-renderer L97 |
| `getMermaidConfig(theme)` | mermaid-config L475 |
| `pieConfig` (`textPosition: 0.75`) | mermaid-config L437-L441 |

#### `latex-renderer.tsx` (~536 LoC)

| Surface | Location |
|---|---|
| `isKatexCommandAllowed` trust callback (`https?://` only) | L18 |
| Balanced-brace scanner (`readBracedArg`) | L53 |
| `LatexRenderer` | L469 |

#### `r3f-renderer.tsx` (~641 LoC)

| Surface | Location |
|---|---|
| `sanitizeSceneCode` (preserves `<color attach="background">` only — D-98) | L95 |
| `buildSrcdoc` (importmap + Babel inside srcdoc) | L159 |
| `R3FRenderer` | L524 |
| postMessage `event.source !== iframeRef.current?.contentWindow` guard | L552 |
| Iframe **without** `sandbox` (WebGL needs GPU) | within JSX |

#### `_iframe-nav-blocker.ts` (~31 LoC)

| Surface | Location |
|---|---|
| `IFRAME_NAV_BLOCKER_SCRIPT` export | L19 |

#### `sheet-renderer.tsx` (~238 LoC)

| Surface | Location |
|---|---|
| `SheetRenderer` | L28 |
| `detectShape` import + dispatch | L29 |
| `SpecWorkbookView` (lazy) routed when shape === "spec" | L31 |
| `CsvOrArrayView` | L54 |
| Reset sort/filter on content change | L69-L72 |

#### `sheet-spec-view.tsx` (~324 LoC)

| Surface | Location |
|---|---|
| `SpecWorkbookView` | L59 |
| State (`activeSheet`, `selectedRef`, `view`, `values`, `evalError`) | L60-L64 |
| **`useEffect` resets `view` to `"data"`, plus `values`/`evalError`, on content change (D-20 closed)** | L71-L77 |
| Async formula eval (cancellable) | L76-L93 |
| `SheetFormulaBar` mount | always |
| Data/Charts toggle (when `spec.charts.length > 0`) | within JSX |
| **Sheet tab `onClick` also resets `view("data")`** | L285-L287 |

#### `sheet-formula-bar.tsx` (~50 LoC)

| Surface | Location |
|---|---|
| `SheetFormulaBar` | L26 |

#### `sheet-chart-view.tsx` (~129 LoC)

| Surface | Location |
|---|---|
| `SheetChartView` | L15 |
| Pie case — `fillOpacity={Math.max(0.25, 1 - i * 0.1)}` | L121 (D-19 closed via floor) |
| `resolveChartData(chart, values)` | within renderChart |

#### `slides-renderer.tsx` (~173 LoC)

| Surface | Location |
|---|---|
| `SlidesRenderer` | L31 |
| postMessage `e.source` guard | L41-L53 |
| `navigate` | L55-L63 |
| Navigation bar | L123 |
| `sandbox="allow-scripts"` only | within iframe element |

#### `document-script-renderer.tsx` (~224 LoC)

| Surface | Location |
|---|---|
| `DocumentScriptRenderer` | L28 |
| `retryCount` state | L32 |
| Fetch effect deps include `retryCount` | L62 |
| **Retry button** (D-11 closed; aria-live polite, aria-label per D-93) | L122-L134 |
| Success `<img>` page URL | L147 |
| Imports cleanly from `@/lib/icons` | L3 |

#### Notebook subsystem renderers

See §13 for the full notebook map.

#### `streamdown-content.tsx`

| Surface | Location |
|---|---|
| Streamdown wrapper props (`shikiTheme`, `controls: { code, table, mermaid }`, KaTeX plugins) | L62-L95 |
| `MermaidError` (Retry + Source toggle) | within file |

Streamdown's internal mermaid pipeline is a **separate path** that
does not use `mermaid-config.ts` (D-25 by-design).

---

## 8. Prompt modules

`src/lib/prompts/artifacts/` — one file per type plus `index.ts` and
`context.ts`.

| File | LoC | Label | Visual? | Notable line |
|---|---|---|---|---|
| `code.ts` | 317 | "Code" | no | `language` REQUIRED; validator now enforces canonical Shiki list (D-18 closed). |
| `context.ts` | 54 | shared context | — | `VISUAL_ARTIFACT_TYPES` Set (5 members). |
| `document.ts` | 429 | "Document" | no | Script-only after `a81c343`. Required suffix `Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))`. `examples: []` empty by design. Zero AST residue. |
| `html.ts` | 164 | "HTML Page" | yes | Structural rules + Unsplash flow. |
| `index.ts` | 49 | — | — | `satisfies` enforces `type, label, summary, rules, examples` (D-83 closed in `10ad714`). |
| `latex.ts` | 212 | "LaTeX / Math" | no | Full alignment with `LATEX_UNSUPPORTED_COMMANDS`. |
| `markdown.ts` | 252 | "Markdown" | no | **128 KiB hard-cap now in prompt** at L38 (D-15 closed). |
| `mermaid.ts` | 249 | "Mermaid Diagram" | no | Validator error message generated from shared array (D-77 closed). Slides intentionally restrict to 10 (D-99 closed). |
| `python.ts` | **108** | "Python Notebook" | no | **Heavily rewritten** — describes notebook JSON cell schema, two embedded `examples`. See §13. |
| `r3f.ts` | 282 | "3D Scene" | yes | Header corrected to "19 helpers" (D-78 closed). `<color attach="background">` documented L29-L31 (D-29 prompt-side closed). Label canonicalized to `"3D Scene"` (D-68 partially closed). |
| `react.ts` | 435 | "React Component" | yes | `@aesthetic` + `@fonts` directive grammar. |
| `sheet.ts` | 262 | "Spreadsheet" | no | Three shapes; spec chart types incl. `area`. |
| `slides.ts` | 591 | "Slides" | yes | 17 active layouts + 1 deprecated (`image-text`). 6 approved primaryColor + 6 secondaryColor hexes. |
| `svg.ts` | 150 | "SVG Graphic" | yes | "round to 1 dp max" (validator warns at 2+ dp). |

`ARTIFACT_STRICT_MARKDOWN_VALIDATION` env-gate lives only in the
validator (`_validate-artifact.ts:1149`), not in any prompt.

---

## 9. RAG indexer — `artifact-indexer.ts`

`src/lib/rag/artifact-indexer.ts` (~165 LoC).

| Surface | Location |
|---|---|
| `indexArtifactContent(documentId, title, content, options?: { isUpdate?, artifactType? })` | L25 |
| `await deleteChunksByDocumentId` (when `isUpdate`) | L32-L34 |
| `resolveTextToEmbed(documentId, content, type)` call | L42 |
| `chunkDocument(...)` with `chunkSize: 1000, chunkOverlap: 200` | L44 |
| `markRagStatus(false)` on zero chunks | L49 |
| `generateEmbeddings` | L54 |
| `storeChunks(documentId, chunks, embeddings)` | L55 |
| `markRagStatus(documentId, true)` | L57 |
| Outer-catch + `markRagStatus(false).catch(()=>{})` | L67 |
| **Process-local DOCX text cache** (`DOCX_TEXT_CACHE_CAP=128`, FIFO Map, SHA-256[:16] keying) | L79-L94 |
| `resolveTextToEmbed` (text/document branch: sandbox + pandoc with cache short-circuit) | L105-L131 |
| **Atomic `markRagStatus`** (`prisma.$executeRaw` with `jsonb_set` + `COALESCE` — D-2 closed) | L144-L159 |

---

## 10. S3 — `s3/index.ts`

`src/lib/s3/index.ts` (~510 LoC).

| Surface | Location |
|---|---|
| `S3Paths.artifact(orgId, sessionId, id, ext)` (now applies `sessionId || "orphan"` — D-69 closed) | L107-L108 |
| `getArtifactExtension(type)` | L116-L118 |
| `uploadFile(key, body, contentType, options?: { includeUrl? })` (returns `url: ""` by default — D-52 by-design) | L149 |
| `deleteFile(key)` | mid file |
| `deleteFiles(keys[])` (batches ≤ 1000; per-object errors logged but not thrown — D-5 by-design) | L282 |

`uploadStream` is **gone** (removed in `6c1dd82` along with the rest of
the dead-code cleanup; D-80 closed).

Canonical key shape: `artifacts/${orgId || "global"}/${sessionId || "orphan"}/${id}${ext}`.
Versioned key shape: `<canonical>.v<N>` where `N = versions.length + 1`.

---

## 11. Document-script subsystem — `lib/document-script/*`

| File | LoC | Purpose |
|---|---|---|
| `sandbox-runner.ts` | 99 | OS-process sandbox (`spawn(process.execPath, ...)`). Caps: `DEFAULT_MAX_HEAP_MB = 256`, `DEFAULT_TIMEOUT_MS = 10_000`, `DEFAULT_MAX_OUTPUT = 100 MiB`. Inherits full `process.env`; `NODE_OPTIONS: ""` on spawn. **No cgroup/seccomp/namespace.** |
| `sandbox-loader.mjs` | 27 | ESM loader hook via `module.register()`. `FORBIDDEN_SPECIFIERS` Set (18 entries incl. `http2`/`node:http2`). |
| `sandbox-wrapper.mjs` | 48 | `Object.defineProperty(globalThis, m, { get() { throw … } })` for `FORBIDDEN_MODULES` (20 entries — **now includes `http2` and `node:http2`**, D-76 closed). Blocks `globalThis.fetch`. Does NOT block `Function`/`eval` (D-33 by-design — docx uses function-bind). |
| `validator.ts` | 41 | Single flat file. TS syntax check (`createSourceFile`) + sandbox dry-run + `.docx` magic-byte check. `DRY_RUN_TIMEOUT_MS = 5_000`. |
| `cache.ts` | 51 | S3-backed PNG cache. **Parallel fan-out** for both reads (manifest + pages via `Promise.all`) and writes (D-36 closed). `KEY_PREFIX = "artifact-preview"`. SHA-256[:16] hex keying. |
| `docx-cache.ts` | 67 | **NEW**. Process-local FIFO cache (`DOCX_CACHE_CAP=16`) + single-flight (`inFlight Map`) for sandbox DOCX output. Gates fresh runs through `withRenderSlot`. Used by download route for both `?format=docx` and `?format=pdf` (NEW-D-96 closed). |
| `extract-text.ts` | 60 | Receives rendered DOCX `Buffer`, writes temp file, spawns `pandoc -f docx -t plain`. `TIMEOUT_MS = 15_000`. **`pandocMissingLogged` one-shot flag** suppresses repeat ENOENT noise (D-86 closed). |
| `metrics.ts` | 38 | 6 in-memory counters (sandbox + render attempts/failures/durations). No external sink (D-38 closed via the metrics endpoint, see §6). |
| `types.ts` | 23 | `SandboxOptions`, `SandboxResult`, `ScriptValidationResult`. |

`llm-rewrite.ts` was **deleted** in `6c1dd82` (orphan after edit-document
route removal).

`lib/rendering/server/`:

| File | Purpose |
|---|---|
| `docx-preview-pipeline.ts` | Orchestrates sandbox → soffice → pdftoppm. **Single-flight `inFlight Map`** keyed on `(artifactId, hash)`; cache check moved INSIDE the inFlight-tracked work promise (D-89 closed in `e62ccde`). Pipeline wrapped in `withRenderSlot`. |
| `docx-to-pdf.ts` | `soffice --headless --convert-to pdf`. 30 s timeout. **Cold-start every call** (D-37 deferred). |
| `pdf-to-pngs.ts` | `pdftoppm -png -r 120 -l 50`. 30 s timeout. Max 50 pages. **Numeric sort** by extracted page index (D-84 closed). |
| `render-queue.ts` | Counting semaphore. `RENDER_CONCURRENCY` env (default 3). |
| `svg-to-png.ts` | sharp PNG encoder used by the chart export path. |

---

## 12. Spreadsheet engine — `lib/spreadsheet/*`

| File | LoC | Purpose |
|---|---|---|
| `csv.ts` | 47 | Shared `tokenizeCsv`. Single source of truth (D-60 closed). |
| `types.ts` | 117 | `SPREADSHEET_CAPS` L6-L13 (8/500/200/64/31/8). `SPREADSHEET_SPEC_VERSION = "spreadsheet/v1"` L1. `DEFAULT_THEME` L61 — includes `noteColor: "#666666"` (D-65 closed). |
| `parse.ts` | 241 | `detectShape` L38-L57; `parseSpec` L70-L241. |
| `formulas.ts` | 324 | `evaluateWorkbook` pure, L48 export. Kahn's O(V+E) topological sort L153. CIRCULAR marking before eval L190. |
| `chart-data.ts` | 87 | `RANGE_RE` L19. **`expandRange()` strips `$` markers L43-L45** (D-79 closed). `resolveChartData` L62. |
| `generate-xlsx.ts` | 151 | ExcelJS v4.4 client-side. Charts NOT emitted L86-L90 (D-64 by-design). `note` style reads `theme.noteColor` via `hexToArgb` L138. |
| `styles.ts` | 81 | `resolveCellStyle` 6 styles. `note` style returns `fontColor: t.noteColor` L54 (D-65 end-to-end). `formatCellValue` removed by `b3e6cdf`. |
| `format.ts` | 30 | `numfmt` wrapper. Catch live for malformed format strings (D-62 narrowed). |
| `cell-classify.ts` | 30 | 6 priority rules. **Renderer-only** — not used by validator. |

---

## 13. Notebook subsystem (NEW — `application/python`)

The `application/python` artifact type is now a **Jupyter-style
notebook**, executed cell-by-cell in a Pyodide Web Worker. The legacy
`python-renderer.tsx` flat-script flow is gone.

### LLM wire format

```json
{
  "cells": [
    { "type": "code" | "markdown", "source": "..." },
    ...
  ]
}
```

The model must NOT emit `id`, `outputs`, or `executionCount` — those
are runtime fields populated by the kernel (`types.ts:26-32`).

### Library — `lib/notebook/*`

| File | LoC | Key surface |
|---|---|---|
| `types.ts` | ~69 | Zod: `NotebookContentSchema`, `CellSchema`, `OutputSchema`. Factories: `makeCodeCell`, `makeMarkdownCell`, `makeEmptyNotebook`. `Output` discriminated union (4 variants: `stream`, `error`, `display_data`, `execute_result`). |
| `serialize.ts` | ~121 | `serializeNotebookContent`, `parseNotebookContent`, `parseNotebookContentStreaming` — the streaming-tolerant parser used during LLM streaming output. |
| `percent.ts` | ~12 | `toPercent` — exports notebook to `# %% [markdown] / # %%` percent-format `.py`. |
| `ipynb.ts` | ~124 | `toIpynb`, `fromIpynb` — round-trip with nbformat 4. |
| `html-export.ts` | ~43 | `toHtml` — self-contained static HTML export. |
| `chat-attachment.ts` | ~78 | `collectAutoAttachments(notebook, pinned, caps)` — collects last 3 errors, tail-truncated text outputs, base64 PNGs of pinned images. Caller (chat composer) attaches results to outgoing message. |

### Worker — `lib/workers/*`

| File | Surface |
|---|---|
| `python-worker-types.ts` | `WorkerRequest = { type: "init" | "run" | "interrupt" | "reset", ... }`. `WorkerResponse = { type: "kernel-status" | "cell-status" | "stream" | "display" | "result" | "error" | "duration", ... }`. |
| `python-worker.ts` | Pyodide v0.28.0 from jsdelivr (L4-L5). Pre-loaded packages: `numpy`, `micropip`, `matplotlib`, `scikit-learn` (L22). `loadPackagesFromImports(source)` auto-fetches additional packages from import statements (L109-L115). `plt.show` monkey-patched to `_capture_show` writing base64 to `__display_buffer__` at DPI 150 (L28-L38). `IMAGE_BUDGET_BYTES = 100 KiB` (L84) — oversize images flagged but still rendered. Default per-cell `timeoutMs = 30_000` ms (L87). `__format_last__` captures last-expression repr / DataFrame HTML (L41-L58). |

### Renderers — `renderers/notebook/*`

| File | LoC | Surface |
|---|---|---|
| `notebook-renderer.tsx` | ~94 | `NotebookRenderer` (L18). Calls `parseNotebookContentStreaming` in a `useMemo` gated on `content` — works for both streaming and complete content. Instantiates `useKernel(onCellUpdate)`. |
| `notebook-toolbar.tsx` | ~73 | Run-all (with hero pulse) / Interrupt / Restart, plus kernel-status pill. |
| `cell.tsx` | ~144 | `NotebookCellView`. Cell shell with gutter execution counter, run button, footer (duration + status). Renders `runtime.outputs` (live), not `cell.outputs` (L98). |
| `code-cell-editor.tsx` | ~68 | CodeMirror 6 Python editor with shadcn theme. |
| `markdown-cell.tsx` | ~77 | Click-to-edit markdown, rendered via `StreamdownContent` when not editing. |
| `cell-output.tsx` | ~232 | Renders all 4 output variants. `COLLAPSE_LINE_THRESHOLD = 40`, `COLLAPSE_KEEP_LINES = 20` (L18-L19). Oversize-image banner. |
| `output-pin-overlay.tsx` | ~38 | Hover overlay with Pin / View Large affordances. |
| `use-kernel.ts` | ~208 | Worker lifecycle (lazy creation L81-L84), single-worker sequential queue. `runCell` L158-L164, `runAll` L167-L182, `drainQueue` L73-L78. Message handler (L86-L153) dispatches to `cellStateRef`. `interrupt` calls `worker.terminate()` (L185-L191) — worker-side `case "interrupt"` is a no-op since the host already terminates. |
| `use-pin-to-chat.ts` | ~56 | Pin state in `sessionStorage` under key `"notebook-pins:<artifactId>"` (L6, L15). `togglePin(cellId, outputIdx)`. |

### Validator — `validatePython` (`_validate-artifact.ts:2065-L2174`)

The validator enforces the notebook schema:

1. Empty content → error.
2. Bare script (not starting with `{`) → error with explicit message.
3. JSON parse failure → error.
4. Missing top-level `cells` array → error.
5. Empty `cells` → error.
6. Per cell: `type` must be `"code"` or `"markdown"`; `source` must be string.
7. (code cells) Imports of `PYTHON_UNAVAILABLE_PACKAGES` (15 entries
   with reason strings: requests, httpx, urllib3, flask, django,
   fastapi, sqlalchemy, selenium, tensorflow, torch, keras,
   transformers, cv2, pyarrow, polars) → error.
8. (code cells) `input(` or `open(` → error.
9. (warnings) `time.sleep(N)` with N > 2; `while True` without break;
   no cell produces visible output (heuristic at L2153-L2158).

Comment-stripping (`stripComment` L2101-L2104) avoids false positives
from commented-out imports.

### Wiring

- Panel routes `application/python` to the notebook bundle via
  `artifact-renderer.tsx:104-L111`.
- Notebook download in `artifact-panel.tsx:610-L641` exposes three
  formats: `.ipynb`, `.py` (percent), `.html`.
- Pin-to-chat: `usePinToChat` is also instantiated at the workspace
  level (`chat-workspace.tsx:1136-L1137`) so the chat composer can
  read the pin set; the pinned-outputs bar is rendered above the
  composer when the active artifact is `application/python`
  (`chat-workspace.tsx:3351-L3371`).

---

## 14. Unsplash + rendering helpers

| File | LoC | Purpose |
|---|---|---|
| `unsplash/client.ts` | 45 | `searchPhoto(query)` — `per_page=1&orientation=landscape`, `TIMEOUT_MS=5000`. No retry. |
| `unsplash/index.ts` | 66 | Public wrappers. **Kill switch `UNSPLASH_RESOLUTION_DISABLED=true`** L12. Catch-all → original on throw. |
| `unsplash/resolver.ts` | 206 | `UNSPLASH_REGEX` L10 (HTML `src=` only). `resolveQueries` L149 — Prisma 30-day cache, parallel fetch, per-query catch isolation. |
| `unsplash/types.ts` | 24 | `UnsplashPhoto`, `UnsplashSearchResponse`. |
| `rendering/mermaid-theme.ts` | 41 | `MERMAID_THEME_VARIABLES_LIGHT`/`_DARK` + `getMermaidInitOptions(theme)` for client PPTX path. |
| `rendering/mermaid-types.ts` | 43 | **Single source of truth** for diagram-type allow-list. `MERMAID_DIAGRAM_TYPES` array. Imported by validator and slides validator. |
| `rendering/chart-to-svg.ts` | **485** | Pure D3. **Theme parameter** (`options?.theme: "light" | "dark"`) at L424-L429 (D-51 closed). `ChartTheme` type L28. `TOKENS` record L41. `inferChartTheme(hex)` helper L75 (sRGB relative-luminance threshold 0.5). All internal renderers accept `t: ThemeTokens`. Wired by `slides/render-html.ts` and `slides/generate-pptx.ts` (NEW-R-4 closed). |
| `rendering/server/svg-to-png.ts` | 27 | sharp `fit:'contain'` + white background + `lanczos3`. |
| `rendering/client/svg-to-png.ts` | 100 | Canvas API, 2× internal scale (HiDPI). Secondary `unsplash:` fallback. |
| `rendering/client/mermaid-to-png.ts` | 41 | Browser-only mermaid → PNG via `getMermaidInitOptions(theme)`. Returns `null` on error. |

---

## 15. RAG (artifact subset) — `lib/rag/`

| File | LoC | Purpose |
|---|---|---|
| `artifact-indexer.ts` | ~165 | See §9. Atomic `markRagStatus` (D-2 closed). |
| `chunker.ts` | 196 | Default `chunkSize=1000`, `chunkOverlap=200`. Separator priority `["\n## ","\n### ","\n#### ","\n\n","\n",". "," "]`. |
| `embeddings.ts` | 233 | `MAX_RETRIES = 3`, `RETRY_DELAY_MS = 1000`. **`BATCH_SIZE` and `EMBED_CONCURRENCY` env-overridable** via `KB_EMBED_BATCH_SIZE` / `KB_EMBED_CONCURRENCY` (D-82 closed). |
| `vector-store.ts` | 562 | `STORE_CHUNKS_CONCURRENCY = 8` L513. Legacy `storeDocument` (sequential) used by knowledge upload — D-81 deferred. |

---

## 16. Where the line numbers come from

This document was regenerated by reading every cited file at commit
`78e2b0a` (HEAD on `main`, 2026-05-04) via five parallel
code-explorer agents — one per region (validation core, tools+
persistence+API, renderers+panel+state, subsystem libs, registry+
prompts+notebook). Each agent reported HEAD line numbers exactly.
Line numbers should be treated as **stable to the line** for that
commit; edits since then may shift them.

**D-N references** point to numbered findings in
[`artifacts-deepscan.md`](./artifacts-deepscan.md) §12. New findings
from this regen are numbered D-89 through D-101.
