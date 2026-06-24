'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link          from 'next/link'
import {
  CATEGORY_CLIENT_CONFIGS,
  DEFAULT_CATEGORY_ID,
  getCategoryClientConfig,
  type CategoryClientConfig,
} from '@/lib/categories/client-config'
import type { OpportunityCard } from '@/types/index'
import { IconSpark, IconTarget, IconBeaker } from '@/components/icons'

// ── constants ─────────────────────────────────────────────────

type PageMode = 'form' | 'classifying' | 'discovering' | 'results' | 'analyzing'

const CLASSIFYING_STEPS = [
  'Reading your query...',
  'Detecting category...',
  'Routing to best module...',
]

const DISCOVERY_STEPS = [
  'Scanning the category...',
  'Identifying market opportunities...',
  'Scoring each opportunity...',
  'Ranking by opportunity score...',
]

// Reordered/expanded 2026-06-24 to match what actually happens server-side
// and to slow down how quickly this list exhausts — real provider calls
// (Keepa, Apify competitor search, Apify review collection) routinely take
// 1-3 minutes combined, and the old 6-step/8s-per-step list froze on
// "Writing investment memo..." for most of that wait, which read as stuck
// even when the backend was still working normally.
const ANALYSIS_STEPS = [
  'Mapping market conditions...',
  'Scoring demand and competition...',
  'Searching Amazon for real competitor products...',
  'Collecting real customer reviews...',
  'Analyzing virality potential...',
  'Building product recommendation...',
  'Calculating financial projections...',
  'Writing investment memo...',
]

// Shown once the fixed step list above is exhausted but the request hasn't
// returned yet — real provider data can take longer than the list assumes,
// so this keeps the screen visibly updating instead of looking frozen.
const STILL_WORKING_MESSAGES = [
  'Still collecting real data — this can take a few minutes for some categories...',
  'Real provider data (Amazon, Keepa) takes longer than the AI writing itself...',
  'Almost there — finishing up real-data collection...',
]

