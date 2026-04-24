# `application/react` — Quality & UX Upgrade (Phase 1)

**Status:** Design — approved approach, ready for implementation plan
**Date:** 2026-04-24
**Author:** kleopasevan (via Claude)
**Target:** Break the "AI-slop dashboard" failure mode in React artifacts without adding server-side bundlers or new runtime dependencies. Replace the single-aesthetic lock-in (Inter + slate-900 + indigo-600) with a disciplined 7-direction menu, give the LLM typographic freedom via Google Fonts, and enforce commitment via directive-based validation.

---

## 1. Context

The current `application/react` artifact produces visually competent but **homogeneous** output. Every generated component converges on the same aesthetic: Inter typeface, slate-50 background, slate-900 text, indigo-600 accent, rounded-2xl cards with subtle shadows. This is the "SaaS dashboard" default. It looks fine. It also looks like everything else the LLM generates, everywhere, always.

**Evidence in source:**
- [`src/lib/prompts/artifacts/react.ts`](../../src/lib/prompts/artifacts/react.ts) hard-codes the design system: "Tailwind scale only. Cards `rounded-2xl`..., Buttons `h-11 rounded-lg bg-indigo-600`..., Inter font".
- [`src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx:232`](../../src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx#L232) hard-loads Inter as the only available webfont in the iframe template.
- The single example in [`react.ts:86-165`](../../src/lib/prompts/artifacts/react.ts#L86) is a "revenue overview" dashboard — the exact slate+indigo vocabulary — which anchors the LLM to replicate that aesthetic.

**What users get today:** Dashboards. Forms. Cards in grids. All recognizably the same product.

**What users should be able to ask for:**
- An editorial landing page with Fraunces display type and a terracotta accent
- A brutalist dev tool with Space Grotesk + acid yellow + sharp corners
- A luxury hospitality site with DM Serif + gold on near-black
- A playful onboarding flow with Fredoka + pastels + bouncy motion
- An industrial monitoring dashboard with Archivo + functional color coding (the current default, explicitly chosen not accidentally reverted-to)
- An organic wellness brand page with Public Sans + moss/terracotta
- A retro-futuristic event teaser with VT323 + neon on black

The LLM *can* produce all of these — it knows the typography, it knows the palettes, it knows Tailwind. The current prompt and runtime actively prevent it.

**Parallel precedents in this codebase:**
- [`2026-04-23-spreadsheet-xlsx-upgrade-design.md`](./2026-04-23-spreadsheet-xlsx-upgrade-design.md) — shape dispatch within a single type, zero new runtime dependencies, declarative spec authored by LLM
- [`2026-04-23-text-document-design.md`](./2026-04-23-text-document-design.md) — LLM given creative control via declarative spec, no sandbox bundler

This design follows the same philosophy: **in-place evolution, zero new runtime dependencies, upgrade via prompt + renderer + validator, no server-side bundler.**

## 2. Goals & Non-Goals

### Goals (Phase 1)

1. Break the "default slate+indigo+Inter" failure mode. Every React artifact commits to an aesthetic direction before writing code.
2. Give the LLM access to ~15 curated Google Fonts (across the 7 directions) without adding a build step.
3. Enforce aesthetic commitment via hard-error on missing `@aesthetic` directive. Soft-warn on palette-direction mismatch.
4. Zero visual regression on artifacts that still opt into "industrial" direction (the current default).
5. Zero new runtime dependencies: no esbuild, no Parcel, no server-side recalc, no npm package additions.
6. Preserve the existing iframe sandbox, Fix-with-AI error UX, and Babel-standalone transpilation path.

### Non-Goals (Phase 1 — deferred to Phase 2)

- **`RantaiUI` global bundle** (Radix primitives + shadcn-style wrappers via UMD). Designed separately after Phase 1 stabilizes. Phase 1 stays with raw Tailwind.
- **Multi-file authoring.** Single-component remains the contract. Multi-file would require a bundler.
- **TypeScript strict checking.** Babel standalone strips types; full typecheck needs a separate pipeline.
- **Arbitrary npm packages.** Globals (`React`, `Recharts`, `LucideReact`, `Motion`) stay as-is. No new globals in Phase 1.
- **User-facing aesthetic override parameter** in `create_artifact` tool. LLM picks direction from context; user can still say "make it brutalist" in prompt and LLM complies. Direct tool parameter is over-engineered for v1.

## 3. Approach — Chosen + Why Not Alternatives

**Chosen: Option A (refined), phased.** Keep the single-file iframe pipeline. Rewrite the prompt rules to expose the 7-direction menu. Teach the renderer to dynamically load Google Fonts based on a line-comment directive. Update the validator to hard-enforce direction commitment.

**Why not Option B (server-side bundler ala `SKILL-web-artifact-builder`):**
`SKILL-web-artifact-builder` is a *local developer tool* that turns a Vite project into an inlined `bundle.html`. It is NOT how Claude.ai renders React artifacts at runtime — Claude.ai's React artifact is still a single-file sandboxed iframe, same as ours. Adopting a server-side bundler would add: esbuild/Parcel to the server runtime, dependency resolution, build cache, bundle failure surfaces, and a ~50–100 MB image delta. It would unlock "multi-file" and "arbitrary npm packages" — two capabilities that are **unnecessary for chat-artifact scale** (one component, viewed in a panel). B solves problems we don't have.

**Why not Option C (hybrid shape dispatch — raw TSX vs. multi-file JSON spec):**
Shape dispatch works in sheet (CSV vs. JSON array vs. `spreadsheet/v1`) because those three shapes correspond to three **distinct user intents** (flat table, JSON-native structured data, financial model). React artifacts have one user intent (build a UI). If we gave the LLM a choice between "raw TSX" and "multi-file spec", the LLM would drift to the simpler shape — the exact drift warning quoted in [`2026-04-23-spreadsheet-xlsx-upgrade-design.md`](./2026-04-23-spreadsheet-xlsx-upgrade-design.md) §3. Build capability that doesn't get used = wasted investment.

**Phasing:**
- **Phase 1 (this design, ~3–5 days):** prompt rewrite + directive parser + font injection + validator update. ~70% of the total quality gain, zero new globals.
- **Phase 2 (future design, ~2 weeks):** `RantaiUI` UMD bundle preloaded into iframe template. Unlocks Radix primitives as `RantaiUI.Dialog`, `RantaiUI.Command`, etc. ~30% remaining quality gain (component vocabulary). Scoped separately.

## 4. Phase 1 Scope

Phase 1 ships when all of the following are true:
1. `// @aesthetic: <name>` directive is parsed by the renderer and enforced by the validator.
2. `// @fonts: Family:weights, Family:weights` directive is parsed by the renderer and injected as Google Fonts `<link>` tags.
3. The prompt in `react.ts` exposes all 7 aesthetic directions with fonts, palettes, spacing, component conventions, and motion per direction.
4. Four full example artifacts in `react.ts` cover four different directions (not just industrial).
5. Validator hard-errors on missing `@aesthetic`. Soft-warns on palette-direction mismatch using a simple heuristic.
6. Seven fixture artifacts (one per direction) exist under `tests/fixtures/react-artifacts/` and pass validator + renderer smoke tests.
7. `artifacts-capabilities.md` section 2 (React) updated to reflect the menu.
8. No existing artifact regresses when rendered (verified by re-rendering all existing React artifacts captured in test fixtures, if any — otherwise spot-check 5 recent production artifacts from the database).

## 5. Aesthetic Direction Menu — 7 Directions

Each direction is a **commitment**, not a suggestion. The LLM picks ONE at the top of every React artifact and does not mix directions within a single component.

### 5.1 `editorial`

**When to pick:** Articles, brand pages, storytelling, long-form reading, "landing page for a magazine", "essay layout", "about page". Content-first, reading-oriented surfaces.

**Fonts (display + body):** `Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900` for display; `Inter:wght@400;500;700` or `Newsreader:opsz,wght@6..72,300..700` for body.

**Palette signature:** bone (`#faf5ef`, `#f5f0e6`) + ink (`#0a0a0a`, `#1c1917`) + warm neutrals (`#78716c`, `#a8a29e`) + ONE bold accent from {terracotta `#c2410c`, bottle green `#065f46`, deep burgundy `#7f1d1d`, ultramarine `#1e3a8a`}.

**Spacing & rhythm:** Generous whitespace. `py-24 md:py-32` section padding. Asymmetric grid (12-col with 7+5 or 8+4 splits). Pull quotes, drop caps via `first-letter:` utilities.

**Components:**
- Buttons: `px-6 py-3 border border-ink text-ink hover:bg-ink hover:text-bone transition` — flat, bordered, no shadow
- Links: underline-offset utility, hover underline
- Cards: often just content blocks with top/bottom borders, no boxes

**Motion:** Slow reveals on scroll. Refined easing `[0.22, 1, 0.36, 1]`. Stagger delays 80–120ms.

### 5.2 `brutalist`

**When to pick:** Indie tools, manifestos, developer products, "punky", "raw", "no BS", anti-corporate, hacker aesthetic.

**Fonts:** `Space Grotesk:wght@400;500;700` or `Archivo Black:wght@400` for display; `JetBrains Mono:wght@400;700` or `IBM Plex Mono:wght@400;500;700` for body/ui.

**Palette signature:** pure white (`#ffffff`) + pure black (`#000000`) + ONE acid accent from {acid yellow `#facc15`, alert red `#dc2626`, electric blue `#2563eb`, lime `#84cc16`}. Never gradients. Never gray except `#e5e5e5` for rules.

**Spacing & rhythm:** Dense. Visible grid (dashed borders on sections). Sharp corners everywhere — `rounded-none`. Offset layouts (negative margins, intentionally broken alignment).

**Components:**
- Buttons: `px-4 py-2 bg-black text-white border-2 border-black hover:bg-acid hover:text-black transition-none` — instant, no easing
- Cards: `border-2 border-black`, no shadow, no rounded
- Inputs: `border-b-2 border-black bg-transparent rounded-none` (or fully bordered with sharp corners)

**Motion:** Snap transitions, `duration-75` to `duration-150`, `ease-linear` or no ease. No fade-ins.

### 5.3 `luxury`

**When to pick:** Premium brands, hospitality, fashion, watches, wealth, "high-end", "refined", "timeless", "exclusive".

**Fonts:** `DM Serif Display:wght@400` or `Cormorant Garamond:wght@300;500;700` for display; `DM Sans:wght@300;400;500;700` or `Work Sans:wght@300;400;500` for body.

**Palette signature:** near-black (`#0c0a09`, `#1c1917`) + cream (`#faf5ef`, `#fefdfb`) + gold (`#d4af37`, `#b8860b`, or warmer `#e6c068`) + warm gray (`#78716c`). No indigo. No purple. No bright anything.

**Spacing & rhythm:** Very generous. Tight leading on display (`leading-[0.95]`). Letter-spacing tracked out (`tracking-wide`, `tracking-widest`) on small caps labels.

**Components:**
- Buttons: `px-8 py-4 bg-ink text-gold border border-gold hover:bg-gold hover:text-ink transition-all duration-500` — slow, deliberate
- Cards: thin gold hairline borders, no shadow, minimal fills
- Images: large, centered, with tight negative space

**Motion:** Very refined. `duration-500` to `duration-700`. `ease-out` with custom cubic-bezier `[0.33, 1, 0.68, 1]`. Staggered parallax on hero.

### 5.4 `playful`

**When to pick:** Onboarding, kids, creative tools, "fun", "friendly", "approachable", "consumer app", gamification.

**Fonts:** `Fredoka:wght@400;500;600;700` or `Quicksand:wght@400;500;700` for display and body (same family, different weights is OK here — friendliness over typographic rigor).

**Palette signature:** pastel backgrounds from {`#fce7f3` pink, `#e0e7ff` indigo, `#dcfce7` green, `#fef3c7` yellow, `#fae8ff` purple} + ONE vivid anchor from {`#f97316` orange, `#a855f7` purple, `#06b6d4` cyan, `#ec4899` pink}. Multiple pastels in one layout is OK (different sections).

**Spacing & rhythm:** Rounded everything — `rounded-2xl`, `rounded-3xl`, `rounded-full`. Generous padding. Slightly oversized type (`text-5xl md:text-6xl` for hero).

**Components:**
- Buttons: `px-6 py-3 bg-vivid text-white rounded-full shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:shadow-[0_2px_0_rgba(0,0,0,0.1)] hover:translate-y-0.5 transition` — soft drop shadow, toy-like
- Cards: `rounded-3xl bg-pastel shadow-none border-none`
- Illustrations/icons: scaled up, generous margins around them

**Motion:** Bouncy springs via Motion library — `Motion.motion.div` with `transition={{ type: "spring", stiffness: 200, damping: 15 }}`. Overshoot, wobble, stagger.

### 5.5 `industrial`

**When to pick:** Dashboards, admin tools, monitoring, analytics, "data-heavy", status boards, operations. Functional over expressive. **This is the current default aesthetic — only pick it when data density is the actual content.**

**Fonts:** `Archivo:wght@400;500;600;700` or `Inter Tight:wght@400;500;700` for display/body; `Space Mono:wght@400;700` or `JetBrains Mono:wght@400;500` for tabular data / timestamps / IDs.

**Palette signature:** slate-950 (`#020617`) or slate-900 (`#0f172a`) for text / dark surfaces + slate-50/100 for light surfaces + ONE functional accent (`#3b82f6` blue for primary) + status colors (`#10b981` emerald for healthy/up, `#f43f5e` rose for alert/down, `#f59e0b` amber for warning). Multi-color is OK because it's functional.

**Spacing & rhythm:** Dense. Grid-heavy. Tabular alignment. `gap-px` grids with dividers. Sparklines inline. Numbers right-aligned with tabular-nums.

**Components:**
- Buttons: `h-9 px-3 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500`
- Cards: `rounded-lg border border-slate-200 bg-white shadow-sm`
- Data tables with sticky headers, zebra stripes, row hover

**Motion:** Minimal or none. Updates should feel instant. Loading states are skeletons, not spinners. `duration-150 ease-out` max.

### 5.6 `organic`

**When to pick:** Wellness, sustainability, food, crafts, skincare, "natural", "handmade", farm/artisan brands.

**Fonts:** `Fraunces:ital,opsz,wght@0,9..144,300..700` or `Public Sans:wght@400;500;700` for display; `Public Sans:wght@400;500` or `Crimson Pro:wght@400;500;600` for body. Mixing humanist sans with a soft serif works.

**Palette signature:** bone (`#faf5ef`) + moss (`#3f6212`, `#65a30d`) + terracotta (`#c2410c`, `#ea580c`) + sand/taupe (`#a8a29e`, `#d6d3d1`). Warm, earthy. No cool blues. No gray.

**Spacing & rhythm:** Medium-generous. Soft curves — `rounded-xl`, `rounded-2xl` but never `rounded-3xl`. Asymmetric but gentle. Handwritten or letterpress-style accents (italic Fraunces pulls this off).

**Components:**
- Buttons: `px-6 py-3 rounded-full bg-moss text-bone hover:bg-moss-dark transition-all duration-300`
- Cards: `rounded-2xl bg-bone border border-taupe/20 shadow-[0_1px_2px_rgba(120,113,108,0.05)]` — very soft shadow
- Images: rounded corners, often with tilted frames or textured borders

**Motion:** Soft. `duration-300` to `duration-500`. `ease-in-out`. Nothing snappy.

### 5.7 `retro-futuristic`

**When to pick:** Gaming, sci-fi, events, "synthwave", "cyberpunk", "80s", "vaporwave", music/DJ, arcade. Only when explicitly signaled.

**Fonts:** `VT323:wght@400` or `Major Mono Display:wght@400` or `Orbitron:wght@400;700;900` for display; `Space Mono:wght@400;700` or `Share Tech Mono:wght@400` for body.

**Palette signature:** black (`#030712`) or deep purple (`#1e0a2e`) background + neon accents from {cyan `#22d3ee`, magenta `#e879f9`, lime `#84cc16`, hot pink `#f472b6`, electric yellow `#fde047`}. Optional gradient between two neons.

**Spacing & rhythm:** Monospace tabular layouts. Visible grid lines. Scanline textures via CSS (`background: repeating-linear-gradient(...)`) on hero elements. Chromatic aberration on hover (offset text-shadow in two accent colors).

**Components:**
- Buttons: `px-6 py-2 bg-transparent border border-neon text-neon hover:shadow-[0_0_20px_currentColor] transition`
- Cards: `border border-neon bg-black/50 backdrop-blur-sm`
- Text effects: neon glow via `text-shadow: 0 0 10px currentColor, 0 0 20px currentColor`

**Motion:** Glitch effects, scanline scrolls, chromatic splits on hover. `duration-75` snap + subtle flicker loops via `@keyframes`.

### 5.8 Selection Heuristic

The LLM picks a direction by matching these signals:

| Signal in user prompt | Direction |
|---|---|
| "article", "blog", "story", "editorial", "brand", "about us", "long-form" | editorial |
| "indie", "punky", "raw", "minimal dev", "tool for hackers", "manifesto", "no-BS" | brutalist |
| "premium", "luxury", "high-end", "exclusive", "refined", "timeless", hotel/watch/fashion brand | luxury |
| "kids", "onboarding", "fun", "friendly", "consumer", "creative tool", gamified | playful |
| "dashboard", "admin", "monitoring", "analytics", "metrics", "status", "ops", "data-heavy" | industrial |
| "wellness", "sustainability", "organic", "natural", "food", "skincare", "artisan" | organic |
| "gaming", "arcade", "sci-fi", "synthwave", "cyberpunk", "80s", music/DJ/events | retro-futuristic |

**Ambiguous cases (no clear signal):** pick `editorial` as the default. This is an *opinionated* default — not because editorial fits everything, but because it is the closest to "thoughtful general-purpose" while being explicitly NOT the old slate+indigo.

**Override:** If the user says "make it brutalist" or "use luxury styling", the LLM honors that verbatim, regardless of content signal.

## 6. Directive Syntax

### 6.1 `@aesthetic` directive

**Location:** Line 1 of the artifact content (after any optional leading whitespace). ONE direction name, exact match from the 7-direction list (case-sensitive, kebab-case).

**Syntax:**
```tsx
// @aesthetic: editorial
```

Valid values: `editorial`, `brutalist`, `luxury`, `playful`, `industrial`, `organic`, `retro-futuristic`.

**Parsing:** Renderer extracts via regex `^\/\/\s*@aesthetic:\s*([a-z-]+)\s*$`. Value is used for (a) default font loading if `@fonts` directive is absent, (b) debug logging, (c) future Phase 2 `RantaiUI` theme routing.

**Missing directive:** validator hard-errors at authoring time. Never reaches renderer.

### 6.2 `@fonts` directive

**Location:** Line 2 of the artifact content (immediately after `@aesthetic`). Optional.

**Syntax:**
```tsx
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
```

Comma-separated list of Google Fonts family specs. Each spec is `<Family Name>:<axis-and-weight-syntax>`. Max 3 families per artifact.

**Parsing:** Renderer extracts via regex `^\/\/\s*@fonts:\s*(.+)\s*$`. Each family spec is validated against a regex `^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|ital,wght@[\d;,.]+|opsz,wght@[\d;.]+|ital,opsz,wght@[\d;,.]+)$`.

**Missing directive:** Renderer loads a default font bundle based on the declared `@aesthetic` direction (e.g., `editorial` → loads Fraunces + Inter; `industrial` → loads Inter + Space Mono). Default mapping lives in `react-renderer.tsx` as a constant.

### 6.3 Parser contract

Parser runs in `preprocessCode()` in `react-renderer.tsx` BEFORE the existing import-to-globals transformation. It:

1. Extracts `@aesthetic` (required at line 1) and `@fonts` (optional at line 2) directives.
2. Strips them from the code that gets passed to Babel.
3. Returns them alongside the existing `processedCode`, `componentName`, `unsupportedImports` fields.
4. `buildSrcdoc()` consumes the extracted directive values to generate Google Fonts `<link>` tags for injection into the iframe's `<head>`, replacing the current hard-coded Inter `<link>`.

**Whitelist:** Only `fonts.googleapis.com` and `fonts.gstatic.com` hosts allowed. If a directive value contains anything that would construct a URL outside these hosts, the directive is discarded and fallback is loaded.

**Injection order:**
```html
<!-- Generated by directive parser -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={encoded-spec-1}&family={encoded-spec-2}&display=swap" rel="stylesheet">
```

## 7. Validator Behavior

Implemented in `validateReact()` in `src/lib/tools/builtin/_validate-artifact.ts`.

### 7.1 Hard errors (existing + new)

**Existing (unchanged):**
- Missing `export default`
- Class components (`class extends React.Component`)
- `document.getElementById` / `document.querySelector`
- CSS imports (`import './foo.css'`)
- Imports from non-whitelisted libraries
- Files > 512 KB (enforced upstream in `create-artifact.ts`)

**New:**
- Missing `@aesthetic` directive on line 1. Error message:
  > `Missing "// @aesthetic: <direction>" directive on line 1. Pick one of: editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic. See prompt rules for direction selection heuristic.`
- `@aesthetic` value not in the valid set of 7. Error message:
  > `Unknown aesthetic direction "<value>". Valid: editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic.`
- `@fonts` directive present but malformed (fails family regex). Error message:
  > `Malformed @fonts directive. Expected comma-separated Google Fonts specs like "Fraunces:wght@300..900, Inter:wght@400;500;700". Got: <value>.`

### 7.2 Soft warnings (new)

Soft warnings surface as metadata on the artifact document (`validationWarnings` array already flowing through `create-artifact.ts`). They do not block creation. They are surfaced in the UI as a dismissible notice.

**Cases:**
- **Palette-direction mismatch heuristic.** If `@aesthetic` is not `industrial` but the content has `> 5 distinct references to slate-* or indigo-* Tailwind classes`, warn:
  > `You declared @aesthetic: <direction> but the palette reads industrial (slate/indigo dominant). Consider reviewing the color palette for the <direction> direction.`
- **Font-direction mismatch heuristic.** If `@aesthetic: editorial` or `@aesthetic: luxury` but `@fonts` directive (or default-inferred fonts) contains no serif family (check against a hardcoded list of known serifs: Fraunces, Playfair, DM Serif, Cormorant, Newsreader, Crimson Pro, Lora), warn:
  > `@aesthetic: <direction> typically pairs with a serif display face. No serif detected in @fonts directive.`
- **Motion library used but `@aesthetic: industrial`.** If `Motion.motion` or `Motion.AnimatePresence` is used under industrial direction, warn:
  > `Industrial direction favors minimal or no motion. Consider plain CSS transitions instead of framer-motion.`

### 7.3 Heuristic implementation notes

- Slate/indigo detector: count matches of `/\b(slate|indigo)-(\d{2,3})\b/g` in content. Threshold `> 5` minimizes false positives.
- Serif detector: simple `.includes()` check against the 7-entry serif allowlist above.
- These are DELIBERATELY simple heuristics. Precision over recall. Better to miss a mismatch than cry wolf.

## 8. Renderer Changes

File: `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx`.

### 8.1 Font injection

**Remove** the hard-coded Inter `<link>` at line 233:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

**Replace** with dynamic injection driven by parsed directives. New helper:

```ts
function buildFontLinks(aesthetic: AestheticDirection, fontsDirective: string | null): string {
  const specs = fontsDirective
    ? parseFontsDirective(fontsDirective)
    : DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  if (specs.length === 0) return ""
  const familyParams = specs.map(s => `family=${encodeURIComponent(s)}`).join("&")
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="https://fonts.googleapis.com/css2?${familyParams}&display=swap" rel="stylesheet">`,
  ].join("\n")
}

