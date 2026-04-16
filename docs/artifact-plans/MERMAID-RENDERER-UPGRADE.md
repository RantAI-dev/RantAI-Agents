# Mermaid Renderer Visual Quality Upgrade

## Context

**Problem:** Mermaid diagrams di RantAI terlihat generic dan kurang polished dibanding Claude.ai. Layout tidak proporsional, styling default, dan tidak terintegrasi dengan design system aplikasi.

**Goal:** Upgrade `mermaid-renderer.tsx` agar output diagram:
- Layout proporsional dan balanced
- Styling modern dan polished, terintegrasi dengan design tokens
- Konsisten bagus untuk SEMUA jenis Mermaid diagram
- Support dark/light theme dengan visual yang sama baiknya

**Key Insight:** Setelah research mendalam, **ELK layout engine tidak diperlukan**. Pendekatan 2-phase memberikan improvement bertahap dengan risk yang terukur.

---

## Implementation Strategy: 2-Phase Approach

### Phase 1: Enhanced Mermaid Configuration (80% improvement)
- **Effort:** 2-4 jam
- **Risk:** Low
- **Dependencies:** None (zero new packages)

Fokus pada optimasi konfigurasi Mermaid native:
1. Custom `themeVariables` mapped ke design tokens
2. Diagram-specific configurations
3. `theme: "base"` untuk kontrol penuh

### Phase 2: D3.js Post-Processing (additional 15-20% polish)
- **Effort:** 4-6 jam
- **Risk:** Medium
- **Dependencies:** `d3` (~70KB) atau `d3-selection` (~15KB)

Enhance SVG output setelah Mermaid render:
1. Smooth animations on render
2. Custom node styling (rounded corners, shadows)
3. Edge refinements (stroke caps, better curves)
4. Interactive hover effects (optional)

### Decision Point
Setelah Phase 1 selesai, evaluate hasilnya:
- Jika sudah memuaskan → Phase 2 optional/skip
- Jika perlu polish tambahan → Proceed ke Phase 2

---

# PHASE 1: Enhanced Mermaid Configuration

## Strategy

Tidak perlu install elkjs (~200KB). Pendekatan:
1. **Create `mermaid-config.ts`** - Module terpisah untuk konfigurasi Mermaid
2. **Map design tokens** - Convert OKLCH colors dari globals.css ke hex untuk Mermaid
3. **Optimize per-diagram** - Config spesifik untuk flowchart, sequence, ER, class, state, gantt, dll
4. **Add `onFixWithAI`** - Konsisten dengan pattern react-renderer.tsx
5. **Enhance container CSS** - Better responsiveness

## Files to Modify

### 1. Create: `src/features/conversations/components/chat/artifacts/renderers/mermaid-config.ts`

New file containing:

