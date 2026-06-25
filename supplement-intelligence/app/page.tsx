import Link from 'next/link'
import {
  IconTarget, IconGrid, IconBeaker, IconChart, IconGauge, IconBubbles, IconArrowRight,
} from '@/components/icons'

const FEATURES = [
  { Icon: IconTarget,  title: 'Market Gaps',          body: '10 specific gaps competitors are missing in any category — not generic observations.' },
  { Icon: IconGrid,    title: 'Validated Scoring',    body: '5-dimension framework calibrated against 13 real brands including Nutrafol, Arrae, and Seed.' },
  { Icon: IconBeaker,  title: 'Formula + Dosages',    body: 'Exact ingredients, doses, evidence tiers, COGS estimate, and a list of ingredients to avoid.' },
  { Icon: IconChart,   title: 'Financial Model',       body: '$10k / $100k / $1M/month probability estimates with gross margin and path to $10M.' },
  { Icon: IconGauge,   title: 'BUILD / SKIP Verdict', body: 'One clear decision backed by five scored dimensions. No ambiguity.' },
  { Icon: IconBubbles, title: 'Customer Language',    body: 'Real frustrations, fears, and ad-ready phrases pulled from documented consumer complaints.' },
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
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c}`} />
}

function ScoreNum({ s }: { s: number }) {
  const c = s >= 65 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-mono font-bold ${c}`}>{s}</span>
}

export default function Landing() {
  return (
    <div className="min-h-screen">

      {/* ── NAV ── */}
      <nav className="border-b border-white/[0.06] px-6 h-16 flex items-center justify-between sticky top-0 z-50 bg-[#0a0a0c]/85 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-1.5 h-5 rounded-full bg-brass" />
          <span className="font-serif text-lg tracking-tight">
            Supplement <span className="italic text-brass">Intelligence</span>
          </span>
        </Link>
        <Link href="/login" className="btn-dark text-xs py-2 px-4">Sign in</Link>
      </nav>

      {/* ── HERO ── */}
      <section className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        <div className="flex flex-col items-start">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brass/25 bg-brass/[0.06] text-brass text-[11px] font-semibold uppercase tracking-[0.14em] mb-9">
            <span className="w-1.5 h-1.5 rounded-full bg-brass animate-pulse" />
            Beta — limited spots
          </div>

          <h1 className="font-serif text-[2.75rem] sm:text-6xl font-medium leading-[1.06] tracking-tight mb-7 max-w-2xl">
            Know if your supplement idea is{' '}
            <span className="italic text-gradient-brass">worth building.</span>
          </h1>

          <p className="text-lg text-zinc-400 max-w-lg mb-11 leading-relaxed">
            Type any supplement category. Get a complete investor-grade analysis — market gaps, formula, financial projections, and a BUILD / SKIP verdict — in 60 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Link href="/login" className="btn-white text-base py-3 px-8">Get Early Access →</Link>
            <span className="text-zinc-600 text-sm">Free during beta · No credit card</span>
          </div>
        </div>
      </section>

      {/* ── MOCK OUTPUT ── */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <div className="card-premium glow-brass p-1">
          <div className="rounded-[14px] bg-[#0a0a0c] p-6 sm:p-7 space-y-6">
            {/* header */}
            <div className="flex items-start justify-between pb-5 border-b border-white/[0.06]">
              <div>
                <p className="label mb-1.5">Category</p>
                <p className="font-serif text-xl">Bloating + Fatigue</p>
              </div>
              <div className="text-right">
                <p className="label mb-1.5">Score</p>
                <div className="flex items-center gap-3">
                  <span className="font-serif text-4xl font-medium text-emerald-400">80</span>
                  <span className="chip-build">Build Now</span>
                </div>
              </div>
            </div>
            {/* dim scores */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PREVIEW_SCORES.map(d => (
                <div key={d.l} className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-zinc-500 mb-1">{d.l}</p>
                  <span className={`font-mono font-bold text-sm ${d.s >= 8 ? 'text-emerald-400' : d.s >= 6 ? 'text-amber-400' : 'text-red-400'}`}>{d.s}</span>
                </div>
              ))}
            </div>
            {/* insight */}
            <p className="font-serif italic text-base text-zinc-300 leading-relaxed border-t border-white/[0.06] pt-5">
              &ldquo;Arrae built $100M on bloating alone — never claiming the energy benefit. The gut-energy link is the most documented unowned mechanism in the $14.4B category. That gap is yours.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="border-y border-white/[0.06] py-7 px-6 mb-24">
        <div className="max-w-3xl mx-auto">
          <p className="label text-center mb-5">
            Scoring system validated against brands that built
          </p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
            {PROOF.map(([b, r]) => (
              <div key={b} className="text-center">
                <span className="font-serif text-base text-white">{b}</span>
                <span className="text-zinc-600 text-xs ml-2">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-6 pb-28">
        <p className="label text-center mb-3">What you get</p>
        <h2 className="font-serif text-3xl sm:text-[2.25rem] text-center mb-16">Everything in one memo.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-[#0a0a0c] p-7">
              <f.Icon className="w-5 h-5 text-brass mb-5" />
              <h3 className="font-medium mb-2 text-[15px]">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── LEADERBOARD PREVIEW ── */}
      <section className="max-w-2xl mx-auto px-6 pb-28">
        <p className="label mb-5">Leaderboard preview</p>
        <div className="ledger">
          {LEADERBOARD_PREVIEW.map((e, i) => (
            <div key={e.name} className="ledger-row justify-between">
              <div className="flex items-center gap-3.5">
                <span className="text-zinc-600 font-mono text-xs w-4 text-right">{i + 1}</span>
                <Dot d={e.d} />
                <span className="text-sm text-zinc-300">{e.name}</span>
              </div>
              <ScoreNum s={e.score} />
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-4">28 categories pre-loaded. Your analyses added automatically.</p>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="max-w-2xl mx-auto px-6 pb-28">
        <p className="label text-center mb-3">How it works</p>
        <h2 className="font-serif text-3xl text-center mb-12">Three steps.</h2>
        <div className="space-y-px">
          {[
            { n: '01', t: 'Type your idea',     b: "Enter any supplement concept — as broad as 'stress supplement for women' or as specific as 'cortisol support for women 35–50 with hair loss'." },
            { n: '02', t: 'Wait 60 seconds',    b: 'The engine scores demand, competition, virality, retention, and manufacturing — then builds a complete memo.' },
            { n: '03', t: 'Get your answer',    b: 'Market gaps. Formula. Financials. Customer language. BUILD / SKIP. Ready to use in a pitch or product brief.' },
          ].map(s => (
            <div key={s.n} className="flex gap-6 py-6 border-t border-white/[0.06] first:border-t-0">
              <span className="font-serif italic text-3xl text-brass/70 shrink-0">{s.n}</span>
              <div>
                <p className="font-medium mb-1.5">{s.t}</p>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="max-w-xl mx-auto px-6 pb-32 text-center">
        <div className="card-premium glow-brass p-10 sm:p-14">
          <h2 className="font-serif text-3xl mb-3">Get access this week.</h2>
          <p className="text-zinc-500 mb-9">3 free analyses during beta. No credit card.</p>
          <Link href="/login" className="btn-white text-base py-3 px-10 inline-flex items-center gap-2">
            Request Beta Access <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06] py-10 text-center">
        <p className="text-zinc-600 text-sm">Supplement Intelligence · Beta v0.1</p>
      </footer>
    </div>
  )
}
