# Artifact System — Deepscan

> **Last regenerated:** 2026-04-30, post text/document AST cleanup + RAG
> indexer artifactType plumbing + sheet `note` themability, pinned to
> commit `68b9d66`. Replaces all prior versions. Sourced from a
> ground-up rescan that verified every cited surface against the working
> tree, file-by-file, with five parallel code-explorer agents covering:
> validation core, tools+persistence+API, renderers+panel+state,
> subsystem libs, and registry+prompts.
>
> **Status update — branch `cleanup/artifact-system` (2026-04-30, HEAD `2a3f110`)
> closes 30+ findings in 9 atomic commits.** Items marked **[CLOSED]**
> below are resolved on that branch but the original analysis is kept for
> historical context. Re-pin the doc to the merge commit when the branch
> lands on main.
>
> **Companion docs:**
> - [`architecture-reference.md`](./architecture-reference.md) — file:line audit per module.
> - [`artifacts-capabilities.md`](./artifacts-capabilities.md) — per-type capability spec.
>
> **Major changes since the 2026-04-28 `a81c343` cut:**
> - **RAG indexer takes `artifactType` (`b23e06f`).** `indexArtifactContent` signature is now `(documentId, title, content, options?: { isUpdate?, artifactType? })` (`artifact-indexer.ts:25`). All three call sites — `create-artifact.ts:170`, `update-artifact.ts:247-250`, `service.ts:610-613` — pass it. Inside `resolveTextToEmbed` (`artifact-indexer.ts:79`), the per-call `findUnique` round-trip is now gated on `if (type === undefined)` at L86 — skipped when callers supply the option. **D-7 is partially closed**: the round-trip is gone for every current path; the fallback `findUnique` survives only for legacy callers that omit the option (none in tree).
> - **Sheet `note` color is themable end-to-end (`b3e6cdf`).** `SpreadsheetTheme` gained `noteColor?: string` (`types.ts:58`); `DEFAULT_THEME.noteColor = "#666666"` (`types.ts:67`); `generate-xlsx.ts:138` reads `theme.noteColor` via `hexToArgb`; `styles.ts:54` returns `fontColor: t.noteColor` for the `note` cell style. **D-65 is closed.** Same commit dropped dead `formatCellValue` from `styles.ts`.
> - **Mermaid type list is now a single shared module.** `_validate-artifact.ts:31` imports `MERMAID_DIAGRAM_TYPES_SHARED` from `@/lib/rendering/mermaid-types` (relocated from the deleted `lib/document-ast/`). The validator aliases it locally at L1321 (`MERMAID_DIAGRAM_TYPES`). The shared array has **25 entries** (`mermaid-types.ts:14-40`). **D-13's count drift is closed at the source level** — but the validator's error message string at `_validate-artifact.ts:1384` still hardcodes a stale 19-type list (NEW-B below).
> - **R3F `<color>` is now explicitly preserved.** `r3f-renderer.tsx:118-123` carries an explicit comment: `<color attach="background">` is honored. The prior stripping is gone. **D-29 is closed at the renderer**, but the prompt still does not mention `<color>` (residual prompt-side gap).
> - **`validateDocument` no longer accepts `ctx`.** `_validate-artifact.ts:169` is `async function validateDocument(content: string)` — no `_ctx` parameter at all (it was unused before; now removed). It is the only entry in `VALIDATORS` that drops the `ctx?` shape. **D-46 changes form**: `_ctx` no longer exists rather than being unused; the structural gap (cannot be given `isNew`-only rules without a signature change) remains.
> - **`documentFormat` Prisma column dropped (`6a019db`).** Confirmed absent from `prisma/schema.prisma:287-318`. No code reads or writes it anywhere.
> - **Doc-script directory layout corrected.** The validator is a single flat file `lib/document-script/validator.ts` (41 LoC), not a directory with `index.ts` as the prior architecture-reference implied.
>
> **Earlier cuts kept for context:**
> - `a81c343` removed the `text/document` AST mode (`schema.ts`/`validate.ts`/`to-docx.ts`/`resolve-unsplash.ts` + `examples/` tree, server `mermaid-to-svg.ts`, the `documentFormat` discriminant from `ValidationContext`/`Artifact`/`PersistedArtifact`, the `document-renderer.tsx` legacy renderer, the `edit-document-modal.tsx` orphan).
> - `02e24a6` deduped `tokenizeCsv` to `lib/spreadsheet/csv.ts`.
> - `0b25e56` dropped R3F `setReady` state, mermaid `containerRef`, mermaid `deterministicIDSeed`.
> - Pre-`a81c343` panel-chrome overhaul: Preview/Code tab pair removed, in-panel edit affordances stripped, preview view-only across every type, `document-script-renderer` PNG carousel, `/edit-document` POST, ghost-artifact prevention, RAG re-index on manual edit (N-1), session-delete versioned-S3 cleanup (N-47), R3F origin guard, slides sandbox tightened to `allow-scripts`, mermaid init under shared `mermaid-config.ts`, LaTeX trust callback restricting `\href` to `https?://`, react-renderer postMessage source-checked.

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
which the manual-edit path doesn't set. **As of `b23e06f`, every
caller of `indexArtifactContent` passes `artifactType` so the indexer
skips its prior per-call DB round-trip on every current path.**

A single `validateArtifactContent(type, content, ctx?)` is the entry point
every persistence path runs through. It does three jobs:

1. Dispatches to the per-type validator with a **5-second wall-clock
   timeout** (`VALIDATE_TIMEOUT_MS`, `_validate-artifact.ts:106`).
2. Carries an optional `ValidationContext.isNew` flag — `validateMarkdown`
   enforces a 128 KiB cap with it (`_validate-artifact.ts:1010,1024`),
   `validateSlides` rejects the deprecated `image-text` layout with it
   (`_validate-artifact.ts:333-340`). Other validators ignore it.
3. **Post-resolves Unsplash** for `text/html` and `application/slides`
   before returning. `text/document` does its own resolution inside the
   script sandbox; the dispatcher leaves it alone.

For `text/document`, `validateDocument` (`_validate-artifact.ts:169-173`)
is a thin async wrapper that dynamic-imports
`@/lib/document-script/validator` and returns its `{ ok, errors }`. It
**does not accept** a `ctx` parameter (post AST cleanup) — the only
entry in `VALIDATORS` with a `(content) => ...` shape rather than
`(content, ctx?) => ...`. The dispatcher's prior early-branch is gone.

Persistence is **optimistically locked** on the Prisma `Document.updatedAt`
column for both update paths. Concurrent writers hit `count: 0` from
`updateMany` and surface a 409 (HTTP) or
`{ updated: false, error: "Concurrent update detected…" }` (LLM tool).
The two paths use **different error message strings** (NEW-3 below),
which is intentional but undocumented.

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
renderer switch, the panel chrome) is derived from `ARTIFACT_REGISTRY`
(L62-L183, exactly 12 entries verified line-by-line).

| Type | Label | shortLabel | Ext | Code Tab | codeLanguage | Registry line |
|------|-------|------------|-----|----------|--------------|---------------|
| `text/html` | HTML Page | HTML | `.html` | ✓ | `html` | 64 |
| `application/react` | React Component | React | `.tsx` | ✓ | `tsx` | 74 |
| `image/svg+xml` | SVG Graphic | SVG | `.svg` | ✓ | `svg` | 83 |
| `application/mermaid` | Mermaid Diagram | Mermaid | `.mmd` | ✓ | `mermaid` | 93 |
| `text/markdown` | Markdown | Markdown | `.md` | ✓ | `markdown` | 103 |
| `text/document` | Document | Document | `.docx` | ✗ | `""` | 113 |
| `application/code` | Code | Code | `.txt` | ✗ | `""` | 123 |
| `application/sheet` | Spreadsheet | Spreadsheet | `.csv` | ✓ | `csv` | 133 |
| `text/latex` | LaTeX / Math | LaTeX | `.tex` | ✓ | `latex` | 143 |
| `application/slides` | Slides | Slides | `.pptx`† | ✓ | `json` | 153 |
| `application/python` | Python Script | Python | `.py` | ✓ | `python` | 163 |
| `application/3d` | 3D Scene | R3F Scene | `.tsx` | ✓ | `tsx` | 173 |

† The S3 canonical key for `application/slides` ends in `.pptx` even
though stored content is JSON — exporters convert on the fly.

`hasCodeTab: false` for `application/code` (the preview *is* the code) and
`text/document` (the preview is the source of truth — the "Code" tab no
longer exists for any type post panel-chrome overhaul).

**Label drift for `application/3d`** (NEW-D-68 below): the registry
exports `label = "3D Scene"` (L177) and `shortLabel = "R3F Scene"`. The
prompt module (`prompts/artifacts/r3f.ts:4`) exports `label = "R3F 3D
Scene"`. **Three distinct strings for the same type across three
surfaces.** `CANVAS_TYPE_LABELS` is built from prompt-module labels;
panel chrome reads registry labels. No functional break, but the
inconsistency could confuse copy in different surfaces.

The prompt-module label for `text/markdown` is `"Markdown"` and for
`text/document` is `"Document"` — the prior doc's claim that both used
`"Document"` (N-17) was incorrect.

---

## 2. End-to-end flow — LLM creates an artifact

```
Chat tool call (AI SDK v6)
     │
     ▼
src/lib/tools/builtin/create-artifact.ts (189 LoC)
     │  • Zod params: { title, type (enum from ARTIFACT_TYPES), content, language? }
     │  • 512 KiB content cap — MAX_ARTIFACT_CONTENT_BYTES (L16); guard L49-60
     │  • Canvas-mode lock: canvasMode && canvasMode !== "auto" && canvasMode !== type (L67-85)
     │  • application/code requires `language` arg (L89-101)
     │  • UUID id generated (L42)
     ▼
validateArtifactContent(type, content, { isNew: true })   ← L106-108
     │  • Promise.race against 5-second timer (VALIDATE_TIMEOUT_MS = 5000)
     │  • Per-type validator (sync or async) from VALIDATORS map (L72-91).
     │    For text/document, validateDocument (L169-173) delegates to
     │    validateScriptArtifact (TS check + sandbox dry-run + .docx magic-byte).
     │  • Post-resolve Unsplash for text/html and application/slides
     │
     ├── ok=false → return { persisted: false, error, validationErrors }
     │             AI SDK retry loop signals the LLM to self-correct.
     │
     ▼ ok=true
finalContent = validation.content ?? content                 ← L126
     │
     ▼
S3 upload (canonical key: artifacts/<orgId|"global">/<sessionId>/<id><ext>)   ← L131-145
     │  Note: sessionId segment has NO "orphan" fallback (NEW-D-69 below).
     ▼
prisma.document.create({                                     ← L147-168
  id, title, content: finalContent, artifactType,
  sessionId, organizationId, createdBy, s3Key,
  fileType: "artifact", fileSize, mimeType,
  metadata: { artifactLanguage, validationWarnings? }
  // No documentFormat — column dropped via 6a019db.
})
     │
     ▼ background, fire-and-forget                            ← L170
indexArtifactContent(id, title, finalContent, { artifactType: type })
     │  • resolveTextToEmbed: fast path now skips findUnique when
     │    artifactType is supplied (D-7 partially closed).
     │  • For text/document: runs sandbox + extractDocxText so
     │    embedding text reflects the rendered DOCX (D-47).
     │  • chunkDocument() (1000-char / 200-overlap)
     │  • generateEmbeddings() → storeChunks() (concurrency 8, sequential batches)
     │  • markRagStatus(id, true|false) on metadata (read-then-write — D-2)
     │  • NEVER rethrows; failure path writes ragIndexed:false and returns.
     ▼
return { id, title, type, content: finalContent, language, persisted,   ← L179-188
         warnings? }
     │
     ▼
chat-workspace.tsx onToolUpdate (L2197-2311 inside sendMessage)
     │  • addOrUpdateArtifact() → useArtifacts state (L2216-2231)
     │  • on tool error / malformed output: removeArtifact(`streaming-${toolCallId}`)
     │    (L2233-2253; commit 2897c9a — fixes ghost artifacts)
     │  • does NOT auto-open the artifact panel — user must click the indicator
```

