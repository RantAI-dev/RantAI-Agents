# Artifact System — Deepscan

> **Last regenerated:** 2026-04-28, post AST-fallback-removal, pinned to commit `a81c343`.
> Replaces all prior versions. Sourced from a ground-up rescan that
> verified every cited surface against the working tree.
>
> **Companion docs:**
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit per module.
> - [`artifacts-capabilities.md`](./artifacts-capabilities.md) — per-type capability spec.
>
> **Major changes since the 2026-04-28 `8b6e69b` cut:**
> - **`text/document` AST fallback removed** (`a81c343`). The `documentFormat` discriminant is gone from `ValidationContext`, `Artifact`, `PersistedArtifact`, and `update-artifact.ts`. Persisted rows still have a `documentFormat` column but new creates hardcode `"script"` (`create-artifact.ts:18`). `lib/document-ast/{schema,validate,to-docx,resolve-unsplash}.ts`, the legacy `document-renderer.tsx`, and the server `mermaid-to-svg.ts` were all deleted. The dispatcher's script-document early branch is gone — `validateDocument` now is a thin async wrapper that delegates to `validateScriptArtifact`.
> - **CSV tokenizer deduped** (`02e24a6`): `lib/spreadsheet/csv.ts` is the single shared `tokenizeCsv` callsite for both validator and renderer. The earlier triplicate (validator inline + renderer private + parse.ts gap) is closed.
> - **Dead state + orphan modal dropped** (`0b25e56`): `edit-document-modal.tsx` deleted (was unused), R3F `setReady` state removed (`didReady` ref-only now), mermaid `containerRef` and `deterministicIDSeed` removed from renderer/config.
>
> **Earlier cut (2026-04-25 → 2026-04-28 `8b6e69b`) for context:**
> - Panel chrome overhaul: Preview/Code tab pair removed, in-panel edit affordances stripped, preview now view-only across every type.
> - `document-script-renderer` added — server-rendered PNG carousel.
> - Sheet stack rebuilt: `SpecWorkbookView` → `SheetFormulaBar` → `SheetChartView`. XLSX download in panel header only.
> - `/edit-document` POST endpoint added for prompt-based rewrite.
> - Ghost-artifact prevention, RAG re-index on manual edit (N-1), session-delete versioned-S3 cleanup (N-47), R3F origin guard, slides sandbox tightened to `allow-scripts`, mermaid init consolidated under shared `mermaid-config.ts`, LaTeX trust callback restricting `\href` to `https?://`, react-renderer postMessage source-checked.

---

## TL;DR

The artifact system has **one source of truth** (the registry) and a
**dispatcher pattern** repeated three times — validator, prompt,
renderer (panel chrome reads from registry directly). Adding a new type
means filling the same slot in each switch; TypeScript exhaustiveness
checking surfaces every missing branch at compile time.

It also has **two parallel persistence paths** that share validation:

```
LLM tool path                           HTTP service path (manual edit)
─────────────                           ──────────────────────────────
create_artifact / update_artifact       PUT /api/.../artifacts/[id]
        │                                       │
        ▼                                       ▼
validateArtifactContent  ───────────────  validateArtifactContent
   (5s timeout, post-Unsplash for HTML/slides, ctx.isNew on create only)
        │                                       │
        ▼                                       ▼
 prisma.document direct                updateDashboardChatSessionArtifact
 + S3 + RAG indexing                   + S3 + RAG re-index (N-1 fixed)
```

Both paths re-index RAG and run the same validator. The HTTP PUT call
no longer needs a third arg — `ValidationContext` only exposes `isNew`,
which the manual-edit path doesn't set.

A single `validateArtifactContent(type, content, ctx?)` is the entry point
every persistence path runs through. It does three jobs:

1. Dispatches to the per-type validator with a **5-second wall-clock
   timeout** (`VALIDATE_TIMEOUT_MS`).
2. Carries an optional `ValidationContext.isNew` flag — `validateMarkdown`
   enforces a 128 KiB cap with it, `validateSlides` rejects the deprecated
   `image-text` layout with it. Other validators ignore it.
3. **Post-resolves Unsplash** for `text/html` and `application/slides`
   before returning. `text/document` does its own resolution inside the
   script sandbox; the dispatcher leaves it alone.

For `text/document`, `validateDocument` is a thin async wrapper that
dynamic-imports `@/lib/document-script/validator` and returns its
`{ ok, errors }`. There is no AST mode any more — the entry sits in the
same `VALIDATORS` map as every other type and the prior dispatcher
early-branch is gone (`_validate-artifact.ts:169-177`).

Persistence is **optimistically locked** on the Prisma `Document.updatedAt`
column for both update paths. Concurrent writers hit `count: 0` from
`updateMany` and surface a 409 (HTTP) or
`{ updated: false, error: "Concurrent update detected…" }` (LLM tool).

Deletion is **complete**: `deleteDashboardChatSessionArtifact` removes the
canonical S3 object, versioned S3 keys from `metadata.versions[].s3Key`,
the SurrealDB RAG chunks, and the Postgres row. Session delete also
flattens versioned S3 keys into a bulk `deleteFiles` (rescan **N-47**
fixed) — `findArtifactsBySessionId` selects `metadata` so the cascade can
read versions.

Twelve types remain. The **`image-text` slide layout is deprecated** —
existing artifacts validate with a warning, new artifacts hard-error
(`ctx.isNew`). **`text/document` is single-format only** (post `a81c343`):
docx-js script. The renderer fetches a server-rendered PNG carousel via
`/render-status` + `/render-pages/[contentHash]/[pageIndex]`.

