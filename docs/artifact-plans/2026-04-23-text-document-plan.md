# `text/document` Artifact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `text/document` artifact as an AST-driven pipeline that produces live A4 previews and high-fidelity `.docx` exports matching or exceeding Claude.ai's `docx` skill output.

**Architecture:** LLM emits a typed JSON `DocumentAst` → Zod-validated → persisted. Preview = React tree-walker with A4 chrome. Export = `docx-js` call tree in a Node API route. Single source of truth, no sandbox, no code execution.

**Tech Stack:** TypeScript, Next.js App Router (Node runtime), Zod, React 18, `docx@^8`, Vitest, bun (package manager), Tailwind CSS.

**Design spec:** [2026-04-23-text-document-design.md](./2026-04-23-text-document-design.md)

---

## Conventions for every task

- **Package manager:** always `bun` / `bunx`, never npm.
- **Test runner:** `bunx vitest run <path>` for a single file. `bun test` (== `vitest run`) for the full suite.
- **Import alias:** `@/` → `src/`.
- **Commits:** end every task with a single focused commit. Message style matches recent history (`feat(artifacts):`, `test(artifacts):`, etc.).
- **TDD:** for every new function, write the test first, run it to confirm failure, then implement.

---

## Task 1: Re-add the `docx` package

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (regenerated)

- [ ] **Step 1: Install the package**

Run: `bun add docx@^8.5.0`
Expected: `package.json` picks up `"docx": "^8.5.0"`, `bun.lock` updated, no peer warnings.

- [ ] **Step 2: Confirm it imports cleanly**

Create temporary probe `/tmp/docx-probe.ts`:

```ts
import { Document, Packer, Paragraph, TextRun } from "docx"
const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hi")] })] }] })
Packer.toBuffer(doc).then(b => console.log("buf bytes:", b.length))
```

Run: `bunx tsx /tmp/docx-probe.ts`
Expected: prints `buf bytes: <number>` > 1000. Delete the probe after.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(deps): re-add docx@^8 for text/document export"
```

---

## Task 2: Create the `DocumentAst` Zod schema

**Files:**
- Create: `src/lib/document-ast/schema.ts`
- Create: `tests/unit/document-ast/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/document-ast/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { DocumentAstSchema } from "@/lib/document-ast/schema"

describe("DocumentAstSchema", () => {
  it("accepts the minimal valid document", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [
        { type: "paragraph", children: [{ type: "text", text: "Hello" }] },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty body", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects paragraph with no children", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi" },
      body: [{ type: "paragraph", children: [] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects bad ISO date", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "Hi", date: "2026/04/23" },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a nested heading + list + table", () => {
    const result = DocumentAstSchema.safeParse({
      meta: { title: "T" },
      body: [
        { type: "heading", level: 1, children: [{ type: "text", text: "H1" }] },
        {
          type: "list",
          ordered: false,
          items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "a" }] }] },
          ],
        },
        {
          type: "table",
          width: 9360,
          columnWidths: [4680, 4680],
          rows: [
            {
              isHeader: true,
              cells: [
                { children: [{ type: "paragraph", children: [{ type: "text", text: "A" }] }] },
                { children: [{ type: "paragraph", children: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bunx vitest run tests/unit/document-ast/schema.test.ts`
Expected: FAIL — cannot find module `@/lib/document-ast/schema`.

- [ ] **Step 3: Create the schema**

Create `src/lib/document-ast/schema.ts` with the full schema defined in §5 of the design spec. Key shapes:

```ts
import { z } from "zod"

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const PositiveInt = z.number().int().positive()

export const DocumentMetaSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(120).optional(),
  date: IsoDate.optional(),
  subtitle: z.string().max(200).optional(),
  organization: z.string().max(120).optional(),
  documentNumber: z.string().max(80).optional(),
  pageSize: z.enum(["letter", "a4"]).default("letter"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margins: z
    .object({
      top: PositiveInt.optional(),
      bottom: PositiveInt.optional(),
      left: PositiveInt.optional(),
      right: PositiveInt.optional(),
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
  date: IsoDate.optional(),
  organization: z.string().optional(),
  logoUrl: z.string().optional(),
})

const InlineTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  color: HexColor.optional(),
  superscript: z.boolean().optional(),
  subscript: z.boolean().optional(),
})

// Use z.lazy for recursive inline / block shapes.
export const InlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    InlineTextSchema,
    z.object({ type: z.literal("link"), href: z.string().url(), children: z.array(InlineNodeSchema).min(1) }),
    z.object({ type: z.literal("anchor"), bookmarkId: z.string().min(1), children: z.array(InlineNodeSchema).min(1) }),
    z.object({ type: z.literal("footnote"), children: z.array(BlockNodeSchema).min(1) }),
    z.object({ type: z.literal("lineBreak") }),
    z.object({ type: z.literal("pageNumber") }),
    z.object({ type: z.literal("tab"), leader: z.enum(["none", "dot"]).optional() }),
  ])
)

// …BlockNode definitions for: paragraph, heading, list, table, image,
// blockquote, codeBlock, horizontalRule, pageBreak, toc.
// (See design spec §5.2 for full set.)

export const DocumentAstSchema = z.object({
  meta: DocumentMetaSchema,
  coverPage: CoverPageSchema.optional(),
  header: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  footer: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  body: z.array(BlockNodeSchema).min(1),
})

export type DocumentAst = z.infer<typeof DocumentAstSchema>
export type BlockNode = /* hand-written union mirroring the Zod schema */
export type InlineNode = /* hand-written union mirroring the Zod schema */
```

Implement **all** block types from spec §5.2: `paragraph`, `heading`, `list` (with `ListItem` sub-schema), `table` (with `TableRow`, `TableCell`), `image`, `blockquote`, `codeBlock`, `horizontalRule`, `pageBreak`, `toc`. Export `DocumentAst`, `BlockNode`, `InlineNode`, `ListItem`, `TableRow`, `TableCell` types. ≤ 300 lines.

- [ ] **Step 4: Run test again**

Run: `bunx vitest run tests/unit/document-ast/schema.test.ts`
Expected: PASS all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/schema.ts tests/unit/document-ast/schema.test.ts
git commit -m "feat(document-ast): add zod schema for text/document AST"
```

---

## Task 3: Semantic validator

**Files:**
- Create: `src/lib/document-ast/validate.ts`
- Create: `tests/unit/document-ast/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest"
import { validateDocumentAst } from "@/lib/document-ast/validate"

const baseOk = {
  meta: { title: "T" },
  body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
}

describe("validateDocumentAst", () => {
  it("accepts a valid minimal AST", () => {
    const r = validateDocumentAst(baseOk)
    expect(r.ok).toBe(true)
  })

  it("rejects anchors pointing to non-existent bookmarks", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        { type: "paragraph", children: [{ type: "anchor", bookmarkId: "ghost", children: [{ type: "text", text: "x" }] }] },
      ],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/bookmark/i)
  })

  it("rejects pageNumber outside header/footer", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "paragraph", children: [{ type: "pageNumber" }] }],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/pageNumber/i)
  })

  it("rejects table whose columnWidths don't sum to width", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [
        {
          type: "table",
          width: 9360,
          columnWidths: [3000, 3000],
          rows: [{ cells: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "a" }] }] },
            { children: [{ type: "paragraph", children: [{ type: "text", text: "b" }] }] },
          ] }],
        },
      ],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/columnWidths/i)
  })

  it("rejects unsplash image with empty keyword", () => {
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "image", src: "unsplash:", alt: "x", width: 100, height: 100 }],
    })
    expect(r.ok).toBe(false)
  })

  it("rejects AST over 128KB", () => {
    const huge = "a".repeat(150_000)
    const r = validateDocumentAst({
      meta: { title: "T" },
      body: [{ type: "paragraph", children: [{ type: "text", text: huge }] }],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/size|budget|bytes/i)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bunx vitest run tests/unit/document-ast/validate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `validateDocumentAst`**

Create `src/lib/document-ast/validate.ts`:

```ts
import { DocumentAstSchema, type DocumentAst, type BlockNode, type InlineNode } from "./schema"

export type ValidateOk = { ok: true; ast: DocumentAst }
export type ValidateErr = { ok: false; error: string }
export type ValidateResult = ValidateOk | ValidateErr

const MAX_BYTES = 128 * 1024

export function validateDocumentAst(raw: unknown): ValidateResult {
  const bytes = Buffer.byteLength(JSON.stringify(raw), "utf8")
  if (bytes > MAX_BYTES) {
    return { ok: false, error: `AST size ${bytes} bytes exceeds 128KB budget` }
  }
  const parsed = DocumentAstSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }
  }
  const semanticError = checkSemantics(parsed.data)
  if (semanticError) return { ok: false, error: semanticError }
  return { ok: true, ast: parsed.data }
}

function checkSemantics(ast: DocumentAst): string | null {
  // 1. Collect bookmarkIds
  const bookmarks = new Set<string>()
  walk(ast, node => {
    if (node.kind === "block" && node.node.type === "heading" && node.node.bookmarkId) {
      bookmarks.add(node.node.bookmarkId)
    }
  })
  // 2. Check anchors
  let anchorError: string | null = null
  walk(ast, node => {
    if (anchorError) return
    if (node.kind === "inline" && node.node.type === "anchor" && !bookmarks.has(node.node.bookmarkId)) {
      anchorError = `anchor references missing bookmarkId "${node.node.bookmarkId}"`
    }
  })
  if (anchorError) return anchorError
  // 3. pageNumber only in header/footer
  let pnError: string | null = null
  walk(ast, node => {
    if (pnError) return
    if (node.kind === "inline" && node.node.type === "pageNumber" && node.scope === "body") {
      pnError = "pageNumber inline is only allowed inside header or footer"
    }
  })
  if (pnError) return pnError
  // 4. Tables: columnWidths sum = width, max cell count matches
  let tableError: string | null = null
  walk(ast, node => {
    if (tableError) return
    if (node.kind === "block" && node.node.type === "table") {
      const t = node.node
      const sum = t.columnWidths.reduce((a, b) => a + b, 0)
      if (sum !== t.width) {
        tableError = `table columnWidths sum ${sum} != width ${t.width}`
        return
      }
      for (const row of t.rows) {
        const cellsWithSpan = row.cells.reduce((n, c) => n + (c.colspan ?? 1), 0)
        if (cellsWithSpan !== t.columnWidths.length) {
          tableError = `table row cell count (with colspan) ${cellsWithSpan} != columnWidths ${t.columnWidths.length}`
          return
        }
      }
    }
  })
  if (tableError) return tableError
  // 5. Unsplash keyword non-empty
  let imgError: string | null = null
  walk(ast, node => {
    if (imgError) return
    if (node.kind === "block" && node.node.type === "image") {
      const src = node.node.src
      if (src.startsWith("unsplash:") && src.slice("unsplash:".length).trim() === "") {
        imgError = "unsplash: image source missing keyword"
      }
    }
  })
  return imgError
}

type Visit =
  | { kind: "block"; node: BlockNode; scope: "body" | "header" | "footer" }
  | { kind: "inline"; node: InlineNode; scope: "body" | "header" | "footer" }

function walk(ast: DocumentAst, visit: (v: Visit) => void) {
  const visitBlocks = (blocks: BlockNode[], scope: Visit["scope"]) => {
    for (const node of blocks) {
      visit({ kind: "block", node, scope })
      switch (node.type) {
        case "paragraph":
        case "heading":
          node.children.forEach(inline => walkInline(inline, scope))
          break
        case "list":
          node.items.forEach(item => {
            visitBlocks(item.children, scope)
            if (item.subList) visitBlocks(subListToBlocks(item.subList), scope)
          })
          break
        case "table":
          node.rows.forEach(row => row.cells.forEach(cell => visitBlocks(cell.children, scope)))
          break
        case "blockquote":
          visitBlocks(node.children, scope)
          break
        // codeBlock, image, horizontalRule, pageBreak, toc have no children to recurse
      }
    }
  }
  const walkInline = (node: InlineNode, scope: Visit["scope"]) => {
    visit({ kind: "inline", node, scope })
    if (node.type === "link" || node.type === "anchor") node.children.forEach(c => walkInline(c, scope))
    if (node.type === "footnote") visitBlocks(node.children, scope)
  }
  if (ast.header) visitBlocks(ast.header.children, "header")
  if (ast.footer) visitBlocks(ast.footer.children, "footer")
  visitBlocks(ast.body, "body")
}

function subListToBlocks(sub: { ordered: boolean; items: any[] }): BlockNode[] {
  return [{ type: "list", ordered: sub.ordered, items: sub.items }]
}
```

- [ ] **Step 4: Run test**

Run: `bunx vitest run tests/unit/document-ast/validate.test.ts`
Expected: PASS all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/validate.ts tests/unit/document-ast/validate.test.ts
git commit -m "feat(document-ast): add semantic validator with cross-ref and budget checks"
```

---

## Task 4: Unsplash resolver for AST

**Files:**
- Create: `src/lib/document-ast/resolve-unsplash.ts`
- Create: `tests/unit/document-ast/resolve-unsplash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest"
import { resolveUnsplashInAst } from "@/lib/document-ast/resolve-unsplash"
import type { DocumentAst } from "@/lib/document-ast/schema"

vi.mock("@/lib/unsplash/client", () => ({
  searchPhoto: vi.fn(async (q: string) => ({
    urls: { regular: `https://images.unsplash.com/photo-for-${encodeURIComponent(q)}` },
    user: { name: "Test Author" },
  })),
}))

