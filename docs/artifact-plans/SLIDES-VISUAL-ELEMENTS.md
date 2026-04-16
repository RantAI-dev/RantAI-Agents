# Slides Visual Elements Extension Plan

## Context

The slides artifact (`application/slides`) currently only supports text-based layouts. This plan extends it to support visual elements:
- **Mermaid diagrams** rendered beautifully within slides
- **Images** with URL or `unsplash:keyword` syntax  
- **Data charts** (bar, line, pie, donut) via D3.js
- **Split layouts** combining visuals with text content
- **Hero layout** with full-bleed background image + text overlay

The goal is to enable modern, visually rich presentations while maintaining backward compatibility with existing slides and supporting PPTX export.

---

## Technical Decisions

### 1. Mermaid in HTML Slides
**Approach: Client-side rendering in iframe**
- The iframe already runs JavaScript for navigation
- Include Mermaid via CDN (`https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs`)
- Reuse theme config from `mermaid-config.ts`
- Render on DOMContentLoaded

### 2. Mermaid in PPTX Export
**Approach: Client-side canvas conversion**
- Render Mermaid to SVG using `mermaid.render()`
- Convert SVG to PNG via canvas (`canvas.toDataURL('image/png')`)
- Embed as base64 in pptxgenjs via `slide.addImage({ data: ... })`

### 3. Images
**Approach: Support both URLs and `unsplash:keyword`**
- Direct URLs work in HTML preview and PPTX export
- `unsplash:keyword` resolved via existing Unsplash resolver
- For PPTX: fetch image, convert to base64, embed

### 4. Charts (D3.js)
**Approach: Minimal D3 subset for server+client SVG generation**
- Dependencies: `d3-scale`, `d3-shape`, `d3-axis` (no full D3 bundle)
- Generate SVG strings that work in both HTML preview and PPTX export
- Chart types: `bar`, `bar-horizontal`, `line`, `pie`, `donut`
- For PPTX: SVG → Canvas → PNG @2x for crisp rendering

**Why D3.js:**
- Smooth curves (`curveMonotoneX` for line charts)
- Proper axis tick intervals
- Battle-tested edge case handling
- Easy to extend (stacked, area, scatter)

### 5. Hero Layout
**Approach: Full-bleed background with overlay**
- Background image covers entire slide
- Configurable overlay: `dark` (default), `light`, or `none`
- Text positioned with text-shadow for readability

### 6. V1.5 Visual Polish
**Image styling:**
```css
.slide img {
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
```

**Gradient backgrounds** (already exists for title/section/closing):
```css
.slide.dark {
  background: linear-gradient(135deg, ${primaryColor} 0%, ${darken(primaryColor, 0.3)} 100%);
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/slides/types.ts` | Add 7 new layouts, `diagram`, `imageUrl`, `chart`, `backgroundImage`, `overlay` fields |
| `src/lib/slides/render-html.ts` | Add Mermaid CDN, D3 charts, CSS for new layouts, render functions |
| `src/lib/slides/generate-pptx.ts` | Make async, add visual→PNG embedding, hero background |
| `src/lib/tools/builtin/_validate-artifact.ts` | Validate new layouts and required fields |
| `src/lib/prompts/artifacts/slides.ts` | Document new layouts for AI |

**New files to create:**
| File | Purpose | Runtime |
|------|---------|---------|
| `src/lib/slides/chart-to-svg.ts` | ChartData → SVG (D3) | Server + Client |
| `src/lib/slides/mermaid-to-svg.ts` | Mermaid → SVG | Client only |
| `src/lib/slides/svg-to-png.ts` | SVG → PNG @2x (Canvas) | Client only |

---

## Types

```typescript
export type SlideLayout =
  | "title" | "content" | "two-column" | "section" | "quote" | "closing"
  | "image-text"       // deprecated
  // New visual layouts:
  | "diagram"          // Full-slide Mermaid diagram
  | "image"            // Full-slide image with caption
  | "chart"            // Full-slide data chart
  | "diagram-content"  // Diagram + text (split)
  | "image-content"    // Image + text (split)
  | "chart-content"    // Chart + text (split)
  | "hero"             // Full-bleed background image + text overlay

export type ChartType = "bar" | "bar-horizontal" | "line" | "pie" | "donut"

export interface ChartDataPoint {
  label: string
  value: number
  color?: string
}

export interface ChartSeries {
  name: string
  values: number[]
  color?: string
}

export interface ChartData {
  type: ChartType
  title?: string
  data?: ChartDataPoint[]    // bar, pie, donut
  labels?: string[]          // line x-axis
  series?: ChartSeries[]     // multi-series line
  showValues?: boolean
  showLegend?: boolean
}

export interface SlideData {
  layout: SlideLayout
  // Existing fields...
  title?: string
  subtitle?: string
  bullets?: string[]
  content?: string
  leftColumn?: string[]
  rightColumn?: string[]
  quote?: string
  attribution?: string
  note?: string
  // New visual fields:
  diagram?: string            // Mermaid diagram code
  imageUrl?: string           // Image URL or "unsplash:keyword"
  imageCaption?: string       // Caption for image-only slides
  chart?: ChartData           // Chart configuration
  backgroundImage?: string    // For hero layout
  overlay?: "dark" | "light" | "none"  // Text overlay style for hero
}
```