const DEFAULT_FONTS_BY_DIRECTION: Record<AestheticDirection, string[]> = {
  "editorial":         ["Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900", "Inter:wght@400;500;700"],
  "brutalist":         ["Space Grotesk:wght@400;500;700", "JetBrains Mono:wght@400;700"],
  "luxury":            ["DM Serif Display:wght@400", "DM Sans:wght@300;400;500;700"],
  "playful":           ["Fredoka:wght@400;500;600;700"],
  "industrial":        ["Inter Tight:wght@400;500;700", "Space Mono:wght@400;700"],
  "organic":           ["Fraunces:ital,opsz,wght@0,9..144,300..700", "Public Sans:wght@400;500"],
  "retro-futuristic":  ["VT323:wght@400", "Space Mono:wght@400;700"],
}
```

### 8.2 Fallback behavior

- If directive parsing fails (malformed, whitelist violation), renderer logs warning and falls back to the direction-default fonts.
- If `@aesthetic` directive is somehow missing at render time (should never happen — validator catches it — but defensive), renderer uses `industrial` defaults and posts a `type: 'error'` message to parent, so Fix-with-AI can offer a repair.

### 8.3 Sandbox/safety

- Font `<link>` URLs are constructed server-side (well, in the renderer JS) from validator-approved inputs. No user-controlled string is passed as-is to `href`.
- Whitelist enforcement: if the constructed URL does not start with `https://fonts.googleapis.com/css2?`, it is discarded.
- No new sandbox flag changes. `allow-scripts` only, same as today.