**Streaming.** When `tool-input-available` arrives mid-stream
(`chat-workspace.tsx:2157-2195`), the chat-workspace adds a placeholder
artifact with id `streaming-${toolCallId}` so the panel can show
progressive content. On `tool-output-available` with `out.persisted ===
true` (L2216-2231), the placeholder is removed and the real artifact
takes its place. **If the user aborts mid-stream**, the catch block at
L2486-2509 iterates `createdStreamingIds` and removes every placeholder,
then iterates `preStreamSnapshots` to restore any partially-updated
artifacts — fixing the prior N-4 leak.

**`ctx.isNew = true`** is hardcoded for create. Two validators consume it:
`validateMarkdown` enforces a 128 KiB cap (`_validate-artifact.ts:1024`),
`validateSlides` rejects the deprecated `image-text` layout
(`_validate-artifact.ts:333-340`). Every other validator (incl.
`validateDocument`, which **does not even accept `ctx` post `a81c343`**)
ignores it.

---

## 3. End-to-end flow — LLM updates an artifact

```
update_artifact tool call
     │
     ▼
src/lib/tools/builtin/update-artifact.ts (285 LoC)
     │  • Zod params: { id, title?, content }   ← no `type`, no `language`
     │  • 512 KiB cap (L51-65) — early return before DB
     │  • prisma.document.findUnique({ where: { id } }) (L73)
     │     ↳ existing == null  → return { updated: false, error: "...not found..." } (L78-87)
     │  • Canvas-mode lock against existing.artifactType (L95-113)
     ▼
validateArtifactContent(existing.artifactType, content)       ← L118-121, no isNew
     │  • failures → { updated: false, error: formatValidationError, validationErrors }
     ▼
finalContent = validation.content ?? content                  ← L141-143
     │
     ▼
Versioning                                                    ← L150-198
     │  • metadata.versions: append { title, timestamp, contentLength, s3Key? }
     │  • versionNum = versions.length + 1 (1-indexed before push)
     │  • archive previous content to ${existing.s3Key}.v${versionNum}
     │    on failure → inline if previousBytes ≤ 32 KiB (MAX_INLINE_FALLBACK_BYTES = 32*1024, L25)
     │    else marker { archiveFailed: true }
     │  • FIFO eviction at MAX_VERSION_HISTORY = 20 (L13); accumulate evictedVersionCount
     │  • upload new content to existing.s3Key (L202-208)
     ▼
prisma.document.updateMany({                                   ← L215-230
  where: { id, updatedAt: existing.updatedAt },
  data: { content, title, fileSize, metadata }
})
     │  • count === 0 → return { updated: false, error: "Concurrent update detected: another writer
     │    modified this artifact between read and write. Re-fetch the artifact and retry the update." }
     │    (L232-244 — distinct from HTTP path, NEW-D-70)
     │  • count === 1 → continue
     ▼
indexArtifactContent(id, updatedTitle, finalContent,           ← L247-250
                     { isUpdate: true, artifactType: existing.artifactType })
     │  • deletes prior chunks first (await), then re-chunks + embeds + stores
     ▼
return { id, title, content, type: existing.artifactType,      ← L273-282
         updated: true, version, evictedVersionCount? }
```

**Optimistic locking.** Both create and update use
`prisma.document.updateMany({ where: { id, updatedAt: existing.updatedAt } })`.
A `count: 0` result means another writer beat us — both paths surface a
"Concurrent update detected" error (with **different message strings**
between the LLM tool path and HTTP path — NEW-D-70).

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
src/features/conversations/sessions/service.ts (701 LoC)
     • updateDashboardChatSessionArtifact(orgId, userId, params, body) — L475
     │  • content-required guard (L482) → 400
     │  • session ownership (L489-492) via findDashboardSessionBasicByIdAndUser
     │  • artifact existence (L494-497) via findDashboardArtifactByIdAndSession
     │  • validateArtifactContent(existing.artifactType, String(content)) (L509-511; no isNew)
     │  • finalContent = validation.content ?? content (L519-521)
     │  • versioning (L523-571) — same shape as LLM update_artifact
     │  • optimistic lock via updateDashboardArtifactByIdLocked (L581-594)
     │     ↳ null result → 409 "Concurrent update detected: another writer changed
     │       this artifact while you were editing. Reload to see the latest version,
     │       then retry your save." (L596-602; NEW-D-70 — distinct wording from LLM path)
     │  • indexArtifactContent(updated.id, ..., { isUpdate: true, artifactType })  ← N-1 fixed,
     │    L610-613
     ▼
DELETE /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]
     │
     ▼
deleteDashboardChatSessionArtifact (service.ts:653)
     │  • deleteFile(existing.s3Key) (L668-674; non-fatal)
     │  • deleteFiles(versionedKeys from metadata.versions) (L676-691; non-fatal)
     │  • deleteChunksByDocumentId(artifactId) (L693-696; non-fatal)
     │  • deleteDashboardArtifactById(artifactId) (L698 → repository.ts:214-218)
```

**Why the dual path?** Simpler edits (the user clicks Restore on a
historical version, the test suite seeds an artifact, an admin tool
patches a workspace) need to pass through the same validation but skip
the LLM tool-call surface. The HTTP path is also where the manual `Delete`
button on the panel lands.

**Edit-document POST endpoint.** Path:
`/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document`.
Rate-limited to **10 edits/60 s/user via an in-process token bucket**
(`edit-document/route.ts:16-29`; comment explicitly notes it's not a
substitute for a distributed limiter — D-4/D-55). Accepts `{ editPrompt
}`, guards `artifactType === "text/document"` (L65-70), calls
`llmRewriteWithRetry({ currentScript, editPrompt })`
(`lib/document-script/llm-rewrite.ts`; `MAX_RETRIES = 2` → 3 total
attempts), then routes back through `updateDashboardChatSessionArtifact`
(L80-88) for the full versioning + RAG re-index. The route handler
validates the produced script via `validateScriptArtifact` before
persisting.

**Param schema gap (NEW-D-71).** `edit-document/route.ts` does
`const { id, artifactId } = await params` at L45 with **no Zod
validation**, unlike `route.ts` (PUT/DELETE) which uses
`DashboardChatSessionArtifactParamsSchema.safeParse`. Empty/malformed ids
fall through to the DB and surface a 404 instead of a clean 400.

**Render-pages route bypasses session ownership (NEW-D-72).**
`render-pages/[contentHash]/[pageIndex]/route.ts` only checks auth
(L12-13) and then directly calls `getCachedPngs(artifactId, contentHash)`
(L19). Unlike every other artifact sub-route, it does **not** call
`getDashboardChatSessionArtifact` for ownership. Any authenticated user
who knows an `artifactId` and its `contentHash` can fetch its cached PNG
pages — IDOR by design (`contentHash` is the unguessable token).

---

## 5. Validation pipeline

`src/lib/tools/builtin/_validate-artifact.ts` is **2034 LoC** (HEAD).
Public surface is one function:

```ts
validateArtifactContent(
  type: ArtifactType,
  content: string,
  ctx?: { isNew?: boolean }
): Promise<{ ok: boolean; errors: string[]; warnings: string[]; content?: string }>
```

The dispatcher does three things, in order:

1. **Race against a 5-second timer** (`getValidateTimeoutMs()`,
   L106/L117-119). The `__setValidateTimeoutMsForTesting(ms)` shadow
   exists for unit tests. `.unref?.()` is called on the timer so Node
   can exit during tests.
2. **Per-type dispatch** via `VALIDATORS: Record<ArtifactType, …>`
   (L72-L91). TypeScript exhaustiveness: adding a new entry to
   `ARTIFACT_REGISTRY` without a matching `VALIDATORS` slot is a compile
   error. `validateDocument` (L169-173) sits in this map and dynamic-
   imports `validateScriptArtifact` — there is no early-branch above
   the map. `validateDocument` is the **only** entry whose signature
   omits the `ctx?` parameter (post AST cleanup; D-46/NEW-C).
3. **Post-validation Unsplash resolution** for `text/html`
   (`resolveImages`) and `application/slides` (`resolveSlideImages`).
   `text/document` does its own resolution inside the script sandbox;
   the dispatcher leaves it alone.

`formatValidationError(type, result)` (`_validate-artifact.ts:2027-2033`)
produces the standard error string used identically by
`create-artifact.ts`, `update-artifact.ts`, and `service.ts`.

### Per-validator highlights (verified against HEAD)

- **`validateHtml`** (L1576-1682). parse5 walk; requires
  `<html><head><body>`, non-empty `<title>`, viewport meta. `<form
  action>` blocked (the iframe sandbox doesn't permit it anyway). Inline
  `<style>` >`MAX_INLINE_STYLE_LINES = 10` (L51) is a **warning, not
  error** (D-43; reported at L1675-1679).
- **`validateReact`** (L1761-1912). Babel AST. Requires `// @aesthetic:
  <direction>` on line 1 (env-gated hard error). Line 2 may be `//
  @fonts:`. Imports whitelisted to `react`, `react-dom`, `recharts`,
  `lucide-react`, `framer-motion` (`REACT_IMPORT_WHITELIST` L42-48).
  Class components, `document.getElementById`, and CSS imports are hard
  errors. `KNOWN_SERIF_FAMILIES` + `PALETTE_MISMATCH_THRESHOLD = 6`
  (L1689-1700).
- **`validateSvg`** (L1433-1570). parse5; **`<style>` block = hard
  error** (D-42, L1553-1557). `<script>`, `<foreignObject>`, external
  `href`, event handlers, missing `viewBox`/`xmlns`, hardcoded root
  `width=`/`height=` are all hard errors. Decimal-precision regex `/\d\.
  \d{3,}/` fires at 3+ dp (D-17 / SVG prompt drift).
- **`validateMermaid`** (L1323-1419). String check for known diagram
  types via the **shared** `MERMAID_DIAGRAM_TYPES` (alias at L1321 of the
  25-entry array in `lib/rendering/mermaid-types.ts:14-40`). `>15-node`
  heuristic only fires for flowchart/graph. **Stale error message
  (NEW-B):** L1384 hardcodes a 19-type list that pre-dates the shared
  module's growth — authors seeing the error cannot discover
  `packet-beta`, `kanban`, `C4Container`, `C4Component`, `C4Deployment`,
  or `graph` from the prose.
- **`validateMarkdown`** (L1012-1129). `MARKDOWN_NEW_CAP_BYTES = 128 *
  1024` (L1010); cap gated on `ctx?.isNew` only (L1024). **The prompt
  does not mention this cap (D-15).** `RAW_HTML_DISALLOWED` warns on **10
  entries** (L1086-1097): `details, summary, kbd, mark, iframe, video,
  audio, object, embed, table`. `<script>` is checked separately —
  warning by default, hard error if env
  `ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"`. Heading structure,
  untagged code fences = warnings.