---

## Chart Examples

**Bar:**
```json
{
  "type": "bar",
  "title": "Revenue by Quarter",
  "data": [
    { "label": "Q1", "value": 120000 },
    { "label": "Q2", "value": 150000 }
  ]
}
```

**Line (multi-series):**
```json
{
  "type": "line",
  "title": "Growth",
  "labels": ["Jan", "Feb", "Mar"],
  "series": [
    { "name": "Revenue", "values": [100, 120, 140] },
    { "name": "Users", "values": [50, 65, 80] }
  ]
}
```

**Pie:**
```json
{
  "type": "pie",
  "title": "Market Share",
  "data": [
    { "label": "A", "value": 45 },
    { "label": "B", "value": 30 }
  ]
}
```

---

## Validation Rules

- `diagram` / `diagram-content`: require `diagram` field
- `image` / `image-content`: require `imageUrl` field
- `chart` / `chart-content`: require `chart.type` + `chart.data` or `chart.series`
- `hero`: require `backgroundImage` field
- `*-content`: require `bullets` or `content`

---

## Implementation Phases

### Phase 1: Foundation
**Goal:** Types and validation ready

1. Update `types.ts` — add layouts + ChartData types
2. Update `_validate-artifact.ts` — validate new layouts
3. Run type check

### Phase 2: Chart Renderer
**Goal:** D3 chart generation working

1. Install D3 dependencies:
   ```bash
   bun add d3-scale d3-shape d3-axis
   bun add -D @types/d3-scale @types/d3-shape @types/d3-axis
   ```
2. Create `chart-to-svg.ts` — implement all chart types
3. Test SVG output for each chart type

### Phase 3: HTML Preview
**Goal:** Visual slides render in browser

1. Update `render-html.ts`:
   - Add Mermaid CDN script
   - Add CSS for new layouts (diagram, image, chart, split, hero)
   - Add V1.5 image polish (shadow, border-radius)
   - Add hero layout with overlay
   - Add render cases for all visual layouts
2. Test in browser with sample slides

### Phase 4: PPTX Export
**Goal:** Visuals export correctly to PowerPoint

1. Create `svg-to-png.ts` — canvas conversion at 2x
2. Create `mermaid-to-svg.ts` — mermaid render wrapper
3. Update `generate-pptx.ts`:
   - Add async render functions for each visual type
   - Add hero slide with background image + overlay shape
   - Integrate PNG @2x conversion
4. Test PPTX download and open in PowerPoint

### Phase 5: AI Prompt
**Goal:** AI can generate visual slides

1. Update `slides.ts` — document new layouts
2. Add examples for diagram, image, chart, hero
3. Test AI generation

### Phase 6: Final Verification
**Goal:** Everything works end-to-end

1. Create test deck with all layout types
2. Verify HTML preview
3. Verify PPTX export
4. Check edge cases

---

## Verification Checklist

- [ ] Existing slides unchanged (backward compat)
- [ ] Mermaid renders in preview with correct theming
- [ ] Images load (URL + unsplash) with V1.5 shadow/border-radius
- [ ] All chart types work (bar, bar-horizontal, line, pie, donut)
- [ ] Hero layout renders with background + overlay
- [ ] PPTX export crisp (PNG @2x)
- [ ] Theme colors apply to charts
- [ ] Edge cases handled: empty data, invalid mermaid, failed fetch

---

## Potential Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CORS blocking image fetch in PPTX | Resolve `unsplash:` server-side before export, use fallback placeholder |
| Mermaid render failure in PPTX | Validate syntax in validator, embed "Diagram unavailable" text as fallback |
| Large diagrams look cramped | Document node limits in prompt, warn in validator if code >3000 chars |
| Canvas API unavailable (SSR) | PPTX generation is client-side only (triggered by user click) |
| D3 bundle size | Using minimal subset (d3-scale, d3-shape, d3-axis) — ~15KB gzipped |