describe("resolveUnsplashInAst", () => {
  it("replaces unsplash: image src with resolved URL", async () => {
    const ast: DocumentAst = {
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "image", src: "unsplash:mountain sunset", alt: "hero", width: 800, height: 400 },
        { type: "paragraph", children: [{ type: "text", text: "x" }] },
      ],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    expect(img.type).toBe("image")
    if (img.type === "image") {
      expect(img.src).toMatch(/^https:\/\/images\.unsplash\.com\//)
      expect(img.src).not.toContain("unsplash:")
    }
  })

  it("replaces coverPage.logoUrl if prefixed", async () => {
    const ast: DocumentAst = {
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      coverPage: { title: "Cover", logoUrl: "unsplash:company logo" },
      body: [{ type: "paragraph", children: [{ type: "text", text: "x" }] }],
    }
    const out = await resolveUnsplashInAst(ast)
    expect(out.coverPage?.logoUrl).toMatch(/^https:\/\//)
  })

  it("falls back to placehold.co on resolver failure", async () => {
    const { searchPhoto } = await import("@/lib/unsplash/client")
    ;(searchPhoto as any).mockResolvedValueOnce(null)
    const ast: DocumentAst = {
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "image", src: "unsplash:ocean", alt: "x", width: 800, height: 400 }],
    }
    const out = await resolveUnsplashInAst(ast)
    const img = out.body[0]
    if (img.type === "image") {
      expect(img.src).toContain("placehold.co")
    }
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bunx vitest run tests/unit/document-ast/resolve-unsplash.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement resolver**

Create `src/lib/document-ast/resolve-unsplash.ts`:

```ts
import { searchPhoto } from "@/lib/unsplash/client"
import type { DocumentAst, BlockNode } from "./schema"

const PREFIX = "unsplash:"

export async function resolveUnsplashInAst(ast: DocumentAst): Promise<DocumentAst> {
  const srcs = new Set<string>()
  collectSrcs(ast, srcs)
  const map = new Map<string, string>()
  await Promise.all(
    [...srcs].map(async raw => {
      const keyword = raw.slice(PREFIX.length).toLowerCase().trim().replace(/\s+/g, " ").slice(0, 50)
      if (!keyword) { map.set(raw, fallback(keyword)); return }
      try {
        const photo = await searchPhoto(keyword)
        map.set(raw, photo ? `${photo.urls.regular}&w=1200` : fallback(keyword))
      } catch {
        map.set(raw, fallback(keyword))
      }
    })
  )
  return replaceSrcs(ast, map)
}

function fallback(q: string): string {
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encodeURIComponent(q || "image")}`
}

function collectSrcs(ast: DocumentAst, out: Set<string>) {
  const visit = (block: BlockNode) => {
    if (block.type === "image" && block.src.startsWith(PREFIX)) out.add(block.src)
    if (block.type === "list") block.items.forEach(item => item.children.forEach(visit))
    if (block.type === "table") block.rows.forEach(r => r.cells.forEach(c => c.children.forEach(visit)))
    if (block.type === "blockquote") block.children.forEach(visit)
  }
  ast.body.forEach(visit)
  ast.header?.children.forEach(visit)
  ast.footer?.children.forEach(visit)
  const logo = ast.coverPage?.logoUrl
  if (logo?.startsWith(PREFIX)) out.add(logo)
}

function replaceSrcs(ast: DocumentAst, map: Map<string, string>): DocumentAst {
  // structuredClone preserves discriminated unions; safe on plain JSON shape
  const clone: DocumentAst = structuredClone(ast)
  const visit = (block: BlockNode) => {
    if (block.type === "image" && map.has(block.src)) block.src = map.get(block.src)!
    if (block.type === "list") block.items.forEach(item => item.children.forEach(visit))
    if (block.type === "table") block.rows.forEach(r => r.cells.forEach(c => c.children.forEach(visit)))
    if (block.type === "blockquote") block.children.forEach(visit)
  }
  clone.body.forEach(visit)
  clone.header?.children.forEach(visit)
  clone.footer?.children.forEach(visit)
  if (clone.coverPage?.logoUrl && map.has(clone.coverPage.logoUrl)) {
    clone.coverPage.logoUrl = map.get(clone.coverPage.logoUrl)!
  }
  return clone
}
```

- [ ] **Step 4: Run test**

Run: `bunx vitest run tests/unit/document-ast/resolve-unsplash.test.ts`
Expected: PASS all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/resolve-unsplash.ts tests/unit/document-ast/resolve-unsplash.test.ts
git commit -m "feat(document-ast): add unsplash resolver for image tree-walking"
```

---

## Task 5: Golden fixture — business proposal

**Files:**
- Create: `src/lib/document-ast/examples/proposal.ts`
- Create: `tests/unit/document-ast/examples.test.ts`

Purpose: a full fixture that will be (a) reused as prompt example, (b) used as golden test input for the exporter and renderer, (c) a smoke check that the schema is expressive enough.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { validateDocumentAst } from "@/lib/document-ast/validate"

describe("proposalExample", () => {
  it("validates against the schema and semantic rules", () => {
    const result = validateDocumentAst(proposalExample)
    expect(result.ok).toBe(true)
  })

  it("exercises cover page, TOC, headings, table, list, footnote", () => {
    expect(proposalExample.coverPage).toBeDefined()
    const types = new Set<string>()
    const walk = (blocks: any[]) => blocks.forEach(b => {
      types.add(b.type)
      if (b.children?.[0]?.type) b.children.forEach?.((c: any) => types.add(c.type))
      if (b.type === "list") b.items.forEach((i: any) => walk(i.children))
      if (b.type === "table") b.rows.forEach((r: any) => r.cells.forEach((c: any) => walk(c.children)))
    })
    walk(proposalExample.body)
    for (const t of ["heading", "paragraph", "table", "list", "toc"]) expect(types.has(t)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bunx vitest run tests/unit/document-ast/examples.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Build the fixture**

Create `src/lib/document-ast/examples/proposal.ts`. A complete business proposal. Must exercise:
- `coverPage` (title, subtitle, author, date, organization, documentNumber)
- `header` + `footer` with `pageNumber`
- H1 title, H2 sections with `bookmarkId`
- `toc` (maxLevel: 2)
- Two paragraphs with **bold** + *italic* runs
- A 3-column table with header row, striped shading, at least 4 data rows
- An ordered list + an unordered sub-list (nested)
- One `image` with `unsplash:` src
- One `footnote`
- One `pageBreak` before the closing section
- One `blockquote` with attribution

~250 lines of data. Use the "Infrastructure Migration Proposal" domain already referenced in the existing prompt.

- [ ] **Step 4: Run test**

Run: `bunx vitest run tests/unit/document-ast/examples.test.ts`
Expected: PASS both cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/examples/proposal.ts tests/unit/document-ast/examples.test.ts
git commit -m "test(document-ast): add business proposal golden fixture"
```

---

## Task 6: `astToDocx` scaffold — meta, styles, empty body

**Files:**
- Create: `src/lib/document-ast/to-docx.ts`
- Create: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import { astToDocx } from "@/lib/document-ast/to-docx"
import type { DocumentAst } from "@/lib/document-ast/schema"

const minimalAst: DocumentAst = {
  meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
  body: [{ type: "paragraph", children: [{ type: "text", text: "Hello world" }] }],
}

describe("astToDocx", () => {
  it("produces a non-empty Buffer for a minimal AST", async () => {
    const buf = await astToDocx(minimalAst)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it("buffer starts with ZIP magic bytes (PK)", async () => {
    const buf = await astToDocx(minimalAst)
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bunx vitest run tests/unit/document-ast/to-docx.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement scaffold**

Create `src/lib/document-ast/to-docx.ts`:

```ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  PageOrientation, AlignmentType, LevelFormat, BorderStyle,
} from "docx"
import type { DocumentAst } from "./schema"

const PAGE_SIZES = {
  letter: { width: 12240, height: 15840 },
  a4:     { width: 11906, height: 16838 },
} as const

export async function astToDocx(ast: DocumentAst): Promise<Buffer> {
  const size = PAGE_SIZES[ast.meta.pageSize ?? "letter"]
  const doc = new Document({
    styles: buildStyles(ast),
    numbering: buildNumbering(),
    sections: [
      {
        properties: {
          page: {
            size: {
              width: size.width,
              height: size.height,
              orientation: ast.meta.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: ast.meta.margins?.top ?? 1440,
              bottom: ast.meta.margins?.bottom ?? 1440,
              left: ast.meta.margins?.left ?? 1440,
              right: ast.meta.margins?.right ?? 1440,
            },
          },
        },
        children: [
          new Paragraph({ children: [new TextRun("PLACEHOLDER — body rendering comes in later tasks")] }),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc) as Promise<Buffer>
}

function buildStyles(ast: DocumentAst) {
  const pt = (n: number) => n * 2 // docx size is half-points
  return {
    default: { document: { run: { font: ast.meta.font, size: pt(ast.meta.fontSize) } } },
    paragraphStyles: [1, 2, 3, 4, 5, 6].map(level => ({
      id: `Heading${level}`,
      name: `Heading ${level}`,
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { size: pt(HEADING_SIZES_PT[level - 1]), bold: true, font: ast.meta.font },
      paragraph: {
        spacing: { before: 240, after: 120 },
        outlineLevel: level - 1,
      },
    })),
  }
}

const HEADING_SIZES_PT = [20, 16, 14, 12, 12, 12]

function buildNumbering() {
  return {
    config: [
      {
        reference: "bullets",
        levels: [0, 1, 2].map(level => ({
          level,
          format: LevelFormat.BULLET,
          text: ["•", "◦", "▪"][level],
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      },
      {
        reference: "numbers",
        levels: [0, 1, 2].map(level => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      },
    ],
  }
}
```

- [ ] **Step 4: Run test**

Run: `bunx vitest run tests/unit/document-ast/to-docx.test.ts`
Expected: PASS both cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): scaffold astToDocx with meta, styles, numbering"
```

---

## Task 7: Export — inline nodes

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Add failing test cases**

Append to `to-docx.test.ts`:

```ts
import mammoth from "mammoth"

async function extractText(buf: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer: buf })
  return res.value
}

describe("astToDocx — inline nodes", () => {
  it("renders bold, italic, and code text", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "normal " },
        { type: "text", text: "bold", bold: true },
        { type: "text", text: " " },
        { type: "text", text: "italic", italic: true },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("normal bold italic")
  })

  it("renders an external hyperlink", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "See " },
        { type: "link", href: "https://example.com", children: [{ type: "text", text: "example" }] },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("example")
  })

  it("renders a line break", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [
        { type: "text", text: "line one" },
        { type: "lineBreak" },
        { type: "text", text: "line two" },
      ] }],
    })
    const text = await extractText(buf)
    expect(text).toMatch(/line one[\s\S]*line two/)
  })
})
```

- [ ] **Step 2: Run tests (expect new failures)**

Run: `bunx vitest run tests/unit/document-ast/to-docx.test.ts`
Expected: the 3 new cases fail (placeholder body is still there).

- [ ] **Step 3: Implement `renderInline` + integrate into body**

Edit `to-docx.ts`. Replace placeholder body with real rendering. Add:

```ts
import { ExternalHyperlink, InternalHyperlink, FootnoteReferenceRun } from "docx"
import type { BlockNode, InlineNode } from "./schema"

function renderInline(node: InlineNode, ctx: RenderCtx): (TextRun | ExternalHyperlink | InternalHyperlink | FootnoteReferenceRun)[] {
  switch (node.type) {
    case "text":
      return [new TextRun({
        text: node.text,
        bold: node.bold,
        italics: node.italic,
        underline: node.underline ? {} : undefined,
        strike: node.strike,
        color: node.color ? node.color.replace("#", "") : undefined,
        superScript: node.superscript,
        subScript: node.subscript,
        font: node.code ? "Consolas" : undefined,
      })]
    case "lineBreak":
      return [new TextRun({ text: "", break: 1 })]
    case "link":
      return [new ExternalHyperlink({
        link: node.href,
        children: node.children.flatMap(c => renderInline(c, ctx)) as TextRun[],
      })]
    case "anchor":
      return [new InternalHyperlink({
        anchor: node.bookmarkId,
        children: node.children.flatMap(c => renderInline(c, ctx)) as TextRun[],
      })]
    case "footnote": {
      const id = ctx.nextFootnoteId++
      ctx.footnotes[id] = node.children
      return [new FootnoteReferenceRun(id)]
    }
    case "pageNumber":
      return [new TextRun({ children: ["PAGE"] as any })] // placeholder — real impl in Task 13
    case "tab":
      return [new TextRun({ children: ["\t"] })]
  }
}

type RenderCtx = {
  nextFootnoteId: number
  footnotes: Record<number, BlockNode[]>
}

function newRenderCtx(): RenderCtx {
  return { nextFootnoteId: 1, footnotes: {} }
}

// Temporary body wiring for this task — real renderBlock lands in Task 8.
function renderBodyTemp(ast: DocumentAst, ctx: RenderCtx): Paragraph[] {
  return ast.body.map(block => {
    if (block.type === "paragraph") {
      return new Paragraph({ children: block.children.flatMap(c => renderInline(c, ctx)) as any })
    }
    return new Paragraph({ children: [new TextRun("UNSUPPORTED BLOCK — comes in a later task")] })
  })
}
```

Wire `renderBodyTemp` into the section `children` in the existing `astToDocx` function, passing a new `RenderCtx` per call.

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/document-ast/to-docx.test.ts`
Expected: PASS all cases (2 old + 3 new = 5 green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): render inline nodes (text, link, lineBreak, footnote ref, tab)"
```

---

## Task 8: Export — block nodes part 1 (paragraph, heading, blockquote, codeBlock, horizontalRule)

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("astToDocx — blocks part 1", () => {
  it("renders H1 and body paragraph with distinct styles", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "heading", level: 1, children: [{ type: "text", text: "Chapter One" }] },
        { type: "paragraph", children: [{ type: "text", text: "Intro paragraph." }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Chapter One")
    expect(text).toContain("Intro paragraph.")
  })

  it("renders a blockquote with attribution", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "blockquote",
          attribution: "Alice",
          children: [{ type: "paragraph", children: [{ type: "text", text: "Be excellent." }] }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Be excellent.")
    expect(text).toContain("Alice")
  })

  it("renders a codeBlock", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "codeBlock", language: "ts", code: "const x = 1\nconst y = 2" },
      ],
    })
    const text = await extractText(buf)
    expect(text).toMatch(/const x = 1[\s\S]*const y = 2/)
  })
})
```

- [ ] **Step 2: Run tests (expect failure on blockquote/codeBlock)**

- [ ] **Step 3: Implement `renderBlock` with these cases**

Replace `renderBodyTemp` with a real `renderBlocks(blocks, ctx)` that dispatches on `node.type`:

```ts
function renderBlocks(blocks: BlockNode[], ctx: RenderCtx): (Paragraph | Table)[] {
  return blocks.flatMap(block => renderBlock(block, ctx))
}

function renderBlock(node: BlockNode, ctx: RenderCtx): (Paragraph | Table)[] {
  switch (node.type) {
    case "paragraph":
      return [new Paragraph({
        alignment: alignTo(node.align),
        spacing: node.spacing,
        indent: node.indent,
        children: node.children.flatMap(c => renderInline(c, ctx)) as any,
      })]
    case "heading":
      return [new Paragraph({
        heading: HEADING_LEVELS[node.level],
        children: node.children.flatMap(c => renderInline(c, ctx)) as any,
        // TODO bookmark in Task 12 (TOC wiring)
      })]
    case "blockquote":
      return [
        ...node.children.flatMap(child => renderBlock(child, ctx)).map(p =>
          p instanceof Paragraph
            ? new Paragraph({
                indent: { left: 720 },
                border: { left: { color: "808080", size: 12, space: 6, style: BorderStyle.SINGLE } },
                children: (p as any).options.children,
              })
            : p
        ),
        ...(node.attribution
          ? [new Paragraph({
              indent: { left: 720 },
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `— ${node.attribution}`, italics: true })],
            })]
          : []),
      ]
    case "codeBlock":
      return node.code.split("\n").map(line =>
        new Paragraph({
          shading: { fill: "F3F4F6", type: "clear" as any },
          children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })],
        })
      )
    case "horizontalRule":
      return [new Paragraph({ border: { bottom: { color: "808080", size: 6, space: 1, style: BorderStyle.SINGLE } }, children: [] })]
    default:
      // Lists, tables, images, pageBreak, toc come in later tasks
      return [new Paragraph({ children: [new TextRun(`[UNSUPPORTED: ${node.type}]`)] })]
  }
}

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
}

function alignTo(a?: "left"|"center"|"right"|"justify") {
  if (!a) return undefined
  return { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[a]
}
```

Replace the section `children` in `astToDocx` with `renderBlocks(ast.body, ctx)`.

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/document-ast/to-docx.test.ts`
Expected: all green (prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export paragraph, heading, blockquote, codeBlock, hr"
```

---

## Task 9: Export — lists (ordered, unordered, nested)

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — lists", () => {
  it("renders an unordered list with nested ordered sub-list", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        {
          type: "list", ordered: false, items: [
            { children: [{ type: "paragraph", children: [{ type: "text", text: "alpha" }] }] },
            {
              children: [{ type: "paragraph", children: [{ type: "text", text: "bravo" }] }],
              subList: { ordered: true, items: [
                { children: [{ type: "paragraph", children: [{ type: "text", text: "bravo.1" }] }] },
                { children: [{ type: "paragraph", children: [{ type: "text", text: "bravo.2" }] }] },
              ] },
            },
          ],
        },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("alpha")
    expect(text).toContain("bravo")
    expect(text).toContain("bravo.1")
    expect(text).toContain("bravo.2")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement list rendering**

In `renderBlock`, add:

```ts
case "list":
  return renderList(node, 0, ctx)
```

Add helper:

```ts
function renderList(node: Extract<BlockNode, { type: "list" }>, level: number, ctx: RenderCtx): Paragraph[] {
  const ref = node.ordered ? "numbers" : "bullets"
  const out: Paragraph[] = []
  for (const item of node.items) {
    // Each item's first block becomes the numbered/bulleted paragraph; extra blocks indent underneath.
    const firstBlock = item.children[0]
    const restBlocks = item.children.slice(1)
    if (firstBlock?.type === "paragraph") {
      out.push(new Paragraph({
        numbering: { reference: ref, level },
        children: firstBlock.children.flatMap(c => renderInline(c, ctx)) as any,
      }))
    }
    for (const extra of restBlocks) {
      const rendered = renderBlock(extra, ctx)
      rendered.forEach(p => { if (p instanceof Paragraph) out.push(p) })
    }
    if (item.subList) {
      out.push(...renderList({ type: "list", ordered: item.subList.ordered, items: item.subList.items }, level + 1, ctx))
    }
  }
  return out
}
```

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export ordered/unordered lists with nesting"
```

---

## Task 10: Export — tables

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — tables", () => {
  it("renders a 2-column table with header row", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        {
          type: "table", width: 9360, columnWidths: [4680, 4680],
          rows: [
            { isHeader: true, cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Feature" }] }], shading: "D5E8F0" },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Value" }] }], shading: "D5E8F0" },
            ] },
            { cells: [
              { children: [{ type: "paragraph", children: [{ type: "text", text: "Price" }] }] },
              { children: [{ type: "paragraph", children: [{ type: "text", text: "$100" }] }] },
            ] },
          ],
        },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Feature")
    expect(text).toContain("Price")
    expect(text).toContain("$100")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement table rendering**

