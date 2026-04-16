# Slides Artifact System — V2 Enhancement Plan

## Executive Summary

This plan outlines V2 enhancements for the slides artifact system, building on the solid V1 foundation. V2 focuses on:
1. **Bug fixes** — Hero layout first-slide issue
2. **New layouts** — Stats, Gallery, enhanced Quote
3. **Visual polish** — Icons, decorative elements, refined styling
4. **Code quality** — DRY refactoring, unified utilities

---

## Part 1: Codebase Analysis

### Current Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | 13 layouts, SlideData interface, ChartData |
| HTML Render | `render-html.ts` | ~800 lines, CSS + HTML + Mermaid CDN |
| PPTX Export | `generate-pptx.ts` | ~900 lines, pptxgenjs integration |
| Charts | `chart-to-svg.ts` | D3.js SVG generation (5 chart types) |
| Validation | `_validate-artifact.ts` | 30+ error checks, 15+ warnings |
| AI Prompt | `slides.ts` | 260+ lines of schema + examples |

### Code Patterns Observed

**Strengths:**
- Clean separation between types, rendering, and validation
- Both HTML and PPTX driven from same `SlideData` schema
- Comprehensive validation with actionable AI error messages
- Graceful fallbacks (placeholder images, error messages in diagrams)

**Pain Points:**

| Issue | Location | Impact |
|-------|----------|--------|
| Duplicated text cleaning | `render-html.ts:cleanText()`, `generate-pptx.ts:clean()` | Maintenance burden |
| Divergent color utilities | `darkenHex()` vs `darkenColor()` | Inconsistent results |
| Chart sizing hardcoded | Multiple places | Aspect ratio mismatches |
| Mermaid theme not synced | HTML vs PPTX use different configs | Visual inconsistency |
| Image fallback varies | HTML uses placehold.co, PPTX uses Unsplash Source | Different behavior |

### Refactoring Opportunities

1. **Create `src/lib/slides/utils.ts`** — Shared utilities:
   - `cleanMarkdown(text)` — Remove markdown syntax
   - `darkenColor(hex, amount)` / `lightenColor(hex, amount)`
   - `hexToRgb(hex)` / `rgbToHex(r,g,b)`
   - `CHART_DIMENSIONS` — Layout-specific sizing constants

2. **Unify Mermaid theme** — Extract to `src/lib/slides/mermaid-theme.ts`

3. **Consolidate image handling** — Single `resolveImageUrl()` path

---

## Part 2: Hero Bug Investigation

### Root Cause

The hero layout background only covers ~40% on the **first** slide due to CSS transform interference.

**Base `.slide` class applies:**
```css
.slide {
  transform: translateX(30px);  /* Entry animation offset */
  transition: opacity 0.45s ease, transform 0.45s ease;
}
```

**Problem:** On initial page load:
1. First slide renders with `transform: translateX(30px)` briefly
2. Background-image positioning gets clipped/offset
3. `show(0)` adds `.active` class which sets `transform: translateX(0)`
4. But background may have already rendered incorrectly

**Why subsequent slides work:** They animate in after JS has full control, so transforms are managed properly.

### Proposed Fix

**Option A: Exclude hero from transforms**
```css
.slide:not(.hero) {
  transform: translateX(30px);
}

.slide:not(.hero).active {
  transform: translateX(0);
}

.slide:not(.hero).prev {
  transform: translateX(-30px);
}

.slide.hero {
  transform: none;  /* No animation, full-bleed background */
}
```

**Option B: Force override on hero**
```css
.slide.hero,
.slide.hero.active,
.slide.hero.prev {
  transform: none !important;
}
```

**Recommendation:** Option A is cleaner — separates concerns and doesn't need `!important`.

### Implementation

**File:** `src/lib/slides/render-html.ts`

1. Modify base `.slide` class to exclude hero:
   ```css
   .slide:not(.hero) {
     transform: translateX(30px);
   }
   ```

2. Update `.slide.active` and `.slide.prev`:
   ```css
   .slide:not(.hero).active {
     transform: translateX(0);
   }
   .slide:not(.hero).prev {
     transform: translateX(-30px);
   }
   ```

3. Keep hero CSS as-is (already has correct background properties)

---

## Part 3: Feature Evaluation

### Feature Comparison Matrix

