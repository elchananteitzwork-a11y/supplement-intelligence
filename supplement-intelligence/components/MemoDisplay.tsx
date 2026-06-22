'use client'

import { useState } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

// Always compute from dimension scores — corrects any LLM calculation errors.
function computeScore(m: MemoData): { score: number; decision: BuildDecision } {
  const dimSum =
    (m.scores.demand?.score        ?? 0) +
    (m.scores.competition?.score   ?? 0) +
    (m.scores.virality?.score      ?? 0) +
    (m.scores.subscription?.score  ?? 0) +
    (m.scores.manufacturing?.score ?? 0) +
    (m.scores.defensibility?.score ?? 0)
  const score    = Math.round((dimSum / 60) * 100)
  const decision: BuildDecision = score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'
  return { score, decision }
}

function computeConfidence(m: MemoData): { level: 'High' | 'Medium' | 'Low'; note: string } {
  const na = 'N/A'
  const checks = [
    !!(m.biggest_competitor?.name   && m.biggest_competitor.name   !== na),
    !!(m.market_size                && m.market_size               !== na),
    !!(m.gross_margin               && m.gross_margin              !== na),
    !!(m.product_recommendation?.retail_price  && m.product_recommendation.retail_price  !== na),
    !!(m.product_recommendation?.cogs_estimate && m.product_recommendation.cogs_estimate !== na),
    (m.product_recommendation?.formula?.length ?? 0) >= 3,
  ]
  const filled = checks.filter(Boolean).length
  const ratio  = filled / checks.length
  if (ratio >= 0.83) return { level: 'High',   note: 'All key data fields verified' }
  if (ratio >= 0.5)  return { level: 'Medium',  note: 'Some fields estimated by AI' }
  return               { level: 'Low',    note: 'Results directional — limited data' }
}

interface DecisionBlocks {
  win:      string
  fail:     string
  validate: string
  angle:    string
}

function deriveDecisionBlocks(m: MemoData): DecisionBlocks {
  const dims = (Object.entries(m.scores) as [string, { score: number; notes: string }][])
    .sort((a, b) => a[1].score - b[1].score)

  const weakest   = dims[0]
  const strongest = dims[dims.length - 1]
  const uncertain = dims.filter(([, v]) => v.score >= 4 && v.score <= 6)

  const win = m.market_gaps?.[0]
    ?? strongest[1]?.notes
    ?? m.executive_summary

  const fail = (weakest[1]?.score ?? 10) <= 5
    ? weakest[1].notes
    : m.scores.competition?.notes
    ?? 'Competition from established brands limits margin for error'

  const validate = uncertain.length > 0
    ? uncertain[0][1].notes
    : (m.build_explanation.split(/\.\s+/)[1] ?? m.build_explanation)

  const angle = m.brand_opportunities?.[0]
    ?? m.market_gaps?.[1]
    ?? 'Build with a tight audience-first DTC brand and a clinical proof angle'

  return { win, fail, validate, angle }
}

interface Accessibility {
  density:   string
  barrier:   string
  whitespace: string
}

function deriveAccessibility(score: number): Accessibility {
  const density =
    score <= 2 ? 'Very High — 100+ competing brands' :
    score <= 4 ? 'High — 50–100 brands on shelf' :
    score <= 6 ? 'Medium — 20–50 brands' :
    score <= 8 ? 'Low — under 20 brands' :
                 'Very Low — open market'

  const barrier =
    score <= 3 ? 'High — capital or clinical credibility required' :
    score <= 5 ? 'Medium — formulation or design differentiation needed' :
    score <= 7 ? 'Low-Medium — positioning moat sufficient' :
                 'Low — white-label friendly'

  const whitespace =
    score <= 3 ? 'Narrow — incumbents own the revenue; you must outposition them, not outspend' :
    score <= 5 ? 'Moderate — niches exist but require sharp audience focus or mechanism ownership' :
    score <= 7 ? 'Real — established players miss specific audiences or price tiers' :
                 'Wide — early market with limited brand concentration'

  return { density, barrier, whitespace }
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function ScoreRing({ s, decision }: { s: number; decision: BuildDecision }) {
  const r    = 44
  const circ = 2 * Math.PI * r
  const c    = decision === 'BUILD_NOW' ? '#34d399' : decision === 'VALIDATE_FURTHER' ? '#fbbf24' : '#f87171'
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="#27272a" strokeWidth="7"/>
        <circle cx="52" cy="52" r={r} fill="none" stroke={c} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * s) / 100}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-2xl leading-none" style={{ color: c }}>{s}</span>
        <span className="text-zinc-600 text-[10px] mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

