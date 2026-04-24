// @aesthetic: retro-futuristic
// @fonts: Orbitron:wght@400;700;900 | Space Mono:wght@400;700

function App() {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const LINEUP = [
    { slot: '22:00', name: 'KYRIA',     tag: 'opening · analog' },
    { slot: '23:30', name: 'NULLSPACE', tag: 'live · drone' },
    { slot: '01:00', name: 'AVGUST',    tag: 'headline · techno' },
    { slot: '03:00', name: 'RES_ERROR', tag: 'closing · glitch' },
  ];

  return (
    <div
      className="min-h-screen bg-[#030712] text-[#22d3ee] font-['Space_Mono'] antialiased relative overflow-hidden"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.04) 2px, rgba(34,211,238,0.04) 4px)' }}
    >
      <header className="px-8 py-6 flex items-center justify-between border-b border-[#22d3ee]/40">
        <div className="font-['Orbitron'] font-black text-2xl tracking-[0.3em]" style={{ textShadow: '0 0 12px currentColor' }}>NULL/NULL</div>
        <div className="text-xs tracking-wider">SYS_UPTIME :: {String(ticks).padStart(6, '0')}</div>
      </header>

      <section className="px-8 py-20">
        <p className="text-xs tracking-[0.4em] text-[#e879f9] mb-6">// SIGNAL_04 · 2026.04.26 · 22:00 → 04:00</p>
        <h1 className="font-['Orbitron'] font-black text-7xl md:text-9xl leading-[0.88] tracking-tight" style={{ textShadow: '0 0 20px currentColor, 0 0 40px currentColor' }}>
          A NIGHT FOR<br />
          <span className="text-[#e879f9]" style={{ textShadow: '0 0 20px currentColor' }}>MACHINES</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm tracking-wider">
          Warehouse 04 · Kreuzberg. Six hours of synthesis, broken drum machines, and tape.
        </p>
        <button type="button"
          className="mt-10 px-8 py-3 border border-[#22d3ee] text-[#22d3ee] text-sm tracking-[0.3em] hover:bg-[#22d3ee] hover:text-[#030712] hover:shadow-[0_0_30px_#22d3ee] transition">
          GET.TICKET →
        </button>
      </section>

      <section className="px-8 py-12 border-t border-[#22d3ee]/40">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-[#22d3ee]/30">
          {LINEUP.map((s) => (
            <div key={s.slot} className="bg-[#030712] px-5 py-6">
              <div className="text-xs tracking-widest text-[#e879f9]">{s.slot}</div>
              <div className="font-['Orbitron'] font-bold text-2xl mt-2" style={{ textShadow: '0 0 8px currentColor' }}>{s.name}</div>
              <div className="text-xs mt-1 text-[#22d3ee]/70">{s.tag}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