| Feature | Visual Impact | Effort | PPTX Feasible | Priority |
|---------|--------------|--------|---------------|----------|
| Stats/Metrics Layout | High | Low | Yes | **P0** |
| Quote Layout (enhanced) | Medium | Low | Yes | **P0** |
| Icons in Bullets | High | Medium | Partial* | **P1** |
| Gallery Layout | High | Medium | Yes | **P1** |
| Visual Polish (shadows, etc.) | Medium | Low | Yes | **P1** |
| Decorative Elements | Low | High | Hard | **P2/Defer** |

*Icons: Can embed as PNG in PPTX, but no vector icons

### Priority Recommendations

**P0 — Must Have (V2.0):**
- Hero bug fix
- Stats/Metrics layout
- Enhanced Quote layout
- Code refactoring (utils consolidation)

**P1 — Should Have (V2.1):**
- Icons support (`{icon:name}` syntax)
- Gallery layout
- Visual polish (shadows, rounded corners consistency)

**P2 — Nice to Have (V2.2 or V3):**
- Decorative elements (blobs, shapes)
- Custom fonts
- Speaker notes
- Dark mode auto-detection

### Features to Defer to V3

1. **Decorative Elements** — High complexity, low ROI for business presentations
2. **Custom Fonts** — Requires font embedding, CDN management, PPTX font licensing
3. **Interactive Charts** — Would require separate rendering path, not PPTX-compatible

---

## Part 4: Technical Design

### 4.1 Stats/Metrics Layout

**Use Case:** Big numbers with context (KPIs, metrics, achievements)

**Schema Addition:**
```typescript
// types.ts
export interface StatItem {
  value: string      // "42%", "$1.2M", "99.9%"
  label: string      // "Customer Retention"
  trend?: "up" | "down" | "neutral"
  change?: string    // "+12% YoY"
}

export interface SlideData {
  // ... existing fields
  stats?: StatItem[]  // For stats layout (2-4 items)
}
```

**Validation:**
- `stats` layout requires `stats` array with 2-4 items
- Each item requires `value` and `label`
- Warning if more than 4 stats (crowded)

**HTML Rendering:**
```html
<div class="stats-layout">
  <h2>Key Metrics</h2>
  <div class="stats-grid">
    <div class="stat-item">
      <div class="stat-value">42%</div>
      <div class="stat-label">Retention Rate</div>
      <div class="stat-change up">+12% YoY</div>
    </div>
    <!-- ... -->
  </div>
</div>
```

**CSS:**
```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 40px;
  padding: 40px;
}

.stat-value {
  font-size: clamp(48px, 8vw, 80px);
  font-weight: 700;
  color: var(--secondary-color);
}

.stat-label {
  font-size: 18px;
  color: #64748b;
  margin-top: 8px;
}

.stat-change {
  font-size: 14px;
  margin-top: 4px;
}

.stat-change.up { color: #22c55e; }
.stat-change.down { color: #ef4444; }
```

**PPTX Rendering:**
- Use large text boxes for values (48pt+)
- Secondary color for value text
- Trend arrows as Unicode characters (↑ ↓ →)

---

### 4.2 Enhanced Quote Layout

**Current:** Basic blockquote with attribution
**Enhanced:** Large stylized quote with optional image/avatar

**Schema Addition:**
```typescript
export interface SlideData {
  // ... existing fields
  quoteImage?: string  // Avatar/photo URL for quote attribution
  quoteStyle?: "minimal" | "large" | "card"  // Default: "large"
}
```

**Validation:**
- `quote` layout requires `quote` field
- `attribution` recommended but not required
- `quoteImage` optional (shows avatar next to attribution)

**HTML Rendering (large style):**
```html
<div class="quote-layout large">
  <div class="quote-mark">"</div>
  <blockquote>The best way to predict the future is to create it.</blockquote>
  <div class="quote-attribution">
    <img src="..." class="quote-avatar" />
    <div>
      <cite>Peter Drucker</cite>
      <span class="quote-role">Management Consultant</span>
    </div>
  </div>
</div>
```

**CSS Additions:**
```css
.quote-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 16px;
}

.quote-attribution {
  display: flex;
  align-items: center;
  margin-top: 24px;
}

.quote-layout.card {
  background: #f8fafc;
  border-radius: 16px;
  padding: 48px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
```

---

### 4.3 Icons Support

**Syntax:** `{icon:rocket}` in bullets, titles, content

**Implementation Approach:**

