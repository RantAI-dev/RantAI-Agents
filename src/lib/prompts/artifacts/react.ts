export const reactArtifact = {
  type: "application/react" as const,
  label: "React Component",
  summary:
    "Single React 18 component with Recharts/Lucide/Motion globals, transpiled by Babel and rendered in an iframe.",
  rules: `**application/react — Self-contained React Components**

You are generating a single React component that will be transpiled by Babel-standalone and rendered into a sandboxed iframe at \`#root\`. Output must be v0/Lovable-quality.

## Runtime Environment
**Libraries are exposed as window globals — do NOT \`import\` from them. Just use them directly.**

| Global | What | Version |
|---|---|---|
| \`React\` + all hooks (\`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`useReducer\`, \`useContext\`, \`useId\`, \`useTransition\`, \`useDeferredValue\`, \`useLayoutEffect\`, \`useSyncExternalStore\`, \`useInsertionEffect\`, \`createContext\`, \`forwardRef\`, \`memo\`, \`Fragment\`, \`Suspense\`, \`lazy\`, \`startTransition\`, \`createElement\`, \`isValidElement\`, \`Children\`, \`cloneElement\`) — pre-destructured into scope | React | 18 |
| \`Recharts\` — \`<LineChart>\`, \`<BarChart>\`, \`<PieChart>\`, \`<AreaChart>\`, \`<ResponsiveContainer>\`, \`<Tooltip>\`, etc. | charts | 2 |
| \`LucideReact\` — \`LucideReact.ArrowRight\`, \`LucideReact.Check\`, ... | icons | 0.454 |
| \`Motion\` — \`Motion.motion.div\`, \`Motion.AnimatePresence\` | framer-motion | 11 |
| **Tailwind CSS v3** — utility classes available globally | styling | CDN |

You CAN write \`import\` lines — the preprocessor strips them — but only from: \`react\`, \`recharts\`, \`lucide-react\`, \`framer-motion\`. Anything else is silently dropped and your component will crash. Cleanest output: skip imports, use globals.

**Sandbox**: \`allow-scripts\` only — no modals, no real form submission, no popups, no real navigation. All forms must use \`onSubmit={(e) => { e.preventDefault(); ... }}\`. No \`window.open\`, no \`location.href = ...\`. **No real network** — mock all data.

## Required Component Shape
\`\`\`jsx
function App() {
  const [value, setValue] = useState(0);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased p-6">
      {/* content */}
    </div>
  );
}

export default App;
\`\`\`
- **MUST** have \`export default\` (function or const). The renderer keys off this.
- **MUST** be a function component. **NEVER** \`class extends React.Component\`.
- **NEVER** \`document.querySelector\` / \`document.getElementById\`. Use \`useRef\`.
- **NEVER** import a CSS file. Tailwind is already loaded.
- Top-level wrapper sets \`min-h-screen\`, background, text color, font, base padding.

## Design System
Same palette / typography / spacing / cards / container as the HTML type:
- ONE primary (\`indigo-600\` / \`blue-600\` / \`emerald-600\` / \`rose-600\` / \`slate-900\`), slate neutrals, ≤ 5 colors. No purple unless asked.
- Display \`text-4xl md:text-5xl font-bold tracking-tight\` · H2 \`text-2xl font-semibold\` · body \`text-base leading-relaxed text-slate-700\` · small \`text-sm text-slate-500\`
- Tailwind scale only. Cards \`p-6\`, sections \`py-12\`/\`py-20\`, gaps \`gap-4\`/\`gap-6\`/\`gap-8\`
- Cards: \`rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition\`
- Buttons: \`h-11 px-5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed\`
- Inputs: \`h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500\`
- Container: \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`. Mobile-first. Flexbox first.

## State Patterns
- **Forms:** controlled components, validate on submit, inline \`aria-invalid\` errors.
- **Mock fetching:** \`useEffect\` + \`setTimeout\`, show skeleton while loading.
- **Tabs:** \`const [view, setView] = useState('overview')\` with \`role="tablist"\` and \`aria-selected\`.

## Accessibility
- Every \`<button>\` has \`type="button"\` (or \`type="submit"\` inside a form).
- Icon-only buttons: \`<span className="sr-only">Description</span>\`.
- Form labels paired via \`htmlFor\`/\`id\`. Visible focus ring on every interactive element.
- \`aria-live\` for dynamic status. Color contrast ≥ 4.5:1.

## Code Quality — STRICT
- **NEVER truncate.** No \`/* ...rest of component... */\`. Output the COMPLETE component.
- **NEVER use placeholders** like \`Lorem ipsum\` for product copy — write realistic text.
- Mock data should be realistic and named (\`const RECENT_ORDERS = [{ id: 'ORD-1041', customer: 'Sara Chen', total: 248.00 }, ...]\`).
- No dead code, no commented-out alternatives.
- \`useCallback\`/\`useMemo\` only when there is an actual perf reason.
- List keys must be stable IDs, never array indexes (unless the list is truly static).

## Anti-Patterns
- ❌ \`import { Card } from 'shadcn/ui'\` — shadcn is NOT available, build cards with raw Tailwind
- ❌ \`import './styles.css'\` — silently dropped
- ❌ \`class MyComponent extends React.Component\`
- ❌ \`document.getElementById('foo')\`
- ❌ Emoji as functional icons (use \`LucideReact.X\`)
- ❌ Real \`fetch()\` calls
- ❌ \`<form action="/submit">\` — use \`onSubmit\` with \`e.preventDefault()\`
- ❌ More than 5 colors / more than 2 fonts
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
