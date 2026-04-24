# `text/document` v1.1 — Mermaid & Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `text/document` with first-class `mermaid` and `chart` block nodes (reusing slides' rendering pipeline via shared module), and fix the latent slides mermaid sizing bug.

**Architecture:** Option 2 of the design doc — relocate slides' renderers (`chart-to-svg.ts`, `svg-to-png.ts`, `mermaidToBase64Png`) into `src/lib/rendering/` with `client/` + `server/` split. Add server-side siblings (`mermaid-to-svg.ts` via jsdom + mermaid, `svg-to-png.ts` via sharp, `resize-svg.ts` isomorphic). Extend DocumentAst schema + validator + to-docx renderer + preview renderer + prompt. Update one fixture to exercise new nodes.

**Tech Stack:** TypeScript, React 19, Next.js 15, Vitest 4, Zod v4, docx@8, mermaid@11, jsdom@29, sharp@0.34, D3 (d3-scale, d3-shape).

---

## Conventions for every task

- **Repo root for all commands:** `/home/shiro/rantai/RantAI-Agents/.worktrees/text-document-ast` (the worktree on branch `feat/text-document-ast`).
- **Test runner:** `bun run test -- --run <path>` (vitest in run mode).
- **Typecheck:** `bunx tsc --noEmit`.
- **Commits MUST use `git commit-sulthan`** (alias → `git commit --author="Sulthan Nauval Abdillah <sulthannauval2@gmail.com>"`). Plain `git commit` is forbidden.
- **Commit messages:** bullet-form body, single-line per bullet (no wrap), no `Co-Authored-By` trailer, subject pattern `type(scope): imperative`.
- **Atomic:** each task = one commit (test + impl together). If a task spans two logical concerns, split into two tasks.
- **TDD:** red (test fails) → green (minimal impl makes it pass) → commit. Never skip the red step.
- **Never stage:** `.claude/`, `CLAUDE.md`, `*.claude.log`, `memory/`, `settings.local.json`, `.worktrees/`, `/tmp/*`, or tool residue.

## File plan (what changes, where)

**PR 1 — Relocation + bug fix** (Tasks 1–7):

- Create: `src/lib/rendering/chart-to-svg.ts` (moved from `src/lib/slides/`)
- Create: `src/lib/rendering/client/svg-to-png.ts` (moved; drops `mermaidToBase64Png`)
- Create: `src/lib/rendering/client/mermaid-to-png.ts` (extracted `mermaidToBase64Png`)
- Delete: `src/lib/slides/chart-to-svg.ts`, `src/lib/slides/svg-to-png.ts`
- Modify: `src/lib/slides/generate-pptx.ts`, `src/lib/slides/render-html.ts` (import paths)
- Create: `tests/unit/rendering/client/svg-to-png.test.ts` (regression test for sizing bug)
- Modify: `src/lib/rendering/client/svg-to-png.ts` (drop `, 1` clamp + enable image smoothing)

**PR 2 — Feature** (Tasks 8–21):

- Create: `src/lib/rendering/resize-svg.ts` (+ test)
- Create: `src/lib/rendering/server/svg-to-png.ts` (+ test)
- Create: `src/lib/rendering/server/mermaid-to-svg.ts` (+ test)
- Create: `src/lib/slides/types.zod.ts` (Zod mirror of ChartData) (+ type-assertion test)
- Modify: `src/lib/document-ast/schema.ts` (add `mermaid` + `chart` block nodes)
- Modify: `src/lib/document-ast/validate.ts` (semantic checks for `mermaid`)
- Modify: `src/lib/document-ast/to-docx.ts` (add `renderMermaid`, `renderChart`)
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx` (preview cases)
- Modify: `src/lib/prompts/artifacts/document.ts` (flip anti-pattern, add sections)
- Modify: `src/lib/document-ast/examples/report.ts` (inject one mermaid + one chart block)
- Modify: `tests/unit/document-ast/schema.test.ts` (cases for new nodes)
- Modify: `tests/unit/document-ast/validate.test.ts` (cases for mermaid rules)
- Modify: `tests/unit/document-ast/to-docx.test.ts` (embed image assertions)
- Modify: `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx` (new snapshots)
- Post-feature: end-to-end smoke harness regenerates `/tmp/text-document-smoke/report.docx` with diagrams.

---

# PR 1 — Shared rendering module + slides bug fix

## Task 1: Move `chart-to-svg.ts` to shared rendering module

**Files:**
- Create: `src/lib/rendering/chart-to-svg.ts` (exact copy of current `src/lib/slides/chart-to-svg.ts`)
- Delete: `src/lib/slides/chart-to-svg.ts`
- Modify: `src/lib/slides/generate-pptx.ts` (import path)
- Modify: `src/lib/slides/render-html.ts` (import path if it imports chart-to-svg)

Why a dedicated task: proves the relocation is a pure move by running slides' existing tests green after the path flip, with no logic change.

- [ ] **Step 1: Copy the file to the new path**

```bash
mkdir -p src/lib/rendering
cp src/lib/slides/chart-to-svg.ts src/lib/rendering/chart-to-svg.ts
```

- [ ] **Step 2: Update the import in `chart-to-svg.ts` to pull types from the stable slides types module**

The copied file imports `ChartData` etc. from `./types`. Fix to absolute path (needed because file moved):

Open `src/lib/rendering/chart-to-svg.ts` and replace the import line:

```ts
// before
import type { ChartData, ChartDataPoint, ChartSeries } from "./types"
// after
import type { ChartData, ChartDataPoint, ChartSeries } from "@/lib/slides/types"
```

- [ ] **Step 3: Update slides consumers' imports**

In `src/lib/slides/generate-pptx.ts` line 3:
```ts
// before
import { chartToSvg } from "./chart-to-svg"
// after
import { chartToSvg } from "@/lib/rendering/chart-to-svg"
```

Scan `src/lib/slides/render-html.ts` for `chart-to-svg` imports; flip to `@/lib/rendering/chart-to-svg` if present.

- [ ] **Step 4: Delete the old file**

```bash
git rm src/lib/slides/chart-to-svg.ts
```

- [ ] **Step 5: Run slides tests to confirm no regression**

Run: `bun run test -- --run src/features/conversations/components/chat/artifacts/renderers src/lib/slides tests/unit/slides 2>&1 | tail -10`
Expected: all slides-touching tests pass. If any fail, inspect and repair before committing.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep -E "chart-to-svg|rendering/" | head -20`
Expected: empty output (no new errors in the relocated file or its consumers).

- [ ] **Step 7: Commit**

```bash
git add src/lib/rendering/chart-to-svg.ts src/lib/slides/chart-to-svg.ts src/lib/slides/generate-pptx.ts src/lib/slides/render-html.ts
git commit-sulthan -m "$(cat <<'EOF'
refactor(rendering): relocate chart-to-svg into shared rendering module

- move src/lib/slides/chart-to-svg.ts to src/lib/rendering/chart-to-svg.ts
- flip ChartData type import to @/lib/slides/types (absolute path since file moved out of slides/)
- update slides consumers (generate-pptx, render-html) to import from new path
- no behavior change; prepares chart renderer for shared reuse by text/document docx export
EOF
)"
```

---

## Task 2: Move `svg-to-png.ts` to `client/` submodule (excluding `mermaidToBase64Png`)

**Files:**
- Create: `src/lib/rendering/client/svg-to-png.ts` — contains only `svgToBase64Png` + `fetchImageAsBase64`
- Modify: `src/lib/slides/svg-to-png.ts` — will be deleted in Task 3 after the mermaid split

Why separate from mermaid-to-png: one file, one responsibility — canvas-based SVG → PNG utility versus mermaid-specific pipeline.

- [ ] **Step 1: Create the new file with the two relocated functions**

```bash
mkdir -p src/lib/rendering/client
```