1. **Icon Library:** Use Lucide icons (MIT license, 1000+ icons)
2. **Resolution:** Server-side replacement before storage
3. **HTML:** Inline SVG from Lucide
4. **PPTX:** Pre-rendered PNG icons (24x24, 32x32)

**Schema:**
- No schema change — icons are inline in text fields
- Validation warns on invalid icon names

**Processing Pipeline:**
```
Input: "Fast deployment {icon:rocket}"
           ↓
Icon Resolver (server-side)
           ↓
Output HTML: "Fast deployment <svg class="inline-icon">...</svg>"
Output PPTX: "Fast deployment" + small image positioned inline
```

**Limitations:**
- PPTX cannot have true inline images in text
- Workaround: Render icon as prefix/suffix to text box

**Icon Resolver (new file `src/lib/slides/icons.ts`):**
```typescript
import { icons } from 'lucide-static'  // Pre-built SVG strings

const ICON_REGEX = /\{icon:([a-z-]+)\}/gi

export function resolveIcons(content: string): string {
  return content.replace(ICON_REGEX, (_, name) => {
    const svg = icons[name]
    if (!svg) return `[?${name}]`
    return `<span class="inline-icon">${svg}</span>`
  })
}
```

---

### 4.4 Gallery Layout

**Use Case:** Logo grids, team photos, screenshot galleries

**Schema Addition:**
```typescript
export interface GalleryItem {
  imageUrl: string
  caption?: string
  link?: string
}

export interface SlideData {
  // ... existing fields
  gallery?: GalleryItem[]  // For gallery layout (4-12 items)
  galleryColumns?: 2 | 3 | 4 | 5 | 6  // Default: auto based on count
}
```

**Validation:**
- `gallery` layout requires `gallery` array with 4-12 items
- Each item requires `imageUrl`
- Warning if more than 12 items (too crowded)

**HTML Rendering:**
```html
<div class="gallery-layout">
  <h2>Our Customers</h2>
  <div class="gallery-grid cols-4">
    <div class="gallery-item">
      <img src="..." alt="..." />
      <span class="gallery-caption">Acme Corp</span>
    </div>
    <!-- ... -->
  </div>
</div>
```

**CSS:**
```css
.gallery-grid {
  display: grid;
  gap: 24px;
  padding: 32px;
}

.gallery-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.gallery-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
.gallery-grid.cols-5 { grid-template-columns: repeat(5, 1fr); }
.gallery-grid.cols-6 { grid-template-columns: repeat(6, 1fr); }

.gallery-item img {
  width: 100%;
  height: auto;
  max-height: 120px;
  object-fit: contain;
  filter: grayscale(100%);
  opacity: 0.7;
  transition: all 0.3s ease;
}

.gallery-item img:hover {
  filter: grayscale(0%);
  opacity: 1;
}
```

**PPTX Rendering:**
- Grid of images with equal spacing
- Grayscale filter not supported — use full color
- Captions as small text below each image

---

### 4.5 Visual Polish

**Improvements to apply across all layouts:**

1. **Consistent shadows:**
   ```css
   --shadow-sm: 0 2px 8px rgba(0,0,0,0.08);
   --shadow-md: 0 4px 16px rgba(0,0,0,0.12);
   --shadow-lg: 0 8px 32px rgba(0,0,0,0.16);
   ```

2. **Refined border-radius:**
   ```css
   --radius-sm: 8px;
   --radius-md: 12px;
   --radius-lg: 16px;
   ```

3. **Chart container polish:**
   ```css
   .chart-container {
     background: #fafafa;
     border-radius: var(--radius-md);
     padding: 24px;
     box-shadow: var(--shadow-sm);
   }
   ```

4. **Image treatment:**
   - All images get `border-radius: 12px`
   - Subtle shadow on hover
   - Gallery images: grayscale → color on hover

5. **Typography refinements:**
   - Tighter letter-spacing on large headings
   - Increased line-height on body text
   - Consistent font weights (400, 500, 600, 700)

---

## Part 5: Implementation Phases

### Phase 0: Bug Fixes & Refactoring (1-2 days)

**Scope:**
- [ ] Fix hero layout transform bug
- [ ] Create `src/lib/slides/utils.ts` with shared utilities
- [ ] Unify text cleaning functions
- [ ] Consolidate color utilities

**Files Modified:**
- `render-html.ts` — Hero CSS fix, import utils
- `generate-pptx.ts` — Import utils, remove duplicates
- New: `utils.ts`

