'use client'

import { useState } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'

// ═══════════════════════════════════════════════════════════════
// SCORE — always recomputed from dimensions (corrects LLM math)
// ═══════════════════════════════════════════════════════════════

function computeScore(m: MemoData): { score: number; decision: BuildDecision } {
  const dimSum =
    (m.scores.demand?.score        ?? 0) +
    (m.scores.competition?.score   ?? 0) +
    (m.scores.virality?.score      ?? 0) +
    (m.scores.subscription?.score  ?? 0) +
    (m.scores.manufacturing?.score ?? 0) +
    (m.scores.defensibility?.score ?? 0)
  const score    = Math.round((dimSum / 60) * 100)
  const decision: BuildDecision =
    score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'
  return { score, decision }
}

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE — completeness of the underlying data
// ═══════════════════════════════════════════════════════════════

function computeConfidence(m: MemoData): { level: 'High' | 'Medium' | 'Low'; note: string } {
  const na  = 'N/A'
  const hit = [
    !!(m.biggest_competitor?.name                                          && m.biggest_competitor.name   !== na),
    !!(m.market_size                                                        && m.market_size               !== na),
    !!(m.gross_margin                                                       && m.gross_margin              !== na),
    !!(m.product_recommendation?.retail_price                              && m.product_recommendation.retail_price  !== na),
    !!(m.product_recommendation?.cogs_estimate                             && m.product_recommendation.cogs_estimate !== na),
    (m.product_recommendation?.formula?.length ?? 0) >= 3,
  ].filter(Boolean).length
  if (hit >= 5) return { level: 'High',   note: 'Full data coverage'           }
  if (hit >= 3) return { level: 'Medium',  note: 'Partial data — some estimates' }
  return           { level: 'Low',    note: 'Directional only'              }
}

// ═══════════════════════════════════════════════════════════════
// DECISION BLOCKS — derived from existing MemoData fields
// ═══════════════════════════════════════════════════════════════

interface DecisionBlocks { win: string; fail: string; validate: string; angle: string }

