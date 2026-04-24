# `text/document` — AST-Driven Rebuild (Phase 9)

**Status:** Design — approved approach, ready for implementation plan
**Date:** 2026-04-23
**Author:** kleopasevan (via Claude)
**Target:** Output parity or better vs. Claude.ai's `docx` skill

---

## 1. Context

The prior markdown-walker pipeline (Phases 1–8) was reverted on 2026-04-23 along with its entire dependency set (`docx`, `docx-preview`, `html2canvas-pro` removed in commit `693dbb7`). What remains today:

- `text/document` **is** registered in `src/features/conversations/components/chat/artifacts/registry.ts:113-122` (added in commit `fa98f47`). Label = "Document", icon = `BookOpen`, amber colorway, `hasCodeTab: false`, `extension: ".md"` (stale — will change).
- `src/lib/prompts/artifacts/document.ts` still carries a 299-line ruleset teaching the LLM to emit **markdown + YAML frontmatter + `chart`/`mermaid` fenced blocks**. That ruleset is about to be discarded — the new pipeline uses a JSON AST, not markdown.
- `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx` is a 43-line placeholder ("Document preview is being rebuilt") referencing the old "sandboxed docx-js" plan.
- `src/lib/tools/builtin/_validate-artifact.ts:52,71-*` dispatches `text/document` to a permissive no-op validator.
- Panel chrome in `artifact-panel.tsx` already treats `text/document` specially (split-button download, hidden code tab, special guard around export bytes).

**Upshot:** wiring is already done. Phase 9 work is: define the AST, rewrite the prompt, replace the placeholder renderer, replace the no-op validator, implement the DOCX backend, wire the download route. No new registry entries, no new tab plumbing.

## 2. Goals and Non-Goals

### Goals

1. Match or exceed Claude.ai's `docx` skill on output fidelity. Same library (`docx-js`), same file-format result, identical capability ceiling for v1 features.
2. Deliver a **live A4 preview** in the artifact panel — something Claude.ai's skill does not have.
3. Stream progressively as the LLM writes the AST (like slides do today).
4. Zero sandbox, zero code execution. LLM emits typed JSON; server renders.
5. Single source of truth: one AST → two rendering backends (HTML preview + DOCX export).

### Non-Goals (v1)

- **Math rendering.** No LaTeX, no OMML. Calculations in prose. (v2 lands OMML export.)
- **Mermaid diagrams.** Dropped from v1 scope to keep the schema tight. (v2 returns them as rasterized images.)
- **Tracked changes and comments.** Niche; defer to v3 unless demand appears.
- **Multi-column layouts.** v2.
- **PDF export.** v2 via LibreOffice headless.
- **Inline editing of the preview.** The panel stays read-only.
- **`.md` export.** There is no markdown source anymore; exporting markdown would require a lossy AST→MD converter. Not worth it.

## 3. Decision Log

