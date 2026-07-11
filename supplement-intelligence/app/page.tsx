import Link from 'next/link'

const METRICS = [
  { value: '60s',  label: 'Time to insight' },
  { value: '7',    label: 'Real data providers' },
  { value: '100',  label: 'Point score ceiling' },
]

const CATEGORIES_PREVIEW = [
  { name: 'Bloating + Fatigue Relief',  score: 80, d: 'BUILD_NOW'        },
  { name: 'Hormonal Acne + Gut Link',   score: 77, d: 'BUILD_NOW'        },
  { name: 'Perimenopause Transition',   score: 74, d: 'BUILD_NOW'        },
  { name: 'Sleep Optimization Stack',   score: 63, d: 'VALIDATE_FURTHER' },
  { name: 'Mood + Cortisol Support',    score: 55, d: 'VALIDATE_FURTHER' },
  { name: 'Generic Vitamin D3',         score: 31, d: 'SKIP'             },
]

const VERDICT_COLOR: Record<string, string> = {
  BUILD_NOW: '#008a00', VALIDATE_FURTHER: '#fbc02d', SKIP: '#d32f2f',
}
const VERDICT_TEXT_ON: Record<string, string> = {
  BUILD_NOW: '#ffffff', VALIDATE_FURTHER: '#000000', SKIP: '#ffffff',
}
const VERDICT_LABEL: Record<string, string> = {
  BUILD_NOW: 'Entry Supported', VALIDATE_FURTHER: 'Validation Required', SKIP: 'Not Supported',
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>

      {/* ── NAV ── */}
      <header className="w-full sticky top-0 z-50 bg-[#f9f9f9] border-b-2 border-black">
        <nav className="flex justify-between items-center px-6 py-4 max-w-full">
          <Link href="/" className="text-lg font-black tracking-tighter uppercase">
            Intelligence Lab
          </Link>
          <Link
            href="/login"
            className="bg-black text-white font-bold px-6 py-2 uppercase text-sm border border-black hover:bg-white hover:text-black transition-colors duration-200 active:scale-95"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex-grow">
        {/* ── HERO ── */}
        <section className="max-w-[720px] mx-auto text-center px-6 pt-24 pb-20">
          <div className="inline-flex items-center gap-2 border border-black px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] mb-9">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            Beta — limited access
          </div>

          <h1 className="text-[40px] sm:text-[56px] font-black leading-[1.05] tracking-tight mb-6">
            Know if your idea is worth building in 60 seconds.
          </h1>

          <p className="text-lg text-[#4c4546] mb-10 leading-relaxed">
            Type any product category. Get investor-grade intelligence — real Amazon data, competitive landscape, demand signals, and a grounded Entry Supported or Not Supported verdict.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login?signup=1"
              className="inline-flex items-center gap-2 text-base font-black uppercase tracking-wide text-white bg-black px-8 py-3.5 border-2 border-black hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98]"
            >
              Get Early Access →
            </Link>
            <span className="text-sm font-mono text-[#7e7576]">Free during beta · No credit card</span>
          </div>
        </section>

        {/* ── SIGNAL METRICS ── */}
        <section className="border-y-2 border-black py-8 px-6 mb-20">
          <div className="max-w-3xl mx-auto flex justify-center gap-16 flex-wrap">
            {METRICS.map(m => (
              <div key={m.label} className="text-center">
                <p className="text-3xl font-black mb-1">{m.value}</p>
                <p className="text-xs font-mono text-[#4c4546] uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── LIVE LEADERBOARD PREVIEW — reskinned as verdict cards ── */}
        <section className="max-w-[1200px] mx-auto px-6 mb-24">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider mb-1">Live intelligence board</p>
            <h2 className="text-2xl font-black">28 categories. Ranked by real data.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CATEGORIES_PREVIEW.slice(0, 3).map((row, i) => (
              <div key={row.name} className="bg-white border border-black p-6 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider block mb-1">Category</span>
                    <span className="text-lg font-bold leading-snug block">{row.name}</span>
                  </div>
                  <div
                    className="px-3 py-1 font-black text-[11px] uppercase shrink-0 ml-3"
                    style={{ background: VERDICT_COLOR[row.d], color: VERDICT_TEXT_ON[row.d] }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                </div>
                <div className="mb-6">
                  <span className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider block mb-1">Score</span>
                  <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: VERDICT_COLOR[row.d] }}>{row.score}</span>
                </div>
                <div className="mt-auto">
                  <span className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider block mb-1">Verdict</span>
                  <span className="text-sm font-bold uppercase" style={{ color: VERDICT_COLOR[row.d] }}>{VERDICT_LABEL[row.d]}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-black bg-white divide-y divide-black/10">
            {CATEGORIES_PREVIEW.slice(3).map((row, i) => (
              <div key={row.name} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] text-[#7e7576] w-4 text-right shrink-0">{String(i + 4).padStart(2, '0')}</span>
                  <span className="w-2 h-2 shrink-0" style={{ background: VERDICT_COLOR[row.d] }} />
                  <span className="text-sm truncate">{row.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-bold uppercase hidden sm:block" style={{ color: VERDICT_COLOR[row.d] }}>
                    {VERDICT_LABEL[row.d]}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums" style={{ color: VERDICT_COLOR[row.d] }}>
                    {row.score}
                  </span>
                </div>
              </div>
            ))}
            <div className="px-5 py-3 bg-[#f3f3f3]">
              <p className="text-xs font-mono text-[#4c4546]">Your analyses added automatically. Scores computed from real provider data.</p>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <p className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider mb-2 text-center">How it works</p>
          <h2 className="text-2xl font-black mb-10 text-center">Three steps to clarity.</h2>

          <div className="space-y-0">
            {[
              { n: '01', t: 'Type your idea', b: "Enter any product concept — as broad as 'stress supplement for women' or as specific as 'cortisol support for women 35–50 with hair loss.'" },
              { n: '02', t: 'Real data runs in background', b: 'The engine queries Amazon sales data, search demand, TikTok virality, competitor reviews, and FDA safety signals — all in parallel.' },
              { n: '03', t: 'Get a grounded verdict', b: 'Market gaps. Formula. Financials. Customer language. Evidence breadth. An Entry Supported or Not Supported verdict backed by real sources, not AI guesses.' },
            ].map((s, i) => (
              <div
                key={s.n}
                className="flex gap-8 py-7 border-t-2 border-black first:border-t-0"
              >
                <span className="font-mono text-2xl font-bold shrink-0 mt-0.5 text-[#cfc4c5]">
                  {s.n}
                </span>
                <div>
                  <p className="font-bold mb-1.5">{s.t}</p>
                  <p className="text-sm text-[#4c4546] leading-relaxed">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="max-w-lg mx-auto px-6 pb-32 text-center">
          <div className="border-2 border-black bg-white p-12 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black mb-2">Start this week.</h2>
            <p className="text-[#4c4546] mb-8 text-sm">3 free analyses during beta. No credit card.</p>
            <Link
              href="/login?signup=1"
              className="inline-flex items-center gap-2 text-base font-black uppercase tracking-wide text-white bg-black px-10 py-3.5 border-2 border-black hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98]"
            >
              Request Beta Access →
            </Link>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="w-full border-t-2 border-black bg-[#f3f3f3]">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 py-10 max-w-full">
          <span className="font-mono font-bold text-sm uppercase">Intelligence Lab</span>
          <p className="font-mono text-xs text-[#4c4546] mt-4 md:mt-0">Intelligence Lab · Beta v0.2</p>
        </div>
      </footer>
    </div>
  )
}
