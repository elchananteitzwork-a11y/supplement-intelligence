'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { BuildDecision } from '@/types/index'
import type { CoreViewModel } from './coreDataAdapter'
import type { PullDirection } from './corePullPhysics'

// ═══════════════════════════════════════════════════════════════════════
// Candidate Core hero — top-of-page WebGL summary layer (UIv2-M2 Phase 1).
//
// DOM-FIRST BY CONSTRUCTION: every real number this component shows
// (score, decision word, confidence, per-blade magnitude, kill criteria)
// is rendered as real, always-present markup below, independent of
// whether the WebGL rotor ever mounts. The <CandidateCoreCanvas> is a
// pure decorative/interactive ENHANCEMENT layered on top — this is the
// standing "graceful fallback for mobile / prefers-reduced-motion / weak
// devices" requirement satisfied by architecture, not by a special-cased
// fallback component that could drift out of sync with the real one. The
// blade legend below is also the actual accessible interaction surface
// (real DOM buttons, keyboard/screen-reader native) — see
// CandidateCoreRotor.tsx's own header comment.
// ═══════════════════════════════════════════════════════════════════════

const CandidateCoreCanvas = dynamic(() => import('./CandidateCoreCanvas').then(m => m.CandidateCoreCanvas), {
  ssr: false,
  loading: () => null,
})

const DECISION_COLOR: Record<BuildDecision, string> = {
  BUILD_NOW:                    'text-pi-build border-pi-build/40 bg-pi-build/15',
  VALIDATE_FURTHER:             'text-pi-invest border-pi-invest/40 bg-pi-invest/15',
  SKIP:                         'text-pi-pass border-pi-pass/40 bg-pi-pass/15',
  CATEGORY_CREATION_CANDIDATE:  'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/15',
}

function useWebglCapableViewport(): boolean {
  const [capable, setCapable] = useState(false)
  useEffect(() => {
    // Weak-device / mobile mitigation (R&D §4): a small viewport is used
    // as a simple, disclosed proxy for "likely a weaker GPU" alongside the
    // real WebGL support check — the DOM overlay above already carries
    // every real number regardless, so this only ever withholds the
    // decorative canvas, never any real data.
    let hasWebgl = false
    try {
      const canvas = document.createElement('canvas')
      hasWebgl = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
    } catch {
      hasWebgl = false
    }
    // Pre-beta audit fix: this used to check window.innerWidth once at
    // mount only, so rotating a tablet or resizing a desktop window across
    // the 640px line never re-evaluated it — a user could end up with a
    // canvas at a width it was never meant to render at, or stuck without
    // one after resizing back up.
    function evaluate() {
      setCapable(hasWebgl && window.innerWidth >= 640)
    }
    evaluate()
    window.addEventListener('resize', evaluate)
    return () => window.removeEventListener('resize', evaluate)
  }, [])
  return capable
}

function BladeMagnitudeReadout({ magnitude, qualitativeLevel, source }: { magnitude: number | null; qualitativeLevel: string | null; source: string }) {
  if (source === 'verified' && magnitude !== null) return <span className="font-mono text-xs text-pi-cream/90">{magnitude.toFixed(1)}/10</span>
  if (source === 'synthesized') return <span className="text-[10px] italic text-pi-cream/50">AI judgment{qualitativeLevel ? ` · ${qualitativeLevel}` : ''}</span>
  return <span className="text-[10px] italic text-pi-cream/40">Not computed</span>
}

const KILL_WATCH_LABEL: Record<string, string> = {
  'not-watched': '',
  watching: 'Watching',
  triggered: 'Triggered',
}

export function CandidateCoreHero({ vm }: { vm: CoreViewModel }) {
  const webglCapable = useWebglCapableViewport()
  // Pre-beta audit fix: tracks whether the WebGL canvas has actually
  // revealed its own score (fires via CandidateCoreRotor's own
  // scoreRevealed timing), not merely whether WebGL capability was
  // detected. The DOM score fallback below stays visible until this is
  // true — otherwise the score is invisible for the real chunk-load +
  // SCORE_REVEAL_DELAY_MS window between "capability detected" and
  // "canvas has actually painted a number."
  const [canvasScoreRevealed, setCanvasScoreRevealed] = useState(false)
  useEffect(() => {
    if (!webglCapable) setCanvasScoreRevealed(false)
  }, [webglCapable])
  const showDomScore = !(webglCapable && canvasScoreRevealed)
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function jumpToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  // Real plumbing, no-op today — see CandidateCoreRotor.tsx's own prop
  // comment. No "record your conviction" affordance exists in production
  // yet to wire this to; intentionally left unwired rather than inventing
  // new UI for it (out of this milestone's scope).
  const onSignificantPull: ((direction: PullDirection) => void) | undefined = undefined

  return (
    <section aria-label="Candidate Core summary" className="relative mb-8 overflow-hidden rounded-2xl border border-pi-hairline bg-[#14130f]">
      {/* dark stage the engine glows against — locked design DNA */}
      <div className="relative min-h-[380px] px-6 py-10 sm:px-10">
        {webglCapable && (
          <CandidateCoreCanvas
            score={vm.score}
            confidencePct={vm.confidencePct}
            blades={vm.blades}
            onBladeClick={jumpToSection}
            onSignificantPull={onSignificantPull}
            onScoreRevealed={() => setCanvasScoreRevealed(true)}
          />
        )}

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          {showDomScore && (
            <div className="flex flex-col items-center gap-1 pt-4">
              <span className="font-mono text-[40px] font-semibold leading-none text-pi-gold-bright">{vm.score}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold/60">Score</span>
            </div>
          )}

          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${DECISION_COLOR[vm.decision]}`}>
            {vm.decisionLabel}
          </span>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-pi-cream/70">
            <span>
              Confidence:{' '}
              <span className="font-mono font-semibold text-pi-cream/90">{vm.confidencePct !== null ? `${vm.confidencePct}%` : 'not available'}</span>
              {vm.weakestDimensionLabel && vm.confidencePct !== null ? ` (weakest link: ${vm.weakestDimensionLabel})` : ''}
            </span>
          </div>

          {/* Blade legend — real DOM, the actual accessible interaction
              surface (see file header). Always rendered, WebGL or not. */}
          <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            {vm.blades.map(b => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => jumpToSection(b.sectionId)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-pi-gold/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
                >
                  <span className="text-[11px] font-semibold text-pi-cream/90">{b.label}</span>
                  <BladeMagnitudeReadout magnitude={b.magnitude} qualitativeLevel={b.qualitativeLevel} source={b.source} />
                </button>
              </li>
            ))}
          </ul>

          {/* Real flat kill-criteria statements, + a real Watching/
              Triggered pill only when this analysis is genuinely
              watchlisted — see coreDataAdapter.ts's own HONESTY CAVEAT. */}
          {vm.killCriteria.length > 0 && (
            <div className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-pi-cream/50">We would reverse this verdict if…</p>
              <ul className="space-y-1.5">
                {vm.killCriteria.map(c => (
                  <li key={c.key} className="flex items-start justify-between gap-3 text-xs text-pi-cream/75">
                    <span>{c.label} — currently {c.valueAtGenerationText}</span>
                    {c.watchState !== 'not-watched' && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.watchState === 'triggered' ? 'bg-pi-risk/20 text-pi-risk' : 'bg-white/10 text-pi-cream/60'
                        }`}
                      >
                        {KILL_WATCH_LABEL[c.watchState]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
