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
import type { AggregatedSignals } from '@/lib/signal-engine/types'
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

// 2026-06-26 evidence-first redesign: no numeric score exists per
// opportunity (only one category-level real signal per request, see
// CategorySignalPanel) — every "how good/strong is this" color cue is now
// keyed on the AI's own qualitative tier, never a fabricated number.
function promiseColor(p: 'High' | 'Medium' | 'Low') {
  return p === 'High' ? 'text-[#008a00]' : p === 'Medium' ? 'text-[#a67c00]' : 'text-[#d32f2f]'
}

function tierColor(t: 'High' | 'Medium' | 'Low' | 'Strong' | 'Moderate' | 'Weak') {
  return t === 'High' || t === 'Strong' ? 'text-[#008a00]'
       : t === 'Medium' || t === 'Moderate' ? 'text-[#a67c00]'
       : 'text-[#d32f2f]'
}

// ── sub-components ─────────────────────────────────────────────

function DifficultyBadge({ d }: { d: OpportunityCard['difficulty'] }) {
  const styles = {
    Easy:   'text-[#008a00] border-[#008a00]',
    Medium: 'text-[#a67c00] border-[#a67c00]',
    Hard:   'text-[#d32f2f] border-[#d32f2f]',
  }
  return (
    <span className={`inline-flex items-center text-xs font-bold font-mono uppercase px-2 py-0.5 border ${styles[d]}`}>
      {d}
    </span>
  )
}

// Generic tier pill — used for startup_cost_tier and launch_speed, both
// directional judgments (Lean/Moderate/Capital-Intensive, Fast/Moderate/Slow)
// rather than dollar figures or day-counts with no real per-opportunity basis.
function TierBadge({ value, good, bad }: { value: string; good: string; bad: string }) {
  const cls = value === good
    ? 'text-[#008a00] border-[#008a00]'
    : value === bad
      ? 'text-[#d32f2f] border-[#d32f2f]'
      : 'text-[#a67c00] border-[#a67c00]'
  return (
    <span className={`inline-flex items-center text-xs font-bold font-mono uppercase px-2 py-0.5 border ${cls}`}>
      {value}
    </span>
  )
}

