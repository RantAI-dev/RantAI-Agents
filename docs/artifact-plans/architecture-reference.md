# Artifact System — Architecture Reference

> **Audience:** an engineer who needs to find where something lives in the
> code. Structured as a **file:line audit** — every claim is verified
> against the working tree and points at a specific source location. For
> the system narrative read [`artifacts-deepscan.md`](./artifacts-deepscan.md);
> for per-type capabilities read [`artifacts-capabilities.md`](./artifacts-capabilities.md).
>
> **Last regenerated:** 2026-04-28, post AST-fallback-removal, pinned to
> commit `a81c343`. Replaces all prior versions. Reflects three commits
> after the prior `8b6e69b` cut — the AST path was removed
> (`a81c343`), CSV tokenizer deduped to `lib/spreadsheet/csv.ts`
> (`02e24a6`), and dead state + orphan modal dropped (`0b25e56`).
> Line numbers re-verified against `grep -n` after those commits;
> ranges marked "(L… area)" are approximate to ±10 lines.
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
│   │   ├── create-artifact.ts                       LLM tool: create
│   │   ├── update-artifact.ts                       LLM tool: update
│   │   └── _validate-artifact.ts                    dispatcher + 12 validators (~2036 LoC)
│   ├── prompts/artifacts/                           per-type LLM rules
│   │   ├── index.ts
│   │   ├── context.ts                               shared context block + VISUAL_ARTIFACT_TYPES
│   │   └── {code,document,html,latex,markdown,mermaid,python,r3f,react,sheet,slides,svg}.ts
│   ├── document-script/
│   │   └── validator                                validateScriptArtifact (TS + sandbox + magic-byte)
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

`src/lib/tools/builtin/_validate-artifact.ts` (~2036 LoC post `a81c343`).

| Surface | Location |
|---|---|
| `ValidationContext` interface (`isNew?` only — `documentFormat` removed) | L68-L70 |
| `VALIDATORS` map (12 entries, exhaustive) | L72-L91 |
| `getValidateTimeoutMs()` + `__setValidateTimeoutMsForTesting` | L106-L125 |
| `validateArtifactContent` entry | L127-L163 |
| 5-second `Promise.race` timeout, `.unref?.()` | L134-L148 |
| Post-validation Unsplash for HTML | L154-L157 |
| Post-validation Unsplash for slides | L158-L161 |
| `formatValidationError(type, result)` | end of file |

The previous "script-document early branch" (old L137-L141) is gone —
`validateDocument` lives inside the `VALIDATORS` map and dynamic-imports
`validateScriptArtifact` itself.

Per-validator entry points with verified line ranges (post `a81c343`):

