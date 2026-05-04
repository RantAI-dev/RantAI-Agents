# Artifact System — Deepscan

> **Last regenerated:** 2026-05-04, post Python notebook redesign +
> validator notebook-cell rewrite + ~100-finding cleanup pass, pinned
> to commit `78e2b0a`. Sourced from a ground-up rescan that verified
> every cited surface against the working tree, file-by-file, with
> five parallel code-explorer agents covering: notebook subsystem,
> validation core, renderers+panel+state, subsystem libs (document-
> script + spreadsheet + rendering + rag + s3 + unsplash), and
> registry+prompts+API+sessions.
>
> **Companion docs:**
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit per module.
> - [`artifacts-capabilities.md`](./artifacts-capabilities.md) — per-type capability spec.
>
> **Major changes since the prior `68b9d66` cut (48 commits):**
>
> - **Python artifact rebuilt as a Jupyter-style notebook**
>   (`78e2b0a` merge of `feature/python-canvas-llm-first`). Content
>   is now `{ "cells": [...] }` JSON, executed cell-by-cell in a
>   Pyodide Web Worker. The flat-script `python-renderer.tsx` is
>   deleted. New libraries: `lib/notebook/*` (engine), `lib/workers/*`
>   (kernel), `renderers/notebook/*` (UI).
> - **Validator rewritten end-to-end for the notebook schema**
>   (commit `d19c2e7`). `validatePython` now lives at
>   `_validate-artifact.ts:2065-L2174` and enforces cell-array
>   shape, per-cell field validation, package allow-list, and
>   `input()`/`open()` bans.
> - **`cleanup/artifact-system` close-out** (`2e17641`) closed ~100
>   D-N findings across two re-scan rounds. Notable code changes:
>   - `.md` document download dropped (`e62ccde`); split-button now
>     `.docx` + `.pdf` only.
>   - Retry button on `DocumentScriptRenderer` (`b886805`); D-11
>     closed.
>   - Sheet `view` state resets on content change AND tab switch
>     (`4e06a7f`); D-20 closed.
>   - Pie chart `fillOpacity` floors at 0.25 (`4e06a7f`); D-19 closed
>     via floor.
>   - R3F `<color attach="background">` explicitly preserved
>     (`3ea9e3e`); D-29 closed end-to-end.
>   - Sandbox `http2` symmetric block in loader + wrapper (`414fe1a`);
>     D-76 closed.
>   - DOCX text process-cache for RAG (`4232559`); D-47 closed.
>   - Atomic `markRagStatus` via `jsonb_set` (`4232559`); D-2 closed.
>   - Single-flight + FIFO DOCX cache for download path
>     (`9aeb8b7`); NEW-D-96 closed.
>   - `chart-to-svg` theme parameter (`9732b9a`) wired through
>     slides exporters (`c41d32c`); D-51 closed end-to-end.
>   - Numeric pdf page sort (`414fe1a`); D-84 closed.
>   - PDF download support (`b886805`); D-3 closed.
>   - Metrics endpoint with **ADMIN gate** (`3ea9e3e`); NEW-D-97
>     closed. D-38 closed end-to-end.
>   - `s3.uploadStream` removed (`6c1dd82`, zero callers); D-80
>     closed via deletion. `lib/rendering/resize-svg.ts` removed
>     (`6c1dd82`); D-85 moot. `edit-document/route.ts` and
>     `lib/document-script/llm-rewrite.ts` deleted (`6c1dd82`).
>   - `validateCode` `ctx.language` cross-validation against canonical
>     Shiki list (`414fe1a`); D-18 closed.
>   - Slides hex whitelist hard-error on `ctx.isNew` (`939d277`);
>     D-40 closed.
>   - `S3Paths.artifact` applies `sessionId || "orphan"` fallback
>     (`7384337`); D-69 closed.
>   - `render-pages` route session-ownership check (`7d24aed`);
>     D-72 closed.
>   - `prompts/index.ts satisfies` enforces `examples` (`10ad714`);
>     D-83 closed.
>   - Embedding `BATCH_SIZE`/`EMBED_CONCURRENCY` env-overridable
>     (`4232559`); D-82 closed.
>   - Markdown 128 KiB cap surfaced in prompt (`10ad714`); D-15
>     closed.

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
   (5 s timeout, post-Unsplash for HTML/slides, ctx.isNew + ctx.language on create only)
        │                                       │
        ▼                                       ▼
 prisma.document direct                updateDashboardChatSessionArtifact
 + S3 + RAG indexing                   + S3 + RAG re-index