function deriveDecisionBlocks(m: MemoData): DecisionBlocks {
  const dims = (Object.entries(m.scores) as [string, { score: number; notes: string }][])
    .sort((a, b) => a[1].score - b[1].score)
  const weakest    = dims[0]
  const strongest  = dims[dims.length - 1]
  const uncertain  = dims.filter(([, v]) => v.score >= 4 && v.score <= 6)

  return {
    win:      m.market_gaps?.[0]             ?? strongest[1]?.notes ?? m.executive_summary,
    fail:     (weakest[1]?.score ?? 10) <= 5 ? weakest[1].notes : (m.scores.competition?.notes ?? 'Incumbents make differentiation expensive'),
    validate: uncertain[0]?.[1]?.notes       ?? m.build_explanation.split(/\.\s+/)[1] ?? m.build_explanation,
    angle:    m.brand_opportunities?.[0]     ?? m.market_gaps?.[1] ?? 'Build with a tight audience-first DTC brand',
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKET ACCESSIBILITY — maps competition score to plain language
// ═══════════════════════════════════════════════════════════════

function mapAccessibility(score: number) {
  return {
    density:    score <= 2 ? 'Very High — 100+ established brands'
              : score <= 4 ? 'High — 50–100 active sellers'
              : score <= 6 ? 'Medium — 20–50 brands'
              : score <= 8 ? 'Low — fewer than 20 brands'
              :              'Open — limited brand concentration',
    barriers:   score <= 3 ? 'High — capital, clinical, or distribution moat required'
              : score <= 5 ? 'Medium — formulation or positioning differentiation needed'
              : score <= 7 ? 'Low-Medium — strong brand narrative is sufficient'
              :              'Low — white-label entry viable',
    revenue:    score <= 3 ? 'Concentrated — top 3 brands control most category revenue'
              : score <= 5 ? 'Moderate — revenue spread across established tiers'
              :              'Distributed — no single dominant revenue holder',
    whitespace: score <= 3 ? 'Narrow — must outposition incumbents, not outspend them'
              : score <= 5 ? 'Moderate — specific audience or mechanism niches available'
              : score <= 7 ? 'Real — incumbents miss specific segments or price tiers'
              :              'Wide — early market with limited brand concentration',
  }
}

// ═══════════════════════════════════════════════════════════════
// EVIDENCE BADGE — source transparency on every section
// ═══════════════════════════════════════════════════════════════

type EvidenceType = 'verified' | 'ai-synthesis' | 'estimated' | 'multi-source'

const EVIDENCE_CFG: Record<EvidenceType, { label: string; cls: string }> = {
  'verified':     { label: 'Verified Signal',    cls: 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20' },
  'ai-synthesis': { label: 'AI Synthesis',       cls: 'text-zinc-400    bg-zinc-800      border-zinc-700'       },
  'estimated':    { label: 'Quantitative Model', cls: 'text-amber-400   bg-amber-400/8   border-amber-400/20'   },
  'multi-source': { label: 'Multi-Source',       cls: 'text-blue-400    bg-blue-400/8    border-blue-400/20'    },
}

function EvidenceBadge({ type }: { type: EvidenceType }) {
  const { label, cls } = EVIDENCE_CFG[type]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 tracking-wide ${cls}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-70 shrink-0"/>
      {label}
    </span>
  )
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
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - (circ * s) / 100}
          style={{ transition: 'stroke-dashoffset 1s ease' }}/>
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
    BUILD_NOW:        { label: 'Build Now',       cls: 'bg-emerald-400 text-zinc-950' },
    VALIDATE_FURTHER: { label: 'Validate First',  cls: 'bg-amber-400  text-zinc-950'  },
    SKIP:             { label: 'Pass',             cls: 'bg-red-400    text-zinc-950'  },
  }[d]
  return (
    <span className={`inline-flex items-center font-bold text-xs tracking-widest px-3 py-1 rounded-full uppercase ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function ConfidencePill({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High'
    ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
    : level === 'Medium'
      ? 'text-amber-400 border-amber-400/20 bg-amber-400/5'
      : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'
  const dot = level === 'High' ? 'bg-emerald-400' : level === 'Medium' ? 'bg-amber-400' : 'bg-zinc-500'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>
      {level} confidence · {note}
    </span>
  )
}

function DimBar({ label, score, notes, muted }: {
  label: string; score: number; notes?: string; muted?: boolean
}) {
  const [clr, bar] = score >= 8 ? ['text-emerald-400','bg-emerald-400']
                   : score >= 6 ? ['text-amber-400',   'bg-amber-400'  ]
                   :              ['text-red-400',      'bg-red-400'    ]
  const wrapCls = muted
    ? 'bg-zinc-800/30 rounded-xl p-4'
    : `rounded-xl p-4 ${
        score >= 8 ? 'bg-emerald-400/5 border border-emerald-400/15'
      : score >= 6 ? 'bg-amber-400/5  border border-amber-400/15'
      :              'bg-red-400/5    border border-red-400/15'
      }`
  return (
    <div className={wrapCls}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className={`font-mono font-bold text-base ${clr}`}>
          {score}<span className="text-zinc-600 text-xs font-normal">/10</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-700/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`}
          style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
      </div>
      {notes && !muted && (
        <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed">{notes}</p>
      )}
    </div>
  )
}

function Section({
  title, badge, evidence, defaultOpen = false, children,
}: {
  title: string; badge?: React.ReactNode; evidence?: EvidenceType;
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-semibold text-sm">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {evidence && <EvidenceBadge type={evidence} />}
          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>
      {open && <div className="px-5 pb-6 pt-4 border-t border-zinc-800 animate-in">{children}</div>}
    </div>
  )
}