**D1. Execution model: structured AST, not sandboxed JS.**
Option A (LLM writes `docx-js` JS, server sandbox executes it — Claude.ai's approach) was rejected because (a) no server-side JS sandbox exists in this codebase, (b) no live preview possible without a round-trip through mammoth, (c) streaming is impossible until the script is complete, (d) schema-based validation is strictly safer. The feature-ceiling loss is tolerable: the `SKILL-docx.md` capability list is finite and fits in ~15 node types.

**D2. Input format: JSON AST replaces markdown body.**
Keeping markdown as input would shift the problem to "build a better markdown-to-docx converter" — the exact path that failed in Phases 1–8. We keep `text/markdown` for markdown content; `text/document` is now explicitly structured.

**D3. Preview runtime: Node + React tree-walker, not iframe.**
Documents are static; no scripts to sandbox. Rendering inline (like `text/markdown` does today) avoids iframe overhead and lets the preview inherit panel theming.

**D4. Export runtime: Next.js route handler on Node runtime (not Edge).**
`docx-js` needs Node APIs. The download endpoint will pin `runtime = "nodejs"`.

**D5. Naming: already resolved.**
`text/markdown` was renamed to label "Markdown" in commit `fa98f47`; `text/document` owns "Document". No further renames needed.

**D6. Math policy: hard-block in v1.**
Schema rejects math node types. Prompt forbids `$...$` and `$$...$$`. Calculations in prose. Revisit in v2 with a dedicated `math` node → OMML export + KaTeX preview.

**D7. Images: reuse existing Unsplash resolver.**
Same `unsplash:keyword` protocol HTML/Slides use. Called server-side before persistence. Falls back to `placehold.co`.

## 4. Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  LLM writes DocumentAst JSON via create_artifact / update_artifact│
└──────────────┬────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  _validate-artifact.ts             │
│    validateDocument()              │
│    → JSON.parse → DocumentAstSchema│ ←── Zod
│    → resolveUnsplashInAst()        │ ←── reuses existing resolver
└──────────────┬─────────────────────┘
               │ persist to DB (content = JSON string)
               ▼
 ┌─────────────┴──────────────┐
 │                            │
 ▼                            ▼
┌──────────────────┐   ┌──────────────────────────┐
│ DocumentRenderer │   │ /api/artifacts/[id]/     │
│  (client)        │   │   download?format=docx   │
│                  │   │                          │
│  AST → React     │   │ astToDocx(ast)           │
│  A4 chrome       │   │   → docx-js Document     │
│  Tailwind type   │   │   → Packer.toBuffer      │
│                  │   │   → Response (docx)      │
└──────────────────┘   └──────────────────────────┘
                             │
                             ▼ (v2)
                       ┌──────────────────────────┐
                       │  format=pdf              │
                       │  docx-buf → LibreOffice  │
                       │   headless → pdf buf     │
                       └──────────────────────────┘
```

**Data flow invariants:**
- The DB stores the AST as a JSON string. No other representation.
- Unsplash URIs are resolved **before** persistence — stored AST has real URLs.
- Preview and export consume the **same** AST. No drift possible.

## 5. AST Schema

Lives in `src/lib/document-ast/schema.ts`. Single file, Zod + inferred TS types, no circular imports.

### 5.1 Document

```ts
const DocumentAstSchema = z.object({
  meta: DocumentMetaSchema,
  coverPage: CoverPageSchema.optional(),
  header: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  footer: z.object({ children: z.array(BlockNodeSchema) }).optional(),
  body: z.array(BlockNodeSchema).min(1),
})

const DocumentMetaSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // ISO 8601
  subtitle: z.string().max(200).optional(),
  organization: z.string().max(120).optional(),
  documentNumber: z.string().max(80).optional(),
  pageSize: z.enum(["letter", "a4"]).default("letter"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margins: z.object({
    top: z.number().int().positive().optional(),    // DXA (1440 = 1 inch)
    bottom: z.number().int().positive().optional(),
    left: z.number().int().positive().optional(),
    right: z.number().int().positive().optional(),
  }).optional(),
  font: z.string().default("Arial"),
  fontSize: z.number().int().min(8).max(24).default(12),     // points
  showPageNumbers: z.boolean().default(false),
})

const CoverPageSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  organization: z.string().optional(),
  logoUrl: z.string().url().optional(),       // or unsplash:
})
```

### 5.2 Block Nodes (discriminated union on `type`)

```ts
type BlockNode =
  // Structural
  | { type: "paragraph"; children: InlineNode[];
      align?: "left"|"center"|"right"|"justify";
      spacing?: { before?: number; after?: number };       // DXA
      indent?: { left?: number; hanging?: number; firstLine?: number } }
  | { type: "heading"; level: 1|2|3|4|5|6; children: InlineNode[];
      bookmarkId?: string }
  | { type: "list"; ordered: boolean; startAt?: number; items: ListItem[] }
  | { type: "table"; columnWidths: number[];               // DXA, must sum to width
      width: number;                                       // DXA
      rows: TableRow[];
      shading?: "striped"|"none" }
  | { type: "image"; src: string; alt: string;             // src may be unsplash:
      width: number; height: number;                       // pixels
      caption?: string;
      align?: "left"|"center"|"right" }
  | { type: "blockquote"; children: BlockNode[]; attribution?: string }
  | { type: "codeBlock"; language: string; code: string }
  | { type: "horizontalRule" }
  // Flow control
  | { type: "pageBreak" }
  | { type: "toc"; maxLevel: 1|2|3|4|5|6; title?: string } // auto-built from headings
