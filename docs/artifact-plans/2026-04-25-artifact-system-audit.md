# Artifact System — Quality & Risk Audit

**Date:** 2026-04-25
**Scope:** All artifact-system surfaces on `main` (HEAD `14dabfd`).
**Method:** Three independent passes against actual source code:
1. **Initial audit** — feature-dev:code-reviewer, hypothesis-driven (20 hypotheses + open invitation for new findings).
2. **Coverage audit** — Explore agent, sweeps for areas missed in pass 1 (tests, deletion cascade, concurrency, resource leaks, memory growth, auth, MIME types, streaming, rate limiting, migrations).
3. **Blast-radius review** — feature-dev:code-reviewer, evaluates each proposed fix for backward-compat impact and migration requirements.

Every finding carries a `file:line` citation and a classification: **UPGRADE** / **REPLACE** / **DELETE** / **FIX**.

This file is the **source of truth** for the audit. The summary at the end of [artifacts-deepscan.md](./artifacts-deepscan.md) and the per-type spec in [artifacts-capabilities.md](./artifacts-capabilities.md) describe the artifact system as it currently exists; this file describes what should change.

---

## Table of contents

- [Executive summary](#executive-summary)
- [Pass 1 — 24 initial findings](#pass-1--24-initial-findings)
- [Pass 2 — 7 additional findings](#pass-2--7-additional-findings)
- [Pass 3 — fix blast-radius classification](#pass-3--fix-blast-radius-classification)
- [Final prioritized action list](#final-prioritized-action-list)
- [Test coverage gaps](#test-coverage-gaps)
- [Migration considerations](#migration-considerations)
- [Capability gaps (upgrade backlog)](#capability-gaps-upgrade-backlog)
- [Out-of-scope items](#out-of-scope-items)

---

## Executive summary

**31 issues identified across 3 audit passes**, distributed:

| Class | Count | Examples |
|---|--:|---|
| **CRITICAL** (security, data loss, privacy) | 7 | Server-side mermaid concurrency bug, RAG chunks leaked on delete, Document AST resolved-content discarded, S3 versioned keys orphaned, version array clobbering under concurrency, missing artifact returns success, manual edits skip Unsplash resolution |
| **HIGH** (active bugs, resource leaks, perf) | 12 | Footnote double-render, mermaid theme inconsistency, validateMarkdown permits `<script>`, no validator timeouts, postMessage no origin check, PPTX error swallowed, historical-version download = "undefined", `update_artifact` no canvas-mode check, unsplash cache race, `react-renderer` setError-in-useMemo, RAG indexer rethrow, history-version content undefined |
| **MEDIUM** (consistency, data hygiene) | 8 | Schema fields silently dropped (logoUrl, list.startAt, image-text), test coverage gaps, deprecated layouts kept in allowlist, malformed tool output silently dropped, footnote schema-impl mismatch, metadata column unbounded, mermaid module singleton in dev, table cell width fallback |
| **LOW / REFACTOR** | 4 | `_validate-artifact.ts` 2022-line monolith, slides 17-layout duplication, `artifact-panel.tsx` 939 lines, mermaid module-level cache |

**Top 5 to do first** (after blast-radius analysis):

1. **NEW-1: RAG chunks orphaned when an artifact is deleted individually** — privacy/compliance issue. 1-line fix, no migration.
2. **Fix #1: Footnote `useMemo` mutation bug** — actively duplicates footnotes on re-render. 1-line fix.
3. **NEW-3: Server-side mermaid concurrency bug** — confirmed unsafe under concurrent DOCX exports. ~10-line per-process mutex (NOT worker_threads).
4. **Fixes #2 + #3 + #6 (triple bug bundle in `update-artifact.ts`)** — Document AST content discarded + missing-artifact returns success + no canvas-mode check. ~30 lines, one file.
5. **Fix #5 + #21**: S3 versioned-key cleanup on delete + RAG indexer rethrow removal. ~20 lines.

**Do NOT merge without staged rollout / data migration:**

- Fix #16 (`<script>` hard error + 128KB cap on markdown) — breaks existing artifacts.
- Fix #19 (remove `image-text` slide layout) — breaks existing slides.

**Defer (architectural mismatch):**

- Fix #20 (formula evaluator → Web Worker) — `SpreadsheetSpec` callback design is not Worker-compatible without redesign.

---

## Pass 1 — 24 initial findings

### 🔴 CRITICAL

#### 1. `update-artifact.ts` (LLM tool) has no canvas-mode lock check
**Class:** FIX · **Confidence:** HIGH

`create-artifact.ts:68–86` checks `context.canvasMode` and rejects type mismatches; `update-artifact.ts:46` declares `execute: async (params)` without a `context` parameter at all. An LLM in canvas-mode-locked state can call `update_artifact` with content of a different type — the existing-type validator runs (HTML validator accepts most JSX as valid), so the wrong content is persisted.

**Impact:** Canvas-mode invariant bypassable. Stored artifact with mismatched content/type breaks the renderer.

**Action:** Add `context` as the second parameter to `execute`; mirror lines 68–86 from `create-artifact.ts`.

---

#### 2. Service-layer manual edit does not re-resolve Unsplash URLs
**Class:** FIX · **Confidence:** HIGH

`service.ts:459–527` (`updateDashboardChatSessionArtifact`) runs the validator but never calls `resolveImages` / `resolveSlideImages`. Manual edits in the panel that introduce `unsplash:` URLs persist them as raw `unsplash:keyword` strings.

**Action:** After validation in `service.ts`, mirror the `create-artifact.ts:126–129` resolution logic for HTML / slides / document.

---

#### 3. S3 versioned objects leaked on artifact delete
**Class:** FIX · **Confidence:** HIGH

`deleteDashboardChatSessionArtifact` (`service.ts:591–597`) deletes only `existing.s3Key`. The versioned keys (`<key>.v1`, `<key>.v2`, …) created by `update-artifact.ts:111` are never collected. With 20+ versions per artifact, that's 20+ orphaned S3 objects per delete.

Same hole in FIFO eviction (`update-artifact.ts:141–147`): evicted versions are removed from metadata but their S3 keys are never deleted.

**Action:** Walk `existing.metadata.versions[*].s3Key`, batch via `deleteFiles()` before the primary key delete. Same for FIFO eviction path.

---

#### 4. Server-side mermaid render uses `securityLevel: "loose"` on LLM content
**Class:** FIX · **Confidence:** HIGH

`src/lib/rendering/server/mermaid-to-svg.ts:113` calls `mermaid.initialize({ ...MERMAID_INIT_OPTIONS, securityLevel: "loose" })` with a comment explaining DOMPurify rebinding-on-reuse. The justification ("author-controlled LLM content") is wrong: `text/document` mermaid blocks may include attacker-controlled labels (e.g., LLM reflects user requirement text into a node label).

**Impact:** Server-side XSS / code injection vector during DOCX export, triggered by malicious mermaid payload in a `text/document` artifact.

**Action:** Spawn mermaid render in `worker_threads` Worker per export, OR validate diagram source against `MERMAID_DIAGRAM_TYPES` allowlist + reject HTML/event-handler injection patterns. **NOTE (from Pass 3): worker_threads is overkill — a per-process Promise mutex is sufficient and cheaper**, see NEW-3 below.

---

#### 5. `resolveUnsplashInAst` bypasses the Prisma cache
**Class:** FIX · **Confidence:** HIGH

`src/lib/document-ast/resolve-unsplash.ts:104–116` calls `searchPhoto()` directly without the cache layer. The HTML/slides path uses `resolveQueries()` in `src/lib/unsplash/resolver.ts` which checks `prisma.resolvedImage` first.

**Impact:** Every `text/document` validation (create + update + DOCX export) hits the Unsplash API uncached. Free tier is 50 req/hour.

**Action:** Export `resolveQueries` from `resolver.ts` and reuse it in `resolve-unsplash.ts`.

---

### 🟠 IMPORTANT

#### 6. Mermaid theme inconsistency: documents are always light, standalone is theme-aware
**Class:** FIX · **Confidence:** HIGH

`document-renderer.tsx:11,548` uses `MERMAID_INIT_OPTIONS` from `src/lib/rendering/mermaid-theme.ts` (hardcoded `background: "#ffffff"`). `mermaid-renderer.tsx:5–33` uses theme-aware `getMermaidConfig(theme)` from `mermaid-config.ts`. Documents in dark mode show jarring white-boxed mermaid diagrams.

**Action:** Add `getMermaidConfig` factory to `mermaid-theme.ts` (or expose theme-aware version) and pass through `MermaidPreviewBlock`.

---

#### 7. Unsplash cache race condition silently swallowed
**Class:** FIX · **Confidence:** HIGH

`resolver.ts:172–184` has an empty `catch` block to ignore the duplicate-key error from concurrent `create()` calls.

**Action:** Replace `prisma.resolvedImage.create({data})` with `prisma.resolvedImage.upsert({where: {query}, update: {...}, create: {...}})`. Verify `@@unique` on `query` exists in the Prisma schema first.

---

#### 8. `to-docx.ts` footnote rendering filters to `Paragraph` only
**Class:** FIX · **Confidence:** HIGH

`to-docx.ts:548–556`: `rendered.filter((r): r is Paragraph => r instanceof Paragraph)` — schema declares `children: BlockNode[]` (which includes `table`, `mermaid`, `chart`, `list`, `blockquote`). Non-paragraph footnote children are silently dropped on export. Preview renders them correctly → preview/export divergence.

**Action:** Implement full block rendering in the HTML footnote section (the to-docx side already supports it via `renderBlocks`). NO schema narrowing — would break existing artifacts.

---

#### 9. `create-artifact.ts` HTML resolution uses original `content` instead of `validation.content`
**Class:** FIX · **Confidence:** HIGH

`create-artifact.ts:125–129` does:
```typescript
let finalContent = validation.content ?? content
if (type === "text/html") {
  finalContent = await resolveImages(content)  // <-- ignores `finalContent`
}
```

Currently safe because no HTML validator rewrites content, but a latent bug for any future validator that does (e.g., CSP nonce injection).

**Action:** Change to `finalContent = await resolveImages(finalContent)`.

---

#### 10. `update-artifact.ts` discards Document AST resolved content
**Class:** FIX · **Confidence:** HIGH

`update-artifact.ts:92` sets `let finalContent = content` (raw original). `validateDocument` resolves Unsplash URLs inside the AST and returns the resolved JSON in `validation.content`, but it's never applied. Every `update_artifact` call on a `text/document` artifact stores raw `unsplash:keyword` URLs.

**Action:** Change line 92 to `let finalContent = validation.content ?? content` (mirrors `create-artifact.ts:125`).

---

#### 11. Footnote sink `useMemo` mutation bug — duplicate footnotes on re-render
**Class:** FIX · **Confidence:** HIGH

`document-renderer.tsx:402` wraps `newFootnoteSink()` with `useMemo([content])`. The sink is mutated as a side-effect during AST walk (via `push()` from `renderInline:84`). When parent re-renders without `content` change (focus, animation frame, parent state), the same memoized sink is reused — and `push()` is called again, doubling all footnote entries.

**Action:** Drop the `useMemo` — `const footnotes = newFootnoteSink()`. Allocation is cheap.

---

#### 12. postMessage listeners have no origin/source check
**Class:** FIX · **Confidence:** HIGH

`slides-renderer.tsx:41–49` and `react-renderer.tsx:436–444` accept any `message` event without checking `e.source` or `e.origin`. Other iframes on the same page can spoof slide-change / error events.

**Action:** Add `if (e.source !== iframeRef.current?.contentWindow) return` at the top of each handler.

---

#### 13. `to-docx.ts` ignores `list.startAt`
**Class:** FIX · **Confidence:** HIGH

Schema (`schema.ts:79`) accepts `startAt?: number`; HTML preview (`document-renderer.tsx:155`) renders `<ol start={N}>`; DOCX (`to-docx.ts:396–398`) acknowledges the limitation in a comment. Preview/export divergence.

**Action:** Implement via per-list `AbstractNumbering` `start` override (non-trivial), OR remove `startAt` from schema (simpler — Zod won't strip from existing artifacts since schemas aren't `.strict()`).

---

#### 14. `coverPage.logoUrl` accepted by schema, rendered by HTML preview, but not in DOCX
**Class:** UPGRADE or DELETE · **Confidence:** HIGH

`schema.ts:38` allows `logoUrl`; HTML preview renders it (`document-renderer.tsx:385–391`); `resolve-unsplash.ts:100,127–129` walks it for Unsplash resolution. **`to-docx.ts:479–480` skips it** with a comment about async-cover complexity.

**Action:** Implement DOCX rendering — fetch URL, embed as `ImageRun` in cover section. The HTML preview already works.

---

#### 15. `validateMarkdown` produces no errors — `<script>` only soft-warned
**Class:** FIX · **Confidence:** HIGH

`_validate-artifact.ts:1004–1099` checks for empty content (one error case) but `<script>` tags, raw HTML, missing headings, heading-level skips, unlabeled fences are all warnings. A 511 KB markdown wall with `<script>` passes `ok: true`.

**Action:** Elevate `<script>` detection to a hard error. Add per-type 128 KB size cap (vs the global 512 KB).

⚠️ **MIGRATION NEEDED** — see Pass 3 §16. Existing markdown artifacts with `<script>` would become un-editable.

---

#### 16. Deprecated `image-text` slide layout still in allowlist
**Class:** DELETE · **Confidence:** HIGH

`SLIDE_LAYOUTS` (`_validate-artifact.ts:127–147`) keeps `"image-text"`. Validator soft-warns at L276–280; renderer treats as `content`-equivalent. Schema-only no-op.

**Action:** Remove from `SLIDE_LAYOUTS`. Validator will then hard-error on existing usage.

⚠️ **MIGRATION NEEDED** — see Pass 3 §19. Existing slides with `image-text` would become un-editable.

---

#### 17. `SpecWorkbookView` formula evaluator is synchronous on the render thread
**Class:** UPGRADE · **Confidence:** MEDIUM

`sheet-spec-view.tsx:62–79` dynamically imports `evaluateWorkbook` and calls it synchronously inside `useEffect`. At spec cap (8 sheets × 500 cells × 200 formulas), the topological sort blocks the main thread.

**Action:** Defer (Pass 3 §20) — `SpreadsheetSpec` callback design isn't Worker-compatible without redesign. Use `requestIdleCallback` as a lower-risk first step.

---

#### 18. `indexArtifactContent` rethrows after marking RAG status
**Class:** FIX · **Confidence:** HIGH

`artifact-indexer.ts:54–56` catch block calls `markRagStatus(documentId, false).catch(() => {})` then `throw err`. Callers use `.catch()` — the rethrow is double-handled and adds DB load during failure.

**Action:** Remove `throw err`. The `markRagStatus(false)` call is the correct non-fatal signal.

---

#### 19. `react-renderer.tsx` postMessage listener stale-closure risk
**Class:** FIX · **Confidence:** MEDIUM

`react-renderer.tsx:436–444` `useEffect` registers `window.addEventListener` with `[]` deps. If multiple `ReactRenderer` instances are mounted, all receive iframe messages. Currently fine (single-active-artifact panel) but a latent correctness issue.

**Action:** Add `e.source` check (same as #12).

---

#### 20. `to-docx.ts` table cell column-width fallback
**Class:** FIX · **Confidence:** MEDIUM

`to-docx.ts:453`: `node.columnWidths[i] ?? node.columnWidths[node.columnWidths.length - 1] ?? 0`. The fallback to last-column-width is semantically wrong for malformed input (should be proportional). Cosmetic.

---

### Additional findings (not in original hypotheses)

#### 21. `react-renderer.tsx` calls `setError` inside `useMemo`
**Class:** FIX · **Confidence:** HIGH

`react-renderer.tsx:391–409`: `const { srcdoc, unsupported } = useMemo(() => { setError(null); ... setError(...); return ... }, [content, retryCount])`. State updates inside `useMemo` are a React anti-pattern — StrictMode warnings + extra re-renders.

**Action:** Move side effects to `useEffect`.

---

#### 22. PPTX export error in `artifact-panel.tsx` silently swallowed
**Class:** FIX · **Confidence:** HIGH

`artifact-panel.tsx:172–175`: only `console.error`, no `setExportError`. Compare DOCX path which sets `exportError` (L286). User clicks download → nothing happens.

**Action:** Set `setExportError(...)` AND add a render block for non-document types (Pass 3 §9: `exportError` UI is currently inside the Document dropdown only).

---

#### 23. `update-artifact.ts` returns `updated: true` for missing artifacts
**Class:** FIX · **Confidence:** HIGH

`update-artifact.ts:68`: `findUnique({ id })` — no else/error branch when `existing === null`. Falls through to L188 `return { updated: true, persisted: true }`. The LLM gets success for an update to a non-existent artifact.

**Action:** Add early return immediately after `findUnique`:
```typescript
if (!existing) {
  return { id, updated: false, persisted: false, error: `Artifact "${id}" not found.` }
}
```

⚠️ **Pass 3 §3:** also update the `update_artifact` tool description so the LLM knows to call `create_artifact` instead.

---

#### 24. Historical Markdown download exports literal "undefined"
**Class:** FIX · **Confidence:** HIGH

`artifact-panel.tsx:255` `new Blob([displayArtifact.content], ...)`. When viewing a historical version (`L103–L108`), `displayArtifact.content` is `previousVersions[idx].content`, which is `undefined` when archive succeeded to S3-only (only set on inline fallback ≤ 32 KB).

**Action:** Disable button + tooltip when content undefined. Full S3-fetch path requires a new API endpoint (Pass 3 §10).

---

## Pass 2 — 7 additional findings

These were missed in Pass 1; surfaced by a coverage-gap sweep.

### 🔴 CRITICAL

#### NEW-1. Individual artifact deletion does NOT clean up RAG chunks
**Class:** FIX · **Confidence:** HIGH

`service.ts:576–601` deletes S3 file + Prisma row but **does not call `deleteChunksByDocumentId()`**. Compare `service.ts:271–286` (session deletion) which correctly batches `deleteChunksByDocumentId(a.id)` via `Promise.allSettled()`.

**Impact:** Deleted artifact content remains retrievable via RAG search — privacy/compliance bug.

**Action:** Add `await deleteChunksByDocumentId(artifactId).catch(...)` before the S3/Prisma delete in `deleteDashboardChatSessionArtifact`.

---

#### NEW-2. No optimistic locking — version array clobbering under concurrent updates
**Class:** FIX · **Confidence:** HIGH

`update-artifact.ts:68–176` (LLM tool) and `service.ts:430` (manual edit) both use `findUnique → update` with NO optimistic lock or `WHERE updatedAt = X`. Two concurrent updates: each reads version N, each pushes to `metadata.versions`, only one push wins, the other is silently lost. FIFO eviction can be applied twice or skipped.

**Impact:** Version history corruption under high-frequency concurrent edits (LLM + manual edit, or two LLM tool calls).

**Action:** Wrap version-archival + persistence in `prisma.$transaction` with `WHERE updatedAt = oldUpdatedAt` clause; on conflict, retry with re-read.

---

#### NEW-3. Server-side mermaid global-swap is NOT concurrency-safe
**Class:** FIX · **Confidence:** HIGH (refines Pass 1 #4)

The comment in `mermaid-to-svg.ts` claims "serialized per call via JS single-threaded event loop" — **but this is wrong for async code**. Between `for (const key of SHIM_KEYS)` (L67) and `mermaid.render(...)` (L117), there is `await import("mermaid")` (L105). Two concurrent docx exports interleave: A swaps globals → B swaps globals (overwrites A) → A's `mermaid.render` runs with B's window.

**Impact:** Cross-request data leak / wrong-document rendering under concurrent DOCX exports.

**Action:** **Per-process Promise mutex** (serialize calls):
```typescript
let renderQueue = Promise.resolve<string>("")
export function mermaidToSvg(code: string): Promise<string> {
  const next = renderQueue.then(() => doActualRender(code))
  renderQueue = next.catch(() => "")  // reset chain on error
  return next
}
```
~10 lines. Worker threads (Pass 1 #4) are overkill given the cost (~50ms spin-up per call + Next.js bundle config).

---

### 🟠 HIGH

#### NEW-4. No timeout on validators / formula evaluator
**Class:** FIX · **Confidence:** HIGH

- `validateLatex` (~200 lines manual parsing): no timeout
- `validateSlides` (~400 lines dispatch): no timeout
- `evaluateWorkbook` topological sort (`formulas.ts:145–168`): O(n²) worst case before circular-ref detection — unbounded loop risk on patological DAG

**Impact:** DoS vector via crafted artifact content.

**Action:** Wrap `validateArtifactContent` in a 5-second timeout via `Promise.race` with `AbortController`. Wrap `evaluateWorkbook` in a worst-case-iteration cap (e.g., 10× cell count) that early-exits with a `CIRCULAR` or `TIMEOUT` error.

---

#### NEW-5. Sparse test coverage
**Class:** UPGRADE · **Confidence:** HIGH

Found:
- `tests/unit/validate-artifact.test.ts` (1662 lines)
- `tests/unit/document-ast/validate.test.ts` (176 lines)
- `tests/unit/document-ast/examples.test.ts` (125 lines)

**[NOT FOUND]:**
- `evaluateWorkbook` correctness (only indirect coverage)
- `generateXlsx` round-trip
- `astToDocx` for non-example inputs
- Version archival + FIFO eviction (`update-artifact.ts:99–147`)
- Unsplash cache hit/miss/fallback
- `create_artifact → S3 → Prisma → RAG` integration
- Concurrent-update behavior

**Action:** Add tests as part of any fix that touches these surfaces.

---

### 🟡 MEDIUM

#### NEW-6. Malformed tool output silently dropped
**Class:** FIX · **Confidence:** HIGH

`chat-workspace.tsx:2173` filters: `out.id && out.title && isValidArtifactType(out.type) && out.content`. If LLM emits incomplete tool call (truncated stream, missing `id`), the artifact is silently not added — user sees "Generating..." indicator forever with no error.

No deduplication if same `artifactId` arrives twice in rapid-fire updates.

**Action:** Add error path: on filtered-out tool output, dispatch a chat-level error message ("Artifact creation failed — incomplete tool output"). Add dedup map keyed by `artifactId` with last-wins semantics.

---

#### NEW-7. `metadata` JSON column has no size cap
**Class:** UPGRADE · **Confidence:** MEDIUM

Worst case: 20 versions × 32 KB inline fallback = ~640 KB per artifact in Postgres `Json?` column. PG soft limit ~100 MB row before performance degrades. With 10,000 artifacts at worst case: ~6.4 GB total — within limit but risky.

No prune mechanism for `archiveFailed: true` entries with inline `content`.

**Action:** Add periodic background job to prune entries where `s3Key` exists AND `content` is also set (S3 succeeded, inline is redundant).

---

## Pass 3 — fix blast-radius classification

Each Pass 1 fix evaluated for backward-compat impact and migration requirements. Verbatim from the blast-radius reviewer.

### ✅ SAFE — merge today (zero migration)

Apply in this order:

1. **Fix #1** Drop `useMemo` from `newFootnoteSink`. 1-line change.
2. **Fix #2** `validation.content ?? content` in `update-artifact.ts:92`. 1-line change.
3. **Fix #6** Add `context` + canvas-mode check to `update-artifact.ts`. AI SDK already passes `context`; tool just ignores it.
4. **Fix #8** Theme-aware `MermaidPreviewBlock`. Requires authoring `getMermaidConfig` in `mermaid-theme.ts` (10-line addition) first.
5. **Fix #11** Export `resolveQueries` from `resolver.ts`; reuse in `resolve-unsplash.ts`. Eliminates uncached API calls.
6. **Fix #12** Move `setError` calls out of `useMemo` to `useEffect`. Fixes React violation.
7. **Fix #13** postMessage origin/source check. Optional chain handles iframe-not-mounted edge case.
8. **Fix #14** Full block rendering in footnote HTML section (NO schema narrowing — `to-docx.ts` already supports it).
9. **Fix #17** Implement `coverPage.logoUrl` in `to-docx.ts`. HTML preview already renders.
10. **Fix #21** Remove `throw err` from RAG indexer catch block.

### ⚠️ MODERATE — needs coordination but non-breaking

11. **Fix #3** Early return for null artifact in `update-artifact.ts`. **Plus** update tool description so LLM knows to call `create_artifact` instead. Without prompt update, LLM may just apologize.
12. **Fix #5** Delete S3 versioned keys on artifact delete. **Plus** null-safety guard for legacy artifacts (`metadata.versions` undefined). NOT one-liner.
13. **Fix #9** PPTX export error display. `setExportError(...)` alone insufficient — render block lives only in Document dropdown. Need separate error banner for non-document types.
14. **Fix #10** Guard undefined historical content. Trivial guard. "Fetch from S3 versioned key" requires new API endpoint that doesn't exist.
15. **Fix #18** `list.startAt` in DOCX. Non-trivial implementation (per-list `AbstractNumbering` `start` override).

### 🟠 RISKY — needs cross-module coordination or feature flag

16. **Fix #4** Unsplash resolution in `service.ts`. Service must return resolved content; route must pass-back; panel must use server-returned content (not `editContent`) when calling `onUpdateArtifact`. **3 files, 1 logical fix.** Stage: server-side resolution first (idempotent), wire panel after.
17. **Fix #7** Server-side mermaid concurrency. **Don't use worker_threads** — 50ms spin-up + Next.js bundling complexity. Use per-process Promise mutex (NEW-3).

### 🛑 NEEDS DATA MIGRATION — DO NOT merge as-is

18. **Fix #16** `<script>` hard error + 128 KB cap on `validateMarkdown`. **Will break** existing artifacts with `<script>` or > 128 KB on next user edit (422). Solutions:
    - Gate behind `ARTIFACT_STRICT_MARKDOWN_VALIDATION` env flag, default OFF.
    - Run DB migration: scan all `text/markdown` artifacts, log/report `<script>` occurrences and oversized content.
    - Apply 128 KB cap only to **new creates** (validator gets `isNew` context flag), not to updates of existing oversized artifacts.

19. **Fix #19** Remove `image-text` from `SLIDE_LAYOUTS`. **Will break** existing slides on next edit. Solutions:
    - Keep in allowlist but warn → error path; only hard-error for `isNew` artifacts.
    - DB migration: replace `image-text` with `content` in stored slides JSON.

### ⛔ DEFER — design mismatch

20. **Fix #20** Formula evaluator → Web Worker. `SpreadsheetSpec` callback design is not structured-clone-compatible. Worker requires spec interface redesign. For now, use `requestIdleCallback` to yield to the browser between formula chunks.

---

## Final prioritized action list

### Priority A — fix this week (high impact, low risk)

| # | Fix | Files touched | LoC est. |
|--:|---|---|--:|
| 1 | **NEW-1** RAG cleanup on individual delete | `service.ts` | 3 |
| 2 | **#1** Footnote `useMemo` bug | `document-renderer.tsx` | 1 |
| 3 | **NEW-3** Mermaid per-process Promise mutex | `mermaid-to-svg.ts` | 10 |
| 4 | **#2 + #6 + #23** `update-artifact.ts` triple bug | `update-artifact.ts` | 30 |
| 5 | **#3 + #21** S3 versioned key cleanup + RAG indexer rethrow | `service.ts`, `update-artifact.ts`, `artifact-indexer.ts` | 25 |

**Subtotal:** ~70 LoC across ~5 files. All non-breaking.

### Priority B — next sprint (still safe, slightly more work)

| # | Fix | Files touched |
|--:|---|---|
| 6 | **#11** `resolveQueries` reuse in `resolve-unsplash.ts` | `resolver.ts`, `resolve-unsplash.ts` |
| 7 | **#8** Theme-aware `MermaidPreviewBlock` | `mermaid-theme.ts`, `document-renderer.tsx` |
| 8 | **#7** Unsplash cache `upsert` | `resolver.ts` |
| 9 | **#12** `react-renderer` setError out of useMemo | `react-renderer.tsx` |
| 10 | **#13 + #19** postMessage origin check (slides + react) | `slides-renderer.tsx`, `react-renderer.tsx` |
| 11 | **#14** Full block rendering in footnote HTML | `document-renderer.tsx` |
| 12 | **#22** PPTX error display fix | `artifact-panel.tsx` |
| 13 | **#24** Historical Markdown download guard | `artifact-panel.tsx` |
| 14 | **#17** `coverPage.logoUrl` DOCX rendering | `to-docx.ts` |
| 15 | **#9** Use `finalContent` in HTML resolver | `create-artifact.ts` |
| 16 | **NEW-2** Optimistic locking for updates | `service.ts`, `update-artifact.ts`, schema |
| 17 | **NEW-4** Validator timeout + evaluator iteration cap | `_validate-artifact.ts`, `formulas.ts` |
| 18 | **NEW-6** Tool-output dedup + error surface | `chat-workspace.tsx` |

### Priority C — feature-flagged or migrated rollout

| # | Fix | Strategy |
|--:|---|---|
| 19 | **#15 + Fix #16** Markdown `<script>` hard-error | Env flag `ARTIFACT_STRICT_MARKDOWN_VALIDATION`, off by default; data migration first |
| 20 | **#16 + Fix #19** Remove `image-text` slide layout | DB migration: rename `image-text` → `content`; then remove from allowlist |
| 21 | **#4** Service-layer Unsplash resolution | Stage: server-side first, panel wiring later |

### Priority D — defer

| # | Fix | Reason |
|--:|---|---|
| 22 | **#20** Formula evaluator → Web Worker | Spec callback design is not structured-clone compatible. Use `requestIdleCallback` for now. |
| 23 | **#5** Test coverage backfill | Non-blocking. Add tests as part of any fix that touches the relevant surface. |

### Refactor backlog (no functional change)

- **`_validate-artifact.ts` 2022-line monolith** → split into `validators/{type}.ts` paralleling `prompts/artifacts/{type}.ts`.
- **Slides 17-layout duplication** between `render-html.ts` (1325 LoC) and `generate-pptx.ts` (1532 LoC) → shared `slides/layouts/{layout}.ts` with `{ renderHtml, renderPptx }` exports.
- **`artifact-panel.tsx` 939 lines** → extract sub-components (download split-button, version nav, edit mode, fullscreen).

---

## Test coverage gaps

Add tests for these surfaces (NEW-5):

- `evaluateWorkbook` formula correctness — including circular ref detection, named ranges, cross-sheet refs, error propagation.
- `generateXlsx` round-trip — write spec → read with ExcelJS → verify cells + styles + named ranges + frozen panes match.
- `astToDocx` for non-example inputs — table colspan/rowspan, footnotes with mixed block types, mermaid + chart blocks, cover page with logoUrl.
- Version archival + FIFO eviction in both `update-artifact.ts` and `service.ts` paths.
- Unsplash cache: hit, miss, API failure → fallback, race condition (two concurrent resolves of same keyword).
- Concurrent updates on same artifact (validates NEW-2 fix).
- `validateReact` directive parsing — all 7 aesthetic directions, font spec validation, env flag toggle.
- RAG indexing integration — chunks created on create, replaced on update, deleted on delete.

---

## Migration considerations

For Priority C fixes that need migration:

### Markdown `<script>` hard-error (Fix #16)

1. Add env flag `ARTIFACT_STRICT_MARKDOWN_VALIDATION` (default `"false"`).
2. Run DB query: `SELECT id, sessionId FROM Document WHERE artifactType = 'text/markdown' AND content LIKE '%<script%'` — log count + sample.
3. Either:
   - **Option A:** notify session owners; let them decide to keep or strip.
   - **Option B:** programmatic strip during a maintenance window; add a backup s3 key with original content for rollback.
4. After cleanup, flip flag to `"true"`. Validator becomes hard-error.

### Remove `image-text` slide layout (Fix #19)

1. DB query: `SELECT id, sessionId FROM Document WHERE artifactType = 'application/slides' AND content LIKE '%"image-text"%'` — count.
2. Run migration: parse JSON, replace `"layout": "image-text"` with `"layout": "content"` (renderer treats them identically anyway).
3. Remove `image-text` from `SLIDE_LAYOUTS` in `_validate-artifact.ts`.

### Service-layer Unsplash resolution (Fix #4)

1. Server-side first: add `resolveImages`/`resolveSlideImages` calls in `service.ts:updateDashboardChatSessionArtifact` after validation. Service returns resolved content.
2. Update API route to pass resolved content in 200 response.
3. Update panel `handleSave`: use server-returned content for `onUpdateArtifact`, not `editContent`.

---

## Capability gaps (upgrade backlog)

These are feature gaps, not bugs. Roughly ranked by impact-to-effort ratio:

| # | Gap | Impact | Effort |
|--:|---|---|---|
| 1 | **RantaiUI bundle for React** (shadcn-style components) | HIGH | LOW — pre-injected globals pattern already exists |
| 2 | **OMML math in Document DOCX export** | HIGH | MEDIUM — `docx` library supports OMML natively |
| 3 | **PDF export for Document and LaTeX** | HIGH | MEDIUM — `pdf-lib` or `@react-pdf/renderer`, no headless browser |
| 4 | **Chart embedding in Sheet spec** | MEDIUM | LOW — ExcelJS supports it; `ChartData` schema already cross-artifact |
| 5 | **Native PPTX charts** (vs. raster PNG) | MEDIUM | MEDIUM — replace `chartToSvg → svgToBase64Png` with PptxGenJS native chart shapes |
| 6 | **Code execution for TS/JS** | MEDIUM | MEDIUM — Babel + sandboxed iframe pattern transferable from React renderer |
| 7 | **Citation / bibliography in Document AST** | LOW | MEDIUM — new node type + DOCX rendering + bibliography pseudo-block |

---

## Out-of-scope items

Not addressed by this audit, but worth a future pass:

- **Performance benchmarks** — no measurements of validate / render / export latency. Worth running with realistic content sizes.
- **Accessibility** — keyboard navigation in panel, screen reader labels, focus management on tab switch / fullscreen toggle.
- **Internationalization** — error messages and panel chrome are English-only.
- **Streaming Document AST** — currently `validateDocument` requires complete JSON. Streaming AST construction during LLM generation could improve TTFB.
- **Artifact sharing across sessions** — no copy/clone-to-other-session feature; would require session-ownership boundary changes.
- **Read-only artifact mode** — no current support. Useful for archived/published artifacts.
- **Audit logging** — version archival doesn't log actor (LLM vs user) — only timestamp.

---

## Methodology notes

This audit relied on three independent agent passes against the actual source code at HEAD `14dabfd` (no carry-over from prior doc revisions). Each finding cites a `file:line` location verified during the audit. Where a hypothesis was wrong, the contradicting evidence is captured as a ✓ in the original review (omitted from this consolidated report — only confirmed issues kept).

False-positive risk:
- Pass 1 was hypothesis-driven; finding rates depend on the hypothesis quality.
- Pass 2's coverage sweep is broader but shallower per topic.
- Pass 3 evaluated the proposed fixes only — it did not re-audit the underlying issues.

For the deepest verification, see the source files cited under each finding.
