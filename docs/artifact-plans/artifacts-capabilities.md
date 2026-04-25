# Artifact Capabilities — per-type spec

> **Audience:** anyone deciding "which artifact type should I (or my LLM) use for X?", or implementing a new capability for an existing type. Each section below is self-contained — you can read just the type you care about. Companion docs: [artifacts-deepscan.md](./artifacts-deepscan.md) (system flow) and [architecture-reference.md](./architecture-reference.md) (file:line audit).

**Last regenerated:** 2026-04-25 — fresh scan from `src/`.

---

## How to read this doc

Each artifact type gets a section with this structure:

- **Identity** — type string, label, file extension, has-code-tab flag
- **When to use** — the boundary against neighboring types
- **Content shape** — what the LLM emits (raw HTML / JSX / mermaid syntax / JSON / etc.)
- **Capabilities** — the can-do list, with concrete examples
- **Hard constraints** — things the validator rejects
- **Soft warnings** — things the validator nags about
- **Anti-patterns** — explicit ❌ items from the prompt
- **Pre-injected dependencies** — what the LLM gets for free
- **Render pipeline** — what happens between content and pixels
- **Sandbox / security** — isolation guarantees
- **Download** — file format and any post-processing

---

## Cross-type capability matrix

Quick visual reference; details in each section. Order matches the registry.

| Capability | HTML | React | SVG | Mermaid | Markdown | Document | Code | Sheet | LaTeX | Slides | Python | R3F |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Unsplash images (`unsplash:keyword`) | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| External image URLs in content | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Inline SVG (in body) | ✓ | ✓ | – | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Recharts (React component charts) | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Inline mermaid diagrams | ✗ | ✗ | ✗ | – | ✓ (fenced) | ✓ (block node) | ✗ | ✗ | ✗ | ✓ (layout) | ✗ | ✗ |
| Data charts (D3 SVG; bar/line/pie/donut) | ✗ | ✓ (Recharts) | ✗ | ✓ (`pie`) | ✗ | ✓ (block node) | ✗ | ✗ | ✗ | ✓ (layout) | ✓ (matplotlib) | ✗ |
| Aesthetic directive menu (7 directions) | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Dynamic Google Fonts | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ (font name only in DOCX) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Framer Motion animations | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lucide icons | ✓ (via SVG paths) | ✓ (`LucideReact.*`) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (`{icon:name}`) | ✗ | ✗ |
| Tailwind CSS (CDN) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Interactive forms / DOM events | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Sort + filter table | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (CSV / array) | ✗ | ✗ | ✗ | ✗ |
| Multi-sheet workbook + formulas | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (spec) | ✗ | ✗ | ✗ | ✗ |
| Real `.xlsx` export with cached values | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (spec) | ✗ | ✗ | ✗ | ✗ |
| Matplotlib plots | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Pandas / NumPy / scikit-learn | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| KaTeX math (inline + display) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ (rendered as text) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Cover page + header/footer | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (title slide layout) | ✗ | ✗ |
| TOC with bookmarks + anchors | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Page numbers | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (slide-num footer) | ✗ | ✗ |
| Footnotes (page-bottom) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Tables with colspan / rowspan | ✓ | ✓ | ✗ | ✗ | ✗ (GFM only) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Real `.docx` export (server-side) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `.pptx` export | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Code execution at runtime | ✓ (browser JS) | ✓ (transpiled JSX) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (formulas only) | ✗ | ✗ | ✓ (Pyodide) | ✓ (WebGL) |
| 3D models (`.glb`) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Iframe sandbox | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ (Worker) | ✓ |
| Theme awareness (light/dark) | ✗ | ✗ (chooses palette per directive) | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Legend: ✓ = supported · ✗ = not supported · `–` = the type itself · parenthetical = the conditional form.

---

## 1. `text/html` — HTML Page

**Identity**

| | |
|---|---|
| Type | `text/html` |
| Label / Short label | "HTML Page" / "HTML" |
| Extension | `.html` |
| Code tab | ✓ |
| Color | orange-500 |

### When to use

- Interactive single-page apps: dashboards, calculators, forms, games, landing pages.
- Anything that needs the user to **click, type, or compute**.

vs `text/markdown`: markdown is for *reading*, HTML is for *interacting*.
vs `application/react`: React if you need component state across multiple sub-views, animations, charts; HTML for self-contained interactive pages where vanilla JS is sufficient.
vs `application/slides`: slides if it's a presentation; HTML for any other interactive surface.

### Content shape

A complete HTML document. Tailwind CSS v3 from CDN and Inter from Google Fonts will be auto-injected into `<head>` if not present (regex check). Partial HTML (just a body fragment) will be wrapped in a default document.

### Capabilities

