# Cleanup audit — pre-fresh-start dead code

**Date:** 2026-04-23
**Goal:** Identify what was added/modified but is now actually dead (zero consumers) so it can be removed before Phase 9 fresh start.

---

## Tier 1: Truly dead — safe to remove (will be executed)

### 1. `html2canvas-pro` npm package

- **Added at:** Phase 5 hotfix
- **Used by:** previously `generate-docx.ts` (deleted) for KaTeX rasterization
- **Current usage:** **ZERO** — `rg "html2canvas" src/` returns nothing
- **Action:** `bun remove html2canvas-pro`

### 2. `docx` npm package

- **Added at:** Phase 4
- **Used by:** previously `generate-docx.ts` (deleted)
- **Current usage:** **ZERO**
- **Action:** `bun remove docx`
- **Note:** Phase 9 will re-install when needed; saves ~300KB in node_modules right now

### 3. `docx-preview` npm package

- **Added at:** Phase 2.5
- **Used by:** previously `DocumentRenderer` markdown version (deleted; current is stub)
- **Current usage:** **ZERO**
- **Action:** `bun remove docx-preview`

### 4. docx-preview CSS overrides in [globals.css](../../src/app/globals.css#L432-L490)

- **Added at:** Phase 2.5
- **Used by:** previously the `.docx-preview-rendered` selectors targeted docx-preview output
- **Current usage:** ZERO — DocumentRenderer is now a placeholder card with no docx-preview involvement
- **Action:** Remove the entire docx-preview CSS section (~60 lines)

### 5. `mermaidToSvg` helper in [svg-to-png.ts](../../src/lib/slides/svg-to-png.ts#L122-L141)

- **Added at:** Phase 8A
- **Why added:** to be reused by both `mermaidToBase64Png` and (future) `generate-docx.ts` for tight viewBox sizing
- **Current usage:** only as internal sub-function of `mermaidToBase64Png` (which is used by `generate-pptx.ts`)
- **Action:** Inline the helper logic back into `mermaidToBase64Png` (revert Phase 8A extraction). Net change: -10 lines.
- **Note:** Phase 9 client pre-render can re-extract if needed

### 6. `resolveMarkdownImages` chain (Phase 3)

- **Added at:** Phase 3
- **Files:** [src/lib/unsplash/resolver.ts](../../src/lib/unsplash/resolver.ts) (function definition), [src/lib/unsplash/index.ts](../../src/lib/unsplash/index.ts) (re-export), [create-artifact.ts](../../src/lib/tools/builtin/create-artifact.ts) (dispatch), [update-artifact.ts](../../src/lib/tools/builtin/update-artifact.ts) (dispatch)
- **Why added:** resolve `![alt](unsplash:keyword)` markdown image syntax for text/document content
- **Current usage:** Dispatch still fires for text/document, but DocumentRenderer is a stub — resolved URLs are never displayed. Effectively dead at the rendering surface.
- **Action:** Remove the function + re-export + 2 dispatch sites. Phase 9 will decide if/how to handle images in new content format.

---

## Tier 2: Structural decision — needs your call

### Remove `text/document` type entry entirely from registry?

If you want to reset to pre-Phase-1 state (text/document type not registered at all), additional cleanup:

- Delete [`document.ts`](../../src/lib/prompts/artifacts/document.ts) (text/document prompt rules)
- Delete [`document-renderer.tsx`](../../src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx) (stub placeholder)
- Remove `documentArtifact` import + entry from [`prompts/artifacts/index.ts`](../../src/lib/prompts/artifacts/index.ts) `ALL_ARTIFACTS`
- Remove `"text/document"` entry from [`registry.ts`](../../src/features/conversations/components/chat/artifacts/registry.ts) `ARTIFACT_REGISTRY`
- Remove `case "text/document"` from [`artifact-renderer.tsx`](../../src/features/conversations/components/chat/artifacts/artifact-renderer.tsx) switch
- Clean `isTextDocument` flag + branches from [`artifact-panel.tsx`](../../src/features/conversations/components/chat/artifacts/artifact-panel.tsx) (lose split-button, lose tab hide, lose docx download stub)
- Auto-removed: chat-input-toolbar.tsx ARTIFACT_TYPES (auto-derived from registry), Zod enum in create-artifact.ts (auto-derived)
- Auto-removed: text/document entry in `_validate-artifact.ts` dispatch table

**Effect:** clean slate — the type doesn't exist in the system, no UI affordances, no validator branch, no prompt rules. Phase 9 starts by re-registering text/document.

**Trade-off:**
- ✓ Cleanest possible reset (~100-150 LOC dropped)
- ✓ No "stub showing rebuild" placeholder confusing users in the meantime
- ✗ Phase 9 needs to re-add the type registration explicitly (small task)
- ✗ If Phase 9 plans change, harder to "just rebuild text/document" because all wiring removed

### Keep `text/document` registered as stub?

Status quo of current state — type exists, opens to placeholder card, split-button shows but DOCX errors. UI affordances stay.

**Trade-off:**
- ✓ Phase 9 just rewrites the stub + handler
- ✓ Less code churn now
- ✗ Stub placeholder visible to users
- ✗ Some dead branches in artifact-panel.tsx that aren't actively useful

---

## Recommendation

**Execute Tier 1 now** (truly dead deps + helpers + Phase 3 chain). All confirmed zero-consumer with grep. Effort: ~10 min.

**Ask user for Tier 2 decision** — depends on whether the user prefers a stub-with-affordances or a clean unregistered state during the rebuild interim.

Default kalau tidak konfirm Tier 2: **keep text/document registered as stub** (status quo). Bisa di-reset nanti kalau Phase 9 decide ganti type id atau approach.
