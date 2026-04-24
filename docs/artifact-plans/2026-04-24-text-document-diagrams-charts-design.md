# `text/document` v1.1 — Mermaid Diagrams & Native Charts

> **Status:** draft, pending user review → `writing-plans` skill
> **Depends on:** v1 (branch `feat/text-document-ast`, 7 commits, landing at `4e3c466` + cleanup `56bddd4`)
> **Addresses:** §5 (Mermaid out of scope) + §15.6 (chart/mermaid loss risk) of `2026-04-23-text-document-design.md`
> **Fixes:** live mermaid sizing bug in `application/slides` PPTX export (`svg-to-png.ts:55`)

## 1. Problem

The v1 `text/document` schema deliberately dropped mermaid and data charts to keep the node set tight. Two issues surfaced:

1. **Capability inversion.** `text/markdown` supports mermaid fenced blocks, but `text/document` — the richer, docx-grade artifact — does not. Users who need diagrams embedded in a formal document have no path and are forced to downgrade to markdown.
2. **Sibling precedent.** `application/slides` already ships first-class diagram + chart surface (17 layouts, 6 of which embed diagrams or charts) via `mermaidToBase64Png` / `chart-to-svg.ts` / `svg-to-png.ts`. Two document-class artifacts with inconsistent capability sets hurts LLM prompt engineering and user mental model.

Additionally, slides' own mermaid rendering has a latent sizing bug: diagrams render at their intrinsic size (e.g. 300×150) and are drawn centered inside the target canvas (e.g. 1200×800), leaving ~94% of the canvas as whitespace. Charts are unaffected because `chart-to-svg.ts` emits SVGs already sized to target. Root cause: `Math.min(scaleX, scaleY, 1)` in `svg-to-png.ts:55` clamps fit-scale at 1, refusing to upscale.

## 2. Goals

1. Add `mermaid` and `chart` block nodes to `DocumentAst` — first-class citizens alongside `paragraph`, `heading`, `image`, etc.
2. Re-use the `ChartData` type and chart renderer already defined in `src/lib/slides/` so there is one source of truth for chart shape across artifacts.
3. Render both for the preview (inline SVG) and for the docx export (rasterized PNG embed).
4. Fix the slides mermaid sizing bug as a side-effect of the shared-module migration (Option 2 — see §4).
5. Zero new runtime deps — `mermaid@11`, `jsdom@29`, `sharp@0.34` are already installed.

## 3. Non-Goals

- Interactive/editable diagrams in the preview (SVG is static; clicking nodes does nothing).
- Native docx `<c:chart>` (OOXML chart) — charts are rasterized PNG, same as slides. Native charts are a separate v1.2 story if demand appears.
- PDF export (still deferred to v2).
- Arbitrary imagemap/click behaviors on embedded images.

## 4. Architecture — Option 2 (shared rendering module)

Three options were considered; Option 2 is adopted. See the conversation transcript for rejected alternatives (Opt 1 = duplicate code; Opt 3 = partial share).

### 4.1 Module layout

```
src/lib/rendering/
├── chart-to-svg.ts          (moved from src/lib/slides/, isomorphic, pure D3)
├── resize-svg.ts            (NEW, isomorphic — rewrite <svg> width/height attrs)
├── client/
│   ├── svg-to-png.ts        (moved from slides, Canvas API; BUG FIX: remove `, 1` clamp)
│   └── mermaid-to-png.ts    (moved from slides; re-exports mermaidToBase64Png)
└── server/
    ├── svg-to-png.ts        (NEW — sharp lanczos3 + white flatten, takes svg string → PNG Buffer)
    └── mermaid-to-svg.ts    (NEW — jsdom window shim + mermaid.render(), returns svg string)
```

### 4.2 Surface-specific consumption

| Consumer | Runtime | Uses |
|---|---|---|
| `src/lib/slides/generate-pptx.ts` (existing) | client / browser | `rendering/client/svg-to-png` + `rendering/client/mermaid-to-png` + `rendering/chart-to-svg` |
| `src/lib/slides/render-html.ts` (existing) | server (SSR) | `rendering/chart-to-svg` (pure) |
| `src/lib/document-ast/to-docx.ts` (new renderers) | server (nodejs runtime on download route) | `rendering/server/svg-to-png` + `rendering/server/mermaid-to-svg` + `rendering/chart-to-svg` + `rendering/resize-svg` |
| `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx` (preview) | client | reuses existing `mermaid-renderer.tsx` pattern (mermaid.render) + `rendering/chart-to-svg` inline |

### 4.3 Bug fix

