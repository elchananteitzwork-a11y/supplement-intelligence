'use client'

import { useState, useEffect } from 'react'
import { useRouter }            from 'next/navigation'
import { AppShell }             from '@/components/shell/AppShell'
import { HardCard, HardShadowSearchTextarea, PrimaryButton, GhostButton, GhostLinkButton } from '@/components/ui'
import { useThesis }            from '@/hooks/useThesis'
import type { ThesisDepth, MarketThesis } from '@/lib/thesis-engine'

// ── Constants ──────────────────────────────────────────────────────────────

const DEPTHS: { value: ThesisDepth; label: string; hint: string }[] = [
  { value: 'preliminary', label: 'Quick',    hint: '<15s  · signal data only' },
  { value: 'standard',    label: 'Standard', hint: '60–90s  · full synthesis' },
  { value: 'deep',        label: 'Deep',     hint: '2–5 min  · extended review scan' },
]

const SIGNAL_STRENGTH_COLOR: Record<string, string> = {
  STRONG:       'text-verdict-positive',
  POSITIVE:     'text-verdict-positive',
  MIXED:        'text-verdict-caution-text',
  WEAK:         'text-verdict-negative',
  INSUFFICIENT: 'text-outline',
}

const TIMING_VERDICT_COLOR: Record<string, string> = {
  ENTER_NOW:     'text-verdict-positive',
  WATCH_CLOSELY: 'text-verdict-caution-text',
  MONITOR:       'text-outline',
  LATE:          'text-verdict-caution-text',
  CLOSED:        'text-verdict-negative',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-1.5 bg-outline-variant overflow-hidden">
      <div
        className="h-full bg-black transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ProviderPill({
  label, state,
}: {
  label: string
  state: 'active' | 'done' | 'failed' | 'pending'
}) {
  const styles = {
    active:  'bg-white border-black text-black font-bold',
    done:    'bg-surface-container-low border-black text-ink-variant',
    failed:  'bg-white border-outline-variant text-outline',
    pending: 'bg-white border-outline-variant text-outline',
  }
  const icons = {
    active:  <span className="inline-block w-1.5 h-1.5 rounded-full bg-black animate-pulse"/>,
    done:    <span className="inline-block w-1.5 h-1.5 rounded-full bg-black"/>,
    failed:  <span className="text-outline leading-none">—</span>,
    pending: <span className="inline-block w-1.5 h-1.5 rounded-full border border-outline-variant"/>,
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 border font-mono uppercase ${styles[state]}`}>
      {icons[state]}
      {label}
    </span>
  )
}

function SectionPip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono ${ready ? 'text-ink' : 'text-outline'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-black' : 'border border-outline-variant'}`}/>
      {label}
    </div>
  )
}

function ConfidenceBadge({ label, value }: { label: string; value: number }) {
  const color = value >= 0.75 ? 'text-verdict-positive' : value >= 0.55 ? 'text-verdict-caution-text' : 'text-outline'
  return (
    <span className={`text-xs font-mono ${color}`}>
      {label} ({Math.round(value * 100)}%)
    </span>
  )
}

// ── Thesis display ─────────────────────────────────────────────────────────

