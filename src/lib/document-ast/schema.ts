import { z } from "zod"
import { ChartDataSchema } from "@/lib/slides/types.zod"
import type { ChartData } from "@/lib/slides/types"

// ────────────────────────────────────────────────────────────────────────────
// Meta & Cover
// ────────────────────────────────────────────────────────────────────────────

export const DocumentMetaSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subtitle: z.string().max(200).optional(),
  organization: z.string().max(120).optional(),
  documentNumber: z.string().max(80).optional(),
  pageSize: z.enum(["letter", "a4"]).default("letter"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margins: z
    .object({
      top: z.number().int().positive().optional(),
      bottom: z.number().int().positive().optional(),
      left: z.number().int().positive().optional(),
      right: z.number().int().positive().optional(),
    })
    .optional(),
  font: z.string().default("Arial"),
  fontSize: z.number().int().min(8).max(24).default(12),
  showPageNumbers: z.boolean().default(false),
})

export const CoverPageSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  organization: z.string().optional(),
  // intentionally NOT z.string().url() — "unsplash:keyword" is valid
  logoUrl: z.string().optional(),
})

// ────────────────────────────────────────────────────────────────────────────
// Forward declarations — break circular refs with explicit ZodType annotations
// ────────────────────────────────────────────────────────────────────────────

export type InlineNode =
  | {
      type: "text"
      text: string
      bold?: boolean
      italic?: boolean
      underline?: boolean
      strike?: boolean
      code?: boolean
      superscript?: boolean
      subscript?: boolean
      color?: string
    }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "anchor"; bookmarkId: string; children: InlineNode[] }
  | { type: "footnote"; children: BlockNode[] }
  | { type: "lineBreak" }
  | { type: "pageNumber" }
  | { type: "tab"; leader?: "none" | "dot" }

export type BlockNode =
  | {
      type: "paragraph"
      children: InlineNode[]
      align?: "left" | "center" | "right" | "justify"
      spacing?: { before?: number; after?: number }
      indent?: { left?: number; hanging?: number; firstLine?: number }
    }
  | {
      type: "heading"
      level: 1 | 2 | 3 | 4 | 5 | 6
      children: InlineNode[]
      bookmarkId?: string
    }
  | { type: "list"; ordered: boolean; startAt?: number; items: ListItem[] }
  | {
      type: "table"
      columnWidths: number[]
      width: number
      rows: TableRow[]
      shading?: "striped" | "none"
    }
  | {
      type: "image"
      src: string
      alt: string
      width: number
      height: number
      caption?: string
      align?: "left" | "center" | "right"
    }
  | { type: "blockquote"; children: BlockNode[]; attribution?: string }
  | { type: "codeBlock"; language: string; code: string }
  | { type: "horizontalRule" }
  | { type: "pageBreak" }
  | { type: "toc"; maxLevel: 1 | 2 | 3 | 4 | 5 | 6; title?: string }
  | {
      type: "mermaid"
      code: string
      caption?: string
      width?: number
      height?: number
      alt?: string
    }
  | {
      type: "chart"
      chart: ChartData
      caption?: string
      width?: number
      height?: number
      alt?: string
    }

export type ListItem = {
  children: BlockNode[]
  subList?: { ordered: boolean; items: ListItem[] }
}

export type TableRow = {
  isHeader?: boolean
  cells: TableCell[]
}

export type TableCell = {
  children: BlockNode[]
  colspan?: number
  rowspan?: number
  shading?: string
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
}

// ────────────────────────────────────────────────────────────────────────────
// Inline node schema (lazy for circular refs)
// ────────────────────────────────────────────────────────────────────────────

export const InlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    // text
    z.object({
      type: z.literal("text"),
      text: z.string(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.boolean().optional(),
      strike: z.boolean().optional(),
      code: z.boolean().optional(),
      superscript: z.boolean().optional(),
      subscript: z.boolean().optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    }),
    // link
    z.object({
      type: z.literal("link"),
      href: z.string().url(),
      children: z.array(InlineNodeSchema).min(1),
    }),
    // anchor
    z.object({
      type: z.literal("anchor"),
      bookmarkId: z.string().min(1),
      children: z.array(InlineNodeSchema).min(1),
    }),
    // footnote — children are BlockNodes (explicitly deferred for safe cross-ref)
    z.object({
      type: z.literal("footnote"),
      children: z.lazy(() => z.array(BlockNodeSchema).min(1)),
    }),
    // lineBreak
    z.object({ type: z.literal("lineBreak") }),
    // pageNumber
    z.object({ type: z.literal("pageNumber") }),
    // tab
    z.object({
      type: z.literal("tab"),
      leader: z.enum(["none", "dot"]).optional(),
    }),
  ])
)

// ────────────────────────────────────────────────────────────────────────────
// Block node schema (lazy for circular refs)
// ────────────────────────────────────────────────────────────────────────────

