# Artifact Document System — Phased Upgrade

This folder tracks the multi-phase rollout of the new `text/document` artifact type alongside the existing `text/markdown` type. The goal: elevate `text/document` into a first-class deliverable format with YAML frontmatter, A4 paper rendering, chart support, Unsplash images, and client-side DOCX/PDF export — while keeping `text/markdown` lightweight for READMEs and dev docs.

All architectural decisions below trace back to findings in [`architecture-reference.md`](architecture-reference.md). Start there if you want source citations.

---

## Architectural Decisions

Five locked-in decisions for Phases 2–8. Rationale + recon cite for each.

1. **All exports are client-side.** Mirrors the existing slides PPTX pattern. No headless browser anywhere in repo — a deliberate architectural choice (recon §D7, §K1). Document DOCX and PDF both generate in the browser via dynamic imports.

2. **Mermaid-to-image pipeline reuse.** Phase 4 DOCX export reuses `mermaidToBase64Png()` from [`src/lib/slides/svg-to-png.ts`](../../src/lib/slides/svg-to-png.ts) (recon §D5b). No reinvention, single source of truth for Mermaid rasterization.

3. **Chart support dual-mode.** Document supports BOTH ` ```mermaid ` fenced blocks (for flowcharts, pie, xychart, sankey, timeline, quadrant) AND ` ```chart ` fenced blocks with JSON matching the slides `ChartData` schema (recon §D3, [`src/lib/slides/chart-to-svg.ts`](../../src/lib/slides/chart-to-svg.ts)). Chart JSON renders via existing `chartToSvg()` utility — D3 infrastructure already present.

4. **Frontmatter via gray-matter.** `gray-matter@4.0.3` already installed per recon §E2. Zero new dependencies for Phase 2.

5. **Math rendering.** Preview via existing KaTeX wiring in Streamdown (recon §J). DOCX export rasterizes KaTeX to PNG client-side. PDF export auto-handles via DOM snapshot in Phase 5.

---

## Roadmap

> **🟡 ARSITEKTUR DI-REBUILD (2026-04-23):** Phase 1-8 menggunakan markdown-walker pipeline (LLM tulis markdown → walker mekanis emit DOCX seragam). Setelah review Anthropic Claude's `docx` skill, decision: pipeline di-rebuild di Phase 9 menggunakan LLM-authored JS code di sandbox (full creative control + native math). Pre-rebuild revert sudah dilakukan — text/document sementara non-functional (placeholder ditampilkan). Detail revert: [phase-9-revert.md](phase-9-revert.md).

| Phase | Scope | New deps | Status |
|---|---|---|---|
| 1 | Type skeleton + rename markdown label | — | 🔴 reverted (text/document type entry retained via Phase 7) |
| 2 | DocumentRenderer (markdown-walker preview) | — | 🔴 reverted (replaced by Phase 9 pipeline) |
| 2.5 | DocumentRenderer rewritten on docx-preview | `docx-preview` | 🟡 partially retained (`docx-preview` lib reused di Phase 9) |
| 3 | Unsplash resolution for markdown `![alt](unsplash:kw)` | — | 🟡 retained (resolver standalone — Phase 9 may or may not reuse) |
| 4 | Client-side DOCX export (markdown→docx walker) | `docx`, `html2canvas-pro` | 🔴 reverted (replaced by Phase 9 LLM-authored JS pipeline) |
| 5 | Client-side PDF export | `jspdf` | 🔴 superseded by 2.5 (already removed) |
| 6 | Download UI split-button | — | 🟡 partially retained (UI structure stays; download handler stub until Phase 9) |
| 7 | Type registry consolidation | — | ✅ complete (general infra, applies to all 12 artifact types) |
| 8 | Polish, examples, tests, plan folder cleanup | — | 🟡 partially retained (test infra + folder cleanup retained; doc-specific examples + tests reverted) |
| 8A | Visual polish + tech debt for markdown walker | — | 🔴 reverted (walker file deleted) |
| 9 | LLM-authored JS code pipeline mirroring Anthropic skill | TBD (Piston Node + custom image) | 🟡 next — brief TBD |

Status legend: ✅ complete · 🟡 partial / next · 🔴 reverted