## 9. Prompt Rewrite — `react.ts`

### 9.1 Section order (new)

```
1. Runtime Environment (unchanged — globals, sandbox, etc.)
2. Required Component Shape (unchanged)
3. Aesthetic Direction — Pick ONE and Commit (NEW, replaces "Design System")
   - The 7-direction table
   - Selection heuristic table
   - Default fallback = editorial
4. Directive Syntax (NEW)
   - @aesthetic (line 1, required)
   - @fonts (line 2, optional, defaults by direction)
5. Design System per Direction (NEW, replaces generic "Design System")
   - 7 compact paragraphs, one per direction
   - Each covers: display + body type, palette hex values, spacing rhythm, button/card/input conventions, motion character
6. State Patterns (unchanged — forms, mock fetching, tabs)
7. Accessibility (unchanged)
8. Code Quality — STRICT (unchanged)
9. Anti-Patterns (UPDATED)
   - Remove "No purple unless asked" (obsolete under direction menu)
   - Remove hard Inter requirement
   - Add "Never mix directions in one artifact"
   - Add "Never silently default to slate-900+indigo without @aesthetic: industrial"
```

### 9.2 Examples (4 full artifacts)

Replace the single `revenue dashboard` example with FOUR complete artifacts, each declaring different directives:

1. **`editorial` — a brand landing page** for a fictional small coffee roaster. Fraunces display, bone+ink+terracotta, pull quote, asymmetric hero.
2. **`brutalist` — a dev tool homepage** for a fictional CLI. Space Grotesk, black/white/acid-yellow, dashed grid, sharp corners.
3. **`industrial` — the existing revenue dashboard**, re-themed with `@aesthetic: industrial` declared. Same slate+indigo palette, same Recharts chart — proves regression safety for the most common use case.
4. **`playful` — an onboarding welcome** for a fictional kids' creative app. Fredoka, pastel pink + vivid orange, bouncy Motion springs, rounded-full buttons.

