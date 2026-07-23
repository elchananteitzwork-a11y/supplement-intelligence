'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CoreViewModel } from './coreDataAdapter'
import type { PullDirection } from './corePullPhysics'
import { DECISION_CHIP } from '@/components/pi/decisionChip'
import { confidenceTier } from '@/components/pi/confidenceTier'
import { WitnessDots } from '@/components/ui/WitnessDots'
import { cn } from '@/lib/cn'

// ═══════════════════════════════════════════════════════════════════════
// Candidate Core hero — top-of-page WebGL summary layer (UIv2-M2 Phase 1,
// reframed cream-register verdict card in RD-UIv2-M4).
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
//
// RD-UIv2-M4 cream reframe: the wrapping stage is now bg-pi-cream (was the
// dark bg-[#14130f] "engine glows against a dark stage" stage) and every
// text/border class below is new cream-native pi-ink/pi-sub/pi-sand
// markup, not the old dark-tuned pi-cream/white classes recolored in
// place — those were confirmed illegible (near-white on cream) by live
// research this session. Layout order also changed: verdict word is now
// large/dominant immediately under the rotor, one quiet why-sentence,
// words+dots confidence, a visually de-emphasized signal grid, a neutral
// (non-alarming) kill-line, and a real working Sources toggle revealing
// the full, unmodified 14-section MemoDisplay (owned by the parent — see
// app/memo/[id]/MemoDetailBody.tsx).
// ═══════════════════════════════════════════════════════════════════════

const CandidateCoreCanvas = dynamic(() => import('./CandidateCoreCanvas').then(m => m.CandidateCoreCanvas), {
  ssr: false,
  loading: () => null,
})

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
  if (source === 'verified' && magnitude !== null) return <span className="font-mono text-xs font-semibold text-pi-ink">{magnitude.toFixed(1)}/10</span>
  if (source === 'synthesized') return <span className="text-[10px] italic text-pi-sub">AI judgment{qualitativeLevel ? ` · ${qualitativeLevel}` : ''}</span>
  return <span className="text-[10px] italic text-pi-faint">Not computed</span>
}

const KILL_WATCH_LABEL: Record<string, string> = {
  'not-watched': '',
  watching: 'Watching',
  triggered: 'Triggered',
}

