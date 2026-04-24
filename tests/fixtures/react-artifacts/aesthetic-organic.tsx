// @aesthetic: organic
// @fonts: Fraunces:ital,opsz,wght@0,9..144,300..700 | Public Sans:wght@400;500

function App() {
  const PRODUCTS = [
    { id: 'balm',   name: 'Moss Balm',         subtitle: 'oat + calendula',   price: 24 },
    { id: 'rose',   name: 'Rosehip Serum',     subtitle: 'cold-pressed, small batch', price: 38 },
    { id: 'clay',   name: 'Hilltop Clay Mask', subtitle: 'kaolin + chamomile', price: 28 },
  ];

  return (
    <div className="min-h-screen bg-[#faf5ef] text-[#1c1917] font-['Public_Sans'] antialiased">
      <header className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
        <div className="font-['Fraunces'] italic text-2xl text-[#3f6212]">Hillhouse & Fern</div>
        <nav className="flex gap-8 text-sm text-[#78716c]">
          <a href="#">Rituals</a><a href="#">Journal</a><a href="#">Cart (0)</a>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-20 pb-24 grid grid-cols-1 md:grid-cols-12 gap-10 items-end">
        <div className="md:col-span-7">
          <p className="text-xs uppercase tracking-widest text-[#c2410c] mb-4">Spring 2026 · small batch</p>
          <h1 className="font-['Fraunces'] text-6xl leading-[1.02] tracking-tight">
            Skincare made <em className="italic text-[#3f6212]">slowly</em>,<br />
            on a hill in Devon.
          </h1>
        </div>
        <div className="md:col-span-5 text-[#44403c] leading-relaxed">
          <p>Three women. One kitchen. Ingredients foraged within a three-mile walk of the front door. We make eighty jars at a time and ship until they're gone.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {PRODUCTS.map((p) => (
          <article key={p.id} className="rounded-2xl bg-white/60 border border-[#a8a29e]/30 p-6 shadow-[0_1px_2px_rgba(120,113,108,0.05)] transition-all duration-300 hover:shadow-[0_3px_10px_rgba(120,113,108,0.1)]">
            <div className="aspect-[4/5] rounded-xl bg-[#dcfce7]/50 mb-5" />
            <h2 className="font-['Fraunces'] text-xl">{p.name}</h2>
            <p className="italic text-sm text-[#78716c] mt-1">{p.subtitle}</p>
            <div className="mt-6 flex items-baseline justify-between">
              <span className="font-['Fraunces'] text-lg text-[#3f6212]">${p.price}</span>
              <button type="button" className="px-5 py-2 rounded-full bg-[#3f6212] text-[#faf5ef] text-sm hover:bg-[#365314] transition-all duration-300">Add to basket</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default App;