Luxury, organic, and retro-futuristic are described in the direction table (§3 of prompt) but not fully exampled in prompt examples — this keeps the prompt under a reasonable size. The 7 fixture artifacts in `tests/fixtures/` cover all directions for regression purposes.

**Prompt length budget:** target ~250 lines total rules (vs. current ~78), ~350 lines total examples (vs. current ~80). Total ~600 lines — in range of `slides.ts` (591 lines) and below `document.ts` once examples are added. Acceptable.

## 10. Files to Change

| Path | Change | Estimated LoC delta |
|---|---|---|
| `src/lib/prompts/artifacts/react.ts` | Full rules rewrite + 4 new examples | +520 / -140 |
| `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx` | Directive parser, font injection, direction constant, fallback logic | +120 / -4 |
| `src/lib/tools/builtin/_validate-artifact.ts` (`validateReact`) | Directive validation, aesthetic whitelist check, palette-mismatch heuristic, font-mismatch heuristic | +80 / -0 |
| `docs/artifact-plans/artifacts-capabilities.md` | Update section "2. React Artifact" with aesthetic menu, directive syntax, font freedom | +60 / -20 |
| `tests/unit/validate-artifact.test.ts` (extend) | Add suite `validateReact — aesthetic directive` + palette/font/motion soft-warn heuristics | +150 / 0 |
| `tests/unit/react-artifact/directive-parser.test.ts` (new, mirrors `tests/unit/spreadsheet/` pattern) | Unit tests for directive extraction, whitelist, fallback font injection | +80 / 0 |
| `tests/fixtures/react-artifacts/aesthetic-editorial.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-brutalist.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-luxury.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-playful.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-industrial.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-organic.tsx` (new) | Full fixture | +80 |
| `tests/fixtures/react-artifacts/aesthetic-retro-futuristic.tsx` (new) | Full fixture | +80 |

