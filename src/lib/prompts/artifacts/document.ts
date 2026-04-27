import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

// Default: script. Set ARTIFACT_DOC_FORMAT_DEFAULT=ast to fall back to legacy.
const DOC_FORMAT = process.env.ARTIFACT_DOC_FORMAT_DEFAULT === "ast" ? "ast" : "script"

const astSummary =
  "Formal deliverables (proposals, reports, book chapters, letters, white papers) authored as a structured JSON document tree — renders as an A4 preview and exports to .docx with native Word styling, tables, images, TOC, footnotes, and headers/footers."

const scriptSummary =
  "Formal deliverables (proposals, reports, book chapters, letters, white papers) authored as a docx-js JavaScript script — server runs the script in a sandbox, renders preview via LibreOffice, downloads as .docx."

const astRules = `**text/document — Formal Deliverables**

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

### \`mermaid\` block

Use for flowcharts, sequence, class, state, ER, pie, gantt, mindmap, timeline, and similar schematic diagrams. Embed \`mermaid\` blocks directly in the document — they render as PNG in the docx export and as inline SVG in the preview.

\`\`\`ts
{ type: "mermaid", code: string, caption?: string, width?: 200..1600, height?: 150..1200, alt?: string }
\`\`\`

- \`code\`: valid Mermaid syntax. First non-empty token MUST be one of \`flowchart\`, \`graph\`, \`sequenceDiagram\`, \`classDiagram\`, \`stateDiagram\`, \`stateDiagram-v2\`, \`erDiagram\`, \`gantt\`, \`pie\`, \`mindmap\`, \`timeline\`, \`journey\`, \`c4Context\`, \`gitGraph\`, \`quadrantChart\`, or \`requirementDiagram\`.
- Keep diagrams simple — ≤ 15 nodes for flowcharts; ≤ 10 for split-layout contexts.
- NEVER wrap \`code\` in markdown fences (no \`\`\`mermaid). The \`code\` field IS raw mermaid syntax.
- \`width\`/\`height\` default to 1200×800.

### \`chart\` block

Use for data visualizations (bar, bar-horizontal, line, pie, donut). The \`chart\` field follows the same \`ChartData\` schema used by \`application/slides\`.

\`\`\`ts
{ type: "chart", chart: ChartData, caption?: string, width?: 200..1600, height?: 150..1200, alt?: string }
\`\`\`

- \`ChartData\`: \`{ type, title?, data?: [{label, value, color?}], labels?: string[], series?: [{name, values[], color?}], showValues?, showLegend? }\`
- \`width\`/\`height\` default to 1200×600.

Prefer \`mermaid\` for qualitative structure (flows, relations), \`chart\` for quantitative data (numbers, categories). Don't stuff prose into diagrams.

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
- ❌ Using \`text/document\` for a README, internal note, or developer doc — use \`text/markdown\`.
- ❌ Truncation, \`Lorem ipsum\`, \`[TODO]\`, \`(content omitted)\`, or placeholder markers of any kind.
`

