'use client'

import { useState, useEffect } from 'react'
import { useRouter }            from 'next/navigation'
import Link                     from 'next/link'
import { useThesis }            from '@/hooks/useThesis'
import type { ThesisDepth, MarketThesis } from '@/lib/thesis-engine'

// ── Constants ──────────────────────────────────────────────────────────────

const DEPTHS: { value: ThesisDepth; label: string; hint: string }[] = [
  { value: 'preliminary', label: 'Quick',    hint: '<15s  · signal data only' },
  { value: 'standard',    label: 'Standard', hint: '60–90s  · full synthesis' },
  { value: 'deep',        label: 'Deep',     hint: '2–5 min  · extended review scan' },
]

const PROVIDER_SHORT: Record<string, string> = {
  keepa:          'Keepa',
  google_trends:  'Trends',
  reddit:         'Reddit',
  tiktok:         'TikTok',
  amazon_reviews: 'Reviews',
  meta_ads:       'Meta',
  amazon_ads:     'AMZ Ads',
}

const SIGNAL_STRENGTH_COLOR: Record<string, string> = {
  STRONG:       'text-emerald-400',
  POSITIVE:     'text-emerald-300',
  MIXED:        'text-amber-400',
  WEAK:         'text-red-400',
  INSUFFICIENT: 'text-zinc-500',
}

const TIMING_VERDICT_COLOR: Record<string, string> = {
  ENTER_NOW:    'text-emerald-400',
  WATCH_CLOSELY:'text-amber-400',
  MONITOR:      'text-zinc-400',
  LATE:         'text-orange-400',
  CLOSED:       'text-red-400',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-emerald-400 rounded-full transition-all duration-700 ease-out"
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
    active:  'bg-zinc-800 border-emerald-500/50 text-emerald-300',
    done:    'bg-zinc-800 border-emerald-800   text-zinc-400',
    failed:  'bg-zinc-800 border-red-900       text-zinc-600',
    pending: 'bg-zinc-900 border-zinc-800      text-zinc-700',
  }
  const icons = {
    active:  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>,
    done:    <span className="text-emerald-600 leading-none">✓</span>,
    failed:  <span className="text-zinc-700 leading-none">—</span>,
    pending: <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-700"/>,
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${styles[state]}`}>
      {icons[state]}
      {label}
    </span>
  )
}

function SectionPip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ready ? 'text-zinc-400' : 'text-zinc-700'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-zinc-800'}`}/>
      {label}
    </div>
  )
}