function MetaRow({ opp }: { opp: OpportunityCard }) {
  return (
    <div className="flex divide-x divide-black/10 border border-black mt-3 overflow-hidden">
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-[#7e7576] uppercase mb-1">Capital Tier</p>
        <TierBadge value={opp.startup_cost_tier ?? '—'} good="Lean" bad="Capital-Intensive" />
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-[#7e7576] uppercase mb-1">Difficulty</p>
        <DifficultyBadge d={opp.difficulty} />
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-[#7e7576] uppercase mb-1">Launch Speed</p>
        <TierBadge value={opp.launch_speed ?? '—'} good="Fast" bad="Slow" />
      </div>
    </div>
  )
}

function EvidenceGrid({ scores }: { scores: OpportunityCard['scores'] }) {
  const dims: { label: string; tier: string; facts: string[] }[] = [
    {
      label: 'Demand',
      tier: scores.demand.signal,
      facts: [`Signal: ${scores.demand.signal}`],
    },
    ...(scores.market_saturation ? [{
      label: 'Market',
      tier: scores.market_saturation.level,
      facts: [`Saturation: ${scores.market_saturation.level}`, `Barrier: ${scores.market_saturation.barrier}`, scores.market_saturation.note ?? ''],
    }] : []),
    {
      label: 'Virality',
      tier: scores.virality.tiktok,
      facts: [`TikTok: ${scores.virality.tiktok}`, `Content: ${scores.virality.content_potential}`, `UGC: ${scores.virality.ugc}`],
    },
    {
      label: 'Subscription',
      tier: scores.subscription.retention,
      facts: [`Retention: ${scores.subscription.retention}`],
    },
    {
      label: 'Manufacturing',
      tier: scores.manufacturing.complexity,
      facts: [`Complexity: ${scores.manufacturing.complexity}`],
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {dims.map(({ label, tier, facts }) => (
        <div key={label} className="bg-white border border-black p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-semibold text-[#7e7576] uppercase tracking-wide">{label}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${tierColor(tier as 'High' | 'Medium' | 'Low' | 'Strong' | 'Moderate' | 'Weak')}`}>{tier}</span>
          </div>
          <div className="space-y-0.5">
            {facts.map((f, i) => (
              <p key={i} className="text-[11px] text-[#4c4546] leading-snug">{f}</p>
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
      <span className="text-[#7e7576] shrink-0 select-none">[··]</span>
      <span className="text-[#4c4546] italic">
        {msg}
        <span className="text-[#7e7576] ml-2 font-mono not-italic">{elapsed}s</span>
        <span className="inline-block w-[7px] h-[13px] bg-black ml-1.5 align-middle animate-pulse" />
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
    <div className="min-h-screen flex items-center justify-center px-4 font-sans" style={{ background: '#f9f9f9' }}>
      <div className="w-full max-w-lg animate-in">
        <div className="border-2 border-black bg-white overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {/* terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b-2 border-black bg-[#f3f3f3]">
            <span className="w-2 h-2 border border-black" />
            <span className="w-2 h-2 border border-black" />
            <span className="w-2 h-2 border border-black bg-black" />
            <span className="ml-2 text-[11px] font-mono text-[#4c4546] truncate flex-1 uppercase">
              investigation · &ldquo;{query}&rdquo;
            </span>
            <span className="text-[11px] font-mono text-[#7e7576] shrink-0">{stepIdx + 1}/{steps.length}</span>
          </div>

          {/* log body */}
          <div className="p-5 font-mono text-[13px] leading-relaxed min-h-[260px]">
            {steps.slice(0, stepIdx + 1).map((s, i) => {
              const isLastAndExhausted = i === stepIdx && exhausted
              return (
                <div key={i} className="flex gap-2.5 mb-2">
                  <span className="text-[#7e7576] shrink-0 select-none">[{String(i + 1).padStart(2, '0')}]</span>
                  <span className={i < stepIdx ? 'text-[#7e7576]' : 'text-black'}>
                    {s}
                    {i < stepIdx || isLastAndExhausted
                      ? <span className="text-[#008a00] ml-2">✓</span>
                      : <span className="inline-block w-[7px] h-[13px] bg-black ml-1.5 align-middle animate-pulse" />}
                  </span>
                </div>
              )
            })}
            {exhausted && <StillWorking />}
            {sources && exhausted && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-black">
                {sources.map(src => (
                  <span key={src} className="text-[10px] font-mono text-[#4c4546] border border-black px-1.5 py-0.5 uppercase">{src}</span>
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
    <div className="bg-[#ffdad6] border border-[#ba1a1a] p-4 text-sm text-[#93000a]">
      <p>{message}</p>
      {networkFailure && (
        <p className="mt-2 text-[#93000a]/80">
          <Link href="/dashboard" className="underline hover:text-[#93000a]">Check your dashboard</Link> before re-running this — if it finished, you&rsquo;ll find it there without using another analysis slot.
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
    <div className="bg-white border border-black p-4 mb-6">
      <p className="text-xs font-mono text-[#7e7576] uppercase tracking-widest mb-3">Mode</p>

      {/* Open Discovery — full-width first */}
      <button
        type="button"
        onClick={() => onSelect(autoConfig.id)}
        className={`w-full mb-3 px-4 py-2.5 border text-sm font-medium transition-colors text-left flex items-center gap-2 ${
          selected === autoConfig.id
            ? 'bg-black text-white border-black'
            : 'bg-white border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3]'
        }`}
      >
        <span className="text-base">{autoConfig.icon}</span>
        <div>
          <span className="font-semibold">{autoConfig.name}</span>
          <span className="ml-2 text-xs opacity-70">{autoConfig.tagline}</span>
        </div>
      </button>

      {/* Category chips */}
      <p className="text-xs font-mono text-[#7e7576] uppercase mb-2">Or choose a specific category:</p>
      <div className="flex flex-wrap gap-2">
        {otherConfigs.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
              selected === cat.id
                ? 'bg-black text-white border-black'
                : 'bg-white border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3]'
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
    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono uppercase text-black border border-black px-2 py-0.5">
      <span>{config.icon}</span> {config.name}
    </span>
  )
}

// ── Opportunity Map — a promise-vs-ease grid, the primary hunting surface
// for discovery. Replaces a scrolling list with a visual field you scan
// and click into, the way an analyst scans a screener chart.
//
// 2026-06-26 evidence-first redesign: this used to plot a fabricated 0-100
// score on a continuous Y-axis, implying precision that never existed (no
// per-opportunity real data is ever fetched at discovery time). Both axes
// are now discrete qualitative buckets — promise (High/Medium/Low, the AI's
// own editorial tier) and difficulty (Easy/Medium/Hard) — jittered within
// their bucket for the same scannable scatter feel, without pretending the
// position is a measurement.
// ─────────────────────────────────────────────────────────────────

function easeOf(d: OpportunityCard['difficulty']) {
  return d === 'Easy' ? 84 : d === 'Medium' ? 50 : 17
}

function promiseY(p: OpportunityCard['promise']) {
  return p === 'High' ? 17 : p === 'Medium' ? 50 : 84
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
    <div className="bg-white border border-black p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#7e7576]">Opportunity Map</p>
        <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider hidden sm:inline">Promise vs. ease of execution — AI judgment, not measured</p>
      </div>
      <div className="relative mt-7 h-[300px] sm:h-[400px] ml-8 border-l border-b border-black">
        {/* quadrant dividers */}
        <div className="absolute left-0 right-0 border-t border-dashed border-black/15 pointer-events-none" style={{ top: '35%' }} />
        <div className="absolute top-0 bottom-0 border-l border-dashed border-black/15 pointer-events-none" style={{ left: '50%' }} />

        {/* quadrant labels */}
        <span className="absolute top-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-[#008a00]/80 font-mono font-medium">Best bets</span>
        <span className="absolute top-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-[#7e7576] font-mono">High reward, hard</span>
        <span className="absolute bottom-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-[#7e7576] font-mono">Quick wins</span>
        <span className="absolute bottom-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-[#7e7576] font-mono">Low priority</span>

        {/* y-axis labels */}
        {(['High', 'Medium', 'Low'] as const).map(p => (
          <span key={p} className="absolute -left-9 -translate-y-1/2 text-[9px] font-mono text-[#7e7576] uppercase tracking-wide" style={{ top: `${promiseY(p)}%` }}>{p}</span>
        ))}

        {/* points */}
        {opportunities.map((opp, i) => {
          const x = Math.min(97, Math.max(2, easeOf(opp.difficulty) + hashJitter(opp.name, 14)))
          const y = Math.min(96, Math.max(3, promiseY(opp.promise) + hashJitter(opp.name + 'y', 10)))
          const isTop    = i < 3
          const isSel    = selectedName === opp.name
          const c        = opp.promise === 'High' ? '#008a00' : opp.promise === 'Medium' ? '#fbc02d' : '#d32f2f'
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
                className="block rounded-full transition-all duration-200 group-hover:scale-125 border border-black"
                style={{
                  width: size, height: size, background: c,
                  boxShadow: isSel ? `0 0 0 4px rgba(0,0,0,0.15)` : isTop ? '0 0 0 2px rgba(0,0,0,.4)' : 'none',
                }}
              />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-black border border-black text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                {opp.name} · {opp.promise}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-between mt-2.5 ml-8 text-[10px] font-mono text-[#7e7576] uppercase tracking-wider">
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
    <div className="bg-white border border-black p-5 sm:p-6 animate-in">
      <div className="flex items-start gap-4">
        <span className="font-mono font-bold text-xl text-[#7e7576] shrink-0 pt-0.5 w-5 text-right">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold text-base leading-snug text-black">{opp.name}</h3>
            <span className={`font-black text-sm uppercase tracking-wide ${promiseColor(opp.promise)}`}>{opp.promise}</span>
          </div>
          <p className="text-sm text-[#4c4546] mt-1.5">{opp.rationale}</p>
          <p className="text-[10px] text-[#7e7576] italic mt-2">
            AI editorial judgment, not independently verified — promise tier and dimension labels are model output, not a measurement. See the Category Signal panel for the one real data point behind this search. Open the full report for per-field source detail on your specific idea.
          </p>
          <MetaRow opp={opp} />
          <EvidenceGrid scores={opp.scores} />
          <button onClick={onOpen} className="w-full mt-4 py-2.5 text-sm font-black uppercase tracking-wide text-white bg-black hover:bg-white hover:text-black border-2 border-black transition-colors duration-200 active:scale-[0.98]">
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
    <div className="border border-black overflow-hidden">
      <div className="grid grid-cols-[2rem_1fr_5.5rem_4.5rem] sm:grid-cols-[2rem_1fr_6rem_6rem_4.5rem] gap-3 px-4 py-2 text-[10px] text-[#7e7576] uppercase tracking-wider border-b border-black bg-[#f3f3f3] font-mono">
        <span>#</span><span>Opportunity</span><span className="text-right">Difficulty</span>
        <span className="text-right hidden sm:inline">Signal</span><span className="text-right">Promise</span>
      </div>
      <div className="divide-y divide-black/10">
        {opportunities.map((opp, i) => (
          <button
            key={opp.name}
            onClick={() => onOpen(opp.name)}
            className="w-full grid grid-cols-[2rem_1fr_5.5rem_4.5rem] sm:grid-cols-[2rem_1fr_6rem_6rem_4.5rem] gap-3 px-4 py-3 text-left hover:bg-[#f3f3f3] transition-colors items-center group bg-white"
          >
            <span className="text-xs text-[#7e7576] font-mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex items-center gap-1.5">
              <span className="text-sm text-black truncate">{opp.name}</span>
              {showMeta && opp._meta?.is_new && <span className="w-1.5 h-1.5 bg-black shrink-0" />}
            </span>
            <span className="text-xs text-right text-[#4c4546]">{opp.difficulty}</span>
            <span className="text-xs text-right text-[#7e7576] hidden sm:inline">{opp.scores.demand.signal}</span>
            <span className={`text-xs text-right font-semibold uppercase tracking-wide ${promiseColor(opp.promise)}`}>{opp.promise}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Category Signal — the ONE real data point fetched for the whole broad
// category at discovery time. Surfaces signalEngine.fetch() honestly
// instead of leaving it as invisible AI prompt context: scoped explicitly
// to the category as a whole, never attributed to any individual
// opportunity card above. Absent entirely on cache hits (not persisted —
// see app/api/discover/route.ts) or when no provider returned data.
function CategorySignalPanel({ signal, category }: { signal: AggregatedSignals | null; category: string }) {
  if (!signal) return null
  const rows: { label: string; value: string }[] = []
  if (signal.demand?.value) {
    const d = signal.demand.value
    if (d.search_volume) rows.push({ label: 'Search volume', value: d.search_volume })
    if (d.trend)         rows.push({ label: 'Trend', value: d.trend })
  }
  if (signal.growth?.value?.yoy_change) rows.push({ label: 'YoY (Amazon BSR)', value: signal.growth.value.yoy_change })
  if (signal.competition?.value) {
    const c = signal.competition.value
    if (c.competing_brands) rows.push({ label: 'Competing sellers', value: c.competing_brands })
    if (c.saturation)       rows.push({ label: 'Saturation', value: c.saturation })
  }
  if (signal.pricing?.value?.avg_price) rows.push({ label: 'Avg. price', value: signal.pricing.value.avg_price })
  if (signal.virality?.value?.tiktok)   rows.push({ label: 'TikTok signal', value: signal.virality.value.tiktok })

  if (!rows.length) return null

  return (
    <div className="bg-white border border-black p-4 mb-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider">Real Category Signal</p>
        <span className="text-[10px] font-mono text-[#7e7576]">{signal.providers_used.join(', ')} · {Math.round(signal.overall_confidence * 100)}% confidence</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="leading-tight">
            <span className="text-[10px] font-mono text-[#7e7576]">{r.label}: </span>
            <span className="text-xs font-mono text-[#4c4546]">{r.value}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#7e7576] mt-2 italic">
        Real provider data for the broad category &ldquo;{category}&rdquo; as a whole — not specific to any individual opportunity below.
      </p>
      {/* Resilience layer (2026-06-29): providers_used above only shows the
          success side — this is the other half of "clearly indicate which
          providers succeeded and which failed" rather than silently
          omitting a provider that errored or timed out from the response. */}
      {!!signal.failed_providers?.length && (
        <p className="text-[10px] font-mono text-[#a67c00] mt-1">
          Temporarily unavailable: {signal.failed_providers.join(', ')} — other sources above are unaffected.
        </p>
      )}
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
  const [categorySignal,     setCategorySignal]     = useState<AggregatedSignals | null>(null)
  const [searchedQuery,      setSearchedQuery]      = useState('')

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
        categorySignal: signal,
      } = await res.json()

      setOpportunities(opps)
      setSelectedOpp(null)
      setResultsView('map')
      setCached(isCached ?? false)
      setCacheWeek(week ?? '')
      setCacheStatus(status ?? '')
      setResultCategoryName(categoryName ?? '')
      setCategorySignal(signal ?? null)
      setSearchedQuery(input.trim())
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
          discoveryQuery: from === 'results' ? input.trim() || undefined : undefined,
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
      <div className="min-h-screen py-14 px-4 font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
        <div className="max-w-6xl mx-auto animate-in lg:grid lg:grid-cols-[1fr_272px] lg:gap-10 lg:items-start">
        <div className="min-w-0">

          <button onClick={() => setMode('form')} className="text-xs font-mono uppercase text-[#4c4546] hover:text-black -ml-2 mb-6 lg:hidden">
            ← New Search
          </button>

          <h1 className="text-2xl font-black mb-2">
            Top Opportunities in{' '}
            <span className="italic">{input}</span>
          </h1>
          {resultCategoryName && resultCategoryName !== 'Supplements' && (
            <p className="text-xs font-mono text-[#7e7576] mb-1">
              Analyzed as: {resultCategoryName}
            </p>
          )}
          <p className="text-sm text-[#4c4546] mb-8">
            Explore the map or scan the list, then open a full investment memo · costs 1 analysis slot
          </p>

          {error && <div className="mb-6"><ErrorBanner message={error} networkFailure={networkFailure} /></div>}

          <CategorySignalPanel signal={categorySignal} category={searchedQuery} />

          {/* ── view toggle ── */}
          <div className="flex items-center gap-1 mb-5 border-b-2 border-black">
            {(['map', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setResultsView(v)}
                className={`relative text-xs font-mono font-medium uppercase tracking-wider px-4 py-2.5 transition-colors ${
                  resultsView === v ? 'text-black font-bold' : 'text-[#7e7576] hover:text-[#4c4546]'
                }`}
              >
                {v === 'map' ? 'Map' : 'List'}
                {resultsView === v && <span className="absolute left-3 right-3 -bottom-[2px] h-[2px] bg-black" />}
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
          <div className="bg-white border border-black p-5">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#7e7576] mb-4">Search Summary</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider mb-1">Query</p>
                <p className="text-sm italic text-black truncate">&ldquo;{input}&rdquo;</p>
              </div>
              <div className="pt-3 border-t border-black/10 flex items-center justify-between">
                <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider">Found</p>
                <p className="text-sm font-bold text-black">{opportunities.length} opportunities</p>
              </div>
              {isAutoMode && detectedConfig && (
                <div className="pt-3 border-t border-black/10 flex items-center justify-between">
                  <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider">Category</p>
                  <DetectedCategoryBadge config={detectedConfig} />
                </div>
              )}
              {cached && cacheWeek && (
                <div className="pt-3 border-t border-black/10">
                  <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider mb-1">Data freshness</p>
                  <p className="text-xs text-[#4c4546]">
                    {cacheStatus === 'updated' ? 'Updated this week' : 'Cached this week'} · {cacheWeek}
                  </p>
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setMode('form')} className="w-full text-sm py-2.5 font-bold uppercase tracking-wide bg-white border border-black text-black hover:bg-[#f3f3f3] transition-colors">
            ← New Search
          </button>
        </aside>
        </div>
      </div>
    )
  }

  // ── FORM ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-16 px-4 font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
      <div className="max-w-5xl mx-auto animate-in lg:grid lg:grid-cols-[1fr_272px] lg:gap-10 lg:items-start">
      <div className="min-w-0">

        <Link href="/dashboard" className="text-xs font-mono uppercase text-[#4c4546] hover:text-black mb-6 -ml-2 inline-flex">
          ← Analyses
        </Link>

        <h1 className="text-2xl font-black mb-1">Discover Opportunities</h1>
        <p className="text-sm text-[#4c4546] mb-8">
          {isAutoMode
            ? 'Type any product idea — Open Discovery routes to the right category automatically.'
            : 'Enter a broad category to explore opportunities, or a specific idea for a direct analysis.'}
        </p>

        {/* Category / mode selector */}
        <CategorySelector selected={categoryId} onSelect={handleCategorySelect} />

        <form onSubmit={handleDiscover} className="space-y-5">

          {/* main input — command-prompt entry, not a boxed form field */}
          <div className="mb-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-[#7e7576] mb-3">
              {isAutoMode ? 'Product idea or category' : `${category.name} category or idea`}
            </label>
            <div className="flex items-start gap-3 border-b-2 border-black pb-3 transition-colors">
              <span className="font-mono text-xl text-black shrink-0 select-none leading-[1.7]">&gt;</span>
              <textarea
                value={input} onChange={e => setInput(e.target.value)}
                placeholder={
                  isAutoMode
                    ? `e.g. "dog joint supplement", "anti-aging serum", "viral kitchen gadget"…`
                    : `Broad: "${category.examples.broad[0]}"  →  discovers 20 opportunities\nSpecific: "${category.examples.specific[0] ?? ''}"  →  full memo`
                }
                className="flex-1 bg-transparent border-0 outline-none resize-none font-mono text-lg text-black placeholder:text-[#7e7576] placeholder:text-sm leading-relaxed h-[3.4rem]"
                maxLength={200} required autoFocus
              />
            </div>
            <div className="flex items-center justify-between mt-3">
              {input.trim() && !isAutoMode ? (
                <p className="text-xs text-[#4c4546] flex items-center gap-1.5">
                  {broad
                    ? <><IconTarget className="w-3 h-3 text-black shrink-0" /> Broad category — will discover 20 ranked opportunities</>
                    : <><IconBeaker className="w-3 h-3 text-black shrink-0" /> Specific idea — will generate full investment memo</>}
                </p>
              ) : input.trim() && isAutoMode ? (
                <p className="text-xs text-[#4c4546] flex items-center gap-1.5"><IconSpark className="w-3 h-3 text-black shrink-0" /> Open Discovery — category detected automatically</p>
              ) : (
                <p className="text-xs font-mono text-[#7e7576]">Costs 1 slot per full report</p>
              )}
              <span className="text-xs text-[#7e7576] font-mono">{input.length}/200</span>
            </div>
          </div>

          {/* optional context — only for specific (non-auto, non-broad) */}
          {!isAutoMode && !broad && input.trim() && (
            <div className="bg-white border border-black p-6">
              <button type="button" onClick={() => setShowExtra(v => !v)}
                className="flex items-center justify-between w-full text-left group">
                <div>
                  <p className="text-sm font-medium text-black">Optional context</p>
                  <p className="text-xs text-[#7e7576] mt-0.5">Audience, price point, background</p>
                </div>
                <svg className={`w-4 h-4 text-[#7e7576] shrink-0 ml-4 transition-transform ${showExtra ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {showExtra && (
                <div className="mt-5 space-y-4 animate-in">
                  <div>
                    <label className="block text-sm text-[#4c4546] mb-1.5">Target audience</label>
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                      placeholder="e.g. women 30–45 with hormonal issues"
                      className="w-full bg-white border-2 border-black px-4 py-2.5 text-sm text-black placeholder-[#7e7576] focus:outline-none" maxLength={100}/>
                  </div>
                  <div>
                    <label className="block text-sm text-[#4c4546] mb-1.5">Price point</label>
                    <select value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-white border-2 border-black px-4 py-2.5 text-sm text-black focus:outline-none">
                      {PRICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[#4c4546] mb-1.5">Additional context</label>
                    <textarea value={extra} onChange={e => setExtra(e.target.value)}
                      placeholder="Key ingredient, competitor you've spotted, your background..."
                      className="w-full bg-white border-2 border-black px-4 py-2.5 text-sm text-black placeholder-[#7e7576] focus:outline-none resize-none h-20" maxLength={500}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <ErrorBanner message={error} networkFailure={networkFailure} />}

          <button type="submit" disabled={!input.trim()} className="w-full py-3.5 text-base font-black uppercase tracking-widest text-white bg-black hover:bg-white hover:text-black border-2 border-black transition-colors duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
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
                <p className="text-xs font-mono text-[#7e7576] mb-2">Try any of these:</p>
                <div className="flex flex-wrap gap-2">
                  {category.examples.broad.map(ex => (
                    <button key={ex} type="button" onClick={() => setInput(ex)}
                      className="text-xs px-3 py-1.5 bg-white border border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {category.examples.broad.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-[#7e7576] mb-2">Broad categories (discovery mode):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.broad.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 bg-white border border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {category.examples.specific.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-[#7e7576] mb-2">Specific ideas (direct analysis):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.specific.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 bg-white border border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3] transition-colors">
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
        <div className="bg-white border border-black p-5">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#7e7576] mb-4">How it works</p>
          <div className="space-y-4">
            {[
              { n: '01', t: 'Type your idea', b: 'Broad category or specific concept.' },
              { n: '02', t: 'Wait ~60 seconds', b: 'Demand, virality, subscription, and manufacturing get scored.' },
              { n: '03', t: 'Get your answer', b: 'Market gaps, formula, financials, and an Entry Supported or Not Supported verdict.' },
            ].map(s => (
              <div key={s.n} className="flex gap-3">
                <span className="italic text-lg text-[#cfc4c5] shrink-0 font-mono">{s.n}</span>
                <div>
                  <p className="text-sm font-medium leading-snug text-black">{s.t}</p>
                  <p className="text-xs text-[#7e7576] mt-0.5 leading-relaxed">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-black p-5">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#7e7576] mb-2">Beta</p>
          <p className="text-xs text-[#4c4546] leading-relaxed">3 free analyses · 28 categories pre-loaded on the leaderboard · your analyses are added automatically.</p>
        </div>
      </aside>
      </div>
    </div>
  )
}