function VerdictBadge({ d }: { d: BuildDecision }) {
  const cfg = {
    BUILD_NOW:        { label: 'BUILD NOW',       cls: 'bg-emerald-400 text-zinc-950' },
    VALIDATE_FURTHER: { label: 'VALIDATE FIRST',  cls: 'bg-amber-400  text-zinc-950' },
    SKIP:             { label: 'SKIP',             cls: 'bg-red-400    text-zinc-950' },
  }[d]
  return (
    <span className={`inline-flex items-center font-bold text-xs tracking-widest px-3 py-1 rounded-full uppercase ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function ConfidenceBadge({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
            : level === 'Medium' ? 'text-amber-400 border-amber-400/20 bg-amber-400/5'
            : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'
  const dot = level === 'High' ? 'bg-emerald-400' : level === 'Medium' ? 'bg-amber-400' : 'bg-zinc-500'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {level} confidence · {note}
    </span>
  )
}

function DimBar({
  label, score, notes, accent,
}: { label: string; score: number; notes?: string; accent?: boolean }) {
  const [color, track] =
    score >= 8 ? ['bg-emerald-400', 'text-emerald-400'] :
    score >= 6 ? ['bg-amber-400',   'text-amber-400']   :
                 ['bg-red-400',     'text-red-400']
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-zinc-800/80 border border-zinc-700' : 'bg-zinc-800/50'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className={`font-mono font-bold text-base ${track}`}>
          {score}<span className="text-zinc-600 text-xs font-normal">/10</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
      </div>
      {notes && <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed">{notes}</p>}
    </div>
  )
}

function Section({
  title, badge, defaultOpen = false, children,
}: { title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-sm">{title}</span>
          {badge}
        </div>
        <svg className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div className="px-5 pb-6 pt-4 border-t border-zinc-800 animate-in">{children}</div>}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">{n}</span>
}

function NumList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="font-mono text-zinc-600 shrink-0 w-4 text-right mt-px">{i + 1}</span>
          <span className="text-zinc-300 leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function ProbBar({ label, value }: { label: string; value: string }) {
  const pct = parseInt(value, 10) || 0
  const c   = pct >= 60 ? 'bg-emerald-400' : pct >= 30 ? 'bg-amber-400' : 'bg-zinc-600'
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%`, transition: 'width .7s ease' }}/>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DECISION CARD — first screen
// ═══════════════════════════════════════════════════════════════

function DecisionCard({
  m, score, decision, confidence,
}: {
  m:          MemoData
  score:      number
  decision:   BuildDecision
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }
}) {
  const glowCls = decision === 'BUILD_NOW'
    ? 'shadow-[0_0_40px_rgba(52,211,153,.10)]'
    : decision === 'VALIDATE_FURTHER'
      ? 'shadow-[0_0_40px_rgba(251,191,36,.08)]'
      : ''

  const reason = m.build_explanation.split(/\.\s+/)[0] + '.'

  return (
    <div className={`card p-6 sm:p-8 ${glowCls}`}>
      {/* top row: verdict + score */}
      <div className="flex items-start gap-5 mb-5">
        <ScoreRing s={score} decision={decision} />
        <div className="flex-1 min-w-0">
          <VerdictBadge d={decision} />
          <h1 className="text-xl sm:text-2xl font-bold mt-3 mb-1 leading-snug">{m.category_name}</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest">
            {decision === 'BUILD_NOW' ? 'Opportunity Score' : 'Opportunity Score'}
          </p>
        </div>
      </div>

      {/* one-liner reason */}
      <p className="text-sm text-zinc-300 leading-relaxed border-t border-zinc-800 pt-4 mb-4">
        {reason}
      </p>

      {/* bottom row: confidence + key metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConfidenceBadge level={confidence.level} note={confidence.note} />
        <div className="flex gap-4 text-right">
          {([
            ['Market', m.market_size],
            ['LTV',    m.sub_ltv],
            ['Margin', m.gross_margin],
          ] as [string, string][]).filter(([, v]) => v && v !== 'N/A').map(([l, v]) => (
            <div key={l}>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{l}</p>
              <p className="text-xs font-semibold text-zinc-300 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 4 DECISION BLOCKS
// ═══════════════════════════════════════════════════════════════

const BLOCKS = [
  {
    key:    'win' as const,
    icon:   '▲',
    title:  'Why this could win',
    color:  'emerald' as const,
    cls:    'border-emerald-400/20 bg-emerald-400/5',
    head:   'text-emerald-400',
  },
  {
    key:    'fail' as const,
    icon:   '▼',
    title:  'Why this could fail',
    color:  'red' as const,
    cls:    'border-red-400/20 bg-red-400/5',
    head:   'text-red-400',
  },
  {
    key:    'validate' as const,
    icon:   '◈',
    title:  'Validate first',
    color:  'amber' as const,
    cls:    'border-amber-400/20 bg-amber-400/5',
    head:   'text-amber-400',
  },
  {
    key:    'angle' as const,
    icon:   '→',
    title:  'Best entry angle',
    color:  'zinc' as const,
    cls:    'border-zinc-700 bg-zinc-800/60',
    head:   'text-zinc-300',
  },
]

function DecisionBlocks({ blocks }: { blocks: DecisionBlocks }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {BLOCKS.map(b => (
        <div key={b.key} className={`rounded-xl border p-4 ${b.cls}`}>
          <div className={`flex items-center gap-1.5 mb-2 ${b.head}`}>
            <span className="text-xs font-bold">{b.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">{b.title}</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">{blocks[b.key]}</p>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MARKET ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════

function MarketAccessibilityCard({
  score, notes, accessibility,
}: {
  score:        number
  notes?:       string
  accessibility: Accessibility
}) {
  const [color, label] =
    score >= 7 ? ['text-emerald-400 bg-emerald-400', 'Open'] :
    score >= 5 ? ['text-amber-400 bg-amber-400',     'Moderate'] :
    score >= 3 ? ['text-orange-400 bg-orange-400',   'Crowded'] :
                 ['text-red-400 bg-red-400',          'Saturated']

  const textColor = color.split(' ')[0]
  const bgColor   = color.split(' ')[1]

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="label mb-1">Market Accessibility</p>
          <p className={`text-lg font-bold font-mono ${textColor}`}>
            {score}<span className="text-zinc-600 text-xs font-normal">/10</span>
            <span className={`ml-2 text-xs font-sans font-semibold px-2 py-0.5 rounded-full ${textColor} bg-current/10`}>
              {label}
            </span>
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="h-2 w-32 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bgColor}`}
              style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">0 = dominated · 10 = open</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        {[
          { l: 'Seller Density',          v: accessibility.density },
          { l: 'Entry Barriers',          v: accessibility.barrier },
          { l: 'Revenue Concentration',   v: score <= 4 ? 'High — top brands own most revenue' : score <= 6 ? 'Medium — revenue spread across tiers' : 'Low — no single dominant player' },
        ].map(({ l, v }) => (
          <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-zinc-300 leading-snug">{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-800/40 rounded-lg p-3 border-l-2 border-zinc-600">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Whitespace assessment</p>
        <p className="text-xs text-zinc-300 leading-relaxed">{accessibility.whitespace}</p>
      </div>

      {notes && (
        <p className="text-xs text-zinc-500 mt-3 leading-relaxed">{notes}</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DIMENSION SCORES (with "competition" → "Market Accessibility")
// ═══════════════════════════════════════════════════════════════

const DIM_LABELS: Record<string, string> = {
  demand:        'Demand',
  competition:   'Market Accessibility',
  virality:      'Virality',
  subscription:  'Subscription',
  manufacturing: 'Manufacturing',
  defensibility: 'Defensibility',
}

function DimensionScores({ scores }: { scores: MemoData['scores'] }) {
  const entries = Object.entries(scores) as [string, { score: number; notes: string }][]
  return (
    <div className="card p-5">
      <p className="label mb-4">All Dimensions</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {entries.map(([key, { score, notes }]) => (
          <DimBar
            key={key}
            label={DIM_LABELS[key] ?? key}
            score={score}
            notes={notes}
            accent={key === 'competition'}
          />
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SECTION CONTENTS
// ═══════════════════════════════════════════════════════════════

function EvidenceContent({ m }: { m: MemoData }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label mb-3">Market Gaps</p>
        <NumList items={m.market_gaps} />
      </div>
      {m.biggest_competitor && (
        <div>
          <p className="label mb-3">Lead Competitor</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              ['Brand',    m.biggest_competitor.name],
              ['Revenue',  m.biggest_competitor.revenue],
              ['Their Gap', m.biggest_competitor.gap],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">{l}</p>
                <p className="text-sm text-zinc-300">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="label mb-3">Brand Positioning Angles</p>
        <NumList items={m.brand_opportunities} />
      </div>
    </div>
  )
}

function MarketSignalsContent({ m }: { m: MemoData }) {
  const { demand, virality, subscription } = m.scores
  return (
    <div className="space-y-4">
      {[
        { label: 'Demand Signal',   dim: demand,       metric: '—' },
        { label: 'Virality Signal', dim: virality,     metric: '—' },
        { label: 'Subscription',    dim: subscription, metric: '—' },
      ].map(({ label, dim }) => (
        <div key={label} className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
            <span className={`font-mono text-sm font-bold ${
              dim.score >= 8 ? 'text-emerald-400' : dim.score >= 6 ? 'text-amber-400' : 'text-red-400'
            }`}>{dim.score}/10</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{dim.notes}</p>
        </div>
      ))}
    </div>
  )
}

function CustomerLanguageContent({ m }: { m: MemoData }) {
  const cl = m.customer_language
  return (
    <div className="space-y-6">
      <div>
        <p className="label mb-3">Frustrations</p>
        <div className="space-y-2">
          {cl.frustrations.map((q, i) => (
            <div key={i} className="bg-zinc-800/50 rounded-lg px-4 py-3 text-sm text-zinc-300 border-l-2 border-zinc-600">
              &ldquo;{q}&rdquo;
            </div>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <p className="label mb-3">Desires</p>
          <ul className="space-y-2">
            {cl.desires.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-emerald-400 shrink-0 mt-0.5">→</span>{d}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label mb-3">Fears</p>
          <ul className="space-y-2">
            {cl.fears.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-red-400 shrink-0 mt-0.5">✕</span>{f}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <p className="label mb-3">Ad-Ready Phrases</p>
        <div className="space-y-2">
          {cl.ad_phrases.map((ap, i) => (
            <div key={i} className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="bg-zinc-800/50 rounded-lg px-4 py-3">
                <span className="text-zinc-600 text-xs block mb-1">They say</span>
                <span className="text-zinc-400">&ldquo;{ap.they_say}&rdquo;</span>
              </div>
              <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-4 py-3">
                <span className="text-emerald-500 text-xs block mb-1">Use in copy</span>
                <span className="text-zinc-300">{ap.use_in_copy}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProductRecommendationContent({ m }: { m: MemoData }) {
  const rec = m.product_recommendation
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['Format', rec.format],
          ['Dosing', rec.dosing],
          ['COGS',   rec.cogs_estimate],
          ['Retail', rec.retail_price],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-xs text-zinc-500 mb-1">{l}</p>
            <p className="text-xs text-zinc-300 leading-snug">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="label mb-3">Formula / Key Ingredients</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 w-[30%]">Ingredient</th>
                <th className="text-left py-2.5 px-3 w-[14%]">Dose</th>
                <th className="text-left py-2.5 px-3">Role</th>
                <th className="text-center py-2.5 px-3 w-[14%]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rec.formula.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                  <td className="py-3 px-3 font-medium text-sm">{row.ingredient}</td>
                  <td className="py-3 px-3 font-mono text-emerald-400 text-xs">{row.dose}</td>
                  <td className="py-3 px-3 text-zinc-400 text-xs leading-relaxed">{row.role}</td>
                  <td className="py-3 px-3 text-center text-sm">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rec.avoid?.length > 0 && (
        <div>
          <p className="label mb-2.5">Avoid</p>
          <ul className="space-y-1.5">
            {rec.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-red-400 shrink-0 mt-0.5">✕</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FinancialsContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  return (
    <div className="space-y-5">
      <div className="space-y-3.5">
        <ProbBar label="Reach $10k / month"  value={fp.ten_k_probability} />
        <ProbBar label="Reach $100k / month" value={fp.hundred_k_probability} />
        <ProbBar label="Reach $1M / month"   value={fp.one_m_probability} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([
          ['Gross Margin',     fp.gross_margin],
          ['Net at Scale',     fp.net_margin_at_scale],
          ['Subscription LTV', fp.subscription_ltv],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-zinc-500 mb-1">{l}</p>
            <p className="font-semibold text-sm">{v ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function LaunchStrategyContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/50 rounded-lg p-4">
        <p className="label mb-2">Path to $10M ARR</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{fp.path_to_10m}</p>
      </div>
      <div>
        <p className="label mb-3">Positioning Angles</p>
        <NumList items={m.brand_opportunities} />
      </div>
    </div>
  )
}

function RisksContent({ m }: { m: MemoData }) {
  const dims = Object.entries(m.scores) as [string, { score: number; notes: string }][]
  const weak = dims
    .filter(([, v]) => v.score <= 5)
    .sort((a, b) => a[1].score - b[1].score)

  if (weak.length === 0) {
    return (
      <p className="text-sm text-zinc-400">No dimensions scored below 6 — overall risk is moderate.</p>
    )
  }

  return (
    <div className="space-y-3">
      {weak.map(([key, { score, notes }]) => (
        <div key={key} className="bg-red-400/5 border border-red-400/15 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              {DIM_LABELS[key] ?? key} Risk
            </p>
            <span className="font-mono text-sm font-bold text-red-400">{score}/10</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{notes}</p>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════

export default function MemoDisplay({ memo: m }: { memo: MemoData }) {
  const { score, decision } = computeScore(m)
  const confidence  = computeConfidence(m)
  const blocks      = deriveDecisionBlocks(m)
  const access      = deriveAccessibility(m.scores.competition?.score ?? 5)

  return (
    <div className="space-y-3 animate-in">

      {/* ─── 1. DECISION CARD ─────────────────────────────────── */}
      <DecisionCard m={m} score={score} decision={decision} confidence={confidence} />

      {/* ─── 2. FOUR DECISION BLOCKS ──────────────────────────── */}
      <DecisionBlocks blocks={blocks} />

      {/* ─── 3. MARKET ACCESSIBILITY ──────────────────────────── */}
      <MarketAccessibilityCard
        score={m.scores.competition?.score ?? 5}
        notes={m.scores.competition?.notes}
        accessibility={access}
      />

      {/* ─── 4. ALL DIMENSION SCORES ──────────────────────────── */}
      <DimensionScores scores={m.scores} />

      {/* ─── 5. EXPANDABLE FULL REPORT ────────────────────────── */}
      <Section title="Evidence" badge={<Count n={m.market_gaps.length + m.brand_opportunities.length} />}>
        <EvidenceContent m={m} />
      </Section>

      <Section title="Market Signals">
        <MarketSignalsContent m={m} />
      </Section>

      <Section title="Customer Language">
        <CustomerLanguageContent m={m} />
      </Section>

      <Section title="Product Recommendation">
        <ProductRecommendationContent m={m} />
      </Section>

      <Section title="Financials">
        <FinancialsContent m={m} />
      </Section>

      <Section title="Risks">
        <RisksContent m={m} />
      </Section>

      <Section title="Launch Strategy">
        <LaunchStrategyContent m={m} />
      </Section>

    </div>
  )
}
