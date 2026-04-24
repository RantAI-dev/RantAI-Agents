// @aesthetic: editorial
// @fonts: Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900 | Inter:wght@400;500;700

const ISSUES = [
  { no: 'No. 14', date: 'April 2026', title: 'The Quiet Renaissance of Small Print' },
  { no: 'No. 13', date: 'March 2026', title: 'On Waiting: A Defense of Slow Books' },
  { no: 'No. 12', date: 'February 2026', title: 'When Typography Stops Being Invisible' },
];

function App() {
  return (
    <div className="min-h-screen bg-[#faf5ef] text-[#0a0a0a] font-['Inter'] antialiased">
      <header className="mx-auto max-w-5xl px-6 py-12 text-center border-b border-[#0a0a0a]">
        <p className="text-xs uppercase tracking-[0.35em] text-[#065f46]">Est. 2019 · Quarterly</p>
        <h1 className="font-['Fraunces'] text-6xl md:text-7xl tracking-tight mt-3 italic">Margin Notes</h1>
        <p className="mt-4 text-sm text-[#78716c]">An irregular magazine about books, type, and the people who still care.</p>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-sm uppercase tracking-widest text-[#065f46] mb-4">From issue no. 14</p>
        <h2 className="font-['Fraunces'] text-5xl md:text-6xl leading-[1.05] tracking-tight mb-8">
          The quiet renaissance of small print.
        </h2>
        <p className="text-lg leading-relaxed text-[#44403c] first-letter:text-7xl first-letter:font-['Fraunces'] first-letter:float-left first-letter:mr-3 first-letter:leading-none first-letter:font-semibold">
          There is a scene at the heart of every independent press: a room, a light, a stack of folded signatures
          waiting to be stitched. For most of the last decade we were told this room was dying. The reports were
          exaggerated. What happened instead was quieter and more interesting.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h3 className="font-['Fraunces'] text-2xl border-b border-[#0a0a0a] pb-4 mb-8 tracking-tight">Back issues</h3>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {ISSUES.map((i) => (
            <li key={i.no} className="border-t border-[#78716c]/40 pt-4">
              <div className="flex items-baseline justify-between text-xs uppercase tracking-wider text-[#78716c] mb-2">
                <span>{i.no}</span><span>{i.date}</span>
              </div>
              <p className="font-['Fraunces'] text-xl leading-snug">{i.title}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