function ThesisDisplay({ thesis }: { thesis: MarketThesis }) {
  const { verdict, timing, market_failures, difficulty, product_thesis, risks } = thesis

  return (
    <div className="space-y-4">

      {/* ── Verdict ── */}
      <HardCard className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-outline mb-1">Verdict</p>
            <h2 className="text-headline-md text-black leading-snug">{verdict.headline}</h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono font-black text-3xl text-black">
              {verdict.opportunity_score}
            </p>
            <p className="text-xs text-outline mt-0.5">/ 100</p>
          </div>
        </div>
        <p className={`text-sm font-bold ${SIGNAL_STRENGTH_COLOR[verdict.signal_strength] ?? 'text-ink-variant'}`}>
          {verdict.signal_strength}
        </p>
        <p className="text-sm text-ink-variant leading-relaxed">{verdict.summary}</p>
        <blockquote className="border-l-2 border-black pl-3">
          <p className="italic text-sm text-ink-variant">{verdict.one_liner}</p>
        </blockquote>
        <ConfidenceBadge label={verdict.confidence.label} value={verdict.confidence.value}/>
      </HardCard>

      {/* ── Timing ── */}
      <HardCard className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-outline">Timing</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`font-bold text-sm ${TIMING_VERDICT_COLOR[timing.timing_verdict] ?? 'text-ink-variant'}`}>
            {timing.timing_verdict.replace(/_/g, ' ')}
          </span>
          <span className="text-outline">·</span>
          <span className="text-sm text-ink-variant">{timing.phase_label}</span>
          <span className="text-outline">·</span>
          <span className="text-xs text-outline capitalize">
            Window {timing.window_estimate.direction}
          </span>
        </div>
        <p className="text-sm text-ink-variant leading-relaxed">{timing.summary}</p>
        <p className="text-xs text-outline">{timing.window_estimate.explanation}</p>
        {/* Real, routed signals — not a synthesized re-statement of them */}
        {timing.signals.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {timing.signals.map((sig, i) => (
              <span key={i} className="text-xs px-2 py-1 border border-black text-ink-variant bg-white">
                {sig.description}
              </span>
            ))}
          </div>
        )}
        <ConfidenceBadge label={timing.confidence.label} value={timing.confidence.value}/>
      </HardCard>

      {/* ── Market Failures ── */}
      <HardCard className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-outline">Market Failures</p>
        <p className="text-sm text-ink-variant">{market_failures.headline}</p>
        <div className="space-y-3">
          {market_failures.failures.map(f => (
            <div key={f.id} className="border border-black p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-bold text-black">{f.title}</h4>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-mono ${f.severity === 'High' ? 'text-verdict-negative' : f.severity === 'Medium' ? 'text-verdict-caution-text' : 'text-outline'}`}>
                    {f.severity}
                  </span>
                  <span className="text-xs text-outline">·</span>
                  <span className="text-xs text-outline capitalize">{f.tier}</span>
                </div>
              </div>
              <p className="text-xs text-ink-variant mb-2">{f.description}</p>
              <p className="text-xs text-black">{f.opportunity}</p>
            </div>
          ))}
        </div>
        <ConfidenceBadge label={market_failures.confidence.label} value={market_failures.confidence.value}/>
      </HardCard>

      {/* ── Difficulty ── */}
      <HardCard className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-outline">Difficulty</p>
          <span className="text-sm font-bold text-ink">{difficulty.overall_label}</span>
        </div>
        <p className="text-xs text-outline">Primary challenge: {difficulty.primary_challenge}</p>
        <div className="grid grid-cols-2 gap-2">
          {difficulty.dimensions.map(dim => (
            <div key={dim.name} className="border border-black p-2.5 bg-surface-container-low">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-outline uppercase tracking-wide">{dim.name}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${
                  dim.label === 'EASY' ? 'text-verdict-positive' :
                  dim.label === 'MEDIUM' ? 'text-verdict-caution-text' : 'text-verdict-negative'
                }`}>{dim.label}</span>
              </div>
              <p className="text-[11px] text-ink-variant leading-snug">{dim.explanation}</p>
            </div>
          ))}
        </div>
        <ConfidenceBadge label={difficulty.confidence.label} value={difficulty.confidence.value}/>
      </HardCard>

      {/* ── Product Thesis ── */}
      <HardCard className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-outline">Product Thesis</p>
        <p className="text-sm font-bold text-black">{product_thesis.headline}</p>
        <p className="text-sm text-ink-variant">{product_thesis.summary}</p>
        <div className="border border-black bg-surface-container-low p-3">
          <p className="text-xs text-outline mb-1">Positioning angle</p>
          <p className="text-sm italic text-ink-variant">&quot;{product_thesis.positioning_angle}&quot;</p>
        </div>
        <div className="border border-black bg-surface-container-low p-3">
          <p className="text-xs text-outline mb-1">Differentiation: {product_thesis.differentiation.vector}</p>
          <p className="text-xs text-ink-variant">{product_thesis.differentiation.description}</p>
          <p className="text-xs text-outline mt-1">Moat: {product_thesis.differentiation.moat}</p>
        </div>
        {product_thesis.pricing_position && (
          <p className="text-xs text-outline">Pricing position: {product_thesis.pricing_position}</p>
        )}
        <p className="text-[10px] font-mono uppercase tracking-wider text-outline pt-1">Next Steps</p>
        <div className="space-y-2">
          {product_thesis.recommended_steps.map((step, i) => (
            <div key={i} className="flex gap-2.5 text-sm">
              <span className="font-mono text-xs text-outline pt-0.5 w-4 shrink-0">{i + 1}.</span>
              <div>
                <span className={`inline-block text-[10px] px-1.5 py-0.5 border mr-1.5 mb-0.5 font-mono uppercase ${
                  step.priority === 'immediate'   ? 'border-verdict-positive text-verdict-positive' :
                  step.priority === 'short_term'  ? 'border-verdict-caution-text text-verdict-caution-text' :
                                                    'border-black text-outline'
                }`}>
                  {step.priority.replace('_', ' ')}
                </span>
                <span className="text-ink-variant">{step.action}</span>
                <p className="text-xs text-outline mt-0.5">{step.rationale}</p>
              </div>
            </div>
          ))}
        </div>
        <ConfidenceBadge label={product_thesis.confidence.label} value={product_thesis.confidence.value}/>
      </HardCard>

      {/* ── Risks ── */}
      {risks.length > 0 && (
        <HardCard className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-outline">Risks</p>
          <div className="space-y-2">
            {risks.map((risk, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className={`text-xs font-bold mt-0.5 shrink-0 ${
                  risk.severity === 'High'   ? 'text-verdict-negative' :
                  risk.severity === 'Medium' ? 'text-verdict-caution-text' : 'text-outline'
                }`}>{risk.severity}</span>
                <div>
                  <p className="text-ink font-medium">{risk.title}</p>
                  <p className="text-xs text-outline">{risk.description}</p>
                  {risk.mitigation && (
                    <p className="text-xs text-outline mt-0.5">Mitigation: {risk.mitigation}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </HardCard>
      )}

      {/* ── Meta ── */}
      <div className="text-xs font-mono text-outline pb-8">
        {thesis.category_name && <span className="mr-3">{thesis.category_name}</span>}
        <span className="mr-3">v{thesis.analysis_version}</span>
        <span>{thesis.providers_succeeded.join(', ')}</span>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ThesisPage() {
  const router = useRouter()
  const {
    status,
    thesis,
    error,
    needsLogin,
    activeProviders,
    completedProviders,
    failedProviders,
    synthesizing,
    sectionsReady,
    progress,
    statusMessage,
    start,
    reset,
  } = useThesis()

  const [query, setQuery]   = useState('')
  const [depth, setDepth]   = useState<ThesisDepth>('standard')

  // All provider IDs we track for the status display
  const trackedProviders: Array<{ id: string; label: string }> = [
    { id: 'keepa',          label: 'Keepa'   },
    { id: 'google_trends',  label: 'Trends'  },
    { id: 'reddit',         label: 'Reddit'  },
    { id: 'tiktok',         label: 'TikTok'  },
    { id: 'amazon_reviews', label: 'Reviews' },
  ]

  const SECTIONS: Array<{ key: string; label: string }> = [
    { key: 'verdict',         label: 'Verdict'         },
    { key: 'timing',          label: 'Timing'          },
    { key: 'market_failures', label: 'Market Failures' },
    { key: 'difficulty',      label: 'Difficulty'      },
    { key: 'product_thesis',  label: 'Product Thesis'  },
  ]

  // 401 → redirect to login
  useEffect(() => {
    if (needsLogin) router.push('/login')
  }, [needsLogin, router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || status === 'streaming') return
    start({ query: query.trim(), depth })
  }

  // ── STREAMING ──────────────────────────────────────────────────────────
  if (status === 'streaming') {
    return (
      <AppShell active="thesis">
        <div className="max-w-md mx-auto py-12">
          <HardCard>
            {/* header */}
            <p className="text-xs text-outline mb-1 truncate">Analyzing</p>
            <p className="font-bold text-base mb-5 truncate text-black">&quot;{query}&quot;</p>

            {/* progress bar */}
            <ProgressBar pct={progress} />
            <div className="flex items-center justify-between mt-2 mb-6">
              <p className="text-sm text-ink-variant">{statusMessage}</p>
              <span className="font-mono text-xs text-outline">{progress}%</span>
            </div>

            {/* provider pills */}
            <div className="mb-4">
              <p className="text-xs font-mono uppercase text-outline mb-2">Data sources</p>
              <div className="flex flex-wrap gap-1.5">
                {trackedProviders.map(p => {
                  const pState =
                    completedProviders.includes(p.id as never) ? 'done' :
                    failedProviders.includes(p.id as never)    ? 'failed' :
                    activeProviders.includes(p.id as never)    ? 'active' :
                    'pending'
                  return <ProviderPill key={p.id} label={p.label} state={pState}/>
                })}
              </div>
            </div>

            {/* section pips */}
            {synthesizing && (
              <div className="border-t border-black/10 pt-4 mt-2">
                <p className="text-xs font-mono uppercase text-outline mb-2">Sections</p>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                  {SECTIONS.map(s => (
                    <SectionPip
                      key={s.key}
                      label={s.label}
                      ready={sectionsReady.includes(s.key as never)}
                    />
                  ))}
                </div>
              </div>
            )}
          </HardCard>
        </div>
      </AppShell>
    )
  }

  // ── ERROR ──────────────────────────────────────────────────────────────
  if (status === 'error' && !needsLogin) {
    return (
      <AppShell active="thesis">
        <div className="max-w-md mx-auto py-12">
          <HardCard className="text-center">
            <p className="text-sm font-bold text-verdict-negative mb-2">Analysis failed</p>
            <p className="text-sm text-ink-variant mb-6">{error}</p>
            <PrimaryButton onClick={reset} className="w-full">Try again</PrimaryButton>
          </HardCard>
        </div>
      </AppShell>
    )
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────
  if (status === 'complete' && thesis) {
    return (
      <AppShell active="thesis">
        <div className="max-w-xl mx-auto">
          {/* nav */}
          <div className="flex items-center justify-between mb-6 border-b-2 border-black pb-4">
            <GhostButton onClick={reset}>← New Analysis</GhostButton>
            <GhostLinkButton href="/dashboard">Dashboard</GhostLinkButton>
          </div>

          <ThesisDisplay thesis={thesis}/>
        </div>
      </AppShell>
    )
  }

  // ── FORM ───────────────────────────────────────────────────────────────
  return (
    <AppShell active="thesis">
      <div className="max-w-xl space-y-6">
        <div className="space-y-1 border-b-2 border-black pb-4">
          <h1 className="text-headline-md text-black">Market Thesis</h1>
          <p className="text-sm text-ink-variant">
            Enter a supplement idea or category to get a structured market intelligence report.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* query */}
          <HardCard className="space-y-3">
            <label className="block text-sm font-bold text-ink">
              Supplement idea or category
              <span className="text-verdict-negative ml-1">*</span>
            </label>
            <HardShadowSearchTextarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`"magnesium for sleep"\n"cortisol support for women 35+"\n"gut health probiotics"`}
              className="h-24 text-sm leading-relaxed"
              maxLength={500}
              required
              autoFocus
            />
            <p className="text-xs text-outline text-right">{query.length}/500</p>
          </HardCard>

          {/* depth */}
          <HardCard>
            <p className="text-sm font-bold text-ink mb-3">Analysis depth</p>
            <div className="grid grid-cols-3 gap-2">
              {DEPTHS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDepth(d.value)}
                  className={`text-left p-3 border text-sm transition-colors ${
                    depth === d.value
                      ? 'border-2 border-black bg-surface-container-low text-black'
                      : 'border-black bg-white text-ink-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="block font-bold mb-0.5">{d.label}</span>
                  <span className="block text-[10px] text-outline">{d.hint}</span>
                </button>
              ))}
            </div>
          </HardCard>

          <PrimaryButton type="submit" disabled={!query.trim()} className="w-full py-3 text-base">
            Generate Market Thesis →
          </PrimaryButton>

        </form>
      </div>
    </AppShell>
  )
}