`src/lib/rendering/client/svg-to-png.ts`:
```diff
- const fitScale = Math.min(scaleX, scaleY, 1)
+ const fitScale = Math.min(scaleX, scaleY)
```
Plus set `ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"` before the `drawImage` call for crisp upscales.

Slides' existing imports are mechanically rewritten to `@/lib/rendering/client/*`; slides test behavior is unchanged except that previously-shrunk mermaid diagrams now fill their target bounds.

### 4.4 Server-side mermaid via jsdom

`rendering/server/mermaid-to-svg.ts`:
```ts
import { JSDOM } from "jsdom"

export async function mermaidToSvg(code: string): Promise<string> {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="mm"/></body>`, {
    pretendToBeVisual: true,
  })
  const g = globalThis as any
  const prev = { window: g.window, document: g.document, DOMParser: g.DOMParser }
  g.window = dom.window; g.document = dom.window.document; g.DOMParser = dom.window.DOMParser
  try {
    const mermaid = (await import("mermaid")).default
    mermaid.initialize({ startOnLoad: false, theme: "base", /* same theme vars as slides */ })
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, code.trim(), dom.window.document.getElementById("mm")!)
    return svg
  } finally {
    g.window = prev.window; g.document = prev.document; g.DOMParser = prev.DOMParser
    dom.window.close()
  }
}
```
Caveats:
- `mermaid` is dynamic-imported to avoid pulling browser deps into Node code paths at module load.
- Globals are swapped back in `finally` to avoid leaking a stale `window` across the Node process.
- Concurrent renders share the mermaid singleton — if this becomes contentious later, wrap with a mutex. v1.1 workloads are small (a few diagrams per document), so no mutex initially.

### 4.5 Server-side rasterization via sharp

`rendering/server/svg-to-png.ts`:
```ts
import sharp from "sharp"

export async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize(width, height, {
      fit: "contain",
      background: "#FFFFFF",
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: "#FFFFFF" })
    .png({ compressionLevel: 6 })
    .toBuffer()
}
```

### 4.6 SVG attribute resizing helper

`rendering/resize-svg.ts` (isomorphic — pure regex):
```ts
export function resizeSvg(svg: string, width: number, height: number): string {
  return svg.replace(/<svg([^>]*)>/, (_, attrs) => {
    const cleaned = attrs
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/\spreserveAspectRatio="[^"]*"/g, "")
    return `<svg${cleaned} width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`
  })
}
```
Called before `svgToPng` so the rasterizer receives an SVG that already declares target dimensions. `sharp.resize()` is then a no-op on dimensions and only serves as the quality kernel + flatten path. Belt-and-braces — either code path alone fills the canvas; combined, there is no whitespace regardless of quirks in either library.

## 5. Schema changes (`src/lib/document-ast/schema.ts`)

### 5.1 New block node: `mermaid`

```ts
z.object({
  type: z.literal("mermaid"),
  code: z.string().min(1).max(10_000),
  caption: z.string().max(200).optional(),
  width: z.number().int().positive().min(200).max(1600).optional().default(1200),
  height: z.number().int().positive().min(150).max(1200).optional().default(800),
  alt: z.string().max(500).optional(), // accessibility alt-text for the rendered PNG
})
```

### 5.2 New block node: `chart`

```ts
import { ChartDataSchema } from "@/lib/slides/types.zod" // new Zod mirror of existing ChartData type

z.object({
  type: z.literal("chart"),
  chart: ChartDataSchema,
  caption: z.string().max(200).optional(),
  width: z.number().int().positive().min(200).max(1600).optional().default(1200),
  height: z.number().int().positive().min(150).max(1200).optional().default(600),
  alt: z.string().max(500).optional(),
})
```

### 5.3 `ChartDataSchema`

`src/lib/slides/types.ts` currently defines `ChartData` as a TypeScript type only (no Zod). We add `src/lib/slides/types.zod.ts` that mirrors it 1:1 in Zod — single source of truth for the SHAPE remains `types.ts`, and `types.zod.ts` is asserted at type-level to match (`type _ = asserts<ChartData, z.infer<typeof ChartDataSchema>>`). This unlocks slides' own validator (currently string-based at `validateSlides`) to start using the Zod schema too in a future tidy-up (out of scope for v1.1).

## 6. Semantic validation (`src/lib/document-ast/validate.ts`)

Two new rules in `validateDocumentAst`:

- **`mermaid`**: trim whitespace → reject empty; reject if first non-empty line doesn't match the mermaid diagram-type allowlist (`flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `journey`, `c4Context`, `gitGraph`). Model-level syntax errors are caught at export time by `mermaid.parse()`; validator is a fast fail for obvious mistakes.
- **`chart`**: delegate to `ChartDataSchema` (handled by discriminatedUnion already); no extra checks needed.