- **Tailwind CSS v3** — full utility-first styling. No build step; Tailwind's CDN reads class names at runtime.
- **Inter font** — auto-loaded if not present.
- **`unsplash:keyword phrase` URLs** in `<img src>` — server-resolved to real Unsplash URLs at create time, cached 30 days. Falls back to `placehold.co` on resolution failure.
- **Inline SVG** — full SVG markup as element trees.
- **`<audio>` / `<video>`** — supported by the iframe; sandbox doesn't strip them.
- **Vanilla JS** — `addEventListener`, `setTimeout`, `setInterval`, full DOM manipulation.
- **`localStorage`** — works (sandbox doesn't disable storage). Useful for user preferences across reloads of the same artifact.
- **Forms** — controlled state via JS only. The sandbox doesn't include `allow-forms`, so `<form action="...">` cannot POST.
- **Tables with colspan / rowspan** — full HTML table semantics.
- **Modal dialogs** — `allow-modals` is on, so `alert()` / `confirm()` / `prompt()` / `<dialog>` work.

### Hard constraints (validator errors)

- Must start with `<!DOCTYPE html>`.
- Must contain `<html>`, `<head>`, `<body>`.
- Must contain a non-empty `<title>` in `<head>`.
- Must contain `<meta name="viewport">`.
- Must NOT contain `<form action>` (the sandbox blocks submissions; misleading to users).
- Hard cap 512 KB content size (universal).

### Soft warnings (validator)

- Inline `<style>` block > 10 non-blank lines (prefer Tailwind utilities).
- `<script src>` to non-CDN URLs (likely will be blocked by sandbox).

### Anti-patterns ❌ (from prompt)

- ❌ Bare `unsplash:` reference in CSS `background-image` (won't resolve — only matches `<img src>`)
- ❌ External URLs other than Tailwind CDN, Google Fonts, or `unsplash:`
- ❌ Form with `action="/submit"` (sandbox blocks POST)
- ❌ `window.location = "..."` (sandbox blocks navigation)
- ❌ Truncation or "...add more here" placeholders

### Pre-injected dependencies

- Tailwind CDN (`https://cdn.tailwindcss.com`)
- Google Fonts (Inter family)
- Navigation blocker script (custom, see render pipeline)

### Render pipeline

1. Parse content for existing Tailwind / Inter; conditionally inject if missing.
2. If partial HTML, wrap in default document with charset + viewport + base styles.
3. Inject navigation blocker script (BEFORE any user code).
4. Build `srcDoc` and load into `<iframe sandbox="allow-scripts allow-modals">`.
5. 5-second slow-load warning timer; spinner cleared by actual `onLoad` event.
6. Three `useRef`s coordinate state across loads to prevent races during navigation restoration.

### Sandbox / security

- **Iframe sandbox flags**: `allow-scripts allow-modals` only. **No** `allow-same-origin`, **no** `allow-top-navigation`, **no** `allow-forms`, **no** `allow-popups`.
- **Navigation blocker** (injected before user code) overrides:
  - `Location.assign` / `Location.replace` / `Location.reload`
  - `location.href` setter
  - Anchor `click` events (non-fragment, non-`javascript:`)
  - Form `submit` events
  - `history.pushState` / `history.replaceState`
  - `window.open` (returns a no-op stub)
- **No DOMPurify** — relies entirely on the iframe sandbox boundary for isolation.

### Download

Raw `.html` save (the actual artifact content). Tailwind CDN + Inter font links are part of the saved file (since they're injected at render time, not before persist) — actually, since the injection happens in the renderer's iframe construction, the saved file does *not* include the auto-injected Tailwind/font; the LLM is expected to include them itself if they should be in the saved file.

---

## 2. `application/react` — React Component

**Identity**

| | |
|---|---|
| Type | `application/react` |
| Label / Short label | "React Component" / "React" |
| Extension | `.tsx` |
| Code tab | ✓ |
| Color | blue-500 |

### When to use

- UI components with state: dashboards, toolboxes, configurators, chart explorers, multi-step flows.
- Anything that benefits from React's reconciliation: lists, forms, animations.
- When you need **Recharts** for data viz or **Framer Motion** for animations.

vs `text/html`: HTML for one-shot pages; React for stateful UI with reusable parts.
vs `application/slides`: slides have rigid layouts; React if you need a custom interactive surface.

### Content shape

A single React component file. **Line 1 must be a directive comment**:

```jsx
// @aesthetic: editorial
```

**Optional line 2:**

```jsx
// @fonts: Fraunces:ital,wght@0,400..700 | Inter:wght@300..700
```

The component must export a default. JSX + ES modules. TypeScript syntax allowed (Babel strips types).

### Aesthetic directive menu

Required on line 1. Determines palette guidance, component conventions, motion character, and default Google Fonts.

| Direction | Use for | Default fonts |
|---|---|---|
| `editorial` | articles, brand pages, storytelling, long-form | Fraunces + Inter |
| `brutalist` | indie tools, manifestos, dev products, "raw" | Space Grotesk + JetBrains Mono |
| `luxury` | premium, hospitality, fashion | DM Serif Display + DM Sans |
| `playful` | onboarding, kids, creative tools | Fredoka |
| `industrial` | dashboards, admin, monitoring | Inter Tight + Space Mono |
| `organic` | wellness, food, crafts | Fraunces + Public Sans |
| `retro-futuristic` | gaming, sci-fi, events | VT323 + Space Mono |

The validator hard-errors on missing `@aesthetic:` (when env `ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"`) or unknown direction. Soft-warns on:
- ≥ 6 `slate-*`/`indigo-*` references with a non-`industrial` direction (palette mismatch)
- `editorial`/`luxury` direction without a recognized serif in `@fonts` (font mismatch)
- `industrial` direction using `Motion.motion` or `Motion.AnimatePresence` (motion-in-industrial)

### `@fonts` spec

Pipe-separated. Each spec validates against `/^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|...)$/`. Max 3 families. Loaded dynamically from `fonts.googleapis.com` (only host whitelist). Malformed specs hard-error in the validator.

### Capabilities

**Pre-injected globals (no `import` needed):**

| Library | Symbol | Version |
|---|---|---|
| React 18 | `React` + 26 hooks pre-destructured | UMD 18 |
| Recharts | `Recharts.LineChart`, `Recharts.BarChart`, `Recharts.PieChart`, `Recharts.AreaChart`, `Recharts.ResponsiveContainer`, `Recharts.Tooltip`, `Recharts.XAxis`, `Recharts.YAxis`, `Recharts.CartesianGrid`, `Recharts.Legend`, etc. | 2 |
| Lucide React | `LucideReact.ArrowRight`, `LucideReact.Check`, `LucideReact.X`, etc. | 0.454.0 |
| Framer Motion | `Motion.motion.div`, `Motion.AnimatePresence` | 11 |
| Tailwind CSS | utility classes via CDN | v3 |

**Pre-destructured React hooks** (available without `const { ... } = React;`): `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`, `useReducer`, `useId`, `useTransition`, `useDeferredValue`, `useSyncExternalStore`, `useInsertionEffect`, `useLayoutEffect`, `createContext`, `forwardRef`, `memo`, `Fragment`, `Suspense`, `lazy`, `startTransition`, `Children`, `cloneElement`, `createElement`, `isValidElement` — and a few more (Profiler / StrictMode are NOT in the destructured set; `import { Profiler } from 'react'` will be rewritten to `const { Profiler } = React;`).

**TypeScript syntax** is allowed — Babel strips types during transpile.

### Hard constraints (validator errors)

- Missing `// @aesthetic:` line 1 (gated by env, default enforce)
- Unknown aesthetic value (gated by env)
- Malformed `@fonts` spec (gated by env)
- More than 3 font families
- Missing `export default`
- Class components (`class X extends React.Component`)
- Non-whitelisted imports — only allowed: `react`, `react-dom`, `recharts`, `lucide-react`, `framer-motion`, plus relative paths
- `document.getElementById` / `document.querySelector` (use `useRef`)
- CSS imports (`import './styles.css'`)
- Hard cap 512 KB

### Soft warnings (validator)

- Direction-specific palette/font/motion mismatches (see directive section above)

### Anti-patterns ❌

- ❌ `import { Card } from 'shadcn/ui'` — NOT available
- ❌ `import './styles.css'`
- ❌ `class X extends React.Component`
- ❌ `document.getElementById` / `document.querySelector`
- ❌ Real `fetch()` calls (no network)
- ❌ Form `action="/api"` POST (sandbox)
- ❌ `window.open` / `window.location` (sandbox)
- ❌ Truncation

### Render pipeline

1. Strip directive lines (1–2) before transpile.
2. Hide template literals (`` `...` ``) so import-regex doesn't false-match inside strings.
3. Collapse multi-line imports onto one line.
4. Rewrite imports to globals: `import { useState } from 'react'` → `const { useState } = React;` (only for symbols not in the 26 pre-destructured set); `import * as Recharts from 'recharts'` → `const Recharts = Recharts;` etc.
5. Strip side-effect imports (`import './foo.css'`).
6. Transform `export default` into a named const/function.
7. Restore template literals.
8. Build iframe `srcDoc` containing: Tailwind CDN, font links from `buildFontLinks(aesthetic, fonts)`, React 18 + ReactDOM 18 + Babel-standalone + Recharts + Lucide + Framer Motion UMDs, navigation blocker, then a `<script type="text/babel">` block with the user code wrapped in an `__ArtifactErrorBoundary` class.
9. Mount with `ReactDOM.createRoot()`.
10. Errors postMessage'd to parent; parent shows fatal card (Retry / Fix-with-AI / View Source) or non-fatal warning banner.

### Sandbox / security

- Iframe `sandbox="allow-scripts"` — **no** modals, no popups.
- Same navigation blocker as HTML.
- Babel runs in-iframe (transpiled at render time, not at create time).

### Download

`.tsx`. Saved file includes the user's directive comments and original `import` statements (the rewriting happens only during render).

---

## 3. `image/svg+xml` — SVG Graphic

**Identity**

| | |
|---|---|
| Type | `image/svg+xml` |
| Label / Short label | "SVG Graphic" / "SVG" |
| Extension | `.svg` |
| Code tab | ✓ |
| Color | emerald-500 |

### When to use

- Icons, glyphs, symbols (`<viewBox="0 0 24 24">`, currentColor stroke).
- Illustrations, hero shots, empty states.
- Logos, badges, wordmarks.
- Static diagrams (non-flowchart — use Mermaid for flowcharts).

### Content shape

Inline SVG markup. `viewBox` is required; hardcoded `width`/`height` will break responsive scaling.

### Capabilities

- All standard SVG shape elements: `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>`.
- Native `<text>` with `text-anchor`, `dominant-baseline`, font attributes.
- Groups, defs, gradients (`<linearGradient>`, `<radialGradient>`), patterns, `<use>` references.
- SMIL animation: `<animate>`, `<animateTransform>` (CSS animations not supported — `<style>` is stripped).
- `currentColor` for icon stroke (inherits from parent text color).
- 4 style categories: **icon** (`viewBox="0 0 24 24"`, `fill="none"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`), **illustration** (`viewBox="0 0 400 300"`, 3–5 colors, mostly filled), **logo / badge** (square `0 0 200 200` for emblems, rectangular `0 0 240 80` for wordmarks, ≤ 3 colors), **diagram** (proportional, 2–4 colors, consistent stroke widths).

### Hard constraints

- `<script>` blocks → stripped by DOMPurify (validator also rejects).
- `<style>` blocks → stripped (would leak to host page since rendered inline).
- `<foreignObject>` → stripped.
- External `href` / `xlink:href` (http / https / data: URIs) → only same-doc `#fragment` references allowed.
- Event handler attributes (`onclick`, `onload`, etc.) → stripped.
- Inline `style="..."` blocks discouraged (validator warns); use SVG presentation attributes (`fill`, `stroke`, `stroke-width`, `opacity`, `transform`) instead.

### Soft warnings

- > 5 distinct colors (decorative patterns: max 3)
- Path coordinates with > 2 decimal precision (overprecise; bloats file)
- Missing `viewBox`
- Hardcoded width/height

### Anti-patterns ❌

- ❌ `<script>` / `<style>` / `<foreignObject>`
- ❌ External hrefs
- ❌ Event handlers
- ❌ > 5 colors (or > 3 for decorative patterns)

### Pre-injected dependencies

None. SVG renders inline.

### Render pipeline

1. `DOMParser.parseFromString(content, "image/svg+xml")` — check for `<parsererror>` and `<svg>` root.
2. `DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["use"] })`.
3. Inline `dangerouslySetInnerHTML` (no iframe).

### Sandbox / security

- No iframe — content rendered directly into the React tree.
- DOMPurify with the SVG profile is the sole sanitizer.
- `<use>` is in `ADD_TAGS` (allowed for symbol references).
- `<filter>` and friends (`<feGaussianBlur>`, etc.) are allowed via `svgFilters` profile.

### Download

Raw `.svg`.

---

## 4. `application/mermaid` — Mermaid Diagram

**Identity**

| | |
|---|---|
| Type | `application/mermaid` |
| Label / Short label | "Mermaid Diagram" / "Mermaid" |
| Extension | `.mmd` |
| Code tab | ✓ |
| Color | purple-500 |

### When to use

- Process flows, decision trees, algorithms, pipelines, org charts (`flowchart`)
- API call sequences, OAuth, webhooks (`sequenceDiagram`)
- DB schemas (`erDiagram`)
- Lifecycles, state machines (`stateDiagram-v2`)
- Class hierarchies (`classDiagram`)
- Project schedules / roadmaps (`gantt`)
- Concept maps (`mindmap`)
- Distributions (`pie`)
- 2×2 priority/impact matrices (`quadrantChart`)
- Scatter / bubble / sankey / timeline (`xychart-beta`, `sankey-beta`, `timeline`)

### Content shape

Raw Mermaid syntax. **No markdown fences.** First non-empty token must be a recognized diagram declaration. The renderer auto-syncs the theme to light/dark — do **not** override with `%%{init: {'theme':'...'}}%%`.

### Capabilities

**14 supported diagram types** (validator-verified declarations):

| User wants… | Type | Declaration | Max nodes |
|---|---|---|---|
| Process / workflow | `flowchart` | `flowchart TD` or `LR` | 15 |
| API call / sequence | `sequenceDiagram` | `sequenceDiagram` | 15 |
| DB schema | `erDiagram` | `erDiagram` | 15 |
| Lifecycle / states | `stateDiagram-v2` | `stateDiagram-v2` | 15 |
| Class / OOP | `classDiagram` | `classDiagram` | 15 |
| Schedule / roadmap | `gantt` | `gantt` | 15 |
| Brainstorm / concept | `mindmap` | `mindmap` | 15 |
| Git branching | `gitGraph` | `gitGraph` | 15 |
| Distribution | `pie` | `pie` | 8 |
| User journey | `journey` | `journey` | 15 |
| Priority / matrix | `quadrantChart` | `quadrantChart` | – |
| Timeline events | `timeline` | `timeline` | – |
| Sankey / flow | `sankey-beta` | `sankey-beta` | – |
| XY scatter / bubble | `xychart-beta` | `xychart-beta` | – |
| C4 architecture | `c4Context` | `c4Context` | – |
| Requirements | `requirementDiagram` | `requirementDiagram` | – |

### Hard constraints

- Markdown fence wrappers (```` ```mermaid ````) → reject.
- Missing diagram declaration on first meaningful line → reject.
- No mermaid `click` directives — `securityLevel: "strict"` blocks them.

### Soft warnings

- > 3000 chars (renderer slow on large diagrams).
- > 15 node definitions in a flowchart (unreadable).
- Labels > 5 words.
- Subgraphs > 2 levels deep.
- `%%{init: ... theme ...}%%` directive (breaks dark-mode sync).
- Mixed syntax (e.g. `->>` in flowchart).

### Anti-patterns ❌

- ❌ Markdown fences in output
- ❌ Missing declaration
- ❌ > 15 nodes
- ❌ `click NodeId call fn()` or `click NodeId href "..."` (blocked)
- ❌ Theme override

### Pre-injected dependencies

- mermaid v11 (dynamic-imported on first render, cached at module level).

### Render pipeline

1. Module-level singleton: `mermaidPromise = import("mermaid")`.
2. Track `lastInitTheme`; if light/dark changed, re-initialize with theme config from `mermaid-config.ts`.
3. `mermaid.parse(content, { suppressErrors: true })` to validate syntax.
4. `mermaid.render(id, content)` returns SVG string.
5. Inline `dangerouslySetInnerHTML` (no iframe).
6. On error: regex-strip verbose details after first `\n\n`, show Retry + View-Source + Fix-with-AI.

### Sandbox / security

- `securityLevel: "strict"` (mermaid config)
- `htmlLabels: false` (text rendered as SVG `<text>`, not HTML)
- `deterministicIds: true` (reproducible output)
- `startOnLoad: false` (manual render only)
- Theme via `theme: "base"` + custom `themeVariables` (light + dark mappings to Tailwind tokens)

### Download

Raw `.mmd`.

---

## 5. `text/markdown` — Markdown

**Identity**

| | |
|---|---|
| Type | `text/markdown` |
| Label / Short label | "Markdown" / "Markdown" |
| Extension | `.md` |
| Code tab | ✓ |
| Color | gray-500 |

### When to use

- READMEs, CONTRIBUTING files, technical docs, design notes
- Reports, comparison articles, tutorials
- Blog posts, changelogs, release notes
- Anything read on screen, no formal export needed

vs `text/document`: documents are formal deliverables (printable / `.docx` / cover page); markdown is for screen reading.
vs `text/html`: HTML when you need interaction; markdown for read-only content.
vs `text/latex`: LaTeX for math-heavy proofs/derivations; markdown can do *some* inline math via KaTeX.

### Content shape

GitHub-Flavored Markdown.

### Capabilities

- **Code blocks**: Shiki syntax highlighting. **Required language tag** (untagged blocks render unstyled).
- **GFM tables**: pipe tables.
- **KaTeX math**: inline `$...$`, display `$$...$$`. `remark-math` + `rehype-katex` plugins.
- **Inline mermaid**: ` ```mermaid ` fenced blocks render as live diagrams.
- **Task lists**: `- [ ]` and `- [x]`.
- **Strikethrough**: `~~text~~`.
- **Links + images**: `![alt](url)` for absolute URLs only.
- **Theme awareness**: Streamdown's Shiki theme switches with `next-themes` (`["github-dark", "github-light"]` for dark mode).
- **Streaming**: `animated` + `isAnimating` props for streaming UI animations.

### Hard constraints

(None — `validateMarkdown` is the most permissive validator: only soft warnings.)
- Hard cap 512 KB content size (universal).

### Soft warnings

- Missing top-level `# heading`.
- Heading level jumps (e.g. `#` directly to `###`).
- Raw HTML tags (`<details>`, `<summary>`, `<kbd>`, `<mark>`, `<iframe>`, `<video>`, `<audio>`, `<object>`, `<embed>`, `<table>` — unreliable through Streamdown).
- `<script>` (markdown doesn't execute).
- Untagged fenced code blocks (no Shiki highlight).

### Anti-patterns ❌

- ❌ Raw HTML for layout (`<details>`, `<kbd>`, `<sub>`, `<script>`)
- ❌ Emoji as functional icons (use inline SVG or text)
- ❌ Truncation / "exercise for the reader"
- ❌ Lorem ipsum / `[TODO]` / `...`

### Pre-injected dependencies

- Streamdown v2.2.0
- Shiki for code highlighting
- KaTeX for math (`remark-math` v6 + `rehype-katex` v7)
- Mermaid v11 (used inside Streamdown's mermaid control)
- `next-themes` for theme awareness

### Render pipeline

The dispatcher routes `text/markdown` directly to `StreamdownContent` (no dedicated `MarkdownRenderer`). Streamdown wraps the actual rendering and exposes:
- `controls: { code: true, table: true, mermaid: true }`
- `mermaid: { errorComponent: MermaidError }` (custom error UI)
- `plugins.math: { remarkPlugin: remark-math, rehypePlugin: rehype-katex }`
- `shikiTheme` array ordered by current theme

No iframe. Inline DOM render.

### Sandbox / security

- No iframe.
- Streamdown / react-markdown filters dangerous HTML by default.
- KaTeX with default settings (does not enable `trust`, so `\href` etc. with `javascript:` URLs are stripped).

### Download

Raw `.md`.

---

## 6. `text/document` — Document (the AST type)

**Identity**

| | |
|---|---|
| Type | `text/document` |
| Label / Short label | "Document" / "Document" |
| Extension | `.docx` |
| Code tab | **✗** (preview is the source of truth) |
| Color | amber-500 |

### When to use

- Client proposals, tender responses, statements of work
- Executive reports, board briefs, quarterly reviews
- Book chapters, white papers, research papers
- Official letters, legal memos, formal advice notes
- Anything someone will **print, sign, send, or archive**

vs `text/markdown`: heuristic — if it'll be read once on a screen, markdown; if it'll be archived/signed/sent, document.
vs `text/html`: HTML can't export to `.docx` cleanly.
vs `text/latex`: LaTeX for math-heavy authoring; document for prose-heavy with cover/header/footer/TOC.

### Content shape

**JSON-only** output matching the `DocumentAst` schema. **No markdown fences. No commentary before `{` or after `}`.** The entire response must be `JSON.parse`-able as-is.

```json
{
  "meta":      { /* title, author, date, pageSize, orientation, margins, font, ... */ },
  "coverPage": { /* optional styled cover */ },
  "header":    { "children": [ /* repeating page header */ ] },
  "footer":    { "children": [ /* repeating page footer */ ] },
  "body":      [ /* main content */ ]
}
```

### `meta` fields

| Field | Required | Notes |
|---|:-:|---|
| `title` | ✓ | 1–200 chars |
| `author` | | ≤ 120 chars |
| `date` | | ISO 8601 `YYYY-MM-DD` |
| `subtitle` | | ≤ 200 chars |
| `organization` | | ≤ 120 chars |
| `documentNumber` | | ≤ 80 chars; e.g. `PROP/NQT/2026/001` |
| `pageSize` | | `"letter"` (default) or `"a4"` |
| `orientation` | | `"portrait"` (default) or `"landscape"` |
| `margins` | | `{ top, bottom, left, right }` in DXA (1440 = 1 in; default 1440 each) |
| `font` | | family name; default `"Arial"` |
| `fontSize` | | 8–24 pt; default 12 |
| `showPageNumbers` | | boolean |

### `coverPage` fields

Optional. `title` required. Optional `subtitle`, `author`, `date` (ISO regex), `organization`, `logoUrl` (URL or `unsplash:keyword`).

### Block nodes (12)

| Type | Use for | Required fields |
|---|---|---|
| `paragraph` | Running prose | `children` ≥ 1 inline |
| `heading` | Section titles | `level` 1–6, `children` ≥ 1 inline; optional `bookmarkId` (kebab-case, unique) |
| `list` | Bullet / numbered items, nested via `subList` | `ordered` boolean, `items` ≥ 1; optional `startAt` |
| `table` | Pricing, features, comparison | `columnWidths[]` (DXA), `width` (DXA, must equal sum), `rows[]`; optional `shading: "striped"` |
| `image` | Illustrations, hero shots | `src` (URL or `unsplash:keyword`), `alt` (required, non-empty), `width`, `height` (px); optional `caption`, `align` |
| `blockquote` | Pull quotes, citations | `children` ≥ 1 block; optional `attribution` |
| `codeBlock` | Config files, snippets | `language`, `code` |
| `horizontalRule` | Section separator | — |
| `pageBreak` | Force new page | — |
| `toc` | Table of contents | `maxLevel` 1–6; optional `title` |
| `mermaid` | Flowcharts, sequence, etc. (16 mermaid types) | `code` (1–10000 chars, NO fences); optional `caption`, `width` 200–1600, `height` 150–1200, `alt` (defaults 1200×800) |
| `chart` | Quantitative data viz | `chart: ChartData`; optional `caption`, `width`, `height`, `alt` (defaults 1200×600) |

`paragraph` optional fields: `align` (`left` / `center` / `right` / `justify`), `spacing: { before, after }` in DXA, `indent: { left, hanging, firstLine }` in DXA.

### Inline nodes (7)

| Type | Required | Notes |
|---|---|---|
| `text` | `text` | Style flags: `bold`, `italic`, `underline`, `strike`, `code`, `superscript`, `subscript` (booleans); `color: "#rrggbb"` |
| `link` | `href`, `children` ≥ 1 inline | External hyperlink |
| `anchor` | `bookmarkId`, `children` ≥ 1 inline | Internal cross-reference (must match a heading bookmark) |
| `footnote` | `children` ≥ 1 block | Page-bottom footnote in DOCX |
| `lineBreak` | — | Soft break (not a new paragraph) |
| `pageNumber` | — | **Only valid inside `header.children` / `footer.children`** |
| `tab` | optional `leader: "none" | "dot"` | Horizontal tab; `"dot"` creates dotted line for letters / TOCs |

### Capabilities

- **Cover page** — separate styled first page (auto-generated from `coverPage` object).
- **Header / footer** — repeated on each page in DOCX; visible at top/bottom of each simulated page in HTML preview.
- **Page numbers** — `pageNumber` inline node in header/footer.
- **TOC** — real Word TOC field, populated from heading bookmarkIds. Hyperlinked in DOCX. Live-generated in HTML preview.
- **Anchors** — internal cross-references between text and heading bookmarks. `InternalHyperlink` in DOCX.
- **Footnotes** — Word native footnotes (numbered at page bottom).
- **Tables** — column widths in DXA, header rows, cell colspan/rowspan, shading, alignment, recursive cell content.
- **Images** — Unsplash resolution (rewritten in validator before persist) or full URLs. Required `alt` text.
- **Inline mermaid** — block node renders as SVG in preview, PNG (via jsdom + sharp) in DOCX.
- **Inline charts** — block node uses `ChartData` from slides. SVG in preview, PNG in DOCX.
- **Code blocks** — gray-background paragraphs in DOCX (Consolas font), Shiki highlight in preview.
- **Page sizing** — letter or A4, portrait or landscape, custom margins.
- **Numbering** — 3 levels of bullets (•/◦/▪) and 3 levels of ordered (`%1.` / `%2.` / `%3.`).
- **Heading style cascade** — H1–H6 with HEADING_1..6 styles, outline levels (for TOC).

### Hard constraints

- Content not parseable as JSON → error.
- Zod schema violations → error.
- 128 KB serialized-size cap (pre-Zod budget check).
- `anchor.bookmarkId` not declared on any heading → semantic error.
- `pageNumber` inline outside header/footer → semantic error.
- `sum(columnWidths) !== width` in any table → semantic error.
- Per-row cell count (with colspan) ≠ column count → semantic error.
- `unsplash:` with empty keyword → semantic error.
- `mermaid.code` first token not in {flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline, journey, c4Context, gitGraph, quadrantChart, requirementDiagram} → semantic error.
- Hard cap 512 KB.

### Soft warnings

(Document validator focuses on structural correctness — most issues are hard errors. Quality issues are caught by the prompt rules, not the validator.)

### Anti-patterns ❌ (from prompt, ~12 items)

- ❌ Output anything before `{` or after `}` — commentary, fences, explanation
- ❌ Wrap JSON in ```` ```json ```` fences
- ❌ Markdown syntax inside `text.text` (`**bold**`, `## heading`, backticks, `*italic*`) — use inline node style flags instead
- ❌ Empty `children` arrays on `paragraph` / `heading` / `blockquote` (schema requires ≥ 1)
- ❌ `anchor.bookmarkId` referencing an undeclared heading
- ❌ `pageNumber` inline outside header/footer
- ❌ `sum(columnWidths) !== width` in a table
- ❌ `"src": "unsplash:"` (empty keyword)
- ❌ Missing `alt` on images
- ❌ **Math notation (`$...$` or `$$...$$`)** — `text/document` does NOT render LaTeX. Use prose, or `text/markdown`/`text/latex` for math-heavy content.
- ❌ Using `text/document` for a README, internal note, or developer doc — use `text/markdown`
- ❌ Wrapping a `mermaid` block's `code` in ```` ```mermaid ```` fences — `code` IS raw mermaid syntax
- ❌ > 15 nodes in a mermaid flowchart
- ❌ Stuffing prose into diagrams (use `mermaid` for qualitative, `chart` for quantitative)
- ❌ Truncation, `Lorem ipsum`, `[TODO]`, `(content omitted)`

### Pre-injected dependencies

For preview:
- mermaid v11 (dynamic import, `MERMAID_INIT_OPTIONS` from `src/lib/rendering/mermaid-theme.ts`)
- D3 (via `chartToSvg` from `src/lib/rendering/chart-to-svg.ts`)

For DOCX export (server-side):
- [`docx`](https://www.npmjs.com/package/docx) MIT
- [`jsdom`](https://www.npmjs.com/package/jsdom) — server-side DOM shim for mermaid render
- [`sharp`](https://www.npmjs.com/package/sharp) — SVG → PNG rasterizer

### Render pipeline (preview)

1. `JSON.parse(content)` → if fails, show empty state.
2. `DocumentAstSchema.safeParse(raw)` → if fails, show empty state.
3. Walk AST recursively via `renderInline()` and `renderBlock()`.
4. A4/Letter page sizing in pixels (96 DPI conversion from DXA).
5. Mermaid blocks: dynamic-import mermaid, init with shared `MERMAID_INIT_OPTIONS`, render to SVG, set via `dangerouslySetInnerHTML`.
6. Chart blocks: call `chartToSvg(chart, 800, 400)`, set via `dangerouslySetInnerHTML`.
7. TOC built post-walk by traversing body for headings ≤ `maxLevel`.
8. Footnotes accumulated in a sink object passed through render tree, rendered at document end.

### DOCX export pipeline (server)

1. `GET /api/dashboard/chat/sessions/{id}/artifacts/{artifactId}/download?format=docx` (Node runtime).
2. Auth + ownership; reject if `artifactType !== "text/document"`.
3. `JSON.parse(content)` → `DocumentAstSchema.parse()`.
4. `astToDocx(ast)`:
   - Page setup: letter (12240×15840 twips) or a4 (11906×16838); margins from `meta.margins`.
   - Cover page: 48pt centered title, 28pt italic subtitle, 24/22pt centered author/org/date stack, trailing page break.
   - Inline rendering: text style flags, `ExternalHyperlink`, `InternalHyperlink` (anchor), `FootnoteReferenceRun` (footnotes deferred), `PageNumber.CURRENT`, `tab`, `lineBreak`.
   - Block rendering: `Paragraph` (alignment + spacing + indentation), `Heading` (level → HEADING_1..6, optional Bookmark wrapper), `List` (3-level bullets / numbers, recursive), `Table` (with colspan/rowspan + shading + borders + vertical-align), `Image` (HTTP fetch, 10s timeout, fallback 1×1 transparent PNG, SVG rejected by docx-js), `Mermaid` (mermaidToSvg → resizeSvg → svgToPng → ImageRun), `Chart` (chartToSvg → resizeSvg → svgToPng → ImageRun), `Blockquote` (left-border + indent + optional attribution), `CodeBlock` (gray-background paragraphs, Consolas), `PageBreak`, `TableOfContents` (with `hyperlink: true`, `headingStyleRange: "1-{maxLevel}"`), `HorizontalRule` (paragraph with bottom border).
   - Style cascade: HEADING_1 (20pt) → HEADING_6 (12pt) with outline levels.
   - Font: `meta.font` or `"Arial"`; `meta.fontSize` applied globally.
   - Footnotes accumulated during body rendering, attached to `Document.footnotes`.
   - Header/footer rendered via `renderBlocks()`, attached to section `headers` / `footers`.
5. Return as `Uint8Array` blob with sanitized filename.

### Sandbox / security

- No iframe (preview).
- Upstream Zod schema is the security boundary — AST nodes carry only structured data, no executable HTML.
- DOCX export runs in Node runtime, not edge runtime.
- jsdom shim restores globals in `finally` for thread safety.

### Download

Split-button:
- **Markdown (.md)** — client-side AST → markdown walk. Lossy (mermaid/chart become placeholder fences).
- **Word (.docx)** — server route, `astToDocx()`. Full fidelity.

PDF export is **not shipped**.

---

## 7. `application/code` — Code (display-only)

**Identity**

| | |
|---|---|
| Type | `application/code` |
| Label / Short label | "Code" / "Code" |
| Extension | `.txt` (overridden by language conventions in download) |
| Code tab | **✗** (preview *is* the code) |
| Color | cyan-500 |

### When to use

- Source files: configs, scripts, modules.
- Code that the user will copy into a project, not run inside the artifact.

vs `application/python`: Python is **executable** in-browser; code is display-only.
vs `text/markdown`: markdown if there's surrounding prose; code if it's pure source.

### Content shape

Source code, plus the `language` parameter on the tool call.

### Capabilities

- **Shiki syntax highlighting** for ~30 languages: `typescript`, `tsx`, `javascript`, `jsx`, `python`, `rust`, `go`, `java`, `csharp`, `cpp`, `c`, `ruby`, `php`, `swift`, `kotlin`, `sql`, `bash`, `shell`, `yaml`, `json`, `toml`, `dockerfile`, `html`, `css`, `scss`, `markdown`, etc.
- **Copy and download** buttons in the panel.
- **No truncation**: validator soft-errors on `// ...rest`, `# TODO: implement`, `unimplemented!()`, `pass # placeholder`, etc.

### Per-language conventions (from prompt)

- TypeScript: ES modules, no `any`, JSDoc on public functions
- Python: 3.10+, type hints, Google-style docstrings, `if __name__ == "__main__":`
- Rust: `Result<T, E>`, `?` propagation, derive `Debug`
- Go: check every `error`, exported names PascalCase
- SQL: uppercase keywords, explicit JOINs
- Shell: `#!/usr/bin/env bash`, `set -euo pipefail`, quote `${var}`

### Hard constraints

- Content that looks like HTML (`<!doctype` / `<html`) → reject (wrong type).
- Markdown fence wrapper around the content → reject (the renderer adds the fence, not the LLM).
- 512 KB cap.

### Soft warnings

- Truncation/placeholder markers
- Content > 512 KB

### Anti-patterns ❌

- ❌ Truncation (`// ... rest`, `...`, TODO comments)
- ❌ Placeholders (`pass`, `throw new Error("not implemented")`, `unimplemented!()`)
- ❌ Realistic-looking but non-functional values (`example.com` for real APIs, etc.)
- ❌ Markdown fence wrappers in the content

### Pre-injected dependencies

- Shiki for highlighting (via Streamdown).

### Render pipeline

The dispatcher computes the longest backtick run in the content (so embedded code blocks don't break the wrapping fence) and wraps the content in a fence + language tag, then passes to `StreamdownContent` for rendering. No iframe.

### Sandbox / security

- No execution at all — purely display.
- Streamdown filters dangerous HTML (though this content is treated as code, not markdown).

### Download

Extension determined by the `language` param (e.g. `.py` for Python, `.rs` for Rust). The registry's default extension is `.txt`; the panel overrides during download.

---

## 8. `application/sheet` — Spreadsheet (3 content shapes)

**Identity**

| | |
|---|---|
| Type | `application/sheet` |
| Label / Short label | "Spreadsheet" / "Spreadsheet" |
| Extension | `.csv` (or `.xlsx` for spec) |
| Code tab | ✓ |
| Color | green-500 |

### When to use

- Flat tabular data (employees, products, SKUs) → CSV or JSON-array shape.
- Financial models, budgets, forecasts, cap tables, P&L → `spreadsheet/v1` spec.
- Anything with formulas, multi-sheet, named ranges, or complex formatting → spec.

vs `text/markdown` (with GFM table): markdown for small read-only comparison tables; sheet for sortable/filterable data or any computation.
vs `text/document` (with table block): document for tables embedded in narrative deliverables; sheet for standalone data.

### Content shape — three options

#### Shape A: CSV (default for flat data)

- Header row required.
- Quote fields with comma / quote / newline: `"Engineer, Senior"`.
- Escape literal quotes by doubling: `"She said ""hi"""`.
- Every row matches header column count.
- No trailing comma, no BOM, UTF-8.

#### Shape B: JSON array of objects

- Top level: non-empty array `[{...}, {...}]`.
- Every object has same keys in same order.
- First object's keys = column headers.
- No nested objects/arrays (would stringify as `[object Object]`).

#### Shape C: `spreadsheet/v1` JSON spec

```json
{
  "kind": "spreadsheet/v1",
  "theme": { "primaryColor": "#0F172A", "accentColor": "#3B82F6" },
  "namedRanges": { "GrowthRate": "Assumptions!B2" },
  "sheets": [
    {
      "name": "Assumptions",
      "frozen": { "rows": 1 },
      "columns": [ { "width": 24 }, { "width": 16 } ],
      "cells": [
        { "ref": "A1", "value": "Metric", "style": "header" },
        { "ref": "B1", "value": "Value", "style": "header" },
        { "ref": "A2", "value": "Starting Revenue" },
        { "ref": "B2", "value": 4200000, "format": "$#,##0", "style": "input" },
        { "ref": "A3", "value": "Growth Rate" },
        { "ref": "B3", "value": 0.18, "format": "0.0%", "style": "input", "note": "Q4 trend" }
      ],
      "merges": []
    },
    {
      "name": "Projections",
      "cells": [
        { "ref": "A1", "value": "Year 1", "style": "header" },
        { "ref": "B1", "formula": "Assumptions!B2 * (1 + GrowthRate)", "format": "$#,##0", "style": "formula" }
      ]
    }
  ]
}
```

### Hard caps (spec)

- 8 sheets per workbook
- 500 cells per sheet
- 200 formulas per workbook
- 64 named ranges
- 31 chars max sheet name (Excel-compatible)
- 26 columns per sheet (A–Z)

### Cell rules (spec)

- `value` XOR `formula` — never both on same cell.
- `ref` is A1 notation uppercase (`A1`, `B25`, `AA10`).
- `formula` strings start with `=` or omit it; validator normalizes.
- Sheet names: alphanumeric + space/underscore, none of `!`, `:`, `[`, `]`, `?`, `*`, `/`, `\`.
- Cross-sheet refs: `Sheet2!A1` (must reference existing sheet).
- Named ranges resolve transparently inside formulas.

### Cell styles (6 named)

| Style | Use | Rendering |
|---|---|---|
| `header` | Column / row headers | Bold, primary fill, white text |
| `input` | User-editable values | Blue text (`#2563EB`), no fill |
| `formula` | Computed cells | Black text |
| `cross-sheet` | References other sheets | Green text (`#059669`) |
| `highlight` | Important figures | Yellow fill (`#FEF3C7`) |
| `note` | Annotations | Italic, gray |

### Number formats (Excel-compatible)

- Currency: `"$#,##0"`, `"$#,##0.00"`
- Currency with parens-negative: `"$#,##0;($#,##0);-"`
- Percent: `"0%"`, `"0.0%"`, `"0.00%"`
- Multiples: `"0.0x"` (ratios)
- Thousands: `"#,##0"`
- Dates: `"mmm d, yyyy"`, `"yyyy-mm-dd"`
- Segmented: `"positive;negative;zero"`

### Capabilities

**Shape A/B (flat data):**
- Sort by any column (TanStack Table).
- Global filter / search.
- CSV export (respects current filter).

**Shape C (spec):**
- Multi-sheet with tabs.
- ~500 Excel functions via `@formulajs/formulajs`: SUM, IF, VLOOKUP, HLOOKUP, INDEX, MATCH, IFERROR, XIRR, NPV, IRR, PMT, FV, PV, ROUND, AVERAGE, COUNT, COUNTIF, SUMIF, MAX, MIN, CONCAT, TEXT, DATE, YEAR, MONTH, DAY, TODAY, AND, OR, NOT, etc.
- Cross-sheet references and named ranges.
- Cycle detection (Kahn's algorithm topological sort).
- ƒx toggle: switch between computed values and raw formulas.
- Click-a-cell footer: ref + formula + format + note.
- Real `.xlsx` export via ExcelJS, with cached values pre-populated.
- Style-aware cell rendering (blue input / black formula / green cross-sheet / yellow highlight / italic note).
- Error display: `#REF!`, `#NAME?`, `#DIV/0!`, `#VALUE!`, `CIRCULAR` shown in red.

### Hard constraints

**Shape A:**
- Mismatched column counts → reject.
- Unquoted CSV with comma/quote/newline in field → reject.

**Shape B:**
- Top-level not an array → reject.
- Inconsistent keys → reject.

**Shape C:**
- `kind` not `"spreadsheet/v1"` → reject.
- Cell with both `value` and `formula` → reject.
- Formula referencing undefined cell or sheet → error.
- Circular formula refs → error.
- Sheet name with forbidden chars or > 31 chars → reject.
- Cell style name typo (`"heading"`, `"inputs"`, `"bold"` — only the 6 valid names accepted).
- Invalid A1 refs (`"1A"`, `"A"`, `"0"`, lowercase `"a1"`).
- Cap violations (sheets / cells / formulas / named ranges).

### Soft warnings

- > 100 rows in flat data (no pagination yet)
- > 10 columns in flat data (hard to read)
- Currency or thousand-separator formatting in CSV/JSON-array shape (recommend the spec)
- Mixed date formats in one column

### Anti-patterns ❌

**Shapes A/B:**
- ❌ Mismatched column counts
- ❌ Unquoted CSV with special chars in field
- ❌ Currency symbols `$1,234` in flat data — use Shape C instead
- ❌ Mixed date formats
- ❌ JSON top-level object (must be array)
- ❌ JSON inconsistent keys
- ❌ > 100 rows

**Shape C:**
- ❌ `"kind": "spreadsheet/v2"` (only v1)
- ❌ Cell with both `value` and `formula`
- ❌ Bare English in formula (`=B2 kali growth` — use `*`)
- ❌ Hardcoding computed values (trust the evaluator)
- ❌ Cell style name typos
- ❌ Invalid A1 refs
- ❌ Using Shape C for flat tabular data (prefer A/B)

**Universal:**
- ❌ Truncation markers (`...more rows...`, `/* remaining cells */`)

### Pre-injected dependencies

- `@tanstack/react-table` (flat data renderer)
- `fast-formula-parser@1.0.19` MIT (AST + DepParser)
- `@formulajs/formulajs@4.6.0` MIT (~500 Excel functions)
- `exceljs@4.4.0` MIT (XLSX export)

All formula/XLSX deps are **lazy-loaded** — zero main bundle cost until the user opens a spec artifact.

### Render pipeline

Detect content shape by peeking first non-whitespace char:
- `{` + has `kind` field → spec → lazy-load `SpecWorkbookView` + lazy-load `evaluateWorkbook`
- `[` → JSON array → TanStack Table
- else → CSV → custom parser → TanStack Table

### Sandbox / security

- No iframe.
- Formula evaluator runs main-thread (synchronous Kahn's sort + parser); evaluator is a pure function with no DOM/network access.

### Download

- **Shape A/B:** `.csv` (single button; flattens active sheet for spec).
- **Shape C (spec):** dual-button toolbar — `.csv` (active sheet flattened) + `.xlsx` (full workbook with formulas + cached values + styles + named ranges + frozen panes + merges).

---

## 9. `text/latex` — LaTeX / Math

**Identity**

| | |
|---|---|
| Type | `text/latex` |
| Label / Short label | "LaTeX / Math" / "LaTeX" |
| Extension | `.tex` |
| Code tab | ✓ |
| Color | rose-500 |

### When to use

- Pure mathematical proofs / derivations.
- Equation reference sheets.
- Math-heavy technical documents.

vs `text/markdown`: markdown can do inline `$x$` math; LaTeX for documents where math is the primary content.
vs `text/document`: documents render math as text only — use LaTeX for math-heavy authoring.

### Content shape

LaTeX subset compatible with KaTeX. The custom parser handles document structure; KaTeX handles math.

### Capabilities

**Document commands:**

| Command | Renders as |
|---|---|
| `\section{...}` / `\section*{...}` | `<h2>` (numbered/unnumbered) |
| `\subsection{...}` | `<h3>` |
| `\subsubsection{...}` | `<h4>` |
| `\paragraph{...}` | bold inline lead-in |
| `\begin{itemize} \item ... \end{itemize}` | `<ul>` |
| `\begin{enumerate} \item ... \end{enumerate}` | `<ol>` |
| `\begin{quote} ... \end{quote}` | `<blockquote>` |
| `\begin{abstract} ... \end{abstract}` | `<blockquote>` |
| `\textbf{...}` | bold |
| `\textit{...}` / `\emph{...}` | italic |
| `\underline{...}` | underline |
| `\texttt{...}` | inline code (monospace + bg) |
| `\href{url}{text}` | link |

**Math environments** (KaTeX):
- `equation` / `equation*` — single equation
- `align` / `align*` — multi-line aligned
- `gather` / `gather*` — centered multi-line
- `multline` / `multline*` — long single equation across lines
- `cases` — piecewise definitions
- `eqnarray` — supported
- Inside math: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `array`

**KaTeX symbols:**
- Greek: lowercase `\alpha`–`\omega`, uppercase `\Gamma`–`\Omega`
- Operators: `\sum`, `\prod`, `\int`, `\partial`, `\nabla`, `\lim`, `\sup`, `\inf`
- Relations: `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\in`, `\forall`, `\exists`
- Logic / arrows: `\land`, `\lor`, `\lnot`, `\implies`, `\iff`, `\to`, `\rightarrow`, `\leftarrow`, `\Rightarrow`
- Decorations: `\hat{x}`, `\bar{x}`, `\vec{x}`, `\dot{x}`, `\ddot{x}`, `\tilde{x}`, `\overline{...}`, `\overrightarrow{AB}`
- Sets: `\mathbb{R}`, `\mathbb{Z}`, `\mathbb{N}`, `\mathbb{C}`, `\mathbb{Q}`, `\emptyset`
- Fractions / roots: `\sqrt{x}`, `\sqrt[n]{x}`, `\frac{a}{b}`, `\dfrac{a}{b}`, `\binom{n}{k}`

**Spacing primitives:** `~` (nbsp), `\,` (thin), `\;` (en), `\quad` (em), `\qquad`, `---` (mdash), `--` (ndash).

### Hard constraints

- `\documentclass{...}` → reject.
- `\usepackage{...}` → reject.
- `\begin{document}` / `\end{document}` → reject (use the wrapper-stripped subset).
- `\includegraphics{...}` → reject.
- `\bibliography{...}` → reject.
- `\begin{tikzpicture}` → reject (not supported).
- `\begin{verbatim}` / `\verb` → reject (use `\texttt{...}`).

### Soft warnings

- No math delimiter detected anywhere (recommend markdown for non-math content).

### Anti-patterns ❌

- ❌ `\maketitle`, `\label`, `\ref`, `\eqref` — cross-refs not resolved
- ❌ `\input{...}`, `\include{...}` — no file system
- ❌ `\begin{figure}` — no image inclusion
- ❌ Multiple separate `$$...$$` for derivations (use `align` instead)
- ❌ Bare English inside `$...$` (wrap in `\text{...}`)

### Pre-injected dependencies

- KaTeX v0.16+ (`katex` npm package + `katex/dist/katex.min.css`)

### Render pipeline

A custom parser, NOT a full LaTeX engine:

1. Extract document body (`\begin{document}...\end{document}` if present).
2. Extract preamble (`\title`, `\author`, `\date`).
3. Strip `\maketitle`.
4. Line-by-line walk with state tracking (`inList`, `listType`):
   - Empty lines → skip
   - Sectioning → balanced-brace `readBracedArg` → `<h2>`/`<h3>`/`<h4>`
   - List environments → `<ul>` / `<ol>` open/close + `<li>` per `\item`
   - Math environments (`equation`, `align`, `gather`, `multline`, `cases`, `eqnarray`) → multi-line collect → KaTeX displayMode render
   - `\[...\]` and `$$...$$` → display math
   - `\begin{quote}` / `\begin{abstract}` → `<blockquote>`
   - Other paragraph text → collect consecutive lines → `processInlineLatex` (handles `$...$` inline math + text commands like `\textbf`/`\textit`/`\href`)
5. `dangerouslySetInnerHTML` (no iframe).

**Key parsing trick:** every command-arg parser uses brace-depth tracking, never naive `[^}]*` regex. Handles `\section{$f(x)$}` correctly.

### Sandbox / security

- No iframe.
- KaTeX with `trust: true` (KaTeX itself filters dangerous commands).
- HTML-escape applied to fallback code blocks and link URLs.

### Download

`.tex`, wrapped in a minimal compilable preamble (`\documentclass{article}`, `\begin{document}` / `\end{document}`).

---

## 10. `application/slides` — Slides (Presentation Deck)

**Identity**

| | |
|---|---|
| Type | `application/slides` |
| Label / Short label | "Slides" / "Slides" |
| Extension | `.pptx` |
| Code tab | ✓ |
| Color | indigo-500 |

### When to use

- Pitch decks, board presentations, product launches.
- Quarterly reviews, technical walkthroughs.
- Anything told as a sequence of focal slides.

vs `text/document`: documents are continuous prose; slides are discrete visuals.
vs `application/react`: slides have rigid layout grammar (17 layouts) and a real PPTX export; React for custom interactive UI.

### Content shape

JSON only. No markdown fences. No commentary.

```json
{
  "theme": { "primaryColor": "#0F172A", "secondaryColor": "#3B82F6", "fontFamily": "Inter, sans-serif" },
  "slides": [
    { "layout": "title", "title": "...", "subtitle": "..." },
    { "layout": "content", "title": "...", "bullets": [...] },
    ...
  ]
}
```

### Theme

| Field | Required | Notes |
|---|:-:|---|
| `primaryColor` | ✓ | **Dark and desaturated** — approved: `#0F172A`, `#1E293B`, `#0C1222`, `#042F2E`, `#1C1917`, `#1A1A2E`. Never bright/white. |
| `secondaryColor` | ✓ | Vivid accent — approved: `#3B82F6`, `#06B6D4`, `#10B981`, `#F59E0B`, `#8B5CF6`, `#EC4899` |
| `fontFamily` | ✓ | Default `"Inter, sans-serif"` |

### 17 layouts

**Text layouts (6):**

1. **title** — opening (dark gradient, white, centered). Required: `title`, `subtitle`.
2. **content** — workhorse (white bg, accent title bar). One of `bullets` (≤ 6, ≤ 10 words each) or `content`.
3. **two-column** — comparison. `leftColumn` (≤ 5 items) + balanced `rightColumn`.
4. **section** — chapter divider (dark gradient).
5. **quote** — testimonial. `quote` 5–25 words, optional `attribution`, `quoteImage` (URL or `unsplash:`), `quoteStyle: "minimal" | "large" | "card"`.
6. **closing** — final slide (dark gradient, CTA).

**Visual layouts (11):**

7. **diagram** — full-slide mermaid (≤ 15 nodes).
8. **image** — full-slide image with optional caption. `imageUrl` URL or `unsplash:`.
9. **chart** — full-slide ChartData.
10. **diagram-content** — diagram left, text/bullets right (≤ 10 nodes for split).
11. **image-content** — image left, text/bullets right.
12. **chart-content** — chart left, text/bullets right.
13. **hero** — full-bleed background + text overlay. `backgroundImage` (URL or `unsplash:`), `overlay: "dark" | "light" | "none"`.
14. **stats** — 2–4 KPI numbers. Each `{ value, label, trend?: "up"|"down"|"neutral", change? }`.
15. **gallery** — 4–12 image grid, 2–6 columns. Each `{ imageUrl, caption? }`.
16. **comparison** — feature table. `comparisonHeaders` + `comparisonRows[].values` (true→✓, false→✗, or string).
17. **features** — icon grid 3–6 items, 2–4 columns. Each `{ icon: "lucide-name", title, description? }`.

### Inline icons

In any text field: `{icon:icon-name}` (kebab-case Lucide names). Examples: `{icon:check}`, `{icon:rocket}`, `{icon:dollar-sign}`, `{icon:trending-up}`, `{icon:users}`, `{icon:building}`, `{icon:lock}`. Renders inline 1em SVG in HTML preview, **stripped from PPTX** (PowerPoint doesn't support inline SVG).

### Mermaid in slides

Same 14+ diagram types as `application/mermaid`. Max 15 nodes for full-slide, 10 for split layout. **No** `%%{init}%%` directives (renderer handles theming).

### Chart types

| Type | Data shape |
|---|---|
| `bar` | `data: [{ label, value, color? }]` |
| `bar-horizontal` | same as `bar` |
| `line` | `{ labels: [...], series: [{ name, values: [...], color? }] }` |
| `pie` | `data: [{ label, value, color? }]` |
| `donut` | same as `pie` (renders with inner radius) |

### Unsplash slots

Fields that accept `unsplash:keyword`:
- `imageUrl` (image / image-content layouts)
- `backgroundImage` (hero layout)
- `quoteImage` (quote layout avatar)
- `gallery[].imageUrl`

Resolved server-side at create/update time, cached 30 days.

### Capabilities

- 17 distinct layouts with per-layout required+optional fields.
- Inline mermaid (rendered client-side by mermaid.js inside the iframe).
- D3-based charts (rendered as inline SVG in preview, rasterized to PNG for PPTX).
- Inline Lucide icons via `{icon:name}` (preview only).
- Arrow-key navigation in the panel.
- Slide dot indicators (when 1 < slide count ≤ 20).
- Real `.pptx` export with all assets embedded.

### Hard constraints

- Anything outside `{...}` or wrapped in markdown fences → reject.
- `image-text` layout (deprecated) → reject.
- Bright `primaryColor` → soft-warn (validator; prompt rejects).
- Missing `subtitle` on title slide → soft-warn.
- < 7 or > 12 slides → soft-warn.
- First slide not `title` or last not `closing` → soft-warn.
- Per-layout required field missing (e.g. `chart` without `chart` object) → reject.
- Markdown syntax in text fields → soft-warn.
- 512 KB cap.

### Soft warnings

- All deck-level conventions above.
- Same layout for every slide (≤ 5 slides with only 1–2 distinct layouts).
- Per-layout content quality (bullets > 6, words > 10/bullet, deprecated layouts).

### Anti-patterns ❌

- ❌ Output anything outside `{...}` or wrap in markdown fences
- ❌ Use deprecated `image-text` layout (no image support)
- ❌ Bright `primaryColor` (unreadable on title slides)
- ❌ Missing `subtitle` on title slide
- ❌ First slide not `title` or last not `closing`
- ❌ Fewer than 7 or more than 12 slides
- ❌ Same layout for every slide
- ❌ Markdown syntax in text fields (`**bold**`, `## heading`, backticks)
- ❌ Truncation (`"... etc"`)

### Pre-injected dependencies

- `pptxgenjs@4.0.1` (PPTX builder)
- mermaid v11
- D3-based `chartToSvg`
- ~100 Lucide icon SVGs bundled inline (for `{icon:name}` shorthand)

### Render pipeline (preview)

1. JSON parse; if not valid JSON or missing slides, fall back to `parseLegacyMarkdown` (splits on `\n---\n`).
2. `slidesToHtml(presentation)` builds a full HTML document (~1325 lines of HTML+CSS+JS template) with one slide container per slide.
3. Iframe with `srcDoc` + sandbox `allow-scripts allow-same-origin` (same-origin needed for postMessage).
4. Iframe runs `mermaid.initialize()` + `mermaid.run()` to render embedded mermaid blocks.
5. Charts embedded as inline SVG strings (from server-side `chartToSvg`).
6. Parent ↔ iframe via postMessage: `{ type: "slideChange", current, total }` from iframe; `{ type: "navigate", direction | index }` from parent.
7. Keyboard navigation (arrow keys) preventDefault'd on parent to avoid page scroll.

### Render pipeline (PPTX export)

`generatePptx(data): Promise<Blob>` using pptxgenjs with `LAYOUT_WIDE` (13.333"×7.5"):

- **title / section / closing**: dark backgrounds, accent line, centered text.
- **content**: white bg, theme title bar, bullets/body, slide number footer.
- **two-column**: vertical divider at center, left/right bullets.
- **quote**: decorative quote mark (Georgia 80–120pt), italic text, optional avatar fetch.
- **diagram**: async — `mermaidToBase64Png()` (client-side render at 2× resolution) → embed as PNG.
- **chart**: async — `chartToSvg()` → `svgToBase64Png()` → embed as PNG. **No native PPTX charts.**
- **image / hero**: async — `fetchImageAsBase64()` (with `unsplash:` rewrite to `source.unsplash.com`) → embed as PNG.
- **gallery**: async multi-image grid, auto-columns by item count.
- **comparison**: PptxGenJS table with check/cross marks for booleans.
- **features**: icon grid using bundled Lucide SVG paths.
- **stats**: KPI numbers in grid, trend indicators (↑↓→).

`cleanPptx()` strips markdown + inline icons (`{icon:name}`) before rendering — PowerPoint doesn't render those.

### Sandbox / security

- Preview iframe: `allow-scripts allow-same-origin` (no navigation blocking — slides are LLM-trusted content).
- PPTX export runs client-side (no network trip).

### Download

`.pptx` — full deck with all assets embedded as PNG.

---

## 11. `application/python` — Python Script (executable)

**Identity**

| | |
|---|---|
| Type | `application/python` |
| Label / Short label | "Python Script" / "Python" |
| Extension | `.py` |
| Code tab | ✓ |
| Color | yellow-500 |

### When to use

- Computation, data analysis, math experiments.
- Visualizations via matplotlib (line, bar, scatter, etc.).
- Anything that benefits from running Python *in the browser* with the result visible.

vs `application/code` (with language=python): code is display-only; `application/python` is **executable** with output capture.

### Content shape

Python 3.12 source. Must produce visible output (`print` or `plt.show`).

### Capabilities

**Pre-loaded packages** (no `micropip` install needed):
- `numpy`
- `matplotlib` (in Agg mode — non-interactive, with `plt.show()` capture)
- `pandas`
- `scipy`
- `sympy`
- `networkx`
- `scikit-learn` (as `sklearn`)
- `pillow` (as `PIL`)
- `pytz`
- `python-dateutil` (as `dateutil`)
- `regex`
- `beautifulsoup4` (as `bs4`)
- `lxml`
- `pyyaml` (as `yaml`)

Plus full standard library: `math`, `statistics`, `random`, `itertools`, `functools`, `collections`, `json`, `re`, `datetime`, `decimal`, `dataclasses`, `enum`, etc.

**Output capture:**
- `print()` → stdout, streamed to UI.
- `sys.stderr.write()` / errors → stderr, prefixed `[stderr]` in UI.
- `plt.show()` → captured to base64 PNG (matplotlib `Agg` backend; `plt.show` monkey-patched to `plt.savefig(BytesIO, format="png", bbox_inches="tight", dpi=150)`); rendered as `<img>` below the output panel.

**Mock-data conventions:**
- Seed RNGs: `rng = np.random.default_rng(42)`.
- Realistic sizes: ≤ 10,000 elements (browser Python ~3–10× slower than native).
- Realistic values: monthly revenue in dollars, not `[1, 2, 3, 4, 5]`.

### Hard constraints

- Markdown fence wrapper → reject.
- Imports of unavailable packages (`requests`, `urllib3`, `httpx`, `flask`, `django`, `fastapi`, `sqlalchemy`, `selenium`, `tensorflow`, `torch`, `keras`, `transformers`, `opencv-python`, `pyarrow`, `polars`) → reject.
- `input()` → reject (no stdin).
- `open(write)` → reject (no persistent FS).

### Soft warnings

- No visible output (no `print`, no `plt.show`).
- `time.sleep > 2s`.
- `while True:` without `break`.
- No type hints (prompt strongly recommends them).
- Bare `except:` (catch specific).

### Anti-patterns ❌

- ❌ Importing unavailable packages (will crash)
- ❌ `input()` / `sys.stdin` / file I/O / network requests
- ❌ `threading.Thread`, `asyncio.run` with real I/O
- ❌ Bare `except:`
- ❌ `plt.savefig()` (use `plt.show()` instead — only that is captured)
- ❌ Multi-part plots without `plt.figure()` per plot

### Pre-injected dependencies

- Pyodide v0.27.6 from CDN (`pyodide.js`)

### Render pipeline

1. **Web Worker** created from blob URL on first run.
2. Worker initialization:
   - `importScripts(PYODIDE_CDN + "pyodide.js")`
   - `pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })`
   - `pyodide.loadPackage(["numpy", "micropip", "matplotlib", "scikit-learn"])`
   - Install matplotlib interceptor: `matplotlib.use('Agg')`, monkey-patch `plt.show` to write PNG bytes into a global `__plot_images__` list.
3. **Each run:**
   - Reset: `__plot_images__ = []`.
   - Capture stdout/stderr: `py.setStdout({ batched: text => postMessage({ type: "stdout", text }) })`, same for stderr.
   - `py.runPythonAsync(userCode)`.
   - After run: read `__plot_images__`, postMessage each base64 PNG.
4. **Worker reused** across multiple Run clicks; **terminated** on component unmount.

### Sandbox / security

- Python runs in Web Worker (off main thread, no DOM access).
- Pyodide isolates Python from JS globals (only stdout/stderr/plot capture cross the boundary).
- No file system access; no real network requests.

### Download

`.py`.

---

## 12. `application/3d` — 3D Scene (R3F)

**Identity**

| | |
|---|---|
| Type | `application/3d` |
| Label / Short label | "3D Scene" / "3D" |
| Extension | `.tsx` |
| Code tab | ✓ |
| Color | pink-500 |

### When to use

- 3D scenes: product showcase, spatial data viz, game-like environments.
- Loading and animating glTF models.
- Demonstrations of materials, lighting, particle effects.

### Content shape

A single React Three Fiber component. The wrapper provides Canvas + lighting + Environment + OrbitControls — the LLM must NOT include them. The user component returns `<group>`, `<mesh>`, or a Fragment.

### Capabilities

**Pre-injected at runtime:**

| Library | Symbol | Version |
|---|---|---|
| React 18 | `React` + all hooks | 18.3.1 |
| Three.js | `THREE` namespace | 0.170.0 |
| @react-three/fiber | `useFrame`, `useThree` | 8.17.10 |
| @react-three/drei | 20 helpers (see below) | 9.117.0 |
| Babel | JSX + TypeScript transpiled | 7.26.10 |

**Wrapper-provided (do NOT include):**
- `<Canvas camera={{ position: [0, 2, 5], fov: 60 }}>`
- `<ambientLight intensity={0.5} />`
- `<directionalLight position={[5, 5, 5]} intensity={1} />`
- `<Environment preset="city" />`
- `<OrbitControls makeDefault dampingFactor={0.05} />`
- `<Suspense>` wrapper
- Background: dark `#0a0a0f`

**The 20 drei helpers available:**
`useGLTF`, `useAnimations`, `Clone`, `Float`, `Sparkles`, `Stars`, `Text`, `Center`, `Billboard`, `Grid`, `Html`, `Line`, `Trail`, `Sphere`, `RoundedBox`, `MeshDistortMaterial`, `MeshWobbleMaterial`, `MeshTransmissionMaterial`, `GradientTexture`.

**Drei NOT available (will crash):**
`OrbitControls`, `Environment`, `PerspectiveCamera`, `Sky`, `Cloud`, `Bounds`, `PivotControls`, `TransformControls`, `Reflector`, `ContactShadows`, `AccumulativeShadows`, `RandomizedLight`, `Decal`, `useTexture`, `useProgress`, `Preload`, `Leva`.

### Verified glTF model CDNs

**KhronosGroup** (preferred, reliable):

```
https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb
```

Models: Fox (animated, scale 0.02), Duck (scale 1), DamagedHelmet, Avocado (scale ~20), BrainStem, CesiumMan, CesiumMilkTruck, Lantern, ToyCar, BoomBox, WaterBottle, AntiqueCamera, BarramundiFish, CarConcept, DragonAttenuation, MaterialsVariantsShoe, ABeautifulGame, ChronographWatch, CommercialRefrigerator, SheenChair.

**three.js examples** (animated birds + characters):

```
https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb
```

Models: Parrot, Flamingo, Stork (animated birds), Soldier, Xbot, LittlestTokyo (large city scene).

### Animation patterns (from prompt)

- **Rotation**: `useFrame((_, delta) => { ref.current.rotation.y += delta * 0.5 })` — always use `delta` for frame-rate independence.
- **Float effect**: `<Float speed={1.5} floatIntensity={2}>...</Float>`
- **Scale pulse**: `ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime) * 0.1)`
- **Orbit**: `ref.current.position.set(Math.cos(t) * r, 0, Math.sin(t) * r)` where `t = state.clock.elapsedTime`
- **NEVER** allocate objects inside `useFrame` (memory leak).

### Hard constraints

- `<Canvas>` inside the user code → reject (wrapper provides).
- `<OrbitControls>` inside → reject.
- `<Environment>` inside → reject.
- `document.querySelector` / `getElementById` → reject (use `useRef`).
- `requestAnimationFrame` → reject (use `useFrame`).
- `new THREE.WebGLRenderer()` → reject (Canvas handles it).
- Missing `export default` → reject.

### Soft warnings

- Imports outside the ~40-symbol R3F whitelist (will be stripped).
- Building real-world objects from primitive boxes/spheres — recommend glTF models.
- Model URLs not from verified CDNs.

### Anti-patterns ❌

- ❌ `<Canvas>` / `<OrbitControls>` / `<Environment>` (wrapper)
- ❌ `import` statements (stripped by sanitizer; deps injected as globals)
- ❌ `requestAnimationFrame`
- ❌ `document.querySelector` / `getElementById`
- ❌ `new THREE.WebGLRenderer`
- ❌ Allocating objects inside `useFrame`
- ❌ Building from primitives instead of using glTF models
- ❌ Model URLs not from verified CDNs
- ❌ Wrapping output in markdown fences
- ❌ Truncation

### Scale conventions

- 1 unit ≈ 1 meter.
- Keep objects in 0.5–5 range (camera at `[0, 2, 5]`).
- Place objects near origin (OrbitControls targets `[0, 0, 0]`).
- KhronosGroup model scales vary: Fox `0.02`, Avocado `~20`, most others `1–3`.

### Pre-injected dependencies

See "Capabilities" above.

### Render pipeline

Babel-transpiled component, mounted inside the wrapper Canvas. Sandboxed iframe similar to React.

### Sandbox / security

- Iframe `allow-scripts`.
- Same navigation blocker as React.

### Download

`.tsx`.

---

## Decision boundaries summary

| User wants… | Pick |
|---|---|
| Read it once on a screen | `text/markdown` |
| Print, sign, send, archive | `text/document` |
| Click, type, compute (browser-native) | `text/html` |
| Stateful UI with charts/animations | `application/react` |
| Pure mathematical proof / equation reference | `text/latex` |
| A presentation deck | `application/slides` |
| A flowchart / diagram | `application/mermaid` (standalone) or embed in `text/document` / `text/markdown` / `application/slides` |
| An icon / illustration / logo | `image/svg+xml` |
| A 3D scene | `application/3d` |
| Display source code (no execution) | `application/code` |
| Run Python (with output capture) | `application/python` |
| Flat tabular data with sort/filter | `application/sheet` (CSV or JSON-array shape) |
| Multi-sheet workbook with formulas / XLSX export | `application/sheet` (`spreadsheet/v1` shape) |

---

## See also

- [artifacts-deepscan.md](./artifacts-deepscan.md) — system architecture and end-to-end flows
- [architecture-reference.md](./architecture-reference.md) — file:line audit and dependency matrix