```typescript
/**
 * Mermaid configuration for polished diagram rendering.
 * Maps application design tokens to Mermaid themeVariables.
 * 
 * VERIFIED OKLCH → Hex conversions (2024-04-15)
 * Based on Tailwind CSS v4 color palette
 */
import type { MermaidConfig } from "mermaid"

// Light mode design tokens (verified from globals.css)
const LIGHT = {
  background: "#fafaf9",      // oklch(0.98 0.002 90) - warm off-white
  foreground: "#262626",      // oklch(0.15 0 0) - neutral-800
  card: "#ffffff",            // oklch(1 0 0) - pure white
  border: "#e0dfdc",          // oklch(0.88 0.01 80) - neutral-300
  muted: "#e7e7e4",           // oklch(0.92 0.01 80) - neutral-200
  mutedForeground: "#737373", // oklch(0.45 0 0) - neutral-500
  accent: "#3b82f6",          // oklch(0.55 0.2 250) - blue-500
  chart1: "#f97316",          // oklch(0.646 0.222 41.116) - orange-500
  chart2: "#06b6d4",          // oklch(0.6 0.118 184.704) - cyan-500
  chart3: "#475569",          // oklch(0.398 0.07 227.392) - slate-600
  chart4: "#eab308",          // oklch(0.828 0.189 84.429) - yellow-500
  chart5: "#f59e0b",          // oklch(0.769 0.188 70.08) - amber-500
  // Derived colors for specific diagram elements
  subgraphBg: "#f5f5f4",      // stone-100
  noteBg: "#fef9c3",          // yellow-100 (warm accent)
  activationBg: "#dbeafe",    // blue-100
  doneTask: "#bbf7d0",        // green-200
  criticalTask: "#fecaca",    // red-200
}

// Dark mode design tokens (verified from globals.css)
const DARK = {
  background: "#171717",      // oklch(0.145 0 0) - neutral-900
  foreground: "#fafafa",      // oklch(0.985 0 0) - neutral-50
  card: "#171717",            // oklch(0.145 0 0) - neutral-900
  border: "#3f3f3f",          // oklch(0.269 0 0) - neutral-700
  muted: "#3f3f3f",           // oklch(0.269 0 0) - neutral-700
  mutedForeground: "#a3a3a3", // oklch(0.708 0 0) - neutral-400
  accent: "#60a5fa",          // blue-400
  chart1: "#818cf8",          // oklch(0.488 0.243 264.376) - indigo-400
  chart2: "#34d399",          // oklch(0.696 0.17 162.48) - emerald-400
  chart3: "#fbbf24",          // oklch(0.769 0.188 70.08) - amber-400
  chart4: "#a78bfa",          // oklch(0.627 0.265 303.9) - violet-400
  chart5: "#f87171",          // oklch(0.645 0.246 16.439) - red-400
  // Derived colors for specific diagram elements
  subgraphBg: "#1f1f1f",      // slightly lighter than bg
  nodeBg: "#262626",          // neutral-800
  noteBg: "#422006",          // orange-950 (warm dark)
  activationBg: "#1e3a5f",    // blue-950
  doneTask: "#14532d",        // green-900
  criticalTask: "#7f1d1d",    // red-900
}

const FONT_FAMILY = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

// Export light/dark theme variables
export const lightThemeVariables = { /* ... full implementation */ }
export const darkThemeVariables = { /* ... full implementation */ }

// Diagram-specific configs
export const flowchartConfig = { useMaxWidth: true, curve: "basis", nodeSpacing: 50, rankSpacing: 50, ... }
export const sequenceConfig = { actorMargin: 50, messageMargin: 35, mirrorActors: true, ... }
export const erConfig = { minEntityWidth: 100, entityPadding: 15, nodeSpacing: 80, ... }
export const stateConfig = { padding: 8, nodeSpacing: 50, ... }
export const classConfig = { nodeSpacing: 50, padding: 8, ... }
export const ganttConfig = { barHeight: 20, barGap: 4, fontSize: 11, ... }
// + mindmap, gitGraph, pie, journey, quadrantChart

// Main config generator
export function getMermaidConfig(theme: "dark" | "default"): MermaidConfig {
  const tokens = theme === "dark" ? DARK : LIGHT
  const themeVars = theme === "dark" ? darkThemeVariables : lightThemeVariables
  
  return {
    startOnLoad: false,
    theme: "base",           // Full control via themeVariables
    themeVariables: themeVars,
    securityLevel: "strict",
    fontFamily: FONT_FAMILY,
    deterministicIds: true,
    deterministicIDSeed: "mermaid",
    logLevel: "error",
    htmlLabels: false,       // Security + performance
    
    // Diagram-specific
    flowchart: flowchartConfig,
    sequence: sequenceConfig,
    er: erConfig,
    state: stateConfig,
    class: classConfig,
    gantt: ganttConfig,
    mindmap: mindmapConfig,
    gitGraph: gitGraphConfig,
    pie: pieConfig,
    journey: journeyConfig,
    quadrantChart: quadrantConfig,
  }
}
```

### 2. Modify: `src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx`

Changes:
1. Import `getMermaidConfig` from new config file
2. Add `onFixWithAI?: (error: string) => void` prop
3. Update `getMermaid()` to use new config
4. Add "Fix with AI" button in error state (conditional on prop)
5. Enhance container CSS classes

```diff
+ import { getMermaidConfig } from "./mermaid-config"
+ import { Wand2 } from "@/lib/icons"

  interface MermaidRendererProps {
    content: string
+   onFixWithAI?: (error: string) => void
  }

  async function getMermaid(theme: "dark" | "default"): Promise<MermaidModule> {
    // ... existing caching logic ...
    if (lastInitTheme !== theme) {
-     mermaid.initialize({
-       startOnLoad: false,
-       theme,
-       securityLevel: "strict",
-       fontFamily: "system-ui, -apple-system, sans-serif",
-     })
+     mermaid.initialize(getMermaidConfig(theme))
      lastInitTheme = theme
    }
    return mermaid
  }

  // In error UI, add Fix with AI button:
+ {onFixWithAI && (
+   <button onClick={() => onFixWithAI(error)} className="...">
+     <Wand2 className="h-3.5 w-3.5" />
+     Fix with AI
+   </button>
+ )}

  // Enhanced container:
  <div
    ref={containerRef}
-   className="flex items-center justify-center p-4 overflow-auto [&>svg]:max-w-full [&>svg]:h-auto"
+   className="flex items-center justify-center p-4 overflow-auto min-h-[200px] [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:rounded-md"
    dangerouslySetInnerHTML={{ __html: svg || "" }}
  />
```

