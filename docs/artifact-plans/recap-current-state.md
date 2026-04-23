# Recap — current state of text/document rollout

**Date:** 2026-04-23
**Status:** Phase 1-8 markdown-walker pipeline reverted; Phase 9 (LLM-authored JS pipeline) brief TBD.

---

## File-file BARU (untracked di git)

### Source code
| File | Asal | Fungsi sekarang |
|---|---|---|
| [src/features/conversations/components/chat/artifacts/registry.ts](../../src/features/conversations/components/chat/artifacts/registry.ts) | Phase 7 | Single source of truth untuk 12 artifact type metadata (icon, label, color, extension, codeLanguage, hasCodeTab) |
| [src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx) | Phase 2 → 2.5 → revert | Saat ini = placeholder card "Document preview is being rebuilt" |
| [src/lib/prompts/artifacts/document.ts](../../src/lib/prompts/artifacts/document.ts) | Phase 1 + 2 + 8 | Prompt rules text/document (markdown convention). Examples array kosong setelah revert. |
| [tests/setup-icons-stub.ts](../../tests/setup-icons-stub.ts) | Phase 8 | Vitest mock untuk `@/lib/icons` agar test yang import registry tidak fail karena lineicons package issue |

### Documentation (docs/artifact-plans/)
| File | Status |
|---|---|
| [README.md](README.md) | Roadmap dengan status semua phase, change log, architectural decisions |
| [architecture-reference.md](architecture-reference.md) | Renamed dari `full-recon-report.md` — pre-implementation audit (foundation for original Phase 1-8 decisions) |
| [artifacts-capabilities.md](artifacts-capabilities.md) | Capability matrix untuk semua artifact types. §8b Document = Phase 9 placeholder |
| [artifacts-deepscan.md](artifacts-deepscan.md) | Architecture deep-dive. text/document subsection = Phase 9 placeholder |
| [phase-8-brief.md](phase-8-brief.md) | Phase 8 brief (audit trail) |
| [phase-8-report.md](phase-8-report.md) | Phase 8 execution report (audit trail) |
| [phase-9-revert.md](phase-9-revert.md) | Pre-Phase-9 revert log: apa yang dihapus, di-stub, di-keep |
| [sheet-vs-claude-xlsx-comparison.md](sheet-vs-claude-xlsx-comparison.md) | User-added externally (not from this rollout) |

---

## File-file BERUBAH (modified di git)

### Source code

| File | Asal | Perubahan |
|---|---|---|
| [src/features/conversations/components/chat/artifacts/types.ts](../../src/features/conversations/components/chat/artifacts/types.ts) | Phase 7 | `ArtifactType` + `VALID_ARTIFACT_TYPES` re-export dari `./registry` |
| [src/features/conversations/components/chat/artifacts/artifact-renderer.tsx](../../src/features/conversations/components/chat/artifacts/artifact-renderer.tsx) | Phase 1 + 2 | Tambah `case "text/document"` → DocumentRenderer (sekarang stub) |
| [src/features/conversations/components/chat/artifacts/artifact-panel.tsx](../../src/features/conversations/components/chat/artifacts/artifact-panel.tsx) | Phase 6 + revert | Split-button download UI (MD + DOCX dropdown), tab bar conditional hide untuk text/document, Phase 7 short labels. DOCX handler stub setelah revert |
| [src/features/conversations/components/chat/artifacts/artifact-indicator.tsx](../../src/features/conversations/components/chat/artifacts/artifact-indicator.tsx) | Phase 7 | Import `TYPE_ICONS/TYPE_LABELS/TYPE_COLORS` dari `./registry` (sebelumnya dari `./constants`) |
| [src/features/conversations/components/chat/chat-input-toolbar.tsx](../../src/features/conversations/components/chat/chat-input-toolbar.tsx) | Phase 1 + 7 | Tambah text/document ke ARTIFACT_TYPES; Phase 7 import dari `./registry` |
| [src/features/conversations/components/chat/chat-workspace.tsx](../../src/features/conversations/components/chat/chat-workspace.tsx) | Phase 7 | Import dari `./registry`, `getArtifactRegistryEntry` untuk extension lookup |
| [src/lib/prompts/artifacts/index.ts](../../src/lib/prompts/artifacts/index.ts) | Phase 1 + 7 | Tambah `documentArtifact` ke `ALL_ARTIFACTS`, Phase 7 `satisfies` clause |
| [src/lib/tools/builtin/create-artifact.ts](../../src/lib/tools/builtin/create-artifact.ts) | Phase 1 + 3 + 7 | Phase 1 tambah text/document ke type union; Phase 3 dispatch resolveMarkdownImages untuk text/document; Phase 7 Zod enum derive dari registry |
| [src/lib/tools/builtin/update-artifact.ts](../../src/lib/tools/builtin/update-artifact.ts) | Phase 3 | Dispatch resolveMarkdownImages untuk text/document update |
| [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) | Phase 1 + 2 + 7 + revert | Phase 7 dispatch table; validateDocument sekarang permissive no-op stub |
| [src/lib/s3/index.ts](../../src/lib/s3/index.ts) | Phase 1 + 7 | Phase 1 tambah text/document ke extension map; Phase 7 derive dari registry via `getArtifactExtension` |
| [src/lib/slides/svg-to-png.ts](../../src/lib/slides/svg-to-png.ts) | Phase 8A | Tambah `mermaidToSvg` helper (Phase 9 akan reuse) |
| [src/lib/unsplash/resolver.ts](../../src/lib/unsplash/resolver.ts) | Phase 3 | Tambah `resolveMarkdownImages()` untuk markdown image syntax |
| [src/lib/unsplash/index.ts](../../src/lib/unsplash/index.ts) | Phase 3 | Re-export `resolveMarkdownImages` |
| [src/app/globals.css](../../src/app/globals.css) | Phase 2.5 | Append docx-preview CSS overrides |
| [tests/unit/validate-artifact.test.ts](../../tests/unit/validate-artifact.test.ts) | Phase 8 + revert | Phase 8 add 4 describe blocks (3 doc-related + ARTIFACT_REGISTRY); revert remove 3 doc-related (validator, generateDocx, frontmatter). ARTIFACT_REGISTRY tetap |
| [vitest.config.ts](../../vitest.config.ts) | Phase 8 | Tambah `setupFiles: ["./tests/setup-icons-stub.ts"]` |
| [package.json](../../package.json) | Phase 4-8A | Add deps: `docx`, `docx-preview`, `html2canvas-pro`, `gray-matter` (sudah ada), remove `jspdf` (di Phase 2.5) |