Mermaid rendering exists in **two artifact-side paths** (browser SVG →
live preview via the standalone renderer; client PNG → PPTX export)
sharing the `mermaid-config.ts` + `mermaid-theme.ts` modules. The
server-side `mermaid-to-svg.ts` was removed with `a81c343` — DOCX
exports built by the `text/document` script path emit mermaid via
whatever the script writes. **Streamdown's internal mermaid pipeline
is a separate third path** that does not use `getMermaidConfig` and is
not consolidated (D-25).

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
| `text/markdown` | Markdown | `.md` | ✓ | `StreamdownContent` | `validateMarkdown` | `prompts/artifacts/markdown.ts` |
| `text/document` | Document | `.docx` | ✗ | `document-script-renderer.tsx` | `validateDocument` (delegates to `validateScriptArtifact`) | `prompts/artifacts/document.ts` |
| `application/code` | Code | `.txt` | ✗ | `StreamdownContent` (fenced) | `validateCode` | `prompts/artifacts/code.ts` |
| `application/sheet` | Spreadsheet | `.csv` | ✓ | `sheet-renderer.tsx` | `validateSheet` | `prompts/artifacts/sheet.ts` |
| `text/latex` | LaTeX / Math | `.tex` | ✓ | `latex-renderer.tsx` | `validateLatex` | `prompts/artifacts/latex.ts` |
| `application/slides` | Slides | `.pptx`† | ✓ | `slides-renderer.tsx` | `validateSlides` | `prompts/artifacts/slides.ts` |
| `application/python` | Python Script | `.py` | ✓ | `python-renderer.tsx` | `validatePython` | `prompts/artifacts/python.ts` |
| `application/3d` | R3F 3D Scene | `.tsx` | ✓ | `r3f-renderer.tsx` | `validate3d` | `prompts/artifacts/r3f.ts` |

† The S3 canonical key for `application/slides` ends in `.pptx` even
though stored content is JSON — exporters convert on the fly.

`hasCodeTab: false` for `application/code` (the preview *is* the code) and
`text/document` (the preview is the source of truth — the "Code" tab no
longer exists for any type post panel-chrome overhaul).

The prompt-module label for `text/markdown` is `"Markdown"` and for
`text/document` is `"Document"` — the prior doc's claim that both used
`"Document"` (N-17) was incorrect and is refuted by this rescan
(`markdown.ts:5-7` documents the explicit change).

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
     │  • For text/document: documentFormat = "script" (hardcoded; create-artifact.ts:18)
     ▼
validateArtifactContent(type, content, { isNew: true })
     │  • Promise.race against 5-second timer (VALIDATE_TIMEOUT_MS)
     │  • Per-type validator (sync or async) from VALIDATORS map.
     │    For text/document, validateDocument delegates to validateScriptArtifact
     │    (TS check + sandbox dry-run + .docx magic-byte check).
     │  • Post-resolve Unsplash for text/html and application/slides
     │
     ├── ok=false → return { persisted: false, error, validationErrors }
     │             AI SDK retry loop signals the LLM to self-correct.
     │
     ▼ ok=true
finalContent = validation.content ?? content
     │
     ▼
S3 upload (canonical key: artifacts/<orgId|"global">/<sessionId|"orphan">/<id><ext>)
     │
     ▼
prisma.document.create({
  id, title, content: finalContent, artifactType,
  sessionId, organizationId, createdBy, s3Key,
  fileType: "artifact", fileSize, mimeType,
  ...(type === "text/document" ? { documentFormat: "script" } : {}),
  metadata: { artifactLanguage, validationWarnings? }
})
     │
     ▼ background, fire-and-forget
indexArtifactContent(id, title, finalContent)
     │  • resolveTextToEmbed (extra DB round-trip; for script docs runs
     │    sandbox + extractDocxText)
     │  • chunkDocument() (1000-char / 200-overlap)
     │  • generateEmbeddings() → storeChunks() (concurrency 8, sequential batches)
     │  • markRagStatus(id, true|false) on metadata (read-then-write — not atomic)
     │  • NEVER rethrows; failure path writes ragIndexed:false and returns
     │
     ▼
return { id, title, type, content: finalContent, language, persisted,
         warnings? }
     │
     ▼
chat-workspace.tsx onToolUpdate
     │  • addOrUpdateArtifact() → useArtifacts state
     │  • on tool error / malformed output: removeArtifact("streaming-${toolCallId}")
     │    (commit 2897c9a — fixes ghost artifacts on failed validation)
     │  • does NOT auto-open the artifact panel — user must click the indicator
```

**Streaming.** When `tool-input-available` arrives mid-stream, the
chat-workspace adds a placeholder artifact with id `streaming-${toolCallId}`
so the panel can show progressive content. On `tool-output-available`
with `out.persisted === true`, the placeholder is removed and the real
artifact takes its place. **If the user aborts mid-stream**, the
`sendMessage` catch block iterates `createdStreamingIds` and removes
every placeholder — fixing the prior N-4 leak.

**`ctx.isNew = true`** is hardcoded for create. Two validators consume it:
`validateMarkdown` enforces a 128 KiB cap, `validateSlides` rejects the
deprecated `image-text` layout. Every other validator (incl.
`validateDocument`, which only delegates) ignores it.

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
     ▼
validateArtifactContent(existing.artifactType, content)
     │  • failures → { updated: false, error: formatValidationError, validationErrors }
     ▼
finalContent = validation.content ?? content
     │
     ▼
Versioning
     │  • metadata.versions: append { title, timestamp, contentLength, s3Key? }
     │  • archive previous content to <s3Key>.v<N>;
     │    on failure → inline if ≤ 32 KiB else marker { archiveFailed: true }
     │  • FIFO eviction at 20 entries (MAX_VERSION_HISTORY); accumulate evictedVersionCount
     │  • upload new content to existing.s3Key
     ▼
prisma.document.updateMany({
  where: { id, updatedAt: existing.updatedAt },
  data: { content, title, fileSize, metadata }
})
     │  • count === 0 → return { updated: false, error: "Concurrent update detected…" }
     │  • count === 1 → continue
     ▼
indexArtifactContent(id, updatedTitle, finalContent, { isUpdate: true })  ← background
     │  • deletes prior chunks first (await), then re-chunks + embeds + stores
     ▼
return { id, title, content, type: existing.artifactType,
         updated: true, version, evictedVersionCount? }
```

**Optimistic locking.** Both create and update use
`prisma.document.updateMany({ where: { id, updatedAt: existing.updatedAt } })`.
A `count: 0` result means another writer beat us — both paths surface a
"Concurrent update detected" error.

