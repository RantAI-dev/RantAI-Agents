// @aesthetic: luxury
// @fonts: DM Serif Display:wght@400 | DM Sans:wght@300;400;500;700

function App() {
  return (
    <div className="min-h-screen bg-[#0c0a09] text-[#faf5ef] font-['DM_Sans'] antialiased">
      <header className="mx-auto max-w-6xl px-8 py-8 flex items-center justify-between border-b border-[#d4af37]/20">
        <div className="font-['DM_Serif_Display'] text-3xl tracking-tight text-[#d4af37]">Arcadia Atelier</div>
        <nav className="flex gap-10 text-xs uppercase tracking-[0.3em] text-[#faf5ef]/70">
          <a href="#">The House</a><a href="#">Suites</a><a href="#">Reservations</a>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-8 pt-24 pb-32 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-[#d4af37] mb-8">Established 1887 · Palazzo Lombardi</p>
        <h1 className="font-['DM_Serif_Display'] text-6xl md:text-8xl leading-[0.92] tracking-tight max-w-4xl mx-auto">
          Fourteen suites.<br />One century of <em className="italic text-[#d4af37]">quiet</em>.
        </h1>
        <p className="mt-10 text-lg text-[#faf5ef]/70 max-w-xl mx-auto font-light leading-relaxed">
          Our family has kept the lights of this house burning since before the railway came through.
          We do not advertise. We respond to letters.
        </p>
        <button type="button" className="mt-12 px-10 py-4 border border-[#d4af37] text-[#d4af37] text-xs uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-[#0c0a09] transition-all duration-500">
          Request a room
        </button>
      </section>

      <section className="mx-auto max-w-6xl px-8 py-24 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-[#d4af37]/20">
        {[
          { title: 'The Palazzo', body: '14 suites set across three floors of the original Lombardi palace, each overlooking the courtyard gardens.' },
          { title: 'The Cellar', body: 'Private tastings of our family reserve — vintages dating to 1942 — by appointment of the sommelier.' },
          { title: 'The Hours', body: 'Breakfast served until noon. Dinner served when hunger asks. Time is soft here.' },
        ].map((s) => (
          <article key={s.title}>
            <h2 className="font-['DM_Serif_Display'] text-3xl tracking-tight mb-4 text-[#d4af37]">{s.title}</h2>
            <p className="text-sm text-[#faf5ef]/70 leading-relaxed font-light">{s.body}</p>
          </article>
        ))}
      </section>

      <footer className="mx-auto max-w-6xl px-8 py-8 border-t border-[#d4af37]/20 text-xs uppercase tracking-[0.3em] text-[#faf5ef]/50 flex justify-between">
        <span>Arcadia Atelier · Como · Italia</span>
        <span>arcadia@lombardi.it</span>
      </footer>
    </div>
  );
}

export default App;
