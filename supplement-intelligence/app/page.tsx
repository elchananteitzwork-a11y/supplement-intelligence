'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { AmbientVideo } from '@/components/cine/AmbientVideo'
import { AmbientParticles } from '@/components/cine/AmbientParticles'
import { RotorMark } from '@/components/cine/RotorMark'

// Landing — V4 Phase 2 rebuild (docs/RD_V4_PHASE2.md Milestone C), per the
// approved Claude Design prototype ("Landing Page.dc.html", Claude Design
// project cca54f8b…, frozen 2026-07-24). Keeps the cinematic dark/video
// register the owner chose for Landing specifically (2026-07-22 decision,
// see components/cine/AmbientVideo.tsx and app/login/page.tsx's header
// comment) — Login/Brief/Record moved to the calm cream register, Landing
// deliberately did not.
//
// Three honest deviations from the prototype's literal content:
//   1. The verdict/window/quote moments below are illustrative example
//      copy, not a live analysis — each is labeled as such (same pattern
//      the prior version of this page used for PREVIEW_CARDS).
//   2. The prototype's "Plans" section shows an invented "$39/month" Pro
//      price. Real billing exists (app/api/billing/*, gated behind
//      isBillingEnabled()) but GET /api/billing/status requires auth, so
//      there is no real price this pre-auth page can honestly display.
//      The Plans section below keeps the two-tier visual rhythm without
//      inventing a number — real pricing is shown post-signup.
//   3. Real usability feedback (owner, 2026-07-24, after seeing it live):
//      every auth entry point below now navigates to the real /login page
//      instead of opening components/landing/AuthModal.tsx's in-place
//      modal — "I would like the login to be a complete different page,
//      not a small window." AuthModal was deleted (no other caller ever
//      existed for it); the modal-over-the-world interaction from the
//      approved prototype is superseded by this real feedback, per the
//      FROZEN architecture's own rule that usability testing/real user
//      feedback is a legitimate reason to deviate.
//
// `position:fixed` (Tailwind's `fixed`), not `background-attachment:
// fixed` — the iOS-safe form of a pinned atmosphere layer.

const HOW_STEPS = [
  { n: '01', title: 'Describe it', body: "Tell me the product the way you'd tell a friend — an ingredient, a format, a customer. One sentence is enough.", ring: 'waiting' as const },
  { n: '02', title: 'I hunt', body: 'Live search demand, TikTok creator signals, keyword and pricing intelligence. Real sources — leave anytime, it finishes on its own.', note: 'Every source checked live, and named.', ring: 'checking' as const },
  { n: '03', title: 'You get a verdict', body: 'One word, the case for and against, and the exact conditions that would change my mind — re-checked weekly so it never goes stale.', note: 'Named conditions, not vague caution.', ring: 'confirmed' as const },
]

const ABOUT_POINTS = [
  { title: 'Evidence, not opinion', body: 'Every number traces to a live source — search volumes, keyword movement, real prices — you can open and check.' },
  { title: 'Honest about limits', body: 'A category with zero consumer reviews gets told exactly that — never a guess dressed up as a fact.' },
  { title: 'Never goes stale', body: 'Every verdict names the conditions that would reverse it, and re-checks them weekly.' },
]

const EVIDENCE_MARKERS = [
  { dot: 'solid-cream', label: 'Measured — pulled live from search and pricing data' },
  { dot: 'solid-gold', label: 'My judgment — inferred from evidence, and labeled as such' },
  { dot: 'ring', label: "Couldn't verify — no reliable source found, so I say so" },
]

