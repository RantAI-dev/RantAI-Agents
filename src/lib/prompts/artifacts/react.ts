export const reactArtifact = {
  type: "application/react" as const,
  label: "React Component",
  summary:
    "Single React 18 component with Recharts/Lucide/Motion globals, transpiled by Babel and rendered in an iframe.",
  rules: `**application/react — Self-contained React Components**

You are generating a single React component that will be transpiled by Babel-standalone and rendered into a sandboxed iframe at \`#root\`. Output must be production-grade AND visually distinctive. The failure mode to avoid is a generic "SaaS dashboard" that looks like every other AI-generated component.

## Runtime Environment
**Libraries are exposed as window globals — do NOT \`import\` from them. Just use them directly.**

| Global | What | Version |
|---|---|---|
| \`React\` + all hooks (\`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`useReducer\`, \`useContext\`, \`useId\`, \`useTransition\`, \`useDeferredValue\`, \`useLayoutEffect\`, \`useSyncExternalStore\`, \`useInsertionEffect\`, \`createContext\`, \`forwardRef\`, \`memo\`, \`Fragment\`, \`Suspense\`, \`lazy\`, \`startTransition\`, \`createElement\`, \`isValidElement\`, \`Children\`, \`cloneElement\`) — pre-destructured into scope | React | 18 |
| \`Recharts\` — \`<LineChart>\`, \`<BarChart>\`, \`<PieChart>\`, \`<AreaChart>\`, \`<ResponsiveContainer>\`, \`<Tooltip>\`, etc. | charts | 2 |
| \`LucideReact\` — \`LucideReact.ArrowRight\`, \`LucideReact.Check\`, ... | icons | 0.454 |
| \`Motion\` — \`Motion.motion.div\`, \`Motion.AnimatePresence\` | framer-motion | 11 |
| **Tailwind CSS v3** — utility classes available globally | styling | CDN |

You CAN write \`import\` lines — the preprocessor strips them — but only from: \`react\`, \`recharts\`, \`lucide-react\`, \`framer-motion\`. Anything else is silently dropped. Cleanest output: skip imports, use globals.

**Sandbox**: \`allow-scripts\` only — no modals, no real form submission, no popups, no real navigation. All forms must use \`onSubmit={(e) => { e.preventDefault(); ... }}\`. No \`window.open\`, no \`location.href = ...\`. **No real network** — mock all data.

## Required Component Shape
\`\`\`jsx
// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
function App() {
  return <div className="min-h-screen bg-[#faf5ef] text-[#0a0a0a] font-['Inter'] antialiased">...</div>;
}
export default App;
\`\`\`
- **Line 1 MUST be** \`// @aesthetic: <direction>\` (required).
- **Line 2 MAY be** \`// @fonts: Family:spec, Family:spec\` (optional, defaults applied per direction).
- **MUST** have \`export default\` (function or const).
- **MUST** be a function component. **NEVER** \`class extends React.Component\`.
- **NEVER** \`document.querySelector\` / \`document.getElementById\`. Use \`useRef\`.
- **NEVER** import a CSS file. Tailwind is already loaded.

## Aesthetic Direction — Pick ONE and Commit

For every React artifact, pick a distinctive aesthetic direction BEFORE writing code. Do NOT default to "slate-900 + indigo-600 + Inter" — that is the AI-slop failure mode.

| Direction | When to pick (signals in user prompt) |
|---|---|
| \`editorial\` | article, blog, story, brand page, about, long-form, "magazine", "essay layout" |
| \`brutalist\` | indie tool, manifesto, dev product, raw, punky, no-BS, hacker, anti-corporate |
| \`luxury\` | premium, hospitality, fashion, watches, "high-end", "refined", "timeless" |
| \`playful\` | kids, onboarding, creative tool, fun, friendly, consumer app, gamification |
| \`industrial\` | dashboard, admin, monitoring, analytics, status, ops, "data-heavy" |
| \`organic\` | wellness, sustainability, food, skincare, crafts, artisan, natural |
| \`retro-futuristic\` | gaming, sci-fi, events, synthwave, cyberpunk, 80s, music/DJ |

**Ambiguous cases:** default to \`editorial\` (opinionated "thoughtful general-purpose", explicitly NOT the old slate+indigo).

**User override:** if the user says "make it brutalist" or "use luxury styling", honor that verbatim regardless of content signal.

## Directive Syntax

**Line 1 of the file (required, no preamble, no leading blank lines, no other comments before it):** \`// @aesthetic: <direction>\` where \`<direction>\` is exactly one of:
\`editorial | brutalist | luxury | playful | industrial | organic | retro-futuristic\`

**Line 2 of the file (optional, immediately after @aesthetic):** \`// @fonts: Family:spec, Family:spec\` — comma-separated Google Fonts family specs. Max 3 families. Omit to use the direction's default pairing.

Valid family spec shapes:
- \`Inter:wght@400;500;700\`
- \`Fraunces:ital,wght@0,400;1,700\`
- \`Fraunces:opsz,wght@9..144,300..900\`
- \`Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900\`

## Design System per Direction

### editorial — content-first, reading-oriented
**Fonts:** \`Fraunces\` (display, variable ital+opsz+wght) + \`Inter\` (body). Optionally \`Newsreader\` for body as an alternative.
**Palette:** bone (\`#faf5ef\`, \`#f5f0e6\`) + ink (\`#0a0a0a\`, \`#1c1917\`) + warm neutrals (\`#78716c\`) + ONE bold accent from: terracotta \`#c2410c\`, bottle green \`#065f46\`, deep burgundy \`#7f1d1d\`, ultramarine \`#1e3a8a\`.
**Rhythm:** Generous whitespace. \`py-24 md:py-32\` sections. Asymmetric 12-col grids (7+5, 8+4). Pull quotes. Drop caps via \`first-letter:text-7xl first-letter:font-['Fraunces']\`.
**Buttons:** \`px-6 py-3 border border-[#0a0a0a] text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#faf5ef] transition\` — flat, bordered, no shadow.
**Cards:** content blocks with top/bottom rules, no boxes.
**Motion:** \`duration-500\` \`ease-[cubic-bezier(0.22,1,0.36,1)]\`. Stagger delays 80–120ms on scroll reveals.

### brutalist — raw, punky, anti-corporate
**Fonts:** \`Space Grotesk\` 700 or \`Archivo Black\` (display) + \`JetBrains Mono\` or \`IBM Plex Mono\` (body/UI).
**Palette:** pure white (\`#ffffff\`) + pure black (\`#000000\`) + ONE acid accent: acid yellow \`#facc15\`, alert red \`#dc2626\`, electric blue \`#2563eb\`, lime \`#84cc16\`. No gradients. No grays except \`#e5e5e5\` for rules.
**Rhythm:** Dense. Visible grid (dashed borders). Sharp corners — \`rounded-none\`. Offset layouts (negative margins, intentional broken alignment).
**Buttons:** \`px-4 py-2 bg-black text-white border-2 border-black hover:bg-[#facc15] hover:text-black transition-none\` — instant, no easing.
**Cards:** \`border-2 border-black rounded-none\`, no shadow.
**Inputs:** \`border-b-2 border-black bg-transparent rounded-none\` or fully bordered sharp corners.
**Motion:** \`duration-75\` to \`duration-150\`, \`ease-linear\` or no ease. Snap transitions, no fades.

### luxury — premium, refined, timeless
**Fonts:** \`DM Serif Display\` or \`Cormorant Garamond\` 300/500/700 (display) + \`DM Sans\` 300/400/500 or \`Work Sans\` (body).
**Palette:** near-black \`#0c0a09\` \`#1c1917\` + cream \`#faf5ef\` \`#fefdfb\` + gold \`#d4af37\` \`#b8860b\` + warm gray \`#78716c\`. No indigo. No purple. No bright anything.
**Rhythm:** Very generous. Tight leading on display (\`leading-[0.95]\`). \`tracking-wide\` / \`tracking-widest\` on small-caps labels.
**Buttons:** \`px-8 py-4 bg-[#0c0a09] text-[#d4af37] border border-[#d4af37] hover:bg-[#d4af37] hover:text-[#0c0a09] transition-all duration-500\`.
**Cards:** thin gold hairline borders (\`border border-[#d4af37]/30\`), no shadow.
**Motion:** \`duration-500\` to \`duration-700\`, \`ease-[cubic-bezier(0.33,1,0.68,1)]\`. Staggered parallax on hero.

### playful — rounded, pastel, toy-like
**Fonts:** \`Fredoka\` 400/500/600/700 or \`Quicksand\` 400/500/700 (display + body — same family different weights is OK).
**Palette:** pastel backgrounds from \`#fce7f3\` pink, \`#e0e7ff\` indigo, \`#dcfce7\` green, \`#fef3c7\` yellow, \`#fae8ff\` purple + ONE vivid anchor: \`#f97316\` orange, \`#a855f7\` purple, \`#06b6d4\` cyan, \`#ec4899\` pink.
**Rhythm:** Rounded everything — \`rounded-2xl\`, \`rounded-3xl\`, \`rounded-full\`. Generous padding. Oversized type (\`text-5xl md:text-6xl\` hero).
**Buttons:** \`px-6 py-3 bg-[vivid] text-white rounded-full shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:shadow-[0_2px_0_rgba(0,0,0,0.1)] hover:translate-y-0.5 transition\`.
**Cards:** \`rounded-3xl bg-[pastel] shadow-none border-none\`.
**Motion:** Bouncy springs via Motion library — \`Motion.motion.div\` with \`transition={{ type: "spring", stiffness: 200, damping: 15 }}\`. Overshoot, wobble, stagger.

### industrial — dense, functional, data-heavy
**Fonts:** \`Inter Tight\` 400/500/700 or \`Archivo\` (display/body) + \`Space Mono\` 400/700 or \`JetBrains Mono\` (tabular data / IDs / timestamps).
**Palette:** slate-950 \`#020617\` or slate-900 \`#0f172a\` dark text + slate-50/100 light surfaces + ONE functional accent (\`#3b82f6\` blue primary) + status colors (\`#10b981\` emerald up, \`#f43f5e\` rose down, \`#f59e0b\` amber warn). Multi-color OK because functional.
**Rhythm:** Dense. Grid-heavy. Tabular alignment. \`gap-px\` grids with dividers. Sparklines inline. \`tabular-nums\` for numbers. Right-align numeric columns.
**Buttons:** \`h-9 px-3 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500\`.
**Cards:** \`rounded-lg border border-slate-200 bg-white shadow-sm\`.
**Motion:** Minimal or none. Updates feel instant. Skeletons over spinners. \`duration-150 ease-out\` max. **Using Motion library here triggers a validator warning.**

### organic — earthy, humanist, warm
**Fonts:** \`Fraunces\` (variable) or \`Public Sans\` 400/500/700 (display) + \`Public Sans\` 400/500 or \`Crimson Pro\` 400/500/600 (body). Mix humanist sans + soft serif.
**Palette:** bone \`#faf5ef\` + moss \`#3f6212\` \`#65a30d\` + terracotta \`#c2410c\` \`#ea580c\` + sand/taupe \`#a8a29e\` \`#d6d3d1\`. Warm, earthy. No cool blues. No pure gray.
**Rhythm:** Medium-generous. Soft curves — \`rounded-xl\` or \`rounded-2xl\` but never \`rounded-3xl\`. Asymmetric but gentle. Italic Fraunces as handwritten-style accents.
**Buttons:** \`px-6 py-3 rounded-full bg-[#3f6212] text-[#faf5ef] hover:bg-[#2d4a0d] transition-all duration-300\`.
**Cards:** \`rounded-2xl bg-[#faf5ef] border border-[#a8a29e]/20 shadow-[0_1px_2px_rgba(120,113,108,0.05)]\` — very soft shadow.
**Motion:** Soft. \`duration-300\` to \`duration-500\`, \`ease-in-out\`.

### retro-futuristic — neon, tabular, glitch
**Fonts:** \`VT323\` or \`Major Mono Display\` or \`Orbitron\` 400/700/900 (display) + \`Space Mono\` 400/700 or \`Share Tech Mono\` (body).
**Palette:** black \`#030712\` or deep purple \`#1e0a2e\` bg + neon accents: cyan \`#22d3ee\`, magenta \`#e879f9\`, lime \`#84cc16\`, hot pink \`#f472b6\`, electric yellow \`#fde047\`. Optional gradient between two neons.
**Rhythm:** Monospace tabular. Visible grid lines. Scanline textures via \`background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)\`. Chromatic aberration on hover (dual-color text-shadow offsets).
**Buttons:** \`px-6 py-2 bg-transparent border border-[#22d3ee] text-[#22d3ee] hover:shadow-[0_0_20px_currentColor] transition\`.
**Cards:** \`border border-[#22d3ee] bg-black/50 backdrop-blur-sm\`.
**Text effects:** neon glow via \`drop-shadow-[0_0_10px_currentColor]\` or arbitrary \`text-shadow\` utility.
**Motion:** Glitch effects, scanline scrolls, chromatic splits on hover. \`duration-75\` snap + subtle flicker loops via \`@keyframes\`.

## State Patterns
- **Forms:** controlled components, validate on submit, inline \`aria-invalid\` errors.
- **Mock fetching:** \`useEffect\` + \`setTimeout\`, show skeleton while loading.
- **Tabs:** \`const [view, setView] = useState('overview')\` with \`role="tablist"\` and \`aria-selected\`.

## Accessibility
- Every \`<button>\` has \`type="button"\` (or \`type="submit"\` inside a form).
- Icon-only buttons: \`<span className="sr-only">Description</span>\`.
- Form labels paired via \`htmlFor\`/\`id\`. Visible focus ring on every interactive element.
- \`aria-live\` for dynamic status. Color contrast ≥ 4.5:1 at all times (yes, even in retro-futuristic — neon on black is fine; neon on neon is not).

## Code Quality — STRICT
- **NEVER truncate.** No \`/* ...rest of component... */\`. Output the COMPLETE component.
- **NEVER use placeholders** like \`Lorem ipsum\` — write realistic direction-appropriate copy.
- Mock data should be realistic and named (\`const RECENT_ORDERS = [{ id: 'ORD-1041', customer: 'Sara Chen', total: 248.00 }, ...]\`).
- No dead code, no commented-out alternatives.
- \`useCallback\`/\`useMemo\` only when there is an actual perf reason.
- List keys must be stable IDs, never array indexes (unless the list is truly static).

## Anti-Patterns
- ❌ Missing \`// @aesthetic:\` directive on line 1 (hard-error at validation)
- ❌ Unknown aesthetic direction name (hard-error)
- ❌ Malformed \`@fonts\` spec (hard-error)
- ❌ More than 3 font families (hard-error)
- ❌ Mixing directions in one artifact — commit to ONE
- ❌ Silently defaulting to slate-900 + indigo-600 without \`@aesthetic: industrial\` (palette-mismatch warn)
- ❌ Motion library under \`@aesthetic: industrial\` (warn — industrial wants stillness)
- ❌ Editorial/luxury without a serif in \`@fonts\` (font-mismatch warn)
- ❌ \`import { Card } from 'shadcn/ui'\` — shadcn is NOT available, build with raw Tailwind
- ❌ \`import './styles.css'\` — silently dropped
- ❌ \`class MyComponent extends React.Component\`
- ❌ \`document.getElementById('foo')\`
- ❌ Emoji as functional icons (use \`LucideReact.X\`)
- ❌ Real \`fetch()\` calls
- ❌ \`<form action="/submit">\` — use \`onSubmit\` with \`e.preventDefault()\`
- ❌ More than 5 distinct hues per artifact (status colors in industrial — emerald/rose/amber — count as functional not decorative, and don't count toward the 5)
- ❌ Truncating "for brevity"`,
  examples: [
    {
      label: "dashboard with Recharts",
      code: `const REVENUE = [
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

export default App;`,
    },
  ],
}
