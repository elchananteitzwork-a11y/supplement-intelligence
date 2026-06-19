'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link          from 'next/link'
import type { OpportunityCard } from '@/types/index'

// ── constants ─────────────────────────────────────────────────

type PageMode = 'form' | 'discovering' | 'results' | 'analyzing'

const DISCOVERY_STEPS = [
  'Scanning the category...',
  'Identifying market opportunities...',
  'Scoring each opportunity...',
  'Ranking by opportunity score...',
]

const ANALYSIS_STEPS = [
  'Mapping market conditions...',
  'Scoring demand and competition...',
  'Analyzing virality potential...',
  'Building formula recommendation...',
  'Calculating financial projections...',
  'Writing investment memo...',
]

const EXAMPLES_BROAD = [
  'Gut Health', 'Sleep', "Women's Health",
  'Weight Loss', 'Hair Loss', 'Energy', 'Hydration', 'Longevity',
]

const EXAMPLES_SPECIFIC = [
  'Cortisol support for women 35+',
  'PCOS weight loss supplement',
  'Postpartum recovery supplement',
]

const PRICES = [
  { value: '',         label: 'Not sure' },
  { value: 'under-30', label: 'Under $30/mo' },
  { value: '30-50',    label: '$30–$50/mo' },
  { value: '50-75',    label: '$50–$75/mo' },
  { value: '75-plus',  label: '$75+/mo' },
]

// ── broad-vs-specific detection ────────────────────────────────
// Broad: ≤4 words, no qualifiers (numbers, "for/with", specific pops, ingredients)
const SPECIFIC_INGREDIENTS = new Set([
  'ashwagandha','magnesium','melatonin','creatine','inositol','berberine',
  'maca','collagen','vitamin','zinc','iron','glycine','taurine','biotin',
  'rhodiola','ginseng','turmeric','curcumin','coq10','nad','d3','b12',
])

function isBroadCategory(input: string): boolean {
  const t = input.trim().toLowerCase()
  if (/\bfor\b|\bwith\b/.test(t))                                 return false
  if (/\d/.test(t))                                               return false
  if (/\b(athlete|postpartum|pregnant|vegan|keto|pcos|adhd)\b/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.some(w => SPECIFIC_INGREDIENTS.has(w)))              return false
  return words.length <= 4
}

// ── helpers ────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-red-400'
}

function dimColor(s: number) {
  return s >= 8 ? 'text-emerald-400' : s >= 6 ? 'text-amber-400' : 'text-red-400'
}

// ── sub-components ─────────────────────────────────────────────