**Total:** ~1,500 LoC additions, ~165 deletions. Entirely contained to `src/lib/prompts/artifacts/`, `src/features/conversations/components/chat/artifacts/renderers/`, `src/lib/tools/builtin/`, `tests/`, and `docs/`.

**Not touched:**
- `src/lib/tools/builtin/create-artifact.ts` / `update-artifact.ts` — no pipeline changes
- `src/lib/unsplash/*` — React artifacts still don't use Unsplash resolver
- Any database schema — zero migrations
- `package.json` — zero new dependencies

## 11. Test Strategy

### 11.1 Fixture artifacts

Seven files under `tests/fixtures/react-artifacts/aesthetic-<direction>.tsx`. Each:
- Declares correct `// @aesthetic:` directive
- Declares `// @fonts:` directive (one with, one without — split 4/3 to test both paths)
- Uses direction-appropriate palette and fonts
- Renders a non-trivial but compact component (~80 LoC)
- Exercises Motion library where the direction warrants it

These serve as (a) LLM reference fixtures for the prompt (not bundled into `react.ts` examples but linked from docs), (b) validator regression tests (every fixture must pass `validateReact` with zero errors), (c) renderer smoke tests (every fixture must produce a srcdoc without parser errors).

### 11.2 Validator unit tests

Extend `tests/unit/validate-artifact.test.ts` (existing file):