// Sub-schemas that reference BlockNodeSchema lazily
const ListItemSchema: z.ZodType<ListItem> = z.lazy(() =>
  z.object({
    children: z.array(BlockNodeSchema).min(1),
    subList: z
      .object({
        ordered: z.boolean(),
        items: z.array(ListItemSchema).min(1),
      })
      .optional(),
  })
)

const TableCellSchema: z.ZodType<TableCell> = z.lazy(() =>
  z.object({
    children: z.array(BlockNodeSchema).min(1),
    colspan: z.number().int().optional(),
    rowspan: z.number().int().optional(),
    shading: z.string().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    valign: z.enum(["top", "middle", "bottom"]).optional(),
  })
)

const TableRowSchema: z.ZodType<TableRow> = z.lazy(() =>
  z.object({
    isHeader: z.boolean().optional(),
    cells: z.array(TableCellSchema).min(1),
  })
)

export const BlockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    // paragraph
    z.object({
      type: z.literal("paragraph"),
      children: z.array(InlineNodeSchema).min(1),
      align: z.enum(["left", "center", "right", "justify"]).optional(),
      spacing: z
        .object({
          before: z.number().optional(),
          after: z.number().optional(),
        })
        .optional(),
      indent: z
        .object({
          left: z.number().optional(),
          hanging: z.number().optional(),
          firstLine: z.number().optional(),
        })
        .optional(),
    }),
    // heading
    z.object({
      type: z.literal("heading"),
      level: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ]),
      children: z.array(InlineNodeSchema).min(1),
      bookmarkId: z.string().optional(),
    }),
    // list
    z.object({
      type: z.literal("list"),
      ordered: z.boolean(),
      startAt: z.number().int().optional(),
      items: z.array(ListItemSchema).min(1),
    }),
    // table
    z.object({
      type: z.literal("table"),
      columnWidths: z.array(z.number().int()).min(1),
      width: z.number().int(),
      rows: z.array(TableRowSchema).min(1),
      shading: z.enum(["striped", "none"]).optional(),
    }),
    // image — src intentionally NOT url() to allow "unsplash:keyword"
    z.object({
      type: z.literal("image"),
      src: z.string(),
      alt: z.string().min(1),
      width: z.number().int(),
      height: z.number().int(),
      caption: z.string().optional(),
      align: z.enum(["left", "center", "right"]).optional(),
    }),
    // blockquote
    z.object({
      type: z.literal("blockquote"),
      children: z.array(BlockNodeSchema).min(1),
      attribution: z.string().optional(),
    }),
    // codeBlock
    z.object({
      type: z.literal("codeBlock"),
      language: z.string(),
      code: z.string(),
    }),
    // horizontalRule
    z.object({ type: z.literal("horizontalRule") }),
    // pageBreak
    z.object({ type: z.literal("pageBreak") }),
    // toc
    z.object({
      type: z.literal("toc"),
      maxLevel: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ]),
      title: z.string().optional(),
    }),
    // mermaid
    z.object({
      type: z.literal("mermaid"),
      code: z.string().min(1).max(10_000),
      caption: z.string().max(200).optional(),
      width: z.number().int().positive().min(200).max(1600).optional().default(1200),
      height: z.number().int().positive().min(150).max(1200).optional().default(800),
      alt: z.string().max(500).optional(),
    }),
    // chart
    z.object({
      type: z.literal("chart"),
      chart: ChartDataSchema,
      caption: z.string().max(200).optional(),
      width: z.number().int().positive().min(200).max(1600).optional().default(1200),
      height: z.number().int().positive().min(150).max(1200).optional().default(600),
      alt: z.string().max(500).optional(),
    }),
  ])
)

// ────────────────────────────────────────────────────────────────────────────
// Root document schema
// ────────────────────────────────────────────────────────────────────────────

export const DocumentAstSchema = z.object({
  meta: DocumentMetaSchema,
  coverPage: CoverPageSchema.optional(),
  header: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  footer: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  body: z.array(BlockNodeSchema).min(1),
})

// ────────────────────────────────────────────────────────────────────────────
// Exported TS types
// ────────────────────────────────────────────────────────────────────────────

// Hand-written to make Zod-defaulted fields optional (defaults apply at parse time).
export type DocumentMeta = {
  title: string
  author?: string
  date?: string
  subtitle?: string
  organization?: string
  documentNumber?: string
  pageSize?: "letter" | "a4"
  orientation?: "portrait" | "landscape"
  margins?: {
    top?: number
    bottom?: number
    left?: number
    right?: number
  }
  font?: string
  fontSize?: number
  showPageNumbers?: boolean
}
export type CoverPage = z.infer<typeof CoverPageSchema>
export type DocumentAst = {
  meta: DocumentMeta
  coverPage?: CoverPage
  header?: { children: BlockNode[] }
  footer?: { children: BlockNode[] }
  body: BlockNode[]
}
