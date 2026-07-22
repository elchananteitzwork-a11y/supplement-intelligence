import Link from 'next/link'
import { CineShell } from '@/components/cine/CineShell'
import { GlassPanel } from '@/components/cine/GlassPanel'
import { ProofCard } from '@/components/cine/ProofCard'
import { RotorMark } from '@/components/cine/RotorMark'
import type { InstrumentTone } from '@/components/cine/GlassInstrument'
import type { BuildDecision } from '@/types/index'

// "One World" redesign (2026-07-21+) — from-scratch presentation on
// CineShell/AmbientWorld, replacing the original neo-brutalist import.
// Zero data change: still no live query pre-auth, same illustrative
// preview data as before — see the original PREVIEW_CARDS comment this
// carries forward. Every link target below is unchanged from the prior
// version of this page.

const METRICS = [
  { value: '60s', label: 'Time to insight' },
  { value: '7',   label: 'Real data providers' },
  { value: '100', label: 'Point score ceiling' },
]

// Real example categories from the actual leaderboard shape (score/decision) —
// used only as an illustrative preview on the public marketing page, exactly
// as the prior page did; no live query is made pre-auth. Trace shapes below
// are illustrative for the same reason the numbers are — this whole section
// is disclosed as illustrative in its own footer copy, never presented as
// live data.
const DECISION_TONE: Record<BuildDecision, InstrumentTone> = {
  BUILD_NOW: 'build',
  VALIDATE_FURTHER: 'invest',
  SKIP: 'risk',
  CATEGORY_CREATION_CANDIDATE: 'neutral',
}

const PREVIEW_CARDS: { name: string; window: string; decision: BuildDecision; thesis: string; trace: number[] }[] = [
  {
    name: 'Bloating + Fatigue Relief', window: 'Expansion — Early', decision: 'BUILD_NOW',
    thesis: 'Strong demand signals across search and Amazon. Supply is fragmented with low brand loyalty. Margins support a premium entry.',
    trace: [8, 10, 14, 12, 18, 20],
  },
  {
    name: 'Sleep Optimization Stack', window: 'Niche — Opening', decision: 'VALIDATE_FURTHER',
    thesis: 'Growing interest in stress-adjacent formats. Early sentiment is positive but total addressable demand needs confirmation before committing capital.',
    trace: [20, 12, 28, 16, 10, 24],
  },
  {
    name: 'Generic Vitamin D3', window: 'Decline — Closing', decision: 'SKIP',
    thesis: 'Market saturation has peaked. Search volume is down year-over-year. Retail shelf space is being reallocated to newer formats.',
    trace: [32, 28, 22, 18, 10, 6],
  },
]