- **`validateDocument`** (L169-173). Thin async wrapper:
  `dynamic-import("@/lib/document-script/validator").validateScriptArtifact(content)`.
  Returns `{ ok, errors, warnings: [] }`. **Signature has no `ctx`**
  (D-46/NEW-C).
- **`validateCode`** (L1253-1307). Empty check, markdown-fence and
  HTML-document guards (hard errors), truncation-marker warnings
  (`CODE_TRUNCATION_MARKERS` ~10 entries, L1240-1251), 512 KiB warning.
  **The `language` parameter is NOT validated** (D-18) — function
  signature is `validateCode(content)` only.
- **`validateSheet`** (L779-1003). Three branches (CSV, JSON array,
  spec). Spec runs `parseSpec` (8 sheets / 500 cells / 200 formulas /
  64 named ranges / 8 charts caps from `SPREADSHEET_CAPS` in
  `spreadsheet/types.ts:6-13`) and `evaluateWorkbook` (formula DAG with
  circular-ref detection).
- **`validateLatex`** (L1163-1230). KaTeX subset. `LATEX_UNSUPPORTED_
  COMMANDS` ~14 entries (L1142-1161). Hard errors on `\documentclass`,
  `\usepackage`, `\begin{document}`, `\includegraphics`, `\bibliography`,
  `\cite`, `\input`, `\include`, `\begin{tikzpicture}`,
  `\begin{figure}`, `\begin{table}`, `\begin{tabular}`. Warnings on
  `\verb`, `\label`, `\ref`, `\eqref`, `\begin{verbatim}`.
- **`validateSlides`** (L209-618). JSON shape validation, per-layout
  required-field checks (L256-577), `image-text` deprecation (error on
  `isNew` at L333-340, warning otherwise), deck-shape warnings
  (L579-617): size 7-12 (`MIN_DECK_SLIDES=7`, `MAX_DECK_SLIDES=12`,
  L206-207), first=title (L604-609 — warning only), last=closing
  (L610-615 — warning only). `SLIDE_LAYOUTS` Set (L183-203) has **18
  entries**. **No primaryColor/secondaryColor hex whitelist** (D-40).
- **`validatePython`** (L1940-2021). Pyodide whitelist.
  `PYTHON_UNAVAILABLE_PACKAGES` is **15 entries** (L1922-1938):
  `requests, httpx, urllib3, flask, django, fastapi, sqlalchemy,
  selenium, tensorflow, torch, keras, transformers, cv2, pyarrow,
  polars`. Hard errors on those + `input()` + write-mode `open()`
  (regex L1993: `/\bopen\s*\([^)]*,\s*['"][wax]b?\+?['"]/m`). Warnings
  for missing `print`/`plt.show`, `time.sleep > 2s`, `while True`
  without break. **Read-mode `open()` passes silently** (D-16).
- **`validate3d`** (L670-767). Hard errors on `<Canvas>`,
  `<OrbitControls>`, `<Environment>`, `document.*`,
  `requestAnimationFrame`, `new THREE.WebGLRenderer`, missing `export
  default`, markdown fences. `R3F_ALLOWED_DEPS` (L629-668) is **34
  entries**. Imports outside the whitelist = warnings. `<color>` is
  intentionally permitted (comment L625-626) — closed at the renderer
  level (D-29).

---

## 6. Renderer dispatch

```
artifact-panel.tsx (L696-708)
   │
   ├── text/document + sessionId
   │     → DocumentScriptRenderer (PNG carousel from /render-status + /render-pages)
   │
   ├── text/document + no sessionId
   │     → "Preview unavailable: missing session context."
   │
   └── any other type
         → ArtifactRenderer (artifact-renderer.tsx:89-128)
            switch(artifact.type)
               text/html              → HtmlRenderer       (L91)
               application/react      → ReactRenderer      (L93)
               image/svg+xml          → SvgRenderer        (L95)
               application/mermaid    → MermaidRenderer    (L97)
               application/sheet      → SheetRenderer      (L99)
               text/latex             → LatexRenderer      (L101)
               application/slides     → SlidesRenderer     (L103)
               application/python     → PythonRenderer     (L105)
               application/3d         → R3FRenderer        (L107)
               application/code       → StreamdownContent (fenced, L108-121)
               text/markdown          → StreamdownContent (raw, L123)
               default                → <pre> raw (L125-128)
```

**Note:** `ArtifactRenderer` no longer has a `text/document` case; the
panel intercepts above the dispatcher. Any future caller that mounts
`<ArtifactRenderer artifact={...} />` for a `text/document` artifact
will hit the `default` branch and see raw script source in a `<pre>`.

### Renderer sandboxing summary

| Renderer | Iframe? | Sandbox (verbatim) | Notes |
|---|---|---|---|
| `text/html` | yes | `"allow-scripts allow-modals"` (`html-renderer.tsx:128`) | `_iframe-nav-blocker.ts` injected |
| `application/react` | yes | `"allow-scripts"` (`react-renderer.tsx:588`) | postMessage source-checked (L454-467) |
| `image/svg+xml` | no | DOMPurify + DOMParser pre-validation | inline render |
| `application/mermaid` | no | renders inline as `<svg>` | `securityLevel: "strict"` |
| `text/latex` | no | KaTeX with `trust` callback restricting `\href`/`\url` to `https?://` (`latex-renderer.tsx:18-23`) | inline render |
| `application/3d` | yes | **none** (L580-581 — WebGL needs GPU) | source-checked postMessage; `didReadyRef` for content swaps |
| `application/slides` | yes | `"allow-scripts"` only (`slides-renderer.tsx:116`; tightened) | source-checked postMessage |
| `application/python` | no | inline Web Worker (Pyodide) | Blob URL revoked immediately after `new Worker()` |
| `application/sheet` | no | direct DOM (no scripting in spec) | formula eval is pure JS (`lib/spreadsheet/formulas`) |
| `text/markdown` | no | Streamdown (server-rendered MD) | own mermaid pipeline (separate from `mermaid-config.ts`) |
| `application/code` | no | StreamdownContent fenced block | adaptive fence length |
| `text/document` | no | server-built PNG carousel | sandbox → soffice → pdftoppm; PNG bytes via `/render-pages/[hash]/[idx]` |

---

## 7. Panel chrome (post-overhaul)

`artifact-panel.tsx` (841 LoC). The Preview/Code tab pair is gone. The
panel header contains, left to right:

| Element | Lines |
|---|---|
| **Title** (truncated `h3`) | 435-438 |
| **Type badge** (`TYPE_SHORT_LABELS`; language suffix only for `application/code`) | 439-447 |
| **Version navigator** (chevrons + counter) when `previousVersions.length > 0`. Tooltip surfaces `evictedVersionCount` | 451-482 |
| **Restore button** when viewing historical (`isViewingHistorical && onUpdateArtifact`); disabled while `isSaving` | 486-505 |
| **RAG-not-searchable badge** (amber) when `ragIndexed === false` | 508-522 |
| **Copy** button | 527-543 |
| **Download** — split-button for `text/document` (`.md` + `.docx`; PDF intentionally absent — D-3) | 545-590 |
| **Download** — single button for all other types (no in-sheet XLSX button — commit 4d3d199) | 591-605 |
| **More menu** with single "Delete artifact" item | 607-631 |
| **Fullscreen toggle** (Escape exits, renders via `createPortal`) | 633-651 |
| **Close** | 653-668 |

### Per-renderer chrome that survived

- `application/sheet` has Data/Charts toggle inside `SpecWorkbookView`
  (rendered only when `spec.charts.length > 0`, `sheet-spec-view.tsx:
  144-167`). Excel-feel grid, sticky corner, A/B/C headers, frozen
  borders, top-of-renderer `SheetFormulaBar`, bottom sheet tabs.
  **`view` state is shared across sheet tabs** (D-20): switching to a
  sheet without charts while on Charts view leaves the user on the
  empty-state screen. `note` cell now renders via native HTML
  `title=` (L257) — no inline color (post-`b3e6cdf`, D-65 closed).
- `application/slides` has a navigation strip (prev/next + dot strip when
  `1 < totalSlides ≤ 20`) inside the renderer.
- `application/python` has Run / Stop buttons + output panel inside the
  renderer.

---

## 8. State machine — `useArtifacts` + chat-workspace

`useArtifacts` (`use-artifacts.ts`, 143 LoC) holds `Map<string, Artifact>`
plus `activeArtifactId`. Operations:

- `addOrUpdateArtifact(artifact)` (L52-83) — if the id exists, push the
  previous `{ content, title, timestamp }` to `previousVersions`,
  increment `version`, merge incoming fields. Else insert fresh. **Always
  calls `setActiveArtifactId(artifact.id)` (L82)** — including for
  streaming-placeholder updates (NEW-D-73 — minor flicker risk for
  rapid multi-artifact streams).
- `removeArtifact(id)` (L85-92) — delete; null `activeArtifactId` if
  matches.
- `closeArtifact` / `openArtifact` (L94-100).
- `loadFromPersisted(persisted[])` (L102-127) — fresh Map; preserves
  the active id if still present. Infers `version` from
  `versions.length + 1`. Maps `metadata.versions` → `previousVersions`.
  Preserves `evictedVersionCount`, `ragIndexed`. **No `documentFormat`
  hydration** — field absent from `Artifact`/`PersistedArtifact`
  (`types.ts:27-47`/`50-61`) post `a81c343`.