```

### 5.3 Inline Nodes

```ts
type InlineNode =
  | { type: "text"; text: string;
      bold?: boolean; italic?: boolean; underline?: boolean;
      strike?: boolean; code?: boolean;
      color?: string;                                      // hex #RRGGBB
      superscript?: boolean; subscript?: boolean }
  | { type: "link"; href: string; children: InlineNode[] }           // external
  | { type: "anchor"; bookmarkId: string; children: InlineNode[] }   // internal ref
  | { type: "footnote"; children: BlockNode[] }            // inline ref + body
  | { type: "lineBreak" }
  | { type: "pageNumber" }                                 // legal only in header/footer
  | { type: "tab"; leader?: "none"|"dot" }
```

### 5.4 Table Sub-Types

```ts
type TableRow = {
  isHeader?: boolean;
  cells: TableCell[];
}

type TableCell = {
  children: BlockNode[];
  colspan?: number;
  rowspan?: number;
  shading?: string;             // hex, no #
  align?: "left"|"center"|"right";
  valign?: "top"|"middle"|"bottom";
}
```

### 5.5 List Sub-Types

```ts
type ListItem = {
  children: BlockNode[];                         // typically one paragraph
  subList?: { ordered: boolean; items: ListItem[] }
}
```

### 5.6 Validation Rules Beyond Zod Shape

Enforced in `validateDocumentAst()` after `safeParse`:

1. `table.columnWidths.length` must equal `max(row.cells.length)` accounting for `colspan`.
2. `sum(columnWidths) === width` exactly.
3. Every `anchor.bookmarkId` must reference a `heading.bookmarkId` somewhere in the tree.
4. `pageNumber` inline nodes only allowed inside `header`/`footer`.
5. Total body size cap: **128 KB** of JSON (prevent runaway generations).
6. `image.src` starting with `unsplash:` must have a non-empty keyword after the prefix.
7. No empty `children` arrays on `paragraph`/`heading` — at least one inline node.

## 6. Prompt Rewrite — `src/lib/prompts/artifacts/document.ts`

The current 299-line markdown-oriented ruleset is replaced in full. New structure:

1. **Header** — `type: "text/document"`, `label: "Document"`, `summary: "Formal deliverables authored as a structured JSON document tree — renders as A4 preview and exports to .docx with native Word styling, tables, images, TOC, footnotes, and headers/footers."`
2. **Output format:** raw JSON only, no markdown fences, single top-level object matching `DocumentAst`. Hard-forbid markdown syntax in `text` fields.
3. **When to pick** `text/document` vs `text/markdown` vs `text/html` (reuse the existing heuristic table).
4. **Schema reference** — condensed table of every node type with one-line description + minimal JSON example for each.
5. **Golden patterns** — three full example documents in `examples[]`:
   - Business proposal (cover page, TOC, tables, footnote)
   - Research report (numbered sections, figure with caption, references)
   - Formal letter (letterhead, body, signature block)
   Each is a complete validated `DocumentAst`. These examples also back the CI golden-file tests.
6. **Anti-patterns** — hard list:
   - No markdown syntax (`**bold**`, `## heading`, backticks, pipes) inside `text.text`
   - No empty `children` arrays
   - No `bookmarkId` collisions
   - No math symbols — calculations in prose
   - No mermaid / no chart fenced blocks (not a thing in this schema)
   - No truncation, no `Lorem ipsum`, no `[TODO]`

Total target: ~350 lines (slightly longer than current because of schema reference, offset by removing all the chart/mermaid/math content).

## 7. Preview Renderer — `renderers/document-renderer.tsx`

Replaces the 43-line placeholder.

**Approach:** pure React tree-walker. One pair of switch functions (`renderBlock`, `renderInline`), rendered inside an A4 paper surface.

**Paper chrome:**

```tsx
<div className="overflow-y-auto bg-muted/30 py-10">
  <article
    className="mx-auto bg-white text-slate-900 shadow-md"
    style={{
      width: pageSize === "a4" ? "794px" : "816px",   // 210mm / 8.5in at 96dpi
      minHeight: pageSize === "a4" ? "1123px" : "1056px",
      padding: `${marginTopPx}px ${marginRightPx}px ${marginBottomPx}px ${marginLeftPx}px`,
      fontFamily: meta.font,
      fontSize: `${meta.fontSize}pt`,
      lineHeight: 1.5,
    }}
  >
    {coverPage && <CoverPageBlock {...coverPage} />}
    {header && <HeaderStrip {...header} />}
    {body.map((node, i) => <BlockRender key={i} node={node} />)}
    {footer && <FooterStrip {...footer} />}
  </article>
</div>
```