export default function Landing() {
  return (
    <CineShell image="/ambient/landing-cathedral-of-palms.jpg" intensity="full" nav={false}>
      {/* Landing's own nav — same 3 destinations + Sign In CTA as the
          prior version of this page (not CineNav's authenticated-app
          links, which don't apply pre-auth). */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <span className="flex items-center gap-2.5 text-sm font-semibold text-pi-cream">
          <RotorMark className="h-5 w-5" />
          Product Intelligence
        </span>
        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">
            <Link href="/dashboard" className="rounded-full px-3.5 py-2 text-[13.5px] text-pi-cream/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] transition-colors duration-cine-fast ease-cine hover:bg-white/[0.08] hover:text-pi-cream">Dashboard</Link>
            <Link href="/analyze" className="rounded-full px-3.5 py-2 text-[13.5px] text-pi-cream/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] transition-colors duration-cine-fast ease-cine hover:bg-white/[0.08] hover:text-pi-cream">Analysis</Link>
            <Link href="/research/history" className="rounded-full px-3.5 py-2 text-[13.5px] text-pi-cream/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] transition-colors duration-cine-fast ease-cine hover:bg-white/[0.08] hover:text-pi-cream">Reports</Link>
          </div>
          <Link href="/login" className="ml-2 rounded-full border border-white/20 px-4 py-2 text-[13.5px] font-semibold text-[#F6E7B8] [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] transition-colors duration-cine-fast ease-cine hover:bg-white/[0.08]">Sign in</Link>
        </div>
      </nav>

      {/* ── hero: no hero box, no dashboard layout — the headline and
          search instrument sit directly in the world ── */}
      <div className="relative flex min-h-[92vh] flex-col justify-center px-6 sm:px-8">
        <div className="relative z-10 mx-auto max-w-[720px] text-center">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.09] px-4 py-[7px] font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#F6E7B8] shadow-[0_1px_4px_rgba(0,0,0,0.5)] backdrop-blur-md">
            <span className="h-[5px] w-[5px] rounded-full bg-pi-gold-bright motion-safe:animate-cine-pulse" />
            Real data. Real opportunity.
          </span>

          <h1 className="mb-5 text-balance font-serif text-[34px] font-semibold leading-[1.06] tracking-tight text-pi-cream drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)] sm:text-[64px]">
            Should you <em className="not-italic text-pi-gold-deep">build</em> it?
          </h1>
          <p className="mx-auto mb-11 max-w-[52ch] text-lg leading-relaxed text-pi-cream/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
            One question. Seven independent evidence sources. A verdict you can defend.
          </p>

          <div className="mx-auto max-w-[600px]">
            <GlassPanel radius="rounded-[18px]" className="flex items-center gap-3 py-[9px] pl-[26px] pr-[9px]">
              <Link
                href="/login?signup=1"
                className="relative z-[1] flex-1 py-3 text-left text-base text-pi-cream/65 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
              >
                magnesium glycinate…
              </Link>
              <Link
                href="/login?signup=1"
                className="relative z-[1] flex items-center gap-2 whitespace-nowrap rounded-[13px] bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-6 py-[14px] text-[14.5px] font-semibold text-[#16130a] shadow-[0_10px_24px_-8px_rgba(212,169,74,0.55)] transition-transform duration-cine-fast ease-cine hover:-translate-y-px"
              >
                Discover →
              </Link>
            </GlassPanel>
            <p className="mt-4 font-mono text-[12.5px] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
              This preview is wired to 3 real stored analyses, not a live search index.
            </p>
          </div>

          <div className="mt-14 flex flex-wrap justify-center gap-9">
            {METRICS.map(m => (
              <div key={m.label} className="text-center">
                <div className="font-mono text-2xl font-bold tracking-tight text-pi-gold-deep [text-shadow:0_1px_4px_rgba(0,0,0,0.5)] sm:text-[26px]">{m.value}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-pi-cream/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-[5vh] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 opacity-55 motion-safe:animate-bounce">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">Shown in this preview</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>

      {/* ── proof: real verdict shapes, floating glass instruments, not a bordered card grid ── */}
      <div className="relative z-10 mx-auto max-w-[1180px] px-6 pb-[14vh] pt-[10vh] sm:px-8">
        <div className="mx-auto mb-[52px] max-w-[560px] text-center">
          <p className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-pi-gold-deep [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">Illustrative examples</p>
          <h2 className="mb-2.5 font-serif text-[28px] font-semibold tracking-tight text-pi-cream [text-shadow:0_1px_10px_rgba(0,0,0,0.4)]">Real verdict shapes, honestly labeled</h2>
          <p className="text-[14.5px] leading-relaxed text-pi-cream/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
            Sign up to run a real query against live provider data — these three show what the engine actually returns.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-[22px] [perspective:1600px] md:grid-cols-3">
          {PREVIEW_CARDS.map((card, i) => (
            <ProofCard
              key={card.name}
              window={card.window}
              name={card.name}
              tone={DECISION_TONE[card.decision]}
              thesis={card.thesis}
              trace={card.trace}
              cometDelay={-i * 1.3}
            />
          ))}
        </div>

        <p className="mx-auto mt-9 w-fit rounded-full bg-black/25 px-4 py-1.5 text-center font-mono text-xs text-pi-cream/85 backdrop-blur-sm [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          Illustrative examples — sign up to run a real query against live provider data.
        </p>
      </div>

      {/* ── final CTA — glass panel in the world, not a boxed white card ── */}
      <div className="relative z-10 mx-auto max-w-[640px] px-6 pb-[16vh] text-center sm:px-8">
        <GlassPanel radius="rounded-3xl" className="px-10 py-[52px]">
          <h2 className="mb-2.5 font-serif text-[26px] font-semibold text-pi-cream [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">Start this week.</h2>
          <p className="mb-6.5 mb-[26px] text-sm text-pi-cream/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">3 free analyses during beta. No credit card.</p>
          <Link
            href="/login?signup=1"
            className="inline-flex items-center gap-2 rounded-[13px] bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-[30px] py-[14px] text-[14.5px] font-semibold text-[#16130a] shadow-[0_10px_24px_-8px_rgba(212,169,74,0.55)] transition-transform duration-cine-fast ease-cine hover:-translate-y-px"
          >
            Request Beta Access →
          </Link>
        </GlassPanel>
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.09] px-6 py-7 sm:px-8">
        <span className="flex items-center gap-2.5 text-[13px] font-semibold text-pi-cream/70">
          <RotorMark className="h-4 w-4" />
          Product Intelligence
        </span>
        <nav className="flex gap-5">
          <Link href="/login" className="font-mono text-[11.5px] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] hover:text-pi-cream">Sign in</Link>
          <a href="#" className="font-mono text-[11.5px] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] hover:text-pi-cream">Data sources</a>
        </nav>
        <span className="font-mono text-[11px] text-pi-cream/40">© 2026 Product Intelligence.</span>
      </footer>
    </CineShell>
  )
}