Chat-workspace owns the streaming lifecycle via two per-`sendMessage`
maps (`chat-workspace.tsx:1940-1941`):

```ts
const preStreamSnapshots = new Map<string, Artifact | null>()
const createdStreamingIds = new Set<string>()
```

Tool input arrives (L2157-2195) → if `create_artifact`, generate
`streaming-${toolCallId}` and add it to `createdStreamingIds`; if
`update_artifact`, pre-stream snapshot the current artifact and stash
in `preStreamSnapshots` (first chunk only, L2179 guard).

Tool output arrives (L2197-2311):

- **`create_artifact` success** (L2216-2231): remove placeholder, add
  real artifact (gates on `out.persisted === true`).
- **`create_artifact` failure** (L2233-2253): remove placeholder + log
  warning. **Fixes ghost artifacts** (commit 2897c9a).
- **`update_artifact` success** (L2259-2285): `addOrUpdateArtifact`
  with the new content/title. Drop snapshot.
- **`update_artifact` failure** (L2286-2308): restore pre-stream
  snapshot via `addOrUpdateArtifact(snapshot)`. Drop snapshot.

**Abort.** `handleStop` (L2667-2670) is 3 lines — only fires
`abortControllerRef.abort()`. The catch block at L2486-2509 iterates
`createdStreamingIds` removing each, then iterates `preStreamSnapshots`
restoring each, then clears both. The `if (err instanceof DOMException
&& err.name === "AbortError")` guard at L2512-2514 calls
`setIsStreaming(false)` and returns — skipping the error toast for
user-initiated stops. **Fixes N-4** (streaming placeholder leak on
abort).

---

## 9. Persistence service layer

`src/features/conversations/sessions/service.ts` (701 LoC) exposes:

- `getDashboardChatSessionArtifact(orgId, userId, params)` — fetch +
  auth. **Coerces null `artifactType` to `""` at L645** (NEW-D-74).
  Return type declared as `... & { artifactType: string }` — callers
  comparing to `"text/document"` correctly reject empty strings, but
  the silent coercion could mislead future consumers.
- `updateDashboardChatSessionArtifact(orgId, userId, params, body)` —
  L475. Calls `validateArtifactContent(type, content)` with no third
  arg (D-1 closed); `ValidationContext` only has `isNew` and the
  manual edit path doesn't set it.
- `deleteDashboardChatSessionArtifact(orgId, userId, params)` — L653.
  Cleans S3 canonical, S3 versioned, RAG chunks, Postgres row.

`src/features/conversations/sessions/repository.ts` (237 LoC) exposes:

- `findDashboardArtifactByIdAndSession` (L173-180). `where: { id,
  sessionId, artifactType: { not: null } }`.
- `updateDashboardArtifactByIdLocked(id, expectedUpdatedAt, data)` —
  L193-212. `updateMany` with optimistic-lock predicate; returns `null`
  on count 0.
- `deleteDashboardArtifactById` — L214-218.
- `findArtifactsBySessionId` — L220-230. Selects `id, s3Key, metadata`.
  The `metadata` selection is what enables session-delete to flatten
  versioned S3 keys.
- `deleteArtifactsBySessionId` (L232-236) — **dead code** (NEW-D-75).
  Service inlines its own `prisma.document.deleteMany` inside a
  transaction.

Session delete (`service.ts:286-336`):
1. `findArtifactsBySessionId(sessionId)`.
2. Flatten `artifact.s3Key` + `metadata.versions[].s3Key` into one
   `s3Keys[]` array.
3. `deleteFiles(s3Keys)` — bulk batches ≤ 1000, non-fatal.
4. `Promise.allSettled(artifacts.map(a => deleteChunksByDocumentId(a.id)))`.
5. Single Prisma transaction (L329-334):
   `[document.deleteMany({ where: { sessionId, artifactType: { not: null }}}), dashboardSession.delete(...)]`.

Versioned S3 cleanup at session delete is **confirmed fixed** — N-47
resolved.

---

## 10. RAG indexing

`src/lib/rag/artifact-indexer.ts` (128 LoC) exposes
`indexArtifactContent(documentId, title, content, options?)`:

```ts
options?: { isUpdate?: boolean; artifactType?: string | null }   // L25 — post b23e06f
```

1. If `options.isUpdate` is true (L32-34), **synchronously await**
   `deleteChunksByDocumentId(documentId)`.
2. `resolveTextToEmbed(documentId, content, options?.artifactType)` —
   L42, L79. **Fast path skips `findUnique`** when `type !== undefined`
   (L86) — D-7 partially closed. The fallback `findUnique` at L87-91
   survives only for callers that omit the option (none in tree).
3. For `type === "text/document"` (L96-103): dynamic-imports
   `sandbox-runner` and `extract-text`, runs the script, calls
   `extractDocxText(r.buf)` — `pandoc -f docx -t plain` with
   `TIMEOUT_MS = 15_000`. Fallback to raw script source on any failure.
4. `chunkDocument(textToEmbed, title, "ARTIFACT", undefined, { chunkSize:
   1000, chunkOverlap: 200 })` — recursive split on
   `["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "]`.
5. Zero chunks → `markRagStatus(documentId, false)`, return.
6. Title is prepended to each chunk text before embedding.
7. `generateEmbeddings(chunkTexts)` — `BATCH_SIZE = 128`,
   `EMBED_CONCURRENCY = 4`, `MAX_RETRIES = 3` (`embeddings.ts:13-16`).
8. `storeChunks(documentId, chunks, embeddings)` —
   `STORE_CHUNKS_CONCURRENCY = 8` (`vector-store.ts:513`).
9. `markRagStatus(documentId, true)` (L113-128) — patches
   `metadata.ragIndexed = true` via Prisma read-then-write. **Not
   atomic** (D-2) — concurrent metadata writers can clobber each other.
10. Exceptions: outer catch at L61 logs and calls
    `markRagStatus(documentId, false).catch(() => {})`. Never rethrows.

Chunk IDs: `"${documentId}_${i}"`. On re-index, prior chunks are deleted
first, so IDs restart at `_0`.

---

## 11. Mermaid story (post AST-removal + shared-types consolidation)

Two artifact-side mermaid paths share `mermaid-config.ts` +
`mermaid-theme.ts`:

1. **`mermaid-renderer.tsx`** (169 LoC, the standalone artifact).
   Module-level `mermaidPromise` cache (L21). `getMermaid()` re-init
   only on theme change via `lastInitTheme` (L22). Theme keys:
   `resolvedTheme === "dark"` → `"dark"`, else `"default"` (L43). Init
   options come from `mermaid-config.ts:475-499`: `securityLevel:
   "strict"`, `theme: "base"`, full `themeVariables` override.
2. **Client-side mermaid → PNG → PPTX** in
   `lib/rendering/client/mermaid-to-png.ts` (42 LoC). Browser-only path
   used by the slides PPTX exporter. Reads `getMermaidInitOptions(theme)`
   from `mermaid-theme.ts:33`.

The **server-side `mermaid-to-svg.ts` was removed with `a81c343`** —
the legacy `text/document` AST renderer was its only production caller,
and that has also gone. DOCX exports built by the new script path emit
mermaid through whatever the user-written script does.

The **outlier** is **Streamdown's internal mermaid pipeline**, which
fires when a markdown or code artifact contains a `mermaid` fenced
block. `streamdown-content.tsx:71-83` instantiates `<Streamdown
controls={{ mermaid: true }} mermaid={{ errorComponent: MermaidError }}
/>`. Streamdown manages its own mermaid integration; it does **not**
call `getMermaidConfig`. This is a separate config path that is not
yet consolidated — a real second source of truth for fenced mermaid in
markdown (D-25).

The `MERMAID_DIAGRAM_TYPES_SHARED` constant in `lib/rendering/
mermaid-types.ts:14-40` is now the **single source of truth** for the
diagram-type allow-list, imported by:
- `_validate-artifact.ts:31` (validator)
- `_validate-artifact.ts:1321` (alias inside `validateMermaid`)
- The slides validator (`_validate-artifact.ts:366`) which uses
  `.some(...)` for chart-detection
The shared array has 25 entries. **D-13 is closed at the type-system
level**, but **NEW-B**: the validator's user-facing error message at
`_validate-artifact.ts:1384` still hardcodes a stale 19-type list —
authors seeing the error cannot discover `packet-beta`, `kanban`,
`C4Container`, `C4Component`, `C4Deployment`, or `graph`.

---

## 12. Findings (D-N)

Numbered `D-N` (deepscan-N). Originally written against `8b6e69b`;
this rev marks status against HEAD `68b9d66`.

### Closed on branch `cleanup/artifact-system` (2026-04-30)

The branch lands 9 atomic commits that close the items below. Reasons
are summarized here; commit messages on the branch carry the full
detail.

- **D-2** — `markRagStatus` rewritten to `prisma.$executeRaw` with
  `jsonb_set` (atomic). Commit `4232559`.
- **D-3** — PDF download wired through existing `docxToPdf` + soffice
  pipeline; panel split-button gains `.pdf` option. Commit `b886805`.
- **D-7 (residual)** — `findUnique` fallback in `resolveTextToEmbed`
  removed; signature now requires `string | null`. Commit `7384337`.
- **D-9** — GET single-artifact endpoint added at
  `/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]`. Commit
  `2a3f110`.
- **D-11** — `DocumentScriptRenderer` error branch gains a Retry button
  that bumps `retryCount` and re-fires the `/render-status` fetch.
  Commit `b886805`.
- **D-13** (prompt-side residual) — mermaid prompt now lists the 6
  previously-undocumented diagram types (`packet-beta`, `C4Container`,
  `C4Component`, `C4Deployment`, plus aliases `graph` /
  `stateDiagram`). Commit `10ad714`.
- **D-14** — slides MUST-rules (deck size 7-12, first=`title`,
  last=`closing`) promoted to hard error on `ctx.isNew`. Commit
  `939d277`.
- **D-15** — markdown prompt gains an explicit "Hard Limits" section
  documenting the 128 KiB new-create cap. Commit `10ad714`.
- **D-16** — python validator now rejects all `open()` calls (read +
  write); aligns with prompt that already forbids all I/O. Commit
  `7d24aed`.
- **D-17** — SVG dp regex tightened from 3+ dp to 2+ dp; warning
  message updated to "more than 1 decimal place". Commit `7d24aed`.
- **D-19** — pie `fillOpacity` floored at `0.25` so slices past index
  10 stay visible. Commit `e1999c1`.
- **D-20** — sheet tab switch now resets `view` state to `"data"`
  alongside `selectedRef`. Commit `4e06a7f`.
