import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  TextRun,
  PageOrientation,
  LevelFormat,
  AlignmentType,
  BorderStyle,
  ShadingType,
  UnderlineType,
  ExternalHyperlink,
  InternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  PageBreak,
  TableOfContents,
  Bookmark,
  Header,
  Footer,
  PageNumber,
} from "docx"
import type { DocumentAst } from "./schema"
import type { BlockNode, InlineNode } from "./schema"
import { mermaidToSvg } from "@/lib/rendering/server/mermaid-to-svg"
import { svgToPng } from "@/lib/rendering/server/svg-to-png"
import { resizeSvg } from "@/lib/rendering/resize-svg"
import { chartToSvg } from "@/lib/rendering/chart-to-svg"

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const PAGE_SIZES = {
  letter: { width: 12240, height: 15840 },
  a4:     { width: 11906, height: 16838 },
} as const

// In points; docx uses half-points, so multiply by 2 when passing to run.size
const HEADING_SIZES_PT = [20, 16, 14, 12, 12, 12] as const

const BULLET_CHARS = ["•", "◦", "▪"] as const

const DEFAULT_MARGIN = 1440

// 1x1 transparent PNG — used as fallback when remote fetch fails
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)

// ────────────────────────────────────────────────────────────────────────────
// Render context
// ────────────────────────────────────────────────────────────────────────────

type RenderCtx = {
  nextFootnoteId: number
  footnotes: Record<number, BlockNode[]>
}

function newRenderCtx(): RenderCtx {
  return { nextFootnoteId: 1, footnotes: {} }
}

// ────────────────────────────────────────────────────────────────────────────
// Inline rendering
// ────────────────────────────────────────────────────────────────────────────

function renderInline(node: InlineNode, ctx: RenderCtx): (TextRun | ExternalHyperlink | InternalHyperlink | FootnoteReferenceRun)[] {
  switch (node.type) {
    case "text":
      return [
        new TextRun({
          text: node.text,
          bold: node.bold,
          italics: node.italic,
          underline: node.underline ? {} : undefined,
          strike: node.strike,
          color: node.color?.replace("#", ""),
          superScript: node.superscript,
          subScript: node.subscript,
          font: node.code ? "Consolas" : undefined,
        }),
      ]

    case "lineBreak":
      return [new TextRun({ text: "", break: 1 })]

    case "link":
      return [
        new ExternalHyperlink({
          link: node.href,
          children: node.children.flatMap(c => renderInline(c, ctx)) as TextRun[],
        }),
      ]

    case "anchor":
      return [
        new InternalHyperlink({
          anchor: node.bookmarkId,
          children: node.children.flatMap(c => renderInline(c, ctx)) as TextRun[],
        }),
      ]

    case "footnote": {
      const id = ctx.nextFootnoteId++
      ctx.footnotes[id] = node.children
      return [new FootnoteReferenceRun(id)]
    }

    case "pageNumber":
      return [new TextRun({ children: [PageNumber.CURRENT] as any })]

    case "tab":
      return [new TextRun({ text: "\t" })]

    default:
      // Exhaustive — TypeScript will catch unhandled union members
      return []
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Image fetch helpers
// ────────────────────────────────────────────────────────────────────────────

async function fetchImage(src: string): Promise<{ buf: Buffer; type: "png" | "jpg" | "gif" | "bmp" }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(src, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    const ct = (res.headers.get("content-type") ?? "").toLowerCase()
    // SVG is not reliably supported by docx-js v8 — treat as fallback
    if (ct.includes("svg")) throw new Error("svg not supported")
    const type: "png" | "jpg" | "gif" | "bmp" =
      ct.includes("png") ? "png"
      : ct.includes("jpeg") || ct.includes("jpg") ? "jpg"
      : ct.includes("gif") ? "gif"
      : ct.includes("bmp") ? "bmp"
      : "png"
    return { buf, type }
  } finally {
    clearTimeout(timer)
  }
}

async function renderImage(
  node: Extract<BlockNode, { type: "image" }>,
  _ctx: RenderCtx,
): Promise<Paragraph[]> {
  let imgBuf: Buffer = PLACEHOLDER_PNG
  let imgType: "png" | "jpg" | "gif" | "bmp" = "png"
  try {
    const fetched = await fetchImage(node.src)
    imgBuf = fetched.buf
    imgType = fetched.type
  } catch {
    // swallow — use placeholder
  }
  const imgP = new Paragraph({
    alignment: alignTo(node.align ?? "center"),
    children: [new ImageRun({
      type: imgType,
      data: imgBuf,
      transformation: { width: node.width, height: node.height },
      altText: { title: node.alt, description: node.alt, name: node.alt },
    })],
  })
  if (!node.caption) return [imgP]
  const captionP = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: node.caption, italics: true, size: 18 })],
  })
  return [imgP, captionP]
}