| Type | Validator export | Body range |
|---|---|---|
| `text/document` | `validateDocument` | L169-L177 — thin async wrapper: `dynamic-import("@/lib/document-script/validator").validateScriptArtifact(content)`. Returns `{ ok, errors, warnings: [] }`. Accepts `_ctx` but never reads it (eslint-disable). |
| `application/slides` | `validateSlides` | L213-L600 area. Constants L187-L211: `SLIDE_LAYOUTS` Set (**18 entries**), `MAX_SLIDE_BULLETS=6`, `MAX_BULLET_WORDS=10`, `MIN_DECK_SLIDES=7`, `MAX_DECK_SLIDES=12`. The `image-text` deprecation is the only `ctx`-gated check. No primaryColor/secondaryColor hex whitelist. |
| `application/3d` | `validate3d` | post-slides block. Constant `R3F_ALLOWED_DEPS` (34 entries verified — header comment claims 36). |
| `application/sheet` | `validateSheet` | 3-branch dispatch (CSV / JSON array / spec). Spec branch calls `parseSpec` + `evaluateWorkbook`. CSV branch now imports `tokenizeCsv` from `@/lib/spreadsheet/csv` (post `02e24a6`); the inline duplicate is gone. |
| `text/markdown` | `validateMarkdown` | `MARKDOWN_NEW_CAP_BYTES = 128 * 1024` L1013. **Size cap gated on `ctx?.isNew` only** L1029-L1031. `<script>` env-gate via `ARTIFACT_STRICT_MARKDOWN_VALIDATION` (warning by default, hard error when `"true"`). `RAW_HTML_DISALLOWED` **10 entries** L1086-L1097: `["details","summary","kbd","mark","iframe","video","audio","object","embed","table"]`. |
| `text/latex` | `validateLatex` | `LATEX_UNSUPPORTED_COMMANDS` ~14 entries (9 errors + 5 warnings). |
| `application/code` | `validateCode` | `CODE_TRUNCATION_MARKERS` ~10 patterns. HTML doc detection. **`language` parameter never inspected** (D-18). |
| `application/mermaid` | `validateMermaid` | `MERMAID_DIAGRAM_TYPES = MERMAID_DIAGRAM_TYPES_SHARED` L1324 (alias to **25-entry** constant from `_mermaid-types.ts`). >15-node heuristic only fires for flowchart/graph. |
| `image/svg+xml` | `validateSvg` | **`<style>` block = error** (D-42). Precision regex `/\d\.\d{3,}/` (3+ dp) — drift vs prompt's "1 dp max" (D-17). Color count `> 5` → warning. |
| `text/html` | `validateHtml` | `MAX_INLINE_STYLE_LINES = 10` (warning, not error — D-43). `<form action>` → error. |
| `application/react` | `validateReact` | Helpers + `KNOWN_SERIF_FAMILIES` + `PALETTE_MISMATCH_THRESHOLD = 6`. **`ARTIFACT_REACT_AESTHETIC_REQUIRED` default = true when env absent** (`!== "false"`). |
| `application/python` | `validatePython` | `PYTHON_UNAVAILABLE_PACKAGES` L1925-L1942 (**15 entries**). `stripComment` helper. **`open()` write-mode regex** `/\bopen\s*\([^)]*,\s*['"][wax]b?\+?['"]/m` — read-mode passes silently (D-16). `time.sleep > 2s` heuristic. `while True` heuristic. |

---

## 3. LLM tool — `create-artifact.ts`

`src/lib/tools/builtin/create-artifact.ts`.

| Step | Location |
|---|---|
| ID generation (`crypto.randomUUID()`) | mid-file |
| Content size cap (`MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024`) | early |
| Canvas-mode lock | mid |
| `application/code` language guard | mid |
| `validateArtifactContent({ isNew: true })` | mid |
| `finalContent = validation.content ?? content` | mid |
| S3 upload (`S3Paths.artifact`) | mid |
| Prisma create (no `documentFormat` field — column dropped) | L155-L168 |
| Background `indexArtifactContent(...).catch(...)` | post-create |
| Persistence-error swallow path (`persisted = false`) | post-create |
| Return shape | end |

Constants:
- `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` — L16

The earlier `ARTIFACT_DOC_FORMAT_DEFAULT` env switch and the
`DOC_FORMAT = "script"` constant were both removed; the column itself
was dropped by migration `20260429100656_drop_document_format`.

---

## 4. LLM tool — `update-artifact.ts`

`src/lib/tools/builtin/update-artifact.ts`.

| Step | Location |
|---|---|
| `MAX_VERSION_HISTORY = 20` | L13 |
| `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` | L16 |
| `MAX_INLINE_FALLBACK_BYTES = 32 * 1024` | L25 |
| Size check (early return) | L52-L65 |
| `prisma.document.findUnique` | mid |
| Not-found guard | post-find |
| Canvas-mode check | mid |
| `validateArtifactContent(type, content)` (no `documentFormat` context — field removed with `a81c343`) | L118 |
| Version archive: read existing versions, compute `versionS3Key = "${s3Key}.v${N}"` | mid |
| Upload prior content to versioned key | mid |
| Inline fallback decision (≤ 32 KiB inline, > 32 KiB marker) | L178 area |
| FIFO eviction (>20 entries) | L195-L196 area |
| New content S3 overwrite | mid |
| Optimistic lock `prisma.document.updateMany` | mid |
| Background RAG re-index | post-update |
| Persistence-failure return | post-update |
| Return shape | end |

---

## 5. Sessions service — `service.ts` + `repository.ts`

`src/features/conversations/sessions/service.ts`.

