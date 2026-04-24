// @aesthetic: brutalist
// @fonts: Archivo Black:wght@400, JetBrains Mono:wght@400;700

function App() {
  const [selected, setSelected] = useState('unused');
  const DEPS = [
    { name: 'lodash', size: '71kb', used: 2, total: 289, status: 'unused' },
    { name: 'moment', size: '232kb', used: 0, total: 143, status: 'unused' },
    { name: 'rxjs', size: '164kb', used: 47, total: 210, status: 'partial' },
    { name: 'react', size: '42kb', used: 118, total: 118, status: 'keep' },
  ];
  const filter = (d) => selected === 'all' || d.status === selected;

  return (
    <div className="min-h-screen bg-white text-black font-['JetBrains_Mono'] antialiased">
      <header className="border-b-2 border-black px-6 py-4 flex items-center justify-between">
        <div className="font-['Archivo_Black'] text-3xl">DEADWEIGHT</div>
        <span className="text-sm">v1.2.0 / MIT</span>
      </header>

      <section className="px-6 py-16 border-b-2 border-black bg-[#facc15]">
        <h1 className="font-['Archivo_Black'] text-5xl md:text-7xl leading-[0.9] max-w-4xl uppercase">
          Find the 60% of your bundle you don't actually use.
        </h1>
        <p className="mt-6 text-sm max-w-xl">npm install -g deadweight && deadweight scan ./</p>
      </section>

      <section className="px-6 py-8 border-b-2 border-black">
        <div className="flex gap-2 mb-6">
          {['all', 'unused', 'partial', 'keep'].map((f) => (
            <button key={f} type="button" onClick={() => setSelected(f)}
              className={`px-4 py-2 border-2 border-black text-sm uppercase ${selected === f ? 'bg-black text-white' : 'bg-white text-black hover:bg-[#facc15]'} transition-none`}>
              {f}
            </button>
          ))}
        </div>
        <table className="w-full border-2 border-black">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 text-sm uppercase">package</th>
              <th className="text-right px-4 py-3 text-sm uppercase">size</th>
              <th className="text-right px-4 py-3 text-sm uppercase">used / total</th>
              <th className="text-right px-4 py-3 text-sm uppercase">action</th>
            </tr>
          </thead>
          <tbody>
            {DEPS.filter(filter).map((d) => (
              <tr key={d.name} className="border-t-2 border-black">
                <td className="px-4 py-3 text-sm">{d.name}</td>
                <td className="px-4 py-3 text-sm text-right">{d.size}</td>
                <td className="px-4 py-3 text-sm text-right">{d.used} / {d.total}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <span className={`px-2 py-1 border-2 border-black ${d.status === 'unused' ? 'bg-[#dc2626] text-white' : d.status === 'partial' ? 'bg-[#facc15] text-black' : 'bg-white'}`}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="px-6 py-4 text-xs flex justify-between">
        <span>no telemetry. no npm scripts. read the code.</span>
        <span>github.com/deadweight/cli</span>
      </footer>
    </div>
  );
}

export default App;
