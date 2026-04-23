# Phase 9 — Pre-rebuild revert

**Date:** 2026-04-23
**Trigger:** User decision after reviewing Anthropic Claude's `docx` skill (SKILL.md). Markdown-walker pipeline (Phase 1-8) is fundamentally different from Anthropic's LLM-authored-JS pipeline. Migration would create dual-path maintenance burden.

**Decision:** Revert text/document-specific code from Phase 1-8 to clean state, then build Phase 9 fresh from Anthropic playbook (separate brief).

**Acceptable cost:** existing text/document artifacts (≤single-digit count, all test artifacts) will not render until Phase 9 ships. Users re-create via LLM after Phase 9 deploy.

---

## What this revert deletes

### Source code
- [src/lib/document/generate-docx.ts](../../src/lib/document/generate-docx.ts) — entire file (~700 LOC, Phase 4 markdown→DOCX walker + Phase 8A polish)
- Document-specific examples in [src/lib/prompts/artifacts/document.ts](../../src/lib/prompts/artifacts/document.ts) — empty `examples` array (3 markdown fixtures from Phase 8)

### Source code (stub-replaced)
- [src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx) — replace with placeholder showing "text/document pipeline being rebuilt for Phase 9"
- `validateDocument()` in [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) — strip to permissive no-op (returns ok always)
- `handleDocumentDownload("docx")` branch in [artifact-panel.tsx](../../src/features/conversations/components/chat/artifacts/artifact-panel.tsx) — show "Phase 9 in progress" error

### Documentation
- §8b Document section in [docs/artifact-plans/artifacts-capabilities.md](artifacts-capabilities.md) — replace with Phase 9 placeholder
- text/document subsection in [docs/artifact-plans/artifacts-deepscan.md](artifacts-deepscan.md) — replace with Phase 9 placeholder
- 3 of 4 Phase 8 describe blocks in [tests/unit/validate-artifact.test.ts](../../tests/unit/validate-artifact.test.ts):
  - `validateArtifactContent — text/document` (validator tests)
  - `generateDocx — text/document` (DOCX generation tests)
  - `frontmatter parsing (gray-matter)` (frontmatter parsing tests — markdown-specific)
  - **KEEP** `ARTIFACT_REGISTRY` (Phase 7 work, not text/document specific)

### Plan documents
- [phase-9-brief.md](phase-9-brief.md) — markdown→migration version, no longer applicable
- [phase-9-claude-skill-analysis.md](phase-9-claude-skill-analysis.md) — analysis is preserved value but specific recommendations are superseded; archive

---

## What this revert KEEPS

These survive because they're either Phase 7 (registry, applies to all artifact types) or general infrastructure.

