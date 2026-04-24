// @aesthetic: playful
// @fonts: Fredoka:wght@400;500;600;700

function App() {
  const [picked, setPicked] = useState(null);
  const COLORS = [
    { name: 'Bubblegum', hex: '#f472b6' },
    { name: 'Sunshine', hex: '#fde047' },
    { name: 'Grass',     hex: '#84cc16' },
    { name: 'Sky',       hex: '#38bdf8' },
    { name: 'Grape',     hex: '#a855f7' },
    { name: 'Coral',     hex: '#fb7185' },
  ];

  return (
    <div className="min-h-screen bg-[#dcfce7] text-[#166534] font-['Fredoka'] antialiased p-8">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm uppercase font-semibold tracking-wider text-[#f97316] mb-3">step 1 of 3</p>
        <h1 className="text-5xl font-bold leading-[0.95] mb-4">What's your <span className="text-[#f97316]">favorite</span> color?</h1>
        <p className="text-lg text-[#166534]/70 mb-10">Tap one — we'll make everything a little bit this color.</p>

        <div className="grid grid-cols-3 gap-4">
          {COLORS.map((c) => {
            const isPicked = picked?.name === c.name;
            return (
              <button key={c.name} type="button" onClick={() => setPicked(c)}
                className={`aspect-square rounded-3xl flex flex-col items-center justify-center shadow-[0_6px_0_rgba(22,101,52,0.18)] hover:shadow-[0_3px_0_rgba(22,101,52,0.18)] hover:translate-y-0.5 transition ${isPicked ? 'ring-4 ring-[#166534]' : ''}`}
                style={{ backgroundColor: c.hex }}>
                <span className="text-4xl mb-2" aria-hidden>{isPicked ? '✓' : ''}</span>
                <span className="text-sm font-semibold">{c.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <div className="flex gap-2">
            <span className="w-10 h-2 rounded-full bg-[#f97316]" />
            <span className="w-2 h-2 rounded-full bg-[#166534]/25" />
            <span className="w-2 h-2 rounded-full bg-[#166534]/25" />
          </div>
          <button type="button" disabled={!picked}
            className={`px-8 py-3 rounded-full font-semibold transition ${picked ? 'bg-[#f97316] text-white shadow-[0_4px_0_rgba(249,115,22,0.35)] hover:shadow-[0_2px_0_rgba(249,115,22,0.35)] hover:translate-y-0.5' : 'bg-[#166534]/10 text-[#166534]/40 cursor-not-allowed'}`}>
            next
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
