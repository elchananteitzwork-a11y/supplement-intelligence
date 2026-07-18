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
import { AppShell } from '@/components/shell/AppShell'
import { IconSpark, IconTarget, IconBeaker } from '@/components/icons'
import {
  HardCard,
  HardShadowSearchTextarea,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  GhostLinkButton,
  WitnessDots,
} from '@/components/ui'

// ── constants ─────────────────────────────────────────────────

type PageMode = 'form' | 'classifying' | 'discovering' | 'results' | 'analyzing'

const CLASSIFYING_STEPS = [
  'Reading your query',
  'Detecting category',
  'Routing to best module',
]

const DISCOVERY_STEPS = [
  'Scanning the category',
  'Identifying market opportunities',
  'Scoring each opportunity',
  'Ranking by opportunity score',
]

// Reordered/expanded 2026-06-24 to match what actually happens server-side
// and to slow down how quickly this list exhausts — real provider calls
// (Keepa, Apify competitor search, Apify review collection) routinely take
// 1-3 minutes combined, and the old 6-step/8s-per-step list froze on
// "Writing investment memo..." for most of that wait, which read as stuck
// even when the backend was still working normally.
const ANALYSIS_STEPS = [
  'Mapping market conditions',
  'Scoring demand and competition',
  'Searching Amazon for real competitor products',
  'Collecting real customer reviews',
  'Analyzing virality potential',
  'Building product recommendation',
  'Calculating financial projections',
  'Writing investment memo',
]

const DISCOVERY_PROVIDERS = ['Keepa', 'Google Trends', 'TikTok', 'Amazon Reviews']
const ANALYSIS_PROVIDERS  = ['Keepa', 'Google Trends', 'TikTok', 'Amazon Reviews', 'Meta Ads']

// Shown once the fixed step list above is exhausted but the request hasn't
// returned yet — real provider data can take longer than the list assumes,
// so this keeps the screen visibly updating instead of looking frozen.
const STILL_WORKING_MESSAGES = [
  'Still collecting real data — this can take a few minutes for some categories',
  'Real provider data (Amazon, Keepa) takes longer than the AI writing itself',
  'Almost there — finishing up real-data collection',
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
// OpportunityCard.promise/scores tiers aren't one of VerdictBadge's three
// verdict schemes, so they're mapped directly to the same verdict hex
// values via design tokens instead of being forced through VerdictBadge.
function promiseColor(p: 'High' | 'Medium' | 'Low') {
  return p === 'High' ? 'text-verdict-positive' : p === 'Medium' ? 'text-verdict-caution-text' : 'text-verdict-negative'
}
function promiseBg(p: 'High' | 'Medium' | 'Low') {
  return p === 'High' ? 'bg-verdict-positive' : p === 'Medium' ? 'bg-verdict-caution' : 'bg-verdict-negative'
}
function promiseHex(p: 'High' | 'Medium' | 'Low') {
  return p === 'High' ? '#008a00' : p === 'Medium' ? '#fbc02d' : '#d32f2f'
}

function tierColor(t: 'High' | 'Medium' | 'Low' | 'Strong' | 'Moderate' | 'Weak') {
  return t === 'High' || t === 'Strong' ? 'text-verdict-positive'
       : t === 'Medium' || t === 'Moderate' ? 'text-verdict-caution-text'
       : 'text-verdict-negative'
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Real, honest trend arrow — derived from OpportunityMeta.promise_delta
// (server-computed comparison of this week's promise tier vs. last week's
// for the same opportunity name; 'new' has no prior tier to compare).
// Never a fabricated percentage — Stitch's reference shows a MoM growth
// % figure, but no such number is ever computed for these AI-tiered
// opportunity cards, so this is the honest substitute for that visual slot.
function DeltaTag({ delta }: { delta?: 'up' | 'down' | 'same' | 'new' }) {
  if (!delta) return null
  if (delta === 'new')  return <span className="text-[10px] font-mono font-bold text-black border border-black px-1.5 py-0.5 uppercase">New</span>
  if (delta === 'up')   return <span className="text-[10px] font-mono font-bold text-verdict-positive uppercase">▲ Up</span>
  if (delta === 'down') return <span className="text-[10px] font-mono font-bold text-verdict-negative uppercase">▼ Down</span>
  return <span className="text-[10px] font-mono text-outline uppercase">— Same</span>
}

// ── sub-components ─────────────────────────────────────────────

function DifficultyBadge({ d }: { d: OpportunityCard['difficulty'] }) {
  const styles = {
    Easy:   'text-verdict-positive border-verdict-positive',
    Medium: 'text-verdict-caution-text border-verdict-caution-text',
    Hard:   'text-verdict-negative border-verdict-negative',
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-bold font-mono uppercase px-2 py-0.5 border ${styles[d]}`}>
      {d}
    </span>
  )
}

function TierBadge({ value, good, bad }: { value: string; good: string; bad: string }) {
  const cls = value === good
    ? 'text-verdict-positive border-verdict-positive'
    : value === bad
      ? 'text-verdict-negative border-verdict-negative'
      : 'text-verdict-caution-text border-verdict-caution-text'
  return (
    <span className={`inline-flex items-center text-[10px] font-bold font-mono uppercase px-2 py-0.5 border ${cls}`}>
      {value}
    </span>
  )
}

function MetaRow({ opp }: { opp: OpportunityCard }) {
  return (
    <div className="flex divide-x divide-black/10 border border-black mt-3 overflow-hidden">
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-outline uppercase mb-1">Capital Tier</p>
        <TierBadge value={opp.startup_cost_tier ?? '—'} good="Lean" bad="Capital-Intensive" />
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-outline uppercase mb-1">Difficulty</p>
        <DifficultyBadge d={opp.difficulty} />
      </div>
      <div className="flex-1 px-2.5 py-2.5 text-center">
        <p className="text-[10px] font-mono text-outline uppercase mb-1">Launch Speed</p>
        <TierBadge value={opp.launch_speed ?? '—'} good="Fast" bad="Slow" />
      </div>
    </div>
  )
}

function EvidenceGrid({ scores }: { scores: OpportunityCard['scores'] }) {
  const dims: { label: string; tier: string; facts: string[] }[] = [
    { label: 'Demand', tier: scores.demand.signal, facts: [`Signal: ${scores.demand.signal}`] },
    ...(scores.market_saturation ? [{
      label: 'Market',
      tier: scores.market_saturation.level,
      facts: [`Saturation: ${scores.market_saturation.level}`, `Barrier: ${scores.market_saturation.barrier}`, scores.market_saturation.note ?? ''],
    }] : []),
    { label: 'Virality', tier: scores.virality.tiktok, facts: [`TikTok: ${scores.virality.tiktok}`, `Content: ${scores.virality.content_potential}`, `UGC: ${scores.virality.ugc}`] },
    { label: 'Subscription', tier: scores.subscription.retention, facts: [`Retention: ${scores.subscription.retention}`] },
    { label: 'Manufacturing', tier: scores.manufacturing.complexity, facts: [`Complexity: ${scores.manufacturing.complexity}`] },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {dims.map(({ label, tier, facts }) => (
        <HardCard key={label} padded={false} className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-semibold text-outline uppercase tracking-wide">{label}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${tierColor(tier as 'High' | 'Medium' | 'Low' | 'Strong' | 'Moderate' | 'Weak')}`}>{tier}</span>
          </div>
          <div className="space-y-0.5">
            {facts.map((f, i) => (
              <p key={i} className="text-[11px] text-ink-variant leading-snug">{f}</p>
            ))}
          </div>
        </HardCard>
      ))}
    </div>
  )
}