Add import: `Table, TableRow, TableCell, WidthType, ShadingType, VerticalAlign` from `docx`. In `renderBlock`:

```ts
case "table":
  return [renderTable(node, ctx)]
```

```ts
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" }
const allCellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

function renderTable(node: Extract<BlockNode, { type: "table" }>, ctx: RenderCtx): Table {
  const rows = node.rows.map(row =>
    new TableRow({
      tableHeader: row.isHeader,
      children: row.cells.map((cell, i) =>
        new TableCell({
          width: { size: node.columnWidths[i] ?? node.columnWidths[node.columnWidths.length - 1], type: WidthType.DXA },
          columnSpan: cell.colspan,
          rowSpan: cell.rowspan,
          shading: cell.shading ? { fill: cell.shading, type: ShadingType.CLEAR, color: "auto" } : undefined,
          borders: allCellBorders,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: cell.valign === "middle" ? VerticalAlign.CENTER : cell.valign === "bottom" ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
          children: cell.children.flatMap(c => renderBlock(c, ctx)) as any,
        })
      ),
    })
  )
  return new Table({
    width: { size: node.width, type: WidthType.DXA },
    columnWidths: node.columnWidths,
    rows,
  })
}
```

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export tables with dual widths, shading, borders"
```

---

## Task 11: Export — images

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — images", () => {
  it("embeds a placeholder when the remote fetch fails", async () => {
    // src points to a made-up host so fetch fails and the fallback fires.
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "image", src: "https://this-host-does-not-exist.invalid/x.png", alt: "ghost", width: 200, height: 150, caption: "figure 1" },
      ],
    })
    expect(buf.length).toBeGreaterThan(1000)
    const text = await extractText(buf)
    expect(text).toContain("figure 1")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement image rendering**

```ts
import { ImageRun } from "docx"