## 7. Preview renderer (`document-renderer.tsx`)

Two new cases in `renderBlock`:

- **`mermaid`**: reuse the effect pattern from `mermaid-renderer.tsx` (mermaid.render in `useEffect`, inject SVG with `dangerouslySetInnerHTML`, handle parse errors inline).
- **`chart`**: call `chartToSvg(node.chart, { width, height })` synchronously in render — pure string output — and inject via `dangerouslySetInnerHTML`.

Captions render as a small centered `<figcaption>` below each figure.

## 8. Docx export (`to-docx.ts`)

Two new renderers wired into the existing `renderBlock` switch:

### 8.1 `renderMermaid`

```ts
async function renderMermaid(
  node: Extract<BlockNode, { type: "mermaid" }>,
  ctx: RenderContext,
) {
  const w = node.width ?? 1200
  const h = node.height ?? 800
  try {
    const rawSvg = await mermaidToSvg(node.code)
    const sizedSvg = resizeSvg(rawSvg, w, h)
    const pngBuffer = await svgToPng(sizedSvg, w, h)
    return makeImagePara(pngBuffer, w, h, node.alt ?? node.caption ?? "Diagram")
  } catch {
    return makeFallbackPara(node.caption ?? "[Diagram failed to render]", node.alt)
  }
}
```

### 8.2 `renderChart`

```ts
async function renderChart(
  node: Extract<BlockNode, { type: "chart" }>,
  ctx: RenderContext,
) {
  const w = node.width ?? 1200
  const h = node.height ?? 600
  const rawSvg = chartToSvg(node.chart, { width: w, height: h })
  const sizedSvg = resizeSvg(rawSvg, w, h)
  const pngBuffer = await svgToPng(sizedSvg, w, h)
  return makeImagePara(pngBuffer, w, h, node.alt ?? node.caption ?? "Chart")
}
```

Both use a shared `makeImagePara` helper that wraps an `ImageRun` in a centered `Paragraph` followed by an optional italic caption paragraph.

## 9. Prompt changes (`src/lib/prompts/artifacts/document.ts`)