// ── Investigation Console — rebuilt on the Stitch "Preliminary Read"
// bento-grid pattern (status pill + radial progress + Data Integrity panel
// on the left, a timestamped "Resolving Evidence" feed on the right)
// instead of the old macOS-terminal-window metaphor.
//
// Honesty constraints: the backend runs discovery/analysis as a single
// request — there is no real incremental per-provider completion signal to
// observe client-side. So providers are shown as a set, "Querying" until
// the whole batch either succeeds or fails together — never faked as
// completing one-by-one. Timestamps on evidence entries are real
// (Date.now() captured when the client-side step advanced), not
// server-side event times. Stitch's circular "Signal Lifecycle" gauge is
// fed by the same real stepIdx/steps.length fraction the old horizontal
// dot-line used — same data, different chrome. Stitch's fictional
// "Interim Synthesis" AI quote and "Probe deeper" live-refine box are
// omitted outright: no backend generates interim narrative text or
// supports mid-flight query refinement.
// ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PageMode, string> = {
  classifying: 'Classifying',
  discovering: 'Scanning',
  analyzing:   'Verifying',
  form: '', results: '',
}

function RadialProgress({ fraction }: { fraction: number }) {
  const r = 80, c = 2 * Math.PI * r
  return (
    <svg className="w-40 h-40 -rotate-90" viewBox="0 0 192 192">
      <circle cx="96" cy="96" r={r} fill="none" stroke="#e2e2e2" strokeWidth="12" />
      <circle
        cx="96" cy="96" r={r} fill="none" stroke="#000000" strokeWidth="12"
        strokeDasharray={c} strokeDashoffset={c * (1 - fraction)}
        strokeLinecap="butt" style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  )
}