function StepRing({ kind }: { kind: 'waiting' | 'checking' | 'confirmed' }) {
  const stroke = kind === 'waiting' ? 'rgba(255,255,255,0.14)' : kind === 'checking' ? '#D4A94A' : '#7FCB9E'
  const dash = kind === 'waiting' ? undefined : 226.2
  const offset = kind === 'checking' ? 124 : 0
  const label = kind === 'waiting' ? 'Waiting' : kind === 'checking' ? 'Checking' : 'Confirmed'
  const labelColor = kind === 'waiting' ? 'text-pi-cream/50' : kind === 'checking' ? 'text-[#F0DBA0]' : 'text-[#9FCBAF]'
  const glowRgb = kind === 'checking' ? 'rgba(212,169,74,0.22)' : kind === 'confirmed' ? 'rgba(127,203,158,0.22)' : 'rgba(255,255,255,0.06)'
  const borderRgb = kind === 'checking' ? 'rgba(212,169,74,0.28)' : kind === 'confirmed' ? 'rgba(159,203,175,0.28)' : 'rgba(255,255,255,0.16)'
  return (
    <div className="relative h-[90px] w-[90px] flex-shrink-0">
      <div className="absolute inset-0 rounded-full shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-[18px]" style={{ background: `radial-gradient(circle at 38% 32%, ${glowRgb}, transparent 60%)`, border: `1px solid ${borderRgb}` }} />
      <svg width="90" height="90" viewBox="0 0 90 90" className="absolute inset-0 -rotate-90">
        <circle cx="45" cy="45" r="36" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={dash ? offset : undefined} />
      </svg>
      <div className="relative flex h-full w-full items-center justify-center text-center">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${labelColor}`}>{label}</span>
      </div>
    </div>
  )
}

export default function Landing() {
  const reduce = useReducedMotion()
  const [ctaOffset, setCtaOffset] = useState({ x: 0, y: 0 })

  const reveal = (delay = 0) => ({
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.25 },
    transition: { duration: reduce ? 0 : 0.8, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] as const },
  })

  function onCtaMove(e: React.MouseEvent<HTMLAnchorElement>) {
    if (reduce) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width - 0.5
    const relY = (e.clientY - rect.top) / rect.height - 0.5
    setCtaOffset({ x: relX * 14, y: relY * 10 })
  }

  const confidenceCircumference = 2 * Math.PI * 94
  const confidenceOffset = confidenceCircumference * (1 - 0.63)

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="relative overflow-x-hidden bg-[#0E0D0A] font-sans text-pi-cream antialiased">
        {/* ── fixed atmosphere ── */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -inset-[6%] motion-safe:animate-cine-kenburns">
            <AmbientVideo src="/ambient/video/landing-hero-bamboo.mp4" poster="/ambient/video/landing-hero-bamboo-poster.jpg" objectPosition="50% 40%" />
          </div>
          <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,9,6,0.55), rgba(10,9,6,0.72) 30%, rgba(8,7,5,0.88) 70%, rgba(6,5,4,0.96)), radial-gradient(ellipse at 30% 20%, rgba(212,169,74,0.10), transparent 55%)' }} />
          <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 75% 8%, rgba(255,236,190,0.42), rgba(246,231,184,0.14) 35%, transparent 60%)' }} />
          <div aria-hidden className="absolute -top-[20%] left-0 h-[140%] w-[60%] motion-safe:animate-cine-ray-drift" style={{ background: 'linear-gradient(100deg, transparent 40%, rgba(246,231,184,0.06) 50%, transparent 60%)' }} />
          <AmbientParticles count={18} />
        </div>

        {/* ── minimal nav ── */}
        <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-6 sm:px-10">
          <RotorMark className="h-[22px] w-[22px]" />
          <Link href="/login" className="text-[13px] font-medium tracking-wide text-pi-cream/85 transition-colors hover:text-[#F0DBA0]">
            Enter →
          </Link>
        </div>

        {/* ── content ── */}
        <div className="relative z-[2]">

          {/* opening moment */}
          <div className="flex min-h-screen items-center px-6 pb-[8vh] sm:px-[8%]">
            <div className="max-w-[900px]">
              <p className="mb-9 text-[13px] font-medium uppercase tracking-[0.18em] text-pi-cream/55">
                Evidence-based decisions for supplement &amp; wellness brands
              </p>
              <h1 className="text-balance font-serif text-[44px] font-medium leading-[1.05] tracking-tight text-pi-cream drop-shadow-[0_0_40px_rgba(246,231,184,0.25)] sm:text-[72px] md:text-[88px]">
                Know it&rsquo;s worth<br />
                <span className="text-pi-gold-deep">launching</span> — before you<br />
                order the first bottle.
              </h1>
              <div className="mt-6 h-[2px] w-24 bg-gradient-to-r from-pi-gold-deep to-[#F0DBA0] shadow-[0_0_12px_rgba(212,169,74,0.5)]" />
            </div>
          </div>

          {/* search a tracked product */}
          <div className="flex min-h-[36vh] flex-col items-center justify-center px-6 py-[4vh] text-center sm:px-[8%]">
            <p className="mb-7 text-xs uppercase tracking-[0.1em] text-pi-cream/45">Already tracking something?</p>
            <Link href="/login" className="group inline-flex items-center gap-3.5 border-b border-white/[0.18] pb-3.5 transition-colors duration-300 hover:border-pi-gold-deep">
              <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="6.5" stroke="#8F8A79" strokeWidth="1.6" fill="none" /><path d="M13.5 13.5L18 18" stroke="#8F8A79" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <span className="font-sans text-lg text-pi-cream/70 transition-colors group-hover:text-pi-cream">Search an ingredient, a format, or a market…</span>
            </Link>
            <p className="mt-5 text-[13px] text-pi-cream/45">Or browse verdicts already reached on Desk and Compare.</p>
          </div>

          {/* quote moment */}
          <div className="flex min-h-[32vh] items-center justify-center px-6 py-[3vh] text-center sm:px-[8%]">
            <p className="max-w-[640px] font-serif text-[22px] italic leading-relaxed text-pi-cream/60 sm:text-[26px]">
              &ldquo;Demand is real. The margin isn&rsquo;t. Pass.&rdquo;
            </p>
          </div>

          {/* the ask — emotional center */}
          <div className="flex min-h-screen flex-col items-center justify-center px-6 py-[8vh] text-center sm:px-[8%]">
            <p className="mb-7 text-sm uppercase tracking-[0.1em] text-pi-cream/55">Describe the product the way you&rsquo;d tell a friend</p>
            <Link
              href="/login?signup=1"
              onMouseMove={onCtaMove}
              onMouseLeave={() => setCtaOffset({ x: 0, y: 0 })}
              style={{ transform: `translate(${ctaOffset.x.toFixed(1)}px, ${ctaOffset.y.toFixed(1)}px)` }}
              className="inline-flex items-baseline gap-1 border-b border-pi-gold-deep/40 pb-4 transition-[border-color,transform] duration-300 hover:border-pi-gold-deep"
            >
              <span className="font-serif text-[28px] font-medium text-pi-cream/80 sm:text-[42px] md:text-[54px]">a sleep reset kit for night-shift workers</span>
              <span className="inline-block h-[0.9em] w-[2px] bg-pi-gold-deep motion-safe:animate-cine-blink" />
            </Link>
            <div className="mt-9 flex flex-wrap justify-center gap-4 text-[13px] text-pi-cream/45">
              <span>magnesium sleep gummies</span><span className="text-pi-cream/25">·</span>
              <span>berberine for blood-sugar support</span><span className="text-pi-cream/25">·</span>
              <span>creatine for women</span>
            </div>
          </div>

          {/* verdict moment — illustrative */}
          <m.div {...reveal()} className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 py-[10vh] text-center sm:px-[8%]">
            <div aria-hidden className="absolute h-[340px] w-[340px] rounded-full blur-sm" style={{ background: 'radial-gradient(circle, rgba(143,183,239,0.14), transparent 70%)' }} />
            <p className="relative mb-4 text-xs uppercase tracking-[0.1em] text-pi-cream/45">Shift Work Sleep Reset · illustrative example</p>
            <p className="relative mb-6 font-serif text-[44px] font-medium text-[#8FB7EF] drop-shadow-[0_0_30px_rgba(143,183,239,0.35)] sm:text-[64px]">Validation Required</p>
            <p className="relative mb-3.5 max-w-[520px] text-lg leading-relaxed text-pi-cream/85">
              Demand is real — 614,100 searches a month, anchored by &ldquo;magnesium glycinate for sleep&rdquo; at 368,000 — but at a $27 median price the margin math lands at 33%, under my 35% floor.
            </p>
            <p className="relative mb-5 max-w-[460px] text-[15px] text-pi-cream/55">Validate pricing or cost assumptions before committing capital.</p>
            <div className="relative inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7FCB9E] motion-safe:animate-cine-pulse" />
              <span className="text-xs uppercase tracking-[0.08em] text-pi-cream/45">Re-checked weekly, automatically</span>
            </div>
          </m.div>

          {/* the window — illustrative */}
          <m.div {...reveal()} className="flex min-h-[80vh] flex-col items-center justify-center gap-14 px-6 py-[10vh] sm:px-[8%]">
            <p className="text-xs uppercase tracking-[0.1em] text-pi-cream/45">The window · illustrative example</p>
            <div className="relative flex h-[220px] w-[220px] items-center justify-center">
              <div className="absolute inset-0 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(200,240,215,0.18)] backdrop-blur-[18px]" style={{ background: 'radial-gradient(circle at 38% 32%, rgba(159,203,175,0.22), rgba(127,203,158,0.06) 60%, rgba(127,203,158,0.03))', border: '1px solid rgba(159,203,175,0.28)' }} />
              <div className="absolute inset-3.5 overflow-hidden rounded-full">
                <div className="absolute -left-[30%] -top-[30%] h-[160%] w-[160%] motion-safe:animate-cine-spin-slow" style={{ background: 'conic-gradient(from 0deg, rgba(127,203,158,0.22), rgba(159,203,175,0.04) 30%, rgba(127,203,158,0.16) 60%, rgba(159,203,175,0.05) 85%, rgba(127,203,158,0.22))' }} />
              </div>
              <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0 -rotate-90">
                <circle cx="110" cy="110" r="94" fill="none" stroke="rgba(159,203,175,0.12)" strokeWidth="6" />
                <circle cx="110" cy="110" r="94" fill="none" stroke="#7FCB9E" strokeWidth="6" strokeLinecap="round" strokeDasharray={confidenceCircumference} strokeDashoffset={confidenceOffset} style={{ filter: 'drop-shadow(0 0 8px rgba(127,203,158,0.6))' }} />
              </svg>
              <div className="relative text-center">
                <div className="font-serif text-[48px] font-medium text-pi-cream">63%</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#9FCBAF]">Confidence</div>
              </div>
            </div>
            <p className="max-w-[400px] text-center text-sm text-pi-cream/55">614,100 monthly searches, but momentum is decelerating — the window is open, and narrowing.</p>
          </m.div>

          {/* evidence markers — methodology, not data */}
          <m.div {...reveal()} className="flex min-h-[60vh] flex-col items-center justify-center gap-11 px-6 py-[6vh] sm:px-[8%]">
            <div className="mb-4 max-w-[480px] text-center">
              <h2 className="mb-3.5 font-serif text-[28px] font-medium text-pi-cream sm:text-[34px]">Every number, marked honestly</h2>
              <p className="text-[15px] leading-relaxed text-pi-cream/55">I never blur a guess into a fact — every number in a brief carries its source.</p>
            </div>
            <div className="flex flex-col gap-3.5">
              {EVIDENCE_MARKERS.map(marker => (
                <div key={marker.label} className="flex items-center gap-4 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-5 py-3.5 backdrop-blur-[10px]">
                  {marker.dot === 'ring' ? (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full border-[1.5px] border-pi-cream/50" />
                  ) : (
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${marker.dot === 'solid-gold' ? 'bg-pi-gold-deep shadow-[0_0_8px_rgba(212,169,74,0.6)]' : 'bg-pi-cream shadow-[0_0_8px_rgba(243,239,226,0.5)]'}`} />
                  )}
                  <span className="text-base text-pi-cream/80">{marker.label}</span>
                </div>
              ))}
            </div>
          </m.div>

          {/* how it works */}
          <div>
            {HOW_STEPS.map((step, i) => (
              <m.div
                key={step.n}
                {...reveal()}
                className={`flex min-h-[48vh] flex-wrap items-center gap-10 px-6 py-[6vh] sm:px-[8%] ${i === 1 ? 'justify-end' : ''}`}
              >
                {i === 1 ? (
                  <>
                    <div className="max-w-[400px] text-right">
                      <p className="mb-5 font-serif text-[15px] text-pi-gold-deep">{step.n}</p>
                      <h3 className="mb-5 text-balance font-serif text-[32px] font-medium text-pi-cream sm:text-[42px]">{step.title}</h3>
                      <p className="mb-4 text-[17px] leading-relaxed text-pi-cream/60">{step.body}</p>
                      {step.note && <p className="text-[13px] tracking-wide text-pi-cream/35">{step.note}</p>}
                    </div>
                    <StepRing kind={step.ring} />
                  </>
                ) : (
                  <>
                    <StepRing kind={step.ring} />
                    <div className="max-w-[400px]">
                      <p className="mb-5 font-serif text-[15px] text-pi-gold-deep">{step.n}</p>
                      <h3 className="mb-5 text-balance font-serif text-[32px] font-medium text-pi-cream sm:text-[42px]">{step.title}</h3>
                      <p className="mb-4 text-[17px] leading-relaxed text-pi-cream/60">{step.body}</p>
                      {step.note && <p className="text-[13px] tracking-wide text-pi-cream/35">{step.note}</p>}
                    </div>
                  </>
                )}
              </m.div>
            ))}
          </div>

          {/* about */}
          <m.div {...reveal()} className="flex min-h-[56vh] flex-col items-center justify-center px-6 py-[6vh] text-center sm:px-[8%]">
            <p className="mb-6 text-xs uppercase tracking-[0.1em] text-pi-cream/45">What we actually are</p>
            <p className="mb-14 max-w-[640px] text-balance font-serif text-[28px] font-medium leading-snug text-pi-cream sm:text-[38px]">
              Not another seller dashboard to interpret yourself — a research partner that reads the evidence and commits to a position, one product at a time.
            </p>
            <div className="flex max-w-[760px] flex-wrap justify-center gap-16">
              {ABOUT_POINTS.map(point => (
                <div key={point.title} className="max-w-[200px]">
                  <p className="mb-2.5 font-serif text-[19px] text-pi-gold-deep">{point.title}</p>
                  <p className="text-sm leading-relaxed text-pi-cream/55">{point.body}</p>
                </div>
              ))}
            </div>
          </m.div>

          {/* plans — honest: no invented price, real pricing shown post-signup */}
          <m.div {...reveal()} className="flex min-h-[56vh] flex-col items-center justify-center px-6 py-[6vh] sm:px-[8%]">
            <p className="mb-12 text-xs uppercase tracking-[0.1em] text-pi-cream/45">Plans</p>
            <div className="flex flex-wrap justify-center gap-16">
              <div className="max-w-[260px] rounded-[20px] px-6 py-8 text-center transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.02]">
                <div className="relative mx-auto mb-5 h-14 w-14 rounded-full border border-white/[0.16]" style={{ background: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,0.08), rgba(255,255,255,0.02))' }} />
                <p className="mb-1.5 font-serif text-2xl text-pi-cream">Starter</p>
                <p className="mb-5 text-sm text-pi-cream/45">Free</p>
                <p className="mb-6 text-[15px] leading-relaxed text-pi-cream/60">3 research runs a month, weekly re-checks, unlimited tracked ideas.</p>
                <Link href="/login?signup=1" className="border-b border-pi-gold-deep/40 pb-1 text-sm font-semibold text-pi-gold-deep hover:border-[#F0DBA0] hover:text-[#F0DBA0]">
                  Start free →
                </Link>
              </div>
              <div className="relative max-w-[260px] rounded-[20px] px-6 py-8 text-center transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.02]">
                <div aria-hidden className="absolute left-1/2 top-0 h-[220px] w-[220px] -translate-x-1/2 -translate-y-[20%] rounded-full blur-sm" style={{ background: 'radial-gradient(circle, rgba(212,169,74,0.14), transparent 70%)' }} />
                <div className="relative">
                  <div className="relative mx-auto mb-5 h-14 w-14 rounded-full border border-pi-gold-deep/30" style={{ background: 'radial-gradient(circle at 38% 32%, rgba(212,169,74,0.22), rgba(212,169,74,0.05))' }} />
                  <p className="mb-1.5 font-serif text-2xl text-pi-cream">Pro</p>
                  <p className="mb-5 text-sm text-pi-cream/45">Pricing shown after signup</p>
                  <p className="mb-6 text-[15px] leading-relaxed text-pi-cream/60">More research runs, daily re-checks, unlimited tracked ideas.</p>
                  <Link href="/login?signup=1" className="border-b border-pi-gold-deep/40 pb-1 text-sm font-semibold text-pi-gold-deep hover:border-[#F0DBA0] hover:text-[#F0DBA0]">
                    See Pro →
                  </Link>
                </div>
              </div>
            </div>
            <p className="mt-12 text-[13px] text-pi-cream/35">No scarcity tactics. Cancel any time.</p>
          </m.div>

          {/* final CTA */}
          <m.div {...reveal()} className="relative flex min-h-[66vh] flex-col items-center justify-center px-6 py-[8vh] text-center sm:px-[8%]">
            <div aria-hidden className="absolute h-[260px] w-[260px] rounded-full blur-sm motion-safe:animate-cine-breathe" style={{ background: 'radial-gradient(circle, rgba(212,169,74,0.16), transparent 70%)' }} />
            <div className="relative mb-10 motion-safe:animate-cine-breathe">
              <RotorMark className="h-16 w-16" />
            </div>
            <p className="relative mb-4 font-serif text-[38px] font-medium text-pi-cream sm:text-[52px]">Stop guessing. Ask.</p>
            <p className="relative mb-9 text-base text-pi-cream/55">Your first research run is on us.</p>
            <Link href="/login?signup=1" className="relative border-b border-pi-gold-deep/40 pb-1.5 font-serif text-xl font-medium text-pi-gold-deep transition-colors duration-300 hover:border-[#F0DBA0] hover:text-[#F0DBA0]">
              Describe your idea →
            </Link>
            <p className="relative mt-7 text-[13px] text-pi-cream/35">No credit card. No sales call. Just a straight answer.</p>
          </m.div>

          {/* footer */}
          <div className="border-t border-white/[0.08] px-6 pb-12 pt-16 sm:px-[8%]">
            <p className="mb-9 max-w-[420px] font-serif text-[15px] italic text-pi-cream/55">A research partner, not a dashboard.</p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-pi-cream/35">© 2026 Product Intelligence</p>
              <div className="flex gap-6">
                <Link href="/login" className="text-xs text-pi-cream/45 hover:text-pi-gold-deep">Log in</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LazyMotion>
  )
}