case "image":
  return renderImage(node, ctx)
```

```ts
const PLACEHOLDER_PNG = Buffer.from(
  // 1×1 gray PNG, base64. Use any pre-generated gray PNG.
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)

async function fetchImage(src: string): Promise<{ buf: Buffer; type: "png"|"jpg"|"gif"|"bmp"|"svg" }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(src, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    const ct = res.headers.get("content-type") ?? ""
    const type = ct.includes("png") ? "png"
      : ct.includes("jpeg") || ct.includes("jpg") ? "jpg"
      : ct.includes("gif") ? "gif"
      : ct.includes("svg") ? "svg"
      : ct.includes("bmp") ? "bmp"
      : "png"
    return { buf, type }
  } finally {
    clearTimeout(timer)
  }
}

async function renderImage(node: Extract<BlockNode, { type: "image" }>, ctx: RenderCtx): Promise<(Paragraph)[]> {
  let imgBuf = PLACEHOLDER_PNG
  let imgType: "png"|"jpg"|"gif"|"bmp"|"svg" = "png"
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
  const captionP = node.caption
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: node.caption, italics: true, size: 18 })],
      })
    : null
  return captionP ? [imgP, captionP] : [imgP]
}
```

`renderBlock` now needs to be async-aware. Refactor: make `renderBlocks` return `Promise<(Paragraph|Table)[]>`, and make `renderBlock` return either sync or `Promise<(Paragraph|Table)[]>`. Tweak `astToDocx` to `await renderBlocks(...)` before constructing the Document.

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export images with remote fetch and placeholder fallback"
```