**Node mapping (selected):**

| AST node | DOM output |
|---|---|
| `paragraph` | `<p style={align, indent, spacing}>` |
| `heading` (h1–h6) | `<h1>`–`<h6>` with `id={bookmarkId}` |
| `list` ordered | `<ol start={startAt}>` with nested items |
| `list` unordered | `<ul>` |
| `table` | `<table>` with `colgroup` sized from `columnWidths` |
| `blockquote` | `<blockquote>` + `<cite>` for attribution |
| `codeBlock` | `<pre><code>` with Shiki highlighting (reuse existing Shiki wrapper) |
| `pageBreak` | decorative `<div>` divider + CSS `break-after: page` (for future print CSS) |
| `toc` | built at render time from tree — scan for `heading` nodes ≤ `maxLevel`, emit anchors |
| `image` | `<figure><img><figcaption>` |
| `footnote` (inline) | superscript `<sup>` with click → scroll to matching collected footnote at bottom |
| `text` | `<span>` with style flags |
| `link` | `<a target="_blank" rel="noopener">` |
| `anchor` | `<a href="#${bookmarkId}">` |

**Streaming:** try `JSON.parse` on each content update; on failure render a "Generating…" skeleton. On first successful parse, render the validated AST. This matches how `slides-renderer.tsx` handles its JSON today (no dedicated partial-json lib needed). If LLM tool-call deltas prove too chatty, debounce parse attempts to every ~80ms.

**Size:** target ≤ 400 lines total. If it grows, split node-specific sub-components into `renderers/document/` subfolder.

## 8. DOCX Export Backend

Lives in `src/lib/document-ast/to-docx.ts`. Pure function `astToDocx(ast: DocumentAst): Promise<Buffer>`.

**Dependency:** re-add `docx@^8` (or latest compatible with Node 20; pin exact version in lockfile). No `docx-preview` — we render preview from AST directly.

**Mapping (one function per node family):**

```ts
function buildStyles(meta: DocumentMeta) { /* default font, heading styles 1-6, outlineLevel */ }
function buildNumbering() { /* "bullets" and "numbers" refs */ }
function renderBody(blocks: BlockNode[], ctx: RenderCtx): (Paragraph|Table|TableOfContents)[] { ... }
function renderBlock(node: BlockNode, ctx): Paragraph|Table|TableOfContents { ... }
function renderInline(node: InlineNode, ctx): TextRun|ExternalHyperlink|InternalHyperlink|FootnoteReferenceRun { ... }
function renderTable(node): Table { /* dual widths, ShadingType.CLEAR, DXA everywhere */ }
function renderListItem(item, level, ref): Paragraph[] { ... }
function renderHeader(ast): Header { ... }
function renderFooter(ast): Footer { ... }
function buildFootnotes(ast): Record<number, FootnoteDefinition> { /* walk tree, collect footnotes in order, number from 1 */ }
```

**Critical rules baked in** (from `SKILL-docx.md`):
- Always `WidthType.DXA`, never `PERCENTAGE`
- Always `ShadingType.CLEAR`, never `SOLID`
- Page size explicit (default US Letter 12240×15840 DXA)
- Override `Heading1`–`Heading6` with `outlineLevel` for TOC
- `LevelFormat.BULLET` numbering refs, never unicode bullets
- `PageBreak` inside a `Paragraph`
- `ImageRun` always has `type`
- Cell `width` + table `columnWidths` + table `width` all consistent

**Validation:** in dev, optionally run `python scripts/office/validate.py` against the generated buffer. In prod, skip (trust the function).

**Image handling:** `image.src` is resolved by the validator to a real URL before export. Export fetches the URL, detects content-type, embeds via `ImageRun({ type: "png"|"jpg"|... })`. 10s timeout per image; on failure, embed a gray placeholder PNG with the alt text.

**Size target:** ≤ 700 lines including helpers.

## 9. Validation Pipeline — `_validate-artifact.ts`

Replace the current no-op for `text/document`:

```ts
async function validateDocument(content: string): Promise<ValidateResult> {
  // 1. Parse JSON
  let raw: unknown
  try { raw = JSON.parse(content) } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` }
  }
  // 2. Zod schema
  const parsed = DocumentAstSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) }
  }
  // 3. Cross-reference and budget rules (§5.6)
  const semanticError = validateSemantics(parsed.data)
  if (semanticError) return { ok: false, error: semanticError }
  // 4. Unsplash resolution (mutates a copy)
  const resolved = await resolveUnsplashInAst(parsed.data)
  // 5. Return canonicalized content
  return { ok: true, content: JSON.stringify(resolved) }
}
```

Invoked by both `create-artifact` and `update-artifact` before DB write.

## 10. Unsplash Resolver Integration

New function `resolveUnsplashInAst(ast: DocumentAst): Promise<DocumentAst>` in `src/lib/document-ast/resolve-unsplash.ts`:

1. Tree-walk, collect every `image.src` starting with `unsplash:` (plus `coverPage.logoUrl` if prefixed).
2. Dedupe keywords.
3. Call existing `searchPhoto()` (reuse; do not reimplement). Cache hits via existing Prisma `resolvedImage` table.
4. Replace each `unsplash:keyword` with the returned URL (or `placehold.co` fallback on failure).
5. Never throws — resolution failures produce placeholders.

## 11. Download Route

Existing path: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/`. Add a `download/route.ts` handler if not present; otherwise extend.