- **D-24** — `validateReact` warns when `@fonts` is on line 2 with no
  `@aesthetic` on line 1. Commit `4e06a7f`.
- **D-26** — html-renderer sandbox tightened to `"allow-scripts"` only;
  validator emits warning for `alert/confirm/prompt` calls; html
  prompt updated. Commit `7d24aed`.
- **D-27** — python-renderer fence is adaptive (mirrors
  `application/code`'s pattern). Commit `4e06a7f`.
- **D-28** — artifact-panel imports `Maximize2`/`Minimize2` from
  `@/lib/icons` instead of direct `lucide-react`. Commit `4e06a7f`.
- **D-29** (prompt-side residual) — r3f prompt now documents
  `<color attach="background" args={["#hex"]} />` as supported.
  Commit `10ad714`.
- **D-34** — docx-preview-pipeline gains per-`(artifactId, hash)`
  single-flight Map; concurrent `/render-status` calls share one
  pipeline run. Commit `4232559`.
- **D-36** — `cache.ts` reads + writes manifest and pages in parallel
  via `Promise.all`. Commit `4232559`.
- **D-38** — `/api/dashboard/artifacts/metrics` exposes the 9 in-process
  counters in Prometheus exposition format; auth-gated. Commit
  `2a3f110`.
- **D-40** — slides validator gains primaryColor / secondaryColor hex
  whitelists (6+6 from the prompt); hard error on `ctx.isNew`,
  warning otherwise. Commit `939d277`.
- **D-46** — `validateDocument` now accepts `_ctx` for shape
  consistency with the rest of `VALIDATORS`. Commit `e1999c1`.
- **D-62** — `format.ts` annotated to clarify the catch is not strictly
  dead (numfmt throws on malformed format strings). Commit `7384337`.
- **D-66** — no code change; `styles.ts:9-17` already documents the
  intentional Tailwind-vs-hex divergence. Status moved to
  documented-by-design.
- **D-68** — `application/3d` label canonicalized to `"3D Scene"`
  across registry and prompt. Commit `10ad714`.
- **D-69** — `S3Paths.artifact` applies `sessionId || "orphan"`
  fallback; signature widened to accept null/undefined. Commit
  `7384337`.
- **D-71** — edit-document route validates params via
  `DashboardChatSessionArtifactParamsSchema.safeParse`. Commit
  `7d24aed`.
- **D-72** — render-pages route now calls
  `getDashboardChatSessionArtifact` for session ownership before
  serving cached PNGs (was the IDOR surface). Commit `7d24aed`.
- **D-73** — `useArtifacts.addOrUpdateArtifact` skips
  `setActiveArtifactId` for `streaming-` placeholder ids. Commit
  `7384337`.
- **D-75** — `repository.deleteArtifactsBySessionId` dead export
  removed; matching test mock also dropped. Commit `7384337`.
- **D-77** — mermaid validator error string now generates from
  `MERMAID_DIAGRAM_TYPES.join(", ")` so it tracks the shared array.
  Commit `10ad714`.
- **D-78** — r3f prompt header corrected from "20 helpers" to "19
  helpers" in two locations. Commit `10ad714`.
- **D-79** — `RANGE_RE` strips `$` markers before pattern match;
  `$A$1:$B$5` now produces a real expansion instead of empty. Commit
  `e1999c1`.
- **D-80** — `s3.uploadStream` now opt-in `includeUrl` (mirrors
  `uploadFile`); zero existing callers, no behavior break. Commit
  `7384337`.
- **D-82** — embeddings `BATCH_SIZE` / `EMBED_CONCURRENCY` read from
  `KB_EMBED_BATCH_SIZE` / `KB_EMBED_CONCURRENCY` env. Commit
  `4232559`.
- **D-83** — `prompts/index.ts satisfies` shape extended to require
  `examples`. Commit `10ad714`.
- **D-85** — `resize-svg.ts` regex matches both single- and
  double-quoted attribute values. Commit `7384337`.
- **D-86** — `extract-text.ts` logs pandoc ENOENT once per process via
  `pandocMissingLogged` sentinel. Commit `4232559`.
- **D-42 / D-43 (rationale annotated)** — comment block on
  `MAX_INLINE_STYLE_LINES` explains why HTML and SVG severities
  diverge (iframe vs inline render boundary). Commit `e1999c1`.

**MOOT via dead-code deletion (commit `6c1dd82`):** D-4, D-54, D-55,
D-71 (edit-document subsystem dropped — orphan since `0b25e56` UI
removal); D-80 (`s3.uploadStream` dropped — zero callers); D-85
(`resize-svg.ts` dropped — zero callers). The Tier 2/3/4 fixes for
D-71, D-80, D-85 patched code that was already dead — work is gone
along with the modules.

**Closed in second batch (commits `414fe1a`, `9732b9a`):**
- **D-18** — `ValidationContext` gains `language?: string`; `validateCode`
  warns on values outside the canonical Shiki list. `create-artifact`
  threads the field through.
- **D-47** — DOCX-extracted text is now cached per `(documentId, content
  hash)` in a 128-entry FIFO Map inside `artifact-indexer.ts`; re-indexes
  of unchanged content skip the sandbox + pandoc spawn entirely.
- **D-51** — `chart-to-svg.ts` gains `options.theme: "light" | "dark"`;
  defaults to `"light"` so existing callers are unchanged. Light palette
  mirrors prior tokens; dark palette uses slate-700/900 grid/axis and
  slate-100/300 text.
- **D-76** — `sandbox-wrapper.mjs` `FORBIDDEN_MODULES` now includes
  `http2` and `node:http2` to match `sandbox-loader.mjs`'s
  `FORBIDDEN_SPECIFIERS`. The static-import path was already covered;
  this closes the `require("http2")` via `createRequire` corner.
- **D-84** — `pdf-to-pngs.ts` extracts the page index via regex and sorts
  numerically rather than relying on `pdftoppm`'s zero-padding.

**Closed as won't-fix / by-design (no code change, doc status only):**
- **D-5** — `s3.deleteFiles` per-key swallow is intentional (best-effort
  cleanup; per-object errors logged for diagnostics, not escalated).
- **D-8** — `evaluateWorkbook` complexity bounded by the 5 s validator
  timeout; `parseSpec` caps + Kahn's O(V+E) topo sort make pathological
  inputs the LLM's problem to fix, not the validator's.
- **D-25** — Streamdown's internal mermaid pipeline is third-party; we
  can't override config without forking the package. Live with the dual
  source-of-truth for fenced mermaid in markdown artifacts.
- **D-30** — unsaved-edit nav guard moot post panel-chrome overhaul
  (panel is view-only across every type). Re-evaluate if editing
  returns.
- **D-32** — sandbox isolation model documented inline in
  `sandbox-runner.ts` (OS child process, no cgroup/seccomp/namespace,
  threat model: trusted-but-fallible LLM). Tightening to a VM /
  worker-thread is a separate plan.
- **D-33** — `Function`/`eval` deliberately unblocked because `docx`
  transitively uses `function-bind`. Documented in `sandbox-wrapper.mjs`
  with explanatory comment.
- **D-35** — `render-pages` route returning 404 on cache miss is the
  intentional two-step protocol: client must call `/render-status` first
  (which runs the pipeline + populates the cache via the single-flight
  Map from D-34), then fetch individual pages. Triggering a re-render
  from `/render-pages` would couple the page-image endpoint to the
  pipeline and violate cache-as-source-of-truth.
- **D-48** — `mermaid-theme.ts` (export-layer, used by client PPTX path)
  and renderer-side `mermaid-config.ts` (live preview) are
  complementary, not redundant. Both share the theme-key vocabulary;
  splitting the consumers means each can evolve independently.
- **D-39 / D-41** — `SLIDE_LAYOUTS` is 18 entries; `R3F_ALLOWED_DEPS`
  is 34 entries. Counts captured for reference; nothing to fix.
- **D-52** — `s3.uploadFile` empty-`url` default is opt-in via
  `includeUrl` for callers that don't need a presigned URL. Documented
  on the function.
- **D-56 / D-57 / D-58 / D-59** — spreadsheet engine bounds: pure
  `evaluateWorkbook` (concurrent-safe), no formula whitelist (uses
  `fast-formula-parser`'s native ~150 functions), no array spillover,
  range-type named ranges silently `null`. All structural — by design,
  not a bug.
- **D-61** — folded into D-66 (Tailwind class strings vs theme hex);
  styles.ts top-of-file comment explains the divergence.
- **D-63** — mitigated by the "Calculating formulas…" footer added in
  commit `4e06a7f`. Two-pass render itself is intrinsic to the
  parseSpec-sync / evaluateWorkbook-async architecture.
- **D-67** — `_mermaid-types.ts` relocation closed; nothing pending.
- **D-70** — concurrent-write error-message divergence between LLM tool
  path and HTTP path is intentional (different audiences, different
  retry advice). Documented as such.
- **D-74** — `getDashboardChatSessionArtifact` coercing null
  `artifactType` to `""` is the safest behaviour for the existing
  consumers (every caller compares to `"text/document"` and rejects
  empty). Documented; throw-404 alternative considered and skipped.
- **D-87** — 16-char SHA-256 prefix for cache keys (64 bits) is
  collision-safe for any realistic artifact-id × hash space.
- **D-88** — false positive in original audit; `mermaid-to-png.ts:9`
  comment is current. Closed.

**Open with separate plan needed:**
- **D-37** — `soffice` cold-start. LibreOffice listener-socket / daemon
  mode would shave ~1–3 s per render but requires subprocess-management
  rewrite; benchmark first.
- **D-64** — XLSX export emits no chart objects. ExcelJS upstream lacks
  a stable chart API. Known limitation; track upstream or swap library.
- **D-81** — `vector-store.ts` legacy `storeDocument` (sequential loop)
  vs newer `storeChunks` (batched parallel). Knowledge-upload path uses
  the legacy version; reconciliation needs careful test coverage to
  avoid behaviour drift on metadata enrichment paths.

**No remaining open items after this batch.** All findings either
closed, made moot, mitigated, documented as by-design, or moved to a
separate plan tracker.

### Second-pass re-scan findings (2026-04-30, against HEAD `f5ddef1`)

A follow-up 5-agent re-scan against HEAD `f5ddef1` surfaced 12 new
items. All are now classified:

**Closed in commits `e62ccde`, `c41d32c`, `9aeb8b7`, `3ea9e3e`:**

- **D-89 (NEW-V-2). docx-preview-pipeline TOCTOU window.** Two
  concurrent `renderArtifactPreview` calls could both miss the S3 cache
  between `Map.get(key)` and `Map.set(key, …)`, each spawning an
  independent pipeline run. Fixed in `e62ccde`: the `inFlight.get(key)`
  check now happens BEFORE the await on `getCachedPngs`; the cache check
  is moved INSIDE the inFlight-tracked work promise. Single-flight
  guarantee now holds for concurrent entry.
- **D-90 (NEW-S-1). djb2 32-bit cacheKey in artifact-indexer.**
  Replaced with SHA-256[:16] (`e62ccde`) to match the cache-key
  algorithm in `lib/document-script/cache.ts`. 64-bit prefix is
  collision-safe for high-churn long-lived documents.
- **D-91 (NEW-P-2). Slides hex error message echoed lowercase input
  vs uppercase example list.** Now echoes the normalized (uppercase)
  form via existing `normalizeHex` result (`e62ccde`).
- **D-92 (NEW-R-5). Sheet "Calculating formulas…" footer didn't fire
  during content re-evaluation.** Content-change effect now resets
  `values=null` and `evalError=null` so the footer fires on
  re-evaluation, not just first-ever load (`e62ccde`).
- **D-93 (NEW-R-2). DocumentScriptRenderer Retry button focus-loss
  on click.** Error wrapper now carries `role="status"
  aria-live="polite"`; Retry button gains `aria-label`. Screen-reader
  users get spoken context for the loading-state transition (`e62ccde`).
- **D-94 (NEW-R-1). `.md` download path's isExporting guard
  unreachable.** Resolved by dropping the `.md` download option
  entirely per user request (`e62ccde`) — `text/document` artifacts now
  download as `.docx` or `.pdf` only. The orphaned guard moot.
- **D-95 (NEW-R-4). chart-to-svg theme parameter not wired.**
  Previously the API gained an `options.theme` argument (commit
  `9732b9a`) but neither caller passed it. Wired in `c41d32c`:
  `slides/render-html.ts` and `slides/generate-pptx.ts` now derive
  `theme` from `theme.primaryColor` via the new exported helper
  `inferChartTheme(hex)` (sRGB relative-luminance threshold at 0.5).
  Approved-list slide primaries are all dark, so charts now render with
  the dark palette in both preview HTML and PPTX export.
- **D-96 (NEW-T-2). Download route bypass single-flight + back-
  pressure.** New module `lib/document-script/docx-cache.ts` with
  `getOrComputeDocx()`: process-local Map cache (cap 16, FIFO) +
  inFlight Map keyed by `${artifactId}:${sha256(content)[:16]}`. Gates
  fresh sandbox runs through `withRenderSlot` (the existing semaphore
  shared with the preview pipeline). Concurrent DOCX→PDF clicks for
  the same artifact share one sandbox run (`9aeb8b7`).
- **D-97 (NEW-T-4). Metrics endpoint auth = any-logged-in-user.**
  Tightened to `role === "ADMIN"` (`3ea9e3e`). Scrapers should use a
  service account with the ADMIN role.
- **D-98 (NEW-P-3). r3f sanitizeSceneCode kept all `<color>`
  variants.** Restricted to `attach="background"` only (`3ea9e3e`);
  other variants (fog, environment, etc.) are silently stripped. The
  prompt only documents background-attach; other variants are out of
  scope and Three.js silently ignored them anyway.
- **D-99 (NEW-P-7). Slides mermaid prompt list (10) vs validator
  (25) split was undocumented.** Now explicitly noted in `slides.ts`
  prompt as intentional ("validator accepts full 25-type set, slides
  intentionally restrict to these 10 for legibility at presentation
  distances"). `3ea9e3e`.

**Closed as by-design (no code change):**

- **D-100 (NEW-S-5). XLSX export always light-themed.** Excel/XLSX
  document format is inherently light-surface — there is no dark mode
  in the format itself. The always-light `DEFAULT_THEME` is correct
  behaviour. Folded into D-66's existing rationale.

**Doc-vs-code drift surfaced by re-scan (fixed in this commit):**

- architecture-reference §6 route table now reflects `route.ts`
  GET/PUT/DELETE; download `?format=docx|pdf`; render-pages session-
  ownership check; edit-document row removed.
- Module-map tree no longer lists `edit-document/route.ts`.
- §10 S3Paths.artifact reflects `sessionId || "orphan"` fallback.
- §5 per-validator highlights updated for `validateCode` language plumb,
  `validateSlides` MUST→ctx.isNew error + hex whitelist, `validateSvg`
  `\d{2,}` regex, `validateDocument` `_ctx` parameter.
- D-2, D-7, D-82, D-69 entries in body sections now consistent with
  closed-list metadata.
- §12 D-38 description updated from "9 counters" to "6 counters" post-
  `6c1dd82` deletion of `llm_rewrite_*`.
- `_validate-artifact.ts` LoC: 2034 → 2159; `repository.ts` LoC: 237
  → 232.
- artifacts-capabilities §52 Common contracts no longer claims "no PDF
  download for any type" or references `/edit-document` POST.

**Re-scan summary: 12 new findings classified, all closed within the
batch. No deferred items added to the separate-plan tracker.**

### Open

2. **D-2. `markRagStatus` is read-then-write, not atomic**
   (`artifact-indexer.ts:113-128`). Concurrent metadata writes can
   clobber each other. Safer: `prisma.$executeRaw` with `jsonb_set`.

3. **D-3. PDF download not implemented**
   (`download/route.ts:44-48`). Only `?format=docx` is accepted; any
   other format returns 400 `Unsupported format: <x>`. No PDF path.

4. **D-4. Edit-document rate limiter is in-process only**
   (`edit-document/route.ts:16-29`). With N Next.js workers, effective
   rate is N × 10/60 s, not 10/60 s globally.

5. **D-5. S3 `deleteFiles` partial failure is logged but not escalated**
   (`s3/index.ts:282`, per-key errors logged at L308-314). `deleteFiles`
   does not throw or return them. Affects single-artifact versioned
   cleanup and session-delete bulk cleanup.

6. **D-7 (partial). Legacy fallback `findUnique` survives in
   `resolveTextToEmbed`** (`artifact-indexer.ts:87-91`). The fast path
   skips it when callers pass `artifactType` (L86) — and all three call
   sites in tree do — but the fallback is reachable for any future
   caller that omits the option. Could be deleted entirely along with
   the conditional, simplifying the function.

8. **D-8. Sheet validator `evaluateWorkbook` is O(V+E) Kahn's**
   (`spreadsheet/formulas.ts:145-185`, with documenting comment).
   Correctly bounded; the prior O(n²) is gone. Risk surface is moderate
   DAGs hitting the 5 s validator timeout; structural finding only.

9. **D-9. No GET handler for a single artifact**
   (`route.ts` exports only PUT + DELETE). Single-artifact reads happen
   via the session detail endpoint.

11. **D-11. `DocumentScriptRenderer` has no retry button on error**
    (`document-script-renderer.tsx:111-122`). Slides + mermaid have
    retry; this doesn't.

13. **D-13 (residual prose drift only). Validator error message is stale
    relative to the shared 25-entry array** (NEW-B duplicates this from
    a different angle). The mermaid prompt also documents only 19 types
    — silent acceptance of `packet-beta`, `kanban`, `C4Container`,
    `C4Component`, `C4Deployment`, `graph`, `stateDiagram` (alongside
    `stateDiagram-v2`), `architecture-beta`, `requirementDiagram` by
    the validator that the LLM never hears about.

14. **D-14. Slides severity gaps**. Prompt MUST/anti-pattern rules
    (first=title, last=closing, deck size 7-12, dark primaryColor) are
    warnings-only or absent in the validator. Confirmed: first=title
    L604-609 (warning), last=closing L610-615 (warning), deck size
    L581-589 (warning), dark primaryColor (no check anywhere).

15. **D-15. Markdown 128 KiB cap not in prompt**
    (`MARKDOWN_NEW_CAP_BYTES` `_validate-artifact.ts:1010`; prompt
    `markdown.ts` 249 LoC, no size mention).

16. **D-16. Python `open()` read-mode passes the validator**
    (regex `_validate-artifact.ts:1993` matches write modes only).
    Prompt forbids all `open()`; validator only checks write modes.

17. **D-17. SVG decimal-place threshold mismatch**. Prompt says "round
    to 1 dp max"; validator regex `\d\.\d{3,}` warns at 3+ dp. Path
    with 2 dp passes but violates the prompt rule. (Validator's "more
    than 2 decimal places" warning text matches the regex semantics
    internally — the drift is prompt vs validator.)

18. **D-18. `application/code` `language` parameter is unvalidated**
    (`validateCode` signature `_validate-artifact.ts:1253` — no
    language arg). Prompt declares it REQUIRED; validator has zero
    enforcement.

19. **D-19. Pie chart `fillOpacity` floor missing**
    (`sheet-chart-view.tsx:118`). `fillOpacity={1 - i * 0.1}` becomes
    ≤ 0 at 11+ slices; slices become invisible.

20. **D-20. Sheet `view` state shared across sheet tabs**
    (`sheet-spec-view.tsx:64`, no reset on tab switch L274-277).
    Switching from a charts-having sheet to one without leaves the user
    on the empty-state screen with no Data/Charts toggle to escape.

24. **D-24. `@fonts` directive on line 2 depends on line 1 being a
    directive** (`_react-directives.ts:81,89`). Parsing is positional
    — `@fonts` on line 1 (without `@aesthetic`) is silently skipped.

25. **D-25. Streamdown's internal mermaid path is not consolidated**
    under `mermaid-config.ts`. `streamdown-content.tsx:71-83` instantiates
    Streamdown with `controls={{ mermaid: true }}` — Streamdown owns
    the config. Second source-of-truth for fenced mermaid in markdown.

26. **D-26. `html-renderer` `allow-modals`**
    (`html-renderer.tsx:128` exact string `"allow-scripts allow-modals"`).
    Widens the sandbox vs `react-renderer`'s `allow-scripts` only —
    `alert()`, `confirm()`, `prompt()` work in HTML artifacts. UX
    choice, not a bug, but worth documenting.

27. **D-27. Python renderer hardcodes triple-backtick fence**
    (`python-renderer.tsx:206`). Unlike `application/code`'s adaptive
    fence length, Python with embedded triple-backticks (e.g.,
    docstrings with markdown examples) breaks Streamdown rendering.

28. **D-28 (relocated). The remaining direct `lucide-react` import is
    in `artifact-panel.tsx:18`** (`Maximize, Minimize`) — every other
    icon goes through `@/lib/icons`. The `document-script-renderer.tsx`
    that previously held this gap now imports from `@/lib/icons` (L3).
    Same root issue, different file.

30. **D-30. No `unsaved-edit` guard for navigation away**
    (`artifact-panel.tsx`). The `isSaving` flag prevents a second
    Restore click while one is in flight, but nothing prevents the
    user from navigating away mid-restore. Currently moot (panel is
    view-only) but applicable if editing returns.

32. **D-32. Sandbox is an OS child process, not a VM or Worker**
    (`sandbox-runner.ts:29-98`). Isolation: `--max-old-space-size=
    ${maxHeapMb}` flag (default 256, L22), wall-clock SIGKILL after
    `timeoutMs` (default 10 s, 5 s for dry-run), 100 MiB stdout cap
    (L21), and module-level fs/net blocking via a custom ESM loader
    hook (`sandbox-loader.mjs`) plus globalThis property shadows
    (`sandbox-wrapper.mjs`). **No cgroup, seccomp, or OS namespace
    isolation.** Child inherits full `process.env` including
    `DATABASE_URL` and any API keys. `NODE_OPTIONS: ""` clears any
    inherited options (L49).

33. **D-33. `Function` and `eval` are deliberately unblocked in the
    sandbox** (`sandbox-wrapper.mjs:22-27`, with explanatory comment).
    `docx` transitively uses `function-bind`, which calls
    `Function.prototype.bind` at module load. Blocking `Function`
    breaks the `docx` import.

34. **D-34. Render-queue is a process-local counting semaphore**
    (`render-queue.ts`), default capacity 3 (`RENDER_CONCURRENCY` env
    override). No TTL, no lock timeout, no distributed coordination,
    no single-flight per `(artifactId, hash)`. Two simultaneous
    requests for the same artifact each run the full
    sandbox→soffice→pdftoppm pipeline.

35. **D-35. Render-pages route does not trigger a re-render**
    (`render-pages/route.ts:19-22`). If the PNG is not in S3, the
    route returns 404. Client must call `/render-status` first to
    populate the cache, then fetch individual pages. Two-step protocol
    is not enforced server-side.

36. **D-36. PNG cache reads are sequential** (`cache.ts:22-37`). 50-
    page document = 51 sequential S3 GETs (1 manifest + 50 pages). No
    `Promise.all`, no in-memory or Redis layer.

37. **D-37. `soffice` cold-start every call** (`docx-to-pdf.ts:21-25`).
    No daemon mode, no LibreOffice server pool. ~1-3 s overhead per
    render. The semaphore cap of 3 partially mitigates by throttling
    concurrency.

38. **D-38. Document-script metrics have zero external visibility**
    (`metrics.ts`: 9 in-memory counters, lines 4-11). No Prometheus,
    StatsD, Datadog, no export endpoint. Process-local only.

39. **D-39. SLIDE_LAYOUTS contains 18 entries** (`_validate-artifact.ts:
    183-203`, verified verbatim: title, content, two-column, section,
    quote, image-text, closing, diagram, image, chart,
    diagram-content, image-content, chart-content, hero, stats,
    gallery, comparison, features). The deprecated `image-text` is in
    the set.

40. **D-40. Slides has no primaryColor/secondaryColor hex whitelist
    in the validator.** Prompt declares 6 approved hexes for each
    (`slides.ts:40-56`); `validateSlides` parses the `theme` key but
    never validates its color fields.

41. **D-41 (revised). `R3F_ALLOWED_DEPS` count is 34**
    (`_validate-artifact.ts:629-668`). The original D-41 cited a
    36-claiming header comment; that comment is no longer present at
    HEAD (the section block at L622-628 describes behaviour without a
    count). The counter mismatch is now between the prompt's
    "20 helpers listed below" claim (`r3f.ts:44`) and the actual
    drei-helper table of **19 rows**.

42. **D-42. SVG `<style>` block is a hard error**
    (`validateSvg`, `_validate-artifact.ts:1553-1557`).

43. **D-43. HTML inline `<style>` >10 lines is a warning, not an error**
    (`validateHtml`, `MAX_INLINE_STYLE_LINES = 10`,
    `_validate-artifact.ts:51,1675-1679`).

46. **D-46 (changed shape). `validateDocument` no longer accepts
    `ctx`** (`_validate-artifact.ts:169-173` — function signature is
    `(content: string)` only). The only `VALIDATORS` entry that does
    not match the `(content, ctx?) => ...` shape. Cannot be given
    `isNew`-only rules without a signature change. Was previously a
    code-tidy nit (`_ctx` unused); now structurally distinctive.

47. **D-47. RAG embedding text is the rendered DOCX for `text/document`**
    (`artifact-indexer.ts:96-103` → `extractDocxText` → `pandoc -f docx
    -t plain`). One sandbox spawn + one pandoc spawn per index/re-index
    on top of the embedding work.

51. **D-51. `chart-to-svg.ts` is hardcoded light theme**
    (414 LoC, light-only `DEFAULT_COLORS` L13-22, `fill="white"`
    backgrounds, `#1e293b`/`#64748b`/`#94a3b8` tokens; no theme
    parameter on `chartToSvg()` L355). Used in PPTX export.

52. **D-52. `uploadFile` returns empty `url` by default**
    (`s3/index.ts:139,158`). Callers must opt in via
    `options.includeUrl: true` to get a presigned download URL.

54. **D-54. Edit-document LLM rewrite has at most 3 attempts**
    (`llm-rewrite.ts:6`: `MAX_RETRIES = 2`, total `1 + 2 = 3`).

55. **D-55. Edit-document rate limit explicitly process-local**
    (`edit-document/route.ts:13-15` comment). Marked as "not a
    substitute for a real distributed rate limiter." Same as D-4.

56. **D-56. `evaluateWorkbook` is a pure function**
    (`spreadsheet/formulas.ts:48`). Does not mutate the input spec or
    any shared state. Returns a fresh `WorkbookValues` Map. Safe to
    call concurrently for the same spec.

57. **D-57. No formula function whitelist**. `fast-formula-parser`
    handles its own ~150+ Excel function set natively. Unknown function
    names produce `#NAME?` from the parser, not from this codebase.

58. **D-58. Array spillover not supported**. Modern Excel's dynamic
    arrays (`SORT`, `FILTER`, `UNIQUE` returning multi-cell ranges)
    are not implemented. `onRange` (`spreadsheet/formulas.ts:241`)
    returns a 2D array but evaluator assigns the result only to the
    formula's own cell — no spill into adjacent cells.

59. **D-59. Range-type named ranges evaluate to `null` silently**
    (`spreadsheet/formulas.ts:82,260` `onVariable`). Named ranges
    containing `:` (e.g., `"Data": "Sheet1!A1:A10"`) are tracked in
    dependency parsing but return `null` at evaluation. No error.

61. **D-61. Two parallel number formatters**: `format.ts:11`
    `formatNumber` (delegates to `numfmt`) used by the live grid.
    `formatCellValue` was **dropped from `styles.ts` (b3e6cdf)**, so
    the prior dual-formatter symptom is gone. The remaining gap is the
    Tailwind/hex split inside `styles.ts` (D-66). This finding is
    folded into D-66.

62. **D-62 (narrowed). `format.ts` redundant code path** —
    `formatNumber` (L11-26) has `if (!format) return String(value)` at
    L19-20 that makes the catch branch unreachable for the
    missing-format case. The catch at L23 is still live for malformed
    format strings (`numfmt` throws), so the branch is not strictly
    dead. Net behaviour identical (`String(value)`).

63. **D-63. `SpecWorkbookView` is a two-pass render with no loading
    indicator** (`sheet-spec-view.tsx:73 (parse), 76-93 (eval)`). First
    paint: `parseSpec` runs synchronously in `useMemo`;
    `evaluateWorkbook` is dynamic-imported inside a `useEffect`. Until
    the effect resolves, formula cells show empty/raw values. `Suspense`
    fallback only covers the lazy-load of the whole component, not the
    inner async eval.

64. **D-64. XLSX export emits no chart objects**
    (`generate-xlsx.ts:86-90`). ExcelJS lacks a stable chart API.
    Charts exist only in the browser preview (Recharts inside
    `SheetChartView`). The downloaded `.xlsx` contains data ranges
    only.

66. **D-66. Tailwind class strings in `styles.ts` diverge from theme
    hex values**. `resolveCellStyle` carries both `fontColor` (hex,
    XLSX) and `classNames` (Tailwind, HTML). Comment at L7-18 explicitly
    documents the intentional split. If the consumer overrides
    `inputColor` with an unusual value, the XLSX and HTML preview will
    show different colors.

### NEW (since `a81c343`)

The following surfaced in this rescan and are not yet in the historical
D-N series. Numbered D-67+ to keep numbering monotonic.

67. **D-67 (~~superseded by shared module~~).** `_mermaid-types.ts` was
    relocated to `lib/rendering/mermaid-types.ts:14-40`. 25 entries
    confirmed. The validator now imports it (`_validate-artifact.ts:31,
    1321`) so the count drift between validator and slides is gone.

68. **D-68. `application/3d` has three different label strings.**
    Registry `label = "3D Scene"` (`registry.ts:177`); registry
    `shortLabel = "R3F Scene"`; prompt `r3fArtifact.label = "R3F 3D
    Scene"` (`prompts/artifacts/r3f.ts:4`). `CANVAS_TYPE_LABELS` and
    panel chrome surface different strings depending on which source
    they read.

69. **D-69. `S3Paths.artifact` has no `"orphan"` fallback for
    sessionId** (`s3/index.ts:107-108`). Shape is
    `artifacts/${orgId || "global"}/${sessionId}/${artifactId}${ext}` —
    if `sessionId` is null/undefined the segment becomes `"undefined"`
    or `""`. Prior docs claimed `sessionId|"orphan"`; the code does
    not implement that guard. `S3Paths.document` uses the
    `|| "global"` pattern correctly for `orgId`; `artifact` does not
    apply it to `sessionId`.

70. **D-70. Concurrent-write error messages diverge between LLM tool
    path and HTTP path.**
    - LLM (`update-artifact.ts:240-243`): `"Concurrent update
      detected: another writer modified this artifact between read and
      write. Re-fetch the artifact and retry the update."`
    - HTTP (`service.ts:599-602`): `"Concurrent update detected:
      another writer changed this artifact while you were editing.
      Reload to see the latest version, then retry your save."`
    Different audiences explain the divergence; not previously
    documented.

71. **D-71. `edit-document/route.ts` skips Zod schema validation on
    params** (L45 `const { id, artifactId } = await params`). Other
    artifact routes validate via
    `DashboardChatSessionArtifactParamsSchema.safeParse`. Empty/
    malformed ids fall through to the DB and surface a 404 instead of
    a clean 400.

72. **D-72. `render-pages` route bypasses session ownership.** Only
    auth-checked (`render-pages/route.ts:12-13`). Every other artifact
    sub-route calls `getDashboardChatSessionArtifact` for ownership;
    this one does not. Any authenticated user who knows an `artifactId`
    and its `contentHash` can fetch its cached PNG pages — IDOR by
    design (`contentHash` is the unguessable token).

73. **D-73. `addOrUpdateArtifact` always sets active id**
    (`use-artifacts.ts:82`). Including for `streaming-${toolCallId}`
    placeholders. For rapid multi-artifact creation it could briefly
    flicker the panel between placeholder ids.

74. **D-74. `getDashboardChatSessionArtifact` coerces null
    `artifactType` to `""`** (`service.ts:645`). Return type declared
    as `... & { artifactType: string }`. Type-comparing call sites
    (e.g. `=== "text/document"`) reject empty strings correctly, but
    the silent coercion can mislead future consumers.

75. **D-75. `deleteArtifactsBySessionId` (`repository.ts:232-236`) is
    dead code.** Service inlines its own `deleteMany` inside a
    transaction (`service.ts:329-333`). The exported function is
    unreachable from any route.

76. **D-76. Sandbox `http2` block asymmetry between loader and
    wrapper.** `sandbox-loader.mjs:10-19` `FORBIDDEN_SPECIFIERS`
    includes `"http2"` and `"node:http2"`. `sandbox-wrapper.mjs:8-14`
    `FORBIDDEN_MODULES` lists 13 entries, missing both `http2` and
    `node:http2`. Static `import http2 from "http2"` is caught by the
    loader; `require("http2")` via `createRequire` is not.

77. **D-77. Mermaid validator error message hardcodes 19 types**
    (`_validate-artifact.ts:1384`). The shared array has 25
    (`mermaid-types.ts:14-40`). Authors seeing the error cannot
    discover `packet-beta`, `kanban`, `C4Container`, `C4Component`,
    `C4Deployment`, `graph` from the prose.

78. **D-78. `r3f.ts:44` claims "20 helpers listed below"; table has
    19 rows.** Off-by-one in the prompt header. LLM may trust the
    count and look for a 20th helper that doesn't exist.

79. **D-79. `RANGE_RE` in `chart-data.ts:19` does not handle
    `$`-absolute refs.** Pattern `^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$`
    rejects `Sheet1!$A$2:$B$5`. `expandRange` returns `[]`,
    `resolveChartData` produces zero rows — silent empty chart. Either
    enforce relative-only at the prompt/validator layer or strip `$`
    before matching.

80. **D-80. `s3/index.ts uploadStream` always presigns**
    (L190 always calls `getPresignedDownloadUrl`). `uploadFile` made
    URL generation opt-in via `includeUrl` (D-52); `uploadStream` did
    not get the same treatment. Every caller pays an extra signing
    round-trip.

81. **D-81. `vector-store.ts` has two divergent chunk-write paths.**
    Legacy `storeDocument` (sequential loop L69) is used by the
    knowledge-upload path; `storeChunks` (batched parallel L513,
    `STORE_CHUNKS_CONCURRENCY = 8`) is used by the artifact indexer.
    Knowledge upload is slower for large documents.

82. **D-82. `BATCH_SIZE` and `EMBED_CONCURRENCY` are compile-time
    constants** (`embeddings.ts:15-16`). No env override path. Operators
    cannot tune embedding parallelism without a code change.

83. **D-83. `examples` field is not validated by the prompt-module
    `satisfies`.** `index.ts:34-39` enforces `type, label, summary,
    rules` at compile time but not `examples`. A missing or malformed
    `examples` array passes the type checker.

84. **D-84. `pdf-to-pngs.ts` page sort is lexicographic**
    (`pdf-to-pngs.ts:45 .sort()`). Depends on `pdftoppm` zero-padding
    filenames when page count exceeds 9. If pdftoppm ever changes its
    naming (or the cap changes), `page-1.png, page-10.png, page-2.png`
    sort order would break.

85. **D-85. `resize-svg.ts` only handles double-quoted attributes**
    (regex L11-16). SVGs with single-quoted root attrs leave duplicate
    `width=`/`height=` after the rewrite. parse5 normalises validated
    SVGs but `resizeSvg` is also called on Mermaid output where source
    isn't normalised.

86. **D-86. `extract-text.ts` has no fallback when `pandoc` is
    missing.** Spawn error rejects to caller; fine in the Docker
    image but no graceful degradation. RAG indexing for `text/document`
    falls back to raw script source on this failure (handled in
    `artifact-indexer.ts:104-106`).

87. **D-87. `cache.ts` SHA-256 hash is truncated to 16 hex chars**
    (`computeContentHash`). 64-bit prefix. Theoretical collision risk
    on very-long-lived artifactIds; in practice negligible but worth
    documenting as a design choice.

88. **D-88. Mermaid theme comment drift.** `mermaid-theme.ts:37`
    states "DOCX export path no longer exists — only PPTX uses this
    module" (correct post `a81c343`); `mermaid-to-png.ts:9` still has
    an older comment referencing PPTX rasterizer. Cosmetic.

### Resolved (closed since `8b6e69b`/`a81c343`)

- **D-1. ~~HTTP PUT loses `documentFormat`~~** — `ValidationContext`
  no longer has a `documentFormat` field (`a81c343`). `service.ts:509-511`
  passes `(type, content)`.
- **D-6. ~~Version entries lack `documentFormat`~~** — moot; the field
  is no longer part of the artifact shape (`a81c343`).
- **D-7 (mostly closed). ~~`resolveTextToEmbed` extra DB round-trip~~**
  — fast path skips the `findUnique` when `artifactType` is supplied;
  all three current call sites pass it (`b23e06f`). Residual fallback
  branch tracked above as a code-tidy item.
- **D-10. ~~`ArtifactRenderer` always routes `text/document` to
  `DocumentRenderer`~~** — no `text/document` case in
  `artifact-renderer.tsx` (`a81c343`); panel intercepts.
- **D-12. ~~`EditDocumentModal` has no caller~~** — file deleted
  (`0b25e56`).
- **D-13 (closed at type-system level). ~~Mermaid validator vs slides
  drift~~** — both now import the shared `MERMAID_DIAGRAM_TYPES_SHARED`
  from `lib/rendering/mermaid-types.ts:14-40`. **Residual** prompt-side
  drift (19 vs 25) tracked under D-13 (Open) above; the validator's
  stale error message is tracked as D-77.
- **D-21. ~~R3F `ready` state is dead~~** — `setReady`/`ready` removed
  (`0b25e56`); `didReady` ref-only is what runs.
- **D-22. ~~Mermaid `containerRef` attached but never read~~** —
  removed (`0b25e56`).
- **D-23. ~~Mermaid `deterministicIDSeed` is inert~~** — removed
  from `mermaid-config.ts` (`02e24a6`/`0b25e56`).
- **D-28 (relocated, not closed). ~~`DocumentScriptRenderer` direct
  `lucide-react` import~~** — `document-script-renderer.tsx:3` now
  uses `@/lib/icons`. Direct import survives in `artifact-panel.tsx:18`
  for `Maximize, Minimize`. Same root issue, different file. Tracked
  under D-28 (Open) above.
- **D-29 (closed at renderer). ~~R3F `<color>` silent stripping~~** —
  `r3f-renderer.tsx:118-123` carries an explicit comment honoring
  `<color attach="background">`. **Residual** prompt-side drift: the
  R3F prompt does not document that `<color>` is permitted — silent
  pass for the LLM.
- **D-31. ~~`text/document` script-mode skips `isNew` size cap~~** —
  there is no other mode any more; nothing to skip.
- **D-44 / D-45 / D-70 (legacy). ~~AST schema/footer/footnote bugs~~**
  — files deleted (`a81c343`).
- **D-46 (changed shape). ~~`validateDocument` accepts `_ctx` but
  never reads it~~** — now accepts no `ctx` at all
  (`_validate-artifact.ts:169`). Tracked under D-46 (Open) above as a
  structural gap rather than a tidy nit.
- **D-49 / D-68. ~~Server `mermaid-to-svg.ts` `securityLevel: "loose"`
  / 8 px/char heuristic~~** — file removed (`a81c343`).
- **D-53. ~~Duplicate of D-2~~** — kept open under D-2.
- **D-60. ~~CSV tokenizer duplicated across three files~~** —
  `lib/spreadsheet/csv.ts` is the single shared `tokenizeCsv`
  (`02e24a6`).
- **D-65. ~~`note` cell style hardcodes `#666666`~~** — `b3e6cdf`
  added `noteColor?` to `SpreadsheetTheme` (`types.ts:58`),
  `DEFAULT_THEME.noteColor` (L67), `generate-xlsx.ts applyStyle`
  (L138 `hexToArgb(theme.noteColor)`), and `styles.ts resolveCellStyle`
  (L54 `fontColor: t.noteColor`). End-to-end themable.
- **`formatCellValue` removed from `styles.ts`** (`b3e6cdf`). The
  earlier "two parallel number formatters" symptom of D-61 is gone.

---

## 13. Glossary

- **Registry** — `ARTIFACT_REGISTRY` in `registry.ts` (12 entries,
  L62-L183). The list of every artifact type with its label, extension,
  code-tab flag, language hint.
- **Validator** — `validateArtifactContent(type, content, ctx?)`
  (`_validate-artifact.ts:127`). The one entry point every persistence
  path runs through.
- **Renderer** — the React component that displays the artifact in the
  panel. Always under `renderers/`. Lazy-loaded for heavy renderers.
- **Panel** — `<ArtifactPanel>` in `artifact-panel.tsx` (841 LoC). The
  fixed-size preview pane on the right of the chat workspace.
- **Indicator** — `<ArtifactIndicator>` — the small chat-bubble pill
  that links to the panel.
- **`canvasMode`** — string the user can set in the chat input toolbar
  to lock all subsequent artifacts to a single type. `"auto"` means no
  lock.
- **`documentFormat`** — removed entirely (column dropped via migration
  `20260429100656_drop_document_format`, code via `a81c343`/`6a019db`).
  No readers.
- **Optimistic lock** — `prisma.document.updateMany({ where: { id,
  updatedAt: existing.updatedAt }, data: ... })`. Returns `count: 0`
  on conflict.
- **Versioned S3 key** — `<canonical>.v<N>` — every update archives
  the prior content here before overwriting the canonical key.
  `versionNum = versions.length + 1` (1-indexed).
- **RAG re-index** — for updates, prior SurrealDB chunks are deleted
  before new ones are inserted; `metadata.ragIndexed` is patched at
  the end. Indexer takes `artifactType` (post `b23e06f`) so the per-call
  DB round-trip is gone for current callers.
- **Streaming placeholder** — `streaming-${toolCallId}` artifact id
  used while a `create_artifact` tool call is mid-stream. Replaced or
  removed on `tool-output-available` / abort.
- **`ValidationContext`** — `{ isNew?: boolean }`. Two validators read
  it: `validateMarkdown` (128 KiB cap), `validateSlides` (`image-text`
  deprecation hard-error). `validateDocument` is the only entry whose
  signature does not accept it.