**Verification:**
- Hero background fills full slide on first slide
- All existing layouts still render correctly
- PPTX export unchanged

---

### Phase 1: Visual Polish (1 day)

> **Note:** Moved up from Phase 3 to benefit all existing layouts immediately.

**Scope:**
- [ ] Add CSS custom properties for shadows/radii
- [ ] Apply consistent styling across layouts
- [ ] Refine chart container appearance
- [ ] Improve image treatments
- [ ] Typography tweaks

**Files Modified:**
- `render-html.ts` — CSS additions
- `generate-pptx.ts` — Shadow consistency

---

### Phase 2: Stats Layout (1 day)

**Scope:**
- [ ] Add `stats` layout type and `StatItem` interface
- [ ] Add validation rules
- [ ] Implement HTML rendering
- [ ] Implement PPTX rendering
- [ ] Update AI prompt

**Files Modified:**
- `types.ts` — Add types
- `_validate-artifact.ts` — Add validation
- `render-html.ts` — Add CSS and render case
- `generate-pptx.ts` — Add render function
- `slides.ts` — Add documentation

---

### Phase 3: Enhanced Quote (0.5 days)

**Scope:**
- [ ] Add `quoteImage` and `quoteStyle` fields
- [ ] Add avatar support in HTML
- [ ] Add card style variant
- [ ] Update PPTX rendering
- [ ] Update AI prompt

**Files Modified:**
- `types.ts` — Add fields
- `render-html.ts` — Enhanced CSS and rendering
- `generate-pptx.ts` — Avatar support
- `slides.ts` — Update documentation

---

### Phase 4: Gallery Layout (1 day)

**Scope:**
- [ ] Add `gallery` layout and types
- [ ] Add validation rules
- [ ] Implement HTML grid rendering
- [ ] Implement PPTX grid rendering
- [ ] Update AI prompt

**Files Modified:**
- `types.ts` — Add types
- `_validate-artifact.ts` — Add validation
- `render-html.ts` — CSS and render case
- `generate-pptx.ts` — Grid rendering
- `slides.ts` — Documentation

---

### Phase 5: Icons Support (2 days)

**Scope:**
- [ ] Add `lucide-static` dependency
- [ ] Create icon resolver
- [ ] Integrate into artifact creation pipeline
- [ ] HTML inline SVG rendering
- [ ] PPTX: Convert icon SVG → PNG, embed as small image before text
- [ ] Document PPTX icon limitations
- [ ] Update AI prompt with icon guidelines

**PPTX Icon Strategy (Clarified):**
1. Convert Lucide SVG → PNG (24x24) using canvas
2. In PPTX, render icon as small image positioned at start of text box
3. Text is offset to accommodate icon width
4. Limitation: Icons cannot be truly inline — they prefix the text block
5. Document this in AI prompt so it can advise users appropriately

**Files Modified:**
- `package.json` — Add dependency
- New: `src/lib/slides/icons.ts`
- `create-artifact.ts` — Call icon resolver
- `update-artifact.ts` — Call icon resolver
- `render-html.ts` — Inline icon CSS
- `generate-pptx.ts` — Icon handling
- `slides.ts` — Icon documentation + limitations

---

### Phase 6: Comparison Layout (1 day)

> **Added per review feedback** — Very common in pitch decks

**Scope:**
- [ ] Add `comparison` layout type
- [ ] Add `ComparisonRow` interface
- [ ] Add validation rules
- [ ] Implement HTML table rendering
- [ ] Implement PPTX table rendering
- [ ] Update AI prompt

**Schema:**
```typescript
export interface ComparisonRow {
  feature: string
  values: (string | boolean)[]  // true = ✓, false = ✗, string = custom value
}

export interface SlideData {
  // ... existing fields
  comparisonHeaders?: string[]     // ["Feature", "Us", "Competitor A", "Competitor B"]
  comparisonRows?: ComparisonRow[]
}
```

**HTML Rendering:**
- Clean table with alternating row backgrounds
- Checkmarks (✓) in green, X marks (✗) in red
- First column (feature) left-aligned, others centered

**PPTX Rendering:**
- Use pptxgenjs table with styled cells
- Unicode checkmarks: ✓ (U+2713), ✗ (U+2717)

**Files Modified:**
- `types.ts` — Add types
- `_validate-artifact.ts` — Add validation
- `render-html.ts` — Table CSS and render case
- `generate-pptx.ts` — Table rendering
- `slides.ts` — Documentation