function ConfidenceBadge({ label, value }: { label: string; value: number }) {
  const color = value >= 0.75 ? 'text-emerald-400' : value >= 0.55 ? 'text-amber-400' : 'text-zinc-500'
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
    <div className="space-y-4 animate-in">

      {/* ── Verdict ── */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="label mb-1">Verdict</p>
            <h2 className="text-lg font-semibold leading-snug">{verdict.headline}</h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono font-bold text-3xl text-emerald-400">
              {verdict.opportunity_score}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">/ 100</p>
          </div>
        </div>
        <p className={`text-sm font-semibold mb-2 ${SIGNAL_STRENGTH_COLOR[verdict.signal_strength] ?? 'text-zinc-400'}`}>
          {verdict.signal_strength}
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed mb-3">{verdict.summary}</p>
        <blockquote className="border-l-2 border-emerald-500 pl-3 italic text-sm text-zinc-400">
          {verdict.one_liner}
        </blockquote>
        <div className="mt-3">
          <ConfidenceBadge label={verdict.confidence.label} value={verdict.confidence.value}/>
        </div>
      </div>

      {/* ── Timing ── */}
      <div className="card p-5">
        <p className="label mb-2">Timing</p>
        <div className="flex items-center gap-3 mb-2">
          <span className={`font-bold text-sm ${TIMING_VERDICT_COLOR[timing.timing_verdict] ?? 'text-zinc-400'}`}>
            {timing.timing_verdict.replace(/_/g, ' ')}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-sm text-zinc-400">{timing.phase_label}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs text-zinc-500">
            ~{timing.window_estimate.estimated_months}mo window ({timing.window_estimate.direction})
          </span>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">{timing.summary}</p>
        {timing.trend_signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {timing.trend_signals.map((ts, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                {ts.label}: <span className="font-mono">{ts.metric}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Market Failures ── */}
      <div className="card p-5">
        <p className="label mb-3">Market Failures</p>
        <p className="text-sm text-zinc-400 mb-4">{market_failures.headline}</p>
        <div className="space-y-3">
          {market_failures.failures.map(f => (
            <div key={f.id} className="border border-zinc-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="text-sm font-semibold">{f.title}</h4>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs ${f.severity === 'High' ? 'text-red-400' : f.severity === 'Medium' ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {f.severity}
                  </span>
                  <span className="text-xs text-zinc-600">·</span>
                  <span className="text-xs text-zinc-500 capitalize">{f.tier}</span>
                  <span className="text-xs text-zinc-600">·</span>
                  <span className="font-mono text-xs text-zinc-500">{Math.round(f.prevalence * 100)}%</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-2">{f.description}</p>
              <p className="text-xs text-emerald-600">{f.opportunity}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Difficulty ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="label">Difficulty</p>
          <span className="font-mono text-sm font-bold text-zinc-300">
            {difficulty.overall_score}/10 <span className="text-zinc-500 font-normal">{difficulty.overall_label}</span>
          </span>
        </div>
        <p className="text-xs text-zinc-500 mb-3">Primary challenge: {difficulty.primary_challenge}</p>
        <div className="grid grid-cols-2 gap-2">
          {difficulty.dimensions.map(dim => (
            <div key={dim.name} className="bg-zinc-800/60 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{dim.name}</span>
                <span className={`font-mono text-xs font-bold ${
                  dim.label === 'EASY' ? 'text-emerald-400' :
                  dim.label === 'MEDIUM' ? 'text-amber-400' : 'text-red-400'
                }`}>{dim.score}/10</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">{dim.explanation}</p>
              {dim.metric && <p className="text-[10px] text-zinc-600 mt-0.5">{dim.metric}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Product Thesis ── */}
      <div className="card p-5">
        <p className="label mb-2">Product Thesis</p>
        <p className="text-sm font-semibold mb-1">{product_thesis.headline}</p>
        <p className="text-sm text-zinc-400 mb-3">{product_thesis.summary}</p>
        <div className="bg-zinc-800/60 rounded-lg p-3 mb-3">
          <p className="text-xs text-zinc-500 mb-1">Positioning angle</p>
          <p className="text-sm italic text-zinc-300">"{product_thesis.positioning_angle}"</p>
        </div>
        <div className="bg-zinc-800/60 rounded-lg p-3 mb-3">
          <p className="text-xs text-zinc-500 mb-1">Differentiation: {product_thesis.differentiation.vector}</p>
          <p className="text-xs text-zinc-400">{product_thesis.differentiation.description}</p>
          <p className="text-xs text-zinc-600 mt-1">Moat: {product_thesis.differentiation.moat}</p>
        </div>
        {product_thesis.price_range && (
          <p className="text-xs text-zinc-500 mb-3">Target price: {product_thesis.price_range}</p>
        )}
        <p className="label mb-2">Next Steps</p>
        <div className="space-y-2">
          {product_thesis.recommended_steps.map((step, i) => (
            <div key={i} className="flex gap-2.5 text-sm">
              <span className="font-mono text-xs text-zinc-600 pt-0.5 w-4 shrink-0">{i + 1}.</span>
              <div>
                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full mr-1.5 mb-0.5 ${
                  step.priority === 'immediate'   ? 'bg-emerald-400/10 text-emerald-400' :
                  step.priority === 'short_term'  ? 'bg-amber-400/10  text-amber-400'   :
                                                    'bg-zinc-800      text-zinc-500'
                }`}>
                  {step.priority.replace('_', ' ')}
                </span>
                <span className="text-zinc-300">{step.action}</span>
                <p className="text-xs text-zinc-600 mt-0.5">{step.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risks ── */}
      {risks.length > 0 && (
        <div className="card p-5">
          <p className="label mb-3">Risks</p>
          <div className="space-y-2">
            {risks.map((risk, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className={`text-xs font-semibold mt-0.5 shrink-0 ${
                  risk.severity === 'High'   ? 'text-red-400' :
                  risk.severity === 'Medium' ? 'text-amber-400' : 'text-zinc-500'
                }`}>{risk.severity}</span>
                <div>
                  <p className="text-zinc-300 font-medium">{risk.title}</p>
                  <p className="text-xs text-zinc-500">{risk.description}</p>
                  {risk.mitigation && (
                    <p className="text-xs text-zinc-600 mt-0.5">Mitigation: {risk.mitigation}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Meta ── */}
      <div className="text-xs text-zinc-700 pb-8">
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-8 animate-in">

          {/* header */}
          <p className="text-xs text-zinc-500 mb-1 truncate">Analyzing</p>
          <p className="font-semibold text-base mb-5 truncate">"{query}"</p>

          {/* progress bar */}
          <ProgressBar pct={progress} />
          <div className="flex items-center justify-between mt-2 mb-6">
            <p className="text-sm text-zinc-400">{statusMessage}</p>
            <span className="font-mono text-xs text-zinc-600">{progress}%</span>
          </div>

          {/* provider pills */}
          <div className="mb-4">
            <p className="text-xs text-zinc-600 mb-2">Data sources</p>
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
            <div className="border-t border-zinc-800 pt-4 mt-2">
              <p className="text-xs text-zinc-600 mb-2">Sections</p>
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
        </div>
      </div>
    )
  }

  // ── ERROR ──────────────────────────────────────────────────────────────
  if (status === 'error' && !needsLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-8 text-center animate-in">
          <p className="text-sm font-semibold text-red-400 mb-2">Analysis failed</p>
          <p className="text-sm text-zinc-400 mb-6">{error}</p>
          <button onClick={reset} className="btn-dark w-full">
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ── COMPLETE ───────────────────────────────────────────────────────────
  if (status === 'complete' && thesis) {
    return (
      <div className="min-h-screen py-10 px-4">
        <div className="max-w-xl mx-auto">

          {/* nav */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={reset} className="btn-ghost text-xs -ml-2">
              ← New Analysis
            </button>
            <Link href="/dashboard" className="btn-ghost text-xs -mr-2">
              Dashboard
            </Link>
          </div>

          <ThesisDisplay thesis={thesis}/>
        </div>
      </div>
    )
  }

  // ── FORM ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-xl mx-auto animate-in">

        <Link href="/dashboard" className="btn-ghost text-xs -ml-2 mb-6 inline-flex">
          ← Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-1">Market Thesis</h1>
        <p className="text-sm text-zinc-400 mb-8">
          Enter a supplement idea or category to get a structured market intelligence report.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* query */}
          <div className="card p-6 space-y-3">
            <label className="block text-sm font-medium">
              Supplement idea or category
              <span className="text-red-400 ml-1">*</span>
            </label>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`"magnesium for sleep"\n"cortisol support for women 35+"\n"gut health probiotics"`}
              className="field resize-none h-24 text-sm leading-relaxed"
              maxLength={500}
              required
              autoFocus
            />
            <p className="text-xs text-zinc-600 text-right">{query.length}/500</p>
          </div>

          {/* depth */}
          <div className="card p-5">
            <p className="text-sm font-medium mb-3">Analysis depth</p>
            <div className="grid grid-cols-3 gap-2">
              {DEPTHS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDepth(d.value)}
                  className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                    depth === d.value
                      ? 'border-emerald-500/50 bg-emerald-500/5 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span className="block font-medium mb-0.5">{d.label}</span>
                  <span className="block text-[10px] text-zinc-600">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!query.trim()}
            className="btn-white w-full py-3 text-base"
          >
            Generate Market Thesis →
          </button>

        </form>
      </div>
    </div>
  )
}