---

## Task 12: Export — page flow (pageBreak, bookmarks, TOC)

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("astToDocx — page flow", () => {
  it("emits a page break block", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [{ type: "text", text: "before" }] },
        { type: "pageBreak" },
        { type: "paragraph", children: [{ type: "text", text: "after" }] },
      ],
    })
    expect(buf.length).toBeGreaterThan(1000)
    const text = await extractText(buf)
    expect(text).toContain("before")
    expect(text).toContain("after")
  })

  it("renders a TOC with a title", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "toc", maxLevel: 2, title: "Contents" },
        { type: "heading", level: 1, bookmarkId: "intro", children: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", children: [{ type: "anchor", bookmarkId: "intro", children: [{ type: "text", text: "jump" }] }] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Contents")
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement**

```ts
import { PageBreak, TableOfContents, Bookmark } from "docx"

// pageBreak
case "pageBreak":
  return [new Paragraph({ children: [new PageBreak()] })]

// toc
case "toc":
  return [
    ...(node.title ? [new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(node.title)],
    })] : []),
    new TableOfContents(node.title ?? "Contents", {
      hyperlink: true,
      headingStyleRange: `1-${node.maxLevel}`,
    }) as unknown as Paragraph,
  ]

// heading with bookmark (update the existing case)
case "heading": {
  const inlineChildren = node.children.flatMap(c => renderInline(c, ctx)) as any
  const children = node.bookmarkId
    ? [new Bookmark({ id: node.bookmarkId, children: inlineChildren })]
    : inlineChildren
  return [new Paragraph({ heading: HEADING_LEVELS[node.level], children })]
}
```

- [ ] **Step 4: Run tests**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export pageBreak, TOC, and heading bookmarks"
```

---

## Task 13: Export — header, footer, page numbers

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — header/footer", () => {
  it("renders a header and a footer with page number", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: true },
      header: { children: [{ type: "paragraph", children: [{ type: "text", text: "Confidential" }] }] },
      footer: { children: [{ type: "paragraph", children: [
        { type: "text", text: "Page " }, { type: "pageNumber" },
      ] }] },
      body: [{ type: "paragraph", children: [{ type: "text", text: "body" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("body")
    // mammoth raw-text doesn't include header/footer; just confirm buffer is valid size
    expect(buf.length).toBeGreaterThan(1500)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement**

```ts
import { Header, Footer, PageNumber } from "docx"

// In renderInline, replace the pageNumber placeholder:
case "pageNumber":
  return [new TextRun({ children: [PageNumber.CURRENT] as any })]
```

In `astToDocx`, after `renderBlocks(ast.body, ctx)`:

```ts
const header = ast.header
  ? new Header({ children: await renderBlocks(ast.header.children, ctx) as any })
  : undefined
const footer = ast.footer
  ? new Footer({ children: await renderBlocks(ast.footer.children, ctx) as any })
  : undefined
```

Attach to the section: `headers: header ? { default: header } : undefined`, same for footers.

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export headers, footers, and page numbers"
```

---

## Task 14: Export — footnotes

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — footnotes", () => {
  it("collects an inline footnote and emits it at doc level", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [
        { type: "paragraph", children: [
          { type: "text", text: "Claim" },
          { type: "footnote", children: [{ type: "paragraph", children: [{ type: "text", text: "See p.42" }] }] },
          { type: "text", text: " substantiated." },
        ] },
      ],
    })
    const text = await extractText(buf)
    expect(text).toContain("Claim")
    // mammoth surfaces footnote text appended to body; confirm it's present
    expect(text).toContain("See p.42")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement footnote collection**

The `ctx.footnotes` map is already populated by `renderInline`. In `astToDocx`, after rendering, build the doc-level footnotes map:

```ts
const footnotes: Record<number, { children: Paragraph[] }> = {}
for (const [idStr, blocks] of Object.entries(ctx.footnotes)) {
  const id = Number(idStr)
  const rendered = await renderBlocks(blocks, ctx)
  footnotes[id] = { children: rendered.filter(r => r instanceof Paragraph) as Paragraph[] }
}
```

Pass `footnotes: Object.keys(footnotes).length ? footnotes : undefined` to the `Document` constructor.

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export footnotes with inline reference runs"
```

---

## Task 15: Export — cover page

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("astToDocx — cover page", () => {
  it("renders cover page above body and inserts a page break", async () => {
    const buf = await astToDocx({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      coverPage: {
        title: "Infrastructure Migration Proposal",
        subtitle: "NQRust-HV Platform Transition",
        author: "NQ Technology",
        date: "2026-04-23",
        organization: "NQ Technology Indonesia",
      },
      body: [{ type: "paragraph", children: [{ type: "text", text: "Executive Summary" }] }],
    })
    const text = await extractText(buf)
    expect(text).toContain("Infrastructure Migration Proposal")
    expect(text).toContain("NQ Technology")
    expect(text).toContain("2026-04-23")
    expect(text).toContain("Executive Summary")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement cover page**

Add helper:

```ts
function renderCoverPage(cover: CoverPage): Paragraph[] {
  const out: Paragraph[] = []
  if (cover.logoUrl) {
    // Simplified — no async image fetch for cover in v1. Skip if logoUrl missing.
  }
  out.push(new Paragraph({ spacing: { before: 2880 }, children: [] }))
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.title, bold: true, size: 48 })],
  }))
  if (cover.subtitle) out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.subtitle, size: 28, italics: true })],
  }))
  out.push(new Paragraph({ spacing: { before: 1440 }, children: [] }))
  if (cover.author) out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.author, size: 24 })],
  }))
  if (cover.organization) out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.organization, size: 22 })],
  }))
  if (cover.date) out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cover.date, size: 22 })],
  }))
  out.push(new Paragraph({ children: [new PageBreak()] }))
  return out
}
```

In `astToDocx`, prepend `ast.coverPage ? renderCoverPage(ast.coverPage) : []` to the section `children` array.

Import `CoverPage` type from schema.

- [ ] **Step 4: Run test**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit -m "feat(document-ast): export cover page with page break into body"
```

---

## Task 16: Golden fixture — research report + integration test

**Files:**
- Create: `src/lib/document-ast/examples/report.ts`
- Modify: `tests/unit/document-ast/examples.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/document-ast/examples.test.ts`:

