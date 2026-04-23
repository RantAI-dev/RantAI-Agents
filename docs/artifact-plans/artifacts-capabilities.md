# Kapabilitas Artifact — Deep Scan Detail

**Tanggal:** April 2026
**Sumber:** Scan lengkap prompt rules, renderer implementations, dan validator di `/src/lib/prompts/artifacts/` dan `/src/features/conversations/components/chat/artifacts/renderers/`

---

## TL;DR — Matrix Kapabilitas

| Fitur | HTML | React | SVG | Mermaid | Code | Python | Sheet | Markdown | Document | LaTeX | Slides | R3F |
|-------|:----:|:-----:|:---:|:-------:|:----:|:------:|:-----:|:--------:|:--------:|:-----:|:------:|:---:|
| **Unsplash images** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| **External images** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| **Inline SVG** | ✓ | ✓ | – | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Recharts** | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| **Mermaid diagrams** | ✗ | ✗ | ✗ | – | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ |
| **Mermaid charts** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| **Chart fence (D3)** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **Framer Motion** | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Lucide icons** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| **Tailwind CSS** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Interactive forms** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Sort + filter** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Matplotlib plots** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **KaTeX math** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| **YAML frontmatter** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **DOCX export** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **WYSIWYG preview** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **3D models (glTF)** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## 1. HTML Artifact — `text/html`

**Label:** HTML Page
**Ringkasan:** Self-contained interactive HTML pages dengan Tailwind CSS v3 dan JS interactivity, di-render dalam sandboxed iframe.

### Kapabilitas Inti

**Runtime:**
- Tailwind CSS v3 — auto-injected dari CDN (`https://cdn.tailwindcss.com`)
- Inter font — HARUS include manual: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">`
- Sandbox: `allow-scripts allow-modals` only — NO `location.*`, NO `history.*`, NO real form POST
- `localStorage` works — untuk user preferences
- No external network (except Google Fonts dan Tailwind CDN)

**Unsplash Image Integration** ⭐ (CORE FEATURE)
- **Syntax:** `<img src="unsplash:keyword phrase" alt="meaningful alt text" />`
- **Contoh:**
  ```html
  <img src="unsplash:mountain sunset" alt="Scenic mountain at golden hour" />
  <img src="unsplash:coffee shop interior" alt="Warm cafe setting" />
  ```
- **Resolusi:** Server-side (file: [resolver.ts](src/lib/unsplash/resolver.ts))
  - Regex: `src=["']unsplash:([^"']+)["']/gi`
  - Extract keyword → normalize (lowercase, trim, 50 char max)
  - Search Unsplash API via [client.ts](src/lib/unsplash/client.ts)
  - **Output:** Direct URL dengan width param: `${photo.urls.regular}&w=1200`
  - **Cache:** 30 hari di Prisma `resolvedImage` table
  - **Fallback:** Jika Unsplash down → `placehold.co` dengan keyword text
- **Tipe field:** HANYA di `src` attribute — bukan CSS `background-image` atau inline styles
- **Tidak support:** Base64 data URIs, Picsum, placeholder.com (explicit anti-pattern)

**Media Support:**
- `<img>` dengan URL atau `unsplash:` protocol
- Internal SVG (`<svg>...</svg>` inline) ✓
- Video (`<video>`) — teknisnya bisa tapi unlikely, sandbox blocks navigation
- Audio (`<audio>`) — supported

**Styling & Layout:**
- Tailwind classes — utility-first, container (max-w-7xl, mx-auto)
- Custom inline `<style>` blocks — max 10 non-blank lines
- Flexbox first (primary), Grid (secondary)
- Responsive breakpoints: `sm:`, `md:`, `lg:`, `xl:` — mobile-first

**Interactivity:**
- Form dengan `onSubmit` (controlled state via vanilla JS)
- Event listeners (`addEventListener`)
- `setTimeout` / `setInterval` — short delays only
- Tab functionality dengan `role="tablist"` + `aria-selected`