const scriptRules = `**text/document — Formal Deliverables (docx-js Script)**

You are generating a formal document that someone will print, sign, send, archive, or submit. The reader is a client, executive, editor, regulator, or counterpart — not a developer scanning a README. Pick this type when the output is a **deliverable**: a proposal, an executive report, a book chapter, an official letter, a tender response, a legal memo, a research paper, or a white paper.

## Output Format — JavaScript Script ONLY

Output **a single JavaScript program** that uses the \`docx-js\` library to build a \`Document\` and writes its bytes (base64-encoded) to stdout. Nothing else.

- **NO JSON.** Do not output a JSON object, an AST tree, or any structured data — only executable JavaScript.
- **NO markdown fences.** Do not wrap the script in \`\`\`js, \`\`\`javascript, or any other fence.
- **NO commentary.** No "Here is your document", no preamble, no trailing prose, no explanation outside the script.
- **The entire response must be runnable as-is by Node.js after the sandbox installs \`docx\`.**
- **The script MUST end with this exact line** so the sandbox can capture output:

\`\`\`js
Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
\`\`\`

Any text before \`import\` / \`const\` declarations or after that final \`Packer.toBuffer\` line will break the renderer.

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

## Imports

Use ES-module import syntax against the \`docx\` package. The sandbox provides only this module. Allowed named exports:

\`\`\`js
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  ExternalHyperlink, InternalHyperlink, Bookmark, FootnoteReferenceRun,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo,
  PositionalTabLeader, TabStopType, TabStopPosition, Column, SectionType,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, Packer
} from "docx"
\`\`\`

Do not import any other module. No \`fs\`, no \`path\`, no \`require\`, no network. The sandbox blocks them.

## Page Size — Always Explicit

\`docx-js\` defaults to A4. **Always set US Letter explicitly** (12240 × 15840 DXA) with 1-inch margins (1440 DXA on every side):

\`\`\`js
sections: [{
  properties: {
    page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    },
  },
  children: [/* content */],
}]
\`\`\`

DXA units (1440 DXA = 1 inch):

| Paper | Width | Height | Content width (1" margins) |
|---|---|---|---|
| US Letter | 12240 | 15840 | 9360 |
| A4 | 11906 | 16838 | 9026 |

For landscape, pass portrait dimensions and let \`docx-js\` swap them: \`size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }\`.

## Styles — Override Built-in Headings

Use \`Arial\` as the default font (universally supported). Override built-in heading IDs **with the exact strings** \`"Heading1"\`, \`"Heading2"\`, etc. Include \`outlineLevel\` (0 for H1, 1 for H2, …) — **required for the TOC to pick the heading up**.

\`\`\`js
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 160, after: 160 }, outlineLevel: 2 } },
    ],
  },
  sections: [/* … */],
})
\`\`\`

Apply with \`new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Title")] })\`.

## Tables — Always DXA, Always Dual Widths

- **Always \`WidthType.DXA\`.** Never \`WidthType.PERCENTAGE\` — it breaks Google Docs.
- **Set both widths.** Table \`width\` AND each cell \`width\`. The table's \`columnWidths\` array must sum to the table \`width\`; each cell \`width\` must match its column.
- **Use \`ShadingType.CLEAR\`.** Never \`ShadingType.SOLID\` — it produces black backgrounds in Word.
- **Add cell margins** for readable padding: \`margins: { top: 80, bottom: 80, left: 120, right: 120 }\` (these are internal padding, they do not add to cell width).
- **Don't use tables as dividers/rules.** Use \`border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } }\` on a \`Paragraph\` instead.

\`\`\`js
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }
const borders = { top: border, bottom: border, left: border, right: border }

new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680],
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("Cell")] })],
        }),
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("Cell")] })],
        }),
      ],
    }),
  ],
})
\`\`\`

For US Letter with 1-inch margins, the content width is **9360 DXA**. Common splits:
- 2 equal columns: \`[4680, 4680]\`
- 3 equal columns: \`[3120, 3120, 3120]\`
- Label + content: \`[2340, 7020]\` (25% / 75%)

## Lists — Numbering Config Only

**Never insert unicode bullet characters** (\`•\`, \`\\u2022\`, \`-\`, \`*\`) directly into TextRuns. Define a \`numbering\` config on the \`Document\` and reference it from each Paragraph.

\`\`\`js
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    children: [
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun("Bullet item")] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun("Numbered item")] }),
    ],
  }],
})
\`\`\`

Each \`reference\` numbers independently. Same reference continues (1, 2, 3 → 4, 5, 6). Different reference restarts.

## Images — \`type\` and Full \`altText\` Required

\`ImageRun\` requires \`type\` and an \`altText\` object with all three keys: \`title\`, \`description\`, \`name\`.

\`\`\`js
new Paragraph({
  children: [new ImageRun({
    type: "png", // required: "png" | "jpg" | "gif" | "bmp"
    data: imageBytes, // Buffer or Uint8Array provided to the script via inputs
    transformation: { width: 200, height: 150 },
    altText: { title: "Chart", description: "Quarterly revenue chart", name: "revenue-chart" },
  })],
})
\`\`\`

The sandbox does not perform network or filesystem reads, so image bytes must be supplied as input bindings, not fetched at runtime.

## Page Breaks — Always Inside a Paragraph

Wrap \`new PageBreak()\` inside a \`Paragraph\`. A standalone \`PageBreak()\` produces invalid XML.

\`\`\`js
new Paragraph({ children: [new PageBreak()] })
// or
new Paragraph({ pageBreakBefore: true, children: [new TextRun("New page")] })
\`\`\`

## Hyperlinks — External and Internal

Use \`ExternalHyperlink\` for URLs and \`InternalHyperlink\` + \`Bookmark\` for in-document jumps.

\`\`\`js
new Paragraph({
  children: [new ExternalHyperlink({
    children: [new TextRun({ text: "Click here", style: "Hyperlink" })],
    link: "https://example.com",
  })],
})

new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
  new Bookmark({ id: "chapter1", children: [new TextRun("Chapter 1")] }),
]})
new Paragraph({ children: [new InternalHyperlink({
  children: [new TextRun({ text: "See Chapter 1", style: "Hyperlink" })],
  anchor: "chapter1",
})]})
\`\`\`

## Footnotes — \`footnotes\` Map + \`FootnoteReferenceRun\`

The \`Document\` constructor accepts a top-level \`footnotes: { [id]: { children: [Paragraph(...)] } }\` map. Reference each one inline with \`new FootnoteReferenceRun(id)\`.

\`\`\`js
const doc = new Document({
  footnotes: {
    1: { children: [new Paragraph("Source: Annual Report 2024")] },
    2: { children: [new Paragraph("See appendix for methodology")] },
  },
  sections: [{ children: [new Paragraph({ children: [
    new TextRun("Revenue grew 15%"),
    new FootnoteReferenceRun(1),
    new TextRun(" using adjusted metrics"),
    new FootnoteReferenceRun(2),
  ] })] }],
})
\`\`\`

## Tab Stops + Dot Leaders

Use Paragraph \`tabStops\` for right-aligned dates opposite a heading, and \`PositionalTab\` with \`PositionalTabLeader.DOT\` for TOC-style dotted lines.

\`\`\`js
// Right-aligned date opposite a title
new Paragraph({
  children: [new TextRun("Company Name"), new TextRun("\\tJanuary 2025")],
  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
})

// Dot leader
new Paragraph({
  children: [
    new TextRun("Introduction"),
    new TextRun({ children: [
      new PositionalTab({
        alignment: PositionalTabAlignment.RIGHT,
        relativeTo: PositionalTabRelativeTo.MARGIN,
        leader: PositionalTabLeader.DOT,
      }),
      "3",
    ]}),
  ],
})
\`\`\`

## Multi-Column Layout

Set \`column\` on the section's \`properties\`. \`equalWidth: true\` is the simplest case.

\`\`\`js
sections: [{
  properties: {
    page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    column: { count: 2, space: 720, equalWidth: true, separate: true },
  },
  children: [/* content flows naturally across columns */],
}]
\`\`\`

Force a column break by starting a new section with \`type: SectionType.NEXT_COLUMN\`.

## Headers, Footers, and Page Numbers

\`\`\`js
sections: [{
  properties: {
    page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  },
  headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun("Header")] })] }) },
  footers: { default: new Footer({ children: [new Paragraph({
    children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })],
  })] }) },
  children: [/* content */],
}]
\`\`\`

## Table of Contents

**Do NOT use \`new TableOfContents(...)\`.** That constructor emits a Word field that only Microsoft Word fills in dynamically. Our preview pipeline converts the .docx through LibreOffice to PDF, and LibreOffice does NOT auto-update fields during export, so the TOC shows up empty (or as the literal placeholder text "Right-click to update field"). The same is true for the user's downloaded .docx the first time they open it before clicking F9.

**Build the TOC manually instead** — iterate the document's headings as you compose them and emit one \`Paragraph\` per entry with a tab-leader to the page placeholder. Page numbers can't be known at script-write time (they depend on layout), so use a hyperlink to the bookmark and let the dot leader carry the eye:

\`\`\`js
import {
  Document, Paragraph, TextRun, HeadingLevel, Bookmark, InternalHyperlink, Packer,
  TabStopType, TabStopPosition, PositionalTab, PositionalTabAlignment,
  PositionalTabRelativeTo, PositionalTabLeader,
} from "docx"

// Helper that renders one TOC row: clickable title on the left, dot
// leader, page-number bookmark target on the right.
function tocRow(text, anchor, level) {
  return new Paragraph({
    indent: { left: (level - 1) * 360 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new InternalHyperlink({
        anchor,
        children: [new TextRun({ text, style: "Hyperlink" })],
      }),
      new TextRun({
        children: [
          new PositionalTab({
            alignment: PositionalTabAlignment.RIGHT,
            relativeTo: PositionalTabRelativeTo.MARGIN,
            leader: PositionalTabLeader.DOT,
          }),
        ],
      }),
    ],
  })
}

// In the body, prepend the TOC, then emit headings with matching bookmarks.
const body = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table of Contents")] }),
  tocRow("1. Executive Summary",     "h-exec",      1),
  tocRow("2. Background",            "h-bg",        1),
  tocRow("   2.1 Current State",     "h-bg-current", 2),
  tocRow("3. Proposed Solution",     "h-prop",      1),
  new Paragraph({ children: [new PageBreak()] }),

  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new Bookmark({ id: "h-exec", children: [new TextRun("1. Executive Summary")] })],
  }),
  // …prose paragraphs…

  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new Bookmark({ id: "h-bg", children: [new TextRun("2. Background")] })],
  }),
  // …
]
\`\`\`

This renders correctly in the LibreOffice → PDF preview AND in Word (no F9-refresh required), AND the entries are clickable in both. The trade-off is that we can't show the actual page number — but the dot leader visually carries that role and the document still scans like a real TOC.

## Content Quality

- **Substantive prose.** Every paragraph must add real information. If a section reads like filler, cut it.
- **Specifics over vagueness.** Use numbers, names, dates, versions, currency amounts. Write "reduces p95 latency from 420 ms to 110 ms" not "improves performance significantly."
- **No placeholders.** Never write \`Lorem ipsum\`, \`[TODO]\`, \`[Add company name]\`, \`...\`, \`(content omitted)\`, or "and so on." Invent a plausible value clearly marked as fictional ("PT Contoh") and keep it consistent.
- **Minimum length** for proposals, reports, book chapters: ~400 words of actual prose.
- **Complete documents only.** Do not truncate. Do not write "the rest is left as an exercise for the reader."
- **Close the document.** Proposals end with a Call to Action. Reports end with a Conclusion. Letters end with a signature block.

## Anti-Patterns

- ❌ Output a JSON object instead of a script.
- ❌ Wrap the script in \`\`\`js / \`\`\`javascript / \`\`\`. The output starts with \`import\` and ends with \`Packer.toBuffer(...)\`.
- ❌ Output anything before the first \`import\` line or after the closing \`Packer.toBuffer\` line.
- ❌ \`require()\` or imports from anything other than \`"docx"\`. The sandbox blocks \`fs\`, \`path\`, \`http\`, \`child_process\`, etc.
- ❌ Inserting \`•\` or \`\\u2022\` directly into a TextRun for bullets — use \`LevelFormat.BULLET\` numbering.
- ❌ \`WidthType.PERCENTAGE\` on tables — use \`WidthType.DXA\`.
- ❌ \`ShadingType.SOLID\` on cells — use \`ShadingType.CLEAR\`.
- ❌ A standalone \`new PageBreak()\` outside a Paragraph.
- ❌ \`new ImageRun({ data })\` without \`type\` or without all three \`altText\` keys.
- ❌ Skipping the explicit page size (defaults to A4 in docx-js).
- ❌ Custom paragraph style on headings that should appear in the TOC — use \`HeadingLevel\` only and rely on the \`Heading1\`/\`Heading2\` style overrides.
- ❌ Truncation, \`Lorem ipsum\`, \`[TODO]\`, \`(content omitted)\`, or placeholder markers of any kind.

## Worked Example — Hello World

A minimal valid script. US Letter, overridden Heading1, one paragraph, ends with the required \`Packer.toBuffer\` call.

\`\`\`js
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx"

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Hello, World")] }),
      new Paragraph({ children: [new TextRun("This is a one-page docx generated by a docx-js script.")] }),
    ],
  }],
})

Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
\`\`\`
`

export const documentArtifact = {
  type: "text/document" as const,
  label: "Document",
  summary: DOC_FORMAT === "script" ? scriptSummary : astSummary,
  rules: DOC_FORMAT === "script" ? scriptRules : astRules,
  examples: (DOC_FORMAT === "script"
    ? []
    : [
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
      ]) as { label: string; code: string }[],
}