| Surface | Location |
|---|---|
| `getDashboardChatSessionArtifact` | upper third |
| `updateDashboardChatSessionArtifact` | mid third |
| `validateArtifactContent(existing.artifactType, String(content))` — no third arg needed (D-1 closed; `ValidationContext` only carries `isNew`) | L509-L512 |
| `finalContent = validation.content ?? content` | L520 area |
| Versioning (mirrors LLM update) | post-validation |
| `updateDashboardArtifactByIdLocked` call | post-versioning |
| Background `indexArtifactContent({ isUpdate: true })` — **fixes N-1** | post-update |
| `deleteDashboardChatSessionArtifact` | lower third |
| Session delete cascade (S3 canonical, S3 versioned, RAG, Prisma) | mid |

`src/features/conversations/sessions/repository.ts`.

| Surface | Location |
|---|---|
| `findDashboardArtifactById` | upper |
| `updateDashboardArtifactByIdLocked` (returns `null` on count 0) | mid |
| `deleteDashboardArtifactById` | repository |
| `findArtifactsBySessionId` — selects `id, s3Key, metadata` (the `metadata` selection enables N-47 cascade) | L220-L230 |

---

## 6. API routes

All under `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/`.

| Route | File | Method | Notes |
|---|---|---|---|
| Update / Delete | `route.ts` | PUT, DELETE | Auth → params → body → service. **No GET handler (D-9)**. |
| Document download | `download/route.ts` | GET | `?format=docx` (default). Calls `runScriptInSandbox` → `.docx` bytes. **Any other `format` value returns 400 `Unsupported format: <x>` (D-3)** — no PDF path. |
| Edit document | `edit-document/route.ts` | POST | Rate limit token bucket (**in-process only — D-4**). Guards `artifactType === "text/document"`. Calls `llmRewriteWithRetry` then `updateDashboardChatSessionArtifact`. |
| Render status | `render-status/route.ts` | GET | `text/document` only. `renderArtifactPreview(artifactId, content)` → `{ hash, pageCount, cached }`. |
| Render pages | `render-pages/[contentHash]/[pageIndex]/route.ts` | GET | `getCachedPngs(...)`. PNG bytes with `Cache-Control: public, max-age=31536000, immutable`. Returns 404 on miss — **never triggers a re-render** (D-35). |

---

## 7. Renderers (audit by file)

### `artifact-renderer.tsx`

| Surface | Location |
|---|---|
| Type-switch dispatch | L88-L128 |
| `application/code` → `StreamdownContent` with adaptive fence | L108-L121 |
| `text/markdown` → `StreamdownContent` raw | L122-L123 |
| `application/sheet` → `SheetRenderer` | L98-L99 |
| `text/document` — **no case** (post `a81c343`); falls to `default <pre>`. The panel intercepts above (D-10 closed). | L124-L127 (default branch) |

### `artifact-panel.tsx`

| Surface | Location |
|---|---|
| `text/document + sessionId` → `DocumentScriptRenderer` | L696-L705 |
| `text/document` no-session fallback ("Preview unavailable…") | L706-L708 |
| Other types → `<ArtifactRenderer>` | L710-L713 |
| Default content area (no Preview/Code tabs) — comment | L690-L694 |
| Title (truncated) | upper third |
| Type badge — language suffix only for `application/code` | header bar |
| Version navigator pill | header bar |
| Restore button | header bar |
| RAG-not-searchable badge (`ragIndexed === false`) | header bar |
| Copy button | header bar |
| Document split-button download (`.md` + `.docx`, no `.pdf`) | L545-L591 |
| Single-button download (others) | L592-L605 |
| Delete menu | post-download |
| Fullscreen / Escape exit | mid + portal branch |
| Close | header bar |
| Export-error banner | post-header (gated on `!isTextDocument`) | L675-L688 |
| `handleDelete` (pessimistic — D-fixed) | mid |
| `handleRestoreVersion` (`isSaving` guard) | mid |

### `use-artifacts.ts`