```

Both paths re-index RAG and run the same validator. `ValidationContext`
carries `isNew` (markdown cap, slides deprecation + hex whitelist) and
`language` (code canonical-language warning) — only the LLM tool path
uses the latter, but the HTTP path could now too.

A single `validateArtifactContent(type, content, ctx?)` is the entry
point every persistence path runs through. It does three jobs:

1. Dispatches to the per-type validator with a **5-second wall-clock
   timeout** (`VALIDATE_TIMEOUT_MS`).
2. Carries optional `ValidationContext.isNew` and
   `ValidationContext.language`. `validateMarkdown` enforces the
   128 KiB cap with `isNew`; `validateSlides` rejects deprecated
   `image-text` and enforces the color whitelist on `isNew`;
   `validateCode` warns on non-canonical languages via `language`.
3. **Post-resolves Unsplash** for `text/html` and `application/slides`
   before returning. `text/document` does its own resolution inside the
   script sandbox; the dispatcher leaves it alone.

For `text/document`, `validateDocument` (`_validate-artifact.ts:186-L196`)
is a thin async wrapper that dynamic-imports
`@/lib/document-script/validator`. It accepts `_ctx` for shape
consistency post-rescan but doesn't currently use it.

Persistence is **optimistically locked** on the Prisma
`Document.updatedAt` column for both update paths. Concurrent writers
hit `count: 0` from `updateMany` and surface a 409 (HTTP) or
`{ updated: false, error: "Concurrent update detected…" }` (LLM tool).
The two paths use **different error message strings** (D-70 by-design).

Deletion is **complete**: `deleteDashboardChatSessionArtifact` removes
the canonical S3 object, versioned S3 keys from
`metadata.versions[].s3Key`, the SurrealDB RAG chunks, and the
Postgres row. Session delete also flattens versioned S3 keys into a
bulk `deleteFiles`.

Twelve types remain. **`application/python` is now a Jupyter-style
notebook**, not a flat script. **`text/document` exposes `.docx` +
`.pdf`** through the same server endpoint, both routed through a
single-flight + FIFO cache. **`application/python` exposes `.ipynb` +
`.py` (percent) + `.html`** via a three-item split-button. Every
other type uses a single Download button.

Mermaid rendering exists in **two artifact-side paths** (browser SVG
→ live preview; client PNG → PPTX export) sharing
`mermaid-config.ts` + `mermaid-theme.ts`. The server-side
`mermaid-to-svg.ts` was removed with `a81c343`. Streamdown's internal
mermaid pipeline is a **separate third path** that does not use
`getMermaidConfig` (D-25 by-design).

---

## 1. The twelve artifact types

**Source of truth:** `src/features/conversations/components/chat/artifacts/registry.ts`.
Everything else (`ARTIFACT_TYPES`, `VALID_ARTIFACT_TYPES`,
`TYPE_ICONS`, `TYPE_LABELS`, `TYPE_SHORT_LABELS`, `TYPE_COLORS`, the
Zod enum on `create_artifact`, the `Record<ArtifactType, …>` validator
dispatch, the renderer switch, the panel chrome) is derived from
`ARTIFACT_REGISTRY` (L62-L183, exactly 12 entries).

| Type | Label (registry) | shortLabel | Ext | Code Tab | codeLanguage |
|------|------------------|------------|-----|----------|--------------|
| `text/html` | HTML Page | HTML | `.html` | ✓ | `html` |
| `application/react` | React Component | React | `.tsx` | ✓ | `tsx` |
| `image/svg+xml` | SVG Graphic | SVG | `.svg` | ✓ | `svg` |
| `application/mermaid` | Mermaid Diagram | Mermaid | `.mmd` | ✓ | `mermaid` |
| `text/markdown` | Markdown | Markdown | `.md` | ✓ | `markdown` |
| `text/document` | Document | Document | `.docx` | ✗ | `""` |
| `application/code` | Code | Code | `.txt` | ✗ | `""` |
| `application/sheet` | Spreadsheet | Spreadsheet | `.csv` | ✓ | `csv` |
| `text/latex` | LaTeX / Math | LaTeX | `.tex` | ✓ | `latex` |
| `application/slides` | Slides | Slides | `.pptx`† | ✓ | `json` |
| `application/python` | **Python Script** ‡ | Python | `.py` | ✓ | `python` |
| `application/3d` | 3D Scene | R3F Scene | `.tsx` | ✓ | `tsx` |

† S3 canonical key for `application/slides` ends in `.pptx` even
though stored content is JSON — exporters convert on the fly.

‡ **Label drift (D-68 residual).** The prompt module
(`prompts/artifacts/python.ts`) exports `label = "Python Notebook"`,
not `"Python Script"`. `CANVAS_TYPE_LABELS` and panel chrome surface
different copy depending on which source they read. Same class as
`application/3d`'s registry/shortLabel/prompt drift (now reduced to
shortLabel `"R3F Scene"` vs labels `"3D Scene"`).

`hasCodeTab: false` for `application/code` (the preview *is* the code) and
`text/document` (the preview is the source of truth).

---

## 2. End-to-end flow — LLM creates an artifact

```
Chat tool call (AI SDK v6)
     │
     ▼