export function CandidateCoreHero({
  vm,
  categoryName,
  buildExplanation,
  sourcesOpen,
  onToggleSources,
}: {
  vm: CoreViewModel
  categoryName: string
  buildExplanation: string
  sourcesOpen: boolean
  onToggleSources: () => void
}) {
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

  // Altitude fix (RD-UIv2-M4 simplify pass): blade click-to-jump predates
  // the Sources toggle — MemoDisplay (and every section id it renders) now
  // only mounts when sourcesOpen is true, so a naive scrollIntoView while
  // collapsed silently no-ops (the target doesn't exist in the DOM yet).
  // Real fix, not a bandaid: open Sources first when needed, then scroll
  // once MemoDisplay has actually mounted (the effect below, gated on
  // sourcesOpen actually being true) — generalizes the existing mechanism
  // instead of leaving the pre-existing "actual accessible interaction
  // surface" (this file's own header comment) quietly broken.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)

  function jumpToSection(sectionId: string) {
    if (!sourcesOpen) {
      setPendingScrollId(sectionId)
      onToggleSources()
      return
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!sourcesOpen || !pendingScrollId) return
    document.getElementById(pendingScrollId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    setPendingScrollId(null)
  }, [sourcesOpen, pendingScrollId, reduceMotion])

  // Real plumbing, no-op today — see CandidateCoreRotor.tsx's own prop
  // comment. No "record your conviction" affordance exists in production
  // yet to wire this to; intentionally left unwired rather than inventing
  // new UI for it (out of this milestone's scope).
  const onSignificantPull: ((direction: PullDirection) => void) | undefined = undefined

  const chip = DECISION_CHIP[vm.decision]
  const confTier = vm.confidencePct !== null ? confidenceTier(vm.confidencePct) : null

  return (
    <section aria-label="Candidate Core summary" className="relative mb-8 overflow-hidden rounded-2xl border border-pi-hairline bg-pi-cream">
      <div className="relative px-6 py-10 sm:px-10 sm:py-12">
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          {/* category name — quiet, small, sits above the rotor */}
          <p className="text-sm font-semibold text-pi-ink">{categoryName}</p>

          {/* rotor stage — a fixed-size box, NOT the whole card. The real
              WebGL <CandidateCoreCanvas> fills this box (absolute
              inset-0, relative to this div, its nearest positioned
              ancestor) rather than the entire section as before — the old
              dense DOM-overlay was short enough that a full-section canvas
              never collided with anything below it; the new, taller
              reframed layout (verdict word/why/confidence/signals/kill-
              line stacked below) would visually collide with the rotor if
              the canvas still filled the whole card. This is a DOM-overlay
              layout change only — CandidateCoreCanvas.tsx itself is
              untouched. */}
          <div className="relative h-[220px] w-[220px] sm:h-[260px] sm:w-[260px]">
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
            {showDomScore && (
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1">
                <span className="font-mono text-[40px] font-semibold leading-none text-pi-gold-deep">{vm.score}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Score</span>
              </div>
            )}
          </div>

          {/* verdict word — LARGE, dominant, immediately under the
              rotor/score (not a small chip several elements later). Real
              DECISION_CHIP glyph + color; real decisionLabel text (the
              same legacy PILL_LABEL wording CurrentSignal.tsx's pill
              already uses, so the two never disagree about what this
              verdict is called). */}
          <p className={cn('font-serif text-[32px] font-bold leading-tight', chip.textCls)}>
            <span aria-hidden className="mr-2 text-[22px] align-middle">{chip.glyph}</span>
            {vm.decisionLabel}
          </p>

          {/* one-sentence why — real build_explanation, quiet styling,
              deliberately secondary to the verdict word above. */}
          {buildExplanation && (
            <p className="max-w-[46ch] text-[15px] leading-relaxed text-pi-sub text-balance">{buildExplanation}</p>
          )}

          {/* confidence line — words+dots, via the existing WitnessDots
              primitive (components/ui/WitnessDots.tsx) rather than a third
              hand-rolled dot renderer (simplify-pass finding). */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {confTier ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-bold text-pi-ink">{confTier.label}</span>
                <WitnessDots filled={confTier.dotsFilled} total={3} size="sm" variant="pi" label={`${confTier.label} confidence`} />
                <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-pi-sub">Confidence</span>
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-pi-sub">Confidence not available</span>
            )}
            {vm.weakestDimensionLabel && vm.confidencePct !== null && (
              <span className="text-xs text-pi-sub">· weakest link: {vm.weakestDimensionLabel}</span>
            )}
          </div>

          {/* Real 6-signal grid — deliberately quiet (smaller type, lower-
              contrast sand surface), so the verdict word above stays the
              only thing competing for a 5-second glance. Blade legend is
              also the actual accessible interaction surface (real DOM
              buttons, keyboard/screen-reader native) — pre-existing
              click-to-jump behavior, unchanged by this milestone (R&D §7
              non-goal: no NEW per-blade deep-linking added here). */}
          <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            {vm.blades.map(b => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => jumpToSection(b.sectionId)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-pi-hairline bg-pi-sand px-3 py-2 text-left transition-colors hover:border-pi-gold/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-pi-sub">{b.label}</span>
                  <BladeMagnitudeReadout magnitude={b.magnitude} qualitativeLevel={b.qualitativeLevel} source={b.source} />
                  <span className="text-[9px] text-pi-faint">{b.sourceLabel}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* kill-line — real flat kill-criteria statements, neutral
              hairline/sand framing (not the alarming dashed-red treatment
              — red stays reserved for an actual Skip/risk verdict, not
              routine transparency copy). Real Watching/Triggered pill only
              when this analysis is genuinely watchlisted — see
              coreDataAdapter.ts's own HONESTY CAVEAT. */}
          {vm.killCriteria.length > 0 && (
            <div className="w-full rounded-lg border border-pi-hairline bg-pi-sand px-4 py-3 text-left">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-pi-sub">We would reverse this verdict if…</p>
              <ul className="space-y-1.5">
                {vm.killCriteria.map(c => (
                  <li key={c.key} className="flex items-start justify-between gap-3 text-xs text-pi-sub">
                    <span>{c.label} — currently {c.valueAtGenerationText}</span>
                    {c.watchState !== 'not-watched' && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          c.watchState === 'triggered' ? 'bg-pi-risk/20 text-pi-risk' : 'bg-pi-hairline text-pi-sub',
                        )}
                      >
                        {KILL_WATCH_LABEL[c.watchState]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources — a real, working toggle (TechnicalDetailToggle idiom,
              components/memo/CurrentSignal.tsx). State is owned by the
              parent (app/memo/[id]/MemoDetailBody.tsx), which decides
              whether to render <MemoDisplay> at all — see that file's own
              header comment for why. */}
          <button
            type="button"
            onClick={onToggleSources}
            aria-expanded={sourcesOpen}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-6 py-3 text-sm font-semibold text-pi-ink shadow-[0_10px_22px_-10px_rgba(212,169,74,0.55)] transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
          >
            {sourcesOpen ? 'Hide sources' : `Sources · ${vm.sourcesCount} →`}
          </button>
        </div>
      </div>
    </section>
  )
}