function SectionIntro({ text }: { text: string }) {
  return <p className="text-xs text-zinc-500 italic mb-4 leading-relaxed">{text}</p>
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

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-semibold text-zinc-300 mt-0.5">{value}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 1. INVESTMENT THESIS — first thing users read
// ═══════════════════════════════════════════════════════════════

function InvestmentThesis({ m }: { m: MemoData }) {
  // market_thesis (new field) → fallback to executive_summary for old analyses
  const text = m.market_thesis ?? m.executive_summary
  return (
    <div className="card p-6 sm:p-7 border-zinc-700">
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="label">Investment Thesis</p>
        <EvidenceBadge type="ai-synthesis" />
      </div>
      <p className="text-base sm:text-lg text-zinc-100 leading-relaxed font-medium tracking-tight">
        {text}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 2. WHY NOW — timing rationale
// ═══════════════════════════════════════════════════════════════

function WhyNow({ m }: { m: MemoData }) {
  // why_now (new field) → fallback to demand notes for old analyses
  const text = m.why_now ?? m.scores.demand?.notes
  if (!text) return null
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="label mb-0.5">Why Now</p>
          <p className="text-[11px] text-zinc-600">The timing argument for this opportunity</p>
        </div>
        <EvidenceBadge type="ai-synthesis" />
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 3. DECISION CARD
// ═══════════════════════════════════════════════════════════════

function DecisionCard({
  m, score, decision, confidence,
}: {
  m: MemoData; score: number; decision: BuildDecision;
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }
}) {
  const glow = decision === 'BUILD_NOW'
    ? 'shadow-[0_0_48px_rgba(52,211,153,.09)]'
    : decision === 'VALIDATE_FURTHER'
      ? 'shadow-[0_0_48px_rgba(251,191,36,.07)]'
      : ''

  const reason = m.build_explanation.split(/\.\s+/)[0] + '.'

  return (
    <div className={`card p-6 sm:p-8 ${glow}`}>
      <div className="flex items-start gap-5 mb-5">
        <ScoreRing s={score} decision={decision} />
        <div className="flex-1 min-w-0">
          <VerdictBadge d={decision} />
          <h1 className="text-xl sm:text-2xl font-bold mt-3 mb-1 leading-snug">{m.category_name}</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Opportunity Rating</p>
        </div>
      </div>

      <p className="text-sm text-zinc-300 leading-relaxed border-t border-zinc-800 pt-4 mb-4">
        {reason}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConfidencePill level={confidence.level} note={confidence.note} />
        <div className="flex gap-5">
          {([['Market', m.market_size], ['LTV', m.sub_ltv], ['Margin', m.gross_margin]] as [string, string][])
            .filter(([, v]) => v && v !== 'N/A')
            .map(([l, v]) => <MetaChip key={l} label={l} value={v} />)}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 4. FOUR DECISION BLOCKS
// ═══════════════════════════════════════════════════════════════

const BLOCK_CFG = [
  { key: 'win'      as const, icon: '▲', title: 'Why this could win',        cls: 'border-emerald-400/20 bg-emerald-400/5', head: 'text-emerald-400' },
  { key: 'fail'     as const, icon: '▼', title: 'Why this could fail',       cls: 'border-red-400/20    bg-red-400/5',     head: 'text-red-400'     },
  { key: 'validate' as const, icon: '◈', title: 'Validate first',            cls: 'border-amber-400/20  bg-amber-400/5',   head: 'text-amber-400'   },
  { key: 'angle'    as const, icon: '→', title: 'Recommended entry angle',   cls: 'border-zinc-700      bg-zinc-800/60',   head: 'text-zinc-300'    },
]

function DecisionBlocks({ blocks }: { blocks: DecisionBlocks }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {BLOCK_CFG.map(b => (
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
// 5. CUSTOMER VOICE — moved up, always visible
// ═══════════════════════════════════════════════════════════════

function CustomerVoice({ m }: { m: MemoData }) {
  const cl = m.customer_language
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="label mb-0.5">Customer Voice</p>
          <p className="text-[11px] text-zinc-600">What buyers are saying — the language that drives copy and positioning</p>
        </div>
        <EvidenceBadge type="ai-synthesis" />
      </div>

      {/* Frustrations — most important */}
      <div className="space-y-2 mb-5">
        {cl.frustrations.map((q, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-zinc-600 text-xs mt-1 shrink-0">❝</span>
            <p className="text-sm text-zinc-200 leading-relaxed">{q}</p>
          </div>
        ))}
      </div>

      {/* Ad phrases — immediately actionable */}
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Ad-Ready Language</p>
      <div className="space-y-2">
        {cl.ad_phrases.map((ap, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
              <span className="text-zinc-600 text-[10px] block mb-1">They say</span>
              <span className="text-zinc-400">&ldquo;{ap.they_say}&rdquo;</span>
            </div>
            <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-3 py-2.5">
              <span className="text-emerald-600 text-[10px] block mb-1">Use in copy</span>
              <span className="text-zinc-300">{ap.use_in_copy}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desires + Fears — collapsed into a compact row */}
      <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-4 border-t border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Desires</p>
          <ul className="space-y-1.5">
            {cl.desires.map((d, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-300">
                <span className="text-emerald-400 shrink-0 mt-0.5">→</span>{d}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Fears</p>
          <ul className="space-y-1.5">
            {cl.fears.map((f, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-300">
                <span className="text-red-400/70 shrink-0 mt-0.5">✕</span>{f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 6. MARKET ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════

const DIM_LABELS: Record<string, string> = {
  demand:        'Demand',
  competition:   'Market Accessibility',
  virality:      'Virality',
  subscription:  'Subscription',
  manufacturing: 'Manufacturing',
  defensibility: 'Defensibility',
}

function MarketAccessibilityCard({ m }: { m: MemoData }) {
  const score  = m.scores.competition?.score ?? 5
  const notes  = m.scores.competition?.notes
  const access = mapAccessibility(score)

  const [colorText, colorBg, label] =
    score >= 7 ? ['text-emerald-400', 'bg-emerald-400', 'Open Market'   ] :
    score >= 5 ? ['text-amber-400',   'bg-amber-400',   'Moderate Entry'] :
    score >= 3 ? ['text-orange-400',  'bg-orange-400',  'Crowded'       ] :
                 ['text-red-400',     'bg-red-400',     'Saturated'     ]

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="label mb-1">Market Accessibility</p>
          <div className="flex items-center gap-2.5 mt-1">
            <span className={`font-mono font-bold text-xl ${colorText}`}>
              {score}<span className="text-zinc-600 text-xs font-normal">/10</span>
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorText} bg-zinc-800`}>
              {label}
            </span>
          </div>
        </div>
        <EvidenceBadge type="ai-synthesis" />
      </div>

      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-4">
        <div className={`h-full rounded-full ${colorBg}`}
          style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        {([
          ['Seller Density',         access.density   ],
          ['Entry Barriers',         access.barriers  ],
          ['Revenue Concentration',  access.revenue   ],
          ['Whitespace Assessment',  access.whitespace],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-zinc-300 leading-snug">{v}</p>
          </div>
        ))}
      </div>

      {notes && <p className="text-xs text-zinc-500 leading-relaxed">{notes}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 7. DIMENSION SCORES
//    Competition shows bar only (deep analysis is in Accessibility card above)
// ═══════════════════════════════════════════════════════════════

function DimensionScores({ scores }: { scores: MemoData['scores'] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="label">Dimension Scores</p>
        <EvidenceBadge type="ai-synthesis" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {(Object.entries(scores) as [string, { score: number; notes: string }][]).map(([key, { score, notes }]) => (
          <DimBar
            key={key}
            label={DIM_LABELS[key] ?? key}
            score={score}
            // Suppress notes for competition — full analysis lives in the Accessibility card above
            notes={key === 'competition' ? undefined : notes}
            muted={key === 'competition'}
          />
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EXPANDABLE SECTION CONTENTS
// ═══════════════════════════════════════════════════════════════

function MarketEvidenceContent({ m }: { m: MemoData }) {
  return (
    <div className="space-y-6">
      <SectionIntro text="Five documented gaps where incumbents are systematically under-serving buyers in this category." />
      <NumList items={m.market_gaps} />

      {m.biggest_competitor && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Lead Competitor</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              ['Brand',     m.biggest_competitor.name],
              ['Revenue',   m.biggest_competitor.revenue],
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
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Positioning Angles</p>
        <NumList items={m.brand_opportunities} />
      </div>
    </div>
  )
}

function DemandAnalysisContent({ m }: { m: MemoData }) {
  const { demand, virality, subscription } = m.scores
  return (
    <div className="space-y-4">
      <SectionIntro text="Signal quality across demand, social traction, and repeat purchase dynamics." />
      {[
        { label: 'Demand Signal',         dim: demand      },
        { label: 'Social & Virality',     dim: virality    },
        { label: 'Retention Mechanics',   dim: subscription },
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

function ProductDirectionContent({ m }: { m: MemoData }) {
  const rec = m.product_recommendation
  return (
    <div className="space-y-5">
      <SectionIntro text="Recommended product configuration based on gap analysis, manufacturing constraints, and margin targets." />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['Format', rec.format],
          ['Usage',  rec.dosing],
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
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Key Ingredients / Components</p>
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
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2.5">Avoid</p>
          <ul className="space-y-1.5">
            {rec.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-red-400/70 shrink-0 mt-0.5">✕</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FinancialOutlookContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  return (
    <div className="space-y-5">
      <SectionIntro text="Probability model based on comparable category launches. Assumes disciplined CAC management and subscription-first go-to-market." />
      <div className="space-y-3.5">
        <ProbBar label="Probability: reach $10k / month"  value={fp.ten_k_probability} />
        <ProbBar label="Probability: reach $100k / month" value={fp.hundred_k_probability} />
        <ProbBar label="Probability: reach $1M / month"   value={fp.one_m_probability} />
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

function KeyRisksContent({ m }: { m: MemoData }) {
  const dims   = Object.entries(m.scores) as [string, { score: number; notes: string }][]
  const weak   = dims.filter(([, v]) => v.score <= 5).sort((a, b) => a[1].score - b[1].score)
  if (weak.length === 0) return (
    <p className="text-sm text-zinc-400">No dimension scored below 6. Overall risk profile is moderate — primary risk is execution, not market structure.</p>
  )
  return (
    <div className="space-y-3">
      <SectionIntro text="Dimensions where the market structure works against you — each is a thesis-breaking risk if not addressed at launch." />
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

function MarketEntryContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  return (
    <div className="space-y-5">
      <SectionIntro text="Recommended sequence for market entry based on competitive dynamics and brand-building requirements." />
      {fp.path_to_10m && (
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Path to $10M ARR</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{fp.path_to_10m}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Positioning Angles</p>
        <NumList items={m.brand_opportunities} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT — full report assembly
// ═══════════════════════════════════════════════════════════════

export default function MemoDisplay({ memo: m }: { memo: MemoData }) {
  const { score, decision } = computeScore(m)
  const confidence          = computeConfidence(m)
  const blocks              = deriveDecisionBlocks(m)

  return (
    <div className="space-y-3 animate-in">

      {/* ── 1. INVESTMENT THESIS — first read ────────────────── */}
      <InvestmentThesis m={m} />

      {/* ── 2. WHY NOW — timing rationale ────────────────────── */}
      <WhyNow m={m} />

      {/* ── 3. DECISION CARD — verdict + score ───────────────── */}
      <DecisionCard m={m} score={score} decision={decision} confidence={confidence} />

      {/* ── 4. FOUR DECISION BLOCKS ───────────────────────────── */}
      <DecisionBlocks blocks={blocks} />

      {/* ── 5. CUSTOMER VOICE — conviction evidence ───────────── */}
      <CustomerVoice m={m} />

      {/* ── 6. MARKET ACCESSIBILITY ───────────────────────────── */}
      <MarketAccessibilityCard m={m} />

      {/* ── 7. DIMENSION SCORES ───────────────────────────────── */}
      <DimensionScores scores={m.scores} />

      {/* ── 8–13. EXPANDABLE DEEP-DIVE SECTIONS ──────────────── */}

      <Section title="Market Evidence" evidence="ai-synthesis"
        badge={<span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
          {m.market_gaps.length + m.brand_opportunities.length}
        </span>}>
        <MarketEvidenceContent m={m} />
      </Section>

      <Section title="Demand Analysis" evidence="ai-synthesis">
        <DemandAnalysisContent m={m} />
      </Section>

      <Section title="Product Direction" evidence="ai-synthesis">
        <ProductDirectionContent m={m} />
      </Section>

      <Section title="Financial Outlook" evidence="estimated">
        <FinancialOutlookContent m={m} />
      </Section>

      <Section title="Key Risks" evidence="ai-synthesis">
        <KeyRisksContent m={m} />
      </Section>

      <Section title="Market Entry" evidence="ai-synthesis">
        <MarketEntryContent m={m} />
      </Section>

    </div>
  )
}
