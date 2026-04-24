import {
  DocumentAstSchema,
  type DocumentAst,
  type BlockNode,
  type InlineNode,
  type ListItem,
} from "@/lib/document-ast/schema"

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type ValidateOk = { ok: true; ast: DocumentAst }
export type ValidateErr = { ok: false; error: string }
export type ValidateResult = ValidateOk | ValidateErr

const SIZE_BUDGET = 128 * 1024 // 128 KB

const MERMAID_DIAGRAM_TYPES = [
  "flowchart", "graph", "sequenceDiagram", "classDiagram",
  "stateDiagram", "stateDiagram-v2", "erDiagram", "gantt",
  "pie", "mindmap", "timeline", "journey", "c4Context",
  "gitGraph", "quadrantChart", "requirementDiagram",
] as const

function validateMermaidNode(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) return "mermaid block has empty code"
  const firstLine = trimmed.split("\n", 1)[0].trim()
  const firstToken = firstLine.split(/\s+/, 1)[0]
  if (!MERMAID_DIAGRAM_TYPES.includes(firstToken as (typeof MERMAID_DIAGRAM_TYPES)[number])) {
    return `mermaid block: unknown diagram type "${firstToken}" (expected one of ${MERMAID_DIAGRAM_TYPES.join(", ")})`
  }
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// Tree walker
// ────────────────────────────────────────────────────────────────────────────

type Scope = "body" | "header" | "footer"

type Visit =
  | { kind: "block"; node: BlockNode; scope: Scope }
  | { kind: "inline"; node: InlineNode; scope: Scope }

function walkInlines(nodes: InlineNode[], scope: Scope, visit: (v: Visit) => void): void {
  for (const node of nodes) {
    visit({ kind: "inline", node, scope })
    if (node.type === "link" || node.type === "anchor") {
      walkInlines(node.children, scope, visit)
    } else if (node.type === "footnote") {
      walkBlocks(node.children, scope, visit)
    }
  }
}

function walkListItems(items: ListItem[], scope: Scope, visit: (v: Visit) => void): void {
  for (const item of items) {
    walkBlocks(item.children, scope, visit)
    if (item.subList) {
      walkListItems(item.subList.items, scope, visit)
    }
  }
}

function walkBlocks(nodes: BlockNode[], scope: Scope, visit: (v: Visit) => void): void {
  for (const node of nodes) {
    visit({ kind: "block", node, scope })
    switch (node.type) {
      case "paragraph":
        walkInlines(node.children, scope, visit)
        break
      case "heading":
        walkInlines(node.children, scope, visit)
        break
      case "list":
        walkListItems(node.items, scope, visit)
        break
      case "table":
        for (const row of node.rows) {
          for (const cell of row.cells) {
            walkBlocks(cell.children, scope, visit)
          }
        }
        break
      case "blockquote":
        walkBlocks(node.children, scope, visit)
        break
      default:
        // codeBlock, horizontalRule, pageBreak, toc, image — no children to recurse
        break
    }
  }
}

function walk(ast: DocumentAst, visit: (v: Visit) => void): void {
  if (ast.header) {
    walkBlocks(ast.header.children, "header", visit)
  }
  if (ast.footer) {
    walkBlocks(ast.footer.children, "footer", visit)
  }
  walkBlocks(ast.body, "body", visit)
}

// ────────────────────────────────────────────────────────────────────────────
// Semantic checks
// ────────────────────────────────────────────────────────────────────────────

class _SemanticAbort extends Error { constructor(public reason: string) { super(reason) } }

function semanticCheck(ast: DocumentAst): string | null {
  // 1. Collect all bookmark IDs from headings
  const bookmarkIds = new Set<string>()
  walk(ast, (v) => {
    if (v.kind === "block" && v.node.type === "heading" && v.node.bookmarkId) {
      bookmarkIds.add(v.node.bookmarkId)
    }
  })

  // 2. Run checks in a single pass — throw _SemanticAbort to short-circuit
  try {
    walk(ast, (v) => {
      if (v.kind === "inline") {
        const node = v.node

        // Anchor cross-ref check
        if (node.type === "anchor") {
          if (!bookmarkIds.has(node.bookmarkId)) {
            throw new _SemanticAbort(`anchor references unknown bookmark "${node.bookmarkId}" — no heading has that bookmarkId`)
          }
        }

        // pageNumber scope check
        if (node.type === "pageNumber" && v.scope === "body") {
          throw new _SemanticAbort(`pageNumber inline is not allowed in body — only permitted inside header or footer`)
        }
      }

      if (v.kind === "block" && v.node.type === "table") {
        const table = v.node

        // columnWidths must sum to width
        const widthSum = table.columnWidths.reduce((acc, w) => acc + w, 0)
        if (widthSum !== table.width) {
          throw new _SemanticAbort(`table columnWidths sum (${widthSum}) does not equal table width (${table.width})`)
        }

        // Each row's cells (accounting for colspan) must equal columnWidths.length
        for (const row of table.rows) {
          const colCount = row.cells.reduce((acc, cell) => acc + (cell.colspan ?? 1), 0)
          if (colCount !== table.columnWidths.length) {
            throw new _SemanticAbort(`table row has ${colCount} column span(s) but columnWidths declares ${table.columnWidths.length} columns`)
          }
        }
      }

      if (v.kind === "block" && v.node.type === "image") {
        const img = v.node
        if (img.src.startsWith("unsplash:")) {
          const keyword = img.src.slice("unsplash:".length).trim()
          if (!keyword) {
            throw new _SemanticAbort(`unsplash image src must include a non-empty keyword after "unsplash:"`)
          }
        }
      }

      if (v.kind === "block" && v.node.type === "mermaid") {
        const err = validateMermaidNode(v.node.code)
        if (err) throw new _SemanticAbort(err)
      }
    })
  } catch (e) {
    if (e instanceof _SemanticAbort) return e.reason
    throw e
  }

  return null
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export function validateDocumentAst(raw: unknown): ValidateResult {
  // Step 1: size budget check (cheap — before schema parse)
  const serialized = JSON.stringify(raw)
  const byteLen = Buffer.byteLength(serialized, "utf8")
  if (byteLen > SIZE_BUDGET) {
    return { ok: false, error: `AST size ${byteLen} bytes exceeds 128KB budget` }
  }

  // Step 2: schema validation
  const parsed = DocumentAstSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".")
        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join("; ")
    return { ok: false, error: msg }
  }

  // Step 3: semantic checks
  const semErr = semanticCheck(parsed.data)
  if (semErr) {
    return { ok: false, error: semErr }
  }

  return { ok: true, ast: parsed.data }
}
