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
  BUILD_NOW: '#34d9a0', VALIDATE_FURTHER: '#f5b947', SKIP: '#ff6259',
}
const VERDICT_LABEL: Record<string, string> = {
  BUILD_NOW: 'Build Now', VALIDATE_FURTHER: 'Validate', SKIP: 'Pass',
}

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ background: '#050507' }}>

      {/* ── NAV ── */}
      <nav className="border-b border-lab-border-soft px-6 h-14 flex items-center justify-between sticky top-0 z-50 bg-[#050507]/90 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-1 h-4 rounded-full bg-lab-photon" />
          <span className="font-display text-sm font-semibold tracking-tight">
            Intelligence <span className="text-lab-photon">Lab</span>
          </span>
        </Link>
        <Link
          href="/login"
          className="text-xs font-medium text-lab-text-secondary hover:text-lab-text-primary px-4 py-2 rounded-lab-sm border border-lab-border-default hover:border-lab-border-strong transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-24 pb-20 overflow-hidden">
        {/* Background radial */}
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(79,168,255,0.08) 0%, transparent 70%)' }}
          aria-hidden
        />

        <div className="relative z-10 max-w-3xl">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-lab-photon/25 bg-lab-photon/8 text-lab-photon text-[11px] font-semibold uppercase tracking-[0.14em] mb-9">
            <span className="w-1.5 h-1.5 rounded-full bg-lab-photon animate-pulse" />
            Beta — limited access
          </div>

          <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight mb-6 text-lab-text-primary">
            Know if your idea<br />
            is <span style={{ color: '#4fa8ff' }}>worth building</span><br />
            in 60 seconds.
          </h1>

          <p className="text-lg text-lab-text-secondary max-w-xl mb-10 leading-relaxed">
            Type any product category. Get investor-grade intelligence — real Amazon data, competitive landscape, demand signals, and a grounded BUILD / SKIP verdict.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-base font-semibold text-[#050507] bg-lab-photon hover:bg-lab-photon-bright px-8 py-3.5 rounded-lab-sm transition-colors duration-lab-fast"
            >
              Get Early Access →
            </Link>
            <span className="text-sm text-lab-text-tertiary">Free during beta · No credit card</span>
          </div>
        </div>
      </section>

      {/* ── SIGNAL METRICS ── */}
      <section className="border-y border-lab-border-soft py-8 px-6 mb-20">
        <div className="max-w-3xl mx-auto flex justify-center gap-16 flex-wrap">
          {METRICS.map(m => (
            <div key={m.label} className="text-center">
              <p className="font-display text-3xl font-bold text-lab-photon mb-1">{m.value}</p>
              <p className="text-xs text-lab-text-tertiary uppercase tracking-wider">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── LIVE LEADERBOARD PREVIEW ── */}
      <section className="max-w-2xl mx-auto px-6 mb-24">
        <div className="mb-6">
          <p className="text-[11px] text-lab-text-tertiary uppercase tracking-wider mb-1">Live intelligence board</p>
          <h2 className="font-display text-2xl font-semibold text-lab-text-primary">28 categories. Ranked by real data.</h2>
        </div>

        <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-lab-border-faint bg-white/[0.02]">
            <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Category</span>
            <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Score</span>
          </div>
          {CATEGORIES_PREVIEW.map((row, i) => (
            <div
              key={row.name}
              className="flex items-center justify-between px-5 py-3.5 border-b border-lab-border-faint last:border-b-0 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="lab-text-data text-[10px] text-lab-text-tertiary w-4 text-right shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: VERDICT_COLOR[row.d] }}
                />
                <span className="text-sm text-lab-text-secondary truncate">{row.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className="text-[11px] font-medium hidden sm:block"
                  style={{ color: VERDICT_COLOR[row.d] }}
                >
                  {VERDICT_LABEL[row.d]}
                </span>
                <span
                  className="lab-text-data text-sm font-bold tabular-nums"
                  style={{ color: VERDICT_COLOR[row.d] }}
                >
                  {row.score}
                </span>
              </div>
            </div>
          ))}
          <div className="px-5 py-3 bg-white/[0.01]">
            <p className="text-xs text-lab-text-tertiary">Your analyses added automatically. Scores computed from real provider data.</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <p className="text-[11px] text-lab-text-tertiary uppercase tracking-wider mb-2">How it works</p>
        <h2 className="font-display text-2xl font-semibold text-lab-text-primary mb-10">Three steps to clarity.</h2>

        <div className="space-y-0">
          {[
            { n: '01', t: 'Type your idea', b: "Enter any product concept — as broad as 'stress supplement for women' or as specific as 'cortisol support for women 35–50 with hair loss.'" },
            { n: '02', t: 'Real data runs in background', b: 'The engine queries Amazon sales data, search demand, TikTok virality, competitor reviews, and FDA safety signals — all in parallel.' },
            { n: '03', t: 'Get a grounded verdict', b: 'Market gaps. Formula. Financials. Customer language. Evidence breadth. A BUILD / SKIP verdict backed by real sources, not AI guesses.' },
          ].map((s, i) => (
            <div
              key={s.n}
              className="flex gap-8 py-7 border-t border-lab-border-soft first:border-t-0"
            >
              <span
                className="font-display text-2xl font-bold shrink-0 mt-0.5"
                style={{ color: '#4fa8ff33' }}
              >
                {s.n}
              </span>
              <div>
                <p className="font-semibold text-lab-text-primary mb-1.5">{s.t}</p>
                <p className="text-sm text-lab-text-tertiary leading-relaxed">{s.b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="max-w-lg mx-auto px-6 pb-32 text-center">
        <div
          className="rounded-lab-xl border border-lab-photon/20 p-12"
          style={{ background: 'rgba(79,168,255,0.04)', boxShadow: '0 0 80px rgba(79,168,255,0.08)' }}
        >
          <h2 className="font-display text-2xl font-bold text-lab-text-primary mb-2">Start this week.</h2>
          <p className="text-lab-text-tertiary mb-8 text-sm">3 free analyses during beta. No credit card.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-base font-semibold text-[#050507] bg-lab-photon hover:bg-lab-photon-bright px-10 py-3.5 rounded-lab-sm transition-colors"
          >
            Request Beta Access →
          </Link>
        </div>
      </section>

      <footer className="border-t border-lab-border-soft py-8 text-center">
        <p className="text-sm text-lab-text-tertiary">Intelligence Lab · Beta v0.2</p>
      </footer>
    </div>
  )
}