```
describe("validateReact — aesthetic directive", () => {
  it("hard-errors when @aesthetic directive missing")
  it("hard-errors when @aesthetic value unknown")
  it("accepts all 7 valid direction names")
  it("accepts @aesthetic with leading whitespace")
  it("rejects @aesthetic not on line 1")
})

describe("validateReact — fonts directive", () => {
  it("accepts well-formed @fonts directive")
  it("hard-errors on malformed family spec")
  it("enforces max 3 families")
  it("is optional when direction default exists")
})

describe("validateReact — palette-direction mismatch warn", () => {
  it("warns when editorial + heavy slate/indigo usage")
  it("does not warn when industrial + slate usage")
  it("does not warn on sparse slate usage (< 5 matches)")
})
```

### 11.3 Directive parser tests

New file `tests/unit/react-artifact/directive-parser.test.ts`:

```
describe("parseDirectives", () => {
  it("extracts @aesthetic from line 1")
  it("extracts @fonts from line 2")
  it("strips directives from processedCode")
  it("returns aesthetic=null if missing (validator catches this elsewhere)")
  it("returns fontsDirective=null if missing")
})

describe("buildFontLinks", () => {
  it("uses direction defaults when fontsDirective is null")
  it("uses parsed specs when fontsDirective provided")
  it("falls back to direction defaults on malformed directive")
  it("rejects family specs that would construct non-Google-Fonts URLs")
  it("emits preconnect + stylesheet links")
})
```

