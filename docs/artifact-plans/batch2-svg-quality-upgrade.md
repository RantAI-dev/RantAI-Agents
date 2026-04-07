# Batch 2 — SVG Artifact Quality Upgrade

> **Goal:** Bring `image/svg+xml` artifact output to v0 / SVGMaker caliber by rewriting its LLM instruction, teaching the LLM the renderer's exact sanitizer constraints, defining clear style categories, and extending the server-side validation pipeline (from Batch 1) with SVG-specific checks.

---

## 1. Context & Current State

### 1.1 Current instruction (verbatim)

**Source:** [src/lib/prompts/instructions.ts:189-190](../../src/lib/prompts/instructions.ts#L189-L190)

> **image/svg+xml — SVG Graphics**
> Create clean, well-structured SVG with proper viewBox. Use semantic grouping with `<g>` elements. Apply consistent stroke widths and color palettes. Optimize paths — avoid unnecessary precision in coordinates. Include descriptive `<title>` elements for accessibility.

Two sentences. No examples, no style categories, no sanitizer awareness, no anti-patterns, no a11y depth, no scalability rules. Compared to the Batch 1 rewrites for HTML/React, this entry is essentially a placeholder.

### 1.2 Renderer ground truth

**Source:** [src/features/conversations/components/chat/artifacts/renderers/svg-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/svg-renderer.tsx)

```ts
DOMPurify.sanitize(content, {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ["use"],
})
```

The renderer:

- **Renders inline** (not in an iframe) via `dangerouslySetInnerHTML` inside a flex-centered `<div>` with `p-4`, `min-h-[100px]`, and `[&>svg]:max-w-full [&>svg]:h-auto`.
- Uses DOMPurify's **`svg` + `svgFilters`** profiles, plus an explicit allow-list for `<use>`.
- Does **NOT** wrap in iframe — meaning any allowed `<style>` block leaks into the parent page's CSS cascade if its selectors are global. This is a real footgun.

**What DOMPurify's SVG profile allows / strips (verified against DOMPurify ≥ 3 source):**

| Element / attr | Status | Notes |
|---|---|---|
| `<svg>`, `<g>`, `<defs>`, `<symbol>`, `<use>` | ✅ allowed | `use` only via our explicit `ADD_TAGS` |
| `<path>`, `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>` | ✅ | core shapes |
| `<text>`, `<tspan>`, `<textPath>` | ✅ | text rendering OK |
| `<title>`, `<desc>` | ✅ | a11y |
| `<linearGradient>`, `<radialGradient>`, `<stop>`, `<pattern>`, `<clipPath>`, `<mask>`, `<marker>` | ✅ | `<defs>` content |
| `<filter>` and SVG filter primitives (`<feGaussianBlur>`, `<feColorMatrix>`, `<feMerge>`, etc.) | ✅ | enabled by `svgFilters` profile |
| `<style>` inside `<svg>` | ✅ allowed by profile | **DANGEROUS — leaks into parent page CSS because we render inline, not in an iframe.** |
| `<animate>`, `<animateTransform>`, `<animateMotion>` | ✅ allowed | SMIL works, but deprecated in browsers |
| `<script>` | ❌ stripped | hard-stripped by all profiles |
| `<foreignObject>` | ❌ stripped | not in svg profile |
| `xlink:href` / `href` to external URL (`http://`, `https://`, `data:` images) | ❌ stripped/sanitized | only `#fragment` survives reliably; `<use href="#sym">` works |
| Event handler attrs (`onclick`, `onload`, …) | ❌ stripped | always |
| `<a xlink:href="...">` | ⚠️ partial | href stripped to safe values only |

**Critical implications for the instruction:**

1. **`<style>` is technically allowed but is a footgun** — because the renderer is inline (not iframed), any global selectors inside `<style>` leak into the host page. The instruction must forbid `<style>` for safety, OR require all rules to be scoped via a unique class on the root `<svg>`. We'll forbid it and use SVG presentation attributes instead (which is also better for portability).
2. **`<script>`, `<foreignObject>`, and external `href` are guaranteed-stripped** — telling the LLM not to emit them prevents broken output.
3. **No iframe = no width/height cap from the parent.** The CSS rule `[&>svg]:max-w-full [&>svg]:h-auto` means the `<svg>` will fill the available width and scale by aspect ratio. **`viewBox` is mandatory** for this to work; hardcoding `width="200"` will pin a fixed size and break scaling.
4. **`<animate>` works but is fragile.** CSS animations (the modern way) require `<style>` which we're forbidding. Tell the LLM to prefer static SVGs unless animation is explicitly requested, in which case use SMIL `<animate>` elements (no CSS).

### 1.3 Tool flow & validation hookpoint

`create_artifact` and `update_artifact` go through the same validation entry point we extended in Batch 1: [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts).

Currently `validateArtifactContent()` returns `{ ok: true, errors: [], warnings: [] }` for any type other than `text/html` and `application/react`. We will add an `image/svg+xml` branch.

### 1.4 Pattern extraction from references

| Pattern | v0 | SVGMaker | DOMPurify reality | Adopt? |
|---|---|---|---|---|
| Constrain colors to ≤ 5 / use named palette | ✅ | ✅ (`few_colors`, `monochrome`) | n/a | **Yes** |
| Style vocabulary: `flat`, `minimal`, `geometric`, `line-art` | — | ✅ | n/a | **Yes** — gives LLM shared language |
| Composition vocabulary: `icon`, `centered`, `full_scene` | — | ✅ | n/a | **Yes** |
| `viewBox` mandatory, no hardcoded width/height | ✅ | ✅ | required (renderer scales by viewBox) | **Yes — hard rule** |
| `currentColor` for icons | ✅ | — | works | **Yes** |
| `<title>` + `<desc>` + `role="img"` + `aria-labelledby` | ✅ (a11y mandate) | — | works | **Yes** |
| Prefer geometric primitives over `<path>` | ✅ | ✅ (`geometric`) | works | **Yes** |
| Round path coordinates to 1 decimal | — | — | n/a | **Yes** (size + diff readability) |
| Ban photorealism, complex maps, dense data viz | ✅ ("does NOT output `<svg>` for complex") | implicit | n/a | **Yes** |
| Forbid `<script>`, `<foreignObject>`, external refs | — | — | **stripped** | **Yes — must be in instruction** |
| Forbid `<style>` blocks (cascade leak) | — | — | allowed but unsafe inline | **Yes** — Batch 2 specific |
| Few-shot examples embedded in prompt | ✅ | partial | n/a | **Yes** |

---

## 2. Quality Dimensions (what makes an SVG "good")

1. **Structure** — root `<svg>` with `xmlns`, `viewBox`, no hardcoded `width`/`height`; `<defs>` for reusables; `<g>` grouping with semantic `id`s.
2. **Visual quality** — consistent stroke width across shapes, harmonious palette (≤ 5 colors), correct fill-vs-stroke usage, gradients defined in `<defs>`.
3. **Scalability** — must look correct at 24 px (icon use) AND 400 px (illustration use). No detail that disappears at small sizes; no 1-px hairlines that alias.
4. **Accessibility** — `<title>` (always), `<desc>` (for complex), `role="img"`, `aria-labelledby`. Decorative SVGs use `aria-hidden="true"` instead.
5. **Code quality** — 2-space indent, attributes (not inline `style`), no empty `<g>`, no zero-effect transforms, paths rounded to 1 decimal.
6. **Security & sanitizer compatibility** — no `<script>`, no `<foreignObject>`, no external `href`/`xlink:href` (only `#fragment`), no `<style>` blocks (cascade leak), no event handlers.

---

## 3. Style Categories

The instruction will teach the LLM **five concrete categories** with explicit defaults so output is predictable.

| Category | viewBox | Color count | Stroke vs Fill | Composition | Required a11y |
|---|---|---|---|---|---|
| **Icon** | `0 0 24 24` | 1 (`currentColor`) | stroke-based, `stroke-width="2"`, `fill="none"`, `stroke-linecap="round"`, `stroke-linejoin="round"` | centered, ≤ 16 visible units of detail | `<title>` + `role="img"` |
| **Illustration** | `0 0 400 300` (or proportional) | 3–5 named colors | mostly fill, no strokes unless outlining | grouped scene, `<g id="...">` per logical part | `<title>` + `<desc>` + `role="img"` + `aria-labelledby` |
| **Logo / Badge** | `0 0 200 200` (square) or `0 0 240 80` (wordmark) | ≤ 3 colors | bold filled shapes; `<text>` for wordmarks | centered, balanced | `<title>` + `role="img"` |
| **Diagram** (non-Mermaid) | proportional to content | 2–4 colors | mixed; lines for connectors, fills for nodes | structured grid, consistent spacing | `<title>` + `<desc>` |
| **Decorative pattern** | repeats via `<pattern>` | 1–3 colors | per pattern | abstract | `aria-hidden="true"` (no title needed) |

---

## 4. Plan

### 4.1 Rewrite `ARTIFACT_TYPE_INSTRUCTIONS['image/svg+xml']`

**File:** [src/lib/prompts/instructions.ts:189-190](../../src/lib/prompts/instructions.ts#L189-L190)

Replace the current 2-sentence value with the following complete, ready-to-paste string:

````md
**image/svg+xml — SVG Graphics**

You are generating a single, self-contained SVG document that will be rendered **inline** (not in an iframe) inside a sanitized container. The result must look like it was made by a senior visual designer — clean geometry, harmonious colors, scalable, and accessible.

## Runtime Environment
- The SVG is sanitized by **DOMPurify** with the `svg` + `svgFilters` profiles. Anything not in those profiles is silently stripped.
- **Render container** scales the SVG with `max-width: 100%; height: auto`. This means **`viewBox` is the only sizing mechanism that works** — hardcoded `width`/`height` attributes pin a fixed size and break responsive scaling.
- **DO NOT use `<script>`** — stripped.
- **DO NOT use `<foreignObject>`** — stripped.
- **DO NOT use `<style>` blocks** — they technically pass the sanitizer but leak into the host page CSS because rendering is inline, not iframed. Use SVG presentation attributes (`fill`, `stroke`, `stroke-width`, `opacity`) instead.
- **DO NOT use external `href` / `xlink:href`** (no `http://`, `https://`, `data:` URIs). Only same-document `#fragment` references are safe (e.g. `<use href="#icon-arrow">`).
- **DO NOT use event handlers** (`onclick`, `onload`, etc.) — stripped.
- For animation, only SMIL (`<animate>`, `<animateTransform>`) is available. Prefer static SVG unless animation is explicitly requested.

## Required Document Structure
Every SVG MUST start with:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" role="img" aria-labelledby="title-id">
  <title id="title-id">Concise descriptive title</title>
  <!-- optional: <desc id="desc-id">Longer description for complex illustrations</desc> -->
  <!-- content -->
</svg>
```
Rules:
- Always include `xmlns="http://www.w3.org/2000/svg"`.
- Always include `viewBox`. **Never** set `width=` or `height=` on the root `<svg>`.
- Always include `<title>` as the first child (unless decorative — see below).
- Use `role="img"` and `aria-labelledby` pointing to the title (and desc, if present).
- Decorative-only SVGs (background patterns, dividers): use `aria-hidden="true"` and skip `<title>`.

## Style Categories — pick ONE per artifact
Choose the category that matches the request and follow its defaults.

### Icon (default for "icon", "glyph", "symbol")
- `viewBox="0 0 24 24"`
- Single color: use `stroke="currentColor"` (inherits from parent CSS)
- `fill="none"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- ≤ 16 visible units of detail; nothing smaller than 2 px at the source viewBox
- Prefer geometric primitives (`<rect>`, `<circle>`, `<line>`, `<polyline>`) over `<path>` when possible

### Illustration (default for "illustration", "empty state", "scene")
- `viewBox="0 0 400 300"` or similar proportional rectangle
- 3–5 colors from a harmonious palette (define them at the top of the file as comment + reuse)
- Mostly filled shapes (no strokes unless outlining for emphasis)
- Group logical parts with `<g id="...">` (e.g. `<g id="background">`, `<g id="character">`)
- Include `<desc>` describing the scene

### Logo / Badge
- Square `viewBox="0 0 200 200"` for emblems, or rectangular `viewBox="0 0 240 80"` for wordmarks
- ≤ 3 colors
- Bold filled shapes; use `<text>` (not outlined paths) for letterforms unless explicitly asked
- Centered, balanced composition

### Diagram (non-flowchart — flowcharts use Mermaid instead)
- Proportional viewBox sized to content
- 2–4 colors
- Consistent stroke widths for connectors, consistent corner radii for nodes
- Use `<text>` for labels with `text-anchor="middle"` and `dominant-baseline="middle"`

### Decorative pattern
- Use `<pattern>` inside `<defs>` and reference via `fill="url(#pattern-id)"`
- 1–3 colors
- `aria-hidden="true"` on the root `<svg>`

## Color System
- **Maximum 5 colors per SVG.** Decorative patterns: max 3.
- **Icons** must use `currentColor` so the icon inherits text color from the parent.
- For multi-color illustrations, use a harmonious palette. Default suggestions:
  - Primary: `#4F46E5` (indigo) or `#0EA5E9` (sky)
  - Secondary: `#10B981` (emerald) or `#F59E0B` (amber)
  - Neutrals: `#0F172A` (ink), `#64748B` (muted), `#F1F5F9` (surface)
- Define gradients in `<defs>` with descriptive `id`s and reference via `fill="url(#grad-name)"`.
- **Never** use neon, high-saturation purple, or more than 5 hues unless explicitly asked.

## Path Quality
- Prefer primitives (`<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`) over `<path>`.
- For `<path>`: round all coordinates to **1 decimal place** maximum. Bad: `M12.456789 34.567890`. Good: `M12.5 34.6`.
- Use relative path commands (`m`, `l`, `c`, `q`) for shorter, more readable paths.
- No duplicate consecutive points; no zero-length line segments.
- Use `<defs>` + `<use>` to reuse repeated symbols rather than duplicating geometry.

## Accessibility (non-negotiable for non-decorative SVGs)
- `<title>` is the first child of `<svg>`, with text describing the meaning (not the visuals).
- Add `<desc>` for illustrations and diagrams that need more context.
- `role="img"` on the root `<svg>`.
- `aria-labelledby="title-id desc-id"` (omit `desc-id` if no `<desc>`).
- Decorative SVGs: `aria-hidden="true"` instead of title/role.

## Code Quality — STRICT
- 2-space indentation.
- Attributes on multi-attribute elements may wrap one per line for readability.
- **Use SVG presentation attributes** (`fill`, `stroke`, `stroke-width`, `opacity`, `transform`) — never inline `style="..."` and never `<style>` blocks.
- No empty `<g>` wrappers, no identity transforms (`transform="translate(0,0)"`), no zero-effect attributes.
- Meaningful `id`s for groups and gradients (`id="bg-gradient"`, not `id="lg1"`).
- **NEVER truncate.** No `<!-- ...rest of icon... -->`. Output the COMPLETE SVG.

## Anti-Patterns
- ❌ Hardcoded `width="..."` / `height="..."` on root `<svg>` (breaks responsive scaling)
- ❌ Missing `viewBox`
- ❌ Missing `xmlns`
- ❌ `<script>` (stripped)
- ❌ `<foreignObject>` (stripped)
- ❌ `<style>` blocks (leak into host page CSS — use attributes instead)
- ❌ External `href` / `xlink:href` to `http://`, `https://`, `data:` (stripped)
- ❌ Event handler attributes (`onclick`, `onload`, …) (stripped)
- ❌ Emoji characters inside `<text>` (rendering inconsistent across platforms)
- ❌ Photorealistic illustrations (SVG is the wrong format)
- ❌ Geographic maps, dense scientific data viz, complex info-graphics (use Mermaid or HTML+canvas)
- ❌ Outlined text via `<path>` instead of `<text>` (unless explicitly asked)
- ❌ More than 5 colors
- ❌ Coordinate precision beyond 1 decimal place
- ❌ Truncating "for brevity"

## Few-Shot Examples

### Example 1 — Icon (notification bell, 24×24, currentColor, stroke-based)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="bell-title"
     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="bell-title">Notifications</title>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
</svg>
```

### Example 2 — Illustration (empty state: "no results", ~400×300, 4 colors, flat style, grouped)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img"
     aria-labelledby="empty-title empty-desc">
  <title id="empty-title">No results found</title>
  <desc id="empty-desc">A magnifying glass over an empty document on a soft background.</desc>
  <defs>
    <linearGradient id="bg-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>
  </defs>
  <g id="background">
    <rect x="0" y="0" width="400" height="300" fill="url(#bg-gradient)" />
  </g>
  <g id="document" transform="translate(140 70)">
    <rect x="0" y="0" width="120" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
    <line x1="20" y1="40" x2="100" y2="40" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
    <line x1="20" y1="60" x2="80" y2="60" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
    <line x1="20" y1="80" x2="90" y2="80" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
  </g>
  <g id="magnifier" transform="translate(220 160)">
    <circle cx="0" cy="0" r="36" fill="none" stroke="#4F46E5" stroke-width="6" />
    <line x1="26" y1="26" x2="56" y2="56" stroke="#4F46E5" stroke-width="6" stroke-linecap="round" />
  </g>
</svg>
```
````

### 4.2 SVG validation rules

**File:** [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts)

Add a third branch to `validateArtifactContent()`:

```ts
if (type === "image/svg+xml") return validateSvg(content)
```

Implement `validateSvg(content: string)` using `parse5`'s XML-friendly mode is overkill — the cheapest approach is to parse with the existing `parse5` (HTML mode is forgiving for SVG fragments) plus a few targeted regex checks. Errors vs warnings:

**ERRORS (block the artifact, force LLM retry):**

1. **Empty / not parseable.** If `content.trim()` is empty or parse5 throws.
2. **Missing root `<svg>`.** First element must be `<svg>`.
3. **Missing `xmlns`.** Root `<svg>` must have `xmlns="http://www.w3.org/2000/svg"`.
4. **Missing `viewBox`.** Root `<svg>` must have a `viewBox` attribute.
5. **Hardcoded `width`/`height` on root.** If root `<svg>` has `width=` or `height=`, error: "Remove hardcoded width/height — use viewBox only so the SVG scales responsively."
6. **`<script>` element present.** "Remove `<script>` — it will be stripped by the sanitizer."
7. **`<foreignObject>` element present.** "Remove `<foreignObject>` — it will be stripped by the sanitizer."
8. **External `href` / `xlink:href`.** Any `href` or `xlink:href` whose value matches `^(https?:|data:|//)` → error. Allow `^#` (fragment) and empty.
9. **Event handler attributes.** Any attribute matching `^on[a-z]+$` → error.

**WARNINGS (don't block, surface for telemetry):**

10. **Missing `<title>` child.** Warning unless root has `aria-hidden="true"`.
11. **`<style>` block present.** Warning: "Inline `<style>` blocks leak into the host page CSS because the renderer is not iframed. Use SVG presentation attributes instead."
12. **More than 5 distinct color values** (count unique values from `fill=` and `stroke=` attributes excluding `none`, `currentColor`, `url(#...)`). Warning only.
13. **Path coordinate precision** > 2 decimals detected via regex on `d=` values. Warning only.
14. **Total size > 512 KB.** Existing global check in `create-artifact.ts` already handles this; no duplicate.

**Auto-fix flow:** Same as Batch 1 — `formatValidationError()` is already generic; the LLM gets the bullet list and self-corrects on retry. Cap retries at 1 (already in place).

#### Implementation sketch

```ts
function validateSvg(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("SVG content is empty.")
    return { ok: false, errors, warnings }
  }

  // parse5 in fragment mode handles svg fragments without doctype
  let document
  try {
    document = parseHtml(content)
  } catch (err) {
    errors.push(`SVG failed to parse: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, errors, warnings }
  }

  // Walk to find <svg> root and collect findings
  let rootSvg: Node | null = null
  let scriptCount = 0
  let foreignObjectCount = 0
  let styleBlockCount = 0
  let titleCount = 0
  const externalHrefs: string[] = []
  const eventHandlers: string[] = []
  const colorValues = new Set<string>()
  let highPrecisionPath = false

  const walk = (node: Node) => {
    const tag = node.tagName || node.nodeName
    if (tag === "svg" && !rootSvg) rootSvg = node
    if (tag === "script") scriptCount++
    if (tag === "foreignobject") foreignObjectCount++
    if (tag === "style") styleBlockCount++
    if (tag === "title" && node.parentNode && (node.parentNode.tagName === "svg")) titleCount++

    node.attrs?.forEach((a) => {
      if (a.name === "href" || a.name === "xlink:href") {
        if (/^(https?:|data:|\/\/)/i.test(a.value)) externalHrefs.push(a.value)
      }
      if (/^on[a-z]+$/i.test(a.name)) eventHandlers.push(a.name)
      if ((a.name === "fill" || a.name === "stroke") &&
          a.value !== "none" && a.value !== "currentColor" &&
          !a.value.startsWith("url(")) {
        colorValues.add(a.value.toLowerCase())
      }
      if (a.name === "d" && /\d\.\d{3,}/.test(a.value)) highPrecisionPath = true
    })
    node.childNodes?.forEach(walk)
  }
  walk(document as unknown as Node)

  if (!rootSvg) {
    errors.push("Missing root <svg> element.")
    return { ok: false, errors, warnings }
  }

  const rootAttrs = (rootSvg as Node).attrs ?? []
  const hasXmlns = rootAttrs.some((a) => a.name === "xmlns")
  const hasViewBox = rootAttrs.some((a) => a.name === "viewbox")
  const hasWidth = rootAttrs.some((a) => a.name === "width")
  const hasHeight = rootAttrs.some((a) => a.name === "height")
  const ariaHidden = rootAttrs.find((a) => a.name === "aria-hidden")?.value === "true"

  if (!hasXmlns) errors.push('Missing xmlns="http://www.w3.org/2000/svg" on root <svg>.')
  if (!hasViewBox) errors.push("Missing viewBox attribute on root <svg>. The renderer scales by viewBox; without it the SVG cannot render responsively.")
  if (hasWidth || hasHeight) {
    errors.push("Remove hardcoded width/height attributes from the root <svg>. Use viewBox only so the SVG scales responsively to its container.")
  }
  if (scriptCount > 0) errors.push("Found <script> element(s) — these are stripped by the sanitizer. Remove them.")
  if (foreignObjectCount > 0) errors.push("Found <foreignObject> element(s) — these are stripped by the sanitizer. Remove them.")
  if (externalHrefs.length > 0) {
    errors.push(`Found external href/xlink:href references: ${externalHrefs.slice(0, 3).map((h) => `"${h}"`).join(", ")}. Only same-document fragment references (#id) are allowed.`)
  }
  if (eventHandlers.length > 0) {
    errors.push(`Found event handler attributes: ${[...new Set(eventHandlers)].join(", ")}. These are stripped by the sanitizer — remove them.`)
  }

  if (titleCount === 0 && !ariaHidden) {
    warnings.push("Missing <title> child of root <svg>. Add one for accessibility, or set aria-hidden=\"true\" if the SVG is purely decorative.")
  }
  if (styleBlockCount > 0) {
    warnings.push("Inline <style> block detected. Because the renderer is not iframed, CSS inside <style> can leak into the host page. Prefer SVG presentation attributes (fill, stroke, stroke-width, opacity).")
  }
  if (colorValues.size > 5) {
    warnings.push(`SVG uses ${colorValues.size} distinct colors. Aim for ≤ 5 for visual cohesion.`)
  }
  if (highPrecisionPath) {
    warnings.push("Some path coordinates use more than 2 decimal places. Round to 1 decimal for readability and smaller file size.")
  }

  return { ok: errors.length === 0, errors, warnings }
}
```

Notes:
- parse5 lowercases tag names and attribute names, hence the `viewbox` / `foreignobject` checks.
- We reuse the existing `Node` type and `parseHtml` import.
- No new dependencies.

### 4.3 Tests

**File:** `tests/unit/lib/tools/_validate-artifact.test.ts` (extend or create alongside Batch 1's tests)

| # | Case | Expected |
|---|---|---|
| 1 | Valid icon SVG (viewBox, xmlns, title, role="img") | `ok: true`, no errors |
| 2 | Missing `xmlns` | error: "Missing xmlns…" |
| 3 | Missing `viewBox` | error: "Missing viewBox…" |
| 4 | Hardcoded `width="200" height="200"` on root | error: "Remove hardcoded width/height…" |
| 5 | Contains `<script>alert(1)</script>` | error: "Found <script>…" |
| 6 | Contains `<foreignObject>` | error: "Found <foreignObject>…" |
| 7 | `<image href="https://evil.com/x.png">` | error: "external href…" |
| 8 | `<rect onclick="x()">` | error: "event handler…" |
| 9 | Empty string | error: "empty" |
| 10 | Missing `<title>`, no `aria-hidden` | warning only, `ok: true` |
| 11 | `aria-hidden="true"` and no `<title>` | no warning, `ok: true` |
| 12 | `<style>` block present | warning, `ok: true` |
| 13 | 7 distinct fill colors | warning, `ok: true` |
| 14 | Path with `M12.456789 34.567890` | warning, `ok: true` |
| 15 | Valid illustration (4 colors, title, desc, role, grouped) | `ok: true`, no warnings |

### 4.4 Implementation Order

| # | Task | Effort | Files |
|---|---|---|---|
| 1 | Rewrite `ARTIFACT_TYPE_INSTRUCTIONS['image/svg+xml']` | 2 h | [src/lib/prompts/instructions.ts](../../src/lib/prompts/instructions.ts) |
| 2 | Implement `validateSvg()` and wire into `validateArtifactContent()` | 1.5 h | [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) |
| 3 | Unit tests for SVG validation (15 cases above) | 1 h | `tests/unit/lib/tools/_validate-artifact.test.ts` |
| 4 | Manual test pass with 5 prompts (§4.5), tune few-shot examples | 1 h | [src/lib/prompts/instructions.ts](../../src/lib/prompts/instructions.ts) |

**Total: ~5.5 hours.**

### 4.5 Test Prompts

Run these against the canvas mode with `image/svg+xml` selected, then evaluate against the rubric below.

1. **Icon** — "Buat icon notification bell, clean, single color"
2. **Illustration** — "Buat empty state illustration untuk halaman 'no results found'"
3. **Logo** — "Buat logo untuk startup bernama 'CloudPeak', minimalist, geometric"
4. **Badge** — "Buat badge 'Premium Member' dengan gradient gold"
5. **Edge case (animation / sanitizer probe)** — "Buat animated loading spinner SVG"
   - Verifies the LLM picks SMIL `<animate>` (allowed) over CSS animation in `<style>` (forbidden).
   - Verifies validator does not false-positive on animation elements.

**Per-prompt rubric:**
- ✅ `viewBox` present, no hardcoded width/height
- ✅ `xmlns` present
- ✅ `<title>` present (or `aria-hidden="true"` for purely decorative)
- ✅ `role="img"` and `aria-labelledby`
- ✅ ≤ 5 colors
- ✅ Renders cleanly at 24 px AND 200 px (open in browser, scale)
- ✅ No `<script>`, `<foreignObject>`, `<style>`, external `href`, or event handlers
- ✅ Code is complete (no truncation comments)

---

## 5. Risks & Open Questions

1. **`<style>` is currently allowed by the sanitizer.** We are choosing to forbid it via instruction + warning rather than via sanitizer config, because there are legitimate uses (scoped via root class) and we don't want to silently break user-uploaded SVGs. **Open question:** should we additionally tighten the DOMPurify config with `FORBID_TAGS: ["style"]` for renderer-side defense in depth? Recommend: yes, in a follow-up — out of scope for Batch 2.
2. **SMIL animations are deprecated** in some browsers but still work in Chrome/Firefox/Safari for SVG-in-DOM. The instruction recommends them only when animation is requested, otherwise prefers static.
3. **No iframe isolation** means a malicious user-provided SVG could in theory affect the surrounding page via global CSS in `<style>` blocks. Sanitizer config tightening (item 1) would close this. Tracked separately.
4. **`parse5` handles SVG-as-HTML-fragment fine** for our validator's needs (we only need tag names + attributes). If we ever need true XML namespace handling we'd switch to `parse5/lib/parser` SVG mode or `xmldom`. Not needed today.

---

## Summary

**Top 3 most impactful additions vs current SVG instruction:**

1. **Sanitizer constraint awareness baked into the prompt + validator.** Today the LLM has zero idea what the renderer will strip. After Batch 2, both the instruction and the validator know that `<script>`, `<foreignObject>`, external `href`, and event handlers are dead-on-arrival, and that hardcoded `width`/`height` break responsive scaling. This single change eliminates the largest class of broken-on-render output.
2. **Five concrete style categories with viewBox + color + stroke/fill defaults.** Replaces vague "consistent stroke widths and color palettes" with explicit per-category templates the LLM can pattern-match against. Plus two complete few-shot examples (icon + illustration) following Batch 1's example-driven approach.
3. **Mandatory accessibility scaffolding** (`<title>`, `<desc>`, `role="img"`, `aria-labelledby`) enforced by the prompt and validated by the warning channel — moving SVG output from "graphic" to "accessible image" by default.

**Estimated total effort:** ~5.5 hours.

**Most critical sanitizer finding:** The renderer is **inline, not iframed**. This means (a) `viewBox` is the only sizing mechanism that works (hardcoded `width`/`height` break scaling — must be a hard validation error), and (b) `<style>` blocks are technically allowed by DOMPurify but leak CSS into the host page — must be forbidden by instruction (and warned by validator) even though the sanitizer permits them. Getting either of these wrong produces visibly broken or visually-polluting output.
