import Link from 'next/link'

const FEATURES = [
  { icon: '◎', title: 'Market Gaps',          body: '10 specific gaps competitors are missing in any category — not generic observations.' },
  { icon: '⬡', title: 'Validated Scoring',    body: '6-dimension framework calibrated against 13 real brands including Nutrafol, Arrae, and Seed.' },
  { icon: '⬟', title: 'Formula + Dosages',    body: 'Exact ingredients, doses, evidence tiers, COGS estimate, and a list of ingredients to avoid.' },
  { icon: '◈', title: 'Financial Model',       body: '$10k / $100k / $1M/month probability estimates with LTV, gross margin, and path to $10M.' },
  { icon: '◉', title: 'BUILD / SKIP Verdict', body: 'One clear decision backed by six scored dimensions. No ambiguity.' },
  { icon: '◫', title: 'Customer Language',    body: 'Real frustrations, fears, and ad-ready phrases pulled from documented consumer complaints.' },
]

const PROOF = [
  ['Nutrafol', '$3.5B valuation'],
  ['Arrae',    '$100M revenue'],
  ['Seed',     '~$100M ARR'],
  ['Bloom',    '$1B+ consolidated'],
  ['Ritual',   '$100M+ acquired'],
]

const PREVIEW_SCORES = [
  { l: 'Demand',       s: 9  },
  { l: 'Competition',  s: 6  },
  { l: 'Virality',     s: 9  },
  { l: 'Subscription', s: 9  },
  { l: 'Mfg',         s: 8  },
  { l: 'Defense',      s: 7  },
]

const LEADERBOARD_PREVIEW = [
  { name: 'Bloating + Fatigue',     score: 80, d: 'BUILD_NOW'        },
  { name: 'Hormonal Acne + Gut',    score: 77, d: 'BUILD_NOW'        },
  { name: 'Perimenopause Support',  score: 75, d: 'BUILD_NOW'        },
  { name: 'Sleep Optimization',     score: 63, d: 'VALIDATE_FURTHER' },
  { name: 'Mood Support',           score: 55, d: 'SKIP'             },
]

function Dot({ d }: { d: string }) {
  const c = d === 'BUILD_NOW' ? 'bg-emerald-400' : d === 'VALIDATE_FURTHER' ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`w-2 h-2 rounded-full shrink-0 ${c}`} />
}

function ScoreNum({ s }: { s: number }) {
  const c = s >= 65 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-mono font-bold ${c}`}>{s}</span>
}

export default function Landing() {
  return (
    <div className="min-h-screen">

      {/* ── NAV ── */}
      <nav className="border-b border-zinc-900 px-6 h-14 flex items-center justify-between sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md">
        <span className="font-semibold tracking-tight">
          Supplement<span className="text-emerald-400">Intelligence</span>
        </span>
        <Link href="/login" className="btn-dark text-xs py-2 px-4">Sign in</Link>
      </nav>

      {/* ── HERO ── */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Beta — limited spots
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
          Know if your supplement<br />
          <span className="text-gradient">idea is worth building.</span>
        </h1>

        <p className="text-xl text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
          Type any supplement category. Get a complete investor-grade analysis — market gaps, formula, financial projections, and a BUILD / SKIP verdict — in 60 seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login" className="btn-white text-base py-3 px-8">Get Early Access →</Link>
          <span className="text-zinc-600 text-sm">Free during beta · No credit card</span>
        </div>
      </section>

      {/* ── MOCK OUTPUT ── */}
      <section className="max-w-2xl mx-auto px-6 pb-20">
        <div className="card p-1 glow-green">
          <div className="rounded-xl bg-zinc-950 p-6 space-y-5">
            {/* header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="label mb-1">Category</p>
                <p className="text-lg font-bold">Bloating + Fatigue</p>
              </div>
              <div className="text-right">
                <p className="label mb-1">Score</p>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-bold font-mono text-emerald-400">80</span>
                  <span className="chip-build">🟢 BUILD NOW</span>
                </div>
              </div>
            </div>
            {/* dim scores */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PREVIEW_SCORES.map(d => (
                <div key={d.l} className="bg-zinc-900 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-zinc-500 mb-1">{d.l}</p>
                  <span className={`font-mono font-bold text-sm ${d.s >= 8 ? 'text-emerald-400' : d.s >= 6 ? 'text-amber-400' : 'text-red-400'}`}>{d.s}</span>
                </div>
              ))}
            </div>
            {/* insight */}
            <p className="text-sm text-zinc-400 leading-relaxed border-t border-zinc-800 pt-4">
              &ldquo;Arrae built $100M on bloating alone — never claiming the energy benefit. The gut-energy link is the most documented unowned mechanism in the $14.4B category. That gap is yours.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="border-y border-zinc-900 bg-zinc-900/30 py-6 px-6 mb-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-zinc-500 text-xs mb-4 uppercase tracking-widest">
            Scoring system validated against brands that built
          </p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
            {PROOF.map(([b, r]) => (
              <div key={b} className="text-center">
                <span className="text-sm font-semibold text-white">{b}</span>
                <span className="text-zinc-600 text-xs ml-1.5">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <p className="label text-center mb-3">What you get</p>
        <h2 className="text-3xl font-bold text-center mb-12">Everything in one memo.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="card p-5">
              <span className="text-2xl text-zinc-500 block mb-3">{f.icon}</span>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── LEADERBOARD PREVIEW ── */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <div className="card p-6">
          <p className="label mb-4">Leaderboard preview</p>
          <div className="space-y-2.5">
            {LEADERBOARD_PREVIEW.map((e, i) => (
              <div key={e.name} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-600 font-mono text-xs w-4 text-right">{i + 1}</span>
                  <Dot d={e.d} />
                  <span className="text-sm text-zinc-300">{e.name}</span>
                </div>
                <ScoreNum s={e.score} />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-4">28 categories pre-loaded. Your analyses added automatically.</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <p className="label text-center mb-3">How it works</p>
        <h2 className="text-3xl font-bold text-center mb-10">Three steps.</h2>
        <div className="space-y-3">
          {[
            { n: '01', t: 'Type your idea',     b: "Enter any supplement concept — as broad as 'stress supplement for women' or as specific as 'cortisol support for women 35–50 with hair loss'." },
            { n: '02', t: 'Wait 60 seconds',    b: 'The engine scores demand, competition, virality, retention, manufacturing, and defensibility — then builds a complete memo.' },
            { n: '03', t: 'Get your answer',    b: 'Market gaps. Formula. Financials. Customer language. BUILD / SKIP. Ready to use in a pitch or product brief.' },
          ].map(s => (
            <div key={s.n} className="card p-5 flex gap-5">
              <span className="font-mono font-bold text-2xl text-zinc-700 shrink-0">{s.n}</span>
              <div>
                <p className="font-semibold mb-1">{s.t}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="max-w-xl mx-auto px-6 pb-32 text-center">
        <div className="card p-10 glow-green">
          <h2 className="text-3xl font-bold mb-3">Get access this week.</h2>
          <p className="text-zinc-400 mb-8">3 free analyses during beta. No credit card.</p>
          <Link href="/login" className="btn-white text-base py-3 px-10">Request Beta Access →</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-zinc-900 py-8 text-center">
        <p className="text-zinc-600 text-sm">Supplement Intelligence · Beta v0.1</p>
      </footer>
    </div>
  )
}