### 11.4 Manual regression spot-check

Before merging: re-render 5 recent production React artifacts by fetching their content from `prisma.document` where `artifactType = 'application/react'`, adding `// @aesthetic: industrial` as line 1 to each, and verifying the rendered output is byte-identical (modulo the new font link) to pre-change.

## 12. Phase 2 Preview

Phase 2 (separate design) will ship `RantaiUI` — a preloaded UMD bundle of Radix primitives + shadcn-style wrappers — accessible as `RantaiUI.Dialog`, `RantaiUI.Command`, `RantaiUI.DropdownMenu`, etc. in the iframe globals. Components:

- Dialog, AlertDialog, Popover, Tooltip, HoverCard
- DropdownMenu, ContextMenu, Menubar
- Command (cmdk), Combobox
- Tabs, Accordion, Collapsible
- Select, RadioGroup, Checkbox, Switch, Toggle, Slider
- ScrollArea, Separator, AspectRatio
- Avatar, Badge, Button, Card, Input, Textarea, Label

Bundled with `cva`, `clsx`, `tailwind-merge` as nested globals (`RantaiUI.cva`, `RantaiUI.cn`). Styled via Tailwind classes that the consumer passes as `className` prop — NOT coupled to any specific palette, so it works across all 7 aesthetic directions.