### Source code
- [src/features/conversations/components/chat/artifacts/registry.ts](../../src/features/conversations/components/chat/artifacts/registry.ts) — Phase 7, all 12 artifact types including text/document entry
- [src/features/conversations/components/chat/artifacts/types.ts](../../src/features/conversations/components/chat/artifacts/types.ts) — Phase 7 re-export shim
- [_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) `Record<ArtifactType, Validator>` dispatch table — Phase 7
- [src/lib/tools/builtin/create-artifact.ts](../../src/lib/tools/builtin/create-artifact.ts) — Phase 7 Zod enum derived from ARTIFACT_TYPES
- [src/lib/prompts/artifacts/index.ts](../../src/lib/prompts/artifacts/index.ts) — Phase 7 satisfies clause
- [src/features/conversations/components/chat/artifacts/artifact-renderer.tsx](../../src/features/conversations/components/chat/artifacts/artifact-renderer.tsx) — text/document switch case unchanged (still routes to DocumentRenderer, which is now a stub)
- [src/features/conversations/components/chat/artifacts/artifact-panel.tsx](../../src/features/conversations/components/chat/artifacts/artifact-panel.tsx) — split-button structure (Phase 6) + isTextDocument tab hide logic (Phase 2.5 + 6) — Phase 9 reuses both
- [src/features/conversations/components/chat/artifacts/artifact-indicator.tsx](../../src/features/conversations/components/chat/artifacts/artifact-indicator.tsx) — Phase 7 import migration
- [src/features/conversations/components/chat/chat-workspace.tsx](../../src/features/conversations/components/chat/chat-workspace.tsx) — Phase 7 import migration + getArtifactRegistryEntry usage
- [src/features/conversations/components/chat/chat-input-toolbar.tsx](../../src/features/conversations/components/chat/chat-input-toolbar.tsx) — Phase 7 import migration
- [src/lib/slides/svg-to-png.ts](../../src/lib/slides/svg-to-png.ts) — `mermaidToSvg` helper added in Phase 8A (Phase 9 will reuse for client pre-render)
- [src/lib/s3/index.ts](../../src/lib/s3/index.ts) — Phase 7 `getArtifactExtension` via registry
- [src/lib/prompts/artifacts/document.ts](../../src/lib/prompts/artifacts/document.ts) — keep file + rules content, only empty `examples` array (rules will be replaced wholesale in Phase 9)
- [src/lib/unsplash/resolver.ts](../../src/lib/unsplash/resolver.ts) — Phase 3 markdown image resolver. Phase 9 may or may not reuse depending on architecture; safe to keep.

### Test infrastructure
- [tests/unit/validate-artifact.test.ts](../../tests/unit/validate-artifact.test.ts) — file stays, only 3 of 4 Phase 8 describe blocks removed
- [tests/setup-icons-stub.ts](../../tests/setup-icons-stub.ts) — Phase 8 vitest icon mock fix
- [vitest.config.ts](../../vitest.config.ts) — Phase 8 setupFiles addition

### Documentation
- [README.md](README.md) — keep file + structure; mark text/document architecture as "rearchitected in Phase 9"; collapse Phase 1-8 history
- [artifacts-capabilities.md](artifacts-capabilities.md) — keep file + matrix structure; only §8b Document section removed
- [artifacts-deepscan.md](artifacts-deepscan.md) — keep file + structure; only text/document special-pipeline subsection removed
- [architecture-reference.md](architecture-reference.md) — pre-implementation audit, keep as historical reference

### Dependencies
- `docx` npm package stays installed (Phase 9 needs it both client + server)
- `docx-preview` stays (Phase 9 reuses for blob rendering)
- `gray-matter` stays (might be reused if Phase 9 has frontmatter convention; if not, easy to remove later)
- `remark-parse`, `remark-gfm`, `remark-math` — only used by deleted generate-docx.ts; safe to leave installed (small footprint)
- `mermaid` stays (used elsewhere — Streamdown, slides export)

---

## Effort estimate

- Revert execution: 1-2 hours (this work)
- Phase 9 fresh build (separate brief): 4-5 days

---

## Acceptance criteria for revert

- [x] All listed deletions complete
- [x] Build succeeds
- [x] Test suite passes (with 3 describe blocks removed, ~135 tests remaining)
- [x] No TypeScript errors in scope
- [x] Other artifact types (text/markdown, application/code, etc.) unaffected
- [x] Opening text/document artifact shows graceful "Phase 9 in progress" placeholder (not crash)

---

## Rollback of the revert

If the revert turns out wrong, recoverable via git:
```bash
git stash pop  # if stashed
# or
git checkout HEAD -- src/lib/document/generate-docx.ts \
                     src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx \
                     src/lib/prompts/artifacts/document.ts \
                     src/lib/tools/builtin/_validate-artifact.ts \
                     src/features/conversations/components/chat/artifacts/artifact-panel.tsx \
                     docs/artifact-plans/artifacts-capabilities.md \
                     docs/artifact-plans/artifacts-deepscan.md \
                     tests/unit/validate-artifact.test.ts
```

(assuming user hasn't committed the revert yet)