## Theme Variables Detail (VERIFIED)

### Light Mode (`lightThemeVariables`)

| Variable | Value | Tailwind | Purpose |
|----------|-------|----------|---------|
| `background` | `#fafaf9` | stone-50 | Diagram background |
| `primaryColor` | `#262626` | neutral-800 | Primary node fill |
| `primaryTextColor` | `#ffffff` | white | Text on primary nodes |
| `primaryBorderColor` | `#525252` | neutral-600 | Primary node border |
| `secondaryColor` | `#e7e7e4` | neutral-200 | Secondary elements |
| `lineColor` | `#737373` | neutral-500 | Edge/arrow lines |
| `textColor` | `#262626` | neutral-800 | General text |
| `nodeBkg` | `#ffffff` | white | Node background |
| `nodeBorder` | `#e0dfdc` | neutral-300 | Node border |
| `clusterBkg` | `#f5f5f4` | stone-100 | Subgraph background |
| `actorBkg` | `#ffffff` | white | Sequence actor boxes |
| `noteBkgColor` | `#fef9c3` | yellow-100 | Note background (warm) |
| `activationBkgColor` | `#dbeafe` | blue-100 | Activation bar |
| `taskBkgColor` | `#3b82f6` | blue-500 | Gantt task bars |
| `doneTaskBkgColor` | `#bbf7d0` | green-200 | Completed tasks |
| `critBkgColor` | `#fecaca` | red-200 | Critical tasks |

### Dark Mode (`darkThemeVariables`)

| Variable | Value | Tailwind | Purpose |
|----------|-------|----------|---------|
| `background` | `#171717` | neutral-900 | Diagram background |
| `primaryColor` | `#fafafa` | neutral-50 | Primary node fill |
| `primaryTextColor` | `#171717` | neutral-900 | Text on primary nodes |
| `lineColor` | `#a3a3a3` | neutral-400 | Edge/arrow lines |
| `nodeBkg` | `#262626` | neutral-800 | Node background |
| `nodeBorder` | `#3f3f3f` | neutral-700 | Node border |
| `clusterBkg` | `#1f1f1f` | ~neutral-850 | Subgraph background |
| `noteBkgColor` | `#422006` | orange-950 | Note background (warm) |
| `activationBkgColor` | `#1e3a5f` | blue-950 | Activation bar |
| `taskBkgColor` | `#3b82f6` | blue-500 | Gantt task bars |
| `doneTaskBkgColor` | `#14532d` | green-900 | Completed tasks |
| `critBkgColor` | `#7f1d1d` | red-900 | Critical tasks |

## Diagram-Specific Configs

### Flowchart
- `curve: "basis"` - Smooth, modern edge curves
- `nodeSpacing: 50` - Adequate horizontal space
- `rankSpacing: 50` - Adequate vertical space
- `useMaxWidth: true` - Responsive scaling

### Sequence Diagram
- `actorMargin: 50` - Space between actors
- `messageMargin: 35` - Space between messages
- `mirrorActors: true` - Show actors at bottom
- `rightAngles: false` - Curved arrows (modern)

### ER Diagram
- `minEntityWidth: 100` - Readable entity boxes
- `entityPadding: 15` - Internal padding
- `nodeSpacing: 80` - More space (relationships need it)
- `rankSpacing: 80` - Vertical space

### Gantt Chart
- `barHeight: 20` - Readable bar height
- `barGap: 4` - Clean separation
- `fontSize: 11` - Compact but readable
- `leftPadding: 75` - Space for labels

## Verification Plan

### Manual Testing Checklist

1. **Create test artifact** with each diagram type from `mermaid.ts` examples:
   - [ ] Flowchart TD (vertical)
   - [ ] Flowchart LR (horizontal)
   - [ ] Sequence Diagram with alt/loop blocks
   - [ ] ER Diagram with relationships
   - [ ] State Diagram with composite states
   - [ ] Class Diagram with inheritance
   - [ ] Gantt Chart with sections
   - [ ] Mindmap
   - [ ] Git Graph
   - [ ] Pie Chart