```ts
import { reportExample } from "@/lib/document-ast/examples/report"
import { astToDocx } from "@/lib/document-ast/to-docx"
import mammoth from "mammoth"

describe("reportExample", () => {
  it("validates", () => {
    expect(validateDocumentAst(reportExample).ok).toBe(true)
  })

  it("exports to a non-empty docx buffer", async () => {
    const buf = await astToDocx(reportExample)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })

  it("extracted text contains section titles and findings", async () => {
    const buf = await astToDocx(reportExample)
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toMatch(/Findings|Results|Conclusions/i)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Build the fixture**

Create `src/lib/document-ast/examples/report.ts`. A research report that must exercise the v1 features not covered in the proposal fixture:
- Abstract paragraph with inline `footnote`
- Two levels of `heading` + numbered list
- `blockquote` with attribution
- `codeBlock` (for methodology)
- `horizontalRule` as divider
- `image` with caption
- `anchor` inline linking back to a heading bookmarkId

~300 lines.

- [ ] **Step 4: Run tests**

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/examples/report.ts tests/unit/document-ast/examples.test.ts
git commit -m "test(document-ast): add research report golden fixture + export round-trip"
```

---

## Task 17: Preview renderer — scaffold + A4 chrome + streaming parse

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`

- [ ] **Step 1: Replace the placeholder**

Rewrite `document-renderer.tsx` (delete old 43-line content). Implement the scaffold:

```tsx
"use client"

import { useMemo } from "react"
import { FileText } from "@/lib/icons"
import { DocumentAstSchema, type DocumentAst } from "@/lib/document-ast/schema"

interface DocumentRendererProps {
  content: string
}

export function DocumentRenderer({ content }: DocumentRendererProps) {
  const ast = useMemo(() => parseSafe(content), [content])

  if (!ast) return <Skeleton reason="Generating document…" />

  const pageWidthPx = ast.meta.pageSize === "a4" ? 794 : 816
  const minHeightPx = ast.meta.pageSize === "a4" ? 1123 : 1056
  const mLeft = (ast.meta.margins?.left ?? 1440) / 1440 * 96
  const mRight = (ast.meta.margins?.right ?? 1440) / 1440 * 96
  const mTop = (ast.meta.margins?.top ?? 1440) / 1440 * 96
  const mBottom = (ast.meta.margins?.bottom ?? 1440) / 1440 * 96

  return (
    <div className="overflow-y-auto bg-muted/30 py-10">
      <article
        className="mx-auto bg-white text-slate-900 shadow-md relative"
        style={{
          width: pageWidthPx,
          minHeight: minHeightPx,
          paddingTop: mTop,
          paddingBottom: mBottom,
          paddingLeft: mLeft,
          paddingRight: mRight,
          fontFamily: ast.meta.font,
          fontSize: `${ast.meta.fontSize}pt`,
          lineHeight: 1.5,
        }}
      >
        {/* Cover + body + strips come in next tasks */}
        <p className="text-sm text-slate-400">[renderer scaffold — body blocks next]</p>
      </article>
    </div>
  )
}

function parseSafe(content: string): DocumentAst | null {
  if (!content.trim()) return null
  let raw: unknown
  try { raw = JSON.parse(content) } catch { return null }
  const result = DocumentAstSchema.safeParse(raw)
  return result.success ? result.data : null
}