- **Remove** the "❌ Mermaid or chart fenced blocks — those belong in `text/markdown`" anti-pattern (line 262).
- **Add** a `Mermaid block` section explaining: when to use, allowed diagram types, size limits (≤ 10k chars, ≤ 15 nodes recommended), keep it simple, no markdown fences around the `code` field.
- **Add** a `Chart block` section pointing at the same `ChartData` schema rules already in `src/lib/prompts/artifacts/slides.ts` (cross-link, don't duplicate) with a short inline example.
- **Update** one golden fixture (prefer `report` — a research report is the realistic use-case) to include one `mermaid` block (a simple flowchart) and one `chart` block (a bar chart of data).

## 10. Validator wiring (`_validate-artifact.ts`)

No changes needed at the dispatch level — `validateDocument` already runs the AST through the schema. The discriminatedUnion picks up new node types automatically. The Unsplash resolver runs over `image` nodes only and is unchanged.

## 11. Tests

New tests (mirroring existing `to-docx.test.ts` / `document-renderer.test.tsx` patterns):

- `tests/unit/rendering/chart-to-svg.test.ts` (moved) — ensures isomorphic SVG generation matches snapshot.
- `tests/unit/rendering/resize-svg.test.ts` — single-attr rewrite, multiple-attr rewrite, missing-attr insert, preserveAspectRatio override.
- `tests/unit/rendering/server/svg-to-png.test.ts` — sharp round-trip, white fill, upscale works.
- `tests/unit/rendering/server/mermaid-to-svg.test.ts` — renders a flowchart end-to-end on Node, returns non-empty SVG with `<svg>` root.
- `tests/unit/rendering/client/svg-to-png.test.ts` — jsdom-backed, asserts scaleOK for upscale case (the bug fix regression test).
- `tests/unit/document-ast/to-docx.test.ts` — new cases: mermaid block in doc produces docx with embedded image; chart block likewise; captions render as figcaption paragraphs.
- `tests/unit/document-ast/validate.test.ts` — new cases: reject empty mermaid `code`, reject unknown diagram type prefix, accept valid chart block.
- `tests/unit/document-ast/schema.test.ts` — discriminatedUnion accepts both new types with defaults.

Rollback of the `, 1` clamp should be matched by a regression test that renders a small SVG into a large target and asserts `fitScale > 1` (via stubbing `drawImage` to capture its scale arg).

## 12. Migration steps (execution order)

A separate implementation plan (`2026-04-24-text-document-diagrams-charts-plan.md`) will enumerate per-task TDD cycles. The high-level order:

1. **Relocate shared primitives** — move `chart-to-svg.ts`, create `rendering/client/svg-to-png.ts` from slides' copy, create `rendering/client/mermaid-to-png.ts` from slides' copy, update slides imports, run slides tests green. **Commits in small chunks** so each one is reviewable.
2. **Bug fix + regression test** — remove `, 1` clamp, add regression test in `rendering/client/svg-to-png.test.ts`.
3. **New isomorphic helper** — `resize-svg.ts` + tests.
4. **New server helpers** — `server/svg-to-png.ts`, `server/mermaid-to-svg.ts` + tests.
5. **Zod mirror of ChartData** — `slides/types.zod.ts` + type-assertion test.
6. **Schema extension** — add `mermaid` + `chart` block nodes to `DocumentAst`, schema.test.ts cases.
7. **Semantic validator extension** — reject empty mermaid code / unknown diagram type, validate.test.ts cases.
8. **Docx export** — `renderMermaid`, `renderChart`, wire into `renderBlock`, to-docx.test.ts cases.
9. **Preview renderer** — new cases in `document-renderer.tsx`, document-renderer.test.tsx cases.
10. **Prompt rewrite** — flip anti-pattern, add new sections, update golden fixture.
11. **End-to-end smoke** — regenerate 3 sample docx files (proposal/report/letter) with diagrams + charts injected into the `report` fixture, mammoth-verify text content, visual check recommended.

Each task ends with `bun run test -- --run` green + targeted typecheck clean.

## 13. PR split (per conversation with user)

Two PRs, sequential:

- **PR 1** — steps 1–2: relocate shared primitives + mermaid sizing bug fix.
  - Shippable on its own; fixes a visible bug in slides' existing PPTX export.
  - ~7 files changed (moves + 2-line fix + 1 regression test), tests remain green.
  - Risk: minimal (mechanical moves + one-line fix); rollback by reverting the two commits.
- **PR 2** — steps 3–11: text/document mermaid + chart feature.
  - Builds on PR 1's relocation.
  - ~15 files changed, mostly new code.
  - Risk: feature-scoped; no existing behavior changes.

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `jsdom` + `mermaid@11` incompatibility on Node (mermaid assumes browser globals beyond `window`/`document`) | medium | export fails → fallback caption paragraph | try-catch at render site; unit test mermaid-to-svg on CI; if breakage, fallback to `@mermaid-js/mermaid-cli` but with explicit Chromium note (would reopen Opt A tradeoff) |
| `sharp` cold-start latency on serverless / first request | low | +300ms on first docx download | acceptable for a download endpoint; document in route comment |
| SVG → PNG on mermaid with custom fonts → fallback font | medium | diagram text looks generic | set `fontFamily: "system-ui, -apple-system, sans-serif"` in mermaid theme (same as slides); document fixed font list in prompt |
| Slides behavior change surprises slides users (mermaid now fills canvas) | low | visual: better, but different | PR 1 commit message explicitly calls out the improved sizing as user-visible; no opt-out needed because bug always produced worse output |
| Zod-mirror of `ChartData` drifts from TypeScript `ChartData` | low | runtime validation diverges | type-level assertion `type _ = Assert<ChartData, z.infer<typeof ChartDataSchema>>` fails at compile time if they diverge |
| Concurrent mermaid renders on the server (singleton contention) | low | potential cross-request state leak | jsdom window is created fresh per call + globals restored in `finally`; if pressure observed later, wrap in p-limit(1) |

## 15. Acceptance criteria

1. `bun run test -- --run` passes on the branch with ≥ existing pass count + new test count.
2. `bunx tsc --noEmit` reports zero new errors in rendering/*, document-ast/*, slides/*.
3. End-to-end smoke: running the existing smoke harness (from v1) on an updated `report` fixture produces a docx that:
   - Is a valid zip (`PK\x03\x04` magic)
   - Contains `word/media/image*.png` entries (mermaid + chart embedded as images)
   - `mammoth.extractRawText` contains the report body text
4. Slides' mermaid-containing decks now produce PPTX with full-canvas diagrams (manual visual verification on one existing deck — user supplies).
5. Design doc approved by user; implementation plan approved by user; executing-plans skill completes all tasks green.

## 16. Open questions

None outstanding after the conversation leading to this spec. If any emerge during plan-writing, they will be logged in §16 of `2026-04-24-text-document-diagrams-charts-plan.md`.