### Anti-Patterns ❌
- ❌ Bare `unsplash:` di CSS `background-image` (won't resolve)
- ❌ External URLs (non-Google Fonts, non-Tailwind)
- ❌ Form dengan `action="/submit"` (sandbox blocks POST)
- ❌ `window.location = "..."` (sandbox blocks navigation)
- ❌ Truncation atau "...add more here"

---

## 2. React Artifact — `application/react`

**Label:** React Component
**Ringkasan:** Single React 18 component, transpiled by Babel, rendered di iframe dengan pre-injected globals.

### Runtime Environment

**Pre-destructured React APIs** (available langsung, no import needed):
```jsx
const {
  useState, useEffect, useRef, useMemo, useCallback, useReducer,
  useContext, useId, useTransition, useDeferredValue, useLayoutEffect,
  useSyncExternalStore, useInsertionEffect, createContext, forwardRef,
  memo, Fragment, Suspense, lazy, startTransition, createElement,
  isValidElement, Children, cloneElement
} = React;
```

**Global Libraries — window.global syntax:**

| Library | Symbol | Version | Usage | Notes |
|---------|--------|---------|-------|-------|
| **Recharts** | `Recharts` | 2 | `<Recharts.LineChart>`, `<Recharts.BarChart>`, `<Recharts.PieChart>`, `<Recharts.AreaChart>`, `<Recharts.ResponsiveContainer>`, `<Recharts.Tooltip>` | Charts ONLY — no other chart libs |
| **Lucide React** | `LucideReact` | 0.454 | `<LucideReact.ArrowRight>`, `<LucideReact.Check>` (icon names PascalCase) | Icons as React components |
| **Framer Motion** | `Motion` | 11 | `Motion.motion.div`, `Motion.AnimatePresence` | Animations & transitions |
| **Tailwind CSS** | – | v3 CDN | Classes (`.bg-slate-50`, `.text-indigo-600`) | Styling |

**Chart Types via Recharts:**
- `<LineChart>` — line graphs with optional area fill
- `<BarChart>` — vertical bars (also `<BarChart layout="vertical">` for horizontal)
- `<PieChart>` — pie charts
- `<AreaChart>` — stacked area charts
- Components: `<XAxis>`, `<YAxis>`, `<CartesianGrid>`, `<Legend>`, `<Tooltip>`, `<ResponsiveContainer>`

**Sandbox:** `allow-scripts` only
- NO real form POST
- NO `window.open()`
- NO `location.href = "..."`
- All forms use `onSubmit` + `e.preventDefault()`

### Anti-Patterns ❌
- ❌ `import { Card } from 'shadcn/ui'` (NOT available — build from Tailwind)
- ❌ `import './styles.css'` (silently dropped)
- ❌ Class components (`class X extends React.Component`)
- ❌ `document.getElementById()` / `document.querySelector()` (use `useRef`)
- ❌ Real `fetch()` calls (mock data only)
- ❌ Truncation (no `/* ...rest of component */`)

---

## 3. SVG Artifact — `image/svg+xml`

**Label:** SVG Graphic
**Ringkasan:** Static inline SVG graphics (icons, illustrations, logos, diagrams), sanitized oleh DOMPurify (no script/style/foreignObject).

### Rendering Context
- **Inline** (not iframed) — di-sanitize dengan DOMPurify
- **Container scale:** responsive (`max-width: 100%; height: auto`)
- **viewBox:** REQUIRED — hardcoded `width`/`height` akan break responsive scaling

### Supported Elements
- Shapes: `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>`
- Text: `<text>` (native SVG, bukan outlined paths kecuali diminta)
- Groups & defs: `<g>`, `<defs>`, `<linearGradient>`, `<radialGradient>`, `<pattern>`, `<use>`
- Animation: **SMIL only** (`<animate>`, `<animateTransform>`) — prefer static unless explicitly requested

### NOT Supported ❌
- `<script>` — stripped
- `<style>` blocks — stripped (leak ke host page karena inline rendering)
- `<foreignObject>` — stripped
- External `href` / `xlink:href` (http, https, data: URIs) — only same-doc `#fragment` refs
- Event handlers (`onclick`, `onload`) — stripped
- Precision beyond 1 decimal place di path coordinates

### Styling
- **SVG presentation attributes:** `fill`, `stroke`, `stroke-width`, `opacity`, `transform`
- **Tidak:** inline `style="..."` atau `<style>` blocks
- **currentColor:** untuk icons (inherit dari parent text color)
- **Max 5 colors** per SVG (decorative patterns max 3)

### Style Categories

**Icon** (default untuk "icon", "glyph", "symbol"):
- `viewBox="0 0 24 24"`
- `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- ≤ 16 visible units; nothing smaller than 2px at source

**Illustration** ("illustration", "empty state", "scene"):
- `viewBox="0 0 400 300"` atau proportional rectangle
- 3–5 colors
- Mostly filled shapes
- Group dengan `<g id="...">`, include `<desc>` describing scene

**Logo / Badge:**
- Square `viewBox="0 0 200 200"` untuk emblems, atau rectangular `viewBox="0 0 240 80"` untuk wordmarks
- ≤ 3 colors
- Bold filled shapes
- `<text>` untuk letterforms (unless explicitly path-outlined)

**Diagram** (non-flowchart — flowcharts use Mermaid):
- Proportional viewBox
- 2–4 colors
- Consistent stroke widths, corner radii
- `<text>` dengan `text-anchor="middle"`, `dominant-baseline="middle"`

---

## 4. Mermaid Artifact — `application/mermaid`

**Label:** Mermaid Diagram
**Ringkasan:** Raw Mermaid syntax → SVG, rendered dalam themed scrollable container. Mendukung flowcharts, sequence, ER, state, class, Gantt, pie, quadrant, xychart, sankey, timeline, gitgraph, mindmap, journey, dan lainnya.

### Configuration
- **Library:** Mermaid v11.x
- **Theme:** `dark` atau `default` — set otomatis berdasarkan app theme, **JANGAN override** dengan `%%{init: {'theme':'...'}}%%` directives
- **Security level:** `strict` — click directives blocked
- **Output:** Raw Mermaid syntax ONLY (no markdown fences)

### Diagram Types — Lengkap

| User wants... | Type | Declaration | Max nodes |
|---|---|---|---|
| Process, workflow, decision tree, algorithm, pipeline, org chart | **flowchart** | `flowchart TD` atau `LR` | 15 |
| API call, request/response, protocol, OAuth, webhook | **sequenceDiagram** | `sequenceDiagram` | 15 |
| Database schema, data model, tables, entities, relationships | **erDiagram** | `erDiagram` | 15 |
| Lifecycle, status transitions, state machine, order states | **stateDiagram-v2** | `stateDiagram-v2` | 15 |
| Class hierarchy, OOP, inheritance, interface, code-level domain | **classDiagram** | `classDiagram` | 15 |
| Timeline, project schedule, roadmap, phases, sprint plan | **gantt** | `gantt` | 15 |
| Brainstorm, concept map, idea hierarchy | **mindmap** | `mindmap` | 15 |
| Git branching / release flow | **gitGraph** | `gitGraph` | 15 |
| Distribution, percentage breakdown | **pie** | `pie` | 8 |
| User journey / experience map | **journey** | `journey` | 15 |
| 2×2 priority / effort-impact matrix | **quadrantChart** | `quadrantChart` | – |
| **BONUS:** Timeline events | **timeline** | `timeline` | – |
| **BONUS:** Flow / Sankey diagram | **sankey-beta** | `sankey-beta` | – |
| **BONUS:** XY scatter / bubble chart | **xychart-beta** | `xychart-beta` | – |

**Chart Types di Mermaid:**
- Mermaid v11 mendukung **pie**, **xychart-beta** (scatter/bubble), **sankey-beta** (flow), **timeline**
- Bukan "charts" dalam konteks Recharts — ini adalah diagram types native Mermaid
- **Penggunaan:** User minta "chart" → consider Recharts (React) atau chart via Slides layout, bukan Mermaid pie

### Readability Rules
- ≤ 15 nodes/participants/entities
- Labels: ≤ 5 words, Title Case
- Direction: `TD` (top-down) untuk hierarchies; `LR` (left-right) untuk sequential flows
- Subgraphs: max 2 levels deep
- Edge labels: short verb phrases

### Styling Restrictions
- **NO theme override** — `%%{init: {'theme':'...'}}%%` breaks dark mode
- `classDef` sparingly — max 3 highlight colors
- NO `linkStyle` (brittle)
- Renderer handles dark/light sync automatically

### Anti-Patterns ❌
- ❌ Markdown fences di output (raw Mermaid only)
- ❌ Missing diagram type declaration on line 1
- ❌ More than 15 nodes
- ❌ Labels > 5 words
- ❌ Nested subgraphs > 2 levels
- ❌ `click NodeId call fn()` atau `click NodeId href "..."` (blocked by `securityLevel: strict`)
- ❌ Mixed syntax (e.g. `->>\` di flowchart)

---

## 5. Code Artifact — `application/code`

**Label:** Code (Display-only)
**Ringkasan:** Source code files dengan syntax highlighting via Shiki, copy button, download button. NO execution.

### Language Support (Shiki)
**REQUIRED parameter:** `language` (lowercase, canonical name)

Common: `typescript`, `tsx`, `javascript`, `jsx`, `python`, `rust`, `go`, `java`, `csharp`, `cpp`, `c`, `ruby`, `php`, `swift`, `kotlin`, `sql`, `bash`, `shell`, `yaml`, `json`, `toml`, `dockerfile`, `html`, `css`, `scss`, `markdown`

### Code Quality — STRICT
- **NEVER truncate.** No `// ...rest`, no `...`, no TODOs
- **NEVER use placeholders.** No `pass`, `throw new Error("not implemented")`, `unimplemented!()`
- All imports present and correct
- All names defined (no ambient globals)
- No dead code, no commented alternatives
- Realistic sample values (not `foo`, `bar`, `example.com`)

### Per-Language Conventions
- **TypeScript:** ES modules, no `any`, JSDoc pada public functions
- **Python:** 3.10+, type hints, docstrings Google style, `if __name__ == "__main__":`
- **Rust:** `Result<T, E>`, `?` propagation, derive `Debug`
- **Go:** Check every `error`, exported names PascalCase
- **SQL:** Uppercase keywords, explicit JOINs
- **Shell:** `#!/usr/bin/env bash`, `set -euo pipefail`, quote `${var}`

---

## 6. Python Artifact — `application/python`

**Label:** Python Script (Executable)
**Ringkasan:** Executable Python 3.12 via Pyodide (WebAssembly), runs in Web Worker.

### Pre-loaded Packages (Pyodide v0.27)
**Always available (no `micropip` needed):**
- `numpy`, `matplotlib`, `pandas`, `scipy`, `sympy`, `networkx`, `scikit-learn` (as `sklearn`)
- `pillow` (as `PIL`), `pytz`, `python-dateutil` (as `dateutil`), `regex`, `beautifulsoup4` (as `bs4`), `lxml`
- `pyyaml` (as `yaml`)
- Full standard library: `math`, `statistics`, `random`, `itertools`, `functools`, `collections`, `json`, `re`, `datetime`, `decimal`, `dataclasses`, `enum`, dll.

**NOT available** (will crash):
- `requests`, `urllib3`, `httpx`, `flask`, `django`, `fastapi`, `sqlalchemy`
- `selenium`, `tensorflow`, `torch`, `keras`, `transformers`
- `opencv-python` (cv2), `pyarrow`, `polars`

### Matplotlib Best Practices
```python
import matplotlib.pyplot as plt
plt.figure(figsize=(10, 6))  # Always set size
plt.plot(...)
plt.title("Title")
plt.xlabel("X Label")
plt.ylabel("Y Label")
plt.legend()  # When multiple series
plt.tight_layout()  # Before show()
plt.show()  # This is captured + rendered
```

**NOT supported:**
- `plt.savefig()` — use `plt.show()` (renderer captures this only)
- Multi-part plots without `plt.figure()` per plot

### Code Requirements
- Every script MUST have visible output (`print()` or `plt.show()`)
- No `input()` — hard-code values
- No `open()` or file I/O
- No real network requests (HTTP)
- No `threading`, `asyncio.run` with real I/O
- Type hints on all function signatures + returns
- Docstrings (one line OK) on all functions
- No bare `except:`

### Mock Data
- Seed RNGs for reproducibility: `rng = np.random.default_rng(42)`
- Realistic sizes: ≤ 10,000 elements (browser Python ~3–10× slower than native)
- Realistic values: monthly revenue in dollars, not `[1, 2, 3, 4, 5]`

---

## 7. Sheet Artifact — `application/sheet`

**Label:** Spreadsheet (Interactive Table)
**Ringkasan:** Tabular data sebagai CSV atau JSON array → rendered sebagai interactive sortable, filterable table dengan export button.

### Input Formats — CHOOSE ONE

**Option A: CSV** (default, comma-delimited)
- Header row REQUIRED
- Quote fields containing comma/quote/newline: `"Engineer, Senior"`
- Escape literal quotes by doubling: `"She said ""hi"""`
- Every row MUST have matching column count
- No trailing comma, no BOM, UTF-8

**Option B: JSON array of objects**
- Top level: non-empty array `[{...}, {...}]`
- Every object MUST have same keys, same order
- First object's keys = column headers, in order
- NO nested objects/arrays (stringify as `[object Object]`)

### Critical Constraint: All Values → Strings
- **Sorting is lexicographic**, not numeric or date-aware
- `"10"` sorts before `"2"` (string comparison)
- `"Jan 15, 2026"` sorts before `"Mar 1, 2025"` (string order)

**Workarounds:**
- **Dates:** ISO 8601 (`YYYY-MM-DD`) — sorts correctly as string
- **Numbers:** Plain numerals (`1234.50`, no `$1,234.50`, no separators)
- **IDs:** Zero-pad if numeric order matters (`"007"`, `"008"`, `"010"`)
- **Booleans:** Consistent spelling (`true`/`false` OR `Yes`/`No`)
- **Empty:** Empty string `""` or `null` in JSON (not `N/A`, `TBD`, `-`)

### Table Capabilities
- **Sorting:** Click column header (lexicographic)
- **Filtering:** Global text filter box (substring search, case-insensitive)
- **Export:** Download button → CSV file
- **No pagination** — all rows render at once (hard cap ~100 rows for performance)

### Column Design
- Headers: Title Case, descriptive (`Full Name` not `name`)
- Order: ID → descriptive → numeric → dates → status
- **Max 10 columns** (wider becomes unreadable)
- **10–30 rows** typical, up to ~50 for large datasets

### Anti-Patterns ❌
- ❌ Mismatched column counts (rows with more/fewer fields than header)
- ❌ Unquoted CSV with comma/quote/newline in field
- ❌ Currency symbols or thousand separators (`$1,234`)
- ❌ Mixed date formats in one column
- ❌ JSON top-level that is object (not array)
- ❌ JSON objects with inconsistent keys
- ❌ More than 100 rows (performance)
- ❌ Truncation markers (`...more rows...`)

---

## 8. Markdown Artifact — `text/markdown`

**Label:** Document
**Ringkasan:** Long-form documents (READMEs, technical docs, reports, tutorials) — GitHub Flavored Markdown dengan code blocks, tables, KaTeX math, Mermaid diagrams inline.

### Supported Features
- **Code blocks:** Shiki syntax highlighting (REQUIRED language tag)
- **GFM tables:** Pipe tables for structured comparisons
- **Math:** KaTeX inline (`$...$`) dan display (`$$...$$`)
- **Mermaid diagrams:** ` ```mermaid ` fenced blocks (rendered live inline)
- **Task lists:** `- [ ]` dan `- [x]` (GFM)
- **Strikethrough:** `~~text~~`
- **Links & images:** `![alt](url)` (absolute URLs only)

### NOT Supported ❌
- Raw HTML (`<details>`, `<kbd>`, `<script>` — unreliable)
- Emoji as functional icons (use inline SVG or text)

### Document Structure
- Single `# H1` at top
- Consistent hierarchy: `##` (major), `###` (sub), `####` (sub-sub)
- Never skip levels (no `#` → `###` directly)
- Table of Contents (for 3+ major sections): anchor links
- End with Conclusion/Summary/Next Steps (for reports, tutorials)

### Content Quality
- **Substantive only** — no placeholders like `[TODO]`, `Lorem ipsum`, `...`
- **Real code examples** in fenced blocks with language tags
- **Specifics over vaguetalk** (numbers, names, versions)
- **Complete document** — no truncation, no "exercise for reader"
- Paragraphs: 2–4 sentences; break up walls of text

---

## 8b. Document Artifact — `text/document`

**Status (2026-04-23):** rebuilding for Phase 9.

The Phase 1-8 markdown-walker pipeline has been reverted in preparation for a rebuild around [Anthropic Claude's `docx` skill](https://docs.anthropic.com/) approach (LLM-authored JS code executed in a sandbox, native OMML math, full creative control over styling).

Capability matrix flags above (Unsplash images, mermaid, charts, DOCX export, WYSIWYG preview, etc.) reflect the prior pipeline. They will be re-evaluated when Phase 9 ships. Creating a new text/document artifact via the assistant currently shows a "rebuild in progress" placeholder in the preview panel.

Context: [phase-9-revert.md](phase-9-revert.md). Rebuild brief: TBD.

---

## 9. LaTeX Artifact — `text/latex`

**Label:** LaTeX / Math
**Ringkasan:** Mathematical documents dengan sections, equations, proofs — KaTeX-rendered (subset, NOT full LaTeX engine).

### Supported Document Commands
| Command | Renders as | Notes |
|---------|-----------|-------|
| `\section{...}` / `\section*{...}` | `<h2>` | Numbered / unnumbered |
| `\subsection{...}` | `<h3>` | |
| `\subsubsection{...}` | `<h4>` | |
| `\paragraph{...}` | Bold inline lead-in | |
| `\begin{itemize} \item ... \end{itemize}` | Unordered list | |
| `\begin{enumerate} \item ... \end{enumerate}` | Ordered list | |
| `\begin{quote} ... \end{quote}` | Blockquote | |
| `\begin{abstract} ... \end{abstract}` | Blockquote | |
| `\textbf{...}` | Bold | |
| `\textit{...}` / `\emph{...}` | Italic | |
| `\underline{...}` | Underline | |
| `\texttt{...}` | Inline code | |
| `\href{url}{text}` | Link | |

### Supported Math Environments
- `equation` / `equation*` — single equation
- `align` / `align*` — multi-line aligned (use for derivations)
- `gather` / `gather*` — centered multi-line
- `multline` / `multline*` — long single equation across lines
- `cases` — piecewise definitions
- Inside math: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `array`

**KaTeX symbols:**
- Greek: `\alpha \beta \gamma ... \omega` (lowercase), `\Gamma \Delta ... \Omega` (uppercase)
- Operators: `\sum \prod \int \partial \nabla \lim \sup \inf`
- Relations: `\leq \geq \neq \approx \equiv \in \forall \exists`
- Logic/arrows: `\land \lor \lnot \implies \iff \to \rightarrow \leftarrow \Rightarrow`
- Decorations: `\hat{x} \bar{x} \vec{x} \dot{x} \ddot{x} \tilde{x} \overline{xyz} \overrightarrow{AB}`
- Sets: `\mathbb{R} \mathbb{Z} \mathbb{N} \mathbb{C} \mathbb{Q} \emptyset`
- Fractions/roots: `\sqrt{x} \sqrt[n]{x} \frac{a}{b} \dfrac{a}{b} \binom{n}{k}`

### NOT Supported ❌
- `\documentclass{...}`, `\usepackage{...}`, `\begin{document}` — silently stripped
- `\maketitle`, `\label`, `\ref`, `\eqref` — cross-refs not resolved
- `\input{...}`, `\include{...}` — no file system
- `\includegraphics{...}`, `\begin{figure}` — no image inclusion
- `\begin{tikzpicture}` — use `pmatrix`/`array` for tabular math
- `\verb`, `\begin{verbatim}` — use `\texttt{...}`
- Multiple separate `$$...$$` for derivations (use `align` instead)
- Bare English inside `$...$` (wrap in `\text{...}`)

---

## 10. Slides Artifact — `application/slides`

**Label:** Slides (Presentation Deck)
**Ringkasan:** JSON presentation deck → 17 layouts dengan diagrams, images, charts, stats, gallery, comparison tables, dark/light theme alternation, arrow-key navigation, PPTX export.

### Output Format: JSON ONLY
**NO markdown, NO fences.** Raw JSON object:
```json
{
  "theme": { "primaryColor": "#...", "secondaryColor": "#...", "fontFamily": "..." },
  "slides": [
    { "layout": "title", "title": "...", "subtitle": "..." },
    { "layout": "content", "title": "...", "bullets": [...] },
    ...
  ]
}
```

### Theme
**Required fields:**
- `primaryColor` (hex) — dark & desaturated (e.g. `#0F172A` slate-900)
  - Approved: `#0F172A`, `#1E293B`, `#0C1222`, `#042F2E`, `#1C1917`, `#1A1A2E`
  - **NEVER:** white, bright indigo, system colors, RGB/HSL, shorthand hex
- `secondaryColor` (hex) — vivid accent (e.g. `#3B82F6` blue, `#06B6D4` cyan, `#10B981` emerald)
  - Approved: `#3B82F6`, `#06B6D4`, `#10B981`, `#F59E0B`, `#8B5CF6`, `#EC4899`
- `fontFamily` — always `"Inter, sans-serif"` unless explicitly requested

### Layouts — 17 Types

**Text Layouts (6):**

1. **title** — opening slide (dark gradient, white text, centered)
   - `title` (required), `subtitle` (required), `note` (optional)

2. **content** — main workhorse (white bg, dark text, accent-bar title)
   - `title` (recommended), `bullets` OR `content` (one required, max 6 bullets ≤ 10 words each), `note` (optional)

3. **two-column** — comparison / paired-list (two parallel bullet lists)
   - `title` (recommended), `leftColumn` (required ≤ 5 items), `rightColumn` (required, balanced)

4. **section** — chapter divider (dark gradient, centered)
   - `title` (required), `subtitle` (optional)

5. **quote** — testimonial / pull quote (blockquote with optional avatar)
   - `quote` (required 5–25 words), `attribution` (recommended), `quoteImage` (optional URL or `unsplash:`), `quoteStyle` (`large`, `minimal`, `card`)

6. **closing** — final slide (dark gradient, white text, centered CTA)
   - `title` (required), `subtitle` or `content` (optional)

**Visual Layouts (11):**

7. **diagram** — full-slide Mermaid diagram
   - `title` (optional), `diagram` (required Mermaid code ≤ 15 nodes), `note` (optional)

8. **image** — full-slide centered image with optional caption
   - `imageUrl` (required URL or `unsplash:`), `imageCaption` (optional), `note` (optional)

9. **chart** — full-slide data chart (bar, line, pie, donut)
   - `title` (optional), `chart` (required ChartData object)

10. **diagram-content** — diagram left, text/bullets right
    - `title` (recommended), `diagram` (required ≤ 10 nodes), `bullets` OR `content` (one required)

11. **image-content** — image left, text/bullets right
    - `title` (recommended), `imageUrl` (required), `bullets` OR `content` (one required)

12. **chart-content** — chart left, text/bullets right
    - `title` (recommended), `chart` (required), `bullets` OR `content` (one required)

13. **hero** — full-bleed background image with text overlay
    - `title` (required), `subtitle` (optional), `backgroundImage` (required URL or `unsplash:`), `overlay` (`dark`, `light`, `none`)

14. **stats** — 2–4 big KPI numbers in grid
    - `title` (optional), `stats` (required array of stat objects)
    - **Stat object:** `{ "value": "42%", "label": "...", "trend": "up|down|neutral", "change": "..." }`

15. **gallery** — image grid (4–12 items, 2–6 columns)
    - `title` (optional), `gallery` (required array `[{ "imageUrl": "...", "caption": "..." }]`), `galleryColumns` (optional 2–6)

16. **comparison** — feature comparison table
    - `title` (optional), `comparisonHeaders` (required), `comparisonRows` (required array of `{ "feature": "...", "values": [...] }`)
    - `values`: `true` (✓), `false` (✗), or string (custom)

17. **features** — icon-based feature grid (visual alternative to bullets)
    - `title` (optional), `features` (required 3–6 items), `featuresColumns` (optional 2–4)
    - **Feature item:** `{ "icon": "rocket", "title": "...", "description": "..." }` (Lucide icon names)

### Mermaid in Slides
- Max 15 nodes for full-slide, max 10 for split layout
- Valid declarations: `flowchart TD`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`, `classDiagram`, `gantt`, `pie`, `mindmap`, `gitGraph`, `journey`
- **NO** `%%{init}%%` directives (renderer handles theming)

### Unsplash Integration in Slides ⭐
**Fields supporting `unsplash:keyword`:**
- `imageUrl` (image layout)
- `backgroundImage` (hero layout)
- `quoteImage` (quote layout avatar)
- `gallery[].imageUrl` (gallery items)

**Syntax:** `"unsplash:technology"`, `"unsplash:mountain sunset"`, `"unsplash:office meeting"`

**Resolusi:** Server-side → real Unsplash URL before PPTX export
**Cache:** 30 days

### Chart Types
- `bar` — vertical bars; data: `[{ "label": "Q1", "value": 120000 }]`
- `bar-horizontal` — horizontal bars
- `line` — trends; data: `{ "labels": ["Jan", "Feb"], "series": [{ "name": "Revenue", "values": [100, 120] }] }`
- `pie` — pie chart
- `donut` — pie with hole

### Content Rules
- **Plain text ONLY** — NO markdown syntax in text fields (`**bold**`, `## headings`, backticks)
- **Bullets ≤ 10 words, ≤ 6 per slide**
- **Realistic, substantive copy** — NO `Lorem ipsum`, `Company Name`, `TBD`, `Add your point here`
- **Numbers anchor claims:** "Increased revenue 23% to $4.2M" not "grew"
- Title slide title = deck name, subtitle = framing
- Closing = CTA or takeaway, NOT just "Thank you"
- `note` field is visible (footer in preview AND PPTX)

### Deck Structure
- **Slide count: 7–12** (fewer = thin; more = lose audience)
- **First slide MUST be `layout: "title"`**
- **Last slide MUST be `layout: "closing"`**
- **Use ≥ 3 different layouts** (audited by validator)
- **Narrative arc:** opening → context/problem → core content → evidence → closing
- **Section breaks** for decks ≥ 9 slides (1–2 `section` slides as act breaks)

### Inline Icons Syntax
**In any text field:** `{icon:icon-name}` (kebab-case Lucide names)
- Examples: `{icon:check} GDPR compliant`, `{icon:rocket} Launch Metrics`
- Renders inline, inherits text color
- Common: `check`, `x`, `alert-circle`, `info`, `arrow-right`, `trending-up`, `dollar-sign`, `users`, `briefcase`, `building`, `code`, `database`, `cloud`, `server`, `lock`, `rocket`, `target`, `zap`, `star`
- **Note:** Only in HTML preview; stripped from PPTX

### Anti-Patterns ❌
- ❌ Outputting anything outside `{...}` or wrapping in markdown fences
- ❌ Using `image-text` layout (deprecated, no image support)
- ❌ Bright `primaryColor` (unreadable on title slides)
- ❌ Missing `subtitle` on title slide
- ❌ First slide not `title` or last not `closing`
- ❌ Fewer than 7 or more than 12 slides
- ❌ Same layout for every slide
- ❌ Markdown syntax in text fields
- ❌ Truncation (`"... etc"`)

---

## 11. R3F 3D Artifact — `application/3d`

**Label:** R3F 3D Scene (React Three Fiber)
**Ringkasan:** Interactive 3D scenes — primitives, glTF models, animations di Canvas dengan OrbitControls dan Environment (pre-provided).

### Runtime Dependencies

| Library | Version | Pre-injected | Notes |
|---------|---------|--------------|-------|
| React | 18.3.1 | Yes | All hooks available as globals |
| Three.js | 0.170.0 | Yes | As `THREE` namespace |
| @react-three/fiber | 8.17.10 | Yes | `useFrame`, `useThree` |
| @react-three/drei | 9.117.0 | Yes | 20 helpers (see below) |
| Babel | 7.26.10 | – | JSX + TypeScript compiled |

**Canvas + Lighting** (already provided — do NOT include):
- `<Canvas camera={{ position: [0, 2, 5], fov: 60 }}>`
- `<ambientLight intensity={0.5} />`
- `<directionalLight position={[5, 5, 5]} intensity={1} />`
- `<Environment preset="city" />`
- `<OrbitControls makeDefault dampingFactor={0.05} />`
- `<Suspense>` wrapper
- Background: dark `#0a0a0f`

### Drei Helpers — 20 Total Available

| Helper | Usage | Notes |
|--------|-------|-------|
| `useGLTF` | `const { scene, animations } = useGLTF(url)` | Load .glb/.gltf models |
| `useAnimations` | `const { actions } = useAnimations(animations, ref)` | Play model animations |
| `Clone` | `<Clone object={scene} />` | Efficiently clone loaded model |
| `Float` | `<Float speed={1.5} floatIntensity={2}>...</Float>` | Gentle floating animation |
| `Sparkles` | `<Sparkles count={100} scale={4} />` | Particle sparkles |
| `Stars` | `<Stars radius={100} count={5000} />` | Starfield background |
| `Text` | `<Text fontSize={0.5} color="white">Hello</Text>` | 3D text (troika) |
| `Center` | `<Center>...</Center>` | Auto-center children |
| `Billboard` | `<Billboard>...</Billboard>` | Always face camera |
| `Grid` | `<Grid args={[20, 20]} />` | Ground grid |
| `Html` | `<Html position={[0, 2, 0]}>...</Html>` | HTML overlay in 3D space |
| `Line` | `<Line points={[[0,0,0],[1,1,1]]} color="red" />` | 3D line |
| `Trail` | `<Trail>...</Trail>` | Motion trail behind moving objects |
| `Sphere` | `<Sphere args={[1, 32, 32]}><meshStandardMaterial /></Sphere>` | Shorthand sphere |
| `RoundedBox` | `<RoundedBox args={[1, 1, 1]} radius={0.1}>...</RoundedBox>` | Box with rounded edges |
| `MeshDistortMaterial` | `<MeshDistortMaterial distort={0.4} speed={2} />` | Wobbly distortion |
| `MeshWobbleMaterial` | `<MeshWobbleMaterial factor={1} speed={2} />` | Wave wobble |
| `MeshTransmissionMaterial` | `<MeshTransmissionMaterial transmission={1} thickness={0.5} />` | Glass/transmission |
| `GradientTexture` | `<GradientTexture stops={[0, 1]} colors={["#e63946", "#1d3557"]} />` | Gradient fill |

### NOT Available (will crash) ❌
- `OrbitControls`, `Environment`, `PerspectiveCamera`, `Sky`, `Cloud`, `Bounds`
- `PivotControls`, `TransformControls`, `Reflector`, `ContactShadows`, `AccumulativeShadows`
- `RandomizedLight`, `Decal`, `useTexture`, `useProgress`, `Preload`, `Leva`

### Component Requirements
- **MUST** `export default` a function component
- Function component ONLY (no class components)
- Return `<group>`, `<mesh>`, or `<Fragment>`
- **NEVER** return `<Canvas>`

### Animation Patterns
- **Rotation:** `useFrame((_, delta) => { ref.current.rotation.y += delta * 0.5 })`
  - Always use `delta` for frame-rate-independent motion
- **Float effect:** Wrap in `<Float speed={1.5} floatIntensity={2}>...</Float>`
- **Scale pulse:** `ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime) * 0.1)`
- **Orbit:** `ref.current.position.set(Math.cos(t) * r, 0, Math.sin(t) * r)` where `t = state.clock.elapsedTime`
- **NEVER** allocate objects inside `useFrame` (memory leak)

### 3D Model Loading

**Verified Working CDNs:**

**KhronosGroup glTF samples** (reliable):
```
https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb
```
Models: Fox (animated, scale 0.02), Duck, DamagedHelmet, Avocado (scale ~20), BrainStem, CesiumMan, CesiumMilkTruck, Lantern, ToyCar, BoomBox, WaterBottle, AntiqueCamera, BarramundiFish, CarConcept, DragonAttenuation, MaterialsVariantsShoe, ABeautifulGame, ChronographWatch, CommercialRefrigerator, SheenChair

**Three.js examples** (animated birds + characters):
```
https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb
```
Models: Parrot, Flamingo, Stork (animated birds), Soldier, Xbot, LittlestTokyo (large city scene)

**Scale notes:**
- Fox: scale 0.02
- Avocado: scale ~20
- Most others: scale 1–3

### Scale & Composition
- 1 unit ≈ 1 meter
- Keep objects in 0.5–5 range (camera at [0, 2, 5])
- Place objects near origin (OrbitControls targets [0, 0, 0])
- Wrapper provides ambient + directional + environment lighting

### Anti-Patterns ❌
- ❌ `<Canvas>` inside (wrapper provides it)
- ❌ `<OrbitControls>` inside (wrapper provides it)
- ❌ `import` statements (stripped by sanitizer)
- ❌ `requestAnimationFrame` (use `useFrame`)
- ❌ `document.querySelector()` (use `useRef`)
- ❌ `new THREE.WebGLRenderer()` (Canvas handles this)
- ❌ Allocating objects inside `useFrame`
- ❌ Building real-world objects from primitives (use glTF models)
- ❌ Model URLs not from verified CDNs above

---

## Deep Dive: Unsplash Image Resolution

**File:** [src/lib/unsplash/resolver.ts](src/lib/unsplash/resolver.ts)

### How It Works (Server-Side)

**Flow:**
1. User's artifact content (HTML or Slides JSON) reaches server
2. Validator/tool detects `unsplash:keyword` patterns
3. `resolveHtmlImages(content)` atau `resolveSlideImages(content)` is called
4. Regex extracts all keywords → normalize (lowercase, trim, max 50 chars)
5. Dedupe + check Prisma cache (30-day TTL)
6. Fetch uncached queries in parallel via `searchPhoto(query)` → [client.ts](src/lib/unsplash/client.ts)
7. **API call:** GET `https://api.unsplash.com/search/photos?query=...&per_page=1&orientation=landscape`
   - Returns first result (highest quality landscape orientation)
   - Timeout: 5 seconds per query
8. **Output URL:** `${photo.urls.regular}&w=1200` (regular size + width optimization)
9. **Cache:** Save query + URL + attribution to `resolvedImage` table, expires 30 days
10. **Fallback:** If Unsplash down/timeout → `placehold.co` placeholder dengan keyword text

### Regex Patterns

**HTML:** `src=["']unsplash:([^"']+)["']/gi`
```html
<!-- Matches: -->
<img src="unsplash:mountain sunset" />
<img src='unsplash:coffee shop interior' />
<!-- Extracts keyword: "mountain sunset", "coffee shop interior" -->
```

**Slides JSON:** Direct field checks
```json
{
  "imageUrl": "unsplash:technology",
  "backgroundImage": "unsplash:office meeting",
  "quoteImage": "unsplash:person",
  "gallery": [{ "imageUrl": "unsplash:logo company" }]
}
```

### Normalization
```javascript
function normalize(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")  // Collapse whitespace
    .slice(0, 50)           // Max 50 chars
}
```

### Cache Strategy
- **TTL:** 30 days
- **Key:** normalized query string
- **Value:** direct Unsplash URL with width param
- **Attribution:** `Photo by {name} on Unsplash`
- **Race condition handling:** Duplicate key errors ignored (rely on cache)

### Fallback Behavior
```javascript
function fallbackUrl(query: string): string {
  const encoded = encodeURIComponent(query)
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encoded}`
}
```
**Gray background (#f1f5f9) dengan dark text (#64748b), text = keyword yang asli**

### Which Types Support Unsplash Resolution?

| Type | resolveImages called? | Field(s) | Notes |
|------|:---:|---|---|
| HTML | ✓ | `src="unsplash:..."` in `<img>` tags | Server-side in create-artifact/update-artifact |
| Slides | ✓ | `imageUrl`, `backgroundImage`, `quoteImage`, `gallery[].imageUrl` | Server-side in create-artifact/update-artifact |
| React | ✗ | – | Would need runtime resolution (no unsplash support documented) |
| SVG | ✗ | – | SVG is sanitized, external refs blocked |
| Mermaid | ✗ | – | No image support in Mermaid syntax |
| Other | ✗ | – | – |

### Error Handling
- **Timeout:** 5 seconds per query → fallback
- **API error (4xx/5xx):** Log warning → fallback
- **Network error:** Log error → fallback
- **Cache lookup fail:** Continue with uncached queries
- **Never throws:** Resolution is wrapped with try/catch, always returns valid content

---

## TL;DR: Fitur Matrix (Visual Checklist)

Tabel di atas (bagian "TL;DR — Matrix Kapabilitas") merangkum semua fitur per artifact type. Highlight utama:

### Yang BISA:
- **HTML:** Unsplash images, SVG inline, Lucide icons (via SVG text), forms, `localStorage`
- **React:** Recharts, Framer Motion, Lucide icons, Tailwind, state management
- **Slides:** Unsplash images (imageUrl, backgroundImage, quoteImage, gallery), Mermaid diagrams, Lucide icons (inline `{icon:name}`), charts (bar, line, pie, donut), stats, gallery, comparison tables
- **Mermaid:** Flowcharts, sequence, ER, state, class, Gantt, pie, quadrant, xychart, sankey, timeline, gitgraph, mindmap, journey (max 15 nodes each)
- **Python:** Matplotlib plots, numpy, pandas, scipy, scikit-learn, pre-loaded packages
- **Sheet:** Sort (lexicographic), filter (substring), export CSV
- **Markdown:** Inline/display KaTeX math, GFM tables, Mermaid diagrams inline, code blocks with syntax highlighting
- **LaTeX:** KaTeX full symbol support, align/gather/cases environments, document structure

### Yang TIDAK BISA:
- **React:** Shadcn/ui, real `fetch()`, form POST, `window.location`, `document.querySelector`
- **HTML:** External images (except Unsplash), real network requests, form submission
- **SVG:** Scripts, styles, external hrefs, event handlers, nested SVGs via foreignObject
- **Mermaid:** Theme override (`%%{init}%%`), click directives (security blocked), >15 nodes
- **Python:** `requests`, `tensorflow`, `torch`, file I/O, `input()`, `threading`
- **Slides:** Markdown syntax in text fields, real network images (use unsplash: protocol)
- **Markdown:** Raw HTML tags, embedded images via data: URIs

---

## Summary

**11 artifact types, each dengan distinct capabilities:**

1. **HTML** — Rich interactivity + **Unsplash images** (core feature)
2. **React** — Components dengan **Recharts + Framer Motion**
3. **SVG** — Static graphics (icons, illustrations, diagrams)
4. **Mermaid** — **Full chart suite** (pie, xychart, sankey, timeline) + diagrams
5. **Code** — Display-only dengan syntax highlighting
6. **Python** — **Matplotlib plots** + numpy/pandas/scipy, executable
7. **Sheet** — **Sort + filter + CSV export** for tabular data
8. **Markdown** — **KaTeX math + inline Mermaid** + GFM tables
9. **LaTeX** — **Full KaTeX symbol set** + document structure
10. **Slides** — **17 layouts dengan Unsplash images, Mermaid, icons, charts**
11. **R3F** — **3D scenes dengan glTF models + animations**

**Key discoveries (per user request):**
- ✓ Unsplash: HTML + Slides only, server-side resolution, 30-day cache, fallback to placehold.co
- ✓ HTML + images: `unsplash:keyword` protocol, or inline SVG, no external URLs
- ✓ Mermaid charts: Pie, quadrant, xychart, sankey, timeline, gitgraph semua supported (v11)
- ✓ Slides: Embed images, Mermaid, charts, icons, comparison tables semuanya bisa
- ✓ React libraries: Recharts, Framer Motion, Lucide (pre-injected globals, no imports)
- ✓ Python: Pre-loaded numpy, matplotlib, pandas, scipy, scikit-learn