function Skeleton({ reason }: { reason: string }) {
  return (
    <div className="w-full h-full overflow-y-auto bg-muted/30 py-10">
      <div className="mx-auto max-w-[816px] p-8 rounded-md border border-slate-300 bg-white flex items-start gap-3">
        <FileText className="h-5 w-5 text-slate-400 mt-0.5" />
        <p className="text-sm text-slate-500">{reason}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-check compilation**

Run: `bunx tsc --noEmit`
Expected: no errors in `document-renderer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx
git commit -m "feat(renderers): scaffold text/document renderer with A4 paper chrome"
```

---

## Task 18: Preview renderer — inline walker

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`

- [ ] **Step 1: Implement `renderInline`**

Add inside the file:

```tsx
import type { InlineNode } from "@/lib/document-ast/schema"

function renderInline(node: InlineNode, key: number, footnotes: FootnoteSink): React.ReactNode {
  switch (node.type) {
    case "text": {
      const style: React.CSSProperties = {}
      if (node.color) style.color = node.color
      if (node.code) { style.fontFamily = "ui-monospace, monospace"; style.background = "rgba(148,163,184,0.15)"; style.padding = "0 4px"; style.borderRadius = 3 }
      let el: React.ReactNode = <span style={style}>{node.text}</span>
      if (node.bold) el = <strong>{el}</strong>
      if (node.italic) el = <em>{el}</em>
      if (node.underline) el = <u>{el}</u>
      if (node.strike) el = <s>{el}</s>
      if (node.superscript) el = <sup>{el}</sup>
      if (node.subscript) el = <sub>{el}</sub>
      return <React.Fragment key={key}>{el}</React.Fragment>
    }
    case "link":
      return <a key={key} href={node.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
        {node.children.map((c, i) => renderInline(c, i, footnotes))}
      </a>
    case "anchor":
      return <a key={key} href={`#${node.bookmarkId}`} className="text-blue-600 underline">
        {node.children.map((c, i) => renderInline(c, i, footnotes))}
      </a>
    case "footnote": {
      const id = footnotes.push(node.children)
      return <sup key={key}><a href={`#fn-${id}`} id={`fnref-${id}`}>[{id}]</a></sup>
    }
    case "lineBreak":
      return <br key={key} />
    case "pageNumber":
      return <span key={key} className="text-slate-400">#</span>
    case "tab":
      return <span key={key} style={{ display: "inline-block", width: node.leader === "dot" ? "2rem" : "2rem" }}>{node.leader === "dot" ? "…" : " "}</span>
  }
}
```

Declare `FootnoteSink` and a factory at module level:

```tsx
type FootnoteSink = { push: (blocks: unknown[]) => number; entries: unknown[][] }
function newFootnoteSink(): FootnoteSink {
  const entries: unknown[][] = []
  return {
    push(blocks) { entries.push(blocks); return entries.length },
    entries,
  }
}
```

No test at this step (visual, covered in Task 22 snapshot). Just compile clean.

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx
git commit -m "feat(renderers): add inline walker for text/document"
```

---

## Task 19: Preview renderer — block walker (paragraph, heading, list, blockquote, codeBlock, HR, pageBreak)

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`

- [ ] **Step 1: Implement block walker**

```tsx
import type { BlockNode, DocumentAst } from "@/lib/document-ast/schema"

function renderBlock(node: BlockNode, key: number, footnotes: FootnoteSink): React.ReactNode {
  switch (node.type) {
    case "paragraph": {
      const style: React.CSSProperties = {
        textAlign: node.align ?? "left",
        marginTop: node.spacing?.before ? node.spacing.before / 20 : undefined,
        marginBottom: node.spacing?.after ? node.spacing.after / 20 : 12,
        textIndent: node.indent?.firstLine ? `${node.indent.firstLine / 1440 * 96}px` : undefined,
        paddingLeft: node.indent?.left ? `${node.indent.left / 1440 * 96}px` : undefined,
      }
      return <p key={key} style={style}>{node.children.map((c, i) => renderInline(c, i, footnotes))}</p>
    }
    case "heading": {
      const Tag = `h${node.level}` as keyof JSX.IntrinsicElements
      const size: Record<number, string> = { 1: "1.8rem", 2: "1.4rem", 3: "1.2rem", 4: "1rem", 5: "0.95rem", 6: "0.9rem" }
      return <Tag key={key} id={node.bookmarkId} style={{ fontSize: size[node.level], fontWeight: 700, margin: "1.5em 0 0.75em" }}>
        {node.children.map((c, i) => renderInline(c, i, footnotes))}
      </Tag>
    }
    case "list": {
      const Tag = node.ordered ? "ol" : "ul"
      return <Tag key={key} start={node.ordered ? node.startAt : undefined} style={{ marginLeft: 24, marginBottom: 12 }}>
        {node.items.map((item, i) => (
          <li key={i}>
            {item.children.map((c, j) => renderBlock(c, j, footnotes))}
            {item.subList && renderBlock({ type: "list", ordered: item.subList.ordered, items: item.subList.items }, 0, footnotes)}
          </li>
        ))}
      </Tag>
    }
    case "blockquote":
      return <blockquote key={key} style={{ borderLeft: "3px solid #94a3b8", paddingLeft: 16, margin: "1em 0", color: "#475569" }}>
        {node.children.map((c, i) => renderBlock(c, i, footnotes))}
        {node.attribution && <footer style={{ textAlign: "right", fontStyle: "italic" }}>— {node.attribution}</footer>}
      </blockquote>
    case "codeBlock":
      return <pre key={key} style={{ background: "#f3f4f6", padding: 12, borderRadius: 4, overflowX: "auto", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>
        <code>{node.code}</code>
      </pre>
    case "horizontalRule":
      return <hr key={key} style={{ border: "none", borderTop: "1px solid #cbd5e1", margin: "1.5em 0" }} />
    case "pageBreak":
      return <div key={key} style={{ height: 2, background: "#e2e8f0", margin: "3em -1in 3em -1in" }} aria-label="page break" />
    default:
      return null // table, image, toc come in next tasks
  }
}
```

Wire into the article body:

```tsx
const footnotes = useMemo(newFootnoteSink, [content])
const bodyNodes = ast.body.map((b, i) => renderBlock(b, i, footnotes))
```

Replace the scaffold placeholder with `{bodyNodes}`.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx
git commit -m "feat(renderers): render paragraph/heading/list/quote/code/hr/pageBreak blocks"
```

---

## Task 20: Preview renderer — tables + images

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`

- [ ] **Step 1: Implement**

Add to the `renderBlock` switch:

```tsx
case "table":
  return (
    <table key={key} style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16, tableLayout: "fixed" }}>
      <colgroup>{node.columnWidths.map((w, i) => <col key={i} style={{ width: `${(w / node.width) * 100}%` }} />)}</colgroup>
      <tbody>
        {node.rows.map((row, ri) => (
          <tr key={ri} style={row.isHeader ? { background: "#f1f5f9", fontWeight: 600 } : undefined}>
            {row.cells.map((cell, ci) => {
              const Tag = row.isHeader ? "th" : "td"
              return (
                <Tag
                  key={ci}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  style={{
                    border: "1px solid #cbd5e1",
                    padding: "6px 10px",
                    background: cell.shading ? `#${cell.shading}` : undefined,
                    textAlign: cell.align ?? "left",
                    verticalAlign: cell.valign ?? "top",
                  }}
                >
                  {cell.children.map((c, i) => renderBlock(c, i, footnotes))}
                </Tag>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

case "image":
  return (
    <figure key={key} style={{ textAlign: node.align ?? "center", margin: "1em 0" }}>
      <img src={node.src} alt={node.alt} width={node.width} height={node.height} style={{ maxWidth: "100%", height: "auto" }} />
      {node.caption && <figcaption style={{ fontStyle: "italic", fontSize: 13, color: "#475569", marginTop: 4 }}>{node.caption}</figcaption>}
    </figure>
  )
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx
git commit -m "feat(renderers): render tables and images"
```

---

## Task 21: Preview renderer — TOC, footnotes section, header/footer strips, cover page

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`

- [ ] **Step 1: Implement**

Add to `renderBlock`:

```tsx
case "toc": {
  // Collect headings ≤ maxLevel from the AST.body in the outer closure; pass a prebuilt list in.
  return <div key={key} data-toc="true">{/* built by outer code */}</div>
}
```

In the outer component, compute TOC entries once:

```tsx
const tocEntries = useMemo(() => {
  if (!ast) return [] as Array<{ level: number; text: string; bookmarkId?: string }>
  const list: Array<{ level: number; text: string; bookmarkId?: string }> = []
  const visit = (blocks: BlockNode[]) => {
    for (const b of blocks) {
      if (b.type === "heading") list.push({ level: b.level, text: inlineToPlain(b.children), bookmarkId: b.bookmarkId })
      if (b.type === "list") b.items.forEach(i => visit(i.children))
      if (b.type === "table") b.rows.forEach(r => r.cells.forEach(c => visit(c.children)))
      if (b.type === "blockquote") visit(b.children)
    }
  }
  visit(ast.body)
  return list
}, [ast])

function inlineToPlain(nodes: InlineNode[]): string {
  return nodes.map(n => n.type === "text" ? n.text : n.type === "link" || n.type === "anchor" ? inlineToPlain(n.children as any) : "").join("")
}
```

Replace the `case "toc"` placeholder with a real list filtered by `maxLevel`.

Render header/footer strips as small gray-bordered boxes at top/bottom of the article:

```tsx
{ast.header && (
  <div style={{ borderBottom: "1px dashed #cbd5e1", marginBottom: 24, paddingBottom: 8, fontSize: "0.9em", color: "#64748b" }}>
    {ast.header.children.map((b, i) => renderBlock(b, i, footnotes))}
  </div>
)}
// …body nodes
{ast.footer && (
  <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: 24, paddingTop: 8, fontSize: "0.9em", color: "#64748b" }}>
    {ast.footer.children.map((b, i) => renderBlock(b, i, footnotes))}
  </div>
)}
```

Render collected footnotes at bottom-of-article:

```tsx
{footnotes.entries.length > 0 && (
  <section style={{ borderTop: "1px solid #cbd5e1", marginTop: 32, paddingTop: 12, fontSize: "0.85em" }}>
    <ol>{footnotes.entries.map((blocks, i) => (
      <li key={i} id={`fn-${i + 1}`}>{(blocks as BlockNode[]).map((b, j) => renderBlock(b, j, newFootnoteSink()))}<a href={`#fnref-${i + 1}`} style={{ marginLeft: 4 }}>↩</a></li>
    ))}</ol>
  </section>
)}
```

Cover page at the very top if present:

```tsx
{ast.coverPage && <CoverBlock cover={ast.coverPage} />}
```

Implement `CoverBlock` as a centered vertical layout matching the DOCX cover page (title 36pt, subtitle 20pt, author + org + date stacked).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx
git commit -m "feat(renderers): render TOC, footnotes, header/footer strips, cover page"
```

---

## Task 22: Golden fixture — formal letter + renderer snapshot test

**Files:**
- Create: `src/lib/document-ast/examples/letter.ts`
- Modify: `tests/unit/document-ast/examples.test.ts`
- Create: `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx`

- [ ] **Step 1: Write failing test for the letter fixture**

Append to `examples.test.ts`:

```ts
import { letterExample } from "@/lib/document-ast/examples/letter"

describe("letterExample", () => {
  it("validates", () => {
    expect(validateDocumentAst(letterExample).ok).toBe(true)
  })
  it("exports to docx", async () => {
    const buf = await astToDocx(letterExample)
    expect(buf.length).toBeGreaterThan(1500)
  })
})
```

- [ ] **Step 2: Build the letter fixture**

Create `src/lib/document-ast/examples/letter.ts`. Must exercise:
- `meta` with `documentNumber`
- Header strip with sender address
- Body: salutation paragraph, 3 body paragraphs, signature block (three paragraphs: closing word, name, title)
- `tab` inline with `leader: "dot"` for a dated line
- No TOC, no lists, no tables — keep it minimal to prove minimal docs work.

~120 lines.

- [ ] **Step 3: Write renderer snapshot test**

Create `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { DocumentRenderer } from "../document-renderer"
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

describe("DocumentRenderer snapshots", () => {
  it.each([
    ["proposal", proposalExample],
    ["report", reportExample],
    ["letter", letterExample],
  ])("renders the %s fixture", (_name, ast) => {
    const { container } = render(<DocumentRenderer content={JSON.stringify(ast)} />)
    expect(container.innerHTML.length).toBeGreaterThan(500)
  })

  it("renders a skeleton for empty content", () => {
    const { container } = render(<DocumentRenderer content="" />)
    expect(container.textContent).toMatch(/generating/i)
  })

  it("renders a skeleton for malformed JSON", () => {
    const { container } = render(<DocumentRenderer content="{ not valid" />)
    expect(container.textContent).toMatch(/generating/i)
  })
})
```

Add `@testing-library/react` if not already present: `bun add -d @testing-library/react @testing-library/jest-dom jsdom`. Update vitest config `environment: "jsdom"` under `test:` if missing.

- [ ] **Step 4: Run all tests**

Run: `bunx vitest run tests/unit/document-ast src/features/conversations/components/chat/artifacts/renderers/__tests__`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/examples/letter.ts tests/unit/document-ast/examples.test.ts \
        src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx \
        package.json bun.lock vitest.config.ts
git commit -m "test(document-ast): add formal letter fixture and renderer snapshot tests"
```

---

## Task 23: Wire validator into `_validate-artifact.ts`

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `tests/unit/validate-artifact.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/validate-artifact.test.ts`:

```ts
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"
import { proposalExample } from "@/lib/document-ast/examples/proposal"

describe("validateArtifactContent — text/document", () => {
  it("accepts a valid DocumentAst JSON", async () => {
    const result = await validateArtifactContent({
      type: "text/document",
      content: JSON.stringify(proposalExample),
    })
    expect(result.ok).toBe(true)
  })

  it("rejects non-JSON content", async () => {
    const result = await validateArtifactContent({
      type: "text/document",
      content: "# A markdown doc\n\nBody.",
    })
    expect(result.ok).toBe(false)
  })

  it("rejects invalid AST shape", async () => {
    const result = await validateArtifactContent({
      type: "text/document",
      content: JSON.stringify({ meta: { title: "T" }, body: [] }),
    })
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Replace the no-op validator**

Open `src/lib/tools/builtin/_validate-artifact.ts`. Replace the permissive `validateDocument` function with:

```ts
import { validateDocumentAst } from "@/lib/document-ast/validate"
import { resolveUnsplashInAst } from "@/lib/document-ast/resolve-unsplash"

async function validateDocument(content: string): Promise<ValidateResult> {
  let raw: unknown
  try { raw = JSON.parse(content) } catch (e) {
    return { ok: false, error: `text/document content must be JSON: ${(e as Error).message}` }
  }
  const v = validateDocumentAst(raw)
  if (!v.ok) return { ok: false, error: v.error }
  const resolved = await resolveUnsplashInAst(v.ast)
  return { ok: true, content: JSON.stringify(resolved) }
}
```

Ensure `validateDocument` is wired into the dispatch map (it already is at line ~52).

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/validate-artifact.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/validate-artifact.test.ts
git commit -m "feat(validate-artifact): wire DocumentAst validation + Unsplash resolution"
```

---

## Task 24: Rewrite the prompt rules

**Files:**
- Modify: `src/lib/prompts/artifacts/document.ts`

- [ ] **Step 1: Rewrite the prompt**

Replace the entire `documentArtifact` export. Structure (per design spec §6):

1. `type`, `label`, `summary` stay.
2. `rules`:
   - Runtime Environment (JSON output, no markdown fences, single object)
   - When to pick `text/document` vs `text/markdown` vs `text/html` (keep the existing heuristic table)
   - **Top-level shape reference** — minimal schema in fenced JSON
   - **Each block node** with a one-line description + minimal JSON example
   - **Each inline node** ditto
   - Images section (Unsplash support, alt text required)
   - Anti-patterns (no markdown syntax in `text` fields, no empty children, no math, no chart/mermaid fenced blocks, no cross-refs to missing bookmarkIds, no truncation)
3. `examples`: array of three complete fixtures built from the example modules:

```ts
import { proposalExample } from "./examples/proposal" // wait — the examples live under src/lib/document-ast/examples, not here
```

Actually import from the AST module:

```ts
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

examples: [
  { label: "Business proposal with cover page, TOC, tables, footnote", code: JSON.stringify(proposalExample, null, 2) },
  { label: "Research report with code block, blockquote, image, anchor links", code: JSON.stringify(reportExample, null, 2) },
  { label: "Formal letter with header address + signature block", code: JSON.stringify(letterExample, null, 2) },
]
```

Target: ~400 lines including the schema reference, not counting the stringified examples.

- [ ] **Step 2: Typecheck + import check**

Run: `bunx tsc --noEmit`
Expected: clean. The prompt module is already in `ALL_ARTIFACTS`, so no index wiring to touch.

- [ ] **Step 3: Smoke-run existing prompt-generation tests**

Run: `bunx vitest run tests/unit/tools`
Expected: green. (Tests that assemble the system prompt should still pass; they only check that `text/document` rules are concatenated, not the exact text.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/document.ts
git commit -m "feat(prompts): rewrite text/document rules around JSON AST schema"
```

---

## Task 25: Download endpoint (format=docx)

**Files:**
- Create (or modify) : `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`

Check first: `ls src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/` — if a `download` subdir already exists, modify; otherwise create.

- [ ] **Step 1: Create the route handler**

```ts
import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DocumentAstSchema } from "@/lib/document-ast/schema"
import { astToDocx } from "@/lib/document-ast/to-docx"

export const runtime = "nodejs"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { artifactId } = await params
  const format = req.nextUrl.searchParams.get("format") ?? "docx"

  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } })
  if (!artifact) return new Response("Not found", { status: 404 })
  if (artifact.artifactType !== "text/document") {
    return new Response("This endpoint only serves text/document artifacts", { status: 400 })
  }

  let ast
  try {
    ast = DocumentAstSchema.parse(JSON.parse(artifact.content))
  } catch (e) {
    return new Response(`Invalid document AST: ${(e as Error).message}`, { status: 409 })
  }

  if (format === "docx") {
    const buf = await astToDocx(ast)
    const safeTitle = ast.meta.title.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "document"
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
        "Cache-Control": "no-store",
      },
    })
  }

  return new Response(`Unsupported format: ${format}`, { status: 400 })
}
```

Verify the actual `auth()` + prisma client import paths match the project conventions by checking an adjacent route (e.g. `src/app/api/dashboard/chat/sessions/[id]/artifacts/route.ts`).

- [ ] **Step 2: Write an integration smoke test**

Create `tests/unit/document-ast/download-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { proposalExample } from "@/lib/document-ast/examples/proposal"

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifact: {
      findUnique: async ({ where: { id } }: any) =>
        id === "art-1"
          ? { id, artifactType: "text/document", content: JSON.stringify(proposalExample) }
          : null,
    },
  },
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route"

describe("download route — text/document", () => {
  it("returns a .docx buffer", async () => {
    const req = new Request("http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-1/download?format=docx") as any
    req.nextUrl = new URL(req.url)
    const res = await GET(req, { params: Promise.resolve({ id: "s-1", artifactId: "art-1" }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("wordprocessingml")
    const ab = await res.arrayBuffer()
    expect(ab.byteLength).toBeGreaterThan(2000)
  })

  it("404s for missing artifact", async () => {
    const req = new Request("http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-ghost/download") as any
    req.nextUrl = new URL(req.url)
    const res = await GET(req, { params: Promise.resolve({ id: "s-1", artifactId: "art-ghost" }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bunx vitest run tests/unit/document-ast/download-route.test.ts`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts \
        tests/unit/document-ast/download-route.test.ts
git commit -m "feat(artifacts): add text/document docx download route"
```

---

## Task 26: Final wiring — registry extension change + panel verification

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/registry.ts`
- Modify (if needed): `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`
- Modify (if needed): `tests/unit/tools/artifact-registry.test.ts` (if one exists)

- [ ] **Step 1: Change the extension**

In `registry.ts`, find the `text/document` entry (around line 114) and change:

```ts
// Before
extension: ".md",

// After
extension: ".docx",
```

- [ ] **Step 2: Verify panel download wiring**

Open `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`. Find the `text/document` download handler (around line 196 "Split-button download handler"). Ensure the download URL it calls is `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/download?format=docx` (matches Task 25). If the current code calls a different endpoint or has format hardcoded differently, update it.

Also check the code-tab hiding (`isTextDocument = artifact.type === "text/document"` around line 68). No change needed if preview-only is still the desired UX (per design spec §2, preview = source of truth).

- [ ] **Step 3: Run the full affected test suite**

Run: `bunx vitest run tests/unit/document-ast tests/unit/validate-artifact.test.ts`
Expected: all green.

- [ ] **Step 4: Run lint + typecheck**

Run: `bun run lint && bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual smoke test**

1. `bun dev`
2. Log in, open any chat with an assistant that has `create_artifact` tool access.
3. Prompt: "Create a one-page formal letter from PT Contoh to PT Klien confirming project kickoff on May 5, 2026."
4. Confirm:
   - Canvas opens with A4 paper preview as the JSON streams
   - Preview updates progressively
   - Download button produces a `.docx` that opens cleanly in Google Docs
   - Generated `.docx` shows the sender/recipient/body/signature correctly

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/registry.ts \
        src/features/conversations/components/chat/artifacts/artifact-panel.tsx
git commit -m "feat(artifacts): flip text/document extension to .docx and finalize panel wiring"
```

---

## Post-Plan Checklist

- [ ] All 26 tasks committed.
- [ ] `bun test` (full suite) green.
- [ ] `bun run lint` clean.
- [ ] `bunx tsc --noEmit` clean.
- [ ] Manual smoke test produced a downloadable .docx that opens in Google Docs and Microsoft Word without the "repair" dialog.
- [ ] Spec §18 acceptance criteria re-checked — every box ticks.

## What's explicitly NOT in this plan

- Math (OMML export + KaTeX preview) — v2 spec.
- Mermaid diagrams inside documents — v2.
- Multi-column layouts — v2.
- PDF export — v2.
- Tracked changes + comments — v3 (if ever).
- `table-striped` auto-alternating shading styling — v2 unless trivial.
- RAG indexing adjustments for AST content — tracked separately; the existing text-extraction pipeline should still work on paragraphs after Task 23 because the AST's text runs are extractable via a simple tree walker (not in scope for v1).

## Rollback plan

If a task lands broken and has already been pushed, revert the task's single commit. Tasks are intentionally sequential and independently committable; no task depends on the next being started.