const PRICES = [
  { value: '',         label: 'Not sure' },
  { value: 'under-30', label: 'Under $30/mo' },
  { value: '30-50',    label: '$30–$50/mo' },
  { value: '50-75',    label: '$50–$75/mo' },
  { value: '75-plus',  label: '$75+/mo' },
]

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
    <div className="flex divide-x divide-white/[0.06] rounded-lg border border-white/[0.06] mt-3 overflow-hidden">
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] text-zinc-500 mb-1">Startup Cost</p>
        <p className="text-xs font-semibold text-white">{opp.startup_cost}</p>
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] text-zinc-500 mb-1">Difficulty</p>
        <DifficultyBadge d={opp.difficulty} />
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
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
    // Show market_saturation (new) or legacy competition if present
    ...(scores.market_saturation ? [{
      label: 'Market',
      score: -1,  // no numeric score — qualitative only
      facts: [`Saturation: ${scores.market_saturation.level}`, `Barrier: ${scores.market_saturation.barrier}`, scores.market_saturation.note ?? ''],
    }] : scores.competition?.score != null ? [{
      label: 'Competition',
      score: scores.competition.score,
      facts: [scores.competition.competing_brands ? `${scores.competition.competing_brands} brands` : '', `Sat: ${scores.competition.saturation ?? '?'}`, `Barrier: ${scores.competition.barrier ?? '?'}`].filter(Boolean),
    }] : []),
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
        <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{label}</span>
            {score >= 0
              ? <span className={`font-mono text-xs font-bold ${dimColor(score)}`}>{score}/10</span>
              : <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Qualitative</span>
            }
          </div>
          <div className="space-y-0.5">
            {facts.map((f, i) => (
              <p key={i} className="text-[11px] text-zinc-400 leading-snug">{f}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


// ── Investigation Console — a live terminal log instead of a spinner.
// Frames the wait as watching a query execute against real data sources,
// the way an analyst watches a Bloomberg/Palantir job run, not a
// progress bar on a webpage.
// ─────────────────────────────────────────────────────────────────

// Once the fixed step list is exhausted but the request hasn't returned,
// shows a rotating reassurance message + elapsed time instead of freezing
// silently on the last step — real provider calls can run well past the
// fixed list's assumed duration (see ANALYSIS_STEPS / STILL_WORKING_MESSAGES
// comment above), and a frozen-looking screen was part of why this read as
// "failed" even when the backend was still working normally.
function StillWorking() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const msg = STILL_WORKING_MESSAGES[Math.min(
    Math.floor(elapsed / 20),
    STILL_WORKING_MESSAGES.length - 1,
  )]
  return (
    <div className="flex gap-2.5 mb-2">
      <span className="text-zinc-600 shrink-0 select-none">[··]</span>
      <span className="text-zinc-400 italic">
        {msg}
        <span className="text-zinc-600 ml-2 font-mono not-italic">{elapsed}s</span>
        <span className="inline-block w-[7px] h-[13px] bg-brass ml-1.5 align-middle animate-pulse" />
      </span>
    </div>
  )
}

function InvestigationConsole({
  query, steps, stepIdx, sources,
}: {
  query: string; steps: string[]; stepIdx: number; sources?: string[]
}) {
  const exhausted = stepIdx === steps.length - 1
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg animate-in">
        <div className="rounded-lg border border-white/[0.1] bg-[#0a0a0c] overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
          {/* terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.03]">
            <span className="w-2 h-2 rounded-full bg-red-400/50" />
            <span className="w-2 h-2 rounded-full bg-amber-400/50" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/50" />
            <span className="ml-2 text-[11px] text-zinc-500 font-mono truncate flex-1">
              investigation · &ldquo;{query}&rdquo;
            </span>
            <span className="text-[11px] text-zinc-600 font-mono shrink-0">{stepIdx + 1}/{steps.length}</span>
          </div>

          {/* log body */}
          <div className="p-5 font-mono text-[13px] leading-relaxed min-h-[260px]">
            {steps.slice(0, stepIdx + 1).map((s, i) => {
              const isLastAndExhausted = i === stepIdx && exhausted
              return (
                <div key={i} className="flex gap-2.5 mb-2">
                  <span className="text-zinc-600 shrink-0 select-none">[{String(i + 1).padStart(2, '0')}]</span>
                  <span className={i < stepIdx ? 'text-zinc-500' : 'text-zinc-100'}>
                    {s}
                    {i < stepIdx || isLastAndExhausted
                      ? <span className="text-brass/80 ml-2">✓</span>
                      : <span className="inline-block w-[7px] h-[13px] bg-brass ml-1.5 align-middle animate-pulse" />}
                  </span>
                </div>
              )
            })}
            {exhausted && <StillWorking />}
            {sources && exhausted && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/[0.06]">
                {sources.map(src => (
                  <span key={src} className="text-[10px] text-zinc-600 border border-white/[0.08] rounded px-1.5 py-0.5">{src}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Shared error display — adds a "Check Dashboard" link when the failure
// was a dropped connection rather than a clean server rejection, since the
// analysis may have completed and saved successfully despite the client
// never seeing the response.
function ErrorBanner({ message, networkFailure }: { message: string; networkFailure: boolean }) {
  return (
    <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-sm text-red-400">
      <p>{message}</p>
      {networkFailure && (
        <p className="mt-2 text-red-400/80">
          <Link href="/dashboard" className="underline hover:text-red-300">Check your dashboard</Link> before re-running this — if it finished, you&rsquo;ll find it there without using another analysis slot.
        </p>
      )}
    </div>
  )
}

// ── Category selector ──────────────────────────────────────────

function CategorySelector({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  const autoConfig  = CATEGORY_CLIENT_CONFIGS.find(c => c.isAuto)!
  const otherConfigs = CATEGORY_CLIENT_CONFIGS.filter(c => !c.isAuto)

  return (
    <div className="card p-4 mb-6">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Mode</p>

      {/* Open Discovery — full-width first */}
      <button
        type="button"
        onClick={() => onSelect(autoConfig.id)}
        className={`w-full mb-3 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors text-left flex items-center gap-2 ${
          selected === autoConfig.id
            ? 'bg-brass/10 border-brass/40 text-brass'
            : 'bg-white/[0.06] border-white/[0.1] text-zinc-400 hover:text-white hover:border-white/[0.2]'
        }`}
      >
        <span className="text-base">{autoConfig.icon}</span>
        <div>
          <span className="font-semibold">{autoConfig.name}</span>
          <span className="ml-2 text-xs opacity-70">{autoConfig.tagline}</span>
        </div>
      </button>

      {/* Category chips */}
      <p className="text-xs text-zinc-600 mb-2">Or choose a specific category:</p>
      <div className="flex flex-wrap gap-2">
        {otherConfigs.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selected === cat.id
                ? 'bg-brass/10 border-brass/40 text-brass'
                : 'bg-white/[0.06] border-white/[0.1] text-zinc-400 hover:text-white hover:border-white/[0.2]'
            }`}
          >
            <span className="mr-1">{cat.icon}</span>{cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Detected category badge ────────────────────────────────────

function DetectedCategoryBadge({ config }: { config: CategoryClientConfig }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brass bg-brass/10 border border-brass/20 px-2 py-0.5 rounded-full">
      <span>{config.icon}</span> {config.name}
    </span>
  )
}

// ── Opportunity Map — a 2x2 score-vs-ease scatter, the primary hunting
// surface for discovery. Replaces a scrolling list with a visual field
// you scan and click into, the way an analyst scans a screener chart.
// ─────────────────────────────────────────────────────────────────

function easeOf(d: OpportunityCard['difficulty']) {
  return d === 'Easy' ? 84 : d === 'Medium' ? 50 : 17
}

function hashJitter(seed: string, range: number) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 2147483647
  return ((h % 1000) / 1000 - 0.5) * range
}

function OpportunityMap({
  opportunities, selectedName, onSelect,
}: {
  opportunities: OpportunityCard[]
  selectedName: string | null
  onSelect: (name: string) => void
}) {
  return (
    <div className="card-premium p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="label">Opportunity Map</p>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider hidden sm:inline">Score vs. ease of execution</p>
      </div>
      <div className="relative mt-7 h-[300px] sm:h-[400px] ml-8 border-l border-b border-white/[0.14]">
        {/* quadrant dividers */}
        <div className="absolute left-0 right-0 border-t border-dashed border-white/[0.08] pointer-events-none" style={{ top: '35%' }} />
        <div className="absolute top-0 bottom-0 border-l border-dashed border-white/[0.08] pointer-events-none" style={{ left: '50%' }} />

        {/* quadrant labels */}
        <span className="absolute top-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-emerald-400/70 font-medium">Best bets</span>
        <span className="absolute top-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-600">High reward, hard</span>
        <span className="absolute bottom-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-600">Quick wins</span>
        <span className="absolute bottom-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-700">Low priority</span>

        {/* y-axis labels */}
        {[100, 50, 0].map(v => (
          <span key={v} className="absolute -left-7 -translate-y-1/2 text-[9px] text-zinc-600 font-mono" style={{ top: `${100 - v}%` }}>{v}</span>
        ))}

        {/* points */}
        {opportunities.map((opp, i) => {
          const x = Math.min(97, Math.max(2, easeOf(opp.difficulty) + hashJitter(opp.name, 14)))
          const y = Math.min(96, Math.max(3, 100 - opp.score + hashJitter(opp.name + 'y', 5)))
          const isTop    = i < 3
          const isSel    = selectedName === opp.name
          const c        = opp.score >= 75 ? '#34d399' : opp.score >= 60 ? '#fbbf24' : '#f87171'
          const size     = isSel ? 15 : isTop ? 11 : 7
          return (
            <button
              key={opp.name}
              onClick={() => onSelect(opp.name)}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 hover:z-20 group"
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={opp.name}
            >
              <span
                className="block rounded-full transition-all duration-200 group-hover:scale-125"
                style={{
                  width: size, height: size, background: c,
                  boxShadow: isSel ? `0 0 0 5px ${c}2A` : isTop ? '0 0 0 2px rgba(200,164,99,.55)' : 'none',
                }}
              />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 rounded-md bg-[#15151a] border border-white/[0.1] text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                {opp.name} · {opp.score}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-between mt-2.5 ml-8 text-[10px] text-zinc-600 uppercase tracking-wider">
        <span>← Harder to build</span>
        <span>Easier to build →</span>
      </div>
    </div>
  )
}

function OpportunityDetail({
  opp, rank, onOpen,
}: { opp: OpportunityCard; rank: number; onOpen: () => void }) {
  return (
    <div className="card-premium p-5 sm:p-6 animate-in">
      <div className="flex items-start gap-4">
        <span className="font-mono font-bold text-xl text-zinc-600 shrink-0 pt-0.5 w-5 text-right">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-base leading-snug">{opp.name}</h3>
            <span className={`font-serif font-medium text-2xl ${scoreColor(opp.score)}`}>{opp.score}</span>
          </div>
          <p className="text-sm text-zinc-400 mt-1.5">{opp.rationale}</p>
          <p className="text-[10px] text-zinc-600 italic mt-2">
            AI-estimated, not independently verified — search volume, trend, and dimension scores are model output, sometimes informed by real signal data but not guaranteed to match it. Open the full report for per-field source detail.
          </p>
          <MetaRow opp={opp} />
          <EvidenceGrid scores={opp.scores} />
          <button onClick={onOpen} className="btn-white w-full mt-4 py-2.5 text-sm">
            Open Full Report →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Terminal list — dense scannable rows for analysts who'd rather read
// a table than hunt a chart. Real columns, monospace figures, no cards.
function OpportunityTable({
  opportunities, onOpen, showMeta,
}: {
  opportunities: OpportunityCard[]
  onOpen: (name: string) => void
  showMeta: boolean
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] overflow-hidden">
      <div className="grid grid-cols-[2rem_1fr_5.5rem_4.5rem] sm:grid-cols-[2rem_1fr_6rem_6rem_4.5rem] gap-3 px-4 py-2 text-[10px] text-zinc-600 uppercase tracking-wider border-b border-white/[0.08] bg-white/[0.02] font-mono">
        <span>#</span><span>Opportunity</span><span className="text-right">Difficulty</span>
        <span className="text-right hidden sm:inline">Signal</span><span className="text-right">Score</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {opportunities.map((opp, i) => (
          <button
            key={opp.name}
            onClick={() => onOpen(opp.name)}
            className="w-full grid grid-cols-[2rem_1fr_5.5rem_4.5rem] sm:grid-cols-[2rem_1fr_6rem_6rem_4.5rem] gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors items-center group"
          >
            <span className="text-xs text-zinc-600 font-mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex items-center gap-1.5">
              <span className="text-sm text-zinc-200 group-hover:text-white truncate">{opp.name}</span>
              {showMeta && opp._meta?.is_new && <span className="w-1 h-1 rounded-full bg-brass shrink-0" />}
            </span>
            <span className="text-xs text-right text-zinc-400">{opp.difficulty}</span>
            <span className="text-xs text-right text-zinc-500 hidden sm:inline">{opp.scores.demand.signal}</span>
            <span className={`text-sm text-right font-mono font-semibold ${scoreColor(opp.score)}`}>{opp.score}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────

export default function AnalyzePage() {
  const router = useRouter()

  const [categoryId,         setCategoryId]         = useState(DEFAULT_CATEGORY_ID)
  const [resolvedCategoryId, setResolvedCategoryId] = useState<string | null>(null)
  const [input,              setInput]              = useState('')
  const [audience,           setAudience]           = useState('')
  const [price,              setPrice]              = useState('')
  const [extra,              setExtra]              = useState('')
  const [showExtra,          setShowExtra]          = useState(false)
  const [mode,               setMode]               = useState<PageMode>('form')
  const [stepIdx,            setStepIdx]            = useState(0)
  const [error,              setError]              = useState('')
  // True specifically when fetch() itself rejected (a dropped connection,
  // e.g. Safari's "Load failed"/Chrome's "Failed to fetch") rather than the
  // server cleanly returning an error response. In that case the backend
  // may well have kept working and saved the analysis — telling the user
  // to just "try again" would mean paying for and re-running the same
  // expensive real-data collection for no reason if it actually succeeded.
  const [networkFailure,     setNetworkFailure]     = useState(false)
  const [opportunities,      setOpportunities]      = useState<OpportunityCard[]>([])
  const [analyzingName,      setAnalyzingName]      = useState('')
  const [prevMode,           setPrevMode]           = useState<'form' | 'results'>('form')
  const [cached,             setCached]             = useState(false)
  const [cacheWeek,          setCacheWeek]          = useState('')
  const [cacheStatus,        setCacheStatus]        = useState('')
  const [resultCategoryName, setResultCategoryName] = useState('')
  const [resultsView,        setResultsView]        = useState<'map' | 'list'>('map')
  const [selectedOpp,        setSelectedOpp]        = useState<string | null>(null)

  const category        = getCategoryClientConfig(categoryId)
  const resolvedConfig  = resolvedCategoryId ? getCategoryClientConfig(resolvedCategoryId) : null
  const isAutoMode      = category.isAuto

  // For broad detection: use resolved category if available, else selected
  const activeConfig   = resolvedConfig ?? (isAutoMode ? null : category)
  const broad          = activeConfig ? activeConfig.isBroadQuery(input) : true

  function handleCategorySelect(id: string) {
    setCategoryId(id)
    setResolvedCategoryId(null)
    setInput('')
    setError('')
    setMode('form')
  }

  // ── discovery ──
  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    // For non-auto categories: skip to direct analysis if specific input
    if (!isAutoMode && !broad) {
      return handleAnalyze(input.trim(), 'form')
    }

    setMode('discovering')
    setError('')
    setStepIdx(0)

    // Show a brief "classifying" phase for Open Discovery mode
    let classifyTimer: ReturnType<typeof setTimeout> | null = null
    if (isAutoMode) {
      setMode('classifying')
      setStepIdx(0)
      classifyTimer = setInterval(
        () => setStepIdx(i => Math.min(i + 1, CLASSIFYING_STEPS.length - 1)),
        600,
      )
      await new Promise(r => setTimeout(r, 1800))
      if (classifyTimer) clearInterval(classifyTimer)
      setMode('discovering')
    }

    setStepIdx(0)
    const discoverTimer = setInterval(
      () => setStepIdx(i => Math.min(i + 1, DISCOVERY_STEPS.length - 1)),
      4500,
    )

    try {
      const res = await fetch('/api/discover', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: input.trim(), categoryId }),
      })
      clearInterval(discoverTimer)

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

      const {
        opportunities: opps,
        cached: isCached,
        cache_week: week,
        cache_status: status,
        categoryId: detectedCategoryId,
        categoryName,
      } = await res.json()

      setOpportunities(opps)
      setSelectedOpp(null)
      setResultsView('map')
      setCached(isCached ?? false)
      setCacheWeek(week ?? '')
      setCacheStatus(status ?? '')
      setResultCategoryName(categoryName ?? '')
      if (detectedCategoryId) setResolvedCategoryId(detectedCategoryId)
      setMode('results')
    } catch (err: unknown) {
      clearInterval(discoverTimer)
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
    setNetworkFailure(false)
    setStepIdx(0)
    const timer = setInterval(
      () => setStepIdx(i => Math.min(i + 1, ANALYSIS_STEPS.length - 1)),
      8000,
    )

    // When analyzing from results, use the resolved category (from discovery)
    const effectiveCategoryId = from === 'results' ? (resolvedCategoryId ?? categoryId) : categoryId

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
          categoryId:     effectiveCategoryId,
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
      // fetch() itself rejects with a TypeError on a dropped connection
      // (Safari: "Load failed", Chrome: "Failed to fetch") — distinct from
      // the explicit `throw new Error(...)` above for a clean non-OK
      // response. Only the former means the backend might have kept
      // working and saved the result anyway.
      if (err instanceof TypeError) {
        setNetworkFailure(true)
        setError('Lost connection while waiting for results. This can happen on long-running analyses — the backend may have finished anyway.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
      setMode(from)
    }
  }

  // ── CLASSIFYING screen ─────────────────────────────────────────
  if (mode === 'classifying') {
    return <InvestigationConsole query={input} steps={CLASSIFYING_STEPS} stepIdx={stepIdx} />
  }

  // ── DISCOVERING screen ─────────────────────────────────────────
  if (mode === 'discovering') {
    return (
      <InvestigationConsole
        query={input}
        steps={DISCOVERY_STEPS}
        stepIdx={stepIdx}
        sources={['Keepa', 'Google Trends', 'TikTok', 'Amazon Reviews']}
      />
    )
  }

  // ── ANALYZING screen ───────────────────────────────────────────
  if (mode === 'analyzing') {
    return (
      <InvestigationConsole
        query={analyzingName}
        steps={ANALYSIS_STEPS}
        stepIdx={stepIdx}
        sources={['Keepa', 'Google Trends', 'TikTok', 'Amazon Reviews', 'Meta Ads']}
      />
    )
  }

  // ── RESULTS screen ─────────────────────────────────────────────
  if (mode === 'results') {
    const showMeta = cacheStatus !== '' && cacheStatus !== 'generated'
    const detectedConfig = resolvedCategoryId ? getCategoryClientConfig(resolvedCategoryId) : null
    const selected = opportunities.find(o => o.name === selectedOpp) ?? opportunities[0]
    const selectedRank = selected ? opportunities.findIndex(o => o.name === selected.name) + 1 : 0

    return (
      <div className="min-h-screen py-14 px-4">
        <div className="max-w-6xl mx-auto animate-in lg:grid lg:grid-cols-[1fr_272px] lg:gap-10 lg:items-start">
        <div className="min-w-0">

          <button onClick={() => setMode('form')} className="btn-ghost text-xs -ml-2 mb-6 lg:hidden">
            ← New Search
          </button>

          <h1 className="font-serif text-2xl font-medium mb-2">
            Top Opportunities in{' '}
            <span className="italic text-brass">{input}</span>
          </h1>
          {resultCategoryName && resultCategoryName !== 'Supplements' && (
            <p className="text-xs text-zinc-600 mb-1">
              Analyzed as: {resultCategoryName}
            </p>
          )}
          <p className="text-sm text-zinc-500 mb-8">
            Explore the map or scan the list, then open a full investment memo · costs 1 analysis slot
          </p>

          {error && <div className="mb-6"><ErrorBanner message={error} networkFailure={networkFailure} /></div>}

          {/* ── view toggle ── */}
          <div className="flex items-center gap-1 mb-5 border-b border-white/[0.07]">
            {(['map', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setResultsView(v)}
                className={`relative text-xs font-medium uppercase tracking-wider px-4 py-2.5 transition-colors ${
                  resultsView === v ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {v === 'map' ? 'Map' : 'List'}
                {resultsView === v && <span className="absolute left-3 right-3 -bottom-px h-[1.5px] bg-brass rounded-full" />}
              </button>
            ))}
          </div>

          {resultsView === 'map' ? (
            <div className="space-y-4 mb-4">
              <OpportunityMap
                opportunities={opportunities}
                selectedName={selected?.name ?? null}
                onSelect={setSelectedOpp}
              />
              {selected && (
                <OpportunityDetail
                  opp={selected}
                  rank={selectedRank}
                  onOpen={() => handleAnalyze(selected.name, 'results')}
                />
              )}
            </div>
          ) : (
            <OpportunityTable
              opportunities={opportunities}
              onOpen={name => handleAnalyze(name, 'results')}
              showMeta={showMeta}
            />
          )}
        </div>

        {/* ── Persistent search-summary rail (desktop only) ─────────── */}
        <aside className="hidden lg:block lg:sticky lg:top-10 space-y-4">
          <div className="card-premium p-5">
            <p className="label mb-4">Search Summary</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Query</p>
                <p className="text-sm font-serif italic text-brass truncate">&ldquo;{input}&rdquo;</p>
              </div>
              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Found</p>
                <p className="text-sm font-semibold text-zinc-200">{opportunities.length} opportunities</p>
              </div>
              {isAutoMode && detectedConfig && (
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Category</p>
                  <DetectedCategoryBadge config={detectedConfig} />
                </div>
              )}
              {cached && cacheWeek && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Data freshness</p>
                  <p className="text-xs text-zinc-400">
                    {cacheStatus === 'updated' ? 'Updated this week' : 'Cached this week'} · {cacheWeek}
                  </p>
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setMode('form')} className="btn-dark w-full text-sm py-2.5">
            ← New Search
          </button>
        </aside>
        </div>
      </div>
    )
  }

  // ── FORM ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-5xl mx-auto animate-in lg:grid lg:grid-cols-[1fr_272px] lg:gap-10 lg:items-start">
      <div className="min-w-0">

        <Link href="/dashboard" className="btn-ghost text-xs mb-6 -ml-2 inline-flex">
          ← Analyses
        </Link>

        <h1 className="font-serif text-2xl font-medium mb-1">Discover Opportunities</h1>
        <p className="text-sm text-zinc-400 mb-8">
          {isAutoMode
            ? 'Type any product idea — Open Discovery routes to the right category automatically.'
            : 'Enter a broad category to explore opportunities, or a specific idea for a direct analysis.'}
        </p>

        {/* Category / mode selector */}
        <CategorySelector selected={categoryId} onSelect={handleCategorySelect} />

        <form onSubmit={handleDiscover} className="space-y-5">

          {/* main input — command-prompt entry, not a boxed form field */}
          <div className="mb-2">
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-3">
              {isAutoMode ? 'Product idea or category' : `${category.name} category or idea`}
            </label>
            <div className="flex items-start gap-3 border-b-2 border-white/[0.12] focus-within:border-brass pb-3 transition-colors">
              <span className="font-mono text-xl text-brass shrink-0 select-none leading-[1.7]">&gt;</span>
              <textarea
                value={input} onChange={e => setInput(e.target.value)}
                placeholder={
                  isAutoMode
                    ? `e.g. "dog joint supplement", "anti-aging serum", "viral kitchen gadget"…`
                    : `Broad: "${category.examples.broad[0]}"  →  discovers 20 opportunities\nSpecific: "${category.examples.specific[0] ?? ''}"  →  full memo`
                }
                className="flex-1 bg-transparent border-0 outline-none resize-none font-mono text-lg text-zinc-100 placeholder:text-zinc-600 placeholder:text-sm leading-relaxed h-[3.4rem]"
                maxLength={200} required autoFocus
              />
            </div>
            <div className="flex items-center justify-between mt-3">
              {input.trim() && !isAutoMode ? (
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  {broad
                    ? <><IconTarget className="w-3 h-3 text-brass shrink-0" /> Broad category — will discover 20 ranked opportunities</>
                    : <><IconBeaker className="w-3 h-3 text-brass shrink-0" /> Specific idea — will generate full investment memo</>}
                </p>
              ) : input.trim() && isAutoMode ? (
                <p className="text-xs text-zinc-500 flex items-center gap-1.5"><IconSpark className="w-3 h-3 text-brass shrink-0" /> Open Discovery — category detected automatically</p>
              ) : (
                <p className="text-xs text-zinc-600">Costs 1 slot per full report</p>
              )}
              <span className="text-xs text-zinc-600 font-mono">{input.length}/200</span>
            </div>
          </div>

          {/* optional context — only for specific (non-auto, non-broad) */}
          {!isAutoMode && !broad && input.trim() && (
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
                      placeholder="Key ingredient, competitor you've spotted, your background..."
                      className="field text-sm resize-none h-20" maxLength={500}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <ErrorBanner message={error} networkFailure={networkFailure} />}

          <button type="submit" disabled={!input.trim()} className="btn-white w-full py-3 text-base">
            {isAutoMode
              ? 'Discover with Open Discovery →'
              : broad && input.trim()
                ? 'Discover Opportunities →'
                : 'Generate Investment Memo →'}
          </button>

          {/* example chips */}
          <div className="space-y-3 pt-1">
            {isAutoMode ? (
              <div>
                <p className="text-xs text-zinc-600 mb-2">Try any of these:</p>
                <div className="flex flex-wrap gap-2">
                  {category.examples.broad.map(ex => (
                    <button key={ex} type="button" onClick={() => setInput(ex)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-zinc-400 hover:text-white hover:border-white/[0.2] transition-colors">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {category.examples.broad.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-600 mb-2">Broad categories (discovery mode):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.broad.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-zinc-400 hover:text-white hover:border-white/[0.2] transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {category.examples.specific.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-600 mb-2">Specific ideas (direct analysis):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.specific.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-zinc-400 hover:text-white hover:border-white/[0.2] transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </form>
      </div>

      {/* ── Process rail (desktop only) ──────────────────────────── */}
      <aside className="hidden lg:block lg:sticky lg:top-10 space-y-4">
        <div className="card-premium p-5">
          <p className="label mb-4">How it works</p>
          <div className="space-y-4">
            {[
              { n: '01', t: 'Type your idea', b: 'Broad category or specific concept.' },
              { n: '02', t: 'Wait ~60 seconds', b: 'Demand, virality, manufacturing, and defensibility get scored.' },
              { n: '03', t: 'Get your answer', b: 'Market gaps, formula, financials, and a BUILD / SKIP verdict.' },
            ].map(s => (
              <div key={s.n} className="flex gap-3">
                <span className="font-serif italic text-lg text-brass/70 shrink-0">{s.n}</span>
                <div>
                  <p className="text-sm font-medium leading-snug">{s.t}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-premium p-5">
          <p className="label mb-2">Beta</p>
          <p className="text-xs text-zinc-500 leading-relaxed">3 free analyses · 28 categories pre-loaded on the leaderboard · your analyses are added automatically.</p>
        </div>
      </aside>
      </div>
    </div>
  )
}