| Surface | Location |
|---|---|
| `addOrUpdateArtifact` (push to previousVersions on existing id) | L52-L83 |
| `removeArtifact` (clears `activeArtifactId` on match) | L85-L92 |
| `closeArtifact` / `openArtifact` | L94-L100 |
| `loadFromPersisted` | L102-L127 |
| `previousVersions` from `metadata.versions` | L113-L117 |
| `evictedVersionCount` from metadata | L118 |
| `ragIndexed` from metadata | L119 |
| (No `documentFormat` hydration — field removed with `a81c343`.) | — |

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

#### `r3f-renderer.tsx`

| Surface | Location |
|---|---|
| Iframe **without** `sandbox` attribute (WebGL needs GPU) — comment | mid |
| postMessage origin guard `event.source !== iframeRef.current?.contentWindow` | mid |
| Origin-guard rationale | mid |
| `didReadyRef` `useRef(false)` (replaces closure-local `let`) | L520-L535 area |
| `didReadyRef.current = false` reset on content change | L534 area |
| 20 s timeout reads `didReadyRef.current` | following |
| Importmap inside srcdoc (esm.sh) | early |
| Babel standalone via unpkg | early |
| Scene code via JSON `<script id="scene-data" type="application/json">` | early |
| Scene parse | mid |
| WebGL error bifurcation (`isWebGLError`) | mid |

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

#### `document-script-renderer.tsx`

| Surface | Location |
|---|---|
| Props (`sessionId`, `artifactId`, `content`, `isStreaming`) | L11-L16 |
| Streaming state — CodeView with `opacity-60` | L96-L108 |
| Fetch effect deps `[sessionId, artifactId, content, isStreaming]` | L35-L61 |
| GET `/render-status` | L35-L61 |
| Page image URL `/render-pages/${hash}/${pageIdx}` | L134 |
| Image `key={`${hash}-${pageIdx}`}` (force remount) | L134 |
| Keyboard nav (same `isTextEntry` guard) | L70-L93 |
| Dot strip when `1 < pageCount ≤ 20` | L135 |
| **Error state without retry (D-11)** | L111-L122 |
| Loading "Rendering preview…" | L124-L132 |
| `CodeView` subcomponent | L200-L210 |
| **Direct `lucide-react` import (D-28)** | L3 |

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

| File | Label | Visual? | Notable line |
|---|---|---|---|
| `code.ts` | "Code" | no | (no `language` enforcement — D-18) |
| `context.ts` | shared context | — | `VISUAL_ARTIFACT_TYPES` Set at top |
| `document.ts` | "Document" | no | Script-only after `a81c343` (~429 LoC, the prior AST-mode branching + 316-line example tree was removed). |
| `html.ts` | "HTML Page" | yes | structural rules + Unsplash flow |
| `latex.ts` | "LaTeX / Math" | no | full alignment with `LATEX_UNSUPPORTED_COMMANDS` |
| `markdown.ts` | "Markdown" | no | label change comment refutes prior N-17 |
| `mermaid.ts` | "Mermaid Diagram" | no | 19 documented vs **25** in `_mermaid-types.ts` (D-13) |
| `python.ts` | "Python Script" | no | 13 unavailable in prompt vs **15** in validator (urllib3 + 2 others mismatch) |
| `r3f.ts` | "R3F 3D Scene" | yes | drei symbol list (19) |
| `react.ts` | "React Component" | yes | `@aesthetic` + `@fonts` directive grammar |
| `sheet.ts` | "Spreadsheet" | no | three shapes; spec chart types incl. `area` (not in slides validator) |
| `slides.ts` | "Slides" | yes | 17 active layouts + 1 deprecated (`image-text`); 6 approved primary/secondary colors |
| `svg.ts` | "SVG Graphic" | yes | "round to 1 dp max" (validator warns at 3+ dp — D-17) |

---

## 9. RAG indexer — `artifact-indexer.ts`

`src/lib/rag/artifact-indexer.ts`.

| Surface | Location |
|---|---|
| `indexArtifactContent(documentId, title, content, options?)` | L21-L65 |
| `await deleteChunksByDocumentId` (when `isUpdate`) | inside function |
| `resolveTextToEmbed` (extra `findUnique` D-7) | L72-L93 |
| `chunkDocument(...)` with `chunkSize: 1000, chunkOverlap: 200` | within function |
| `markRagStatus(false)` on zero chunks | within function |
| `generateEmbeddings(chunkTexts)` | within function |
| `storeChunks(documentId, chunks, embeddings)` (concurrency 8 — `STORE_CHUNKS_CONCURRENCY` in vector-store.ts L513) | within function |
| `markRagStatus(documentId, true)` (read-then-write — D-2) | L96-L113 |
| Exception path swallow | end of function |

