// @aesthetic: industrial
// @fonts: Inter Tight:wght@400;500;700 | Space Mono:wght@400;700

const SERVICES = [
  { id: 'api',      name: 'api-gateway',      p99: 42,  rps: 1840, errors: 0.04, status: 'healthy' },
  { id: 'auth',     name: 'auth-service',     p99: 18,  rps: 620,  errors: 0.00, status: 'healthy' },
  { id: 'billing',  name: 'billing-worker',   p99: 186, rps: 24,   errors: 0.82, status: 'degraded' },
  { id: 'search',   name: 'search-indexer',   p99: 94,  rps: 148,  errors: 0.11, status: 'healthy' },
  { id: 'mailer',   name: 'mailer-consumer',  p99: 612, rps: 12,   errors: 4.10, status: 'failing' },
];
const COLOR = { healthy: 'emerald', degraded: 'amber', failing: 'rose' };

function App() {
  const { ChevronRight, Circle } = LucideReact;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Inter_Tight'] antialiased">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-sm font-semibold tracking-wide">observe · production · us-east-1</h1>
        </div>
        <div className="font-['Space_Mono'] text-xs text-slate-400">last tick 00:12s</div>
      </header>

      <section className="px-6 py-8 grid grid-cols-4 gap-px bg-slate-800">
        {[
          { label: 'Services', value: '5', meta: 'up 3 · degraded 1 · failing 1' },
          { label: 'Total RPS', value: '2,644', meta: '↑ 3.2% vs 1h ago' },
          { label: 'Error rate', value: '0.32%', meta: 'SLO 1.00% — within budget' },
          { label: 'p99 latency', value: '186ms', meta: 'p95 94 · p50 28' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-950 px-4 py-5">
            <div className="text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 font-['Space_Mono'] text-xs text-slate-400">{s.meta}</div>
          </div>
        ))}
      </section>

      <section className="px-6 py-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">service</th>
              <th className="text-right px-3 py-2 font-medium">p99</th>
              <th className="text-right px-3 py-2 font-medium">rps</th>
              <th className="text-right px-3 py-2 font-medium">err%</th>
              <th className="text-left px-3 py-2 font-medium">status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((s) => (
              <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-900/60">
                <td className="px-3 py-3 font-['Space_Mono'] text-slate-200">{s.name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.p99}ms</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.rps.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.errors.toFixed(2)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-${COLOR[s.status]}-500/15 text-${COLOR[s.status]}-400`}>
                    <Circle size={8} fill="currentColor" />{s.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-slate-500"><ChevronRight size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;