function DifficultyBadge({ d }: { d: OpportunityCard['difficulty'] }) {
  const styles = {
    Easy:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Medium: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
    Hard:   'text-red-400    bg-red-400/10    border-red-400/20',
  }
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[d]}`}>
      {d}
    </span>
  )
}

function MetaRow({ opp }: { opp: OpportunityCard }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
        <p className="text-[10px] text-zinc-500 mb-1">Startup Cost</p>
        <p className="text-xs font-semibold text-white">{opp.startup_cost}</p>
      </div>
      <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
        <p className="text-[10px] text-zinc-500 mb-1">Difficulty</p>
        <DifficultyBadge d={opp.difficulty} />
      </div>
      <div className="bg-zinc-800/60 rounded-lg p-2.5 text-center">
        <p className="text-[10px] text-zinc-500 mb-1">Launch Time</p>
        <p className="text-xs font-semibold text-white">{opp.launch_time}</p>
      </div>
    </div>
  )
}

function EvidenceGrid({ scores }: { scores: OpportunityCard['scores'] }) {
  const dims: { label: string; score: number; facts: string[] }[] = [
    {
      label: 'Demand',
      score: scores.demand.score,
      facts: [scores.demand.search_volume, scores.demand.trend, `Signal: ${scores.demand.signal}`],
    },
    {
      label: 'Competition',
      score: scores.competition.score,
      facts: [`${scores.competition.competing_brands} brands`, `Sat: ${scores.competition.saturation}`, `Barrier: ${scores.competition.barrier}`],
    },
    {
      label: 'Virality',
      score: scores.virality.score,
      facts: [`TikTok: ${scores.virality.tiktok}`, `Content: ${scores.virality.content_potential}`, `UGC: ${scores.virality.ugc}`],
    },
    {
      label: 'Subscription',
      score: scores.subscription.score,
      facts: [scores.subscription.repeat_cycle, `Retention: ${scores.subscription.retention}`],
    },
    {
      label: 'Manufacturing',
      score: scores.manufacturing.score,
      facts: [`Complexity: ${scores.manufacturing.complexity}`, `MOQ: ${scores.manufacturing.moq}`],
    },
    {
      label: 'Defensibility',
      score: scores.defensibility.score,
      facts: [scores.defensibility.rationale],
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {dims.map(({ label, score, facts }) => (
        <div key={label} className="bg-zinc-800/60 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{label}</span>
            <span className={`font-mono text-xs font-bold ${dimColor(score)}`}>{score}/10</span>
          </div>
          <div className="space-y-0.5">
            {facts.map(f => (
              <p key={f} className="text-[11px] text-zinc-400 leading-snug">{f}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepList({ steps, stepIdx }: { steps: string[]; stepIdx: number }) {
  return (
    <div className="space-y-2.5 text-left">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-3 text-sm">
          {i < stepIdx
            ? <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            : i === stepIdx
              ? <div className="w-4 h-4 shrink-0 grid place-items-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                </div>
              : <div className="w-4 h-4 shrink-0 rounded-full border border-zinc-700"/>
          }
          <span className={
            i < stepIdx   ? 'text-zinc-600 line-through' :
            i === stepIdx ? 'text-white' :
                            'text-zinc-600'
          }>{s}</span>
        </div>
      ))}
    </div>
  )
}

function ProgressRing({ stepIdx, total }: { stepIdx: number; total: number }) {
  const pct  = Math.round(((stepIdx + 1) / total) * 100)
  const r    = 40
  const circ = 2 * Math.PI * r
  return (
    <div className="relative w-24 h-24 mx-auto mb-8">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#27272a" strokeWidth="6"/>
        <circle cx="48" cy="48" r={r} fill="none" stroke="#34d399" strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * pct) / 100}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-emerald-400">
        {pct}%
      </span>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────

export default function AnalyzePage() {
  const router = useRouter()

  const [input,         setInput]         = useState('')
  const [audience,      setAudience]      = useState('')
  const [price,         setPrice]         = useState('')
  const [extra,         setExtra]         = useState('')
  const [showExtra,     setShowExtra]     = useState(false)
  const [mode,          setMode]          = useState<PageMode>('form')
  const [stepIdx,       setStepIdx]       = useState(0)
  const [error,         setError]         = useState('')
  const [opportunities, setOpportunities] = useState<OpportunityCard[]>([])
  const [analyzingName, setAnalyzingName] = useState('')
  const [prevMode,      setPrevMode]      = useState<'form' | 'results'>('form')
  const [cached,        setCached]        = useState(false)
  const [cacheWeek,     setCacheWeek]     = useState('')

  const broad = isBroadCategory(input)

  // ── discovery ──
  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    if (!broad) {
      return handleAnalyze(input.trim(), 'form')
    }

    setMode('discovering')
    setError('')
    setStepIdx(0)
    const timer = setInterval(
      () => setStepIdx(i => Math.min(i + 1, DISCOVERY_STEPS.length - 1)),
      4500,
    )

    try {
      const res = await fetch('/api/discover', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: input.trim() }),
      })
      clearInterval(timer)

      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 504) {
        setError('Discovery timed out — please try again.')
        setMode('form')
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Discovery failed')
      }

      const { opportunities: opps, cached: isCached, cache_week: week } = await res.json()
      setOpportunities(opps)
      setCached(isCached ?? false)
      setCacheWeek(week ?? '')
      setMode('results')
    } catch (err: unknown) {
      clearInterval(timer)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setMode('form')
    }
  }

  // ── full analysis ──
  async function handleAnalyze(idea: string, from: 'form' | 'results') {
    setPrevMode(from)
    setAnalyzingName(idea)
    setMode('analyzing')
    setError('')
    setStepIdx(0)
    const timer = setInterval(
      () => setStepIdx(i => Math.min(i + 1, ANALYSIS_STEPS.length - 1)),
      8000,
    )

    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          input:          idea,
          targetAudience: audience.trim() || undefined,
          pricePoint:     price          || undefined,
          context:        extra.trim()   || undefined,
          fromDiscovery:  from === 'results',
        }),
      })
      clearInterval(timer)

      if (res.status === 429) {
        setError('You have used all your beta analyses. Thank you for testing!')
        setMode(from)
        return
      }
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 504) {
        setError('Analysis timed out — please try again.')
        setMode(from)
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Generation failed')
      }

      const { analysisId } = await res.json()
      router.push(`/memo/${analysisId}`)
    } catch (err: unknown) {
      clearInterval(timer)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setMode(from)
    }
  }

  // ── DISCOVERING screen ─────────────────────────────────────────
  if (mode === 'discovering') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-10 text-center animate-in">
          <ProgressRing stepIdx={stepIdx} total={DISCOVERY_STEPS.length} />
          <p className="text-base font-semibold mb-1 truncate px-4">&ldquo;{input}&rdquo;</p>
          <p className="text-sm text-zinc-400 mb-8 h-5">{DISCOVERY_STEPS[stepIdx]}</p>
          <StepList steps={DISCOVERY_STEPS} stepIdx={stepIdx} />
        </div>
      </div>
    )
  }

  // ── ANALYZING screen ───────────────────────────────────────────
  if (mode === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-10 text-center animate-in">
          <ProgressRing stepIdx={stepIdx} total={ANALYSIS_STEPS.length} />
          <p className="text-base font-semibold mb-1 truncate px-4">&ldquo;{analyzingName}&rdquo;</p>
          <p className="text-sm text-zinc-400 mb-8 h-5">{ANALYSIS_STEPS[stepIdx]}</p>
          <StepList steps={ANALYSIS_STEPS} stepIdx={stepIdx} />
        </div>
      </div>
    )
  }

  // ── RESULTS screen ─────────────────────────────────────────────
  if (mode === 'results') {
    const top3 = opportunities.slice(0, 3)
    const rest = opportunities.slice(3)

    return (
      <div className="min-h-screen py-14 px-4">
        <div className="max-w-2xl mx-auto animate-in">

          {/* nav */}
          <button onClick={() => setMode('form')} className="btn-ghost text-xs -ml-2 mb-6">
            ← New Search
          </button>

          {/* header */}
          <div className="flex items-center gap-2 mb-1">
            <p className="label">{opportunities.length} opportunities found</p>
            {cached && cacheWeek && (
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800/80 border border-zinc-700 px-2 py-0.5 rounded-full">
                Cached · {cacheWeek}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold mb-2">
            Top Opportunities in <span className="text-emerald-400">{input}</span>
          </h1>
          <p className="text-sm text-zinc-500 mb-8">
            Click any opportunity to generate a full investment memo · costs 1 analysis slot
          </p>

          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-sm text-red-400 mb-6">
              {error}
            </div>
          )}

          {/* ── top 3 ── */}
          <p className="label mb-3">Top Opportunities</p>
          <div className="space-y-3 mb-10">
            {top3.map((opp, i) => (
              <div key={opp.name}
                className="card p-5 border-emerald-400/20"
                style={{ borderColor: 'rgba(52,211,153,.2)' }}
              >
                <div className="flex items-start gap-4">
                  <span className="font-mono font-bold text-xl text-zinc-600 shrink-0 pt-0.5 w-5 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-base leading-snug">{opp.name}</h3>
                      <span className={`font-mono font-bold text-2xl shrink-0 ${scoreColor(opp.score)}`}>
                        {opp.score}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1.5">{opp.rationale}</p>
                    <MetaRow opp={opp} />
                    <EvidenceGrid scores={opp.scores} />
                    <button
                      onClick={() => handleAnalyze(opp.name, 'results')}
                      className="btn-white w-full mt-4 py-2.5 text-sm"
                    >
                      Open Full Report →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── ranked list ── */}
          {rest.length > 0 && (
            <>
              <p className="label mb-3">All Opportunities</p>
              <div className="space-y-2">
                {rest.map((opp, i) => (
                  <button
                    key={opp.name}
                    onClick={() => handleAnalyze(opp.name, 'results')}
                    className="card-hover w-full p-4 text-left flex items-center gap-4 group"
                  >
                    <span className="font-mono text-xs text-zinc-600 w-5 text-right shrink-0">
                      {i + 4}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm group-hover:text-white">{opp.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">{opp.rationale}</p>
                      <p className="text-[10px] text-zinc-600 mt-1 truncate">
                        {opp.scores.demand.search_volume} · {opp.scores.competition.competing_brands} brands · TikTok: {opp.scores.virality.tiktok}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <DifficultyBadge d={opp.difficulty} />
                      <span className={`font-mono font-bold text-lg ${scoreColor(opp.score)}`}>
                        {opp.score}
                      </span>
                      <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── FORM ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-xl mx-auto animate-in">

        <Link href="/dashboard" className="btn-ghost text-xs mb-6 -ml-2 inline-flex">
          ← Analyses
        </Link>

        <h1 className="text-2xl font-bold mb-1">Discover Opportunities</h1>
        <p className="text-sm text-zinc-400 mb-8">
          Enter a broad category to explore opportunities, or a specific idea for a direct full analysis.
        </p>

        <form onSubmit={handleDiscover} className="space-y-5">

          {/* main input */}
          <div className="card p-6 space-y-3">
            <label className="block text-sm font-medium">
              Category or supplement idea
              <span className="text-red-400 ml-1">*</span>
            </label>
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              placeholder={`Broad: "Gut Health"  →  discovers 20 opportunities\nSpecific: "Cortisol support for women 35+"  →  full memo`}
              className="field resize-none h-24 text-sm leading-relaxed"
              maxLength={200} required autoFocus
            />
            <div className="flex items-center justify-between">
              {input.trim() ? (
                <p className="text-xs text-zinc-500">
                  {broad
                    ? '◎  Broad category — will discover 20 ranked opportunities'
                    : '◈  Specific idea — will generate full investment memo'}
                </p>
              ) : (
                <p className="text-xs text-zinc-600">Costs 1 slot per full report</p>
              )}
              <span className="text-xs text-zinc-600">{input.length}/200</span>
            </div>
          </div>

          {/* optional context — only meaningful for specific ideas */}
          {!broad && input.trim() && (
            <div className="card p-6">
              <button type="button" onClick={() => setShowExtra(v => !v)}
                className="flex items-center justify-between w-full text-left group">
                <div>
                  <p className="text-sm font-medium">Optional context</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Audience, price point, background</p>
                </div>
                <svg className={`w-4 h-4 text-zinc-500 shrink-0 ml-4 transition-transform ${showExtra ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {showExtra && (
                <div className="mt-5 space-y-4 animate-in">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1.5">Target audience</label>
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                      placeholder="e.g. women 30–45 with hormonal issues"
                      className="field text-sm" maxLength={100}/>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1.5">Price point</label>
                    <select value={price} onChange={e => setPrice(e.target.value)} className="field text-sm">
                      {PRICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1.5">Additional context</label>
                    <textarea value={extra} onChange={e => setExtra(e.target.value)}
                      placeholder="Unique ingredient, competitor you've spotted, your background..."
                      className="field text-sm resize-none h-20" maxLength={500}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <button type="submit" disabled={!input.trim()} className="btn-white w-full py-3 text-base">
            {broad && input.trim() ? 'Discover Opportunities →' : 'Generate Investment Memo →'}
          </button>

          {/* example chips */}
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-xs text-zinc-600 mb-2">Broad categories (discovery mode):</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES_BROAD.map(ex => (
                  <button key={ex} type="button" onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-600 mb-2">Specific ideas (direct analysis):</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES_SPECIFIC.map(ex => (
                  <button key={ex} type="button" onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}