**Version archive bytecount.** `Buffer.byteLength(existing.content, "utf8")`.
Inline fallback (`MAX_INLINE_FALLBACK_BYTES = 32 KiB`) only applies when
the versioned-key upload itself fails — the regular path always uses the
versioned S3 key.

---

## 4. End-to-end flow — manual edit via HTTP service

```
PUT /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
     │
     ▼
src/features/conversations/sessions/service.ts
     • updateDashboardChatSessionArtifact(orgId, userId, params, body)
     │  • auth + session ownership
     │  • prisma.document.findUnique
     │  • validateArtifactContent(existing.artifactType, content)
     │     ↳ ValidationContext only has `isNew` (which we don't set);
     │       no third-arg forwarding needed any more
     │  • finalContent = validation.content ?? content
     │  • versioning (same shape as LLM update_artifact)
     │  • optimistic lock via updateDashboardArtifactByIdLocked
     │  • indexArtifactContent(... , { isUpdate: true }).catch(...)   ← N-1 fixed
     ▼
DELETE /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
     │
     ▼
deleteDashboardChatSessionArtifact
     │  • deleteFile(existing.s3Key)                       (non-fatal)
     │  • deleteFiles(versionedKeys from metadata.versions) (non-fatal)
     │  • deleteChunksByDocumentId(artifactId)             (non-fatal)
     │  • deleteDashboardArtifactById(artifactId)
```

**Why the dual path?** Simpler edits (the user clicks Restore on a
historical version, the test suite seeds an artifact, an admin tool
patches a workspace) need to pass through the same validation but skip
the LLM tool-call surface. The HTTP path is also where the manual `Delete`
button on the panel lands.

**Edit-document POST endpoint.** Path:
`/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document`.
Rate-limited to 10 edits/60 s/user via an **in-process token bucket**
(not distributed-safe across Next.js workers). Accepts `{ editPrompt }`,
guards `artifactType === "text/document"`, calls
`llmRewriteWithRetry({ currentScript, editPrompt })`, then routes back
through `updateDashboardChatSessionArtifact` for the full versioning +
RAG re-index. The route handler validates the produced script via
`validateScriptArtifact` before persisting.

---

## 5. Validation pipeline

`src/lib/tools/builtin/_validate-artifact.ts` is a 2,000+ line dispatcher.
Its public surface is one function:

```ts
validateArtifactContent(
  type: ArtifactType,
  content: string,
  ctx?: { isNew?: boolean }
): Promise<{ ok: boolean; errors: string[]; warnings: string[]; content?: string }>
```

The dispatcher does three things, in order:

1. **Race against a 5-second timer** (`getValidateTimeoutMs()`). The
   `__setValidateTimeoutMsForTesting(ms)` shadow exists for unit tests.
   `.unref?.()` is called on the timer so Node can exit during tests.
2. **Per-type dispatch** via `VALIDATORS: Record<ArtifactType, …>`
   (lines 72-91). TypeScript exhaustiveness: adding a new entry to
   `ARTIFACT_REGISTRY` without a matching `VALIDATORS` slot is a compile
   error. `validateDocument` (`_validate-artifact.ts:169-177`) is in
   this map and dynamic-imports `validateScriptArtifact` — there is no
   longer an early-branch above the map.
3. **Post-validation Unsplash resolution** for `text/html`
   (`resolveImages`) and `application/slides` (`resolveSlideImages`).
   `text/document` does its own resolution inside the script sandbox;
   the dispatcher leaves it alone.

`formatValidationError(type, result)` (`_validate-artifact.ts:2111-2117`)
produces the standard error string:

> "Your `<type>` artifact has issues:
>  - <error 1>
>  - <error 2>
>  Fix these and call the tool again with the corrected content. Output
>  the COMPLETE corrected artifact — do not truncate."

Used identically by `create-artifact.ts`, `update-artifact.ts`, and
`service.ts`.

### Per-validator highlights