src/lib/tools/builtin/create-artifact.ts
     │  • Zod params: { title, type (enum from ARTIFACT_TYPES), content, language? }
     │  • 512 KiB content cap — MAX_ARTIFACT_CONTENT_BYTES (L16)
     │  • Canvas-mode lock guard (L62-L85)
     │  • application/code requires `language` arg (L88-L101)
     │  • UUID id generated (L42)
     ▼
validateArtifactContent(type, content, { isNew: true, language })  ← L106-L109
     │  • Promise.race against 5-second timer (DEFAULT_VALIDATE_TIMEOUT_MS = 5000, L123)
     │  • Per-type validator (sync or async) from VALIDATORS map (L89-L108)
     │  • Post-resolve Unsplash for text/html and application/slides (L166-L179)
     │
     ├── ok=false → return { persisted: false, error, validationErrors }
     │             AI SDK retry loop signals the LLM to self-correct.
     │
     ▼ ok=true
finalContent = validation.content ?? content   ← L127 (Unsplash pickup)
     │
     ▼
S3 upload — canonical key: artifacts/${orgId || "global"}/${sessionId || "orphan"}/${id}${ext}   ← L131-L145
     │  D-69 closed: sessionId fallback applied.
     ▼
prisma.document.create({                                             ← L148-L169
  id, title, content: finalContent, artifactType,
  sessionId, organizationId, createdBy, s3Key,
  fileType: "artifact", fileSize, mimeType,
  metadata: { artifactLanguage, validationWarnings? }
})
     │
     ▼
indexArtifactContent(id, title, finalContent, { artifactType: type })   ← L171
     │  Fire-and-forget. Atomic markRagStatus via jsonb_set (D-2 closed).
     │  Caller passes artifactType so resolveTextToEmbed skips findUnique.
     ▼
