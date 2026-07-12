import Link from 'next/link'
import { VerdictBadge, PrimaryLinkButton, SecondaryLinkButton } from '@/components/ui'
import type { BuildDecision } from '@/types/index'

const METRICS = [
  { value: '60s', label: 'Time to insight' },
  { value: '7',   label: 'Real data providers' },
  { value: '100', label: 'Point score ceiling' },
]

// Real example categories from the actual leaderboard shape (score/decision) —
// used only as an illustrative preview on the public marketing page, exactly
// as the prior page did; no live query is made pre-auth.
const PREVIEW_CARDS: { name: string; window: string; score: number; decision: BuildDecision; thesis: string }[] = [
  {
    name: 'Bloating + Fatigue Relief', window: 'Expansion — Early', score: 80, decision: 'BUILD_NOW',
    thesis: 'Strong demand signals across search and Amazon. Supply is fragmented with low brand loyalty. Margins support a premium entry.',
  },
  {
    name: 'Sleep Optimization Stack', window: 'Niche — Opening', score: 63, decision: 'VALIDATE_FURTHER',
    thesis: 'Growing interest in stress-adjacent formats. Early sentiment is positive but total addressable demand needs confirmation before committing capital.',
  },
  {
    name: 'Generic Vitamin D3', window: 'Decline — Closing', score: 31, decision: 'SKIP',
    thesis: 'Market saturation has peaked. Search volume is down year-over-year. Retail shelf space is being reallocated to newer formats.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-surface text-ink">
      <header className="w-full sticky top-0 z-50 bg-surface border-b-2 border-black">
        <nav className="flex justify-between items-center px-gutter py-4 max-w-full">
          <div className="flex items-center gap-8">
            <span className="text-headline-md font-black tracking-tighter text-black">PRODUCT INTELLIGENCE</span>
            <div className="hidden md:flex gap-6">
              <Link href="/dashboard" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Dashboard</Link>
              <Link href="/analyze" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Analysis</Link>
              <Link href="/research/history" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Reports</Link>
            </div>
          </div>
          <SecondaryLinkButton href="/login">Sign In</SecondaryLinkButton>
        </nav>
      </header>

      <main className="flex-grow">
        <section className="max-w-[720px] mx-auto text-center px-gutter pt-24 pb-32">
          <h1 className="text-headline-xl-mobile sm:text-headline-xl text-black mb-4">
            Should you build it?
          </h1>
          <p className="text-body-lg text-secondary mb-12">
            One question. Seven independent evidence sources. A verdict you can defend.
          </p>
          <div className="relative">
            <Link
              href="/login?signup=1"
              className="flex items-center h-14 border-2 border-black shadow-hard px-6 text-body-lg text-outline hover:text-ink transition-colors"
            >
              magnesium glycinate…
              <span className="ml-auto text-[10px] font-mono text-outline uppercase tracking-wider hidden md:block">Sign up to query →</span>
            </Link>
          </div>
        </section>

        <section className="border-y-2 border-black py-8 px-gutter">
          <div className="max-w-3xl mx-auto flex justify-center gap-16 flex-wrap">
            {METRICS.map(m => (
              <div key={m.label} className="text-center">
                <p className="text-3xl font-black mb-1">{m.value}</p>
                <p className="text-[10px] font-mono text-outline uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-gutter py-section-gap">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {PREVIEW_CARDS.map(card => (
              <div key={card.name} className="bg-white border border-black p-gutter flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-label-mono font-mono text-secondary block mb-1">Market</span>
                    <span className="text-headline-md text-ink">{card.name}</span>
                  </div>
                  <VerdictBadge scheme="build-decision" verdict={card.decision} size="sm" />
                </div>
                <div className="mb-6">
                  <span className="text-label-mono font-mono text-secondary block mb-1">Window</span>
                  <span className="text-body-md font-bold uppercase">{card.window}</span>
                </div>
                <div className="mt-auto">
                  <span className="text-label-mono font-mono text-secondary block mb-1">Thesis</span>
                  <p className="text-body-md text-ink leading-relaxed">{card.thesis}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <p className="text-label-mono font-mono text-ink-variant">
              Illustrative examples — sign up to run a real query against live provider data.
            </p>
          </div>
        </section>

        <section className="max-w-lg mx-auto px-gutter pb-section-gap text-center">
          <div className="border-2 border-black bg-white p-12 shadow-hard-lg">
            <h2 className="text-headline-md text-black mb-2">Start this week.</h2>
            <p className="text-secondary mb-8 text-sm">3 free analyses during beta. No credit card.</p>
            <PrimaryLinkButton href="/login?signup=1" className="px-10">Request Beta Access →</PrimaryLinkButton>
          </div>
        </section>
      </main>

      <footer className="w-full bg-surface-container-low border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-gutter py-section-gap max-w-full">
          <div className="text-label-mono font-bold text-black mb-6 md:mb-0">PRODUCT INTELLIGENCE</div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link href="/login" className="text-label-mono font-mono text-ink-variant hover:text-black transition-colors">Sign in</Link>
            <a href="#" className="text-label-mono font-mono text-ink-variant hover:text-black transition-colors">Data sources</a>
          </div>
          <div className="text-label-mono font-mono text-secondary mt-8 md:mt-0">© 2026 Product Intelligence.</div>
        </div>
      </footer>
    </div>
  )
}