// ────────────────────────────────────────────────────────────────────────────
// Mermaid rendering
// ────────────────────────────────────────────────────────────────────────────

async function renderMermaid(
  node: Extract<BlockNode, { type: "mermaid" }>,
  _ctx: RenderCtx,
): Promise<Paragraph[]> {
  const w = node.width ?? 1200
  const h = node.height ?? 800
  const alt = node.alt ?? node.caption ?? "Diagram"

  try {
    const rawSvg = await mermaidToSvg(node.code)
    const sizedSvg = resizeSvg(rawSvg, w, h)
    const pngBuffer = await svgToPng(sizedSvg, w, h)

    const image = new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data: pngBuffer,
          transformation: { width: w, height: h },
          altText: { title: alt, description: alt, name: alt },
        }),
      ],
    })
    const paragraphs: Paragraph[] = [image]
    if (node.caption) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: node.caption, italics: true, size: 20 })],
        }),
      )
    }
    return paragraphs
  } catch {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: node.caption ?? "[diagram failed to render]", italics: true, color: "AA0000" })],
      }),
    ]
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Chart rendering
// ────────────────────────────────────────────────────────────────────────────

async function renderChart(
  node: Extract<BlockNode, { type: "chart" }>,
  _ctx: RenderCtx,
): Promise<Paragraph[]> {
  const w = node.width ?? 1200
  const h = node.height ?? 600
  const alt = node.alt ?? node.caption ?? "Chart"

  const rawSvg = chartToSvg(node.chart, w, h)
  const sizedSvg = resizeSvg(rawSvg, w, h)
  const pngBuffer = await svgToPng(sizedSvg, w, h)

  const image = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: pngBuffer,
        transformation: { width: w, height: h },
        altText: { title: alt, description: alt, name: alt },
      }),
    ],
  })
  const paragraphs: Paragraph[] = [image]
  if (node.caption) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: node.caption, italics: true, size: 18 })],
      }),
    )
  }
  return paragraphs
}

// ────────────────────────────────────────────────────────────────────────────
// Block rendering
// ────────────────────────────────────────────────────────────────────────────

const HEADING_LEVELS: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

function alignTo(a?: "left" | "center" | "right" | "justify") {
  if (!a) return undefined
  return {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  }[a]
}

async function renderBlocks(blocks: BlockNode[], ctx: RenderCtx): Promise<(Paragraph | Table | TableOfContents)[]> {
  const results = await Promise.all(blocks.map(block => renderBlock(block, ctx)))
  return results.flat()
}

async function renderBlock(node: BlockNode, ctx: RenderCtx): Promise<(Paragraph | Table | TableOfContents)[]> {
  switch (node.type) {
    case "paragraph":
      return [new Paragraph({
        alignment: alignTo(node.align),
        spacing: node.spacing,
        indent: node.indent,
        children: node.children.flatMap(c => renderInline(c, ctx)) as any,
      })]

    case "heading": {
      const inlineChildren = node.children.flatMap(c => renderInline(c, ctx))
      const children = node.bookmarkId
        ? [new Bookmark({ id: node.bookmarkId, children: inlineChildren as any })]
        : inlineChildren
      return [new Paragraph({
        heading: HEADING_LEVELS[node.level],
        children: children as any,
      })]
    }

    case "blockquote": {
      const childResults = await Promise.all(node.children.map(child => {
        if (child.type !== "paragraph") return renderBlock(child, ctx)
        return Promise.resolve([new Paragraph({
          indent: { left: 720 },
          border: { left: { color: "808080", size: 12, space: 6, style: BorderStyle.SINGLE } },
          children: child.children.flatMap(c => renderInline(c, ctx)) as any,
        })])
      }))
      const styled: (Paragraph | Table)[] = childResults.flat()
      if (node.attribution) {
        styled.push(new Paragraph({
          indent: { left: 720 },
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `— ${node.attribution}`, italics: true })],
        }))
      }
      return styled
    }

    case "codeBlock":
      return node.code.split("\n").map(line => new Paragraph({
        shading: { fill: "F3F4F6", type: ShadingType.CLEAR, color: "auto" },
        children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })],
      }))

    case "horizontalRule":
      return [new Paragraph({
        border: { bottom: { color: "808080", size: 6, space: 1, style: BorderStyle.SINGLE } },
        children: [],
      })]

    case "list":
      return renderList(node, 0, ctx)

    case "table":
      return [await renderTable(node, ctx)]

    case "image":
      return renderImage(node, ctx)

    case "mermaid":
      return renderMermaid(node, ctx)

    case "chart":
      return renderChart(node, ctx)

    case "pageBreak":
      return [new Paragraph({ children: [new PageBreak()] })]

    case "toc": {
      const out: (Paragraph | TableOfContents)[] = []
      if (node.title) {
        out.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun(node.title)],
        }))
      }
      out.push(new TableOfContents(node.title ?? "Contents", {
        hyperlink: true,
        headingStyleRange: `1-${node.maxLevel}`,
      }))
      return out as (Paragraph | TableOfContents)[]
    }

    default:
      return [new Paragraph({ children: [new TextRun(`[UNSUPPORTED: ${(node as any).type}]`)] })]
  }
}