**Out of Phase 1 scope.** Mentioned here only for scope-boundary clarity.

## 13. Risks & Rollback

### Risks

1. **Google Fonts loading failure.** If `fonts.googleapis.com` is blocked or slow, user sees fallback system fonts. Mitigated by `display=swap` parameter (already standard). Not a regression — current Inter load has the same risk.

2. **LLM ignores aesthetic directive semantics.** LLM might declare `@aesthetic: luxury` but write slate+indigo code anyway. Mitigated by soft-warn heuristics (§7.2) + 4 full examples in prompt demonstrating correct direction-code correspondence. Not blocked by Phase 1 — iterative prompt tuning will close the gap. Phase 2 `RantaiUI` pre-styled components will help more.

3. **Validator false positives on palette-mismatch heuristic.** E.g., an editorial artifact that legitimately uses slate-300 for one small detail might trip the heuristic. Mitigated by the `> 5 matches` threshold and soft-warn (not hard-error) severity. Users can dismiss.

4. **Prompt bloat.** Current `react.ts` is 169 lines; new version is ~600 lines. This increases every chat turn's token cost for artifact-capable assistants. Mitigated by keeping per-direction paragraphs compact and using tables over prose where possible. If the budget becomes an issue, we can trim the examples from 4 to 3 and link to fixture files instead.

5. **Existing artifacts without `@aesthetic` directive become unrenderable.** If any existing production artifact is updated (triggering re-validation) and lacks the directive, it will hard-error. Mitigated by: migration path at renderer level — renderer accepts missing directive and renders with `industrial` defaults + surfaces a warning; validator's hard-error only applies to NEW artifacts created after Phase 1 ships.

### Rollback plan

Single feature flag: `ARTIFACT_REACT_AESTHETIC_REQUIRED` (default `true` after ship, `false` disables hard-error and falls back to legacy behavior). Exposed as an env var. If Phase 1 causes unforeseen breakage in production:

1. Set env var to `false` — validator treats `@aesthetic` as optional, LLM outputs without directive continue to work (using `industrial` defaults).
2. Revert the `react.ts` prompt to the previous commit — LLM stops emitting directives.
3. `react-renderer.tsx` directive parser continues to work (idempotent — if directives aren't present, fall-through already handles it).

Zero schema, zero S3, zero URL changes. Rollback is a config flip + a prompt-file revert.

## 14. Open Questions

None. All decisions made:

- **7 aesthetic directions** (editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic). No reduction, no addition.
- **Line-comment directive syntax** (`// @aesthetic:`, `// @fonts:`). No JSDoc frontmatter, no tool parameter.
- **Hard-error on missing `@aesthetic`, soft-warn on palette-direction mismatch.** No universal hard-error, no universal soft-warn.
- **Phase 1 scope-capped at prompt + renderer + validator.** `RantaiUI` bundle is Phase 2.
- **Default fallback direction when content signals are ambiguous: `editorial`.** Not `industrial` (which would replicate the current default failure mode).

Ready for implementation plan.