function InvestigationConsole({
  mode, query, steps, stepIdx, providers,
}: {
  mode: 'classifying' | 'discovering' | 'analyzing'
  query: string; steps: string[]; stepIdx: number; providers: string[]
}) {
  const exhausted = stepIdx === steps.length - 1
  const [elapsed, setElapsed] = useState(0)
  const [stepTimes, setStepTimes] = useState<number[]>([Date.now()])

  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [mode])

  useEffect(() => {
    setStepTimes(prev => (stepIdx < prev.length ? prev : [...prev, Date.now()]))
  }, [stepIdx])

  const stillWorkingMsg = STILL_WORKING_MESSAGES[Math.min(Math.floor(elapsed / 20), STILL_WORKING_MESSAGES.length - 1)]

  return (
    <div className="font-sans">
      <div className="max-w-5xl mx-auto animate-in space-y-gutter">

        {/* header */}
        <div className="flex items-center gap-3">
          <span className="bg-verdict-caution text-black px-3 py-1 text-verdict-sm uppercase tracking-tight font-black">
            {STATUS_LABEL[mode]} — {stepIdx + 1} of {steps.length} steps
          </span>
        </div>
        <div>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl text-black leading-none">{query}</h1>
        </div>

        {/* bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">

          {/* left column — status + data integrity */}
          <div className="lg:col-span-4 flex flex-col gap-gutter">
            <HardCard className="flex flex-col items-center gap-4 relative">
              <p className="absolute top-4 left-4 text-[10px] font-mono uppercase text-outline tracking-widest">Signal Lifecycle</p>
              <div className="mt-6">
                <RadialProgress fraction={(stepIdx + 1) / steps.length} />
              </div>
              <div className="text-center -mt-2">
                <p className="text-sm font-mono font-bold uppercase text-black">{exhausted ? 'Finalizing' : steps[stepIdx]}</p>
                <p className="text-[11px] font-mono text-outline mt-1 uppercase">Step {stepIdx + 1} / {steps.length}</p>
              </div>
              <div className="flex gap-2 pt-4 border-t border-black/10 w-full justify-center">
                {steps.map((_, i) => (
                  <span key={i} className={`w-2.5 h-2.5 rounded-full ${i <= stepIdx ? 'bg-black' : 'border border-black'}`} />
                ))}
              </div>
            </HardCard>

            {providers.length > 0 && (
              <HardCard>
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest border-b border-black pb-2 mb-3">Data Sources</h3>
                <div className="flex flex-col gap-2.5">
                  {providers.map(p => (
                    <div key={p} className="flex justify-between items-center">
                      <span className="text-sm text-ink">{p}</span>
                      <span className="text-[10px] font-mono text-outline uppercase">{exhausted ? 'Querying…' : 'Pending'}</span>
                    </div>
                  ))}
                </div>
              </HardCard>
            )}
          </div>

          {/* right column — resolving evidence feed */}
          <div className="lg:col-span-8">
            <HardCard>
              <h2 className="text-headline-md text-black uppercase tracking-tight mb-6">Resolving Evidence</h2>
              <div className="space-y-5">
                {steps.slice(0, stepIdx + 1).map((s, i) => {
                  const done = i < stepIdx || (i === stepIdx && exhausted === false)
                  return (
                    <div key={i} className="flex gap-4 items-start">
                      <div className="text-[11px] font-mono text-outline py-0.5 w-16 shrink-0">{clock(stepTimes[i] ?? stepTimes[stepTimes.length - 1])}</div>
                      <div className="flex-1 border-b border-black/10 pb-5">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className={`w-2 h-2 rounded-full ${i <= stepIdx ? 'bg-black' : 'border border-black'}`} />
                          <span className="text-xs font-mono font-bold uppercase tracking-wide text-black">{s}</span>
                          {i < stepIdx && <span className="text-[10px] font-mono text-verdict-positive uppercase">done</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {exhausted && (
                  <div className="flex gap-4 items-start opacity-70">
                    <div className="text-[11px] font-mono text-outline py-0.5 w-16 shrink-0">{elapsed}s</div>
                    <div className="flex-1 italic">
                      <p className="text-sm text-ink-variant">{stillWorkingMsg}</p>
                    </div>
                  </div>
                )}
              </div>
            </HardCard>
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
    <div className="bg-error-container border border-error p-4 text-sm text-error-on-container">
      <p>{message}</p>
      {networkFailure && (
        <p className="mt-2 text-error-on-container/80">
          <Link href="/dashboard" className="underline hover:text-error-on-container">Check your dashboard</Link> before re-running this — if it finished, you&rsquo;ll find it there without using another analysis slot.
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
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <button
        type="button"
        onClick={() => onSelect(autoConfig.id)}
        className={`px-3 py-1.5 text-xs font-mono uppercase font-bold border transition-colors flex items-center gap-1.5 ${
          selected === autoConfig.id ? 'bg-black text-white border-black' : 'bg-white border-black text-ink-variant hover:text-black'
        }`}
      >
        <span>{autoConfig.icon}</span> {autoConfig.name}
      </button>
      <span className="text-outline text-xs">|</span>
      {otherConfigs.map(cat => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className={`px-3 py-1.5 text-xs font-mono uppercase border transition-colors ${
            selected === cat.id ? 'bg-black text-white border-black' : 'bg-white border-black text-ink-variant hover:text-black'
          }`}
        >
          <span className="mr-1">{cat.icon}</span>{cat.name}
        </button>
      ))}
    </div>
  )
}

function DetectedCategoryBadge({ config }: { config: CategoryClientConfig }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono uppercase text-black border border-black px-2 py-0.5">
      <span>{config.icon}</span> {config.name}
    </span>
  )
}

// ── Opportunity Map — promise (AI editorial tier) vs. ease of execution.
// Stitch's reference ("Pipeline - Opportunity Portfolio") plots opportunities
// along a fictional "market lifecycle" arc (Emerging/Window Open/Contested/
// Saturated) — no such field is ever computed for these AI-suggested
// opportunities, so that axis is not reproduced. What IS kept from Stitch:
// the legend-row-above-a-white-chart-card composition, numbered dots for
// the top-ranked opportunities, and the bullish/neutral/bearish color
// legend — remapped onto the real High/Medium/Low promise tiers, which
// already use this exact verdict palette everywhere else in the app.
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
  opportunities, selectedName, onSelect, count,
}: {
  opportunities: OpportunityCard[]
  selectedName: string | null
  onSelect: (name: string) => void
  count: number
}) {
  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-headline-md text-black uppercase tracking-tight">Opportunity Map</h2>
          <p className="text-[11px] font-mono text-outline uppercase tracking-wider mt-1">Promise vs. ease of execution — AI judgment · N={count} opportunities</p>
        </div>
        <div className="flex gap-4">
          {(['High', 'Medium', 'Low'] as const).map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5" style={{ background: promiseHex(p) }} />
              <span className="text-[10px] font-mono text-outline uppercase">{p}</span>
            </div>
          ))}
        </div>
      </div>

      <HardCard className="relative h-[320px] sm:h-[420px] overflow-hidden">
        <div className="relative w-full h-full ml-6 border-l border-b border-black">
          <div className="absolute left-0 right-0 border-t border-dashed border-black/15 pointer-events-none" style={{ top: '35%' }} />
          <div className="absolute top-0 bottom-0 border-l border-dashed border-black/15 pointer-events-none" style={{ left: '50%' }} />

          <span className="absolute top-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-verdict-positive/80 font-mono font-medium">Best bets</span>
          <span className="absolute top-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-outline font-mono">High reward, hard</span>
          <span className="absolute bottom-2 right-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-outline font-mono">Quick wins</span>
          <span className="absolute bottom-2 left-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider text-outline font-mono">Low priority</span>

          {opportunities.map((opp, i) => {
            const x = Math.min(97, Math.max(2, easeOf(opp.difficulty) + hashJitter(opp.name, 14)))
            const y = Math.min(96, Math.max(3, promiseY(opp.promise) + hashJitter(opp.name + 'y', 10)))
            const isTop = i < 3
            const isSel = selectedName === opp.name
            const size  = isSel ? 34 : isTop ? 26 : 12
            return (
              <button
                key={opp.name}
                onClick={() => onSelect(opp.name)}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10 hover:z-20 group flex items-center justify-center"
                style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
                aria-label={opp.name}
              >
                <span
                  className={`flex items-center justify-center rounded-full border-2 border-black transition-transform duration-150 group-hover:scale-110 ${isTop || isSel ? 'text-white text-[11px] font-bold' : ''}`}
                  style={{ width: size, height: size, background: promiseHex(opp.promise) }}
                >
                  {(isTop || isSel) ? i + 1 : ''}
                </span>
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-black border border-black text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {opp.name} · {opp.promise}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-between mt-2.5 ml-6 text-[10px] font-mono text-outline uppercase tracking-wider">
          <span>← Harder to build</span>
          <span>Easier to build →</span>
        </div>
      </HardCard>
    </section>
  )
}

// ── Opportunity Inventory — replaces the old separate List-table +
// Detail-card pair with one grouped, expandable row list matching Stitch's
// "Pipeline Inventory" pattern. Grouped by promise tier (the real, honest
// analog of Stitch's fictional lifecycle-stage groups — no stage field
// exists for these opportunities, so promise tier is the closest real
// substitute). Stitch's row also has a select-checkbox feeding a "Compare
// Selected" action and a "MoM Growth" percentage — both omitted: there is
// no real cross-opportunity compare surface for pre-analysis AI
// suggestions (they have no id yet, only saved research-pipeline theses
// are comparable), and no percentage growth is ever computed per
// opportunity. `_meta.promise_delta` (a real field) is shown instead via
// DeltaTag.
function OpportunityInventory({
  opportunities, expandedName, onToggle, onOpen,
}: {
  opportunities: (OpportunityCard & { rank: number })[]
  expandedName: string | null
  onToggle: (name: string) => void
  onOpen: (name: string) => void
}) {
  const groups: { tier: 'High' | 'Medium' | 'Low'; items: (OpportunityCard & { rank: number })[] }[] = (['High', 'Medium', 'Low'] as const)
    .map(tier => ({ tier, items: opportunities.filter(o => o.promise === tier) }))
    .filter(g => g.items.length > 0)

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-4">
        <h2 className="text-headline-md text-black uppercase tracking-tight">Opportunity Inventory</h2>
        <span className="text-xs font-mono text-outline uppercase">{opportunities.length} total</span>
      </div>

      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.tier} className="border border-black bg-white">
            <div className="flex items-center gap-3 p-3 bg-surface-container-low border-b border-black">
              <span className={`w-2.5 h-2.5 ${promiseBg(g.tier)}`} />
              <span className="text-xs font-mono font-bold uppercase tracking-wide text-black">{g.tier} promise</span>
              <span className="bg-black text-white px-2 text-[10px] font-bold">{g.items.length}</span>
            </div>
            <div className="divide-y divide-black/10">
              {g.items.map(opp => {
                const isOpen = expandedName === opp.name
                return (
                  <div key={opp.name} id={`opp-row-${opp.name}`}>
                    <button
                      onClick={() => onToggle(opp.name)}
                      className="w-full flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-surface-container-low transition-colors"
                    >
                      <span className="font-mono text-xs text-outline w-6 shrink-0">{String(opp.rank).padStart(2, '0')}</span>
                      <div className="flex-1 min-w-[10rem]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-black">{opp.name}</span>
                          <DeltaTag delta={opp._meta?.promise_delta} />
                        </div>
                        <p className="text-xs text-ink-variant mt-0.5 hidden sm:block truncate">{opp.rationale}</p>
                      </div>
                      <span className="hidden md:block text-xs text-outline shrink-0 w-24 text-center">Signal: {opp.scores.demand.signal}</span>
                      <DifficultyBadge d={opp.difficulty} />
                      <span className={`text-xs font-black uppercase tracking-wide w-16 text-right shrink-0 ${promiseColor(opp.promise)}`}>{opp.promise}</span>
                      <svg className={`w-4 h-4 text-outline shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-5 pt-1 animate-in">
                        <p className="text-sm text-ink-variant">{opp.rationale}</p>
                        <p className="text-[10px] text-outline italic mt-2">
                          AI editorial judgment, not independently verified — promise tier and dimension labels are model output, not a measurement. Open the full report for per-field source detail on your specific idea.
                        </p>
                        <MetaRow opp={opp} />
                        <EvidenceGrid scores={opp.scores} />
                        <PrimaryButton onClick={() => onOpen(opp.name)} className="w-full mt-4">
                          Open Full Report →
                        </PrimaryButton>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Category Signal — the ONE real data point fetched for the whole broad
// category at discovery time.
// ── Signal detail grid — a compact label/value fact grid, renders nothing
// for fields that are absent (never fabricates a placeholder for a field a
// provider didn't return). Shared by every dimension group below.
function FactGrid({ facts }: { facts: { label: string; value: string | number | undefined }[] }) {
  const present = facts.filter((f): f is { label: string; value: string | number } => f.value !== undefined && f.value !== null && f.value !== '')
  if (!present.length) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
      {present.map(f => (
        <div key={f.label} className="leading-tight">
          <p className="text-[9px] font-mono text-outline uppercase tracking-wide">{f.label}</p>
          <p className="text-xs font-mono text-ink-variant mt-0.5">{f.value}</p>
        </div>
      ))}
    </div>
  )
}

function pct(n: number | undefined, digits = 0): string | undefined {
  return n === undefined ? undefined : `${(n * 100).toFixed(digits)}%`
}
function signedPct(n: number | undefined | null): string | undefined {
  return n === undefined || n === null ? undefined : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ── Real Category Signal — the ONE real data point set fetched for the
// whole broad category at discovery time (signalEngine.fetch()). Every
// field below is read straight off the same AggregatedSignals object
// already in the /api/discover response — nothing here required a backend
// change; it was already on the wire and simply wasn't read by the old,
// 6-fact version of this panel (see docs/BACKEND_STITCH_COMPATIBILITY_AUDIT.md
// §1.4 "Real Category Signal panel" / Section B).
function CategorySignalPanel({ signal, category }: { signal: AggregatedSignals | null; category: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!signal) return null

  const headline: { label: string; value: string | undefined }[] = [
    { label: 'Search volume', value: signal.demand?.value.search_volume },
    { label: 'Trend', value: signal.demand?.value.trend },
    { label: `YoY (${signal.growth?.primarySource ?? '—'})`, value: signal.growth?.value.yoy_change },
    { label: 'Competing sellers', value: signal.competition?.value.competing_brands },
    { label: 'Saturation', value: signal.competition?.value.saturation },
    { label: 'Avg. price', value: signal.pricing?.value.avg_price },
    { label: 'TikTok signal', value: signal.virality?.value.tiktok },
  ]
  const hasHeadline = headline.some(r => r.value)
  if (!hasHeadline) return null

  const d  = signal.demand?.value
  const g  = signal.growth?.value
  const c  = signal.competition?.value
  const p  = signal.pricing?.value
  const rv = signal.revenue?.value
  const v  = signal.virality?.value
  const rev = signal.review_velocity?.value
  const sz = signal.seasonality?.value

  const hasDetail = !!(d?.top_regions?.length || d?.annual_growth_rate !== undefined || d?.momentum_3m_pct !== undefined
    || g?.momentum || g?.momentum_90d_pct !== undefined
    || c?.barrier || c?.distinct_brand_count !== undefined || c?.top_brand_review_share !== undefined || c?.seller_count_trend || c?.market_maturity || c?.avg_listing_age_months !== undefined || c?.amazon_oos_pct !== undefined || c?.amazon_buybox_pct !== undefined || c?.avg_variation_count !== undefined
    || p?.price_range || p?.premium_viable !== undefined || p?.price_per_unit_range || p?.fba_price_floor || p?.list_price_discount_pct !== undefined
    || rv?.est_monthly_revenue || rv?.top_seller_revenue || rv?.est_monthly_units_sold || rv?.avg_rating || rv?.avg_review_count !== undefined || rv?.avg_fba_pick_pack_fee || rv?.avg_referral_fee_pct !== undefined || rv?.price_compression_pct !== undefined || rv?.sns_enrolled_pct !== undefined || rv?.category_fba_pct !== undefined || rv?.category_amazon_seller_pct !== undefined
    || v?.content_potential || v?.ugc || v?.video_count !== undefined || v?.view_count !== undefined || v?.meta_signal || v?.ad_count !== undefined || v?.advertiser_count !== undefined
    || rev?.monthly_reviews || rev?.sentiment || rev?.meaningful_competitor_count !== undefined || rev?.review_concentration_ratio !== undefined || rev?.pain_point_examples?.length || rev?.top_competitors?.length
    || sz?.pattern || sz?.peak_months?.length)

  const totalProviders = signal.providers_used.length + (signal.failed_providers?.length ?? 0)

  return (
    <HardCard className="mb-8">
      <div className="flex items-center justify-between mb-2.5 gap-3 flex-wrap">
        <p className="text-[10px] font-mono text-outline uppercase tracking-wider">Real Category Signal</p>
        <div className="flex items-center gap-2 shrink-0">
          {totalProviders > 0 && <WitnessDots filled={signal.providers_used.length} total={totalProviders} size="sm" />}
          <span className="text-[10px] font-mono text-outline">{signal.providers_used.join(', ')} · {Math.round(signal.overall_confidence * 100)}% confidence</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {headline.filter(r => r.value).map(r => (
          <div key={r.label} className="leading-tight">
            <span className="text-[10px] font-mono text-outline">{r.label}: </span>
            <span className="text-xs font-mono text-ink-variant">{r.value}</span>
          </div>
        ))}
      </div>

      {hasDetail && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-black hover:text-ink-variant"
          >
            {expanded ? 'Hide full signal data' : 'Show full signal data'}
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-black space-y-4 animate-in">
              <FactGrid facts={[
                { label: 'Top demand regions', value: d?.top_regions?.join(', ') },
                { label: 'Annual growth rate', value: signedPct(d?.annual_growth_rate) },
                { label: '3mo momentum', value: signedPct(d?.momentum_3m_pct) },
                { label: 'Growth momentum', value: g?.momentum },
                { label: '90d momentum', value: g?.momentum_90d_pct != null ? signedPct(g.momentum_90d_pct) : undefined },
              ]} />
              <FactGrid facts={[
                { label: 'Barrier to entry', value: c?.barrier },
                { label: 'Distinct brands', value: c?.distinct_brand_count },
                { label: 'Top brand review share', value: pct(c?.top_brand_review_share) },
                { label: 'Seller count trend', value: c?.seller_count_trend },
                { label: 'Market maturity', value: c?.market_maturity },
                { label: 'Avg listing age', value: c?.avg_listing_age_months !== undefined ? `${c.avg_listing_age_months}mo` : undefined },
                { label: 'Amazon OOS rate', value: pct(c?.amazon_oos_pct !== undefined ? c.amazon_oos_pct / 100 : undefined) },
                { label: 'Amazon buy-box share', value: pct(c?.amazon_buybox_pct) },
                { label: 'Avg variation count', value: c?.avg_variation_count },
              ]} />
              <FactGrid facts={[
                { label: 'Price range', value: p?.price_range },
                { label: 'Premium viable', value: p?.premium_viable === undefined ? undefined : (p.premium_viable ? 'Yes' : 'No') },
                { label: 'Price per unit', value: p?.price_per_unit_range },
                { label: 'FBA price floor', value: p?.fba_price_floor },
                { label: 'List-price discount', value: pct(p?.list_price_discount_pct !== undefined ? p.list_price_discount_pct / 100 : undefined) },
              ]} />
              <FactGrid facts={[
                { label: 'Est. monthly revenue', value: rv?.est_monthly_revenue },
                { label: 'Top seller revenue', value: rv?.top_seller_revenue },
                { label: 'Est. monthly units sold', value: rv?.est_monthly_units_sold },
                { label: 'Avg rating', value: rv?.avg_rating },
                { label: 'Avg review count', value: rv?.avg_review_count },
                { label: 'Avg FBA pick/pack fee', value: rv?.avg_fba_pick_pack_fee },
                { label: 'Avg referral fee', value: rv?.avg_referral_fee_pct !== undefined ? `${rv.avg_referral_fee_pct}%` : undefined },
                { label: 'Price compression (90d vs 12mo)', value: signedPct(rv?.price_compression_pct) },
                { label: 'Subscribe & Save enrollment', value: pct(rv?.sns_enrolled_pct) },
                { label: 'Category FBA share', value: pct(rv?.category_fba_pct !== undefined ? rv.category_fba_pct / 100 : undefined) },
                { label: 'Sold by Amazon directly', value: pct(rv?.category_amazon_seller_pct !== undefined ? rv.category_amazon_seller_pct / 100 : undefined) },
              ]} />
              <FactGrid facts={[
                { label: 'Content potential', value: v?.content_potential },
                { label: 'UGC potential', value: v?.ugc },
                { label: 'TikTok videos', value: v?.video_count?.toLocaleString() },
                { label: 'TikTok views', value: v?.view_count?.toLocaleString() },
                { label: 'Meta Ads signal', value: v?.meta_signal },
                { label: 'Ads found', value: v?.ad_count },
                { label: 'Distinct advertisers', value: v?.advertiser_count },
                { label: 'Active ad share', value: pct(v?.active_ad_pct) },
              ]} />
              <FactGrid facts={[
                { label: 'Monthly review velocity', value: rev?.monthly_reviews },
                { label: 'Review sentiment', value: rev?.sentiment },
                { label: 'Meaningful competitors', value: rev?.meaningful_competitor_count },
                { label: 'Review concentration (top 3)', value: pct(rev?.review_concentration_ratio) },
                { label: 'Seasonality pattern', value: sz?.pattern },
                { label: 'Peak months', value: sz?.peak_months?.join(', ') },
              ]} />

              {!!rev?.pain_point_examples?.length && (
                <div>
                  <p className="text-[9px] font-mono text-outline uppercase tracking-wide mb-1.5">Real customer pain-language examples</p>
                  <ul className="space-y-1">
                    {rev.pain_point_examples.slice(0, 5).map((ex, i) => (
                      <li key={i} className="text-xs text-ink-variant italic border-l-2 border-black pl-2">&ldquo;{ex}&rdquo;</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!rev?.top_competitors?.length && (
                <div>
                  <p className="text-[9px] font-mono text-outline uppercase tracking-wide mb-1.5">Real top competitor listings</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-black text-[9px] font-mono text-outline uppercase">
                          <th className="text-left py-1 pr-3">Brand</th>
                          <th className="text-right py-1 pr-3">Reviews</th>
                          <th className="text-right py-1 pr-3">Rating</th>
                          <th className="text-right py-1">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rev.top_competitors.slice(0, 10).map((tc, i) => (
                          <tr key={i} className="border-b border-black/10">
                            <td className="py-1 pr-3 text-ink-variant truncate max-w-[160px]">{tc.brand}</td>
                            <td className="py-1 pr-3 text-right font-mono text-outline">{tc.reviewCount.toLocaleString()}</td>
                            <td className="py-1 pr-3 text-right font-mono text-outline">{tc.rating}</td>
                            <td className="py-1 text-right font-mono text-outline">${tc.price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-outline mt-3 italic">
        Real provider data for the broad category &ldquo;{category}&rdquo; as a whole — not specific to any individual opportunity below.
      </p>
      {!!signal.failed_providers?.length && (
        <p className="text-[10px] font-mono text-verdict-caution-text mt-1">
          Temporarily unavailable: {signal.failed_providers.join(', ')} — other sources above are unaffected.
        </p>
      )}
    </HardCard>
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
  const [networkFailure,     setNetworkFailure]     = useState(false)
  const [opportunities,      setOpportunities]      = useState<OpportunityCard[]>([])
  const [analyzingName,      setAnalyzingName]      = useState('')
  const [prevMode,           setPrevMode]           = useState<'form' | 'results'>('form')
  const [cached,             setCached]             = useState(false)
  const [cacheWeek,          setCacheWeek]          = useState('')
  const [cacheStatus,        setCacheStatus]        = useState('')
  const [resultCategoryName, setResultCategoryName] = useState('')
  const [selectedOpp,        setSelectedOpp]        = useState<string | null>(null)
  const [categorySignal,     setCategorySignal]     = useState<AggregatedSignals | null>(null)
  const [searchedQuery,      setSearchedQuery]      = useState('')

  const category        = getCategoryClientConfig(categoryId)
  const resolvedConfig  = resolvedCategoryId ? getCategoryClientConfig(resolvedCategoryId) : null
  const isAutoMode      = category.isAuto

  const activeConfig   = resolvedConfig ?? (isAutoMode ? null : category)
  const broad          = activeConfig ? activeConfig.isBroadQuery(input) : true

  function handleCategorySelect(id: string) {
    setCategoryId(id)
    setResolvedCategoryId(null)
    setInput('')
    setError('')
    setMode('form')
  }

  function selectAndScroll(name: string) {
    setSelectedOpp(name)
  }

  // Runs after React commits the expanded row, not racing the state update
  // the way a requestAnimationFrame call inside the click handler would.
  useEffect(() => {
    if (!selectedOpp) return
    document.getElementById(`opp-row-${selectedOpp}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedOpp])

  // ── discovery ──
  async function handleDiscover(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return

    if (!isAutoMode && !broad) {
      return handleAnalyze(input.trim(), 'form')
    }

    setMode('discovering')
    setError('')
    setStepIdx(0)

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
  // Wrapped in AppShell (persistent nav) on every mode — every Stitch
  // reference screen for this flow (Search Focused, Preliminary Read,
  // Pipeline) shows full nav chrome; the old app's chrome-free convention
  // was carried forward unexamined in the prior rebuild pass. See
  // docs/STITCH_NARRATIVE_REMAPPING.md §2.
  if (mode === 'classifying') {
    return <AppShell active={null}><InvestigationConsole mode="classifying" query={input} steps={CLASSIFYING_STEPS} stepIdx={stepIdx} providers={[]} /></AppShell>
  }

  // ── DISCOVERING screen ─────────────────────────────────────────
  if (mode === 'discovering') {
    return <AppShell active={null}><InvestigationConsole mode="discovering" query={input} steps={DISCOVERY_STEPS} stepIdx={stepIdx} providers={DISCOVERY_PROVIDERS} /></AppShell>
  }

  // ── ANALYZING screen ───────────────────────────────────────────
  if (mode === 'analyzing') {
    return <AppShell active={null}><InvestigationConsole mode="analyzing" query={analyzingName} steps={ANALYSIS_STEPS} stepIdx={stepIdx} providers={ANALYSIS_PROVIDERS} /></AppShell>
  }

  // ── RESULTS screen ─────────────────────────────────────────────
  if (mode === 'results') {
    const detectedConfig = resolvedCategoryId ? getCategoryClientConfig(resolvedCategoryId) : null
    const ranked = opportunities.map((opp, i) => ({ ...opp, rank: i + 1 }))

    return (
      <AppShell active={null}>
        <div className="max-w-6xl mx-auto animate-in">

          <div className="flex items-center justify-between mb-6">
            <GhostButton onClick={() => setMode('form')} className="-ml-2">
              ← New Search
            </GhostButton>
            {cached && cacheWeek && (
              <p className="text-[10px] font-mono text-outline uppercase">
                {cacheStatus === 'updated' ? 'Updated this week' : 'Cached this week'} · {cacheWeek}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b-2 border-black pb-6 mb-6">
            <div>
              <h1 className="text-headline-xl-mobile lg:text-headline-xl text-black leading-none">{input}</h1>
              <p className="text-sm text-ink-variant mt-3">
                {opportunities.length} opportunities found
                {resultCategoryName && resultCategoryName !== 'Supplements' && <> · Analyzed as {resultCategoryName}</>}
              </p>
            </div>
            {isAutoMode && detectedConfig && <DetectedCategoryBadge config={detectedConfig} />}
          </div>

          {error && <div className="mb-6"><ErrorBanner message={error} networkFailure={networkFailure} /></div>}

          <CategorySignalPanel signal={categorySignal} category={searchedQuery} />

          <OpportunityMap
            opportunities={opportunities}
            selectedName={selectedOpp}
            onSelect={selectAndScroll}
            count={opportunities.length}
          />

          <OpportunityInventory
            opportunities={ranked}
            expandedName={selectedOpp}
            onToggle={name => setSelectedOpp(prev => prev === name ? null : name)}
            onOpen={name => handleAnalyze(name, 'results')}
          />
        </div>
      </AppShell>
    )
  }

  // ── FORM ──────────────────────────────────────────────────────
  return (
    <AppShell active={null}>
      <div className="max-w-4xl mx-auto animate-in">

        <GhostLinkButton href="/dashboard" className="mb-6 -ml-2">
          ← Analyses
        </GhostLinkButton>

        <h1 className="text-headline-xl-mobile lg:text-headline-xl text-black leading-none mb-3">Discover Opportunities</h1>
        <p className="text-sm text-ink-variant mb-8">
          {isAutoMode
            ? 'Type any product idea — Open Discovery routes to the right category automatically.'
            : 'Enter a broad category to explore opportunities, or a specific idea for a direct analysis.'}
        </p>

        <CategorySelector selected={categoryId} onSelect={handleCategorySelect} />

        <form onSubmit={handleDiscover} className="space-y-5">

          <div className="mb-2">
            <HardShadowSearchTextarea
              value={input} onChange={e => setInput(e.target.value)}
              placeholder={
                isAutoMode
                  ? `Query market data — e.g. "dog joint supplement", "anti-aging serum", "viral kitchen gadget"…`
                  : `Broad: "${category.examples.broad[0]}"  →  discovers 20 opportunities\nSpecific: "${category.examples.specific[0] ?? ''}"  →  full memo`
              }
              className="text-lg h-[4.5rem]"
              maxLength={200} required autoFocus
            />
            <div className="flex items-center justify-between mt-3">
              {input.trim() && !isAutoMode ? (
                <p className="text-xs text-ink-variant flex items-center gap-1.5">
                  {broad
                    ? <><IconTarget className="w-3 h-3 text-black shrink-0" /> Broad category — will discover 20 ranked opportunities</>
                    : <><IconBeaker className="w-3 h-3 text-black shrink-0" /> Specific idea — will generate full investment memo</>}
                </p>
              ) : input.trim() && isAutoMode ? (
                <p className="text-xs text-ink-variant flex items-center gap-1.5"><IconSpark className="w-3 h-3 text-black shrink-0" /> Open Discovery — category detected automatically</p>
              ) : (
                <p className="text-xs font-mono text-outline">Costs 1 slot per full report</p>
              )}
              <span className="text-xs text-outline font-mono">{input.length}/200</span>
            </div>
          </div>

          {!isAutoMode && !broad && input.trim() && (
            <HardCard>
              <button type="button" onClick={() => setShowExtra(v => !v)}
                className="flex items-center justify-between w-full text-left group">
                <div>
                  <p className="text-sm font-medium text-black">Optional context</p>
                  <p className="text-xs text-outline mt-0.5">Audience, price point, background</p>
                </div>
                <svg className={`w-4 h-4 text-outline shrink-0 ml-4 transition-transform ${showExtra ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {showExtra && (
                <div className="mt-5 space-y-4 animate-in">
                  <div>
                    <label className="block text-sm text-ink-variant mb-1.5">Target audience</label>
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                      placeholder="e.g. women 30–45 with hormonal issues"
                      className="w-full bg-white border border-black px-4 py-2.5 text-sm text-ink placeholder-outline focus:outline-none" maxLength={100}/>
                  </div>
                  <div>
                    <label className="block text-sm text-ink-variant mb-1.5">Price point</label>
                    <select value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-white border border-black px-4 py-2.5 text-sm text-ink focus:outline-none">
                      {PRICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-ink-variant mb-1.5">Additional context</label>
                    <textarea value={extra} onChange={e => setExtra(e.target.value)}
                      placeholder="Key ingredient, competitor you've spotted, your background..."
                      className="w-full bg-white border border-black px-4 py-2.5 text-sm text-ink placeholder-outline focus:outline-none resize-none h-20" maxLength={500}/>
                  </div>
                </div>
              )}
            </HardCard>
          )}

          {error && <ErrorBanner message={error} networkFailure={networkFailure} />}

          <PrimaryButton type="submit" disabled={!input.trim()} className="w-full py-4 text-base tracking-widest">
            {isAutoMode
              ? 'Discover with Open Discovery →'
              : broad && input.trim()
                ? 'Discover Opportunities →'
                : 'Generate Investment Memo →'}
          </PrimaryButton>

          <div className="space-y-3 pt-1">
            {isAutoMode ? (
              <div>
                <p className="text-xs font-mono text-outline mb-2">Try any of these:</p>
                <div className="flex flex-wrap gap-2">
                  {category.examples.broad.map(ex => (
                    <button key={ex} type="button" onClick={() => setInput(ex)}
                      className="text-xs px-3 py-1.5 bg-white border border-black text-ink-variant hover:text-black hover:bg-surface-container-low transition-colors">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {category.examples.broad.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-outline mb-2">Broad categories (discovery mode):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.broad.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 bg-white border border-black text-ink-variant hover:text-black hover:bg-surface-container-low transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {category.examples.specific.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-outline mb-2">Specific ideas (direct analysis):</p>
                    <div className="flex flex-wrap gap-2">
                      {category.examples.specific.map(ex => (
                        <button key={ex} type="button" onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 bg-white border border-black text-ink-variant hover:text-black hover:bg-surface-container-low transition-colors">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 pt-8 border-t border-black">
          {[
            { n: '01', t: 'Type your idea', b: 'Broad category or specific concept.' },
            { n: '02', t: 'Wait ~60 seconds', b: 'Demand, virality, subscription, and manufacturing get scored.' },
            { n: '03', t: 'Get your answer', b: 'Market gaps, formula, financials, and an Entry Supported or Not Supported verdict.' },
          ].map(s => (
            <div key={s.n} className="flex gap-3">
              <span className="italic text-lg text-outline-variant shrink-0 font-mono">{s.n}</span>
              <div>
                <p className="text-sm font-medium leading-snug text-black">{s.t}</p>
                <p className="text-xs text-outline mt-0.5 leading-relaxed">{s.b}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-variant leading-relaxed mt-6">3 free analyses · 28 categories pre-loaded on the leaderboard · your analyses are added automatically.</p>
      </div>
    </AppShell>
  )
}
