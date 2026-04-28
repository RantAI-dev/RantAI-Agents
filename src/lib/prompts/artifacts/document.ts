const scriptSummary =
  "Formal deliverables (proposals, reports, book chapters, letters, white papers) authored as a docx-js JavaScript script — server runs the script in a sandbox, renders preview via LibreOffice, downloads as .docx."

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
  summary: scriptSummary,
  rules: scriptRules,
  examples: [] as { label: string; code: string }[],
}
