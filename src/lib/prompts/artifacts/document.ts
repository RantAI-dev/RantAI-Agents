import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

export const documentArtifact = {
  type: "text/document" as const,
  label: "Document",
  summary:
    "Formal deliverables (proposals, reports, book chapters, letters, white papers) authored as a structured JSON document tree — renders as an A4 preview and exports to .docx with native Word styling, tables, images, TOC, footnotes, and headers/footers.",
  rules: `**text/document — Formal Deliverables**

You are generating a formal document that someone will print, sign, send, archive, or submit. The reader is a client, executive, editor, regulator, or counterpart — not a developer scanning a README. Pick this type when the output is a **deliverable**: a proposal, an executive report, a book chapter, an official letter, a tender response, a legal memo, a research paper, or a white paper.

## Output Format — JSON ONLY

Output **a single JSON object** matching the \`DocumentAst\` schema described below. Nothing else.

- **NO markdown fences.** Do not wrap the JSON in \`\`\`json or any other fence.
- **NO text outside the JSON object** — no commentary, no "Here is your document", no trailing prose, no preamble.
- The entire response must be \`JSON.parse\`-able as-is.

The renderer parses raw JSON. Any text before \`{\` or after the closing \`}\` will break the validator.

## When to Use text/document vs. text/markdown vs. text/html

| Use case | Correct type | Why |
|---|---|---|
| Client proposal, tender response, statement of work | \`text/document\` | Deliverable — will be signed or submitted |
| Executive report, board brief, quarterly review | \`text/document\` | Will be printed or archived by a stakeholder |
| Book chapter, long-form research paper, white paper | \`text/document\` | Authored content with cover page and citations |
| Official letter, legal memo, formal advice note | \`text/document\` | Has a recipient, a date, a document number |
| README, CONTRIBUTING, developer docs | \`text/markdown\` | Reference read on screen in a repo |
| Technical notes, design doc, quick draft | \`text/markdown\` | Internal thinking, not a deliverable |
| Blog post, changelog, release notes | \`text/markdown\` | Web-native, no cover page, no export requirement |
| Tutorial with code samples | \`text/markdown\` | On-screen learning material |
| Landing page, styled web content | \`text/html\` | Browser-only, CSS-driven layout |

**Heuristic:** if someone will **print, sign, send, or archive** it, it's \`text/document\`. If someone will **read it on a screen once**, it's \`text/markdown\`.

## Top-Level Shape

The top-level JSON object has five keys:

\`\`\`json
{
  "meta": {
    "title": "Infrastructure Migration Proposal",
    "author": "NQ Technology Solutions",
    "date": "2026-04-23",
    "subtitle": "Java Monolith to NQRust-HV — Phased Modernisation",
    "organization": "NQ Technology",
    "documentNumber": "PROP/NQT/2026/001",
    "pageSize": "letter",
    "showPageNumbers": true
  },
  "coverPage": {
    "title": "Infrastructure Migration Proposal",
    "subtitle": "Java Monolith to NQRust-HV — Phased Modernisation",
    "author": "NQ Technology Solutions",
    "date": "2026-04-23",
    "organization": "NQ Technology"
  },
  "header": { "children": [ /* block nodes */ ] },
  "footer": { "children": [ /* block nodes */ ] },
  "body": [ /* block nodes */ ]
}
\`\`\`

| Key | Required | Notes |
|---|---|---|
| \`meta\` | yes | Document metadata — drives DOCX properties and the web preview header |
| \`coverPage\` | optional | When present, generates a styled cover page before \`body\` |
| \`header\` | optional | Repeating page header — use for letterhead, document title stripe, or logo |
| \`footer\` | optional | Repeating page footer — use for page numbers, document number, confidentiality notice |
| \`body\` | yes | Array of block nodes — the main document content |

### meta fields

| Field | Required | Notes |
|---|---|---|
| \`title\` | yes | Document title (1–200 chars) |
| \`author\` | optional | Person or organization name |
| \`date\` | optional | ISO 8601 \`YYYY-MM-DD\` |
| \`subtitle\` | optional | Supporting tagline under the title |
| \`organization\` | optional | Company or institution |
| \`documentNumber\` | optional | Reference number, e.g. \`PROP/NQT/2026/001\` |
| \`pageSize\` | optional | \`"letter"\` (default) or \`"a4"\` |
| \`orientation\` | optional | \`"portrait"\` (default) or \`"landscape"\` |
| \`margins\` | optional | Object with \`top\`, \`bottom\`, \`left\`, \`right\` in DXA (default: 1440 each = 1 in) |
| \`font\` | optional | Font family string, default \`"Arial"\` |
| \`fontSize\` | optional | Point size 8–24, default \`12\` |
| \`showPageNumbers\` | optional | Boolean, default \`false\` |

## Block Node Types

Block nodes are the direct children of \`body\`, \`header.children\`, \`footer.children\`, \`blockquote.children\`, \`list item children\`, and \`table cell children\`.

| Type | When to use | Required fields | Minimal example |
|---|---|---|---|
| \`paragraph\` | Running prose — the default container for text | \`children\` (≥ 1 inline) | \`{ "type": "paragraph", "children": [{ "type": "text", "text": "Hello." }] }\` |
| \`heading\` | Section titles at levels 1–6 | \`level\`, \`children\` (≥ 1 inline) | \`{ "type": "heading", "level": 2, "children": [{ "type": "text", "text": "Executive Summary" }] }\` |
| \`list\` | Bullet or numbered items | \`ordered\`, \`items\` (≥ 1) | \`{ "type": "list", "ordered": false, "items": [{ "children": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Item one" }] }] }] }\` |
| \`table\` | Structured data — pricing, features, comparison | \`columnWidths\`, \`width\`, \`rows\` | See Table Sizing below |
| \`image\` | Illustrations, hero shots, charts as images | \`src\`, \`alt\`, \`width\`, \`height\` | \`{ "type": "image", "src": "unsplash:mountain landscape", "alt": "Mountain range at dusk", "width": 600, "height": 300 }\` |
| \`blockquote\` | Pull quotes, expert citations, highlighted notes | \`children\` (≥ 1 block) | \`{ "type": "blockquote", "children": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Premature optimisation is the root of all evil." }] }], "attribution": "Donald Knuth" }\` |
| \`codeBlock\` | Technical content — config files, code snippets | \`language\`, \`code\` | \`{ "type": "codeBlock", "language": "bash", "code": "cargo build --release" }\` |
| \`horizontalRule\` | Visual separator between major sections | — | \`{ "type": "horizontalRule" }\` |
| \`pageBreak\` | Force a new page (e.g. before appendices) | — | \`{ "type": "pageBreak" }\` |
| \`toc\` | Table of contents — insert near the top, after the exec summary | \`maxLevel\` | \`{ "type": "toc", "maxLevel": 2, "title": "Table of Contents" }\` |

### paragraph optional fields

| Field | Notes |
|---|---|
| \`align\` | \`"left"\` (default), \`"center"\`, \`"right"\`, \`"justify"\` |
| \`spacing\` | \`{ "before": 120, "after": 120 }\` — values in twips (DXA) |
| \`indent\` | \`{ "left": 720, "hanging": 360, "firstLine": 360 }\` — values in DXA |

### heading optional fields

| Field | Notes |
|---|---|
| \`bookmarkId\` | String identifier — set this on H2s (and H1s if desired) that should appear in the TOC and be linkable via \`anchor\` inline nodes. Must be unique within the document. Example: \`"section-executive-summary"\` |

### list optional fields

| Field | Notes |
|---|---|
| \`startAt\` | Starting number for ordered lists (default: 1) |
| \`items[].subList\` | Nested list: \`{ "ordered": false, "items": [...] }\` |

## Inline Node Types

Inline nodes live inside \`paragraph.children\`, \`heading.children\`, \`link.children\`, and \`anchor.children\`.

| Type | When to use | Required fields | Notes |
|---|---|---|---|
| \`text\` | Plain or styled text — the most common inline node | \`text\` (string) | Style flags: \`bold\`, \`italic\`, \`underline\`, \`strike\`, \`code\`, \`superscript\`, \`subscript\` (all boolean, optional); \`color\` (\`#rrggbb\` hex string, optional) |
| \`link\` | Hyperlink to an external URL | \`href\` (full URL), \`children\` (≥ 1 inline) | \`{ "type": "link", "href": "https://example.com", "children": [{ "type": "text", "text": "our report" }] }\` |
| \`anchor\` | Internal cross-reference to a bookmark declared on a heading | \`bookmarkId\`, \`children\` (≥ 1 inline) | \`bookmarkId\` must match a \`heading.bookmarkId\` in the same document |
| \`footnote\` | Footnote — content appears at the bottom of the page in DOCX | \`children\` (≥ 1 block node) | Use sparingly; each footnote is a small block tree |
| \`lineBreak\` | Soft line break within a paragraph (not a new paragraph) | — | \`{ "type": "lineBreak" }\` |
| \`pageNumber\` | Current page number — only valid inside \`header\` or \`footer\` | — | \`{ "type": "pageNumber" }\` |
| \`tab\` | Horizontal tab stop — useful in letters for right-aligning dates | \`leader\` (\`"none"\` or \`"dot"\`, optional) | \`{ "type": "tab", "leader": "dot" }\` — dot leader creates the dotted line effect used in TOC-style layouts |

### text style flags reference

\`\`\`json
{
  "type": "text",
  "text": "Important figure",
  "bold": true,
  "italic": false,
  "underline": false,
  "strike": false,
  "code": false,
  "superscript": false,
  "subscript": false,
  "color": "#1a56db"
}
\`\`\`

All style flags are optional and default to \`false\`/absent. Combine as needed — e.g. \`bold + italic\` is valid.

## Images and Unsplash

The \`image.src\` field accepts two forms:

1. **Full URL** — \`"https://cdn.example.com/chart.png"\` — fetched directly.
2. **Unsplash keyword** — \`"unsplash:keyword phrase"\` — the server resolves this to a real Unsplash photo URL at create/update time, cached for 30 days. On resolution failure (API unavailable, timeout), falls back to a placeholder image with the keyword visible.

**Alt text is required** on every image. Screen readers and DOCX accessibility tooling depend on it. The schema enforces \`alt\` as a non-empty string.

Captions are optional (\`caption\` field — plain string). Width and height are in pixels (used for aspect-ratio hints in the renderer; DOCX export scales to fit the page body width while preserving ratio).

Alignment defaults to \`"center"\`. Set \`"left"\` or \`"right"\` to wrap text around the image.

Keep images load-bearing. A hero image on a proposal cover page is appropriate; decorative stock photos of people pointing at laptops are not.

## Bookmarks and TOC

To build a navigable table of contents:

1. Add \`"bookmarkId": "section-id"\` to each \`heading\` node you want listed (H1 and H2 are most common).
2. Insert a \`{ "type": "toc", "maxLevel": 2, "title": "Table of Contents" }\` block early in \`body\` (after the executive summary is conventional).
3. Use \`{ "type": "anchor", "bookmarkId": "section-id", "children": [...] }\` anywhere in the document to create in-document hyperlinks to those headings.

The TOC block renders as a formatted table-of-contents in both the web preview and the DOCX export. The \`maxLevel\` controls which heading levels appear (e.g. \`maxLevel: 2\` includes H1 and H2 only).

Bookmark IDs must be unique within the document and must not contain spaces. Use kebab-case: \`"section-executive-summary"\`, \`"section-pricing"\`.

## Page Size, Margins, and Orientation

Defaults: US Letter (\`"letter"\`), portrait, 1-inch margins on all sides (1440 DXA each).

To switch to A4: set \`meta.pageSize: "a4"\`.
To switch to landscape: set \`meta.orientation: "landscape"\`.
To set custom margins: set \`meta.margins: { "top": 1440, "bottom": 1440, "left": 1800, "right": 1800 }\`.

DXA (Document eXchange Absolute) units: 1 inch = 1440 DXA. Common conversions:
- 0.5 in = 720 DXA
- 1 in = 1440 DXA
- 1.25 in = 1800 DXA
- 1.5 in = 2160 DXA

## Table Sizing

Table column widths are specified in DXA. The sum of all \`columnWidths\` must equal \`width\`.

Standard body width for US Letter with 1-inch margins: **9360 DXA** (8.5 in − 2 × 1 in = 6.5 in × 1440).
Standard body width for A4 with 1-inch margins: **8568 DXA** (approximately).

Common splits for US Letter (9360 DXA total):
- 2 equal columns: \`[4680, 4680]\`
- 3 equal columns: \`[3120, 3120, 3120]\`
- 4 equal columns: \`[2340, 2340, 2340, 2340]\`
- Label + content: \`[2340, 7020]\` (25% / 75%)
- Label + content + notes: \`[2340, 4680, 2340]\`

Row cell count (accounting for \`colspan\`) must equal the number of columns declared in \`columnWidths\`. A header row looks like:

\`\`\`json
{
  "type": "table",
  "columnWidths": [3120, 3120, 3120],
  "width": 9360,
  "rows": [
    {
      "isHeader": true,
      "cells": [
        { "children": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Phase", "bold": true }] }] },
        { "children": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Duration", "bold": true }] }] },
        { "children": [{ "type": "paragraph", "children": [{ "type": "text", "text": "Cost (USD)", "bold": true }] }] }
      ]
    }
  ],
  "shading": "striped"
}
\`\`\`

## Content Quality

- **Substantive prose.** Every paragraph must add real information. If a section reads like filler, cut it.
- **Specifics over vagueness.** Use numbers, names, dates, versions, and currency amounts. Write "reduces p95 latency from 420 ms to 110 ms" not "improves performance significantly."
- **No placeholders ever.** Never write \`Lorem ipsum\`, \`[TODO]\`, \`[Add company name]\`, \`...\`, \`(content omitted)\`, or "and so on." If you don't have a real value, invent a plausible one clearly marked as fictional (e.g., "PT Contoh" for a placeholder client) — and keep it consistent throughout.
- **Minimum length** for proposals, reports, and book chapters: ~400 words of actual prose. Letters and memos can be shorter, but they still need a real recipient, date, and signature block.
- **Complete documents only.** Do not truncate. Do not write "the rest is left as an exercise for the reader" or "see full version attached." The artifact is the full version.
- **Close the document.** Proposals end with a Call to Action or Next Steps. Reports end with a Conclusion or Recommendations. Letters end with a signature block. Don't trail off.

## Anti-Patterns

- ❌ Output anything before the opening \`{\` or after the closing \`}\` — commentary, markdown fences, or explanation will break the parser.
- ❌ Wrap the JSON in \`\`\`json fences or any other fence.
- ❌ Markdown syntax inside \`text.text\` values. No \`**bold**\`, no \`## heading\`, no backtick spans, no \`*italic*\`. Use the inline node style flags (\`bold: true\`, etc.) instead.
- ❌ Empty \`children\` arrays on \`paragraph\`, \`heading\`, or \`blockquote\` — the schema requires at least one child.
- ❌ \`anchor.bookmarkId\` referencing an ID not declared on any \`heading.bookmarkId\` in the same document.
- ❌ \`pageNumber\` inline node outside \`header.children\` or \`footer.children\` — it only renders in those contexts.
- ❌ Tables where \`sum(columnWidths) !== width\`, or where row cell count (accounting for \`colspan\`) does not equal the number of columns.
- ❌ \`unsplash:\` with an empty keyword — \`"src": "unsplash:"\` is not valid. Always provide a keyword phrase.
- ❌ Missing \`alt\` text on images.
- ❌ Math notation — this type does not render LaTeX equations (\`$...$\` or \`$$...$$\`). Express calculations in prose.
- ❌ Mermaid or chart fenced blocks — those belong in \`text/markdown\`; this schema has no fenced block node type.
- ❌ Using \`text/document\` for a README, internal note, or developer doc — use \`text/markdown\`.
- ❌ Truncation, \`Lorem ipsum\`, \`[TODO]\`, \`(content omitted)\`, or placeholder markers of any kind.
`,
  examples: [
    {
      label:
        "Business proposal — cover page, TOC, comparison table, footnote, image, anchor",
      code: JSON.stringify(proposalExample, null, 2),
    },
    {
      label:
        "Research report — abstract, codeBlock, horizontal rule, blockquote, image with caption, ordered list of findings",
      code: JSON.stringify(reportExample, null, 2),
    },
    {
      label:
        "Formal letter — letterhead header, right-aligned date, recipient block, signature block, dot-leader tab",
      code: JSON.stringify(letterExample, null, 2),
    },
  ] as { label: string; code: string }[],
}