---

## 10. S3 — `s3/index.ts`

| Surface | Location |
|---|---|
| `S3Paths.artifact(orgId, sessionId, id, ext)` | mid file |
| `getArtifactExtension(type)` (uses `getArtifactRegistryEntry`) | L116-L118 |
| `uploadFile(key, body, contentType)` | mid file |
| `deleteFile(key)` | mid file |
| `deleteFiles(keys[])` (batches ≤ 1000; per-object errors logged but not thrown — D-5) | L304-L312 area |

Canonical key shape: `artifacts/<orgId|"global">/<sessionId|"orphan">/<id><ext>`.
Versioned key shape: `<canonical>.v<N>`.

---

## 11. Document-script subsystem — `lib/document-script/*`

| File | LoC | Purpose |
|---|---|---|
| `sandbox-runner.ts` | 98 | OS-process sandbox (`spawn(process.execPath, ...)`). Caps: `--max-old-space-size=${maxHeapMb}` (default 256 MiB), wall-clock SIGKILL after `timeoutMs` (default 10 s, 5 s for dry-run), 100 MiB stdout cap. **No cgroup/seccomp/namespace.** Inherits full `process.env`. |
| `sandbox-loader.mjs` | — | ESM loader hook via `module.register()`. Runs in dedicated worker thread. Blocks bare-specifier imports of `FORBIDDEN_SPECIFIERS` (incl. `"fs"`, `"node:fs"`). Fires before any module code runs. |
| `sandbox-wrapper.mjs` | — | `Object.defineProperty(globalThis, m, { get() { throw … } })` for `FORBIDDEN_MODULES`. Catches `require()`-style global access. Blocks `fetch`. **Does NOT block `Function`/`eval`** (docx uses function-bind). |
| `validator.ts` | 41 | Two-phase: `quickSyntaxCheck` (TypeScript `createSourceFile` AST parse) → `runScriptInSandbox` with `timeoutMs: 5_000` and PK magic-byte check (`50 4b 03 04`). |
| `cache.ts` | 45 | `computeContentHash`: SHA-256[:16 hex chars] of script source. `getCachedPngs` / `putCachedPngs` — **S3-only**, no memory/disk/Redis layer. Layout: `artifact-preview/{artifactId}/{hash}/manifest.json + page-N.png`. |
| `extract-text.ts` | 44 | Receives rendered DOCX `Buffer`, writes temp file, spawns `pandoc -f docx -t plain`. 15 s timeout. Used by RAG indexer for embedding text. |
| `llm-rewrite.ts` | 48 | `MAX_RETRIES = 2` (3 attempts total). Self-correction prepends prior validator error to `editPrompt`. |
| `metrics.ts` | 47 | 9 in-memory counters. **No external sink** — no Prometheus/StatsD/Datadog. Process-local. |
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
| `types.ts` | 114 | `SPREADSHEET_CAPS` L6-L13 (8/500/200/64/31/8). `SPREADSHEET_SPEC_VERSION = "spreadsheet/v1"`. `DEFAULT_THEME` L60-L66. |
| `parse.ts` | 241 | `detectShape` L38-L57 (no JSON parse on `"csv"` branch). `parseSpec` L70-L241 (171-line accumulating validator — complexity hotspot). |
| `formulas.ts` | 324 | `evaluateWorkbook` — pure. Kahn's O(V+E) topological sort L145-L194. CIRCULAR marking before eval. **No function whitelist** — `fast-formula-parser` handles ~150+ Excel functions. **No array spillover.** Range-type named ranges → `null` silently. |
| `chart-data.ts` | 84 | `RANGE_RE` L19-L56 sheet-qualified only. `resolveChartData` clips to shortest range. Missing series values default to `0`. Cross-sheet refs work. |
| `generate-xlsx.ts` | 150 | ExcelJS v4.4 client-side. Bakes in cached formula results. **Charts NOT emitted** L86-L90 (ExcelJS API limitation, D-64). `note` style hardcoded gray `#666666` (D-65). |
| `styles.ts` | 149 | `resolveCellStyle` 6 styles. **Tailwind classes diverge from theme hex** (D-66) — dark mode approximate. `formatCellValue` parallel formatter (handwritten, supports percent/decimals/dates). |
| `format.ts` | 28 | `numfmt` wrapper. **L21 dead-code branch** (D-62) — both integer/float return `String(value)`. |
| `cell-classify.ts` | 30 | 6 priority rules. `EXTERNAL_REF` / `SHEET_REF` regexes. **Renderer-only — not used by validator.** |

