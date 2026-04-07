/**
 * Curated design-system reference snippets injected into the system prompt
 * when the LLM is about to emit an HTML or React artifact.
 *
 * Kept intentionally compact (~3k tokens total) so it does not bloat the
 * context window. Holds reusable component snippets — NOT full pages.
 * Few-shot examples for whole pages live in instructions.ts.
 */

import type { ArtifactType } from "@/features/conversations/components/chat/artifacts/types"

const SHARED_TOKENS = `## Design Tokens (use these literal Tailwind classes)

**Primary brand (pick ONE per artifact, stay with it):**
- indigo-600 / indigo-700 (default for productivity)
- blue-600 / blue-700 (data, dashboards)
- emerald-600 / emerald-700 (finance, growth)
- rose-600 / rose-700 (consumer, social)
- amber-500 / amber-600 (warm, marketplaces)
- slate-900 (luxury, editorial)

**Neutrals (always present):**
- bg-slate-50 (page background)
- bg-white (card surface)
- border-slate-200 (default borders)
- text-slate-900 (primary text)
- text-slate-600 (secondary text)
- text-slate-500 (tertiary / hints)

**Status colors (use sparingly):**
- emerald-600 (success / positive delta)
- rose-600 (error / negative delta)
- amber-500 (warning)

**Shadows:** shadow-sm (resting card) → shadow-md (hover) → shadow-lg (modal/popover)
**Radii:** rounded-lg (button, input) · rounded-xl (small card) · rounded-2xl (card) · rounded-full (pill, avatar)
**Transitions:** add \`transition\` to anything that hovers. For motion: \`duration-200\` (snappy), \`duration-300\` (default).
`

const HTML_PATTERNS = `## HTML Reusable Snippets

**Navbar:**
\`\`\`html
<header class="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
  <nav class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div class="h-8 w-8 rounded-lg bg-indigo-600 grid place-items-center text-white font-bold">A</div>
      <span class="font-semibold">Brand</span>
    </div>
    <div class="hidden md:flex items-center gap-8 text-sm text-slate-600">
      <a href="#" class="hover:text-slate-900">Features</a>
      <a href="#" class="hover:text-slate-900">Pricing</a>
    </div>
    <button type="button" class="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">Get started</button>
  </nav>
</header>
\`\`\`

**Hero:**
\`\`\`html
<section class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-32 text-center">
  <span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium">New release</span>
  <h1 class="mt-6 text-4xl md:text-6xl font-bold tracking-tight text-balance">Headline that sells.</h1>
  <p class="mt-6 max-w-2xl mx-auto text-lg text-slate-600 text-pretty leading-relaxed">One sentence value prop, mentioning the audience and the outcome.</p>
  <div class="mt-10 flex items-center justify-center gap-3">
    <button type="button" class="h-12 px-6 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition">Primary CTA</button>
    <button type="button" class="h-12 px-6 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition">Secondary</button>
  </div>
</section>
\`\`\`

**Card grid (3-up responsive):**
\`\`\`html
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
  <article class="rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
    <div class="h-10 w-10 rounded-lg bg-indigo-100 text-indigo-600 grid place-items-center">★</div>
    <h2 class="mt-4 text-lg font-semibold">Feature title</h2>
    <p class="mt-2 text-sm text-slate-600 leading-relaxed">One concrete benefit, one sentence.</p>
  </article>
</div>
\`\`\`

**Form field:**
\`\`\`html
<label class="flex flex-col gap-1.5">
  <span class="text-sm font-medium">Email</span>
  <input type="email" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
</label>
\`\`\`

**Modal-like overlay (uses native <dialog>):**
\`\`\`html
<dialog id="m" class="rounded-2xl border border-slate-200 shadow-lg p-6 max-w-md backdrop:bg-slate-900/40">
  <h2 class="text-lg font-semibold">Confirm action</h2>
  <p class="mt-1 text-sm text-slate-600">Are you sure?</p>
  <div class="mt-6 flex justify-end gap-2">
    <button type="button" onclick="document.getElementById('m').close()" class="h-10 px-4 rounded-lg border border-slate-300 text-sm">Cancel</button>
    <button type="button" class="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm">Confirm</button>
  </div>
</dialog>
\`\`\`
`

const REACT_PATTERNS = `## React Reusable Snippets

**Stat card:**
\`\`\`jsx
<div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
  <div className="text-sm text-slate-500">Revenue</div>
  <div className="mt-1 text-2xl font-semibold tracking-tight">$108k</div>
  <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
    <LucideReact.TrendingUp size={14} /> +18.2%
  </div>
</div>
\`\`\`

**Tabs:**
\`\`\`jsx
const [view, setView] = useState('overview');
<div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
  {['overview','activity','settings'].map((t) => (
    <button
      key={t}
      type="button"
      role="tab"
      aria-selected={view === t}
      onClick={() => setView(t)}
      className={\`h-8 px-3 rounded-md text-sm font-medium transition \${view === t ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}\`}
    >{t}</button>
  ))}
</div>
\`\`\`

**Table:**
\`\`\`jsx
<div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-slate-50 text-slate-500">
      <tr>
        <th className="text-left font-medium px-4 py-3">Name</th>
        <th className="text-left font-medium px-4 py-3">Status</th>
        <th className="text-right font-medium px-4 py-3">Amount</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-200">
      {rows.map(r => (
        <tr key={r.id} className="hover:bg-slate-50">
          <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
          <td className="px-4 py-3"><span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">{r.status}</span></td>
          <td className="px-4 py-3 text-right tabular-nums">\${r.amount}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
\`\`\`

**Empty state:**
\`\`\`jsx
<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
  <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 grid place-items-center text-slate-400">
    <LucideReact.Inbox size={20} />
  </div>
  <h3 className="mt-3 text-sm font-semibold text-slate-900">No items yet</h3>
  <p className="mt-1 text-sm text-slate-500">Create your first item to get started.</p>
  <button type="button" className="mt-4 h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">New item</button>
</div>
\`\`\`

**Skeleton loader:**
\`\`\`jsx
<div className="rounded-2xl bg-white border border-slate-200 p-6 animate-pulse">
  <div className="h-4 w-1/3 rounded bg-slate-200" />
  <div className="mt-3 h-8 w-2/3 rounded bg-slate-200" />
  <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
</div>
\`\`\`

**Recharts line chart:**
\`\`\`jsx
const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = Recharts;
<div className="h-72">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
      <YAxis stroke="#94a3b8" fontSize={12} />
      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
      <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5' }} />
    </LineChart>
  </ResponsiveContainer>
</div>
\`\`\`
`

/**
 * Returns the design-system context block for an artifact type, or empty
 * string for types that don't have curated design guidance.
 */
export function getDesignSystemContext(type: ArtifactType | string): string {
  if (type === "text/html") {
    return `${SHARED_TOKENS}\n${HTML_PATTERNS}`
  }
  if (type === "application/react") {
    return `${SHARED_TOKENS}\n${REACT_PATTERNS}`
  }
  return ""
}