- `validateHtml`: parse5 walk; requires `<html><head><body>`, non-empty
  `<title>`, viewport meta; `<form action>` blocked (the iframe sandbox
  doesn't permit it anyway); inline `<style>` >10 lines = warning.
- `validateReact`: Babel AST. Requires `// @aesthetic: <direction>` on
  line 1 (env-gated hard error). Line 2 may be `// @fonts:`. Imports
  whitelisted to `react`, `react-dom`, `recharts`, `lucide-react`,
  `framer-motion`. Class components, `document.getElementById`, and CSS
  imports are hard errors.
- `validateSvg`: parse5; hard errors on `<style>`, `<script>`,
  `<foreignObject>`, external `href`, event handlers, missing
  `viewBox`/`xmlns`, hardcoded root `width=`/`height=`.
- `validateMermaid`: string check for known diagram types. The shared
  `MERMAID_DIAGRAM_TYPES` constant in `_mermaid-types.ts` lists **25
  entries** (verified verbatim); the prompt documents 19, so `graph`,
  `stateDiagram` (alongside `stateDiagram-v2`), `packet-beta`,
  `C4Container`, `C4Component`, `C4Deployment`, `requirementDiagram`,
  `architecture-beta` are accepted by the validator but the LLM never
  hears about them.
- `validateMarkdown`: `isNew` → 128 KiB hard cap. `RAW_HTML_DISALLOWED`
  warns on 10 entries: `details, summary, kbd, mark, iframe, video,
  audio, object, embed, table`. `<script>` is checked separately —
  warning by default, hard error if env
  `ARTIFACT_STRICT_MARKDOWN_VALIDATION=true`. Heading structure,
  untagged code fences = warnings.
- `validateDocument`: thin async wrapper that dynamic-imports
  `validateScriptArtifact` from `@/lib/document-script/validator`
  (TS check + sandbox dry-run + .docx magic-byte check) and returns
  its `{ ok, errors }`. `_ctx` is accepted but unused.
- `validateCode`: empty check, markdown-fence and HTML-document guards
  (hard errors), truncation-marker warnings, 512 KiB warning. **The
  `language` parameter is NOT validated.** The prompt says it's required;
  the validator never inspects it.
- `validateSheet`: three branches (CSV, JSON array, spec). Spec runs
  `parseSpec` (8 sheets / 500 cells / 200 formulas / 64 named ranges
  caps) and `evaluateWorkbook` (formula DAG with circular-ref detection).
- `validateLatex`: KaTeX subset. Hard errors on `\documentclass`,
  `\usepackage`, `\begin{document}`, `\includegraphics`, `\bibliography`,
  `\cite`, `\input`, `\include`, `\begin{tikzpicture}`, `\begin{figure}`,
  `\begin{table}`, `\begin{tabular}`. Warnings on `\verb`, `\label`,
  `\ref`, `\eqref`, `\begin{verbatim}`.
- `validateSlides`: JSON shape validation, per-layout required-field
  checks, `image-text` deprecation (error on `isNew`, warning otherwise),
  deck-shape warnings (size 7-12, first=title, last=closing).
- `validatePython`: Pyodide whitelist. `PYTHON_UNAVAILABLE_PACKAGES`
  is **15 entries** (verified): `requests, httpx, urllib3, flask, django,
  fastapi, sqlalchemy, selenium, tensorflow, torch, keras, transformers,
  cv2, pyarrow, polars`. Hard errors on those + `input()` + write-mode
  `open()`. Warnings for missing `print`/`plt.show`, `time.sleep > 2s`,
  `while True` without break. **Read-mode `open()` passes silently**
  even though the prompt forbids all `open()`.
- `validate3d`: hard errors on `<Canvas>`, `<OrbitControls>`,
  `<Environment>`, `document.*`, `requestAnimationFrame`,
  `new THREE.WebGLRenderer`, missing `export default`, markdown fences.
  Imports outside the whitelist = warnings.

---

## 6. Renderer dispatch

```
artifact-panel.tsx (artifact-panel.tsx:696-708)
   │
   ├── text/document + sessionId
   │     → DocumentScriptRenderer (PNG carousel from /render-status + /render-pages)
   │
   ├── text/document + no sessionId
   │     → "Preview unavailable: missing session context."
   │
   └── any other type
         → ArtifactRenderer (artifact-renderer.tsx:88-128)
            switch(artifact.type)
               text/html              → HtmlRenderer
               application/react      → ReactRenderer
               image/svg+xml          → SvgRenderer
               application/mermaid    → MermaidRenderer
               text/markdown          → StreamdownContent (raw)
               application/code       → StreamdownContent (fenced, language)
               application/sheet      → SheetRenderer → SpecWorkbookView | CsvOrArrayView
               text/latex             → LatexRenderer
               application/slides     → SlidesRenderer
               application/python     → PythonRenderer
               application/3d         → R3FRenderer
               (text/document falls to default <pre> — never reached
                because the panel intercepts above)
```

**Note:** `ArtifactRenderer` no longer has a `text/document` case; the
panel intercepts above the dispatcher. Any future caller that mounts
`<ArtifactRenderer artifact={...} />` for a `text/document` artifact
will hit the `default` branch and see raw script source in a `<pre>`.

### Renderer sandboxing summary

| Renderer | Iframe? | Sandbox | Notes |
|---|---|---|---|
| `text/html` | yes | `allow-scripts allow-modals` | `_iframe-nav-blocker.ts` injected before user scripts |
| `application/react` | yes | `allow-scripts` | postMessage source-checked (`react-renderer.tsx:454-467`) |
| `image/svg+xml` | no | DOMPurify + DOMParser pre-validation | inline render |
| `application/mermaid` | no | renders inline as `<svg>` | `securityLevel: "strict"` in init |
| `text/latex` | no | KaTeX with `trust` callback restricting `\href`/`\url` to `https?://` | inline render |
| `application/3d` | yes | **none** (WebGL needs GPU access) | source-checked postMessage; `didReadyRef` for content swaps |
| `application/slides` | yes | `allow-scripts` only (post-tightening) | source-checked postMessage |
| `application/python` | no | inline Web Worker (Pyodide) | Blob URL revoked immediately after `new Worker()` |
| `application/sheet` | no | direct DOM (no scripting in spec) | formula eval is pure JS (`lib/spreadsheet/formulas`) |
| `text/markdown` | no | Streamdown (server-rendered MD) | own mermaid pipeline (separate from `mermaid-config.ts`) |
| `application/code` | no | StreamdownContent fenced block | adaptive fence length |
| `text/document` | no | server-built PNG carousel | sandbox → soffice → pdftoppm; PNG bytes via `/render-pages/[hash]/[idx]` |

---

## 7. Panel chrome (post-overhaul)

The Preview/Code tab pair is gone. The panel header now contains, left to
right:

1. **Title** (truncated `h3`).
2. **Type badge** — short label from `TYPE_SHORT_LABELS`. Language suffix
   only for `application/code`; suppressed elsewhere (commit 2055021).
3. **Version navigator** (chevrons + counter) when
   `previousVersions.length > 0`. Tooltip surfaces `evictedVersionCount`.
4. **Restore button** when viewing a historical version. Disabled while
   `isSaving`.
5. **RAG-not-searchable badge** (amber) when `ragIndexed === false`.
6. **Copy** button.
7. **Download**:
   - `text/document`: split-button (Markdown `.md` + Word `.docx`). PDF
     intentionally absent.
   - All other types (incl. `application/sheet`): single button. **No
     in-sheet XLSX button** — commit 4d3d199 removed the duplicate.
8. **More menu** with a single "Delete artifact" item.
9. **Fullscreen toggle** — Escape exits, renders via `createPortal`.
10. **Close**.

### Per-renderer chrome that survived

- `application/sheet` has Data/Charts toggle inside `SpecWorkbookView`
  (rendered only when `spec.charts.length > 0`). Excel-feel grid: column
  letters with active-column blue highlight, sticky row gutter, frozen
  borders, top-of-renderer `SheetFormulaBar` (Name Box + ƒx + formula
  display), bottom sheet tabs. **None of this is panel chrome** —
  switching artifacts replaces the whole content area.
- `application/slides` has a navigation strip (prev/next + dot strip when
  `1 < totalSlides ≤ 20`) inside the renderer.
- `application/python` has Run / Stop buttons + output panel inside the
  renderer.

---

## 8. State machine — `useArtifacts` + chat-workspace

`useArtifacts` (`use-artifacts.ts`) holds `Map<string, Artifact>` plus
`activeArtifactId`. Operations:

- `addOrUpdateArtifact(artifact)` — if the id exists, push the previous
  `{ content, title, timestamp }` to `previousVersions`, increment
  `version`, merge incoming fields. Else insert fresh.
- `removeArtifact(id)` — delete; null `activeArtifactId` if matches.
- `loadFromPersisted(persisted[])` — fresh Map; preserves the active id
  if still present. No `documentFormat` hydration any more — the field
  was dropped from `Artifact` and `PersistedArtifact` with `a81c343`.

Chat-workspace owns the streaming lifecycle via two per-`sendMessage`
maps:

```ts
const preStreamSnapshots = new Map<string, Artifact | null>()
const createdStreamingIds = new Set<string>()
```

Tool input arrives → if `create_artifact`, generate
`streaming-${toolCallId}` and add it to `createdStreamingIds`; if
`update_artifact`, pre-stream snapshot the current artifact and stash in
`preStreamSnapshots`.

Tool output arrives:

- **`create_artifact` success**: remove placeholder, add real artifact.
- **`create_artifact` failure**: remove placeholder + log warning. **Fixes
  ghost artifacts** (commit 2897c9a).
- **`update_artifact` success**: `addOrUpdateArtifact` with the new
  content/title. Drop snapshot.
- **`update_artifact` failure**: restore pre-stream snapshot via
  `addOrUpdateArtifact(snapshot)`. Drop snapshot.

**Abort.** `handleStop` is 3 lines — only fires `abortControllerRef.abort()`.
The catch block at `chat-workspace.tsx:2499-2523` iterates
`createdStreamingIds` removing each, then iterates `preStreamSnapshots`
restoring each, then clears both. The `if (err instanceof DOMException &&
err.name === "AbortError")` guard at L2526 calls `setIsStreaming(false)`
and returns — skipping the error toast for user-initiated stops. **Fixes
N-4** (streaming placeholder leak on abort).

---

## 9. Persistence service layer

`src/features/conversations/sessions/service.ts` exposes:

- `getDashboardChatSessionArtifact(orgId, userId, params)` — fetch + auth.
- `updateDashboardChatSessionArtifact(orgId, userId, params, body)` —
  the manual-edit path. Calls `validateArtifactContent(type, content)`
  with no third arg; `ValidationContext` only has `isNew` and the
  manual edit path doesn't set it.
- `deleteDashboardChatSessionArtifact(orgId, userId, params)` — cleans
  S3 canonical, S3 versioned, RAG chunks, Postgres row.

`src/features/conversations/sessions/repository.ts` exposes the Prisma
query layer:

- `findDashboardArtifactById(id)` — single fetch.
- `updateDashboardArtifactByIdLocked(id, expectedUpdatedAt, data)` —
  `updateMany` with optimistic-lock predicate; returns `null` on count 0.
- `deleteDashboardArtifactById(id)` — row delete.
- `findArtifactsBySessionId(sessionId)` — selects `id, s3Key, metadata`.
  The `metadata` selection is what enables session-delete to flatten
  versioned S3 keys.

Session delete (`service.ts:290-340`):
1. `findArtifactsBySessionId(sessionId)`.
2. Flatten `artifact.s3Key` + `metadata.versions[].s3Key` into one
   `s3Keys[]` array.
3. `deleteFiles(s3Keys)` — bulk batches ≤ 1000, non-fatal.
4. `Promise.allSettled(artifacts.map(a => deleteChunksByDocumentId(a.id)))`.
5. Single Prisma transaction:
   `[document.deleteMany({ where: { sessionId, artifactType: { not: null }}}), dashboardSession.delete(...)]`.

Versioned S3 cleanup at session delete is **confirmed fixed** — N-47
resolved.

---

## 10. RAG indexing

`src/lib/rag/artifact-indexer.ts` exposes `indexArtifactContent(documentId,
title, content, options?)`:

1. If `options.isUpdate` is true, **synchronously await**
   `deleteChunksByDocumentId(documentId)`.
2. `resolveTextToEmbed(documentId, content)` — fetches the DB row via a
   second `findUnique` (avoidable round-trip, D-7) to read `artifactType`.
   For `text/document`, runs the sandbox and `extractDocxText` so the
   embedding text reflects the rendered DOCX, not the script source
   (D-47). Failures fall back to raw content.
3. `chunkDocument(textToEmbed, title, "ARTIFACT", undefined, { chunkSize:
   1000, chunkOverlap: 200 })` — recursive split on
   `["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "]`.
4. Zero chunks → `markRagStatus(documentId, false)`, return.
5. Title is prepended to each chunk text before embedding.
6. `generateEmbeddings(chunkTexts)` — `BATCH_SIZE = 128`,
   `EMBED_CONCURRENCY = 4`.
7. `storeChunks(documentId, chunks, embeddings)` — concurrency cap
   `STORE_CHUNKS_CONCURRENCY = 8`, sequential batches.
8. `markRagStatus(documentId, true)` — patches `metadata.ragIndexed = true`
   via Prisma read-then-write. **Not atomic** — concurrent metadata
   writers can clobber each other.
9. Exceptions: `markRagStatus(documentId, false).catch(() => {})`. Never
   rethrows.

Chunk IDs: `"${documentId}_${i}"`. On re-index, prior chunks are deleted
first, so IDs restart at `_0`.

---

## 11. Mermaid story (post AST-removal)

Two artifact-side mermaid paths share `mermaid-config.ts` +
`mermaid-theme.ts`:

1. **`mermaid-renderer.tsx`** (the standalone artifact). Module-level
   `mermaidPromise` cache. Calls `getMermaidConfig(theme)`,
   re-initializes only when theme changes. Theme keys: `resolvedTheme ===
   "dark"` → `"dark"`, else `"default"`. Init options:
   `securityLevel: "strict"`, `theme: "base"` with full `themeVariables`
   override. The prior `containerRef` and `deterministicIDSeed` were
   removed with `0b25e56` (D-22, D-23 closed).
2. **Client-side mermaid → PNG → PPTX** in
   `lib/rendering/client/mermaid-to-png.ts`. Browser-only path used by
   the slides PPTX exporter. Reads `getMermaidInitOptions(theme)` from
   `mermaid-theme.ts`.

The **server-side `mermaid-to-svg.ts` was removed with `a81c343`** —
the legacy `text/document` AST renderer was its only production caller,
and that has also gone. DOCX exports built by the new script path emit
mermaid through whatever the user-written script does.

The **outlier** is **Streamdown's internal mermaid pipeline**, which fires
when a markdown or code artifact contains a `mermaid` fenced block.
Streamdown manages its own mermaid integration; it does **not** call
`getMermaidConfig`. This is a separate config path that is not yet
consolidated — a real second source of truth for fenced mermaid in
markdown (D-25).

---

## 12. Findings (D-N)

Numbered `D-N` (deepscan-N) to distinguish from the earlier N-N series.
Originally written against `8b6e69b`; this rev marks status against
HEAD `a81c343`.

### Open

2. **D-2. `markRagStatus` is read-then-write, not atomic**
   (`artifact-indexer.ts`). Concurrent metadata writes (e.g.,
   update-artifact landing while a background re-index finishes) can
   clobber each other. Safer: `prisma.$executeRaw` with `jsonb_set`.
   (D-53 below was a duplicate.)

3. **D-3. PDF download not implemented**
   (`download/route.ts`). Only `?format=docx` is accepted; anything
   else returns 400 `Unsupported format: <x>`. Comment "wired up in a
   later task" was dropped during `a81c343` cleanup but the gap remains.

4. **D-4. Edit-document rate limiter is in-process only**
   (`edit-document/route.ts:17-30`). With N Next.js workers, effective
   rate is N × 10/60 s, not 10/60 s globally.

5. **D-5. S3 `deleteFiles` partial failure is logged but not escalated**
   (`s3/index.ts`). Per-object errors are logged only; `deleteFiles`
   does not throw or return them. Affects single-artifact versioned
   cleanup and session-delete bulk cleanup.

7. **D-7. `resolveTextToEmbed` does an extra DB round-trip**
   (`artifact-indexer.ts:74`). Avoidable by passing format as an
   option to `indexArtifactContent`.

8. **D-8. Sheet validator `evaluateWorkbook` is O(n²)**
   in dense DAGs (`_validate-artifact.ts`, `parseSpec` + eval). 5 s
   timeout protects the hot path, but moderate DAGs can take seconds.

9. **D-9. No GET handler for a single artifact**. The route file only
   exports PUT and DELETE. Single-artifact reads happen via the session
   detail endpoint (`GET /sessions/[id]`), which returns all artifacts
   on the session.

11. **D-11. `DocumentScriptRenderer` has no retry button on error**
    (`document-script-renderer.tsx`). Slides + mermaid have retry; this
    doesn't.

13. **D-13. Mermaid type list drift**. `_mermaid-types.ts` has **25
    entries** (verified verbatim). The mermaid prompt documents 19.
    Validator silently accepts the extras: `graph`, `stateDiagram`
    (alongside `stateDiagram-v2`), `packet-beta`, `C4Container`,
    `C4Component`, `C4Deployment`, `requirementDiagram`,
    `architecture-beta`. LLM never hears about them.

14. **D-14. Slides severity gaps**. Prompt MUST/anti-pattern rules
    (first=title, last=closing, deck size 7-12, dark primaryColor) are
    warnings-only or absent in the validator. Invalid decks persist.

15. **D-15. Markdown 128 KiB cap not in prompt**. Validator hard-fails
    new creates over 128 KiB; the prompt has zero size guidance, so the
    LLM cannot self-check.

16. **D-16. Python `open()` read-mode passes the validator**. Prompt
    forbids all `open()`; validator only checks write modes (`w`, `a`,
    `x`, `b+`).

17. **D-17. SVG decimal-place threshold mismatch**. Prompt says "round
    to 1 dp max"; validator warns at 3+ dp. Path with 2 dp passes but
    violates the prompt rule.

18. **D-18. `application/code` `language` parameter is unvalidated**.
    Prompt declares it REQUIRED; validator has zero enforcement.

19. **D-19. Pie chart `fillOpacity` floor missing**
    (`sheet-chart-view.tsx`). `fillOpacity={1 - i * 0.1}` becomes ≤ 0
    at 11+ slices; slices become invisible.

20. **D-20. Sheet `view` state shared across sheet tabs**
    (`sheet-spec-view.tsx`). Switching to a sheet with charts shows the
    Data/Charts toggle; switching back does not reset to "data".
    Per-sheet view state would be cleaner.

24. **D-24. `@fonts` directive on line 2 depends on line 1 being a
    directive** (`_react-directives.ts`). If line 1 is blank/non-directive,
    a `@fonts` line on line 2 is silently stripped without an
    `@aesthetic` to pair with it.

25. **D-25. Streamdown's internal mermaid path is not consolidated**
    under `mermaid-config.ts`. A second config source-of-truth for
    fenced mermaid in markdown.

26. **D-26. `html-renderer` `allow-modals`** (`html-renderer.tsx:128`)
    widens the sandbox vs `react-renderer`'s `allow-scripts` only —
    `alert()`, `confirm()`, `prompt()` work in HTML artifacts. UX
    choice, not a bug, but worth documenting.

27. **D-27. Python renderer hardcodes triple-backtick fence**
    (`python-renderer.tsx`). Unlike `application/code`'s adaptive fence
    length, Python with embedded triple-backticks (e.g., docstrings
    with markdown examples) breaks Streamdown rendering.

28. **D-28. `DocumentScriptRenderer` imports `lucide-react` directly**
    (L3) — every other renderer uses `@/lib/icons`. Inconsistent.

29. **D-29. `<color>` tag stripping is undocumented in validator**
    (validator comment vs check mismatch). The R3F renderer's
    `sanitizeSceneCode` strips `<color>`, but `validate3d` doesn't flag
    it as a warning or error.

30. **D-30. `unsaved-edit` guard for navigation away is absent**
    (`artifact-panel.tsx`). The `isSaving` flag prevents a second
    Restore click while one is in flight, but nothing prevents the
    user from navigating away mid-restore.

32. **D-32. Sandbox is an OS child process, not a VM or Worker**
    (`sandbox-runner.ts`). Isolation: `--max-old-space-size=256MB`
    flag, wall-clock SIGKILL after `timeoutMs` (default 10 s, 5 s for
    dry-run), 100 MiB stdout cap, and module-level fs/net blocking via
    a custom ESM loader hook (`sandbox-loader.mjs`) plus globalThis
    property shadows (`sandbox-wrapper.mjs`). **No cgroup, seccomp, or
    OS namespace isolation.** Child inherits full `process.env`
    including `DATABASE_URL` and any API keys. The threat model in
    code comments: "trusted-but-fallible LLM, not a malicious
    adversary."

33. **D-33. `Function` and `eval` are deliberately unblocked in the
    sandbox** (`sandbox-wrapper.mjs`). Documented rationale: `docx`
    transitively uses `function-bind`, which calls
    `Function.prototype.bind` at module load. Blocking `Function`
    breaks the `docx` import.

34. **D-34. Render-queue is a process-local counting semaphore**
    (`render-queue.ts`), default capacity 3 (`RENDER_CONCURRENCY` env
    override). No TTL, no lock timeout, no distributed coordination,
    no single-flight per `(artifactId, hash)`. Two simultaneous
    requests for the same artifact each run the full
    sandbox→soffice→pdftoppm pipeline.

35. **D-35. Render-pages route does not trigger a re-render**. If the
    PNG is not in S3, the route returns 404. Client must call
    `/render-status` first to populate the cache, then fetch
    individual pages. Two-step protocol is not enforced server-side.

36. **D-36. PNG cache reads are sequential** (`cache.ts`). 50-page
    document = 51 sequential S3 GETs (1 manifest + 50 pages). No
    `Promise.all`, no in-memory or Redis layer.

37. **D-37. `soffice` cold-start every call** (`docx-to-pdf.ts`). No
    daemon mode, no LibreOffice server pool. ~1-3 s overhead per
    render. The semaphore cap of 3 partially mitigates by throttling
    concurrency.

38. **D-38. Document-script metrics have zero external visibility**
    (`metrics.ts`). Nine in-memory counters — no Prometheus, StatsD,
    Datadog, no export endpoint. Process-local only.

39. **D-39. SLIDE_LAYOUTS contains 18 entries** (verified verbatim:
    title, content, two-column, section, quote, image-text, closing,
    diagram, image, chart, diagram-content, image-content,
    chart-content, hero, stats, gallery, comparison, features). The
    deprecated `image-text` is in the set.

40. **D-40. Slides has no primaryColor/secondaryColor hex whitelist
    in the validator.** Prompt declares 6 approved hexes for each but
    `validateSlides` does not check `theme.primaryColor` or
    `theme.secondaryColor` at all.

41. **D-41. `R3F_ALLOWED_DEPS` actual count is 34** — the header
    comment in the source claims 36. Off-by-two in the comment.

42. **D-42. SVG `<style>` block is a hard error** (in `validateSvg`)
    — error severity ("inline `<style>` leaks into host page CSS").

43. **D-43. HTML inline `<style>` >10 lines is a warning, not an error**
    (`validateHtml`, `MAX_INLINE_STYLE_LINES = 10`).

47. **D-47. RAG embedding text is the rendered DOCX for `text/document`**,
    not the script source (`artifact-indexer.ts` →
    `resolveTextToEmbed`). It runs the sandbox + `pandoc -f docx -t
    plain` to extract embeddable text. Adds the extra DB round-trip
    (D-7) and an extra sandbox spawn per index/re-index.

48. **D-48. `mermaid-theme.ts` and renderer-side `mermaid-config.ts`
    are complementary, not redundant**. `mermaid-theme.ts` is the
    export-layer source (used by client `mermaid-to-png.ts` for PPTX);
    `mermaid-config.ts` targets the live preview renderers. Both share
    the same theme-key vocabulary. (Server `mermaid-to-svg.ts`
    consumer was deleted with `a81c343`.)

51. **D-51. `chart-to-svg.ts` is hardcoded light theme** (no dark-mode
    variant). Used in PPTX export. Charts inside a dark-themed
    document render with light palettes regardless of caller intent.

52. **D-52. `uploadFile` returns empty `url` by default**
    (`s3/index.ts`). Callers must opt in via `options.includeUrl: true`
    to get a presigned download URL — avoids a per-upload presign
    round-trip on bulk operations.

54. **D-54. Edit-document LLM rewrite has at most 3 attempts**
    (`llm-rewrite.ts`: `MAX_RETRIES = 2`, total `1 + 2 = 3`). On
    validation failure, the previous error is appended to the
    `editPrompt` for self-correction.

55. **D-55. Edit-document rate limit explicitly process-local**
    (`edit-document/route.ts` comment). Marked as "not a substitute
    for a real distributed rate limiter." Same as D-4.

56. **D-56. `evaluateWorkbook` is a pure function**
    (`spreadsheet/formulas.ts`). Does not mutate the input spec or
    any shared state. Returns a fresh `WorkbookValues` Map. Safe to
    call concurrently for the same spec.

57. **D-57. No formula function whitelist**. `fast-formula-parser` (the
    underlying engine) handles its own ~150+ Excel function set
    natively. Unknown function names produce `#NAME?` from the parser,
    not from this codebase. There is no guard against the LLM emitting
    Excel functions that exist but are not desired.

58. **D-58. Array spillover not supported**. Modern Excel's dynamic
    arrays (`SORT`, `FILTER`, `UNIQUE` returning multi-cell ranges)
    are not implemented. `onRange` returns a 2D array but evaluator
    assigns the result only to the formula's own cell — no spill into
    adjacent cells.

59. **D-59. Range-type named ranges evaluate to `null` silently**
    (`formulas.ts` `onVariable`). Named ranges containing `:` (e.g.
    `"Data": "Sheet1!A1:A10"`) are tracked in dependency parsing but
    return `null` at evaluation. No error or warning surfaces.

61. **D-61. Two parallel number formatters**: `format.ts.formatNumber`
    (delegates to `numfmt`) used by the live grid;
    `styles.ts.formatCellValue` (handwritten) handles
    percent/decimals/thousands/dates. Different capabilities at
    different call sites.

62. **D-62. `format.ts` redundant branch** — both integer and float
    cases of a number with no format return `String(value)`. Dead-code
    smell.

63. **D-63. `SpecWorkbookView` is a two-pass render with no loading
    indicator** (`sheet-spec-view.tsx`). First paint: `parseSpec`
    runs synchronously in `useMemo`; `evaluateWorkbook` is
    dynamic-imported inside a `useEffect`. Until the effect resolves,
    formula cells show empty/raw values. No spinner during evaluation.

64. **D-64. XLSX export emits no chart objects** (`generate-xlsx.ts`).
    ExcelJS lacks a stable chart API. Charts exist only in the browser
    preview (Recharts inside `SheetChartView`). The downloaded `.xlsx`
    contains data ranges only.

65. **D-65. `note` cell style hardcodes `#666666`** in both
    `generate-xlsx.ts` and `styles.ts`. No `noteColor` theme key.
    Theme overrides cannot change this.

66. **D-66. Tailwind class strings in `styles.ts` diverge from theme
    hex values**. Dark-mode behavior is approximate — semantic
    overrides like `dark:text-blue-400` are used instead of the exact
    theme-specified hex.

67. **D-67. `_mermaid-types.ts` count is 25 entries**. Same observation
    as D-13 from a different angle. Verified verbatim.

### Resolved (closed since `8b6e69b`)

- **D-1. ~~HTTP PUT loses `documentFormat`~~** — `ValidationContext` no
  longer has a `documentFormat` field (`a81c343`). The discriminant is
  gone; service.ts:509 just passes `(type, content)`.
- **D-6. ~~Version entries lack `documentFormat`~~** — moot; the field
  is no longer part of the artifact shape (`a81c343`).
- **D-10. ~~`ArtifactRenderer` always routes `text/document` to
  `DocumentRenderer`~~** — `ArtifactRenderer` no longer has a
  `text/document` case (`a81c343`); the panel intercepts above the
  dispatcher.
- **D-12. ~~`EditDocumentModal` has no caller~~** — file deleted
  (`0b25e56`).
- **D-21. ~~R3F `ready` state is dead~~** — `setReady`/`ready` removed
  (`0b25e56`); `didReady` ref-only is what runs.
- **D-22. ~~Mermaid `containerRef` attached but never read~~** —
  removed (`0b25e56`).
- **D-23. ~~Mermaid `deterministicIDSeed` is inert~~** — removed
  from `mermaid-config.ts` (`02e24a6`/`0b25e56`).
- **D-31. ~~`text/document` script-mode skips `isNew` size cap~~** —
  there is no other mode any more; nothing to skip.
- **D-44. ~~AST header/footer schemas allow empty arrays~~** — AST
  schema removed (`a81c343`).
- **D-45 / D-70. ~~Footnotes silently drop tables~~** — AST
  `to-docx.ts` removed (`a81c343`).
- **D-46. ~~`validateDocument` accepts `_ctx` but never reads it~~** —
  technically still true (`_ctx` argument unused), but expected: the
  validator only delegates to `validateScriptArtifact`, and
  `ValidationContext` no longer carries the `documentFormat` discriminant
  that mattered. Down-graded to a code-tidy nit, not a behavioural gap.
- **D-49 / D-68. ~~Server `mermaid-to-svg.ts` `securityLevel: "loose"`~~**
  — file removed (`a81c343`).
- **D-50 / D-69. ~~Server `mermaid-to-svg.ts` 8 px/char heuristic~~** —
  file removed (`a81c343`).
- **D-53. ~~Duplicate of D-2~~** — kept open under D-2.
- **D-60. ~~CSV tokenizer duplicated across three files~~** —
  `lib/spreadsheet/csv.ts` is now the single shared `tokenizeCsv`
  (`02e24a6`).

---

## 13. Glossary

- **Registry** — `ARTIFACT_REGISTRY` in `registry.ts`. The list, in order,
  of every artifact type with its label, extension, code-tab flag,
  language hint.
- **Validator** — `validateArtifactContent(type, content, ctx?)`. The
  one entry point every persistence path runs through.
- **Renderer** — the React component that displays the artifact in the
  panel. Always under `renderers/`. Lazy-loaded for heavy renderers.
- **Panel** — `<ArtifactPanel>` in `artifact-panel.tsx`. The fixed-size
  preview pane on the right of the chat workspace.
- **Indicator** — `<ArtifactIndicator>` — the small chat-bubble pill that
  links to the panel.
- **`canvasMode`** — string the user can set in the chat input toolbar
  to lock all subsequent artifacts to a single type. `"auto"` means no
  lock.
- **`documentFormat`** — removed entirely (column dropped via migration
  `20260429100656_drop_document_format`). The discriminant existed only
  to switch between AST and script renderers; with AST gone, the field
  has no readers and was retired.
- **Optimistic lock** — `prisma.document.updateMany({ where: { id,
  updatedAt: existing.updatedAt }, data: ... })`. Returns `count: 0` on
  conflict.
- **Versioned S3 key** — `<canonical>.v<N>` — every update archives the
  prior content here before overwriting the canonical key.
- **RAG re-index** — for updates, prior SurrealDB chunks are deleted
  before new ones are inserted; `metadata.ragIndexed` is patched at the
  end.
- **Streaming placeholder** — `streaming-${toolCallId}` artifact id used
  while a `create_artifact` tool call is mid-stream. Replaced or removed
  on `tool-output-available` / abort.