// ────────────────────────────────────────────────────────────────────────────
// List rendering
// ────────────────────────────────────────────────────────────────────────────

// Note: startAt is accepted by the schema but DOCX v1 always begins ordered
// lists at 1. Supporting arbitrary startAt would require a per-list numbering
// config. The HTML preview renderer honours startAt via <ol start>.
async function renderList(
  node: Extract<BlockNode, { type: "list" }>,
  level: number,
  ctx: RenderCtx,
): Promise<Paragraph[]> {
  const ref = node.ordered ? "numbers" : "bullets"
  const out: Paragraph[] = []
  for (const item of node.items) {
    const firstBlock = item.children[0]
    const restBlocks = item.children.slice(1)
    if (firstBlock?.type === "paragraph") {
      out.push(new Paragraph({
        numbering: { reference: ref, level },
        children: firstBlock.children.flatMap(c => renderInline(c, ctx)) as any,
      }))
    } else if (firstBlock) {
      // If the first block isn't a paragraph (rare; e.g. a blockquote or codeBlock),
      // render it without list numbering and let indentation carry the visual hint.
      const rendered = await renderBlock(firstBlock, ctx)
      rendered.forEach(p => { if (p instanceof Paragraph) out.push(p) })
    }
    for (const extra of restBlocks) {
      const rendered = await renderBlock(extra, ctx)
      rendered.forEach(p => { if (p instanceof Paragraph) out.push(p) })
    }
    if (item.subList) {
      const sub = await renderList(
        { type: "list", ordered: item.subList.ordered, items: item.subList.items },
        level + 1,
        ctx,
      )
      out.push(...sub)
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Table rendering
// ────────────────────────────────────────────────────────────────────────────

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" }
const ALL_CELL_BORDERS = {
  top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER,
}

async function renderTable(
  node: Extract<BlockNode, { type: "table" }>,
  ctx: RenderCtx,
): Promise<Table> {
  const rows = await Promise.all(node.rows.map(async row => {
    const cells = await Promise.all(row.cells.map(async (cell, i) => {
      const cellChildren = (await Promise.all(cell.children.map(c => renderBlock(c, ctx)))).flat()
      return new TableCell({
        width: { size: node.columnWidths[i] ?? node.columnWidths[node.columnWidths.length - 1] ?? 0, type: WidthType.DXA },
        columnSpan: cell.colspan,
        rowSpan: cell.rowspan,
        shading: cell.shading ? { fill: cell.shading, type: ShadingType.CLEAR, color: "auto" } : undefined,
        borders: ALL_CELL_BORDERS,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign:
          cell.valign === "middle" ? VerticalAlign.CENTER :
          cell.valign === "bottom" ? VerticalAlign.BOTTOM :
          VerticalAlign.TOP,
        children: cellChildren as any,
      })
    }))
    return new TableRow({ tableHeader: row.isHeader, children: cells })
  }))
  return new Table({
    width: { size: node.width, type: WidthType.DXA },
    columnWidths: node.columnWidths,
    rows,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Cover page rendering
// ────────────────────────────────────────────────────────────────────────────

// v1: logoUrl is intentionally skipped to keep cover page synchronous and
// deterministic. The async image render path already supports logos if needed.
function renderCoverPage(cover: NonNullable<DocumentAst["coverPage"]>): Paragraph[] {
  const out: Paragraph[] = []
  // Top padding (~2 inches at 1440 twips/inch)
  out.push(new Paragraph({ spacing: { before: 2880 }, children: [] }))
  // Title
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.title, bold: true, size: 48 })],
  }))
  if (cover.subtitle) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cover.subtitle, size: 28, italics: true })],
    }))
  }
  // Spacer before author/org/date stack
  out.push(new Paragraph({ spacing: { before: 1440 }, children: [] }))
  if (cover.author) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cover.author, size: 24 })],
    }))
  }
  if (cover.organization) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cover.organization, size: 22 })],
    }))
  }
  if (cover.date) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cover.date, size: 22 })],
    }))
  }
  // Page break so body starts on the next page
  out.push(new Paragraph({ children: [new PageBreak()] }))
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function astToDocx(ast: DocumentAst): Promise<Buffer> {
  const { meta } = ast
  const pageSize = PAGE_SIZES[meta.pageSize ?? "letter"]
  const margins = {
    top:    meta.margins?.top    ?? DEFAULT_MARGIN,
    bottom: meta.margins?.bottom ?? DEFAULT_MARGIN,
    left:   meta.margins?.left   ?? DEFAULT_MARGIN,
    right:  meta.margins?.right  ?? DEFAULT_MARGIN,
  }

  const ctx = newRenderCtx()

  const headerObj = ast.header
    ? new Header({ children: (await renderBlocks(ast.header.children, ctx)) as any })
    : undefined
  const footerObj = ast.footer
    ? new Footer({ children: (await renderBlocks(ast.footer.children, ctx)) as any })
    : undefined

  const coverChildren = ast.coverPage ? renderCoverPage(ast.coverPage) : []
  const bodyChildren = await renderBlocks(ast.body, ctx)

  // Collect footnote definitions accumulated during body (and header/footer) rendering.
  const footnoteDefinitions: Record<number, { children: Paragraph[] }> = {}
  const footnoteIds = Object.keys(ctx.footnotes).map(Number)
  for (const id of footnoteIds) {
    const blocks = ctx.footnotes[id]
    const rendered = await renderBlocks(blocks, ctx)
    footnoteDefinitions[id] = {
      children: rendered.filter((r): r is Paragraph => r instanceof Paragraph),
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: meta.font ?? "Arial",
            size: (meta.fontSize ?? 12) * 2, // half-points
          },
        },
      },
      paragraphStyles: buildHeadingStyles(meta.font ?? "Arial"),
    },
    numbering: {
      config: buildNumberingConfig(),
    },
    footnotes: footnoteIds.length ? footnoteDefinitions : undefined,
    sections: [
      {
        properties: {
          page: {
            size: {
              width:       pageSize.width,
              height:      pageSize.height,
              orientation:
                meta.orientation === "landscape"
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: margins,
          },
        },
        headers: headerObj ? { default: headerObj } : undefined,
        footers: footerObj ? { default: footerObj } : undefined,
        children: [...coverChildren, ...bodyChildren] as any,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function buildHeadingStyles(font: string) {
  return HEADING_SIZES_PT.map((sizePt, idx) => {
    const level = idx + 1 // 1–6
    return {
      id: `Heading${level}`,
      name: `heading ${level}`,
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: {
        font,
        size: sizePt * 2, // half-points
        bold: level <= 2,
      },
      paragraph: {
        outlineLevel: idx, // 0-based; required for TOC
        spacing: { before: 240, after: 120 },
      },
    }
  })
}

function buildNumberingConfig() {
  return [
    {
      reference: "bullets",
      levels: BULLET_CHARS.map((char, idx) => ({
        level: idx,
        format: LevelFormat.BULLET,
        text: char,
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 720 * (idx + 1), hanging: 360 },
          },
        },
      })),
    },
    {
      reference: "numbers",
      levels: [0, 1, 2].map((idx) => ({
        level: idx,
        format: LevelFormat.DECIMAL,
        text: `%${idx + 1}.`,
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 720 * (idx + 1), hanging: 360 },
          },
        },
      })),
    },
  ]
}