---

## File-file DIHAPUS

### Source code
| File | Hilang sejak | Alasan |
|---|---|---|
| `src/features/conversations/components/chat/artifacts/constants.ts` | Phase 8A | Shim re-export dari registry — semua 3 consumers di-migrate ke import langsung dari `./registry` |
| `src/lib/document/generate-docx.ts` | Phase 9 revert | Markdown→DOCX walker (Phase 4 + 8A polish), digantikan Phase 9 LLM-authored JS pipeline |

Directory `src/lib/document/` juga dihapus karena empty after `generate-docx.ts` removed.

### Documentation (Phase 8 cleanup, archived)
Semua phase brief/report/investigation/diagnostic dari Phase 1-7 + 8A dihapus saat Phase 8 plan folder cleanup. Yang tersisa hanya: README, architecture-reference, capabilities, deepscan, plus phase-8 audit trail.

Plus pre-existing docs deletions yang sudah ada sebelum rollout dimulai (terlihat di git status: MERMAID-RENDERER-UPGRADE.md, SLIDES-V2-PLAN.md, dll — tidak terkait rollout).

---

## Yang BELUM JADI tapi infra siap

- **`docx` library** — installed di package.json. Sebelumnya dipakai client-side oleh deleted `generate-docx.ts`. Phase 9 akan reuse (LLM-authored JS code juga pakai library yang sama).
- **`docx-preview` library** — installed. Akan reuse di Phase 9 untuk render hasil DOCX di browser.
- **`gray-matter`** — frontmatter parser, masih installed kalau Phase 9 mau pakai frontmatter convention.
- **`mermaidToSvg` helper** ([svg-to-png.ts](../../src/lib/slides/svg-to-png.ts)) — Phase 8A added, Phase 9 reuse untuk client pre-render mermaid blocks.
- **Phase 7 type registry** — kerja general, applies ke 12 artifact types. text/document entry tetap registered. Phase 9 inherit semua benefit (compile-time exhaustiveness, derived TYPE_ICONS/LABELS/COLORS).
- **Phase 6 split-button UI** — DropdownMenu structure di artifact-panel tetap. Phase 9 tinggal isi handler "docx" branch dengan logic baru.
- **Phase 8 vitest icon stub** — test infra, applies ke semua test yang transitively import registry.
- **Phase 8 plan folder cleanup** — sudah clean state, future Phase 9 brief tinggal append.

---

## Total tally

- **3 file source baru:** registry.ts, document-renderer.tsx (stub), document.ts (prompt rules + empty examples)
- **17 file source dimodifikasi:** types, panel, renderer, indicator, toolbar, workspace, prompts/index, create-artifact, update-artifact, validator, s3, svg-to-png, unsplash resolver+index, globals.css, validate-artifact.test, vitest.config
- **2 file source dihapus:** constants.ts, generate-docx.ts (+ empty directory)
- **8 file docs aktif** di docs/artifact-plans/: README, architecture-reference, capabilities, deepscan, phase-8-brief, phase-8-report, phase-9-revert, sheet-vs-claude-xlsx-comparison
- **1 file test infra baru:** tests/setup-icons-stub.ts

---

## Verification status

- ✓ Typecheck clean (zero new errors di artifact-related files; 1 pre-existing s3 mimeType warning unchanged)
- ✓ Build: `bunx next build` ✓ Compiled successfully in ~50s
- ✓ Tests: 141 pass (turun dari 161 — 20 doc-specific tests removed di revert)
- ✓ No orphan imports of deleted modules
- ✓ Comments di artifact files tidak lagi reference Phase numbers (kecuali rag/memory/MASTRA yang beda domain dan animation state machine di chat-home.tsx)
- ✓ text/document tetap registered di registry — opening artifact tampilkan placeholder card, bukan crash

---

## Next decision point

Phase 9 brief belum ada. Path yang sudah didiskusikan:
- **Phase 9 = LLM-authored JS code via Piston** mirror Anthropic Claude's `docx` skill
- Markdown source diganti JS code yang langsung pakai `docx` library
- Native OMML math, full creative styling control
- Effort estimate: 4-5 hari (revert sudah dilakukan; tidak perlu migration script lagi)

Brief Phase 9 belum ditulis — menunggu green light Anda untuk gas writing.