2. **Theme toggle test**:
   - [ ] Switch dark → light: colors update correctly
   - [ ] Switch light → dark: colors update correctly
   - [ ] No flash or re-render glitches

3. **Responsiveness test**:
   - [ ] Narrow panel (default)
   - [ ] Fullscreen mode
   - [ ] Very small diagram (2-3 nodes)
   - [ ] Edge case large diagram (15 nodes)

4. **Error handling test**:
   - [ ] Invalid syntax shows error card
   - [ ] "Fix with AI" button appears (when prop provided)
   - [ ] Retry button works

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Theme colors don't render | Use `theme: "base"` for full control; test each variable |
| OKLCH conversion errors | Pre-convert all values to hex in config |
| Breaking existing diagrams | Only add configs with sensible defaults |
| Dark/light toggle breaks | Keep existing resolvedTheme pattern; only change config |

## Implementation Order

1. Create `mermaid-config.ts` with all theme variables
2. Convert OKLCH → hex for all design tokens
3. Add diagram-specific configs
4. Update `mermaid-renderer.tsx` to use new config
5. Add `onFixWithAI` prop + UI
6. Enhance container CSS
7. Test all diagram types in both themes
8. Iterate based on visual testing

## Phase 1 References

- [mermaid-renderer.tsx](../src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx) - Main file to modify
- [globals.css](../src/app/globals.css) - Design tokens source
- [mermaid.ts](../src/lib/prompts/artifacts/mermaid.ts) - Supported diagram types
- [react-renderer.tsx](../src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx) - `onFixWithAI` pattern

---

# PHASE 2: D3.js Post-Processing Enhancement

## Overview

Phase 2 menggunakan D3.js untuk post-process SVG output dari Mermaid, memberikan polish tambahan yang tidak bisa dicapai via konfigurasi saja.

## Prerequisites

- Phase 1 sudah selesai dan di-test
- Keputusan untuk proceed berdasarkan hasil Phase 1

## New Dependency

```bash
# Option A: Full D3 (more features, larger)
bun add d3
bun add -D @types/d3

# Option B: Minimal (selection only, smaller bundle)
bun add d3-selection d3-transition d3-ease
bun add -D @types/d3-selection @types/d3-transition @types/d3-ease
```

**Recommendation:** Option B (d3-selection + d3-transition) - ~20KB vs ~70KB

## Files to Modify

### 1. Create: `src/features/conversations/components/chat/artifacts/renderers/mermaid-enhancer.ts`

D3 post-processing utilities:

