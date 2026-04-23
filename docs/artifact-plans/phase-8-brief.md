PHASE 8: Docs + prompt examples + automated tests + plan folder cleanup

Single-shot execution. No investigation halt, no approval gates. Execute all tasks, produce report, stop.

## Task 0: Save as `docs/artifact-plans/phase-8-brief.md`

## Task 1: Populate examples in src/lib/prompts/artifacts/document.ts

Add 3 Indonesian business document fixtures to the examples array. Each fixture covers a different use case to show the LLM what good output looks like.

### Example 1 — Proposal teknis

Frontmatter: title, subtitle, documentNumber ("PROP/NQRUST/2026/001"), author ("Tim NQRust"), organization ("PT Nexus Quantum Technologies"), date.

Content sections:
- Ringkasan Eksekutif (2-3 paragraphs)
- Latar Belakang
- Ruang Lingkup
- Arsitektur Solusi with mermaid flowchart (6-8 node architecture diagram, TD direction)
- Timeline Implementasi with mermaid gantt (6-8 tasks, 3-4 months)
- Estimasi Biaya with GFM table (4 columns: Item, Deskripsi, Kuantitas, Harga)
- Penutup

Use formal Bahasa Indonesia. Technical terms in English OK.

### Example 2 — Laporan analisis

Frontmatter: title ("Laporan Analisis Performa Q1 2026"), subtitle, documentNumber, author, date.

Content sections:
- Ringkasan Temuan (bullet points)
- Metodologi
- Hasil Analisis with chart fence (bar chart, 4-5 data points comparing quarters)
- Tren Pertumbuhan with chart fence (line chart, 6-12 months)
- SWOT Analysis with GFM table (2x2)
- Rekomendasi (numbered list)
- Kesimpulan

### Example 3 — Surat resmi / memo internal

Frontmatter: title, documentNumber ("MEMO/INT/2026/014"), to, from, date.

Content:
- Opening paragraph (perihal)
- Main body (3-4 paragraphs, prose only)
- Action items (numbered list)
- Closing paragraph
- Signature block

Simpler than the other two — no diagrams, just prose + list + frontmatter.

Each example follows the prompt rules established in Phase 2+3 (frontmatter keys, mermaid fence syntax, chart fence JSON schema, unsplash image resolution). All prose in Bahasa Indonesia formal register.

## Task 2: Update docs/artifacts-capabilities.md

Add text/document row to the capability matrix. Find the existing table and add a new row matching existing schema:
- Type: text/document
- Purpose: Long-form business documents with frontmatter cover page, mermaid diagrams, chart fences, Unsplash images, DOCX export
- Visual: Paper A4 surface, WYSIWYG preview via docx-preview
- Export: .md (source), .docx (native Word format)
- Code tab: Hidden (preview IS source, Phase 2.5 architecture)

Keep table's visual style. Match existing column count and ordering.

## Task 3: Update docs/artifacts-deepscan.md

Add text/document architecture section. Match existing per-type section structure. Cover:
- Type declaration (reference registry.ts)
- Rendering pipeline (DocumentRenderer → generateDocx → docx-preview.renderAsync)
- DOCX export pipeline (remark-parse → mdast walker → docx nodes → Packer.toBlob)
- Visual elements supported (mermaid, chart fence, Unsplash images; NO LaTeX math per Phase 2.5 decision)
- Special behaviors (Code tab hidden, split-button download with MD+DOCX)

## Task 4: Automated tests in tests/unit/

Add 4 test files following existing test pattern.

### tests/unit/validate-document.test.ts
- Valid markdown passes
- Valid chart fence JSON passes
- Malformed chart fence JSON fails
- Chart fence missing required fields fails
- Empty content passes

### tests/unit/generate-docx.test.ts
- Empty markdown produces valid DOCX blob (magic bytes check)
- Frontmatter-only produces cover page
- Headings + paragraphs render
- Table renders
- Code block renders
- Visual blocks (mermaid, chart) fall through to placeholder in Node
- Unknown node type doesn't crash

### tests/unit/registry.test.ts
- All entries have required fields
- ArtifactType union derives correctly
- TYPE_ICONS, TYPE_LABELS, TYPE_COLORS exhaustive
- getArtifactRegistryEntry returns correct entry
- Returns undefined for unknown type