**Phase 1-8 was the markdown-walker era (2026-04-21 → 2026-04-22).** Insight that prompted revert: Anthropic Claude.ai's `docx` skill reveals their pipeline = LLM authors JS code directly using `docx` library (same package as Phase 4) executed in code interpreter sandbox. This delivers per-document creative styling + native OMML math. Markdown-walker pipeline is fundamentally less expressive — LLM only chooses content, not styling/layout/format. Phase 9 rebuilds around the Anthropic playbook.

---

## Per-Phase Detail

### Phase 2 — DocumentRenderer

- **Goal:** Replace the Phase 1 stub (which forwards to `StreamdownContent`) with a real `DocumentRenderer` that displays `text/document` as an A4-style paper with a frontmatter-driven cover header, richly-styled Streamdown body, and a custom ` ```chart ` fenced-block handler.
- **Scope in:**
  - New `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx` with gray-matter frontmatter split, cover header layout, paper surface chrome, Streamdown body, chart JSON fence handler, inline error boxes.
  - Chart-JSON validation added to `validateDocument()` in `_validate-artifact.ts`.
  - Prompt rules update in `src/lib/prompts/artifacts/document.ts` teaching the LLM about both ` ```mermaid ` and ` ```chart ` fences.
  - Renderer switch in `artifact-renderer.tsx` routes `text/document` to the new component.
- **Scope out:** Unsplash resolution for markdown images (Phase 3), export (Phases 4–5), download UI changes (Phase 6), prompt `examples` array population (Phase 8).
- **Files touched:** ~4 in `src/` plus the document prompt rules file:
  - new `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`
  - [`src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`](../../src/features/conversations/components/chat/artifacts/artifact-renderer.tsx) (swap stub → DocumentRenderer)
  - [`src/lib/tools/builtin/_validate-artifact.ts`](../../src/lib/tools/builtin/_validate-artifact.ts) (extend `validateDocument()` with chart JSON checks)
  - [`src/lib/prompts/artifacts/document.ts`](../../src/lib/prompts/artifacts/document.ts) (add "Visual Elements: Diagrams and Charts" subsection + anti-patterns)
- **Reused from existing code:**
  - Streamdown wiring + KaTeX + Mermaid plugin setup — pattern from [`streamdown-content.tsx`](../../src/features/conversations/components/chat/streamdown-content.tsx) (recon §C2)
  - `chartToSvg(data, w, h)` from [`src/lib/slides/chart-to-svg.ts`](../../src/lib/slides/chart-to-svg.ts) (recon §D3)
  - `ChartData` type from [`src/lib/slides/types.ts`](../../src/lib/slides/types.ts) (recon §D2)
  - `gray-matter` package, already installed (recon §E2)
  - KaTeX/remark-math wiring reused verbatim from streamdown-content.tsx (recon §J)
- **New dependencies:** none.
- **Exit criteria:**
  - Text/document artifact renders as paper-style surface with cover header derived from frontmatter.
  - Mermaid fenced blocks and chart JSON fenced blocks render inline as SVG.
  - Malformed chart JSON produces an inline red error box (not a crash).
  - Chart JSON schema violations rejected by validator on manual-edit save.
  - Existing text/markdown artifacts unchanged (regression check).
  - `bunx tsc --noEmit` has zero new errors in touched files.
  - `bunx next build` succeeds.
- **Risk:** Streamdown's custom fence API may not expose per-language override — fallback approach (regex preprocess + `<div>` placeholder hydration) was the documented escape hatch.

### Phase 3 — Unsplash for markdown

- **Goal:** Resolve `![alt](unsplash:keyword)` in `text/document` (and, naturally, `text/markdown`) content server-side at create/update time, same 30-day Prisma cache as HTML/slides.
- **Scope in:** New regex for markdown image syntax; new `resolveMarkdownImages()` or extend `resolveHtmlImages()`; dispatch in both create-artifact.ts and update-artifact.ts for `text/document`.
- **Scope out:** Runtime resolution, image optimization, caching policy changes.
- **Files touched:** [`src/lib/unsplash/resolver.ts`](../../src/lib/unsplash/resolver.ts), [`src/lib/tools/builtin/create-artifact.ts`](../../src/lib/tools/builtin/create-artifact.ts), [`src/lib/tools/builtin/update-artifact.ts`](../../src/lib/tools/builtin/update-artifact.ts).
- **Reused from existing code:** Entire Unsplash resolver + cache (recon §F, [`src/lib/unsplash/resolver.ts`](../../src/lib/unsplash/resolver.ts)); `searchPhoto()` client unchanged.
- **New dependencies:** none.
- **Exit criteria:** `unsplash:keyword` in markdown image syntax resolves to real URL on artifact create + update; cache hit observed on second use of same keyword; fallback to `placehold.co` works when API unreachable.

### Phase 4 — Client-side DOCX export

- **Goal:** Generate a `.docx` blob entirely in the browser from a `text/document` artifact's markdown + frontmatter + rendered visual blocks.
- **Scope in:** New `src/lib/document/generate-docx.ts`; walk markdown AST via remark-parse → emit docx nodes (Paragraph, Heading, Table, ImageRun); mermaid/chart/KaTeX blocks rasterized to PNG and embedded as ImageRun.
- **Scope out:** Server-side export, native OMML math (client raster is sufficient), download UI (Phase 6 finalizes).
- **Files touched:** new `src/lib/document/generate-docx.ts`; Phase 6 later wires the download button.
- **Reused from existing code:** `mermaidToBase64Png()` from [`src/lib/slides/svg-to-png.ts`](../../src/lib/slides/svg-to-png.ts) (recon §D5b); `chartToSvg()` + `svgToBase64Png()` (recon §D3); gray-matter for frontmatter → cover page.
- **New dependencies:** `docx` (~300 KB gzipped, pure JS, runs in browser).
- **Strategy:** remark-parse the body into a Markdown AST; map node-by-node into docx document objects. KaTeX math: render via `katex.renderToString()` → html2canvas → PNG → `ImageRun`. Mermaid + chart fenced blocks: reuse existing rasterization → `ImageRun`. Frontmatter → cover page paragraphs.
- **Exit criteria:** `generateDocx(artifact)` returns a `Blob` that opens cleanly in Word/LibreOffice; visuals appear as embedded images; headings/tables/lists preserve structure.

### Phase 5 — Client-side PDF export

- **Goal:** Generate a `.pdf` blob entirely in the browser by snapshotting the already-rendered DocumentRenderer DOM (what the user already sees in the preview panel).
- **Scope in:** New `src/lib/document/generate-pdf.ts`; DOM snapshot approach; A4 page sizing; multi-page pagination.
- **Scope out:** Server-side rendering, custom print stylesheet beyond what DocumentRenderer already applies.
- **Files touched:** new `src/lib/document/generate-pdf.ts`; artifact-panel download handler later.
- **Reused from existing code:** DocumentRenderer's rendered DOM (mermaid, charts, KaTeX already present); paper A4 styling already applied by Phase 2.
- **New dependencies:** `html2pdf.js` (~500 KB, bundles html2canvas + jspdf). Alternative candidates: `jspdf` + `html2canvas` direct, or `@react-pdf/renderer` (heavier, different model).
- **Strategy:** Pass DocumentRenderer root ref → html2pdf → single or paged PDF. Charts/Mermaid/KaTeX already rendered as inline SVG or KaTeX HTML, no re-rasterization.
- **Exit criteria:** PDF output visually matches the preview; fonts preserved or substituted gracefully; multi-page long documents paginate correctly.

### Phase 6 — Download UI

- **Goal:** For `text/document` only, replace the single Download button with a split-button offering `.md`, `.docx`, `.pdf`. Other artifact types unchanged.
- **Scope in:** Split-button UI in artifact-panel; dynamic import of DOCX/PDF generators from Phases 4 and 5; filename hygiene per format.
- **Scope out:** Progress indicators beyond a simple spinner; batch download; server-side.
- **Files touched:** [`src/features/conversations/components/chat/artifacts/artifact-panel.tsx`](../../src/features/conversations/components/chat/artifacts/artifact-panel.tsx) — split the single Download button into a dropdown/split-button for text/document only.
- **Reused from existing code:** existing download-button pattern + Blob/URL.createObjectURL flow (recon §I2); DocumentRenderer DOM ref for PDF; DocumentRenderer parsed content for DOCX.
- **New dependencies:** none.
- **Exit criteria:** All three download options work end-to-end; other artifact types see no UI change; filenames use title-slug + correct extension.

### Phase 7 — Type registry consolidation

- **Goal:** Eliminate the 7+ parallel sources of truth for the artifact type list. One canonical tuple + compiler-enforced coverage of all consumers.
- **Scope in:** Tuple-ify `VALID_ARTIFACT_TYPES`; derive `ArtifactType` via `(typeof ...)[number]`; derive Zod enum from tuple; delete toolbar's local `ARTIFACT_TYPES` array; `assertNever` in every switch; type-level coverage assertion for `ALL_ARTIFACTS`.
- **Scope out:** Unifying icon/label/color + rules + validator into one mega-registry (mixes client-only/server-only concerns and risks bundle regressions).
- **Files touched:** types.ts, constants.ts, create-artifact.ts, chat-input-toolbar.tsx, artifact-renderer.tsx, artifact-panel.tsx, _validate-artifact.ts, prompts/artifacts/index.ts.
- **Reused from existing code:** n/a — this phase *is* the removal of parallelism.
- **New dependencies:** none.
- **Exit criteria:** Adding a new type in the future requires exactly one declaration plus per-type implementation files; every forgotten consumer produces a TS error; two regression probes (comment-out switch case + comment-out `ALL_ARTIFACTS` entry) both fail typecheck as expected.
- **Risk:** medium. Foundation types. Must land isolated, not bundled with feature work.

### Phase 8 — Polish, examples, tests

- **Goal:** Populate examples, add regression tests, update capability docs.
- **Scope in:** Populate `examples` array in [`src/lib/prompts/artifacts/document.ts`](../../src/lib/prompts/artifacts/document.ts) with 2–3 high-quality fixtures (proposal, report, letter); add `validateDocument` unit tests + frontmatter parsing test + DOCX/PDF export smoke tests to `tests/unit/`; update [`artifacts-capabilities.md`](artifacts-capabilities.md) matrix + [`artifacts-deepscan.md`](artifacts-deepscan.md) architecture section to include `text/document`.
- **Scope out:** New features, new dependencies.
- **Files touched:** `src/lib/prompts/artifacts/document.ts`, `tests/unit/` additions, `docs/artifacts-capabilities.md`, `docs/artifacts-deepscan.md`.
- **Reused from existing code:** validator test pattern from `tests/unit/validate-artifact.test.ts` (recon §L3).
- **New dependencies:** none.
- **Exit criteria:** All Phase 1–7 behaviors covered by at least one test; examples array is non-empty and LLM-quality; capability docs reflect current type registry.

---

## Deferred / Out of Scope

Things that came up during planning but explicitly are NOT on the roadmap:

- **KaTeX → OMML native math conversion.** The client-side PNG approach in Phase 4 is production-viable. Editable math in Word is a nice-to-have, not a blocker. Reconsider if a user specifically requests it.
- **Server-side export endpoints.** Deliberately avoided; matches slides pattern. If load on client becomes a real issue for very large documents, reconsider.
- **Multi-user collaborative editing on documents.** Out of scope for this document-type upgrade entirely.
- **Scheduled / background export jobs.** No user request for this.

---

## Phase Artifacts

- [phase-9-revert.md](phase-9-revert.md) — current state — pre-Phase-9 revert log: what was deleted, what was kept, what was stubbed
- [phase-8-brief.md](phase-8-brief.md) + [phase-8-report.md](phase-8-report.md) — Phase 8 audit (work partially reverted; retained for context)
- [architecture-reference.md](architecture-reference.md) — pre-implementation audit; foundation for original Phase 1-8 decisions

Phase 1-7 + 8A briefs/reports were archived after Phase 8 shipped (2026-04-22).

## Related (elsewhere in repo)

- [`artifacts-deepscan.md`](artifacts-deepscan.md) — architecture reference, including the `text/document` pipeline section added in Phase 8
- [`artifacts-capabilities.md`](artifacts-capabilities.md) — capabilities matrix, including the Document column added in Phase 8

---

## Change Log

- **2026-04-23** — Phase 9 pre-rebuild revert. Markdown-walker pipeline (Phase 4 `generate-docx.ts`, Phase 2.5 `DocumentRenderer` markdown path, Phase 8 examples + 3 test describe blocks, Phase 8A walker polish) deleted/stubbed in preparation for rebuild around Anthropic Claude's `docx` skill (LLM-authored JS code in Piston sandbox). Phase 7 type registry, Phase 8 vitest icon stub, Phase 8 plan folder cleanup retained — these are general infra unrelated to the markdown pipeline. text/document artifacts open with "rebuild in progress" placeholder until Phase 9 ships. Detail: [phase-9-revert.md](phase-9-revert.md).
- **2026-04-22** — Phase 8 complete: populated 3 example fixtures (proposal teknis, laporan analisis, memo internal) in `document.ts`; updated `artifacts-capabilities.md` with the Document column + a full `text/document` section; updated `artifacts-deepscan.md` with table row + special-pipeline subsection; consolidated 26 automated tests into `tests/unit/validate-artifact.test.ts` (validator + generateDocx + frontmatter + ARTIFACT_REGISTRY) — also fixed a vitest `@/lib/icons` resolution failure that was breaking 5 pre-existing `create_artifact` tests since Phase 7. Plan folder archived: `full-recon-report.md` renamed to `architecture-reference.md`; all phase-N briefs/reports/investigations/diagnostics deleted (except the Phase 8 brief + report retained temporarily for audit). text/document feature fully shipped.
- **2026-04-22** — Phase 8A complete: visual polish + tech debt cleanup. Document-level paragraph defaults (11pt, 1.5 line, 10pt after, 1-inch margins), body prose JUSTIFIED, mermaid PNG whitespace fix via viewBox-sized canvas, blockquote refactor (removes `p.options.children` private API access), 3 pre-existing tsc warnings cleared, `constants.ts` shim deleted with 3 consumers migrated to `./registry`.
- **2026-04-22** — Phase 7 runtime parity tests passed. User verified all 12 artifact types render with correct icon/label/color, LLM can create artifacts of each type, chat history chips unchanged, text/document pill bug fix confirmed. Phase 7 fully closed.
- **2026-04-22** — Phase 7 complete: artifact type registry consolidated to a single tuple-based source of truth (`src/features/conversations/components/chat/artifacts/registry.ts`). Eliminates 11 parallel sources of truth → 1; converts 7 silent-failure surfaces into compile-time errors. Internal refactor; one incidental UX bug fix: the `text/document` panel header pill now reads "Document" (was the raw string "text/document" — a bug introduced in Phase 1's local map). Runtime parity tests pending user.
- **2026-04-21** — Phase 2.5: Rearchitected DocumentRenderer using docx-preview library for true WYSIWYG preview. `generateDocx()` becomes single source of truth (preview and DOCX download both derive from it). Phase 5 (jspdf PDF export via DOM snapshot) superseded — PDF option removed from the Phase 6 download dropdown. Code tab hidden for text/document only; other artifact types unchanged. Uninstalled `jspdf`; kept `html2canvas-pro` (still used by `generate-docx.ts` for KaTeX rasterization). Deleted `src/lib/document/generate-pdf.ts`.
- **2026-04-21** — Phases 5 + 6 complete. Phase 5 adds `generatePdf()` via DOM snapshot + jsPDF paginated A4 + `onclone` light-mode forcing. Phase 6 adds the split-button download UI in artifact-panel.tsx, threads `articleRef` through `ArtifactRenderer` to `DocumentRenderer`, and exercises the full DOCX + PDF flow end-to-end. Post-Phase-5 hotfix swaps `html2canvas` → `html2canvas-pro` to handle Tailwind v4 `oklch()` / `lab()` CSS color functions that upstream html2canvas rejects.
- **2026-04-21** — Phase 4 complete (DOCX client-side export; browser verification deferred to Phase 6 with real UI button). Phase 5 brief drafted.
- **2026-04-21** — Phase 3 complete (Unsplash markdown resolution). Phase 4 brief drafted.
- **2026-04-21** — Phase 3 marked complete (Unsplash for markdown image syntax in `text/document`, dispatched from both create and update paths)
- **2026-04-21** — Phase 2 marked complete (DocumentRenderer + post-Phase-2 mermaid plugin hotfix; DOM-confirmed verification)
- **2026-04-21** — initial comprehensive version after full-recon-report.md foundation + architectural decisions locked with user sign-off
- **2026-04-21** — earlier minimal version (superseded); Phase 1 execution captured