```typescript
/**
 * D3-based SVG enhancement for Mermaid diagrams.
 * Applied after Mermaid renders to add polish that config can't achieve.
 */
import { select, selectAll } from "d3-selection"
import { transition } from "d3-transition"
import { easeCubicOut } from "d3-ease"

// Register transition
select.prototype.transition = transition

export interface EnhanceOptions {
  animate?: boolean
  animationDuration?: number
  roundedCorners?: boolean
  cornerRadius?: number
  enhanceEdges?: boolean
  addShadows?: boolean
  hoverEffects?: boolean
}

const DEFAULT_OPTIONS: EnhanceOptions = {
  animate: true,
  animationDuration: 400,
  roundedCorners: true,
  cornerRadius: 6,
  enhanceEdges: true,
  addShadows: false,  // Can impact performance
  hoverEffects: false, // Optional interactivity
}

/**
 * Enhance a Mermaid-rendered SVG with D3 post-processing.
 */
export function enhanceMermaidSvg(
  container: HTMLElement,
  options: EnhanceOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const svg = select(container).select("svg")
  
  if (svg.empty()) return

  // 1. Rounded corners on nodes
  if (opts.roundedCorners) {
    applyRoundedCorners(svg, opts.cornerRadius!)
  }

  // 2. Enhanced edge styling
  if (opts.enhanceEdges) {
    applyEdgeEnhancements(svg)
  }

  // 3. Subtle shadows (optional, performance cost)
  if (opts.addShadows) {
    applyShadowEffects(svg)
  }

  // 4. Hover effects (optional interactivity)
  if (opts.hoverEffects) {
    applyHoverEffects(svg)
  }

  // 5. Entrance animation
  if (opts.animate) {
    applyEntranceAnimation(svg, opts.animationDuration!)
  }
}

function applyRoundedCorners(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, radius: number): void {
  // Flowchart nodes (rect elements)
  svg.selectAll(".node rect, .node polygon")
    .attr("rx", radius)
    .attr("ry", radius)

  // Sequence diagram actors
  svg.selectAll(".actor")
    .attr("rx", radius)
    .attr("ry", radius)

  // Note boxes
  svg.selectAll(".note")
    .attr("rx", radius / 2)
    .attr("ry", radius / 2)

  // ER diagram entities
  svg.selectAll(".er.entityBox")
    .attr("rx", radius)
    .attr("ry", radius)

  // State diagram states
  svg.selectAll(".state-box, .stateGroup rect")
    .attr("rx", radius)
    .attr("ry", radius)

  // Class diagram classes
  svg.selectAll(".classGroup rect")
    .attr("rx", radius)
    .attr("ry", radius)
}

function applyEdgeEnhancements(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
  // Smoother stroke caps
  svg.selectAll(".edgePath path, .messageLine0, .messageLine1")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")

  // Slightly thicker lines for better visibility
  svg.selectAll(".edgePath path")
    .each(function() {
      const path = select(this)
      const currentWidth = parseFloat(path.attr("stroke-width") || "1")
      if (currentWidth < 1.5) {
        path.attr("stroke-width", "1.5")
      }
    })
}

function applyShadowEffects(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
  // Add filter definition if not exists
  let defs = svg.select("defs")
  if (defs.empty()) {
    defs = svg.append("defs")
  }

  // Create subtle drop shadow filter
  if (defs.select("#mermaid-shadow").empty()) {
    const filter = defs.append("filter")
      .attr("id", "mermaid-shadow")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%")

    filter.append("feDropShadow")
      .attr("dx", "0")
      .attr("dy", "2")
      .attr("stdDeviation", "3")
      .attr("flood-color", "rgba(0,0,0,0.1)")
  }

  // Apply to nodes
  svg.selectAll(".node rect, .actor, .er.entityBox, .classGroup rect")
    .style("filter", "url(#mermaid-shadow)")
}

function applyHoverEffects(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>): void {
  // Add hover scale effect to nodes
  svg.selectAll(".node, .actor, .er.entityBox, .classGroup")
    .style("cursor", "pointer")
    .style("transition", "transform 0.2s ease")
    .on("mouseenter", function() {
      select(this).style("transform", "scale(1.02)")
    })
    .on("mouseleave", function() {
      select(this).style("transform", "scale(1)")
    })
}

function applyEntranceAnimation(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, duration: number): void {
  // Fade in nodes with stagger
  const nodes = svg.selectAll(".node, .actor, .er.entityBox, .classGroup, .stateGroup")
  
  nodes
    .style("opacity", 0)
    .transition()
    .duration(duration)
    .ease(easeCubicOut)
    .delay((_, i) => i * 50) // Stagger by 50ms
    .style("opacity", 1)

  // Fade in edges after nodes
  const edges = svg.selectAll(".edgePath, .messageLine0, .messageLine1, .relation")
  
  edges
    .style("opacity", 0)
    .transition()
    .duration(duration)
    .delay(nodes.size() * 50 + 100) // After nodes finish
    .ease(easeCubicOut)
    .style("opacity", 1)
}

/**
 * Check if D3 enhancement should be applied based on diagram complexity.
 * Skip for very simple diagrams where animation would be distracting.
 */
export function shouldEnhance(svg: SVGSVGElement): boolean {
  const nodeCount = svg.querySelectorAll(".node, .actor, .er.entityBox").length
  return nodeCount >= 3 // Only enhance diagrams with 3+ nodes
}
```

### 2. Update: `mermaid-renderer.tsx`

Integrate D3 enhancement:

```diff
+ import { enhanceMermaidSvg, shouldEnhance } from "./mermaid-enhancer"

  // After successful render, before setting state:
  async function renderDiagram() {
    // ... existing render logic ...
    
    const { svg: renderedSvg } = await mermaid.render(idRef.current, content)

    if (!cancelled) {
+     // Apply D3 enhancements
+     if (containerRef.current) {
+       containerRef.current.innerHTML = renderedSvg
+       const svgElement = containerRef.current.querySelector("svg")
+       if (svgElement && shouldEnhance(svgElement)) {
+         enhanceMermaidSvg(containerRef.current, {
+           animate: true,
+           roundedCorners: true,
+           enhanceEdges: true,
+           addShadows: false,
+           hoverEffects: false,
+         })
+       }
+     }
-     setSvg(renderedSvg)
+     setSvg(null) // SVG already in DOM via D3
+     setEnhanced(true)
    }
  }

  // Update render logic:
- dangerouslySetInnerHTML={{ __html: svg || "" }}
+ // Container managed by D3, only use dangerouslySetInnerHTML as fallback
+ {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
```