## 14. `lib/unsplash/*` + `lib/s3/index.ts` + Rendering helpers

| File | LoC | Purpose |
|---|---|---|
| `unsplash/client.ts` | 45 | `searchPhoto(query)` — `per_page=1&orientation=landscape`, 5000 ms `AbortSignal.timeout`. No retry. |
| `unsplash/index.ts` | 65 | Public wrappers. **Kill switch `UNSPLASH_RESOLUTION_DISABLED=true`**. Catch-all → original on throw. |
| `unsplash/resolver.ts` | 207 | `UNSPLASH_REGEX` L10. `normalize` L18 (lowercase + truncate 50). `fallbackUrl` L29 — never null. `resolveQueries` L150 — Prisma 30-day cache, parallel fetch (no rate-limit throttle), per-query catch isolates failures. |
| `s3/index.ts` | 527 | `S3Paths.artifact = artifacts/{orgId\|global}/{sessionId}/{artifactId}{ext}`. `getArtifactExtension` L116-L118 → registry. `uploadFile` L139 returns empty `url` by default (opt-in via `includeUrl`). `deleteFiles` L282 batches ≤ 1000, sequential, **logs but does NOT throw on per-key failures** L304-L312. |
| `rendering/mermaid-theme.ts` | ~25 | `MERMAID_THEME_VARIABLES` (light) + `_DARK` and `getMermaidInitOptions(theme)` for the client PPTX path. The earlier hardwired-light DOCX export consumer was removed when `mermaid-to-svg.ts` was deleted (`a81c343`). |
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
| `artifact-indexer.ts` | 113 | `indexArtifactContent`. `resolveTextToEmbed` L72-L93 — extra DB round-trip; for script docs: sandbox + pandoc to embed rendered text. `markRagStatus` L96-L113 — **read-then-write, NOT atomic**. |
| `chunker.ts` | 195 | Default `chunkSize=1000`, `chunkOverlap=200`. Separator priority `["\n## ","\n### ","\n#### ","\n\n","\n",". "," "]`. Overlap **prepended** (not appended). `prepareChunkForEmbedding` adds Category/Topic/Section/Context prefix. |
| `embeddings.ts` | 233 | `BATCH_SIZE = 128`, `EMBED_CONCURRENCY = 4`, `MAX_RETRIES = 3`, `RETRY_DELAY_MS = 1000` (doubles, cap 10000). Model from `KB_EMBEDDING_MODEL` (default `qwen/qwen3-embedding-8b`). API key `KB_EMBEDDING_API_KEY` or fallback `OPENROUTER_API_KEY`. |
| `vector-store.ts` | 561 | `STORE_CHUNKS_CONCURRENCY = 8` L513. Chunk ID: `${documentId}_${i}`. SurrealDB `CREATE document_chunk` (no upsert — relies on prior delete). `deleteChunksByDocumentId` single DELETE-WHERE. |

## 16. Where the line numbers come from

This document was regenerated by reading every cited file at commit
`a81c343` (post AST-fallback-removal). Line numbers should be treated
as **stable to the line** for that commit; edits since then may shift
them. Run `git log -p <file>` between this commit and HEAD for a delta
when reading older versions of this doc.

A number of ranges are marked **"(L… area)" or with positional hints
("upper", "mid", "post-find")** rather than exact lines — those are
sections that survived the `8b6e69b → a81c343` AST-removal but where
the exact lines shifted by tens of lines. Re-grep against the cited
file when you need the precise line; the surface itself still lives
where the row says it does.
