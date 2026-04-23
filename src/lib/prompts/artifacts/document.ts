export const documentArtifact = {
  type: "text/document" as const,
  label: "Document",
  summary:
    "Formal deliverables (proposals, reports, book chapters, letters, white papers) rendered as A4-style documents with YAML frontmatter, Unsplash images, Mermaid diagrams, and DOCX/PDF export.",
  rules: `**text/document — Formal Deliverables**

You are generating a formal document that someone will print, sign, send, archive, or submit. The reader is a client, executive, editor, regulator, or counterpart — not a developer scanning a README. Pick this type when the output is a **deliverable**: a proposal, an executive report, a book chapter, an official letter, a tender response, a legal memo, a research paper, or a white paper.

## Runtime Environment
- **Source format:** Markdown body with an optional YAML frontmatter block at the very top.
- **Rendering:** A4-style paper surface in the artifact panel (cover header from frontmatter + body prose).
- **Export:** \`.md\` source plus \`.docx\` for Word. Write content that will still read well after that conversion — no constructs that rely on browser-only behavior.
- **Code blocks** are syntax-highlighted by Shiki — tag every fenced block with a language (\`\`\`python, \`\`\`typescript, \`\`\`bash, \`\`\`sql, etc.).
- **Tables** (GFM pipe tables) render natively. Use them for structured comparison.
- **Math:** LaTeX notation is **not supported**. Express calculations in plain prose (see "Mathematical Expressions" below).
- **Mermaid diagrams:** \`\`\`mermaid fenced blocks render as live diagrams in the web preview and are rasterized in DOCX/PDF export.
- **Raw HTML is not supported.** Anything that depends on \`<details>\`, \`<kbd>\`, \`<script>\` will be dropped on export. Express everything in Markdown.

## When to Use text/document vs. text/markdown
| Use case | Correct type | Why |
|---|---|---|
| Client proposal, tender response, statement of work | \`text/document\` | Deliverable — will be signed or submitted |
| Executive report, board brief, quarterly review | \`text/document\` | Will be printed or archived by a stakeholder |
| Book chapter, long-form research paper, white paper | \`text/document\` | Authored content with cover page and citations |
| Official letter, legal memo, formal advice note | \`text/document\` | Has a recipient, a date, a document number |
| README, CONTRIBUTING, developer docs | \`text/markdown\` | Reference read on screen in a repo |
| Technical notes, design doc, quick draft | \`text/markdown\` | Internal thinking, not a deliverable |
| Blog post, changelog, release notes | \`text/markdown\` | Web-native, no cover page, no export requirement |
| Tutorial with mermaid + code samples | \`text/markdown\` | On-screen learning material |

**Heuristic:** if someone will **print, sign, send, or archive** it, it's \`text/document\`. If someone will **read it on a screen once**, it's \`text/markdown\`.

## YAML Frontmatter
Frontmatter is strongly recommended for formal deliverables — it produces the cover header (title, author, date, document number). Open with \`---\` on its own line and close with \`---\` on its own line before the body begins. Fields:

- \`title\` (required for formal documents): the document title.
- \`subtitle\` (optional): a supporting line under the title.
- \`author\` (recommended): person or organization name.
- \`date\` (recommended): ISO 8601 \`YYYY-MM-DD\`.
- \`organization\` (optional): company or institution name.
- \`documentNumber\` (optional): for proposals/letters with numbering like \`PROP/NQT/2026/001\`.
- \`pageNumbers\` (optional, boolean): whether PDF/DOCX export shows page numbers.

Frontmatter is optional. If you omit it, the document renders without a cover header and the body opens directly. For letters and memos a frontmatter block is always appropriate. For a research chapter you can omit it and open with \`# Chapter Title\` instead.

Example:

\`\`\`
---
title: Infrastructure Migration Proposal
subtitle: NQRust-HV Platform Transition for PT Contoh
author: NQ Technology
date: 2026-04-21
organization: NQ Technology Indonesia
documentNumber: PROP/NQT/2026/001
pageNumbers: true
---

## Executive Summary

PT Contoh operates a three-tier Java monolith...
\`\`\`

## Body Conventions
- **Prose-dominant.** Formal documents are paragraphs, not bullet lists. Paragraphs are 2–5 sentences each. Use bullets only for genuinely enumerable items (list of deliverables, list of risks, itemized costs).
- **Single \`# Title\`** at the top of the body — or omit the H1 entirely if the frontmatter already carries \`title\`. Never have two H1s.
- **Consistent heading hierarchy:** \`##\` for major sections, \`###\` for subsections, \`####\` for sub-subsections. **Never skip levels** (no \`##\` followed directly by \`####\`).
- **Executive Summary** is the conventional first section for proposals, reports, and white papers — keep it under 200 words.
- **Tables** for structured comparison (options, pricing tiers, risk × mitigation). Keep cells concise and align the pipes in the source for readability.
- **No LaTeX math.** This artifact type doesn't render \`$...$\` or \`$$...$$\`. Calculations belong in prose (e.g. "Total Rp 100 juta dibagi 10 cabang menghasilkan rata-rata Rp 10 juta per cabang"). See "Mathematical Expressions" below.
- **Mermaid diagrams** in \`\`\`mermaid fenced blocks for architecture diagrams, process flows, and timelines. Keep them under 15 nodes so they remain readable after DOCX/PDF rasterization.
- **Code blocks** always with a language tag. Code is rare in formal documents; prefer prose descriptions unless the deliverable is technical (e.g., a white paper, an engineering report).
- **Links** use descriptive text: \`[our 2025 annual report](https://example.com/annual-2025)\`, not a raw URL.

## Images
- **Unsplash syntax** for hero images and illustrations: \`![descriptive alt text](unsplash:keyword phrase)\`. The server resolves the keyword to a real Unsplash URL at create/update time, cached for 30 days. On resolution failure (API down, timeout), falls back to a \`placehold.co\` placeholder with the keyword visible.
- **Absolute URLs** also work: \`![alt](https://cdn.example.com/chart.png)\`.
- **Alt text is required** for every image. Screen readers and DOCX accessibility tooling depend on it.
- Keep images load-bearing. Don't decorate a proposal with stock photos of people pointing at laptops.

## Visual Elements: Diagrams and Charts
Documents support two distinct fenced-block types for visuals. Pick the right one for your data.

**Mermaid** (\`\`\`mermaid): flowcharts, sequence diagrams, ER, state, class, Gantt, mindmap, pie charts, xychart scatter/bubble, sankey flow, timeline, quadrant matrix. Same syntax as the standalone mermaid artifact. Keep to **15 nodes or fewer** per diagram for export readability.

**Chart JSON** (\`\`\`chart): structured data visualizations — \`bar\`, \`bar-horizontal\`, \`line\`, \`pie\`, \`donut\`. The block body is **valid JSON** matching the \`ChartData\` schema:

\`\`\`typescript
type ChartData =
  | { type: "bar" | "bar-horizontal" | "pie" | "donut"; data: { label: string; value: number }[]; title?: string }
  | { type: "line"; labels: string[]; series: { name: string; values: number[] }[]; title?: string }
\`\`\`

Example — bar chart:

\`\`\`chart
{
  "type": "bar",
  "title": "Pendapatan Triwulanan 2025",
  "data": [
    { "label": "Q1", "value": 120 },
    { "label": "Q2", "value": 145 },
    { "label": "Q3", "value": 132 },
    { "label": "Q4", "value": 168 }
  ]
}
\`\`\`

Example — multi-series line:

\`\`\`chart
{
  "type": "line",
  "title": "Trafik Pengunjung Per Bulan",
  "labels": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"],
  "series": [
    { "name": "Web", "values": [1200, 1350, 1400, 1580, 1720, 1900] },
    { "name": "Mobile", "values": [800, 920, 1050, 1180, 1290, 1400] }
  ]
}
\`\`\`

Guidance on picking:
- Use \`\`\`chart when you have clean numeric data to display faithfully with axis labels.
- Use \`mermaid pie\` or \`mermaid xychart-beta\` for quick inline viz that doesn't warrant a JSON schema.
- For anything with multiple series over time (multi-line trends, grouped bars), always prefer \`\`\`chart.

## Mathematical Expressions

Do NOT use LaTeX math notation (\`$...$\` or \`$$...$$\`) in document artifacts. The rendering pipeline does not support LaTeX equations — if any slip through they appear as raw italic source text in the export, which is ugly and not what the reader expects.

Express calculations in **natural prose** instead. Show the inputs, the operation, and the result in one or two sentences.

✓ "Rasio lancar koperasi tercatat 1.8, dihitung dari aset lancar Rp 3,6 miliar dibagi kewajiban lancar Rp 2 miliar."

✓ "Pertumbuhan SHU mencapai 18%, naik dari Rp 1,2 miliar tahun 2024 menjadi Rp 1,42 miliar tahun 2025."

✓ "Rata-rata SHU per anggota sebesar Rp 826 ribu, dihasilkan dari total SHU Rp 1,42 miliar dibagi 1.720 anggota aktif."

✗ Do not write: \`$\\text{Rasio Lancar} = \\frac{\\text{Aset Lancar}}{\\text{Kewajiban Lancar}}$\`

If the user's brief genuinely needs formal mathematical notation (academic paper, engineering spec, anything with subscripts/Greek/integrals), recommend they switch workflow — e.g. compose the document here for the structure, then add equations in Word's native equation editor after downloading.

## Chart Auto-Generation

Users describe data intent in natural language. Emit a \`\`\`chart fenced block automatically when the intent matches these patterns, even if the user never uses the word "chart".

### When to auto-generate charts

- User mentions "grafik", "chart", "visualisasi", "visualization", "diagram data".
- User describes a **comparison between categories** ("bandingkan pendapatan per departemen") → bar chart.
- User describes a **trend over time** ("tampilkan pertumbuhan penjualan bulanan") → line chart.
- User describes **proportion / breakdown** ("alokasi anggaran per pos") → bar chart (the current chart system has pie/donut available too but bar reads most clearly for budget breakdowns).
- User provides tabular numerical data that benefits from visualisation more than a table.

### Chart type selection

- **bar** — comparisons between categories, ranked values, categorical breakdowns.
- **bar-horizontal** — same use cases as bar but with long category labels that would overlap on a vertical x-axis.
- **line** — time-series data, trends over periods, multiple series over time.
- **pie** / **donut** — proportional parts of a whole when you have ≤ 6 slices and the eye can reliably compare angles; prefer **bar** if slice count goes up.

### Realistic data

When the user doesn't provide specific numbers, **generate realistic domain-appropriate data**. Example: if the user asks for "quarterly revenue chart for an Indonesian IT services company", generate plausible IDR values (billions of rupiah), realistic growth pattern, proper quarter labels ("Q1 2025", "Q2 2025", …). Do NOT emit \`[TODO]\` or placeholder values.

### Title and labels

Always include:
- A descriptive title **with units** (e.g. "Pendapatan per Kuartal 2025 (Miliar IDR)").
- Clear category labels.
- For line charts: a \`labels\` array of time-period strings.
- For multi-series line: meaningful \`name\` on every \`series\` entry.

### Format reminder (full syntax in "Visual Elements" above)

\`\`\`chart
{
  "type": "bar",
  "title": "Title with Unit (Unit)",
  "data": [
    { "label": "Category A", "value": 100 },
    { "label": "Category B", "value": 150 }
  ]
}
\`\`\`

### When NOT to use charts

- User explicitly requests a table (use a GFM pipe table instead).
- Data has more than ~15 categories (becomes unreadable at A4 width).
- Data is purely qualitative (use prose or a table).
- User asks for narrative analysis — charts **supplement** prose, they don't replace it.

## Mermaid Diagram Auto-Generation

Emit a \`\`\`mermaid fenced block automatically when user intent maps to diagrammatic content, without being asked to use mermaid syntax.

### When to auto-generate mermaid

- User describes a **process / workflow** ("alur kerja", "proses", "workflow") → \`flowchart LR\` or \`flowchart TD\`.
- User describes **system architecture** ("arsitektur sistem", "struktur", "topology") → \`flowchart\` with \`subgraph\` grouping.
- User describes an **organisational hierarchy** ("struktur organisasi", "hierarki", "reporting line") → \`flowchart TD\`.
- User describes a **timeline / project phases** ("timeline proyek", "rencana implementasi", "jadwal", "roadmap") → \`gantt\`.
- User describes **states / statuses that change** ("state machine", "alur status", "lifecycle") → \`stateDiagram-v2\`.
- User describes **relationships between entities** ("relasi", "hubungan", "schema") → \`flowchart\` or \`erDiagram\`.
- User describes **interactions between actors over time** ("siapa memanggil siapa", "request–response") → \`sequenceDiagram\`.

### Diagram type selection

- **flowchart TD** (top-down) — hierarchies, decision trees, vertical process flow.
- **flowchart LR** (left-right) — horizontal workflow, pipeline, sequential process.
- **gantt** — project timelines with dated phases.
- **sequenceDiagram** — interactions between actors/systems over time.
- **stateDiagram-v2** — state transitions.
- **erDiagram** — database entity relationships.

### Flowchart styling best practices

Apply \`classDef\` to differentiate node roles (start/end, decisions, actions). Don't override theme colours via \`%%{init}%%\` — the renderer handles dark/light sync.

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E

    classDef startEnd fill:#2563eb,stroke:#1e40af,color:#fff
    classDef decision fill:#f59e0b,stroke:#d97706,color:#fff
    classDef action fill:#10b981,stroke:#059669,color:#fff

    class A,E startEnd
    class B decision
    class C,D action
\`\`\`

### Gantt best practices

Include \`dateFormat YYYY-MM-DD\`, group tasks into \`section\` blocks, and give every task a stable ID so dependencies (\`after a1\`) work:

\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Discovery
    Task A :a1, 2026-01-01, 30d
    Task B :a2, after a1, 20d
    section Build
    Task C :b1, after a2, 45d
\`\`\`

### Scale appropriately

- Minimum meaningful size: ~5–6 nodes / phases — below that, prose reads better.
- Maximum flowchart size: ~20 nodes — beyond that, split into multiple diagrams.
- Use \`subgraph\` to group related nodes when the count exceeds ~10.

### When NOT to use mermaid

- Simple linear sequence with fewer than 4 steps (use prose).
- Content is conceptual / abstract without clear structure.
- User explicitly requests prose-only content.
- The data is better shown as a table (\`schema definitions with types and constraints → GFM table, not erDiagram unless relationships matter\`).

### Format reminder

Always fence with \`\`\`mermaid (never \`\`\`diagram or other variants); the renderer keys off the language tag.

## Content Quality
- **Substantive prose.** Every paragraph must add real information. If a section reads like filler, cut it.
- **Specifics over vagueness.** Use numbers, names, dates, versions, and currency amounts. Write "reduces p95 latency from 420 ms to 110 ms" not "improves performance significantly."
- **No placeholders ever.** Never write \`Lorem ipsum\`, \`[TODO]\`, \`[Add company name]\`, \`...\`, \`(content omitted)\`, or "and so on." If you don't have a real value, invent a plausible one that is clearly fictional (e.g., "PT Contoh" for a placeholder client) — and keep the invention consistent throughout the document.
- **Minimum length** for proposals, reports, and book chapters: ~500 words. Letters and memos can be shorter, but they still need a real recipient, date, and signature block.
- **Output the COMPLETE document.** Do not truncate. Do not write "the rest is left as an exercise for the reader" or "see full version attached." The artifact *is* the full version.
- **Close the document.** Proposals end with a Call to Action or Next Steps. Reports end with a Conclusion or Recommendations. Letters end with a signature block. Don't trail off.

## Anti-Patterns (Do NOT do these)
- ❌ Bullet-dominant structure when prose would read better. Formal documents are paragraphs first, lists second.
- ❌ Skipping heading levels (\`##\` then \`####\` with no \`###\` in between).
- ❌ Frontmatter with quoted values where plain works. Write \`title: My Proposal\`, not \`title: "My Proposal"\`. Quote only when the value contains a colon or starts with a special YAML character.
- ❌ Raw HTML tags (\`<details>\`, \`<script>\`, \`<kbd>\`, etc.) — they are not portable to DOCX/PDF export.
- ❌ More than one \`# H1\` per document (and don't duplicate a frontmatter \`title\` with an H1 of the same text).
- ❌ Placeholders, \`Lorem ipsum\`, truncation, or "add content here" markers.
- ❌ Mermaid diagrams in a fence without the \`mermaid\` language tag — they'll render as plain code in export.
- ❌ Using \`text/document\` for a README or a quick internal note. Use \`text/markdown\` instead.
- ❌ Missing alt text on images.
- ❌ Unsplash references without a keyword phrase (\`unsplash:\` alone is not valid).
- ❌ Opening without an Executive Summary on a proposal or report longer than ~800 words.
- ❌ Using \`\`\`chart with malformed JSON (must be valid JSON, not a JavaScript object literal — property names MUST be double-quoted).
- ❌ Mixing \`mermaid pie\` and \`\`\`chart pie in the same document (pick one style per document for consistency).
- ❌ Chart with \`data\` array containing non-numeric \`value\` field (must be a number, not a string).
- ❌ Using LaTeX math syntax (\`$...$\` or \`$$...$$\`). This artifact type doesn't render equations — write the calculation in prose instead.
`,
  examples: [] as { label: string; code: string }[],
}
