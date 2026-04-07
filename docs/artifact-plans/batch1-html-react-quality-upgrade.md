# Batch 1 — HTML + React Artifact Quality Upgrade

> **Goal:** Bring `text/html` and `application/react` artifact output up to v0.dev / Lovable / bolt.new caliber by rewriting their LLM instructions, adding a curated design-system context, and inserting a server-side validation + 1-shot auto-fix loop.

---

## 1. Context & Current State

### 1.1 Why this batch exists

Today, when an LLM emits an HTML or React artifact via the `create_artifact` tool, the result is generic: flat color palette, inconsistent spacing, no a11y, no responsive thinking, occasional truncation, and frequent runtime errors from importing non-whitelisted libraries. The root cause is in the prompt — `ARTIFACT_TYPE_INSTRUCTIONS` for these two types is only ~3 sentences each and gives no concrete design tokens, no examples, and no anti-patterns.

### 1.2 Current instruction strings (verbatim)

**Source:** [src/lib/prompts/instructions.ts:34-78](../../src/lib/prompts/instructions.ts#L34-L78)

`text/html` (lines 35-37):
> **text/html — Interactive HTML Pages**
> Write complete, self-contained HTML documents. Tailwind CSS is automatically available via CDN — use Tailwind utility classes for ALL styling (do NOT write verbose custom CSS). You can use `<script>` tags for full interactivity. Google Fonts Inter is pre-loaded.
> STYLING: Use modern Tailwind — rounded-lg/xl, shadow-sm/md, proper spacing (p-4/6, gap-4), muted backgrounds (bg-gray-50, bg-slate-50), smooth transitions (transition-all duration-200), hover effects (hover:shadow-md, hover:scale-105), gradient hero sections (bg-gradient-to-br). Prefer cards with borders (border border-gray-200 rounded-xl p-6). Never output plain unstyled HTML.

`application/react` (lines 39-41):
> **application/react — React Components**
> Available imports: react (all hooks), recharts (charts/graphs), lucide-react (icons). Tailwind CSS is automatically available — use Tailwind utility classes for ALL styling. Components MUST have `export default`. Do NOT import CSS files or external packages beyond react, recharts, lucide-react.
> STYLING: Write modern, polished UI with proper spacing, rounded corners (rounded-lg/xl/2xl), shadows (shadow-sm/md/lg), hover effects, and transitions. Use Inter font via font-sans class. Use consistent color palette. Structure with clear component hierarchy.

### 1.3 Renderer constraints (ground truth)

**HTML renderer** ([html-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/html-renderer.tsx)):
- Tailwind injected via `https://cdn.tailwindcss.com` (CDN, latest)
- **Google Fonts is NOT actually injected** — current instructions lie. Either inject it or tell the LLM to add the `<link>` itself.
- Sandbox: `allow-scripts allow-modals`
- Blocks: navigation (`location.*`, `history.*`, `window.open`, anchor clicks, form submits)
- Renders via `srcdoc`; wraps fragments in a default doctype if missing

**React renderer** ([react-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx)):
- Library whitelist (exposed as **window globals**, not importable):
  - `react@19` → `React` (all hooks pre-destructured)
  - `recharts@2` → `Recharts`
  - `lucide-react@0.454.0` → `LucideReact`
  - **`framer-motion@11` → `Motion`** ← current instructions omit this
- Babel standalone transpiles JSX in-browser
- Preprocessor strips `import` lines and exposes the libs as globals; `import 'something.css'` is silently dropped
- Sandbox: `allow-scripts` only (no modals, no forms, no popups)
- Component exposed via `export default` is auto-rendered into `#root`
- `class extends React.Component` works but is discouraged
- `document.querySelector` is brittle inside the iframe — use refs

### 1.4 Tool flow

`create_artifact` ([create-artifact.ts](../../src/lib/tools/builtin/create-artifact.ts)):
1. Parse input
2. Size check — fails if `> 512 KB` (line 54-64)
3. Upload buffer to S3
4. Persist `Document` row in Prisma
5. Background `indexArtifactContent()` for RAG

`update_artifact` ([update-artifact.ts](../../src/lib/tools/builtin/update-artifact.ts)) — mirrors above plus version archiving (`MAX_VERSION_HISTORY = 20`).

Instructions are injected at [chat-public/service.ts:838](../../src/features/chat-public/service.ts#L838) via `buildToolInstruction()`.

### 1.5 Pattern extraction from references

Patterns common to v0, Lovable, and bolt.new:

| Pattern | v0 | Lovable | bolt | Adopt? |
|---|---|---|---|---|
| Constrain palette to 3-5 colors | ✅ | ✅ (semantic tokens) | — | **Yes** |
| Mobile-first responsive, min 44px touch targets | ✅ | ✅ | — | **Yes** |
| Max 2 font families, body line-height 1.4-1.6 | ✅ | — | — | **Yes** |
| Use Tailwind spacing scale, never `p-[16px]` | ✅ | ✅ | — | **Yes** |
| Flexbox first, Grid only for true 2D | ✅ | — | — | **Yes** |
| Semantic HTML + ARIA + alt + sr-only | ✅ | ✅ (SEO) | — | **Yes** |
| **NEVER** truncate, **NEVER** placeholders | — | — | ✅ (rule 11) | **Yes — strongest** |
| Think HOLISTICALLY before writing | — | — | ✅ (rule 1) | **Yes** |
| Forbid emoji as icons | ✅ | — | — | **Yes** |
| Forbid hand-rolled SVG for complex shapes | ✅ | — | — | **Yes** |
| No purple/violet by default | ✅ | — | — | Yes (mild) |
| Ship interesting > boring, but never ugly | ✅ | ✅ ("beautiful and works") | — | **Yes** |
| Few-shot examples embedded in prompt | partial | partial | ✅ | **Yes** |

Patterns we **cannot** adopt directly because of our constraints:
- shadcn/ui component imports (we are CDN-Tailwind only) → translate to raw Tailwind utility patterns
- Server Components / Next.js APIs (we render in a static iframe) → ignore
- Vite / WebContainers tooling → ignore
- localStorage discouragement (we *must* allow it — there is no backend in the iframe)
- `next/font` usage → replace with `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`

---

## 2. Section 4.1 — Rewrite of `ARTIFACT_TYPE_INSTRUCTIONS['text/html']`

> **Length budget:** ~1.6k tokens. Designed to be pasted verbatim into [instructions.ts:35](../../src/lib/prompts/instructions.ts#L35).

```ts
'text/html': `**text/html — Self-contained Interactive HTML Pages**

You are generating a complete, production-quality HTML document that will render inside a sandboxed iframe. The result must look and feel like it was designed by a senior product designer — not a generic AI.

## Runtime Environment (read carefully)
- **Tailwind CSS v3 is auto-injected** from \`https://cdn.tailwindcss.com\`. Do NOT add another Tailwind <script>.
- **You MUST include the Inter font yourself** via \`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">\` and apply \`font-family: 'Inter', system-ui, sans-serif\` on body (or use Tailwind's \`font-sans\` after configuring it).
- **Sandbox restrictions**: \`allow-scripts allow-modals\` only. \`location.*\`, \`history.*\`, \`window.open()\`, anchor navigation, and form submission are all blocked. Build single-page interactivity with JS state — never rely on real navigation or form POST.
- **No external network** beyond Google Fonts and the Tailwind CDN. No \`fetch()\` to real APIs. Mock data inline.
- **Persistence**: \`localStorage\` works inside the iframe — use it for user preferences if relevant.

## Required Document Structure
Every artifact MUST start with:

\`\`\`html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><!-- descriptive, <60 chars --></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
  <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="min-h-full bg-slate-50 text-slate-900 antialiased">
  <!-- semantic content here -->
</body>
</html>
\`\`\`

Use semantic landmarks: \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<aside>\`, \`<footer>\`. Exactly one \`<h1>\` per document.

## Design System (USE THESE TOKENS)

**Color palette — pick exactly ONE primary, then use neutrals + 1 accent. Total ≤ 5 colors.**
- Primary candidates (pick one and stay with it): \`indigo-600\`, \`blue-600\`, \`emerald-600\`, \`rose-600\`, \`amber-500\`, \`slate-900\`
- Neutrals (always use): \`slate-50\` (page bg), \`white\` (card bg), \`slate-200\` (borders), \`slate-500\` (secondary text), \`slate-900\` (primary text)
- Accent: a single contrasting hue used sparingly for CTAs/highlights
- **NEVER** use purple/violet unless the user explicitly asks
- **NEVER** mix more than 2 saturated hues in one screen

**Typography scale (Tailwind classes):**
- Display: \`text-5xl font-bold tracking-tight\` (hero)
- H1: \`text-4xl font-bold tracking-tight\`
- H2: \`text-2xl font-semibold tracking-tight\`
- H3: \`text-lg font-semibold\`
- Body: \`text-base leading-relaxed\` (line-height 1.625)
- Small: \`text-sm text-slate-500\`
- Use \`text-balance\` on headings, \`text-pretty\` on long body copy

**Spacing rhythm — use Tailwind scale ONLY (no \`p-[16px]\`):**
- Section vertical padding: \`py-16 md:py-24\`
- Card padding: \`p-6 md:p-8\`
- Gap between siblings: \`gap-4\` (tight), \`gap-6\` (default), \`gap-8\` (airy)

**Radii & shadows:**
- Cards: \`rounded-2xl border border-slate-200 shadow-sm\`
- Buttons: \`rounded-lg\`
- Pills/badges: \`rounded-full\`
- Hover lift: \`hover:shadow-md hover:-translate-y-0.5 transition\`

**Container & responsive layout:**
- Page wrapper: \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`
- Content text wrapper: \`max-w-prose\`
- Mobile-first: design 360px first, then \`sm:\` (640), \`md:\` (768), \`lg:\` (1024), \`xl:\` (1280)
- Touch targets: minimum \`h-11\` (44px) for buttons and links on mobile

**Layout method priority:**
1. Flexbox (\`flex items-center justify-between gap-4\`) for almost everything
2. CSS Grid (\`grid grid-cols-1 md:grid-cols-3 gap-6\`) for true 2D layouts only
3. NEVER absolute positioning unless overlaying (modal, tooltip)

## Accessibility (non-negotiable)
- Every interactive element must be keyboard-reachable and have a visible focus ring: \`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2\`
- Buttons: \`<button type="button" aria-label="...">\`
- Icon-only buttons: include \`<span class="sr-only">Description</span>\`
- Images: meaningful \`alt\`; decorative use \`alt=""\`
- Form fields: paired \`<label for>\` + \`id\`
- Color contrast: body text on background must be ≥ 4.5:1
- Use \`aria-current\`, \`aria-expanded\`, \`role="dialog"\` etc. where appropriate

## Code Quality Rules — STRICT
- **NEVER truncate.** No \`<!-- … rest of content … -->\`, no \`/* ... */\`, no "add more here". Output the COMPLETE document.
- **NEVER use placeholders** like \`Lorem ipsum\` for product content — write realistic, on-brand copy.
- No inline \`style="..."\` attributes when a Tailwind class exists. Inline \`<style>\` blocks are allowed only for things Tailwind cannot express (e.g., custom \`@keyframes\`) and must be ≤ 10 lines.
- No \`!important\`.
- No hardcoded pixel values in JS-set styles — use rem or Tailwind classes.
- All \`<script>\` JS uses strict mode and \`const\`/\`let\`. Wrap top-level code in \`(() => { ... })()\` or \`document.addEventListener('DOMContentLoaded', ...)\`.
- Mock all data inline as \`const DATA = [...]\`.
- Use \`<button type="button">\` instead of \`<a href="#">\` for click handlers.

## Anti-Patterns (DO NOT DO)
- ❌ Emoji as functional icons (use inline SVG or Lucide-style SVG strings)
- ❌ Hand-drawn complex SVG illustrations or geographic maps
- ❌ Gradient circles / blurry blobs as decorative filler
- ❌ \`<form action="/submit">\` — sandbox blocks submission
- ❌ \`window.location = "..."\` — sandbox blocks navigation
- ❌ More than 2 font families
- ❌ More than 5 distinct colors
- ❌ Truncating "for brevity"

## Two Few-Shot Examples

### Example A — Landing page hero (output the FULL document)
\`\`\`html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Inboxly — Email that writes itself</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
  <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="min-h-full bg-white text-slate-900 antialiased">
  <header class="border-b border-slate-200">
    <nav class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-lg bg-indigo-600 grid place-items-center text-white font-bold">I</div>
        <span class="font-semibold">Inboxly</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm text-slate-600">
        <a href="#features" class="hover:text-slate-900">Features</a>
        <a href="#pricing" class="hover:text-slate-900">Pricing</a>
        <a href="#docs" class="hover:text-slate-900">Docs</a>
      </div>
      <button type="button" class="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition">Get started</button>
    </nav>
  </header>
  <main>
    <section class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-32 text-center">
      <span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium">New · GPT-powered drafts</span>
      <h1 class="mt-6 text-4xl md:text-6xl font-bold tracking-tight text-balance">Email that writes itself.</h1>
      <p class="mt-6 max-w-2xl mx-auto text-lg text-slate-600 text-pretty leading-relaxed">Inboxly drafts, summarizes, and sorts your inbox so you can spend less than 10 minutes a day on email.</p>
      <div class="mt-10 flex items-center justify-center gap-3">
        <button type="button" class="h-12 px-6 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition">Start free trial</button>
        <button type="button" class="h-12 px-6 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition">Watch demo</button>
      </div>
    </section>
    <section id="features" class="bg-slate-50 py-20">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <article class="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <div class="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 grid place-items-center font-bold">✦</div>
          <h2 class="mt-4 text-lg font-semibold">Smart drafts</h2>
          <p class="mt-2 text-sm text-slate-600 leading-relaxed">Reply in one click with drafts that match your tone and context.</p>
        </article>
        <article class="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <div class="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 grid place-items-center font-bold">⤳</div>
          <h2 class="mt-4 text-lg font-semibold">Auto-sort</h2>
          <p class="mt-2 text-sm text-slate-600 leading-relaxed">Newsletters, receipts, and threads land where they belong.</p>
        </article>
        <article class="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
          <div class="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 grid place-items-center font-bold">⌘</div>
          <h2 class="mt-4 text-lg font-semibold">Daily digest</h2>
          <p class="mt-2 text-sm text-slate-600 leading-relaxed">A 90-second briefing that catches you up on what matters.</p>
        </article>
      </div>
    </section>
  </main>
  <footer class="border-t border-slate-200 py-10 text-center text-sm text-slate-500">© 2026 Inboxly</footer>
</body>
</html>
\`\`\`

### Example B — Interactive widget (calorie calculator with state)
\`\`\`html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily calorie calculator</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="min-h-full bg-slate-50 text-slate-900 antialiased grid place-items-center p-4">
  <main class="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
    <h1 class="text-2xl font-semibold tracking-tight">Daily calorie calculator</h1>
    <p class="mt-1 text-sm text-slate-500">Estimate your maintenance calories using the Mifflin-St Jeor formula.</p>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Age</span>
        <input id="age" type="number" value="30" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Sex</span>
        <select id="sex" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <option value="m">Male</option>
          <option value="f">Female</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Weight (kg)</span>
        <input id="weight" type="number" value="70" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Height (cm)</span>
        <input id="height" type="number" value="175" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
    </div>
    <label class="mt-4 flex flex-col gap-1.5">
      <span class="text-sm font-medium">Activity level</span>
      <select id="activity" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <option value="1.2">Sedentary</option>
        <option value="1.375" selected>Light (1-3 d/wk)</option>
        <option value="1.55">Moderate (3-5 d/wk)</option>
        <option value="1.725">Very active (6-7 d/wk)</option>
      </select>
    </label>
    <div class="mt-6 rounded-xl bg-indigo-50 p-5 text-center">
      <div class="text-xs font-medium uppercase tracking-wider text-indigo-700">Maintenance</div>
      <div id="result" class="mt-1 text-4xl font-bold text-indigo-900">2,400</div>
      <div class="text-xs text-indigo-700">kcal / day</div>
    </div>
  </main>
  <script>
    (() => {
      const $ = (id) => document.getElementById(id);
      const calc = () => {
        const age = +$('age').value, w = +$('weight').value, h = +$('height').value;
        const sex = $('sex').value, act = +$('activity').value;
        const bmr = sex === 'm'
          ? 10*w + 6.25*h - 5*age + 5
          : 10*w + 6.25*h - 5*age - 161;
        $('result').textContent = Math.round(bmr * act).toLocaleString();
      };
      ['age','sex','weight','height','activity'].forEach(id => $(id).addEventListener('input', calc));
      calc();
    })();
  </script>
</body>
</html>
\`\`\`

Now generate the user's requested HTML artifact following ALL of the above. Output ONLY the complete HTML document.`,
```

---

## 3. Section 4.2 — Rewrite of `ARTIFACT_TYPE_INSTRUCTIONS['application/react']`

> Pasted into [instructions.ts:39](../../src/lib/prompts/instructions.ts#L39).

```ts
'application/react': `**application/react — Self-contained React Components**

You are generating a single React component that will be transpiled by Babel-standalone and rendered into a sandboxed iframe at \`#root\`. The result must look and feel like a v0/Lovable-quality component — not a generic AI sketch.

## Runtime Environment (read carefully)

**Libraries are exposed as window globals — do NOT \`import\` from them. Just use them.**

| Available global | What it is | Version |
|---|---|---|
| \`React\` | React 19 — all hooks pre-destructured into scope | 19 |
| \`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`useReducer\`, \`useContext\`, \`useId\`, \`useTransition\`, \`useDeferredValue\`, \`useLayoutEffect\`, \`createContext\`, \`forwardRef\`, \`memo\`, \`Fragment\`, \`Suspense\`, \`lazy\`, \`Children\`, \`cloneElement\` | already in scope | 19 |
| \`Recharts\` | Recharts (\`<LineChart>\`, \`<BarChart>\`, \`<PieChart>\`, \`<AreaChart>\`, \`<Tooltip>\`, etc.) | 2 |
| \`LucideReact\` | Lucide icon set (\`LucideReact.ArrowRight\`, \`LucideReact.Check\`, ...) | 0.454 |
| \`Motion\` | framer-motion (\`Motion.motion.div\`, \`Motion.AnimatePresence\`) | 11 |
| **Tailwind CSS v3** | available globally as utility classes | CDN |

You **CAN** write \`import\` statements at the top of your file — the preprocessor will strip them. But the cleanest output is to skip imports entirely and reference the globals directly. If you do write imports, only import from: \`react\`, \`recharts\`, \`lucide-react\`, \`framer-motion\`. Anything else will be silently dropped and your component will crash.

**Sandbox restrictions**: \`allow-scripts\` only — no modals, no forms-with-action, no popups, no real navigation. All forms must be \`onSubmit={(e) => { e.preventDefault(); ... }}\`. No \`window.open\`, no \`location.href = ...\`.

**No real network.** Mock all data with \`useState\` initializers or module-scope constants.

## Required Component Shape

\`\`\`jsx
function App() {
  const [value, setValue] = useState(0);
  // ...
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased p-6">
      {/* content */}
    </div>
  );
}

export default App;
\`\`\`

- **MUST** have \`export default\` (function or const). The renderer keys off this.
- **MUST** be a function component. **NEVER** use \`class extends React.Component\`.
- **NEVER** use \`document.querySelector\`, \`document.getElementById\`, or direct DOM manipulation. Use \`useRef\`.
- **NEVER** import a CSS file. Tailwind is already loaded.
- Top-level wrapper should set \`min-h-screen\`, background, text color, font, and base padding.

## Design System (same as HTML — apply consistently)

**Palette:** pick ONE primary (\`indigo-600\` / \`blue-600\` / \`emerald-600\` / \`rose-600\` / \`slate-900\`), use slate neutrals, ≤ 5 colors total. No purple unless asked.

**Typography:**
- Display: \`text-4xl md:text-5xl font-bold tracking-tight\`
- H2: \`text-2xl font-semibold tracking-tight\`
- Body: \`text-base leading-relaxed text-slate-700\`
- Small: \`text-sm text-slate-500\`

**Spacing:** Tailwind scale only. Cards \`p-6\`, sections \`py-12\` to \`py-20\`, gaps \`gap-4\`/\`gap-6\`/\`gap-8\`.

**Cards:** \`rounded-2xl bg-white border border-slate-200 shadow-sm\`. Hover: \`hover:shadow-md hover:-translate-y-0.5 transition\`.

**Buttons:**
\`\`\`jsx
<button
  type="button"
  onClick={...}
  className="h-11 px-5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
>
  Label
</button>
\`\`\`

**Inputs:** \`h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500\`

**Layout:** mobile-first. Page wrapper \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`. Use Flexbox first, Grid only for true 2D.

## State Management Patterns

**Forms:** controlled components, validate on submit, show inline errors.
\`\`\`jsx
const [form, setForm] = useState({ email: '', name: '' });
const [errors, setErrors] = useState({});
const onSubmit = (e) => {
  e.preventDefault();
  const next = {};
  if (!form.email.includes('@')) next.email = 'Invalid email';
  setErrors(next);
  if (Object.keys(next).length === 0) {/* submit */}
};
\`\`\`

**Mock fetching:** simulate with \`useEffect\` + \`setTimeout\`, show loading skeleton.

**Tabs / multi-view:** \`const [view, setView] = useState('overview')\` + conditional render. Use \`role="tablist"\` and \`aria-selected\`.

## Accessibility (non-negotiable)
- Every \`<button>\` has \`type="button"\` (or \`type="submit"\` inside a form)
- Icon-only buttons: \`<span className="sr-only">Description</span>\`
- Form labels paired via \`htmlFor\`/\`id\` OR wrap input in \`<label>\`
- Visible focus ring on every interactive element
- \`aria-live\` regions for dynamic status messages
- Color contrast ≥ 4.5:1 on body text

## Code Quality Rules — STRICT
- **NEVER truncate.** No \`/* ...rest of component... */\`. Output the COMPLETE component.
- **NEVER use placeholders** like \`Lorem ipsum\` for product copy — write realistic text.
- Mock data should be realistic and named like a product (\`const RECENT_ORDERS = [{ id: 'ORD-1041', customer: 'Sara Chen', total: 248.00 }, ...]\`).
- No dead code, no commented-out alternatives.
- Use \`useCallback\`/\`useMemo\` only when there is an actual perf reason — not by default.
- Keys on lists must be stable IDs, never array indexes (unless the list is truly static).

## Anti-Patterns (DO NOT DO)
- ❌ \`import { Card } from 'shadcn/ui'\` — shadcn is NOT available. Build cards with raw Tailwind.
- ❌ \`import './styles.css'\` — silently dropped, then your styles vanish
- ❌ \`class MyComponent extends React.Component\`
- ❌ \`document.getElementById('foo')\`
- ❌ Emoji as functional icons (use \`LucideReact.X\`)
- ❌ Real \`fetch()\` calls
- ❌ \`<form action="/submit">\` — sandbox blocks it; use \`onSubmit\` with \`e.preventDefault()\`
- ❌ More than 5 colors / more than 2 fonts
- ❌ Truncating "for brevity"

## Two Few-Shot Examples

### Example A — Recharts dashboard (output the COMPLETE component)
\`\`\`jsx
const REVENUE = [
  { month: 'Jan', revenue: 12400, orders: 142 },
  { month: 'Feb', revenue: 15800, orders: 168 },
  { month: 'Mar', revenue: 14200, orders: 159 },
  { month: 'Apr', revenue: 18900, orders: 201 },
  { month: 'May', revenue: 21500, orders: 234 },
  { month: 'Jun', revenue: 24800, orders: 267 },
];

const STATS = [
  { label: 'Revenue', value: '$108k', delta: '+18.2%', positive: true },
  { label: 'Orders', value: '1,171', delta: '+12.4%', positive: true },
  { label: 'AOV', value: '$92.30', delta: '-2.1%', positive: false },
  { label: 'Refund rate', value: '1.4%', delta: '-0.3%', positive: true },
];

function App() {
  const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = Recharts;
  const { TrendingUp, TrendingDown } = LucideReact;
  const [range, setRange] = useState('6m');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revenue overview</h1>
            <p className="mt-1 text-sm text-slate-500">Last 6 months · updated just now</p>
          </div>
          <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {['1m','3m','6m','1y'].map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={\`h-8 px-3 rounded-md text-sm font-medium transition \${range === r ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}\`}
              >
                {r}
              </button>
            ))}
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="text-sm text-slate-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</div>
              <div className={\`mt-2 inline-flex items-center gap-1 text-xs font-medium \${s.positive ? 'text-emerald-600' : 'text-rose-600'}\`}>
                {s.positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {s.delta}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Monthly revenue</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={REVENUE} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => \`$\${v/1000}k\`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  formatter={(v) => [\`$\${v.toLocaleString()}\`, 'Revenue']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
\`\`\`

### Example B — Validated signup form
\`\`\`jsx
function App() {
  const { Mail, Lock, User, Check, AlertCircle } = LucideReact;
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your name';
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 8) e.password = 'At least 8 characters';
    return e;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center font-sans p-4">
        <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 grid place-items-center">
            <Check className="text-emerald-600" size={24} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">You're in</h1>
          <p className="mt-1 text-sm text-slate-500">We sent a verification link to {form.email}.</p>
        </div>
      </div>
    );
  }

  const Field = ({ id, label, type, icon: Icon, value, onChange, error, autoComplete }) => (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <div className="mt-1.5 relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? \`\${id}-err\` : undefined}
          className={\`h-11 w-full rounded-lg border pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 \${error ? 'border-rose-400' : 'border-slate-300'}\`}
        />
      </div>
      {error && (
        <p id={\`\${id}-err\`} className="mt-1.5 inline-flex items-center gap-1 text-xs text-rose-600">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center font-sans p-4">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Free for 14 days. No credit card needed.</p>
        <div className="mt-6 space-y-4">
          <Field id="name" label="Name" type="text" icon={User} value={form.name} onChange={update('name')} error={errors.name} autoComplete="name" />
          <Field id="email" label="Work email" type="email" icon={Mail} value={form.email} onChange={update('email')} error={errors.email} autoComplete="email" />
          <Field id="password" label="Password" type="password" icon={Lock} value={form.password} onChange={update('password')} error={errors.password} autoComplete="new-password" />
        </div>
        <button type="submit" className="mt-6 h-11 w-full rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition">
          Create account
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">Already have an account? <button type="button" className="text-indigo-600 hover:underline">Sign in</button></p>
      </form>
    </div>
  );
}

export default App;
\`\`\`

Now generate the user's requested React component following ALL of the above. Output ONLY the complete component code (no markdown fences, no explanation).`,
```

---

## 4. Section 4.3 — `src/lib/prompts/design-system.ts` (new file)

**Purpose:** Centralize design tokens so we can iterate without bloating `instructions.ts`. Keeps the system prompt under control while allowing per-type fine-tuning later.

**Spec:**

```ts
// src/lib/prompts/design-system.ts
import type { ArtifactType } from '@/features/conversations/components/chat/artifacts/types';

const SHARED_TOKENS = `…palette, typography, spacing, radii, shadows, container widths…`;

const HTML_PATTERNS = `…layout snippets: hero, card grid, navbar, footer, modal-via-dialog…`;

const REACT_PATTERNS = `…composition snippets: stat card, tabs, table, empty state, skeleton…`;

export function getDesignSystemContext(type: ArtifactType): string {
  switch (type) {
    case 'text/html':
      return `${SHARED_TOKENS}\n\n## HTML Patterns\n${HTML_PATTERNS}`;
    case 'application/react':
      return `${SHARED_TOKENS}\n\n## React Patterns\n${REACT_PATTERNS}`;
    default:
      return '';
  }
}
```

**Constraints:**
- Keep total under **~3,500 tokens** (measure with `tiktoken` after drafting). If we hit the budget, drop pattern snippets first, keep tokens.
- Pure string export — no runtime deps.
- Deduplicate against the few-shot examples already in `instructions.ts` — design-system file holds *tokens and reusable snippets*, not full pages.

**Injection point:** modify `buildToolInstruction()` at [instructions.ts:92-126](../../src/lib/prompts/instructions.ts#L92-L126):

```ts
// pseudocode
import { getDesignSystemContext } from './design-system';

export function buildToolInstruction(toolNames, { targetArtifactId, canvasMode }) {
  // existing logic...
  let block = ARTIFACT_TYPE_INSTRUCTIONS[targetType];
  block += '\n\n---\n\n## Design System Reference\n' + getDesignSystemContext(targetType);
  return block;
}
```

This means the design-system context is **only loaded when an artifact tool is going to be invoked** — no impact on chat-only turns.

---

## 5. Section 4.4 — Validation pipeline + 1-shot auto-fix

### 5.1 What to validate

**`text/html`** (using `parse5`):
1. Document parses without fatal errors
2. Has `<!DOCTYPE html>` (case-insensitive)
3. Has `<html>`, `<head>`, `<body>`
4. Has `<meta name="viewport">` in `<head>`
5. Has `<title>` (non-empty)
6. Total inline `<style>` content ≤ 10 non-blank lines (forces Tailwind usage)
7. No `action=` attribute on `<form>` (sandbox blocks it — would be a silent UX bug)
8. No `<a href="http...">` to non-allowlisted domains (warning, not error — Tailwind/Fonts CDN ok)

**`application/react`** (using `@babel/parser` with JSX plugin):
1. Source parses as valid JSX/ES2022
2. Contains `export default` (function or const)
3. No top-level `import` from outside the whitelist (`react`, `recharts`, `lucide-react`, `framer-motion`)
4. No `class XYZ extends React.Component` (must be function component)
5. No `document.querySelector` / `document.getElementById` (must use refs)

Both: existing 512 KB size cap is preserved.

### 5.2 Where it slots in

Insert a new function `validateArtifactContent(type, content): { ok: boolean; errors: string[] }` and call it in [create-artifact.ts:64](../../src/lib/tools/builtin/create-artifact.ts#L64) — **after** the size check, **before** the S3 upload at line 66. Same hook in [update-artifact.ts](../../src/lib/tools/builtin/update-artifact.ts) right after its size check.

### 5.3 Auto-fix flow

```
LLM emits artifact
   ↓
size check (existing)
   ↓
validateArtifactContent()
   ├── ok → continue to S3 upload (existing flow)
   └── errors →
        if (retryCount === 0):
          throw a tool-result error containing:
            "Your <type> artifact has issues that will prevent it from rendering:
             - <error 1>
             - <error 2>
             Please fix these and call create_artifact again with the corrected content."
          (Vercel AI SDK will surface this back to the LLM as a tool-error message;
           the LLM gets ONE retry round-trip — we do NOT recursively call inside the tool)
        if (retryCount === 1):
          persist as-is, set Document.metadata.validationWarnings = errors
          (so the renderer can show a warning banner)
```

We rely on the AI SDK's natural tool-error → retry loop rather than building a custom retry inside the tool. This keeps the tool pure and observable in tool-call traces. The "max 1 retry" rule is enforced by adding a counter to the tool input schema (`_attempt?: number`) — on the first call it's undefined/0, on retry the LLM must pass `_attempt: 1`. If we receive `_attempt >= 1` and validation still fails, we persist with warnings.

**Alternative considered:** in-tool retry by re-prompting via a sub-LLM call. **Rejected** because (a) it doubles latency invisibly, (b) breaks streaming, (c) hides the failure from observability.

### 5.4 Dependencies to add

```bash
bun add parse5 @babel/parser
bun add -d @types/babel__parser
```

- `parse5` (~95 KB minified) — well-maintained, official WHATWG parser
- `@babel/parser` — already a transitive dep of many things in this project; explicit add makes it discoverable

### 5.5 Latency impact

- HTML parse: ~3-8 ms for typical 10-30 KB documents
- React parse: ~5-15 ms for typical components
- Combined validation: **< 25 ms** in the happy path
- Retry path: +1 full LLM round-trip (~2-6 s) — only triggered on failures (~10-15 % of generations based on current observed bad output rate)

### 5.6 Files touched

- **New**: `src/lib/prompts/design-system.ts`
- **New**: `src/lib/tools/builtin/_validate-artifact.ts` (helper, prefixed underscore = not exported as a tool)
- **Edit**: `src/lib/prompts/instructions.ts` (rewrite two map entries + import design-system + extend `buildToolInstruction`)
- **Edit**: `src/lib/tools/builtin/create-artifact.ts` (call validator, surface errors as tool-error)
- **Edit**: `src/lib/tools/builtin/update-artifact.ts` (same)
- **Edit**: `package.json` (+ `parse5`, `@babel/parser`)
- **Tests**: add `*.test.ts` next to `_validate-artifact.ts` covering the happy path and each rejection rule

---

## 6. Section 4.5 — Implementation Order

| # | Task | Files | New deps | Notes |
|---|---|---|---|---|
| 1 | Rewrite `ARTIFACT_TYPE_INSTRUCTIONS['text/html']` and `['application/react']` | `instructions.ts` | none | Highest leverage. Ship on its own and measure quality lift before doing anything else. |
| 2 | Create `design-system.ts` + wire into `buildToolInstruction()` | `design-system.ts`, `instructions.ts` | none | Modest additional lift; isolates tokens for future iteration. |
| 3 | Create `_validate-artifact.ts` + call from `create-artifact.ts` and `update-artifact.ts` | `_validate-artifact.ts`, `create-artifact.ts`, `update-artifact.ts` | `parse5`, `@babel/parser` | Eliminates the most common runtime failures (broken imports, missing `export default`, missing viewport). |
| 4 | Validator unit tests | `_validate-artifact.test.ts` | none | Cover happy path + each rule. |
| 5 | Few-shot tuning | `instructions.ts` | none | Iterate on examples after running 30-50 real prompts and noting failures. |

**Ship strategy:** land step 1 alone first (single PR). Measure. Then bundle 2-4 in a second PR. Step 5 is ongoing.

---

## 7. Verification Plan (end-to-end)

1. `bun lint` and `bun check:thin-routes` pass.
2. New unit tests: `bun test src/lib/tools/builtin/_validate-artifact.test.ts`.
3. Manual happy-path: `bun dev`, open chat, prompt `"create an HTML landing page for a coffee subscription"`. Confirm rendered output:
   - Has Inter loaded
   - Has at most 5 colors
   - Renders correctly at 360px width
   - All buttons have visible focus rings
4. Manual failure-path: prompt the LLM with a request that historically produced a bad import (`"create a React component that imports zustand"`). Confirm:
   - First attempt fails validation
   - Tool-error is surfaced
   - LLM retries with corrected code (no zustand import)
   - Second attempt validates and persists
5. Regression: existing artifacts still load (run an `update_artifact` against an existing HTML doc).
6. Token-budget check: dump the final system prompt for an artifact-creation turn and confirm total stays within model context (target < 8k tokens of system content).

---

## 8. Summary

### Top 5 most impactful additions vs current instructions

1. **Concrete design tokens** — palette, type scale, spacing, radii, container widths — replacing vague "use rounded-lg/xl" hints
2. **"NEVER truncate, NEVER use placeholders" + complete few-shot examples** — borrowed from bolt.new's rule 11; this single rule kills the most common quality complaint
3. **Correct, exhaustive library whitelist for React** including `framer-motion@11` (currently missing) and the fact that libraries are **window globals, not imports**
4. **A11y baseline** — focus rings, sr-only, ARIA — currently entirely absent
5. **Server-side validation + 1-shot auto-fix** — turns the soft "please don't import zustand" into a hard rejection that the LLM can actually correct

### Most surprising / valuable pattern from references

**bolt.new's "Think HOLISTICALLY" + "Always provide the FULL, updated content" pair (rules 1 and 11).** Most of our current "AI-looking" output comes not from bad design taste but from the LLM truncating mid-document or hand-waving with `<!-- ... -->`. A single sentence of strict "no truncation, no placeholders" — combined with two complete few-shot examples that show what "complete" means — is empirically the cheapest, highest-leverage prompt change you can make. v0 and Lovable both lean on design-system rules; bolt.new is the one that nails completeness, and that's the gap most acutely visible in our current output.

### What we explicitly did NOT copy

- v0's shadcn/ui component vocabulary (we don't have shadcn in the iframe)
- Lovable's "edit `index.css` and `tailwind.config.ts`" workflow (we use the Tailwind CDN, no config file)
- bolt.new's `<boltArtifact>` / `<boltAction>` XML wrapper (we have our own tool-call protocol)
- All references' Next.js / Vite / WebContainers tooling instructions