```ts
export const runtime = "nodejs"

export async function GET(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params
  const format = new URL(req.url).searchParams.get("format") ?? "docx"
  const artifact = await fetchArtifact(artifactId)   // auth + org scoping

  if (artifact.artifactType !== "text/document") {
    return new Response("Unsupported type for this endpoint", { status: 400 })
  }

  const ast = DocumentAstSchema.parse(JSON.parse(artifact.content))

  if (format === "docx") {
    const buf = await astToDocx(ast)
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${slug(ast.meta.title)}.docx"`,
      },
    })
  }
  // format === "pdf" reserved for v2
  return new Response("Unsupported format", { status: 400 })
}
```

The existing split-button download UI in `artifact-panel.tsx` already wires to the download endpoint; just update the handler it calls to append `?format=docx`.

**Registry tweak:** change `extension: ".md"` to `extension: ".docx"` on the `text/document` entry in `registry.ts` — the download filename inherits from this.

## 12. Streaming Behavior

The LLM streams tokens via the tool-call content. Partial JSON is accumulated client-side in the canvas state. The renderer uses `partial-json` (transitive through slides; verify) to parse tolerantly:

```ts
let parsed: unknown
try { parsed = JSON.parse(content) } catch { return <SkeletonPaper /> }
const safeAst = DocumentAstSchema.safeParse(parsed)
if (!safeAst.success) return <SkeletonPaper />
return <A4Paper ast={safeAst.data} />
```

If the assistant later emits malformed tool-call deltas we can upgrade to a tolerant parser; not needed day 1.

The export endpoint requires **complete** JSON — if partial, return 409 "Still generating".

## 13. File-by-File Deltas

Absolute paths relative to repo root.

| File | Action | Notes |
|---|---|---|
| `src/lib/document-ast/schema.ts` | **CREATE** | Zod + inferred TS types (~200 lines) |
| `src/lib/document-ast/to-docx.ts` | **CREATE** | AST → docx-js Buffer (~700 lines) |
| `src/lib/document-ast/resolve-unsplash.ts` | **CREATE** | Tree-walk + resolver call (~80 lines) |
| `src/lib/document-ast/validate.ts` | **CREATE** | Zod + semantic checks (~150 lines) |
| `src/lib/document-ast/examples/proposal.ts` | **CREATE** | Golden fixture #1 |
| `src/lib/document-ast/examples/report.ts` | **CREATE** | Golden fixture #2 |
| `src/lib/document-ast/examples/letter.ts` | **CREATE** | Golden fixture #3 |
| `src/lib/prompts/artifacts/document.ts` | **REWRITE** | Drop markdown rules, add AST schema reference + 3 examples (~350 lines) |
| `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx` | **REWRITE** | Replace placeholder with real renderer (~400 lines) |
| `src/features/conversations/components/chat/artifacts/renderers/document/` | **CREATE** | Sub-components if renderer grows past 400 lines |
| `src/lib/tools/builtin/_validate-artifact.ts` | **EDIT** | Replace no-op `validateDocument` with real implementation |
| `src/features/conversations/components/chat/artifacts/registry.ts` | **EDIT** | Change `extension: ".md"` → `".docx"` |
| `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts` | **CREATE or EDIT** | Serve `format=docx` for `text/document` |
| `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` | **EDIT** | Minimal — verify split-button download posts with `?format=docx`; drop any legacy `.md` path |
| `package.json` + `bun.lock` | **EDIT** | Re-add `docx@^8.x` |
| `tests/unit/document-ast/schema.test.ts` | **CREATE** | Zod happy/sad paths |
| `tests/unit/document-ast/to-docx.test.ts` | **CREATE** | Golden-file tests: render each fixture, check buffer validates with `validate.py` |
| `tests/unit/document-ast/resolve-unsplash.test.ts` | **CREATE** | Mock resolver, verify tree mutation |

## 14. Phased Delivery

**v1 (this plan):**
- All 9 v1 features from the scope matrix
- AST schema, validator, renderer, DOCX export, Unsplash, create/update/download wiring
- 3 golden fixtures, CI goldens run `validate.py`
- Extension flipped to `.docx`

**v2 (next plan, separate doc):**
- Math: new `math` block and inline node types → OMML export, KaTeX preview
- Mermaid: new `mermaid` block → rasterize to PNG via `@mermaid-js/mermaid-cli` (headless Chromium) or equivalent, embed as `image` during export
- Multi-column: `sectionBreak { columns }` becomes load-bearing
- PDF export: `format=pdf` → `libreoffice --headless --convert-to pdf` on the docx buffer
- Tab stops with dot leaders (beyond TOC)

**v3 (if demanded):**
- Tracked changes: `trackedInsert`/`trackedDelete` inline node types
- Comments: `comment` node with threaded replies

## 15. Test Strategy

1. **Schema tests:** round-trip every fixture through `JSON.stringify → parse → Zod`. Sad paths for each cross-ref rule.
2. **Golden-file tests:** for each fixture, `astToDocx` → write to tmp → run `validate.py` (if LibreOffice available in CI) OR parse with `mammoth` and assert on extracted text. Failing LibreOffice is non-blocking; the mammoth path is the mandatory gate.
3. **Renderer tests:** snapshot-test the React output for each fixture at a fixed window size. Visual diffing via Playwright is optional v1.
4. **Capability parity matrix:** a checklist (see §17) kept in `docs/artifact-plans/2026-04-23-text-document-design.md` (this file) — one row per `SKILL-docx.md` feature, one column per v-phase, one column for "covered in v1 test fixture".

## 16. Open Risks

1. **`docx` library version drift.** Pin exact version in `package.json`. Library has historically made breaking changes at major versions. Mitigation: golden files catch silent format regressions at upgrade time.
2. **AST size blowup.** A 50-page report could exceed the 128 KB cap. Mitigation: raise cap to 512 KB if real usage demands; add compression (gzipped content in DB) only if it becomes hot.
3. **Image fetch latency in export.** Remote image downloads during export serialize the response. Mitigation: parallelize fetches with `Promise.all`; 10s timeout each; placeholder on timeout.
4. **No live pagination in preview.** The A4 chrome is a "first page" illusion. Users may expect real page breaks. Mitigation: add CSS `@page` and rule: `.page-break { break-after: page; }`. Consider `paged.js` for v2 if users ask.
5. **Partial-json parse cost on every token.** For very long documents, parsing cost grows. Mitigation: debounce to ~50ms on the render path; or parse incrementally at known commas.
6. **Loss of chart/mermaid capability from the old markdown pipeline.** Users who relied on ` ```chart ` / ` ```mermaid ` blocks inside documents will be surprised. Mitigation: explicit message in prompt anti-patterns; roadmap to v2; for urgent cases, users can compose a separate `application/mermaid` or `application/slides` artifact.

## 17. Capability Matrix vs `SKILL-docx.md`

| Feature | Skill-docx approach | Our AST node | v1 | v2 | v3 |
|---|---|---|:-:|:-:|:-:|
| Paragraphs with alignment, indent | `Paragraph` | `paragraph` | ✅ | | |
| Headings H1–H6 with outline level | `Paragraph{heading: HeadingLevel.X}` + style override | `heading` | ✅ | | |
| Bold / italic / underline / strike / code | `TextRun` flags | `text` flags | ✅ | | |
| Hyperlinks external | `ExternalHyperlink` | `link` | ✅ | | |
| Internal anchors / bookmarks | `Bookmark` + `InternalHyperlink` | `anchor` + `heading.bookmarkId` | ✅ | | |
| Bulleted + numbered lists (nested) | `LevelFormat.BULLET/DECIMAL` numbering refs | `list` | ✅ | | |
| Tables (dual width, shading, borders) | `Table` + `columnWidths` + cell `width` | `table` | ✅ | | |
| Images (embed) | `ImageRun{type}` | `image` | ✅ | | |
| Unsplash protocol | n/a (our extension) | `image.src = "unsplash:…"` | ✅ | | |
| Page breaks | `PageBreak` in `Paragraph` | `pageBreak` | ✅ | | |
| Page size + margins | section `properties.page` | `meta` | ✅ | | |
| Landscape | `PageOrientation.LANDSCAPE` | `meta.orientation` | ✅ | | |
| Headers + footers | section `headers`/`footers` | `header`/`footer` | ✅ | | |
| Page numbers | `PageNumber.CURRENT` in footer | `pageNumber` inline | ✅ | | |
| Table of Contents | `TableOfContents` | `toc` | ✅ | | |
| Footnotes | doc-level `footnotes` + `FootnoteReferenceRun` | `footnote` inline | ✅ | | |
| Cover page / frontmatter | hand-built first-page block | `coverPage` | ✅ | | |
| Blockquote | `Paragraph` + left border | `blockquote` | ✅ | | |
| Code block | `Paragraph` mono font + shading | `codeBlock` | ✅ | | |
| Horizontal rule | `Paragraph` border-bottom | `horizontalRule` | ✅ | | |
| Line break | `break: 1` on `TextRun` | `lineBreak` | ✅ | | |
| Color on text | `TextRun{color}` | `text.color` | ✅ | | |
| Superscript / subscript | `TextRun{superScript/subScript}` | `text.superscript/subscript` | ✅ | | |
| Tab stops (basic) | `tabStops` on `Paragraph` | `tab` inline | ✅ | | |
| Math equations | OMML native | `math` (new) | | ✅ | |
| Mermaid diagrams | image raster | `mermaid` (new) → raster | | ✅ | |
| Multi-column layouts | section `properties.column` | `sectionBreak{columns}` | | ✅ | |
| Tab stops with dot leader (TOC-style outside TOC) | `PositionalTab{leader:DOT}` | `tab{leader:"dot"}` | | ✅ | |
| PDF export | LibreOffice headless | — | | ✅ | |
| Tracked changes | `<w:ins>` / `<w:del>` | `trackedInsert`/`trackedDelete` | | | ✅ |
| Comments | `comment.py` + `<w:commentRangeStart>` | `comment` inline | | | ✅ |

**v1 coverage: 25 of ~31 features = 80%.** The six deferred items are math, mermaid, multi-column, dot-leader tabs outside TOC, PDF export, tracked changes/comments. Every v1 feature is present in at least one of the three golden fixtures.

## 18. Acceptance Criteria

1. Creating a `text/document` artifact via the assistant produces a live A4 preview within 2 seconds of generation start.
2. Preview streams progressively as the LLM writes — no blank panel until complete.
3. Downloaded `.docx` opens cleanly in Microsoft Word 365 (Mac + Windows), Google Docs, and LibreOffice Writer with no "repair" dialog.
4. All 25 v1 features appear in at least one fixture; each fixture exports to a valid `.docx` and passes `validate.py` if available in CI.
5. TypeScript clean (`bun run typecheck`).
6. `bun test` green for all new tests.
7. No new lint errors.
8. Extension in registry is `.docx` (not `.md`).

## 19. Non-Standard Notes

- **Naming convention:** `DocumentAst` (not `TextDocumentAst`) because the type id `text/document` already carries the namespace.
- **The prompt file may exceed 350 lines** if schema reference grows. Accept up to 450 lines before splitting examples to their own import.
- **When adding a new node type later, the path is:** schema.ts → to-docx.ts → document-renderer.tsx → prompt doc → tests. Four files, one PR. Future node types should follow this order.