return { persisted: true, artifact: {...}, warnings? }
```

Failure modes:

- **Validator throws or rejects** (e.g. timeout): caught and returned
  as `{ ok: false, error: "Validation threw…" }`.
- **S3 upload throws**: caught, content held inline in metadata if
  small enough, else marker written.
- **Prisma create throws**: returns `{ persisted: false, error }`.
- **RAG indexing throws**: swallowed — patches `metadata.ragIndexed
  = false` via the atomic helper.

---

## 3. End-to-end flow — LLM updates an artifact

`update-artifact.ts`:

1. Size cap (L51-L65).
2. `findUnique` to load `existing`. Not found → "Call create_artifact
   instead" message (L78-L87, Fix #23).
3. Canvas-mode mismatch guard against `existing.artifactType`
   (L95-L113).
4. `validateArtifactContent(existing.artifactType, content)` — no
   `isNew`, no `language` plumbed.
5. `finalContent = validation.content ?? content` (L141-L143,
   Fix #2 — Unsplash rewrite applied).
6. Read existing versions from `metadata.versions ?? []` (L150-L157).
   `versionNum = versions.length + 1`.
7. Upload prior content to `${existing.s3Key}.v${versionNum}`
   (L161-L170). On failure: inline if ≤ 32 KiB, else
   `{ archiveFailed: true }` marker.
8. Push new version record (L184-L191).
9. **FIFO eviction** if `versions.length > 20`: oldest entry is
   spliced out and its versioned S3 key is deleted in the background
   (L195-L199); evicted count tracked.
10. Overwrite canonical S3 key with `finalContent` (L202-L208).
11. **Optimistic lock**: `prisma.document.updateMany({ where: { id,
    updatedAt: existing.updatedAt }, ... })` (L215-L230). Returns
    `count: 0` on conflict; surface
    `{ updated: false, error: "Concurrent update detected: another
    writer modified this artifact between read and write. Re-fetch the
    artifact and retry the update." }` (LLM-flavored — D-70).
12. `indexArtifactContent(id, title, finalContent, { isUpdate: true,
    artifactType: existing.artifactType })` (L247-L251).
13. `{ updated: false, persisted: false, ... }` on persistence throw
    (L262-L271); `{ updated: true, ... }` on success.

---

## 4. End-to-end flow — Manual HTTP edit (PUT)

`PUT /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]`
(`route.ts`) → `updateDashboardChatSessionArtifact` in
`features/conversations/sessions/service.ts:475-L624`.

Mirrors the LLM update flow with these differences:

- Body is `DashboardChatSessionArtifactBodySchema`-validated.
- Calls `validateArtifactContent(existing.artifactType, String(content))`
  with no third arg — no `isNew`, no `language`.
- Concurrent-write surfaces 409 with HTTP-flavored message: "another
  writer changed this artifact while you were editing. Reload to see
  the latest version, then retry your save." (D-70 by-design).
- Always re-indexes RAG with `artifactType` (L610-L613).
- Optimistic-lock via repository's
  `updateDashboardArtifactByIdLocked(artifactId, existing.updatedAt,
  ...)` (L581-L594).

GET on the same route returns single-artifact data (D-9 closed).
DELETE cascades: canonical S3 + versioned S3 + RAG chunks + DB row
(L668-L698).

---

## 5. End-to-end flow — Session delete

`deleteDashboardChatSession` in `service.ts:286-L336`:

1. Find all artifacts in session via `findArtifactsBySessionId`
   (selects `id, s3Key, metadata` — `metadata` selection enables
   versioned-key cleanup).
2. Compose flat list of S3 keys to delete: canonical + each
   `metadata.versions[].s3Key`.
3. Bulk `deleteFiles` (L300-L316).
4. Per-artifact `deleteChunksByDocumentId` via `Promise.allSettled`
   (L319-L323).
5. Cascade Prisma transaction inlined (L329-L334) —
   `prisma.document.deleteMany({ where: { sessionId } })` plus
   session-row delete. The previously dead
   `repository.deleteArtifactsBySessionId` (D-75) was removed
   (`7384337`).

---

## 6. The validator dispatcher

`src/lib/tools/builtin/_validate-artifact.ts` (~2160 LoC).

| Surface | Line |
|---|---|
| `ValidationContext` interface (`isNew?`, `language?`) | L84-L87 |
| `VALIDATORS` map (12 entries, exhaustive) | L89-L108 |
| `DEFAULT_VALIDATE_TIMEOUT_MS = 5_000` | L123 |
| `VALIDATE_TIMEOUT_MS` (exported alias) | L133 |
| `__setValidateTimeoutMsForTesting()` | L140-L142 |
| `validateArtifactContent(type, content, ctx?)` | L144-L180 |
| Post-validation Unsplash hooks | L166-L179 |

Per-validator entry points (HEAD `78e2b0a`):

| Type | Validator | Entry | Notable |
|---|---|---|---|
| `text/document` | `validateDocument` | L186-L196 | Thin async wrapper; dynamic-imports `validateScriptArtifact`. Accepts `_ctx`. |
| `application/slides` | `validateSlides` | L263-L697 | 18 layouts, 6+6 hex whitelist, MIN/MAX deck (7/12), MAX_BULLETS (6), `MAX_BULLET_WORDS` (10). Visual layouts (diagram/image/chart/hero/stats/gallery/comparison/features) all validated. Hex error echoes uppercase form. |
| `application/3d` | `validate3d` | L749-L846 | `R3F_ALLOWED_DEPS` 34 entries. |
| `application/sheet` | `validateSheet` | L858-L1082 | 3-branch (CSV / JSON array / spec). Spec calls `parseSpec` + `evaluateWorkbook`. |
| `text/markdown` | `validateMarkdown` | L1091-L1208 | `MARKDOWN_NEW_CAP_BYTES = 128 * 1024`, gated on `isNew`. `RAW_HTML_DISALLOWED` 10 entries. `<script>` env-gated. Fence-language check. |
| `text/latex` | `validateLatex` | L1242-L1309 | `LATEX_UNSUPPORTED_COMMANDS`. |
| `application/code` | `validateCode` | L1345-L1412 | `CANONICAL_CODE_LANGUAGES` cross-checked via `ctx.language` (D-18 closed). Byte-based size guard. |
| `application/mermaid` | `validateMermaid` | L1428-L1524 | Uses shared `MERMAID_DIAGRAM_TYPES`. Error message generated from shared array. |
| `image/svg+xml` | `validateSvg` | L1538-L1677 | `<style>` = error. Path precision warning at 2+ dp. |
| `text/html` | `validateHtml` | L1683-L1799 | `MAX_INLINE_STYLE_LINES = 10` (warning). `<form action>` = error. `alert/confirm/prompt` = warning. |
| `application/react` | `validateReact` | L1878-L2037 | `@aesthetic` directions enforced; `@fonts` parsing. |
| `application/python` | `validatePython` | **L2065-L2174** | **Notebook-cell schema** — see §13. |

The dispatcher's prior early-branch for `text/document` is gone — it
flows through the `VALIDATORS` map.

---

## 7. Renderer dispatch

`src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`
(~136 LoC) is a single switch statement. The panel intercepts
`text/document` and routes it to `DocumentScriptRenderer` directly
(`artifact-panel.tsx:747-L759`).

Application-level dispatches:

- `text/html` → `HtmlRenderer` (sandbox `allow-scripts allow-modals`).
- `application/react` → `ReactRenderer` (sandbox `allow-scripts` only).
- `image/svg+xml` → `SvgRenderer` (no iframe, DOMPurify).
- `application/mermaid` → `MermaidRenderer` (no iframe, mermaid v11).
- `text/latex` → `LatexRenderer` (no iframe, KaTeX).
- `application/sheet` → `SheetRenderer` (lazy → `SpecWorkbookView` for
  spec, `CsvOrArrayView` otherwise).
- `application/slides` → `SlidesRenderer` (sandbox `allow-scripts`).
- **`application/python` → `NotebookRenderer`** (lazy-loaded, see §13).
- `application/3d` → `R3FRenderer` (no sandbox; needs WebGL).
- `application/code` → `StreamdownContent` adaptive fence.
- `text/markdown` → `StreamdownContent`.

The panel reads from the registry for chrome (icon, label, color,
short label, extension) and from the renderer-internal flag for
behaviour decisions. The legacy "Code" tab does not exist anymore —
preview is view-only across every type.

---

## 8. Panel chrome — `artifact-panel.tsx` (~892 LoC)

Top-down, the panel header surfaces:

- Title (truncated `<h3>`).
- Type badge (with language suffix only for `application/code`).
- Version pill (chevrons + counter, hidden when `!hasVersions`).
- Restore button (only when viewing historical and `onUpdateArtifact`).
- RAG-not-searchable badge (`ragIndexed === false`).
- Copy button (Check icon for 2 s after copy).
- **Download button** — type-specific:
  - `text/document` → DropdownMenu with **`.docx`** (default) and
    **`.pdf`** (no `.md`).
  - `application/python` → DropdownMenu with **`.ipynb`**, **`.py`**,
    **`.html`**.
  - All others → single button (extension from registry).
- More menu (Delete).
- Fullscreen toggle (`Maximize2` / `Minimize2`).
- Close button.
- Export-error banner (gated on `exportError && !isTextDocument`).

Body:

- `text/document + sessionId` → `DocumentScriptRenderer`.
- All other types → `<ArtifactRenderer>`.

State:

- `isSaving`, `saveError`, `isDeleting` (panel-owned actions).
- `isExporting`, `exportError` (download/preview actions).

---

## 9. The validator's three jobs

1. **Per-type rule check.** Each validator returns
   `{ ok, errors, warnings, content? }`. Errors block persistence;
   warnings are surfaced but not fatal. Some validators rewrite
   `content` (e.g. `validateSlides` normalizes hex; HTML/slides receive
   the post-Unsplash-resolved body via the dispatcher).
2. **5-second timeout** via `Promise.race` against
   `setTimeout(reject, VALIDATE_TIMEOUT_MS)`. Reasoning: the validator
   is the LLM's feedback loop. Long-running checks risk turning a
   tool call into a stall that the LLM can't recover from.
3. **Post-validation Unsplash resolution** for `text/html` and
   `application/slides`. Both call `resolveImages` /
   `resolveSlideImages` from `lib/unsplash`, which hit the
   `prisma.resolvedImage` 30-day cache and the Unsplash search API
   in parallel. `text/document` is exempt because its scripts can
   resolve their own images at render time.

---

## 10. Persistence — what's on disk vs in DB

For each artifact:

- **Postgres**: `Document` row keyed by UUID. Columns include
  `artifactType`, `s3Key`, `content` (the latest version, possibly
  inline-fallback), `metadata` (`artifactLanguage`,
  `validationWarnings`, `versions`, `evictedVersionCount`,
  `ragIndexed`).
- **S3**: canonical key `artifacts/${orgId|"global"}/${sessionId|"orphan"}/${id}${ext}`
  holds the latest content. Each prior version sits at
  `<canonical>.v<N>` where `N = versions.length + 1` at the time of
  write.
- **SurrealDB**: `kb_chunks` collection holds RAG chunks keyed
  `${documentId}_${i}`. Created via `storeChunks`, deleted via
  `deleteChunksByDocumentId`. Atomic flag in `Document.metadata.ragIndexed`.

Versioning quirks:

- `versions` is capped at 20 entries. **FIFO eviction**: oldest entry
  goes, its versioned S3 key is best-effort deleted, and
  `evictedVersionCount` is bumped.
- If a versioned-key upload fails, the version record uses an inline
  fallback (≤ 32 KiB raw, > 32 KiB marker `{ archiveFailed: true }`).

The `documentFormat` Prisma column was dropped by migration
`20260429100656_drop_document_format`. No code reads or writes it.

---

## 11. RAG embedding for artifacts

`indexArtifactContent` (`artifact-indexer.ts:25`) is fire-and-forget.
Flow:

1. If `isUpdate`, delete prior chunks by document id (L32-L34).
2. `resolveTextToEmbed(documentId, content, type)` (L42).
   - For `text/document`: dynamic-imports `sandbox-runner` and
     `extract-text`, runs the script in sandbox, pipes the rendered
     DOCX through `pandoc -f docx -t plain`. **128-entry process-local
     FIFO cache** keyed on SHA-256[:16] of content (D-47 closed).
     Falls back to raw script source on any failure.
   - For all other types: returns content as-is.
3. `chunkDocument` with `chunkSize=1000, chunkOverlap=200`.
4. Zero-chunk guard → `markRagStatus(false)`.
5. `generateEmbeddings(chunkTexts)`. `BATCH_SIZE` and
   `EMBED_CONCURRENCY` are env-overridable via
   `KB_EMBED_BATCH_SIZE` / `KB_EMBED_CONCURRENCY` (D-82 closed).
6. `storeChunks(documentId, chunks, embeddings)` —
   `STORE_CHUNKS_CONCURRENCY = 8` batched parallel.
7. `markRagStatus(true)` — atomic `prisma.$executeRaw` with
   `jsonb_set` and `COALESCE("metadata", '{}'::jsonb)` (D-2 closed).
8. Outer catch silently calls `markRagStatus(false).catch(()=>{})`.

The legacy `vector-store.storeDocument` (sequential loop, used by
knowledge-upload) and the newer `storeChunks` (batched parallel,
used by artifact indexer) are still divergent (D-81 deferred).

---

## 12. Findings — open gaps at HEAD `78e2b0a`

Resolved findings (closed, dead-code-deleted, by-design, and deferred-
with-separate-plan items D-2 through D-100) have been pruned from
this list — every D-N below is **live and needs work**. For the full
historical catalogue see git history of this file.

### Newly surfaced by this rescan (D-101 — D-111)

These are gaps the latest five-agent verification turned up that did
not exist in the prior `68b9d66` cut's findings list.

- **D-101 (notebook visible-output heuristic).** `validatePython`
  visible-output detection (`_validate-artifact.ts:2153-L2158`) uses
  a bare-expression regex that does not match cells whose final line
  is a numeric literal (`42`), list/dict display
  (`[x for x in data]`), or any non-identifier-prefixed expression.
  A common notebook idiom (`df.head()` qualifies, but `df` followed
  by `42` does not). LLM gets a spurious "no visible output" warning.
- **D-102 (notebook interrupt dead branch).** Worker-side
  `case "interrupt"` (`python-worker.ts:178`) is a no-op. The host
  terminates the worker via `useKernel` (`use-kernel.ts:185-L191`)
  before the worker sees the message, so the case is unreachable in
  practice. Misleading code; either delete the case or wire it to a
  cooperative-cancel via `pyodide.checkInterrupt()`.
- **D-103 (notebook executionCount unused in worker).**
  `WorkerRequest.run` (`python-worker-types.ts:2`) declares
  `executionCount`, and `use-kernel.ts:77` sends it. The worker
  destructures `{ cellId, source, timeoutMs }` only — the field is
  silently ignored. Counter is maintained client-side in
  `execCounterRef`. Either drop from the contract or honour it in
  the worker.
- **D-104 (notebook schema laxer than prompt for markdown cells).**
  `CellSchema` accepts `outputs: []` and `executionCount: null` for
  markdown cells (`lib/notebook/types.ts:30-L31`). Prompt forbids
  emitting them. Schema-level laxity is not enforced by validator
  either. Sub-bug only — the LLM can technically slip these through
  but the worker ignores them.
- **D-105 (notebook pin state ephemeral).** Pin state lives only in
  `sessionStorage` under `"notebook-pins:<artifactId>"`
  (`use-pin-to-chat.ts:6, L15`). Lost on tab close, not persisted
  to DB, not cross-tab. Cell outputs themselves are also ephemeral
  (kernel is per-page-load), so on reload all pinned references
  point to outputs that no longer exist. Wired-by-design but worth
  surfacing — the UI doesn't tell the user.
- **D-106 (validateSlides markdown-leakage regex false-positive).**
  Regex at `_validate-artifact.ts` ~L624 matches `**` anywhere as a
  markdown indicator. Legitimate strings like `"price: **$10**"`
  trip the warning. Low severity.
- **D-107 (validateSheet constant-column loop early-break).** JSON
  array all-identical-column check (`L985-L997`) breaks after the
  first offending column. Multi-column constant sheets get a single
  warning that doesn't enumerate the rest.
- **D-108 (validateCode byte-size warning unreachable).** `validateCode`
  warns at `> 512 * 1024` bytes (L1404-L1408). Same threshold as
  `MAX_ARTIFACT_CONTENT_BYTES` in `create-artifact.ts:16` and
  `update-artifact.ts:16`. By the time `validateCode` runs, both
  outer guards have already rejected. Warning is dead code.
- **D-109 (validateMermaid node-count heuristic over-counts).** Node-
  count regex at `_validate-artifact.ts:1507` matches identifier-
  followed-by-bracket. `subgraph` blocks inside flowcharts contain
  nodes that match the same pattern from inside the subgraph, double-
  counting. The 15-node warning may fire on legitimate decompositions.
- **D-110 (validateReact @fonts orphan-warning miss).**
  `_validate-artifact.ts:1905-L1909` only emits the orphan-`@fonts`
  warning when `rawAestheticLine` is falsy. If `@aesthetic` is
  present but invalid (unknown direction → error path), the parse
  result has `rawAestheticLine` truthy, so the orphan check never
  fires. `stripDirectiveLines` still strips both lines, so the LLM
  silently loses its `@fonts` along with the bad `@aesthetic`.
- **D-111 (update-artifact title leak on findUnique throw).**
  `update-artifact.ts:264` returns `newTitle ?? existingForReturn?.title`
  on persistence failure. `existingForReturn` is `null` if
  `findUnique` threw before L88, so the user sees `title: undefined`
  in the tool result. Asymmetric with the explicit not-found path
  (Fix #23) which handles the same surface correctly.

### Residual gaps from prior cuts (still open at HEAD)

- **D-13 (residual prose drift).** Mermaid prompt summary lists fewer
  diagram types than the validator accepts. Validator error message
  now generates from the shared array (so authors discover the full
  set via the error path), but the prompt-side summary is still stale.
- **D-14 (partial).** Slides MUST-rules (first=title, last=closing,
  deck size 7-12) are validator-enforced behaviour, but prompt copy
  still uses "validator convention" wording rather than "hard-error".
  Behaviour correct; prompt copy could be tightened.
- **D-16 (inverted).** `validatePython` now bans **all** `open(` calls,
  including read mode. The prompt only documents `open` under
  "absolutely not" without distinguishing mode. The validator is now
  stricter than the prompt — opposite direction of the original
  finding.
- **D-17 (narrowed).** SVG decimal-place mismatch — prompt says "1 dp
  max"; validator warns at 2+ dp (`\d{2,}` regex). A path with exactly
  2 dp passes the validator but violates the prompt rule.
- **D-46 (partial).** `validateDocument` accepts `_ctx` for shape
  consistency but does not pass it to `validateScriptArtifact`. Cannot
  apply `isNew`-only rules without a downstream signature change.
- **D-68 (residual, two variants).** Type-label drift across registry
  / shortLabel / prompt:
  - `application/python`: registry `"Python Script"` vs prompt
    `"Python Notebook"` — newly introduced by the notebook redesign.
  - `application/3d`: shortLabel `"R3F Scene"` while registry and
    prompt are both `"3D Scene"`.

### Deferred (open, tracked outside the D-N close-out)

- **D-37.** `soffice` cold-start every render call. Daemon-mode rewrite
  needs a subprocess-management overhaul; benchmark first.
- **D-64.** XLSX export emits no chart objects. ExcelJS upstream lacks
  a stable chart API. Track upstream or swap library.
- **D-81.** `vector-store.ts` two paths — legacy `storeDocument`
  (sequential, knowledge-upload) vs `storeChunks` (batched parallel,
  artifact indexer). Reconciliation needs careful test coverage to
  avoid behaviour drift on the metadata-enrichment side.

---

## 13. Notebook subsystem (NEW — `application/python`)

The Python artifact is a **Jupyter-style notebook**. Content schema,
validator behavior, kernel contract, and pin-to-chat flow:

### LLM wire format

```json
{
  "cells": [
    { "type": "code" | "markdown", "source": "..." },
    ...
  ]
}
```

The model must NOT emit `id`, `outputs`, or `executionCount` —
those are runtime fields populated by the kernel.

### `validatePython` (`_validate-artifact.ts:2065-L2174`)

Hard errors:

1. Empty content (L2071).
2. Bare script — content not starting with `{` (L2077). Explicit
   error message: "Python artifact content must be a notebook JSON
   object…".
3. JSON parse failure (L2086).
4. Missing top-level `cells` array (L2091).
5. Empty `cells` (L2097).
6. Non-object cell, missing/invalid `type` or `source` (L2111-L2118).
7. (code cells) Imports of unavailable packages — 15 entries with
   reason strings (L2136-L2144).
8. (code cells) `input(` (L2147) or `open(` (L2149).

Warnings:

- `time.sleep(N)` with N > 2 (L2161-L2163).
- `while True` without break (L2164-L2166).
- No cell produces visible output (L2169-L2171).

Comment-stripping (`stripComment` L2101-L2104) prevents false
positives from commented-out imports.

### Kernel — `lib/workers/python-worker.ts`

- **Pyodide v0.28.0** (L4-L5).
- Pre-loaded packages: `numpy`, `micropip`, `matplotlib`,
  `scikit-learn` (L22).
- `loadPackagesFromImports(source)` auto-fetches additional packages
  detected by import scan (L109-L115).
- `plt.show` monkey-patched at init to `_capture_show` (L28-L38).
  `__display_buffer__` populated with base64 PNG at DPI 150.
- `__format_last__` captures last-expression `repr` / DataFrame HTML
  (L41-L58).
- Per-cell `timeoutMs` default 30 s (L87).
- `IMAGE_BUDGET_BYTES = 100 KiB` (L84) — oversize images flagged
  but still rendered.

Worker contract:

- `WorkerRequest`: `init` | `run` | `interrupt` (host-side terminate)
  | `reset`.
- `WorkerResponse`: `kernel-status`, `cell-status`, `stream`,
  `display`, `result`, `error`, `duration`.

### React UI — `renderers/notebook/`

- `NotebookRenderer` parses content with
  `parseNotebookContentStreaming` (works for streaming and complete);
  instantiates `useKernel(onCellUpdate)`.
- `useKernel` lazy-creates the worker on first run; single-worker
  sequential queue. `interrupt` calls `worker.terminate()`.
- `NotebookCellView` renders `runtime.outputs` (live), not
  `cell.outputs` (which the LLM is not permitted to emit anyway).
- `MarkdownCell` click-to-edit, rendered via `StreamdownContent`.
- `OutputPinOverlay` exposes Pin / View Large hover affordances.
- `usePinToChat` stores pin state in `sessionStorage` under
  `"notebook-pins:<artifactId>"`. Pins survive page refresh within
  the tab session.
- `cell-output.tsx` collapses long outputs at
  `COLLAPSE_LINE_THRESHOLD = 40` lines, keeping `COLLAPSE_KEEP_LINES = 20`.

### Pin-to-chat flow

1. User clicks Pin on an image output → `usePinToChat.togglePin`
   updates sessionStorage list `{ artifactId, cellId, outputIdx }`.
2. The chat composer (in `chat-workspace.tsx`) instantiates
   `usePinToChat` at the workspace level so it can read the pin set.
3. Before send, the composer calls `collectAutoAttachments(notebook,
   pinned, caps)` (`chat-attachment.ts`). Returns: last 3 errors,
   tail-truncated text outputs (`maxTextChars` cap), base64 PNGs of
   pinned images. Total sliced to `maxAttachments`.
4. Pinned-outputs bar is rendered above the composer when the active
   artifact is `application/python` (`chat-workspace.tsx:3351-L3371`).

### Download

Three-item split-button in panel header
(`artifact-panel.tsx:610-L641`):

- `.ipynb` — round-trip nbformat 4 (`lib/notebook/ipynb.ts`).
- `.py` — percent-format (`lib/notebook/percent.ts`).
- `.html` — self-contained static export (`lib/notebook/html-export.ts`).

### Wiring

- `artifact-renderer.tsx:104-L111` routes `application/python` to a
  lazy-loaded `NotebookRenderer` with a "Initializing Python
  runtime…" loading state.
- The runtime is **ephemeral**: cell outputs are not persisted to the
  artifact's `content` in DB. Cells must be re-run on page refresh.

---

## 14. Glossary

- **Registry** — `ARTIFACT_REGISTRY` in `registry.ts` (12 entries,
  L62-L183). Source of truth for every type's label, extension,
  code-tab flag, language hint.
- **Validator** — `validateArtifactContent(type, content, ctx?)`
  (`_validate-artifact.ts:144-L180`). The single entry point every
  persistence path runs through.
- **Renderer** — the React component that displays the artifact in the
  panel. Always under `renderers/`. Lazy-loaded for heavy renderers.
- **Notebook** — the `application/python` artifact's runtime: the
  engine in `lib/notebook/`, the kernel in
  `lib/workers/python-worker.ts`, the UI in `renderers/notebook/`.
- **Panel** — `<ArtifactPanel>` in `artifact-panel.tsx` (~892 LoC).
- **Indicator** — `<ArtifactIndicator>` — chat-bubble pill that links
  to the panel.
- **`canvasMode`** — string the user can set in the chat input toolbar
  to lock all subsequent artifacts to a single type. `"auto"` = no
  lock.
- **Optimistic lock** — `prisma.document.updateMany({ where: { id,
  updatedAt: existing.updatedAt }, data: ... })`. Returns `count: 0`
  on conflict.
- **Versioned S3 key** — `<canonical>.v<N>` — every update archives
  the prior content here before overwriting the canonical key.
  `versionNum = versions.length + 1` (1-indexed).
- **RAG re-index** — for updates, prior SurrealDB chunks are deleted
  before new ones are inserted; `metadata.ragIndexed` is patched at
  the end via atomic `jsonb_set`.
- **Streaming placeholder** — `streaming-${toolCallId}` artifact id
  used while a `create_artifact` tool call is mid-stream.
  `addOrUpdateArtifact` skips activation for these ids (D-73).
- **`ValidationContext`** — `{ isNew?: boolean, language?: string }`.
  Three validators read it: `validateMarkdown` (128 KiB cap on isNew),
  `validateSlides` (image-text deprecation + hex whitelist on isNew),
  `validateCode` (canonical-language warning on language).
- **`getOrComputeDocx`** — single-flight + 16-entry FIFO process-local
  cache for sandbox DOCX output, used by the download route. Gates
  fresh runs through `withRenderSlot`. (`lib/document-script/docx-cache.ts`)