### tests/unit/frontmatter.test.ts
- Valid frontmatter extracts to data object
- Missing frontmatter returns empty data + full content
- Malformed YAML handled gracefully
- Preserves body content exactly

## Task 5: Update README.md roadmap

- Phase 8 status: 🟡 next → ✅ complete
- Change log entry at top:
  - **2026-04-22** — Phase 8 complete: populated 3 example fixtures (proposal, laporan analisis, memo), updated artifacts-capabilities.md + artifacts-deepscan.md, added 4 automated test files. text/document feature fully shipped. Plan folder cleaned up — see Task 6.

## Task 6: Plan folder cleanup

The docs/artifact-plans/ folder currently has 20+ files from the phase-by-phase rollout. Most are historical work artifacts (briefs, investigations, diagnostics, hotfix debugs) that no longer serve ongoing reference value now that the feature has shipped.

**Preserve these files (rename as noted):**

1. `README.md` → stays as `README.md`. Primary roadmap doc. Still valuable as "what did we build, why, and what's the final architecture" reference.

2. `full-recon-report.md` → rename to `architecture-reference.md`. Keep — it's the pre-implementation audit of the whole artifact subsystem; serves as ongoing architecture reference independent of the phase trail.

**Delete everything else in docs/artifact-plans/:**

- All `phase-N-brief.md` (Phase 1 through Phase 8, including 2.5, 8a)
- All `phase-N-report.md` (Phase 1 through Phase 8, including 2.5, 8a)
- All `phase-N-investigation.md` (Phase 7, 8a)
- All `phase-N-diagnostic.md` (Phase 1, Phase 2 mermaid bug, etc.)
- Any `phase-N-hotfix*.md` files
- Any `phase-N-blocker.md` files if present
- Any `phase-N-consistency-audit.md` files
- `phase-2-mermaid-bug.md`, `phase-2-mermaid-hotfix-debug.md`

**Method:** list all files in the folder first, confirm the delete list matches expectation, then delete. Use `rm` for files, not directories.

**Before deletion, verify README.md no longer references deleted files:**
- The "Phase Artifacts" section in README.md currently lists every phase file with links. After cleanup, replace that entire section with a simple note:

```markdown
## Phase Artifacts

The phase-by-phase execution trail (briefs, reports, investigations, diagnostics) has been archived after Phase 8 shipped. The `architecture-reference.md` file preserves the pre-implementation audit used as the foundation for all architectural decisions in this rollout.
```

- Any inline phase-N-report.md links in the roadmap narrative paragraphs should be removed or rephrased (e.g. "Phase 3 completed 2026-04-21; see phase-3-report.md" → "Phase 3 completed 2026-04-21").

- Update the "Related (elsewhere in repo)" section:
  - `../recon-report.md` → stays (reference)
  - `../artifacts-deepscan.md` → stays (now updated in Task 3)
  - `../artifacts-capabilities.md` → stays (now updated in Task 2)

## Verification

- `bunx tsc --noEmit 2>&1 | grep -E "(validate-document|generate-docx|registry|frontmatter|document\.ts)\.(ts|tsx)" | head`
  Expected: empty
- `bunx next build`
  Must succeed
- Run 4 new test files via whatever test runner the repo uses. All pass.
- `ls docs/artifact-plans/` expected output: `README.md`, `architecture-reference.md`, `phase-8-brief.md`, `phase-8-report.md` (brief + report for this phase stay temporarily for audit; user can delete them too after confirming the ship).
- `grep -rn "phase-[0-9]" docs/artifact-plans/README.md` — expected empty (all phase-N-report.md references removed from narrative)

## Deliverable: docs/artifact-plans/phase-8-report.md

1. Files touched (~9 source files + folder cleanup summary)
2. Example summaries
3. Capability matrix row content
4. Deepscan section content
5. Test coverage summary
6. Plan folder cleanup — list deleted files, renames, README section replaced
7. Typecheck + build + test output
8. Issues encountered
9. Confirmation checklist

## Out of scope

- New prompt rule changes
- Test coverage for unrelated modules
- New features
- Git commits

## Stop after report written