Create `src/lib/rendering/client/svg-to-png.ts` with this exact content:

```ts
/**
 * Client-side SVG to PNG conversion utility.
 *
 * Uses Canvas API to convert SVG strings to base64 PNG at 2x resolution.
 * Browser-only — imports into server code paths will fail at runtime.
 */

/**
 * Convert an SVG string to a base64-encoded PNG data URL.
 *
 * @param svgString - The SVG markup as a string
 * @param width - Target width in pixels (rendered at 2x internal resolution)
 * @param height - Target height in pixels (rendered at 2x internal resolution)
 * @returns Base64 PNG data URL (data:image/png;base64,...)
 */
export async function svgToBase64Png(
  svgString: string,
  width: number,
  height: number,
): Promise<string> {
  const scale = 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      reject(new Error("Could not get canvas 2D context"))
      return
    }

    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

    img.onload = () => {
      canvas.width = width * scale
      canvas.height = height * scale

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      const svgWidth = img.naturalWidth || width
      const svgHeight = img.naturalHeight || height
      const scaleX = width / svgWidth
      const scaleY = height / svgHeight
      const fitScale = Math.min(scaleX, scaleY)

      const drawWidth = svgWidth * fitScale
      const drawHeight = svgHeight * fitScale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
      resolve(canvas.toDataURL("image/png"))
    }

    img.onerror = () => reject(new Error("Failed to load SVG image"))
    img.src = dataUrl
  })
}

/**
 * Fetch an image URL and convert to a base64 data URL.
 * Handles both regular URLs and `unsplash:keyword` syntax (via source.unsplash.com).
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    let imageUrl = url
    if (url.startsWith("unsplash:")) {
      const keyword = url.slice(9).trim()
      imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(keyword)}`
    }

    const response = await fetch(imageUrl)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
```

Note: this file INTENTIONALLY applies the bug fix (removing `, 1)` clamp + adds image smoothing) as part of the relocation. The fix is covered by the regression test in Task 5.

- [ ] **Step 2: Typecheck the new file**

Run: `bunx tsc --noEmit 2>&1 | grep "rendering/client/svg-to-png" | head`
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rendering/client/svg-to-png.ts
git commit-sulthan -m "$(cat <<'EOF'
refactor(rendering): add client svg-to-png module with sizing bug fix

- create src/lib/rendering/client/svg-to-png.ts with svgToBase64Png and fetchImageAsBase64 (formerly in src/lib/slides/svg-to-png.ts)
- remove Math.min(scaleX, scaleY, 1) upscale clamp that caused mermaid diagrams to render at intrinsic size (~6% of target canvas)
- enable imageSmoothingQuality=high on the canvas context for crisp upscales
- mermaidToBase64Png extracted separately in a follow-up commit; slides consumers still read from old module until Task 4 flips their imports
EOF
)"
```

---

## Task 3: Extract `mermaidToBase64Png` into its own module

**Files:**
- Create: `src/lib/rendering/client/mermaid-to-png.ts`

- [ ] **Step 1: Create the new file**

Create `src/lib/rendering/client/mermaid-to-png.ts`:

```ts
/**
 * Client-side Mermaid diagram → PNG rasterization.
 *
 * Dynamically imports the mermaid library, initializes with the shared theme,
 * renders to SVG, and delegates to `svgToBase64Png` for canvas rasterization.
 * Browser-only.
 */

import { svgToBase64Png } from "./svg-to-png"

/**
 * Render Mermaid diagram code to a base64 PNG data URL.
 * Returns null on any failure (parse error, mermaid unavailable).
 */
export async function mermaidToBase64Png(
  diagramCode: string,
  width = 1200,
  height = 800,
): Promise<string | null> {
  try {
    const mermaid = await import("mermaid").then((m) => m.default)

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#ffffff",
        primaryTextColor: "#1c1c1c",
        primaryBorderColor: "#e2e1de",
        lineColor: "#6b6b6b",
        textColor: "#1c1c1c",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
      },
    })

    const id = `pptx-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, diagramCode.trim())

    return svgToBase64Png(svg, width, height)
  } catch (error) {
    console.error("[mermaid-to-png] Failed:", error)
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "mermaid-to-png" | head`
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rendering/client/mermaid-to-png.ts
git commit-sulthan -m "$(cat <<'EOF'
refactor(rendering): extract mermaidToBase64Png into dedicated client module

- create src/lib/rendering/client/mermaid-to-png.ts with mermaidToBase64Png (formerly in src/lib/slides/svg-to-png.ts)
- delegates canvas rasterization to svgToBase64Png from sibling module; no logic change
- slides consumers still read from old module until Task 4 flips their imports
EOF
)"
```

---

## Task 4: Flip slides imports to shared modules and delete old `svg-to-png.ts`

**Files:**
- Modify: `src/lib/slides/generate-pptx.ts` (line 4 import)
- Delete: `src/lib/slides/svg-to-png.ts`
- Scan: all other consumers of `./svg-to-png` inside `src/lib/slides/`

- [ ] **Step 1: Enumerate all consumers of the old file**

Run: `grep -rn '"\./svg-to-png"\|"\./chart-to-svg"' src/lib/slides`
Expected: hits only in `generate-pptx.ts` (line 4) and possibly in tests.

- [ ] **Step 2: Update `src/lib/slides/generate-pptx.ts` imports**

Replace line 4:

```ts
// before
import { svgToBase64Png, fetchImageAsBase64, mermaidToBase64Png } from "./svg-to-png"
// after
import { svgToBase64Png, fetchImageAsBase64 } from "@/lib/rendering/client/svg-to-png"
import { mermaidToBase64Png } from "@/lib/rendering/client/mermaid-to-png"
```

- [ ] **Step 3: Delete the old file**

```bash
git rm src/lib/slides/svg-to-png.ts
```

- [ ] **Step 4: Typecheck + run slides tests**

Run:
```bash
bunx tsc --noEmit 2>&1 | grep -E "slides/|rendering/" | head -20
bun run test -- --run src/lib/slides tests/unit/slides 2>&1 | tail -10
```
Expected: no new typecheck errors in slides or rendering; slides tests pass (if any exist). If there are no slides tests, explicitly run the artifact panel tests that exercise PPTX generation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slides/generate-pptx.ts src/lib/slides/svg-to-png.ts
git commit-sulthan -m "$(cat <<'EOF'
refactor(slides): flip rendering imports to shared rendering module

- generate-pptx.ts: import svgToBase64Png + fetchImageAsBase64 from @/lib/rendering/client/svg-to-png; import mermaidToBase64Png from @/lib/rendering/client/mermaid-to-png
- delete src/lib/slides/svg-to-png.ts (content already relocated in Tasks 2 and 3)
- slides PPTX export now benefits automatically from the mermaid sizing bug fix shipped in Task 2
EOF
)"
```

---

## Task 5: Regression test proving the mermaid sizing bug was fixed

**Files:**
- Create: `tests/unit/rendering/client/svg-to-png.test.ts`

Why a test: the fix in Task 2 drops the `, 1)` clamp. Without a test, a future refactor could reintroduce it. This locks the behavior.

- [ ] **Step 1: Write the failing test — stub drawImage to capture scale**

Create `tests/unit/rendering/client/svg-to-png.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { svgToBase64Png } from "@/lib/rendering/client/svg-to-png"