---

### Phase 7: Documentation & Test (0.5 days)

**Scope:**
- [ ] Document PPTX limitations in code comments
- [ ] Update AI prompt with all limitations
- [ ] Create comprehensive V2 test prompt
- [ ] Final verification of all features

**PPTX Limitations to Document:**
| Feature | HTML | PPTX | Notes |
|---------|------|------|-------|
| Gallery hover effect | Grayscale → color | Static full color | CSS transitions not supported |
| Icons | Inline SVG | Prefix image | True inline not possible |
| Quote avatar | Circular with CSS | Circular crop via shape | May need manual adjustment |
| Comparison checkmarks | Colored Unicode | Plain Unicode | Color applied via text formatting |

---

### Effort Summary (Updated)

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 0: Bug Fixes + Utils | 1-2 days | None |
| Phase 1: Visual Polish | 1 day | Phase 0 |
| Phase 2: Stats Layout | 1 day | Phase 0 |
| Phase 3: Enhanced Quote | 0.5 days | Phase 0 |
| Phase 4: Gallery Layout | 1 day | Phase 0 |
| Phase 5: Icons Support | 2 days | Phase 0 |
| Phase 6: Comparison Layout | 1 day | Phase 0 |
| Phase 7: Docs & Test | 0.5 days | All |
| **Total** | **8-9 days** | |

---

## Part 6: Additional Ideas

### Ideas Not in Original List

1. **Timeline Layout** — Horizontal timeline for roadmaps, history
   - Would complement existing diagram layouts
   - Could use simplified D3 or pure CSS
   - Good for product roadmaps, company history

2. **Comparison Layout** — Side-by-side comparison table
   - Better than two-column for feature comparisons
   - Checkmarks, X marks, values
   - Common in sales decks

3. **Video Embed** — YouTube/Vimeo placeholder
   - HTML: iframe embed
   - PPTX: Screenshot + play button + link
   - Useful for product demos

4. **Progress/Funnel** — Visual funnel or progress steps
   - Good for sales funnels, conversion metrics
   - Could be a special chart type

### Code Quality Improvements

1. **Add comprehensive test suite:**
   - Unit tests for chart-to-svg
   - Snapshot tests for HTML output
   - PPTX export validation (file size, structure)

2. **Type safety improvements:**
   - Stricter SlideData discriminated unions by layout
   - Generic chart data types

3. **Performance:**
   - Lazy-load Mermaid only when needed
   - Pre-render chart SVGs server-side (no Canvas needed in PPTX)

4. **Accessibility:**
   - Alt text for charts (auto-generated descriptions)
   - ARIA labels on interactive elements
   - Color contrast validation

---

## Verification Checklist

### Phase 0 Verification
- [ ] Hero slide background fills 100% on first slide
- [ ] Hero slide background fills 100% on subsequent slides
- [ ] All existing layouts render correctly in HTML
- [ ] All existing layouts export correctly to PPTX
- [ ] No TypeScript errors
- [ ] `utils.ts` functions work correctly

### V2.0 Complete Verification
- [ ] Stats layout renders with 2, 3, 4 items
- [ ] Stats trends display correctly (up/down arrows)
- [ ] Quote avatar displays correctly
- [ ] Quote card style has background + shadow
- [ ] Visual polish applied consistently
- [ ] All charts have consistent container styling
- [ ] PPTX export maintains visual parity

### V2.1 Complete Verification
- [ ] Icons resolve correctly (`{icon:rocket}` → SVG)
- [ ] Invalid icon names show `[?name]` fallback
- [ ] Gallery layout displays 4, 6, 9, 12 items correctly
- [ ] Gallery images have grayscale hover effect (HTML)
- [ ] PPTX gallery exports as image grid

---

## Summary

V2 builds on the solid V1 foundation with:

| Category | Items |
|----------|-------|
| **Bug Fixes** | Hero first-slide transform issue |
| **New Layouts** | Stats (P0), Gallery (P1) |
| **Enhancements** | Quote with avatar, Icons in text |
| **Polish** | Shadows, radii, typography consistency |
| **Code Quality** | Shared utils, DRY refactoring |

**Total Effort:** 6.5-7.5 days across 5 phases

**Deferred to V3:**
- Decorative elements (blobs, shapes)
- Custom fonts
- Speaker notes
- Interactive charts

The plan prioritizes high-impact, achievable features while cleaning up technical debt from V1.