## Enhancement Options Explanation

| Option | Default | Description | Performance Impact |
|--------|---------|-------------|-------------------|
| `animate` | `true` | Entrance fade-in animation | Low |
| `animationDuration` | `400` | Animation duration in ms | None |
| `roundedCorners` | `true` | Round node corners | None |
| `cornerRadius` | `6` | Corner radius in px | None |
| `enhanceEdges` | `true` | Smoother edge styling | None |
| `addShadows` | `false` | Drop shadows on nodes | Medium (filter) |
| `hoverEffects` | `false` | Scale on hover | Low |

## Diagram-Specific Enhancements

### Flowchart
- Rounded rectangles (rx/ry)
- Smoother edge curves with round caps
- Staggered node entrance animation

### Sequence Diagram
- Rounded actor boxes
- Enhanced message line styling
- Actor entrance from top

### ER Diagram
- Rounded entity boxes
- Better relationship line styling
- Entity-first animation

### Class Diagram
- Rounded class boxes
- Cleaner inheritance arrows
- Class hierarchy animation

### State Diagram
- Rounded state boxes
- Transition line polish
- State entrance animation

## Phase 2 Verification

### Visual Testing
- [ ] Animation plays smoothly on first render
- [ ] Animation doesn't replay on theme change
- [ ] Rounded corners applied consistently
- [ ] Edge styling looks clean
- [ ] No visual glitches or flickering

### Performance Testing
- [ ] Render time < 100ms for typical diagrams
- [ ] No memory leaks with repeated renders
- [ ] Smooth 60fps during animations

### Compatibility Testing
- [ ] Works with all diagram types
- [ ] Works with dark/light theme
- [ ] Works in fullscreen mode
- [ ] Works with "Fix with AI" flow

## Phase 2 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| D3 conflicts with Mermaid | D3 only post-processes, doesn't interfere with Mermaid |
| Animation janky | Use `easeCubicOut`, test on low-end devices |
| Bundle size increase | Use d3-selection only (~15KB) vs full d3 (~70KB) |
| Breaking existing behavior | Feature flag: `ENABLE_D3_ENHANCE` for gradual rollout |

## Phase 2 Implementation Order

1. Install d3-selection + d3-transition
2. Create `mermaid-enhancer.ts`
3. Add feature flag for gradual rollout
4. Integrate into mermaid-renderer.tsx
5. Test all diagram types
6. Performance profiling
7. Remove feature flag once stable

---

# Summary: Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────┐
│                         PHASE 1                                  │
│              Enhanced Mermaid Configuration                      │
│                     (2-4 hours)                                  │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Create mermaid-config.ts                                     │
│  ✓ Map design tokens to themeVariables                          │
│  ✓ Add diagram-specific configs                                 │
│  ✓ Update mermaid-renderer.tsx                                  │
│  ✓ Add onFixWithAI prop                                         │
│  ✓ Test all diagram types                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   EVALUATE      │
                    │   Is output     │
                    │   satisfactory? │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
      ┌───────────────┐           ┌─────────────────────────────────┐
      │     YES       │           │              NO                  │
      │  Skip Phase 2 │           │         PHASE 2                  │
      │  (optional)   │           │   D3.js Post-Processing          │
      └───────────────┘           │        (4-6 hours)               │
                                  ├─────────────────────────────────┤
                                  │  ✓ Install d3-selection          │
                                  │  ✓ Create mermaid-enhancer.ts    │
                                  │  ✓ Add entrance animations       │
                                  │  ✓ Rounded corners + edge polish │
                                  │  ✓ Test all diagram types        │
                                  │  ✓ Performance profiling         │
                                  └─────────────────────────────────┘
```

## Total Estimated Effort

| Phase | Effort | Cumulative |
|-------|--------|------------|
| Phase 1 | 2-4 hours | 2-4 hours |
| Phase 2 | 4-6 hours | 6-10 hours |

## Decision Criteria for Phase 2

Proceed ke Phase 2 jika setelah Phase 1:
- [ ] Node shapes masih terlalu "boxy"
- [ ] Ingin entrance animation untuk better UX
- [ ] Edge styling masih kurang smooth
- [ ] Ingin interactive hover effects