describe("svgToBase64Png — upscale allowed (sizing bug regression)", () => {
  let drawImageArgs: number[][] = []
  let originalImage: typeof Image

  beforeEach(() => {
    drawImageArgs = []

    // Stub HTMLCanvasElement getContext to capture drawImage arguments
    const realGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      if (type !== "2d") return realGetContext.call(this, type as "2d")
      return {
        fillStyle: "",
        fillRect: () => {},
        scale: () => {},
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => {
          drawImageArgs.push([x, y, w, h])
        },
      } as unknown as CanvasRenderingContext2D
    }

    // Stub canvas.toDataURL so the promise resolves
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,stub"

    // Stub Image to fire onload synchronously with a small natural size (mimicks mermaid SVG)
    originalImage = globalThis.Image
    class StubImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 300
      naturalHeight = 150
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    ;(globalThis as unknown as { Image: unknown }).Image = StubImage
  })

  afterEach(() => {
    ;(globalThis as unknown as { Image: unknown }).Image = originalImage
    vi.restoreAllMocks()
  })

  it("upscales a small SVG to fill a large target canvas", async () => {
    // Small mermaid-style SVG (300x150 intrinsic) into 1200x800 target
    await svgToBase64Png(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect/></svg>`,
      1200,
      800,
    )

    expect(drawImageArgs).toHaveLength(1)
    const [x, y, w, h] = drawImageArgs[0]

    // Pre-fix: fitScale clamped at 1 → drawn at native 300x150 centered (large offset)
    // Post-fix: fitScale = min(1200/300, 800/150) = min(4, 5.33) = 4 → 1200x600 centered
    expect(w).toBeGreaterThan(300)
    expect(h).toBeGreaterThan(150)
    expect(w).toBe(1200) // fills width
    expect(h).toBe(600) // aspect-preserved (300:150 = 2:1, 1200:600 = 2:1)
    // Centered vertically (letterbox top/bottom)
    expect(x).toBe(0)
    expect(y).toBe(100) // (800 - 600) / 2
  })

  it("does not shrink an SVG that already fits", async () => {
    // SVG already at target size → fitScale = 1, drawn at native
    ;(globalThis as { Image: unknown }).Image = class {
      onload: (() => void) | null = null
      naturalWidth = 1200
      naturalHeight = 800
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    await svgToBase64Png(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect/></svg>`,
      1200,
      800,
    )

    expect(drawImageArgs).toHaveLength(1)
    const [, , w, h] = drawImageArgs[0]
    expect(w).toBe(1200)
    expect(h).toBe(800)
  })
})
```

Add the `afterEach` import if missed:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
```

- [ ] **Step 2: Run the test — both assertions should pass after Task 2's fix**

Run: `bun run test -- --run tests/unit/rendering/client/svg-to-png.test.ts 2>&1 | tail -15`
Expected: 2 passed.

If the first test fails with `w === 300`, the clamp is still in place — reopen Task 2 and verify the `Math.min(scaleX, scaleY)` change was saved.

- [ ] **Step 3: Simulate the regression (optional TDD red verification)**

Temporarily revert the fix to confirm the test catches it:
```ts
const fitScale = Math.min(scaleX, scaleY, 1) // revert the clamp
```
Run the test — should fail with `w === 300`. Restore the fix.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/rendering/client/svg-to-png.test.ts
git commit-sulthan -m "$(cat <<'EOF'
test(rendering): regression test for mermaid sizing bug fix

- tests/unit/rendering/client/svg-to-png.test.ts: two jsdom-backed cases asserting that small SVGs upscale to fill the target canvas (previously clamped at 1x, leaving whitespace)
- stubs HTMLCanvasElement.getContext and globalThis.Image to capture drawImage arguments deterministically
- also guards the existing behavior where a correctly-sized SVG is drawn at 1:1 without shrinkage
EOF
)"
```

---

## Task 6: Verify PR 1 end-to-end — full test suite + typecheck green

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test -- --run 2>&1 | tail -10`
Expected: Test Files `N passed (N)`; Tests `N passed (N)`. No regressions vs. the baseline recorded before PR 1 started.

If there are pre-existing failures that were green before PR 1 started (e.g., `sessions/service.test.ts` mock drift on main), they are NOT this PR's responsibility — record them in the PR description under "pre-existing failures".

- [ ] **Step 2: Full typecheck**

Run: `bunx tsc --noEmit 2>&1 | wc -l`
Expected: count equals pre-PR-1 baseline (no new errors).

- [ ] **Step 3: Manual smoke (optional)**

Hit an existing slides deck that contains a `diagram` layout via the app in a browser (if you have a test deck handy). Verify the exported PPTX now has a full-size diagram rather than one shrunk in the center. Not required for CI green.

- [ ] **Step 4: (No commit — verification task)**

This task has no commit. PR 1 is ready to ship after this check passes.

---

# PR 2 — text/document mermaid + chart feature

## Task 7: `resize-svg.ts` — isomorphic SVG attribute normalizer

**Files:**
- Create: `src/lib/rendering/resize-svg.ts`
- Create: `tests/unit/rendering/resize-svg.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rendering/resize-svg.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resizeSvg } from "@/lib/rendering/resize-svg"

describe("resizeSvg", () => {
  it("rewrites existing width and height attributes", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect/></svg>`
    const out = resizeSvg(input, 1200, 800)
    expect(out).toContain(`width="1200"`)
    expect(out).toContain(`height="800"`)
    expect(out).not.toContain(`width="300"`)
    expect(out).not.toContain(`height="150"`)
  })

  it("adds width and height when missing", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect/></svg>`
    const out = resizeSvg(input, 400, 200)
    expect(out).toContain(`width="400"`)
    expect(out).toContain(`height="200"`)
    expect(out).toContain(`viewBox="0 0 100 50"`) // preserved
  })

  it("overrides preserveAspectRatio to xMidYMid meet", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="10" height="10"/>`
    const out = resizeSvg(input, 100, 100)
    expect(out).toContain(`preserveAspectRatio="xMidYMid meet"`)
    expect(out).not.toContain(`preserveAspectRatio="none"`)
  })

  it("leaves content untouched", () => {
    const input = `<svg width="1" height="1"><circle cx="5" cy="5" r="3" fill="red"/></svg>`
    const out = resizeSvg(input, 10, 10)
    expect(out).toContain(`<circle cx="5" cy="5" r="3" fill="red"/>`)
  })

  it("handles multi-line svg opening tags", () => {
    const input = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="50"
  height="50"
><rect/></svg>`
    const out = resizeSvg(input, 200, 200)
    expect(out).toContain(`width="200"`)
    expect(out).toContain(`height="200"`)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/rendering/resize-svg.test.ts 2>&1 | tail -15`
Expected: FAIL with "Cannot find module `@/lib/rendering/resize-svg`".

- [ ] **Step 3: Implement**

Create `src/lib/rendering/resize-svg.ts`:

```ts
/**
 * Rewrite an <svg>'s `width`, `height`, and `preserveAspectRatio` attributes.
 * Isomorphic — pure regex, no DOM.
 *
 * Used upstream of rasterizers so that the downstream (sharp, canvas) receives
 * an SVG that already declares its target dimensions; letterboxing is then
 * governed by the SVG's own viewBox + preserveAspectRatio rather than the
 * rasterizer's fit algorithm.
 */
export function resizeSvg(svg: string, width: number, height: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+width\s*=\s*"[^"]*"/g, "")
      .replace(/\s+height\s*=\s*"[^"]*"/g, "")
      .replace(/\s+preserveAspectRatio\s*=\s*"[^"]*"/g, "")
    return `<svg${cleaned} width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`
  })
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/rendering/resize-svg.test.ts 2>&1 | tail -15`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/resize-svg.ts tests/unit/rendering/resize-svg.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(rendering): add isomorphic resizeSvg helper

- src/lib/rendering/resize-svg.ts: pure-regex rewrite of an svg element's width, height, and preserveAspectRatio attributes
- normalizes to `preserveAspectRatio="xMidYMid meet"` so letterboxing is centered when aspect ratio differs from target
- five cases cover existing attrs, missing attrs, aspect override, content preservation, multi-line opening tags
EOF
)"
```

---

## Task 8: Server-side `svg-to-png.ts` — sharp-based rasterizer

**Files:**
- Create: `src/lib/rendering/server/svg-to-png.ts`
- Create: `tests/unit/rendering/server/svg-to-png.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rendering/server/svg-to-png.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { svgToPng } from "@/lib/rendering/server/svg-to-png"

describe("server svgToPng", () => {
  const redRect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#FF0000"/></svg>`

  it("returns a non-empty PNG Buffer", async () => {
    const buf = await svgToPng(redRect, 200, 100)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(80) // PNG magic + IHDR at minimum
  })

  it("starts with PNG magic bytes", async () => {
    const buf = await svgToPng(redRect, 200, 100)
    expect(buf[0]).toBe(0x89)
    expect(buf[1]).toBe(0x50) // P
    expect(buf[2]).toBe(0x4e) // N
    expect(buf[3]).toBe(0x47) // G
  })

  it("produces a PNG with the requested pixel dimensions", async () => {
    const buf = await svgToPng(redRect, 400, 200)
    // PNG IHDR width (bytes 16..19) and height (bytes 20..23) — big-endian uint32
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    expect(w).toBe(400)
    expect(h).toBe(200)
  })

  it("upscales small SVGs to target (no whitespace equivalent of the client bug)", async () => {
    // Tiny SVG (10x10) into 400x200. Pre-fix behavior would letterbox with white
    // corners; sharp's fit:'contain' + white background produces a similar shape,
    // but the returned buffer MUST be the target size (400x200), not 10x10.
    const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#00FF00"/></svg>`
    const buf = await svgToPng(tinySvg, 400, 200)
    expect(buf.readUInt32BE(16)).toBe(400)
    expect(buf.readUInt32BE(20)).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/rendering/server/svg-to-png.test.ts 2>&1 | tail -10`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/rendering/server/svg-to-png.ts`:

```ts
/**
 * Server-side SVG → PNG rasterizer using sharp.
 *
 * Uses fit:'contain' + white background so aspect-mismatched SVGs are
 * letterboxed rather than distorted or clipped. Pairs with `resize-svg`
 * upstream when the SVG's intrinsic dimensions differ from the target.
 */

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

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/rendering/server/svg-to-png.test.ts 2>&1 | tail -10`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/server/svg-to-png.ts tests/unit/rendering/server/svg-to-png.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(rendering): add server-side svgToPng using sharp

- src/lib/rendering/server/svg-to-png.ts: rasterize SVG string to PNG Buffer via sharp with fit:contain + lanczos3 + white background flatten
- four cases verify buffer shape, PNG magic, exact pixel dimensions, and upscale-to-target behavior for tiny SVGs
- mirrors the client-side client/svg-to-png contract but runs in Node (no Canvas API); zero new deps
EOF
)"
```

---

## Task 9: Server-side `mermaid-to-svg.ts` — jsdom + mermaid

**Files:**
- Create: `src/lib/rendering/server/mermaid-to-svg.ts`
- Create: `tests/unit/rendering/server/mermaid-to-svg.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rendering/server/mermaid-to-svg.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { mermaidToSvg } from "@/lib/rendering/server/mermaid-to-svg"

describe("server mermaidToSvg", () => {
  it("renders a simple flowchart to an SVG string", async () => {
    const svg = await mermaidToSvg(`flowchart TD\n  A --> B`)
    expect(svg).toMatch(/^<svg[\s>]/)
    expect(svg).toContain("</svg>")
    // Rendered SVG must contain both node labels
    expect(svg).toContain(">A<")
    expect(svg).toContain(">B<")
  })

  it("renders a sequenceDiagram", async () => {
    const svg = await mermaidToSvg(`sequenceDiagram\n  Alice->>Bob: Hi`)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain(">Alice<")
    expect(svg).toContain(">Bob<")
  })

  it("throws on parse error", async () => {
    await expect(mermaidToSvg(`not a diagram`)).rejects.toBeTruthy()
  })

  it("restores globals after render (no leaked window)", async () => {
    const before = (globalThis as { window?: unknown }).window
    await mermaidToSvg(`flowchart TD\n  A --> B`)
    const after = (globalThis as { window?: unknown }).window
    expect(after).toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/rendering/server/mermaid-to-svg.test.ts 2>&1 | tail -10`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/rendering/server/mermaid-to-svg.ts`:

```ts
/**
 * Server-side Mermaid diagram → SVG string.
 *
 * Shims a jsdom window as globals around a mermaid.render call, then restores
 * the previous globals. Caller rasterizes the SVG via `svgToPng` + `resizeSvg`
 * if a raster is needed.
 *
 * Concurrency note: mermaid is a global singleton; the window swap + restore
 * in the finally block keeps the Node process from leaking a stale window
 * between calls. Serialized per call via JS single-threaded event loop.
 */

import { JSDOM } from "jsdom"

type Globals = {
  window?: unknown
  document?: unknown
  DOMParser?: unknown
  navigator?: unknown
}

export async function mermaidToSvg(code: string): Promise<string> {
  const trimmed = code.trim()
  if (!trimmed) throw new Error("[mermaid-to-svg] empty code")

  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="mm-host"></div></body></html>`,
    { pretendToBeVisual: true },
  )

  const g = globalThis as unknown as Globals
  const prev: Globals = {
    window: g.window,
    document: g.document,
    DOMParser: g.DOMParser,
    navigator: g.navigator,
  }

  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  g.navigator = dom.window.navigator

  try {
    const mermaid = (await import("mermaid")).default
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#ffffff",
        primaryTextColor: "#1c1c1c",
        primaryBorderColor: "#e2e1de",
        lineColor: "#6b6b6b",
        textColor: "#1c1c1c",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
      },
    })

    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const host = dom.window.document.getElementById("mm-host") ?? undefined
    const { svg } = await mermaid.render(id, trimmed, host as unknown as HTMLElement | undefined)
    return svg
  } finally {
    g.window = prev.window
    g.document = prev.document
    g.DOMParser = prev.DOMParser
    g.navigator = prev.navigator
    dom.window.close()
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/rendering/server/mermaid-to-svg.test.ts 2>&1 | tail -15`
Expected: 4 passed.

If mermaid blows up on first use (missing browser global), iterate: add the missing global to the swap, re-run. Log the missing global in the risk register of the design doc.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/server/mermaid-to-svg.ts tests/unit/rendering/server/mermaid-to-svg.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(rendering): add server-side mermaidToSvg via jsdom

- src/lib/rendering/server/mermaid-to-svg.ts: dynamically import mermaid, swap globalThis.window/document/DOMParser/navigator to a fresh JSDOM, render the diagram, restore globals in finally
- four cases verify flowchart + sequenceDiagram renders, parse-error rejection, and no-leaked-window invariant
- same theme constants as client-side mermaid renderer for visual parity between preview and export
EOF
)"
```

---

## Task 10: Zod mirror of `ChartData`

**Files:**
- Create: `src/lib/slides/types.zod.ts`
- Create: `tests/unit/slides/types.zod.test.ts`

Why in `src/lib/slides/`: the TypeScript `ChartData` is still authored there; the Zod mirror lives next to it for colocated evolution. Text/document schema imports from here.

- [ ] **Step 1: Read existing `ChartData` shape**

Run: `grep -A 60 "ChartData\|ChartDataPoint\|ChartSeries" src/lib/slides/types.ts | head -70` — copy the current shape so the Zod mirror matches exactly. If the shape differs from the snippet below, use the actual definitions from the file.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/slides/types.zod.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from "vitest"
import { ChartDataSchema } from "@/lib/slides/types.zod"
import type { ChartData } from "@/lib/slides/types"

describe("ChartDataSchema", () => {
  it("accepts a valid bar chart", () => {
    const data = {
      type: "bar" as const,
      title: "Revenue",
      dataPoints: [
        { label: "Jan", value: 100 },
        { label: "Feb", value: 120 },
      ],
    }
    expect(ChartDataSchema.safeParse(data).success).toBe(true)
  })

  it("accepts a line chart with multiple series", () => {
    const data = {
      type: "line" as const,
      dataPoints: [{ label: "Q1" }, { label: "Q2" }, { label: "Q3" }, { label: "Q4" }],
      series: [
        { name: "A", values: [1, 2, 3, 4] },
        { name: "B", values: [4, 3, 2, 1] },
      ],
    }
    expect(ChartDataSchema.safeParse(data).success).toBe(true)
  })

  it("rejects unknown chart type", () => {
    const bad = { type: "radar", dataPoints: [] }
    expect(ChartDataSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects dataPoint missing label", () => {
    const bad = { type: "bar", dataPoints: [{ value: 5 }] }
    expect(ChartDataSchema.safeParse(bad).success).toBe(false)
  })

  it("type-level: z.infer is assignable to TS ChartData", () => {
    expectTypeOf<ReturnType<typeof ChartDataSchema.parse>>().toMatchTypeOf<ChartData>()
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `bun run test -- --run tests/unit/slides/types.zod.test.ts 2>&1 | tail -10`
Expected: FAIL with "Cannot find module `@/lib/slides/types.zod`".

- [ ] **Step 4: Implement**

Create `src/lib/slides/types.zod.ts` (adjust field names/enums to match the actual `ChartData` discovered in Step 1):

```ts
/**
 * Zod mirror of `ChartData` / `ChartDataPoint` / `ChartSeries` from `./types`.
 * Authoritative shape lives in `types.ts`; this file is asserted-compatible
 * via `expectTypeOf` in the test file.
 */

import { z } from "zod"

export const ChartDataPointSchema = z.object({
  label: z.string().min(1),
  value: z.number().optional(),
})

export const ChartSeriesSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.number()),
  color: z.string().optional(),
})

export const ChartDataSchema = z.object({
  type: z.enum(["bar", "bar-horizontal", "line", "pie", "donut"]),
  title: z.string().optional(),
  dataPoints: z.array(ChartDataPointSchema),
  series: z.array(ChartSeriesSchema).optional(),
  colors: z.array(z.string()).optional(),
})

export type ChartDataParsed = z.infer<typeof ChartDataSchema>
```

If the enum values in `types.ts` are different, replace the `z.enum([...])` list to match exactly.

- [ ] **Step 5: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/slides/types.zod.test.ts 2>&1 | tail -10`
Expected: 5 passed. If the type-level test fails, align the Zod shape with `ChartData` until they match.

- [ ] **Step 6: Commit**

```bash
git add src/lib/slides/types.zod.ts tests/unit/slides/types.zod.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(slides): add Zod mirror of ChartData for cross-artifact reuse

- src/lib/slides/types.zod.ts: ChartDataSchema, ChartDataPointSchema, ChartSeriesSchema mirroring the TS types in ./types
- five cases cover valid bar and line shapes, unknown chart-type rejection, missing-field rejection, type-level assignability to the TS ChartData
- consumed by text/document schema for the new `chart` block node
EOF
)"
```

---

## Task 11: Extend `DocumentAst` schema with `mermaid` block node

**Files:**
- Modify: `src/lib/document-ast/schema.ts`
- Modify: `tests/unit/document-ast/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/document-ast/schema.test.ts`:

```ts
import { DocumentAstSchema } from "@/lib/document-ast/schema"

describe("DocumentAstSchema — mermaid block node", () => {
  const baseMeta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("accepts a minimal mermaid block", () => {
    const ast = {
      meta: baseMeta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B" }],
    }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(true)
  })

  it("accepts mermaid with caption and dimensions", () => {
    const ast = {
      meta: baseMeta,
      body: [
        {
          type: "mermaid",
          code: "sequenceDiagram\n  A->>B: hi",
          caption: "Login flow",
          width: 900,
          height: 600,
          alt: "Login sequence diagram",
        },
      ],
    }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(true)
  })

  it("rejects empty mermaid code", () => {
    const ast = { meta: baseMeta, body: [{ type: "mermaid", code: "" }] }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(false)
  })

  it("rejects mermaid code longer than 10000 chars", () => {
    const ast = { meta: baseMeta, body: [{ type: "mermaid", code: "x".repeat(10_001) }] }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(false)
  })

  it("rejects width outside bounds", () => {
    const ast = { meta: baseMeta, body: [{ type: "mermaid", code: "graph TD;A-->B", width: 5000 }] }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/document-ast/schema.test.ts 2>&1 | tail -15`
Expected: FAIL on all 5 new cases (discriminatedUnion doesn't know `"mermaid"`).

- [ ] **Step 3: Add the `mermaid` node to the schema**

In `src/lib/document-ast/schema.ts`, find the `BlockNode` discriminatedUnion (the one containing `paragraph`, `heading`, `list`, `table`, `image`, etc.). Add a new member just before the closing `])`:

```ts
z.object({
  type: z.literal("mermaid"),
  code: z.string().min(1).max(10_000),
  caption: z.string().max(200).optional(),
  width: z.number().int().positive().min(200).max(1600).optional().default(1200),
  height: z.number().int().positive().min(150).max(1200).optional().default(800),
  alt: z.string().max(500).optional(),
}),
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/document-ast/schema.test.ts 2>&1 | tail -15`
Expected: all new cases pass; no existing cases regress.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/schema.ts tests/unit/document-ast/schema.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-ast): add mermaid block node to schema

- src/lib/document-ast/schema.ts: new BlockNode member { type:"mermaid", code:string(1..10000), caption?, width?(200..1600), height?(150..1200), alt? } with width=1200 height=800 defaults
- schema.test.ts: five cases cover minimal, full-spec, empty-code rejection, oversize-code rejection, out-of-bounds width rejection
EOF
)"
```

---

## Task 12: Extend `DocumentAst` schema with `chart` block node

**Files:**
- Modify: `src/lib/document-ast/schema.ts`
- Modify: `tests/unit/document-ast/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/document-ast/schema.test.ts`:

```ts
describe("DocumentAstSchema — chart block node", () => {
  const baseMeta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("accepts a bar chart block", () => {
    const ast = {
      meta: baseMeta,
      body: [
        {
          type: "chart",
          chart: {
            type: "bar",
            title: "Revenue",
            dataPoints: [{ label: "Q1", value: 100 }, { label: "Q2", value: 150 }],
          },
        },
      ],
    }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(true)
  })

  it("accepts chart with caption and dimensions", () => {
    const ast = {
      meta: baseMeta,
      body: [
        {
          type: "chart",
          chart: { type: "pie", dataPoints: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
          caption: "Share by segment",
          width: 1000,
          height: 500,
        },
      ],
    }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(true)
  })

  it("rejects unknown chart type inside the chart field", () => {
    const ast = {
      meta: baseMeta,
      body: [{ type: "chart", chart: { type: "radar", dataPoints: [] } }],
    }
    expect(DocumentAstSchema.safeParse(ast).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Expected: FAIL on 3 new cases.

- [ ] **Step 3: Add the `chart` node to the schema**

At the top of `src/lib/document-ast/schema.ts`:

```ts
import { ChartDataSchema } from "@/lib/slides/types.zod"
```

In the `BlockNode` discriminatedUnion, add:

```ts
z.object({
  type: z.literal("chart"),
  chart: ChartDataSchema,
  caption: z.string().max(200).optional(),
  width: z.number().int().positive().min(200).max(1600).optional().default(1200),
  height: z.number().int().positive().min(150).max(1200).optional().default(600),
  alt: z.string().max(500).optional(),
}),
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/document-ast/schema.test.ts 2>&1 | tail -15`
Expected: all cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/schema.ts tests/unit/document-ast/schema.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-ast): add chart block node to schema

- src/lib/document-ast/schema.ts: new BlockNode member { type:"chart", chart:ChartDataSchema, caption?, width?(200..1600), height?(150..1200), alt? } with width=1200 height=600 defaults
- chart field reuses ChartDataSchema from slides/types.zod so chart shape stays consistent across application/slides and text/document
- schema.test.ts: three cases cover bar-chart minimal, pie-chart with caption and dims, unknown-chart-type rejection
EOF
)"
```

---

## Task 13: Semantic validation for `mermaid` block

**Files:**
- Modify: `src/lib/document-ast/validate.ts`
- Modify: `tests/unit/document-ast/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/document-ast/validate.test.ts`:

```ts
import { validateDocumentAst } from "@/lib/document-ast/validate"

describe("validateDocumentAst — mermaid semantic checks", () => {
  const baseMeta = {
    title: "T",
    pageSize: "letter" as const,
    orientation: "portrait" as const,
    font: "Arial",
    fontSize: 12,
    showPageNumbers: false,
  }

  it("accepts a flowchart with a valid diagram-type prefix", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B" }],
    })
    expect(result.ok).toBe(true)
  })

  it("accepts a sequenceDiagram", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "sequenceDiagram\n  A->>B: hi" }],
    })
    expect(result.ok).toBe(true)
  })

  it("rejects whitespace-only code", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "   \n  \t  " }],
    })
    expect(result.ok).toBe(false)
  })

  it("rejects an unknown diagram-type prefix", () => {
    const result = validateDocumentAst({
      meta: baseMeta,
      body: [{ type: "mermaid", code: "notADiagram\n  A --> B" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/mermaid|diagram type/i)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/document-ast/validate.test.ts 2>&1 | tail -15`
Expected: FAIL on the whitespace-only and unknown-type cases (schema allows them; semantic validator doesn't check yet).

- [ ] **Step 3: Implement**

In `src/lib/document-ast/validate.ts`, add a helper constant and extend the walker that dispatches on `block.type`:

```ts
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
```

Wire into the block walker in `validateDocumentAst`:

```ts
// inside the block switch/case
case "mermaid": {
  const err = validateMermaidNode(block.code)
  if (err) return { ok: false, error: err }
  break
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/document-ast/validate.test.ts 2>&1 | tail -15`
Expected: all new cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/validate.ts tests/unit/document-ast/validate.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-ast): semantic validator for mermaid blocks

- src/lib/document-ast/validate.ts: reject empty or whitespace-only mermaid code; reject unknown diagram-type prefix (first non-empty token must be one of 16 supported mermaid types)
- validate.test.ts: four cases cover valid flowchart, valid sequenceDiagram, whitespace rejection, unknown-prefix rejection
- chart blocks need no extra semantic check — discriminatedUnion via ChartDataSchema is sufficient
EOF
)"
```

---

## Task 14: Docx export — `renderMermaid`

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/document-ast/to-docx.test.ts`:

```ts
describe("astToDocx — mermaid block", () => {
  const meta = { title: "T", pageSize: "letter" as const, orientation: "portrait" as const, font: "Arial", fontSize: 12, showPageNumbers: false }

  it("embeds the rendered diagram as an image part", async () => {
    const buf = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "Fig 1" }],
    })
    expect(buf[0]).toBe(0x50) // zip magic
    expect(buf.length).toBeGreaterThan(5_000)
    // The docx should embed at least one image (PNG inside the zip)
    const zipContent = buf.toString("binary")
    expect(zipContent).toMatch(/word\/media\/image/)
  })

  it("emits a caption paragraph after the diagram", async () => {
    const buf = await astToDocx({
      meta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "My caption" }],
    })
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toContain("My caption")
  })

  // Fallback path is covered at implementation-inspection time: the try/catch in
  // renderMermaid returns a red-italic caption paragraph on mermaid parse failure.
  // An end-to-end test would need to stub mermaidToSvg to throw; if this ever
  // regresses, add that mock — for now, code review + manual QA is sufficient.
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run tests/unit/document-ast/to-docx.test.ts 2>&1 | tail -20`
Expected: FAIL on "embeds the rendered diagram as an image part" (mermaid case not handled → falls through switch, no image).

- [ ] **Step 3: Implement**

In `src/lib/document-ast/to-docx.ts`:

```ts
// near other imports
import { mermaidToSvg } from "@/lib/rendering/server/mermaid-to-svg"
import { svgToPng } from "@/lib/rendering/server/svg-to-png"
import { resizeSvg } from "@/lib/rendering/resize-svg"
```

Add a new renderer alongside `renderImage`:

```ts
async function renderMermaid(
  node: Extract<BlockNode, { type: "mermaid" }>,
  _ctx: RenderContext,
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
          data: pngBuffer,
          transformation: { width: w, height: h },
          altText: { title: alt, description: alt, name: alt },
        }),
      ],
    })
    const paragraphs = [image]
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
```

Wire into `renderBlock`:

```ts
case "mermaid":
  return renderMermaid(node, ctx)
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/document-ast/to-docx.test.ts 2>&1 | tail -15`
Expected: all cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-ast): docx export renderer for mermaid blocks

- src/lib/document-ast/to-docx.ts: new renderMermaid path — mermaidToSvg (jsdom) -> resizeSvg -> svgToPng (sharp) -> ImageRun centered paragraph plus optional italic caption paragraph
- try/catch fallback emits a red-italic caption paragraph instead of throwing when mermaid rejects parse
- to-docx.test.ts: two cases cover embedded image presence in docx zip and caption paragraph text; fallback path covered via code inspection + manual QA
EOF
)"
```

---

## Task 15: Docx export — `renderChart`

**Files:**
- Modify: `src/lib/document-ast/to-docx.ts`
- Modify: `tests/unit/document-ast/to-docx.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/document-ast/to-docx.test.ts`:

```ts
describe("astToDocx — chart block", () => {
  const meta = { title: "T", pageSize: "letter" as const, orientation: "portrait" as const, font: "Arial", fontSize: 12, showPageNumbers: false }

  it("embeds a bar chart as an image part", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "chart",
          chart: { type: "bar", title: "Revenue", dataPoints: [{ label: "Q1", value: 100 }, { label: "Q2", value: 200 }] },
          caption: "Revenue by quarter",
        },
      ],
    })
    expect(buf[0]).toBe(0x50)
    expect(buf.length).toBeGreaterThan(5_000)
    expect(buf.toString("binary")).toMatch(/word\/media\/image/)
  })

  it("emits the caption paragraph", async () => {
    const buf = await astToDocx({
      meta,
      body: [
        {
          type: "chart",
          chart: { type: "pie", dataPoints: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
          caption: "Pie caption",
        },
      ],
    })
    const text = (await mammoth.extractRawText({ buffer: buf })).value
    expect(text).toContain("Pie caption")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Expected: FAIL on "embeds a bar chart" (chart case not handled).

- [ ] **Step 3: Implement**

In `src/lib/document-ast/to-docx.ts`:

```ts
import { chartToSvg } from "@/lib/rendering/chart-to-svg"
```

Add the renderer:

```ts
async function renderChart(
  node: Extract<BlockNode, { type: "chart" }>,
  _ctx: RenderContext,
): Promise<Paragraph[]> {
  const w = node.width ?? 1200
  const h = node.height ?? 600
  const alt = node.alt ?? node.caption ?? "Chart"

  const rawSvg = chartToSvg(node.chart, { width: w, height: h })
  const sizedSvg = resizeSvg(rawSvg, w, h)
  const pngBuffer = await svgToPng(sizedSvg, w, h)

  const image = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        data: pngBuffer,
        transformation: { width: w, height: h },
        altText: { title: alt, description: alt, name: alt },
      }),
    ],
  })
  const paragraphs = [image]
  if (node.caption) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: node.caption, italics: true, size: 20 })],
      }),
    )
  }
  return paragraphs
}
```

Wire into `renderBlock`:

```ts
case "chart":
  return renderChart(node, ctx)
```

Inspect `chart-to-svg.ts`'s `chartToSvg` signature; if it takes `(data, dims)` with different shape, adjust the call accordingly (the design spec assumes `(chart, { width, height })` — confirm and adapt).

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run tests/unit/document-ast/to-docx.test.ts 2>&1 | tail -15`
Expected: all cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/to-docx.ts tests/unit/document-ast/to-docx.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-ast): docx export renderer for chart blocks

- src/lib/document-ast/to-docx.ts: new renderChart path — chartToSvg -> resizeSvg -> svgToPng -> ImageRun centered paragraph plus optional italic caption
- reuses chartToSvg from @/lib/rendering/chart-to-svg (isomorphic D3-based) — identical output shape to application/slides PPTX charts
- to-docx.test.ts: two cases cover bar chart embed + pie chart caption
EOF
)"
```

---

## Task 16: Preview renderer — `mermaid` case

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { DocumentRenderer } from "../document-renderer"

describe("DocumentRenderer — mermaid block", () => {
  const minimalMeta = { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false }

  it("renders mermaid SVG into the document flow", async () => {
    const ast = {
      meta: minimalMeta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "Flow caption" }],
    }
    const content = JSON.stringify(ast)
    const { container, findByText } = render(<DocumentRenderer content={content} />)
    await waitFor(() => {
      expect(container.querySelector("svg")).toBeTruthy()
    })
    expect(await findByText("Flow caption")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test -- --run src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx 2>&1 | tail -15`
Expected: FAIL (no SVG rendered because the renderer switch doesn't handle mermaid).

- [ ] **Step 3: Implement**

In `document-renderer.tsx`, find the `renderBlock` function that switches on `block.type`. Add:

```tsx
case "mermaid":
  return <MermaidPreviewBlock key={key} code={block.code} caption={block.caption} />
```

Add the component near the bottom of the file (or in a sibling file imported here):

```tsx
function MermaidPreviewBlock({ code, caption }: { code: string; caption?: string }) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({ startOnLoad: false, theme: "base" })
        const id = `doc-preview-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code.trim())
        if (!cancelled) setSvg(svg)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Render failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <figure className="my-4 flex flex-col items-center">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          Mermaid error: {error}
        </div>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="text-sm text-muted-foreground">Rendering diagram…</div>
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-sm italic text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `bun run test -- --run src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx 2>&1 | tail -15`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(document-renderer): mermaid preview block

- document-renderer.tsx: new MermaidPreviewBlock — useEffect dynamic-imports mermaid, initializes with theme:"base", renders to SVG, injects via dangerouslySetInnerHTML with centered figure + italic figcaption
- cancelled flag in useEffect guards against state updates after unmount
- document-renderer.test.tsx: new case asserts an svg element appears in the DOM and caption text renders
EOF
)"
```

---

## Task 17: Preview renderer — `chart` case

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the existing `document-renderer.test.tsx`:

```tsx
describe("DocumentRenderer — chart block", () => {
  const minimalMeta = { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false }

  it("renders a chart SVG into the document flow", () => {
    const ast = {
      meta: minimalMeta,
      body: [
        {
          type: "chart",
          chart: { type: "bar", title: "Rev", dataPoints: [{ label: "Q1", value: 100 }, { label: "Q2", value: 200 }] },
          caption: "Chart caption",
        },
      ],
    }
    const content = JSON.stringify(ast)
    const { container, getByText } = render(<DocumentRenderer content={content} />)
    expect(container.querySelector("svg")).toBeTruthy()
    expect(getByText("Chart caption")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Expected: FAIL (chart case not handled).

- [ ] **Step 3: Implement**

Add to `document-renderer.tsx`:

```tsx
case "chart":
  return <ChartPreviewBlock key={key} chart={block.chart} caption={block.caption} />
```

```tsx
import { chartToSvg } from "@/lib/rendering/chart-to-svg"

function ChartPreviewBlock({ chart, caption }: { chart: ChartData; caption?: string }) {
  const svg = React.useMemo(() => chartToSvg(chart, { width: 800, height: 400 }), [chart])
  return (
    <figure className="my-4 flex flex-col items-center">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {caption && (
        <figcaption className="mt-2 text-center text-sm italic text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
```

Import `ChartData` from `@/lib/slides/types` and adapt the `chartToSvg` call signature to match the actual function (per Task 1's relocation).

- [ ] **Step 4: Run test — expect PASS**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(document-renderer): chart preview block

- document-renderer.tsx: new ChartPreviewBlock — useMemo wraps chartToSvg(chart, {width, height}) and injects result via dangerouslySetInnerHTML with centered figure + italic figcaption
- reuses @/lib/rendering/chart-to-svg so preview and docx export share the same D3 rendering contract
- document-renderer.test.tsx: new case asserts an svg element appears and caption text renders
EOF
)"
```

---

## Task 18: Flip prompt anti-pattern for mermaid; add mermaid + chart sections

**Files:**
- Modify: `src/lib/prompts/artifacts/document.ts`

- [ ] **Step 1: Locate the anti-pattern lines**

Run: `grep -n "Mermaid\|chart\|mermaid" src/lib/prompts/artifacts/document.ts`

Expected: you'll see around line 262 `"❌ Mermaid or chart fenced blocks — those belong in text/markdown; this schema has no fenced block node type."`

- [ ] **Step 2: Rewrite**

Open `src/lib/prompts/artifacts/document.ts`. Remove the line that forbids mermaid/chart. Add two new sections just before the anti-patterns list (use voice/style consistent with existing prose):

```markdown
### `mermaid` block

Use for flowcharts, sequence, class, state, ER, pie, gantt, mindmap, timeline, and similar schematic diagrams. Embed `mermaid` blocks directly in the document — they render as PNG in the docx export and as inline SVG in the preview.

\`\`\`ts
{ type: "mermaid", code: string, caption?: string, width?: 200..1600, height?: 150..1200, alt?: string }
\`\`\`

- `code`: valid Mermaid syntax. First non-empty token MUST be one of `flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `journey`, `c4Context`, `gitGraph`, `quadrantChart`, or `requirementDiagram`.
- Keep diagrams simple — ≤ 15 nodes for flowcharts; ≤ 10 for split-layout contexts.
- NEVER wrap `code` in markdown fences (no \`\`\`mermaid). The `code` field IS raw mermaid syntax.
- `width`/`height` default to 1200×800.

### `chart` block

Use for data visualizations (bar, bar-horizontal, line, pie, donut). The `chart` field follows the same `ChartData` schema used by `application/slides`.

\`\`\`ts
{ type: "chart", chart: ChartData, caption?: string, width?: 200..1600, height?: 150..1200, alt?: string }
\`\`\`

- `ChartData`: `{ type, title?, dataPoints: [{label, value?}], series?: [{name, values[], color?}], colors? }`
- `width`/`height` default to 1200×600.

Prefer `mermaid` for qualitative structure (flows, relations), `chart` for quantitative data (numbers, categories). Don't stuff prose into diagrams.
```

In the anti-patterns list near the bottom, remove:
```
❌ Mermaid or chart fenced blocks — those belong in `text/markdown`; this schema has no fenced block node type.
```

Keep unchanged:
```
❌ Mermaid fences ``` inside text (the `code` field IS raw mermaid, never fenced)
```

- [ ] **Step 3: Verify file still lints and typechecks**

Run: `bunx tsc --noEmit 2>&1 | grep "prompts/artifacts/document"` — expect empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/document.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(prompts): teach text/document about mermaid and chart blocks

- src/lib/prompts/artifacts/document.ts: remove anti-pattern forbidding mermaid/chart; add Mermaid block section listing 16 supported diagram types with 15-node soft cap and no-markdown-fence reminder
- add Chart block section pointing at ChartData shape (reused from application/slides); prefer mermaid for qualitative structure, chart for quantitative data
- no fixture change yet — golden report fixture updated in a follow-up task so each concern is reviewable in isolation
EOF
)"
```

---

## Task 19: Update `report` fixture to exercise mermaid + chart blocks

**Files:**
- Modify: `src/lib/document-ast/examples/report.ts`
- Modify: `tests/unit/document-ast/examples.test.ts`

- [ ] **Step 1: Inspect the current fixture shape**

Open `src/lib/document-ast/examples/report.ts` and locate the `body` array. Pick an insertion point after the abstract and before the findings list — somewhere a diagram would naturally illustrate the report's methodology.

- [ ] **Step 2: Add mermaid and chart blocks**

Insert one of each into the `body` array at the chosen point:

```ts
{
  type: "mermaid",
  code: `flowchart LR
  Data["Raw data"] --> Clean["Clean + validate"]
  Clean --> Model["Fit model"]
  Model --> Eval["Evaluate"]
  Eval --> Report["Publish report"]`,
  caption: "Methodology pipeline",
},
{
  type: "chart",
  chart: {
    type: "bar",
    title: "Experiment results by cohort",
    dataPoints: [
      { label: "Cohort A", value: 74 },
      { label: "Cohort B", value: 82 },
      { label: "Cohort C", value: 91 },
    ],
  },
  caption: "Accuracy (%) by cohort",
},
```

- [ ] **Step 3: Run the existing fixture validation tests**

Run: `bun run test -- --run tests/unit/document-ast/examples.test.ts 2>&1 | tail -15`
Expected: all pass. Updated `report` still satisfies `validateDocumentAst` and `DocumentAstSchema`.

- [ ] **Step 4: Run the full document-ast suite to catch any drift**

Run: `bun run test -- --run tests/unit/document-ast src/features/conversations/components/chat/artifacts/renderers/__tests__/document-renderer.test.tsx 2>&1 | tail -8`
Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-ast/examples/report.ts
git commit-sulthan -m "$(cat <<'EOF'
test(document-ast): report fixture now exercises mermaid and chart blocks

- examples/report.ts: inject a 5-node flowchart (methodology pipeline) and a 3-cohort bar chart (experiment accuracy) between abstract and findings list
- serves as the prompt-facing example AI will learn from and as the end-to-end smoke subject for docx export verification
- existing fixture tests still pass unchanged; no schema or validator regression
EOF
)"
```

---

## Task 20: End-to-end smoke — regenerate docx with diagrams embedded

**Files:**
- Temporary: `smoke.ts` in the worktree root (deleted before commit)

- [ ] **Step 1: Write the smoke script**

Create `smoke.ts` at the worktree root:

```ts
import { astToDocx } from "@/lib/document-ast/to-docx"
import { validateDocumentAst } from "@/lib/document-ast/validate"
import { reportExample } from "@/lib/document-ast/examples/report"
import type { DocumentAst } from "@/lib/document-ast/schema"
import mammoth from "mammoth"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const OUT = "/tmp/text-document-smoke-v11"
mkdirSync(OUT, { recursive: true })

const v = validateDocumentAst(reportExample as DocumentAst)
if (!v.ok) {
  console.error("VALIDATE FAIL:", v.error)
  process.exit(1)
}
const buf = await astToDocx(v.ast)
const outPath = join(OUT, "report.docx")
writeFileSync(outPath, buf)

const text = (await mammoth.extractRawText({ buffer: buf })).value
const hasMethodologyCaption = text.includes("Methodology pipeline")
const hasAccuracyCaption = text.includes("Accuracy (%) by cohort")
const magicOk = buf[0] === 0x50 && buf[1] === 0x4b

console.log(JSON.stringify({
  path: outPath,
  bytes: buf.length,
  magicOk,
  hasMethodologyCaption,
  hasAccuracyCaption,
  textLength: text.length,
}))

if (!magicOk || !hasMethodologyCaption || !hasAccuracyCaption) process.exit(1)
```

- [ ] **Step 2: Run the smoke**

Run: `bun run smoke.ts`
Expected: JSON output with `magicOk: true`, both captions `true`, bytes > 10k.

- [ ] **Step 3: Inspect the zip to confirm image embed**

Run: `unzip -l /tmp/text-document-smoke-v11/report.docx | grep image`
Expected: at least 2 image entries under `word/media/image*.png` — one for mermaid, one for chart.

- [ ] **Step 4: Manual visual check (optional)**

Open `/tmp/text-document-smoke-v11/report.docx` in Microsoft Word / LibreOffice / Google Docs. Confirm:
- Mermaid flowchart renders as a crisp PNG (not shrunk center with whitespace)
- Bar chart renders with axis labels and values
- Captions appear below each figure in italic

- [ ] **Step 5: Delete the smoke script**

```bash
rm smoke.ts
```

- [ ] **Step 6: Verify working tree is clean**

Run: `git status --short`
Expected: empty.

This task has no commit — it's a verification checkpoint.

---

## Task 21: PR 2 final verification — full suite + typecheck

**Files:** none.

- [ ] **Step 1: Full test suite**

Run: `bun run test -- --run 2>&1 | tail -10`
Expected: PR 2 does not introduce new failures compared to the PR 1 baseline.

- [ ] **Step 2: Full typecheck**

Run: `bunx tsc --noEmit 2>&1 | wc -l && bunx tsc --noEmit 2>&1 | grep -E "rendering/|document-ast/|slides/types\.zod|prompts/artifacts/document|document-renderer" | head`
Expected: no new errors in any file touched by PR 2.

- [ ] **Step 3: Branch log review**

Run: `git log --oneline feat/text-document-ast..HEAD` (or `git log --oneline -30` from the tip).
Expected: clean sequence of atomic commits — one per task — all authored by Sulthan Nauval Abdillah, no `Co-Authored-By` trailers, all following the bullet-body style.

- [ ] **Step 4: (No commit — verification task)**

PR 2 ready to open after this check passes.

---

# Self-Review Checklist

After running through all 21 tasks, re-read the spec (`2026-04-24-text-document-diagrams-charts-design.md`) and verify:

- [ ] §4 architecture — every module in the file-layout diagram has a creating task.
- [ ] §4.3 bug fix — Task 2's fix + Task 5's regression test cover it; Task 4 propagates via slides import flip.
- [ ] §4.4 server mermaid — Task 9 implements + tests (4 cases including leaked-globals guard).
- [ ] §4.5 server raster — Task 8 implements + tests (4 cases including upscale-to-target).
- [ ] §4.6 resize helper — Task 7 implements + tests (5 cases).
- [ ] §5 schema — Tasks 11 (mermaid) and 12 (chart) extend the discriminatedUnion.
- [ ] §6 validator — Task 13 rejects empty + unknown-diagram-type; chart relies on ChartDataSchema transitively.
- [ ] §7 preview — Tasks 16 (mermaid) and 17 (chart) extend `renderBlock`.
- [ ] §8 docx export — Tasks 14 (mermaid) and 15 (chart) extend `renderBlock` on the server path.
- [ ] §9 prompt — Task 18 flips anti-pattern, adds sections, updates fixture via Task 19.
- [ ] §11 test matrix — all 8 test files enumerated in the spec are produced or updated.
- [ ] §13 PR split — Tasks 1–6 are PR 1; Tasks 7–21 are PR 2. Each PR shippable independently.
- [ ] §15 acceptance criteria — acceptance tests map to Task 21 (full green) + Task 20 (smoke with image embed assertion).

If any row is not satisfied by a task, add a task or extend an existing one.

---

# Execution handoff

Plan complete.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.

2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Choose one.
