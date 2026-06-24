'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'
import {
  IconTrendUp, IconTrendDown, IconBeaker, IconArrowRight, IconX, IconAlert,
} from '@/components/icons'

// ── Manufacturing Intelligence local types (mirrors /api/manufacturing response) ──
interface MfgEstimate {
  product:            string
  category:           string
  unit_cost:          { low: number; high: number; currency: string }
  moq:                { low: number; high: number; unit: string }
  supplier_count:     { estimate: number; confidence: 'High' | 'Medium' | 'Low' }
  top_supplier_rating: number | null
  lead_time_days:     { low: number; high: number }
  complexity:         string
  confidence:         number
  confidence_label:   'High' | 'Medium' | 'Low'
  data_source:        string
  notes:              string
}

// ═══════════════════════════════════════════════════════════════
// SCORE — always recomputed from dimensions (corrects LLM math)
// Phase 2: 5-dimension formula (demand + virality + subscription +
// manufacturing + defensibility) / 50. Old analyses that still carry
// a competition score use the legacy 6-dim / 60 formula automatically.
// UNCHANGED from prior implementation — presentation-only redesign.
// ═══════════════════════════════════════════════════════════════

function computeScore(m: MemoData): { score: number; decision: BuildDecision } {
  const hasLegacyCompetition = typeof m.scores.competition?.score === 'number'
  const dimSum =
    (m.scores.demand?.score        ?? 0) +
    (m.scores.virality?.score      ?? 0) +
    (m.scores.subscription?.score  ?? 0) +
    (m.scores.manufacturing?.score ?? 0) +
    (m.scores.defensibility?.score ?? 0) +
    (hasLegacyCompetition ? (m.scores.competition!.score) : 0)
  const maxDim = hasLegacyCompetition ? 60 : 50
  const score    = Math.round((dimSum / maxDim) * 100)
  const decision: BuildDecision =
    score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'
  return { score, decision }
}

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

interface DecisionBlocksData { win: string; fail: string; validate: string; angle: string }

function deriveDecisionBlocks(m: MemoData): DecisionBlocksData {
  const dims = (Object.entries(m.scores) as [string, { score: number; notes: string }][])
    .filter(([key]) => key !== 'competition')
    .sort((a, b) => a[1].score - b[1].score)
  const weakest   = dims[0]
  const strongest = dims[dims.length - 1]
  const uncertain = dims.filter(([, v]) => v.score >= 4 && v.score <= 6)

  const failNote = (weakest?.[1]?.score ?? 10) <= 5
    ? weakest[1].notes
    : (m.market_saturation?.competitive_intensity?.split(/\.\s+/)[0] ?? 'Market is more competitive than it appears — differentiation must be very specific.')

  return {
    win:      m.market_gaps?.[0]         ?? strongest?.[1]?.notes ?? m.executive_summary,
    fail:     failNote,
    validate: uncertain[0]?.[1]?.notes   ?? m.build_explanation.split(/\.\s+/)[1] ?? m.build_explanation,
    angle:    m.brand_opportunities?.[0] ?? m.market_gaps?.[1]   ?? 'Build with a tight audience-first DTC brand',
  }
}

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
// EVIDENCE BADGE — source transparency on every section (unchanged)
// ═══════════════════════════════════════════════════════════════

type EvidenceType = 'verified' | 'ai-synthesis' | 'estimated' | 'multi-source'

const EVIDENCE_CFG: Record<EvidenceType, { label: string; cls: string }> = {
  'verified':     { label: 'Verified Signal',    cls: 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20' },
  'ai-synthesis': { label: 'AI Synthesis',       cls: 'text-zinc-400    bg-white/[0.06]      border-white/[0.1]'       },
  'estimated':    { label: 'Quantitative Model', cls: 'text-amber-400   bg-amber-400/8   border-amber-400/20'   },
  'multi-source': { label: 'Multi-Source',       cls: 'text-blue-400    bg-blue-400/8    border-blue-400/20'    },
}

function EvidenceBadge({ type }: { type: EvidenceType }) {
  const { label, cls } = EVIDENCE_CFG[type]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 tracking-wide shrink-0 ${cls}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-70 shrink-0"/>
      {label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function useCountUp(target: number, durationMs = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return val
}

// instrument-dial score gauge — semi-circular arc with tick marks, in the
// register of a precision meter rather than a generic donut/progress ring.
function ScoreRing({ s, decision, size = 156 }: { s: number; decision: BuildDecision; size?: number }) {
  const animated = useCountUp(s)
  const w  = size
  const h  = Math.round(size / 2) + 16
  const m  = 16
  const cx = w / 2
  const cy = h - m
  const r  = w / 2 - m
  const c  = decision === 'BUILD_NOW' ? '#34d399' : decision === 'VALIDATE_FURTHER' ? '#fbbf24' : '#f87171'
  const pathLen = Math.PI * r
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const ticks = [0, 20, 40, 60, 80, 100]

  return (
    <div className="relative shrink-0" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {ticks.map(t => {
          const theta = ((180 - (t / 100) * 180) * Math.PI) / 180
          const x1 = cx + (r + 4) * Math.cos(theta)
          const y1 = cy - (r + 4) * Math.sin(theta)
          const x2 = cx + (r + 9) * Math.cos(theta)
          const y2 = cy - (r + 9) * Math.sin(theta)
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3f3f46" strokeWidth={1.5} strokeLinecap="round" />
        })}
        <path d={arcPath} fill="none" stroke="#27272a" strokeWidth={6} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke={c} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen - (pathLen * s) / 100}
          style={{ transition: 'stroke-dashoffset 1.1s var(--ease-premium, ease)' }} />
      </svg>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: cy - r * 0.62 }}>
        <span className="font-serif font-medium leading-none" style={{ color: c, fontSize: w * 0.23 }}>{animated}</span>
        <span className="text-zinc-600 text-[10px] mt-1 tracking-wide">/ 100</span>
      </div>
    </div>
  )
}

function VerdictBadge({ d }: { d: BuildDecision }) {
  const cfg = {
    BUILD_NOW:        { label: 'Build Now',      cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25', dot: 'bg-emerald-400' },
    VALIDATE_FURTHER: { label: 'Validate First', cls: 'text-amber-400  bg-amber-400/10  border-amber-400/25',   dot: 'bg-amber-400'  },
    SKIP:             { label: 'Pass',           cls: 'text-red-400    bg-red-400/10    border-red-400/25',     dot: 'bg-red-400'    },
  }[d]
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-[11px] tracking-[0.16em] px-3 py-1.5 rounded-full border uppercase ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function ConfidencePill({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High'
    ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
    : level === 'Medium'
      ? 'text-amber-400 border-amber-400/20 bg-amber-400/5'
      : 'text-zinc-500 border-white/[0.1] bg-white/[0.04]'
  const dot = level === 'High' ? 'bg-emerald-400' : level === 'Medium' ? 'bg-amber-400' : 'bg-zinc-500'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>
      {level} confidence · {note}
    </span>
  )
}

// signal-strength indicator — 3 ascending bars, filled by level
function SignalBars({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const filled = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  const color  = level === 'Strong' ? 'bg-emerald-400' : level === 'Moderate' ? 'bg-amber-400' : 'bg-zinc-600'
  return (
    <div className="flex items-end gap-0.5 h-3.5 shrink-0">
      {[0,1,2].map(i => (
        <span key={i}
          className={`w-1 rounded-sm ${i < filled ? color : 'bg-white/[0.12]'}`}
          style={{ height: `${40 + i * 30}%` }}
        />
      ))}
    </div>
  )
}

// ── Pulse Rings — a TikTok-flavored "engagement ping" in place of generic
// bars, reserved for the virality row specifically (it's the one signal
// that's genuinely social/platform-native rather than a market metric).
function PulseRings({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const color = level === 'Strong' ? '#34d399' : level === 'Moderate' ? '#fbbf24' : '#71717a'
  const rings = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  return (
    <div className="relative w-4 h-4 shrink-0 grid place-items-center">
      {Array.from({ length: rings }).map((_, i) => (
        <span key={i} className="absolute rounded-full border"
          style={{
            borderColor: color, width: '60%', height: '60%',
            animation: 'tiktokPulse 2.2s ease-out infinite', animationDelay: `${i * 0.45}s`,
          }} />
      ))}
      <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    </div>
  )
}

// ── Dimension Radar — the shape of an opportunity, not five separate
// numbers you have to compare by hand.
function DimensionRadar({ dims, color }: { dims: [string, number][]; color: string }) {
  const cx = 150, cy = 150, maxR = 100
  const n = dims.length
  const angle = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n)
  const pointAt = (i: number, frac: number): [number, number] => {
    const a = angle(i)
    return [cx + maxR * frac * Math.cos(a), cy + maxR * frac * Math.sin(a)]
  }
  const rings = [0.25, 0.5, 0.75, 1]
  const dataPoints = dims.map(([, score], i) => pointAt(i, score / 10))

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[300px] mx-auto">
      {rings.map(f => (
        <polygon key={f} points={dims.map((_, i) => pointAt(i, f).join(',')).join(' ')}
          fill="none" stroke="#ffffff" strokeOpacity={0.07} />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pointAt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#ffffff" strokeOpacity={0.09} />
      })}
      <polygon points={dataPoints.map(p => p.join(',')).join(' ')}
        fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2}
        style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'radarDrawIn .7s var(--ease-premium, ease) both' }} />
      {dataPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill={color} />)}
      {dims.map(([label, score], i) => {
        const [rawX, ly] = pointAt(i, 1.22)
        const lx = Math.min(250, Math.max(50, rawX)) // clamp so centered labels never clip the viewBox edge
        return (
          <g key={label}>
            <text x={lx} y={ly - 4} textAnchor="middle" style={{ fill: '#d4d4d8', fontSize: 11, fontWeight: 600 }}>{label}</text>
            <text x={lx} y={ly + 11} textAnchor="middle" style={{ fill: '#71717a', fontSize: 10, fontFamily: 'var(--font-jbmono)' }}>{score}/10</text>
          </g>
        )
      })}
    </svg>
  )
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


function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-semibold text-zinc-300 mt-0.5 font-mono">{value}</p>
    </div>
  )
}

function SectionIntro({ text }: { text: string }) {
  return <p className="text-xs text-zinc-500 italic mb-4 leading-relaxed">{text}</p>
}

// ═══════════════════════════════════════════════════════════════
// STICKY SECTION NAV
// ═══════════════════════════════════════════════════════════════

const NAV_SECTIONS = [
  { id: 'market-intelligence',       label: 'Market' },
  { id: 'consumer-intelligence',     label: 'Consumer' },
  { id: 'manufacturing-intelligence', label: 'Manufacturing' },
  { id: 'competitive-landscape',     label: 'Competitive' },
  { id: 'financial-outlook',         label: 'Financial' },
  { id: 'launch-strategy',           label: 'Launch' },
  { id: 'risk-assessment',           label: 'Risk' },
]

// mobile/tablet — horizontal sticky tab strip under the masthead
function SectionNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <div className="section-nav -mt-px lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto py-2.5 no-scrollbar">
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`nav-pill ${active === s.id ? 'nav-pill-active' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// desktop — vertical rail tabs, persistent alongside the document (PitchBook/Palantir
// register: clicking switches the content pane, it does not scroll a long page)
function RailNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="space-y-0.5">
      <p className="label mb-2.5">Sections</p>
      {NAV_SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left text-[13px] py-1.5 pl-3 border-l-2 transition-colors ${
            active === s.id
              ? 'border-brass text-zinc-50 font-medium'
              : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.2]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}

// ── Ticker strip — dense Bloomberg-register header band. The first thing
// a viewer sees: financial-terminal digits, not a webpage hero.
function TickerStrip({
  score, decision, confidence, m,
}: {
  score: number; decision: BuildDecision
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }; m: MemoData
}) {
  const c = decision === 'BUILD_NOW' ? 'text-emerald-400' : decision === 'VALIDATE_FURTHER' ? 'text-amber-400' : 'text-red-400'
  const items: [string, string, boolean][] = [
    ['SCORE', `${score}/100`, true],
    ['VERDICT', decision.replace(/_/g, ' '), true],
    ['CONFIDENCE', confidence.level.toUpperCase(), false],
    ['MARKET', m.market_size, false],
    ['LTV', m.sub_ltv, false],
    ['MARGIN', m.gross_margin, false],
  ].filter(([, v]) => v && v !== 'N/A') as [string, string, boolean][]

  return (
    <div className="flex items-stretch overflow-x-auto no-scrollbar rounded-md border border-white/[0.08] divide-x divide-white/[0.08] bg-[#0a0a0c] font-mono">
      {items.map(([l, v, accent]) => (
        <div key={l} className="flex items-center gap-2 px-4 py-2.5 shrink-0">
          <span className="text-zinc-600 text-[10px] tracking-wider">{l}</span>
          <span className={`text-xs font-semibold uppercase ${accent ? c : 'text-zinc-200'}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MASTHEAD — document header. Establishes "dossier", not "AI output".
// ═══════════════════════════════════════════════════════════════

function Masthead({
  m, score, decision, confidence, generatedAt,
}: {
  m: MemoData; score: number; decision: BuildDecision;
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }; generatedAt?: string
}) {
  const glow = decision === 'BUILD_NOW'
    ? 'shadow-[0_0_60px_rgba(52,211,153,.08)]'
    : decision === 'VALIDATE_FURTHER'
      ? 'shadow-[0_0_60px_rgba(251,191,36,.06)]'
      : ''
  const dateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className={`card-premium p-6 sm:p-9 ${glow}`}>
      <div className="flex items-center justify-between mb-6 pb-5 border-b border-white/[0.06]">
        <span className="eyebrow text-[13px]">Investment Dossier</span>
        <span className="text-[10px] font-medium text-zinc-600 font-mono uppercase tracking-wider">
          {dateLabel ? `Prepared ${dateLabel}` : 'Confidential'}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-7">
        <ScoreRing s={score} decision={decision} />
        <div className="flex-1 min-w-0">
          <VerdictBadge d={decision} />
          <h1 className="font-serif text-2xl sm:text-[1.9rem] font-medium mt-4 mb-1.5 leading-[1.15] tracking-tight">{m.category_name}</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Opportunity Rating</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mt-7 pt-5 border-t border-white/[0.06] lg:hidden">
        <ConfidencePill level={confidence.level} note={confidence.note} />
        <div className="flex gap-6">
          {([['Market', m.market_size], ['LTV', m.sub_ltv], ['Margin', m.gross_margin]] as [string, string][])
            .filter(([, v]) => v && v !== 'N/A')
            .map(([l, v]) => <MetaChip key={l} label={l} value={v} />)}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AT-A-GLANCE RAIL — desktop-only persistent inspector panel. Keeps the
// verdict, score, and key facts in view while scrolling through the deep
// dive sections below — the thing a centered single column can't do.
// ═══════════════════════════════════════════════════════════════

function AtAGlanceRail({
  m, score, decision, confidence,
}: {
  m: MemoData; score: number; decision: BuildDecision
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }
}) {
  const c = decision === 'BUILD_NOW' ? 'text-emerald-400' : decision === 'VALIDATE_FURTHER' ? 'text-amber-400' : 'text-red-400'
  const facts = ([['Market', m.market_size], ['LTV', m.sub_ltv], ['Margin', m.gross_margin]] as [string, string][])
    .filter(([, v]) => v && v !== 'N/A')

  return (
    <div className="card-premium p-5">
      <p className="label mb-4">At a Glance</p>
      <div className="flex items-baseline gap-2.5 mb-1">
        <span className={`font-serif font-medium text-3xl ${c}`}>{score}</span>
        <span className="text-zinc-600 text-xs">/ 100</span>
      </div>
      <VerdictBadge d={decision} />
      <div className="mt-4 pt-4 border-t border-white/[0.06]">
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>
      {facts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2.5">
          {facts.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0">{l}</span>
              <span className="text-xs font-semibold text-zinc-300 font-mono text-right">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY — thesis pull-quote + why-now, rendered ONCE.
// (Previously duplicated across InvestmentDecision + standalone
// InvestmentThesis/WhyNow cards — consolidated here.)
// ═══════════════════════════════════════════════════════════════

function ExecutiveSummary({ m }: { m: MemoData }) {
  const thesis = m.market_thesis ?? m.executive_summary
  const whyNow = m.why_now ?? m.scores.demand?.notes ?? null

  return (
    <div className="card-premium p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="label">Executive Summary</p>
        <EvidenceBadge type="ai-synthesis" />
      </div>

      <blockquote className="border-l-2 border-brass/40 pl-4 sm:pl-5">
        <p className="font-serif italic text-xl sm:text-[1.5rem] text-zinc-50 leading-snug tracking-tight">
          {thesis}
        </p>
      </blockquote>

      {whyNow && (
        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Why Now</p>
          <p className="text-sm text-zinc-400 leading-relaxed">{whyNow}</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// INTELLIGENCE GRAPH — the opportunity and the signals that explain it,
// as a node-link map instead of a paragraph. Five seconds of looking at
// this should convey what several paragraphs of prose currently require.
// Click a node to jump straight to the section it's drawn from.
// ═══════════════════════════════════════════════════════════════

function truncateLabel(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function IntelligenceGraph({
  m, score, decision, onJump,
}: {
  m: MemoData; score: number; decision: BuildDecision; onJump: (tabId: string) => void
}) {
  const c = decision === 'BUILD_NOW' ? '#34d399' : decision === 'VALIDATE_FURTHER' ? '#fbbf24' : '#f87171'
  const hasCompetitor = !!(m.biggest_competitor?.name && m.biggest_competitor.name !== 'N/A')

  type GNode = { id: string; label: string; sub: string; strength: number; tab: string }
  const nodes: GNode[] = [
    { id: 'demand',   label: 'Demand',   sub: `${m.scores.demand?.score ?? '—'}/10 signal`,      strength: (m.scores.demand?.score ?? 5) / 10,      tab: 'market-intelligence' },
    { id: 'virality', label: 'Virality', sub: `${m.scores.virality?.score ?? '—'}/10 signal`,    strength: (m.scores.virality?.score ?? 5) / 10,    tab: 'market-intelligence' },
    { id: 'sub',      label: 'Subscription', sub: `${m.scores.subscription?.score ?? '—'}/10 signal`, strength: (m.scores.subscription?.score ?? 5) / 10, tab: 'market-intelligence' },
    { id: 'defense',  label: 'Defensibility', sub: `${m.scores.defensibility?.score ?? '—'}/10 signal`, strength: (m.scores.defensibility?.score ?? 5) / 10, tab: 'risk-assessment' },
    ...(hasCompetitor ? [{ id: 'competitor', label: truncateLabel(m.biggest_competitor.name, 18), sub: 'Lead competitor', strength: 0.55, tab: 'competitive-landscape' }] : []),
    { id: 'gap', label: 'Top Market Gap', sub: truncateLabel(m.market_gaps?.[0] ?? 'Documented gap', 26), strength: 0.65, tab: 'market-intelligence' },
  ]

  const cx = 300, cy = 218, r = 162
  const angleStep = (2 * Math.PI) / nodes.length
  const pos = nodes.map((n, i) => {
    const angle = -Math.PI / 2 + i * angleStep
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })

  return (
    <div className="card-premium p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="label">Intelligence Graph</p>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider hidden sm:inline">Signal relationships · click a node</p>
      </div>
      <svg viewBox="0 0 600 436" className="w-full h-auto mt-2">
        {pos.map((n, i) => (
          <line key={`e-${n.id}`} x1={cx} y1={cy} x2={n.x} y2={n.y}
            stroke={c} strokeOpacity={0.12 + n.strength * 0.38} strokeWidth={1 + n.strength * 2.2}
            style={{ opacity: 0, animation: 'riseIn .5s ease both', animationDelay: `${i * 0.06}s` }} />
        ))}

        <circle cx={cx} cy={cy} r={42} fill="#0d0d10" stroke={c} strokeWidth={2} />
        <text x={cx} y={cy - 2} textAnchor="middle" style={{ fill: c, fontSize: 26, fontFamily: 'var(--font-fraunces)', fontWeight: 500 }}>{score}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" style={{ fill: '#71717a', fontSize: 9, letterSpacing: 1.5 }}>SCORE</text>

        {pos.map((n, i) => {
          const dir = n.y > cy ? 1 : n.y < cy ? -1 : (n.x > cx ? 1 : -1)
          const nodeR = 9 + n.strength * 7
          return (
            <g key={n.id} onClick={() => onJump(n.tab)} className="cursor-pointer"
              style={{ transformOrigin: `${n.x}px ${n.y}px`, animation: `graphNodeIn .5s var(--ease-premium, ease) both`, animationDelay: `${0.25 + i * 0.08}s` }}>
              <circle cx={n.x} cy={n.y} r={nodeR} fill="#0a0a0c" stroke={c} strokeOpacity={0.55 + n.strength * 0.45} strokeWidth={1.5} />
              <circle cx={n.x} cy={n.y} r={2.5} fill={c} />
              <text x={n.x} y={n.y + dir * (nodeR + 16)} textAnchor="middle" style={{ fill: '#e4e4e7', fontSize: 12, fontWeight: 600 }}>{n.label}</text>
              <text x={n.x} y={n.y + dir * (nodeR + 30)} textAnchor="middle" style={{ fill: '#71717a', fontSize: 9.5 }}>{n.sub}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// INVESTMENT THESIS — top reasons/risks, validation plan, budget.
// All content derived from existing memo fields via the same pure
// derive* helpers as before — only the shell changed.
// ═══════════════════════════════════════════════════════════════

interface DerivedPoint { text: string; tag: string }
interface DerivedRisk  { text: string; severity: 'High' | 'Medium' | 'Low' }
interface VBudget      { range: string; breakdown: string }

function deriveTop3Build(m: MemoData): DerivedPoint[] {
  const points: DerivedPoint[] = []
  const dims = (
    ['demand','virality','subscription','defensibility'] as const
  ).map(k => ({ k, score: m.scores[k]?.score ?? 0, notes: m.scores[k]?.notes ?? '' }))
    .filter(d => d.score >= 6 && d.notes)
    .sort((a, b) => b.score - a.score)

  if (dims[0]) points.push({ text: dims[0].notes, tag: dims[0].k })
  if (dims[1]) points.push({ text: dims[1].notes, tag: dims[1].k })

  const gap = m.market_gaps?.[0]
  if (gap && points.length < 3) points.push({ text: gap, tag: 'gap' })

  const sat = m.market_saturation
  if (sat && points.length < 3) {
    if (sat.concentration === 'Low' || sat.concentration === 'Moderate') {
      points.push({
        text: `${sat.concentration} market concentration — ${sat.entry_difficulty.toLowerCase()} entry difficulty leaves room for a focused brand.`,
        tag: 'market',
      })
    } else if (m.brand_opportunities?.[0]) {
      points.push({ text: m.brand_opportunities[0], tag: 'angle' })
    }
  }

  if (points.length < 3 && m.brand_opportunities?.[0]) {
    points.push({ text: m.brand_opportunities[0], tag: 'angle' })
  }

  return points.slice(0, 3)
}

function deriveTop3Risks(m: MemoData): DerivedRisk[] {
  const risks: DerivedRisk[] = []
  const dimRisks = (
    ['demand','virality','subscription','manufacturing','defensibility'] as const
  ).map(k => ({ score: m.scores[k]?.score ?? 10, notes: m.scores[k]?.notes ?? '', k }))
    .filter(d => d.score <= 5 && d.notes)
    .sort((a, b) => a.score - b.score)

  for (const d of dimRisks.slice(0, 2)) {
    risks.push({ text: d.notes, severity: d.score <= 3 ? 'High' : 'Medium' })
  }

  const sat = m.market_saturation
  if (sat?.competitive_intensity && risks.length < 3) {
    const sentence = sat.competitive_intensity.split(/\.\s+/)[0] + '.'
    const severity = sat.entry_difficulty === 'High' ? 'High'
                   : sat.entry_difficulty === 'Medium' ? 'Medium' : 'Low'
    risks.push({ text: sentence, severity })
  }

  if (risks.length < 3 && m.biggest_competitor?.name && m.biggest_competitor.name !== 'N/A') {
    risks.push({
      text: `${m.biggest_competitor.name} (${m.biggest_competitor.revenue}) already occupies the space — ${m.biggest_competitor.gap}`,
      severity: 'Medium',
    })
  }

  if (risks.length < 3) {
    risks.push({
      text: 'Market timing requires validation before committing capital — demand signals should be confirmed with a pre-sell test.',
      severity: 'Low',
    })
  }

  return risks.slice(0, 3)
}

function deriveValidationSteps(m: MemoData): string[] {
  const d    = m.build_decision
  const gap  = m.market_gaps?.[0]?.replace(/\.$/, '') ?? 'the primary market gap'
  const pain = m.customer_language?.frustrations?.[0]
  const fmt  = m.product_recommendation?.format ?? 'product'
  const copy = m.customer_language?.ad_phrases?.[0]?.use_in_copy

  if (d === 'BUILD_NOW') {
    return [
      `Order minimum test batch at stated COGS and set a 30-day sell-through deadline.`,
      `Launch a conversion-optimised landing page targeting: ${gap}.`,
      copy ? `Run a $2k–$3k paid test using proven copy: "${copy}".`
           : `Run a $2k–$3k paid test on the highest-virality platform.`,
      `Track CAC, subscription conversion rate, and LTV. Evaluate against success metrics at day 30 and day 60.`,
    ]
  }
  if (d === 'VALIDATE_FURTHER') {
    return [
      `Do not commit to manufacturing. Build a pre-sell landing page first.`,
      pain ? `Conduct 10–20 customer interviews centred on: "${pain}".`
           : `Conduct 10–20 customer interviews on the core pain point.`,
      `Run a $1k–$2k paid test to measure organic demand and email signup rate.`,
      `Only proceed to ${fmt} manufacturing if pre-sell conversion exceeds 2% within 30 days.`,
    ]
  }
  return [
    `Do not allocate manufacturing capital at this score.`,
    `If pursuing anyway, validate the primary risk with the smallest possible test before any spend.`,
  ]
}

function deriveValidationBudget(m: MemoData): VBudget {
  const mfgScore = m.scores.manufacturing?.score ?? 5
  const d        = m.build_decision

  if (d === 'SKIP') {
    return { range: '$500–$2k', breakdown: 'Market research only — no manufacturing recommended' }
  }
  if (d === 'VALIDATE_FURTHER') {
    return { range: '$1k–$3k', breakdown: 'Pre-sell page + customer research — no manufacturing at this stage' }
  }
  const [mfgLo, mfgHi, totalLo, totalHi] =
    mfgScore >= 8 ? ['$2k', '$5k',  '$4k',  '$10k'] :
    mfgScore >= 6 ? ['$4k', '$10k', '$7k',  '$18k'] :
                    ['$8k', '$20k', '$12k', '$28k']
  return {
    range:     `${totalLo}–${totalHi}`,
    breakdown: `Manufacturing test batch (${mfgLo}–${mfgHi}) + paid acquisition test ($2k–$5k) + logistics`,
  }
}

function deriveSuccessMetrics(m: MemoData): string[] {
  const fp  = m.financial_projections
  const sub = m.scores.subscription?.score ?? 0
  const out: string[] = []

  if (fp.ten_k_probability && fp.ten_k_probability !== 'N/A') {
    out.push(`Reach $10k MRR within 90 days (model probability: ${fp.ten_k_probability})`)
  }
  if (fp.subscription_ltv && fp.subscription_ltv !== 'N/A') {
    out.push(`Customer LTV of ${fp.subscription_ltv} within 6 months`)
  }
  if (fp.gross_margin && fp.gross_margin !== 'N/A') {
    out.push(`Gross margin at or above ${fp.gross_margin} by month 3`)
  }
  out.push(sub >= 7
    ? 'Subscription conversion rate > 30% of first-time purchasers'
    : 'Repeat purchase rate > 20% within 60 days')

  return out.slice(0, 4)
}

function deriveKillCriteria(m: MemoData): string[] {
  const fp  = m.financial_projections
  const sat = m.market_saturation
  const out: string[] = []

  const demandScore = m.scores.demand?.score ?? 0
  out.push(
    demandScore < 6
      ? 'Fewer than 30 organic units/month after 60-day test → insufficient market demand at this price'
      : 'Fewer than 50 organic units/month after 60-day test → adjust positioning before scaling',
  )

  if (fp.subscription_ltv && fp.subscription_ltv !== 'N/A') {
    out.push(`CAC persistently exceeds 50% of ${fp.subscription_ltv} LTV → unprofitable acquisition, exit or reposition`)
  } else {
    out.push('CAC exceeds $80 with no subscription conversion > 20% → unprofitable unit economics')
  }

  if (sat?.entry_difficulty === 'High' || sat?.concentration === 'Very High') {
    const comp = m.biggest_competitor?.name ?? 'dominant incumbents'
    out.push(`Unable to achieve measurable differentiation from ${comp} within 3 months → pivot or exit category`)
  } else {
    out.push('Direct competitor launches identical product at 20%+ lower price before reaching $10k MRR → reassess defensibility')
  }

  return out.slice(0, 3)
}

const SEVERITY_CFG: Record<string, { cls: string; dot: string }> = {
  High:   { cls: 'text-red-400/90   bg-red-400/5    border-red-400/20',   dot: 'bg-red-400'    },
  Medium: { cls: 'text-amber-400/90 bg-amber-400/5  border-amber-400/20', dot: 'bg-amber-400'  },
  Low:    { cls: 'text-zinc-400     bg-white/[0.05]   border-white/[0.1]',     dot: 'bg-zinc-500'   },
}

const TAG_LABEL: Record<string, string> = {
  demand: 'Demand', virality: 'Virality', subscription: 'Subscription',
  defensibility: 'Defensibility', gap: 'Market Gap', market: 'Market', angle: 'Entry Angle',
}

const BLOCK_CFG = [
  { key: 'win'      as const, Icon: IconTrendUp,    title: 'Why this could win',      cls: 'border-emerald-400/20 bg-emerald-400/5', head: 'text-emerald-400' },
  { key: 'fail'     as const, Icon: IconTrendDown,  title: 'Why this could fail',     cls: 'border-red-400/20    bg-red-400/5',     head: 'text-red-400'     },
  { key: 'validate' as const, Icon: IconBeaker,     title: 'Validate first',          cls: 'border-amber-400/20  bg-amber-400/5',   head: 'text-amber-400'   },
  { key: 'angle'    as const, Icon: IconArrowRight, title: 'Recommended entry angle', cls: 'border-brass/20      bg-brass/[0.05]',   head: 'text-brass'    },
]

function InvestmentThesisSection({ m, blocks }: { m: MemoData; blocks: DecisionBlocksData }) {
  const buildPts = deriveTop3Build(m)
  const risks    = deriveTop3Risks(m)
  const steps    = deriveValidationSteps(m)
  const budget   = deriveValidationBudget(m)
  const metrics  = deriveSuccessMetrics(m)
  const kill     = deriveKillCriteria(m)

  return (
    <div className="card-premium overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between gap-3">
        <p className="label">Investment Thesis</p>
        <EvidenceBadge type="ai-synthesis" />
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Four quick-read blocks */}
        <div className="grid grid-cols-2 gap-3">
          {BLOCK_CFG.map(b => (
            <div key={b.key} className={`rounded-xl border p-4 ${b.cls}`}>
              <div className={`flex items-center gap-1.5 mb-2 ${b.head}`}>
                <b.Icon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{b.title}</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{blocks[b.key]}</p>
            </div>
          ))}
        </div>

        {/* Reasons + Risks */}
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5">Top 3 Reasons to Build</p>
            <ol className="space-y-2">
              {buildPts.map((pt, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="font-mono text-zinc-600 shrink-0 mt-px w-4 text-right">{i+1}</span>
                  <span>
                    {pt.text}{' '}
                    <span className="text-[10px] text-zinc-600 ml-1">[{TAG_LABEL[pt.tag] ?? pt.tag}]</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5">Top 3 Risks</p>
            <ol className="space-y-2">
              {risks.map((r, i) => {
                const cfg = SEVERITY_CFG[r.severity]
                return (
                  <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                    <span className="font-mono text-zinc-600 shrink-0 mt-px w-4 text-right">{i+1}</span>
                    <span>
                      {r.text}{' '}
                      <span className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-1.5 py-0.5 ml-1 ${cfg.cls}`}>
                        <span className={`w-1 h-1 rounded-full ${cfg.dot}`}/>{r.severity}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        {/* Validation plan */}
        <div className="bg-white/[0.03] rounded-xl p-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5">First Validation Plan (30–60 days)</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                <span className="font-mono text-zinc-600 shrink-0 mt-px w-4 text-right">{i+1}</span>{s}
              </li>
            ))}
          </ol>
        </div>

        {/* Budget | Metrics | Kill */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Estimated Validation Budget</p>
            <p className="font-mono font-bold text-lg text-zinc-100 mb-1">{budget.range}</p>
            <p className="text-[11px] text-zinc-500 leading-snug">{budget.breakdown}</p>
          </div>
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Success Metrics</p>
            <ul className="space-y-1.5">
              {metrics.map((mt, i) => (
                <li key={i} className="flex gap-2 text-xs text-zinc-300 leading-snug">
                  <IconArrowRight className="w-3.5 h-3.5 text-brass shrink-0 mt-0.5" />{mt}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Kill Criteria</p>
            <ul className="space-y-1.5">
              {kill.map((k, i) => (
                <li key={i} className="flex gap-2 text-xs text-zinc-300 leading-snug">
                  <IconX className="w-3 h-3 text-red-400/70 shrink-0 mt-1" />{k}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER INTELLIGENCE — customer voice as real conversation threads
// ═══════════════════════════════════════════════════════════════

// ── Evidence Board — a literal pinboard instead of stacked text blocks.
// Each quote/desire/fear/ad-line is a pinned note, color-coded by what
// kind of evidence it is, so the page reads as a board you scan, not
// a transcript you read start to finish.
const EVIDENCE_NOTE_ROTATIONS = [-2.2, 1.6, -1.1, 2.4, -1.8, 1.2, -2.6, 1.9, -1.4, 2.1, -1.7, 1.3]

function ConsumerIntelligenceContent({ m }: { m: MemoData }) {
  const cl = m.customer_language

  type Kind = 'voice' | 'desire' | 'fear' | 'ad'
  const KIND_CFG: Record<Kind, { label: string; color: string }> = {
    voice:  { label: 'Voice of Customer', color: '#9aa0a6' },
    desire: { label: 'Desire',            color: '#C8A463' },
    fear:   { label: 'Fear / Risk',       color: '#f87171' },
    ad:     { label: 'Ad-Ready',          color: '#34d399' },
  }

  const cards: { id: string; kind: Kind; node: React.ReactNode }[] = [
    ...cl.frustrations.map((q, i) => ({
      id: `fr-${i}`, kind: 'voice' as const,
      node: <p className="font-serif italic text-[13px] text-zinc-300 leading-relaxed">&ldquo;{q}&rdquo;</p>,
    })),
    ...cl.ad_phrases.map((ap, i) => ({
      id: `ad-${i}`, kind: 'ad' as const,
      node: (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 italic leading-relaxed">&ldquo;{ap.they_say}&rdquo;</p>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: '#34d399' }}>
            <IconArrowRight className="w-3 h-3" />Use in copy
          </div>
          <p className="text-[13px] text-zinc-100 font-medium leading-relaxed">{ap.use_in_copy}</p>
        </div>
      ),
    })),
    ...cl.desires.map((d, i) => ({
      id: `de-${i}`, kind: 'desire' as const,
      node: <p className="text-[13px] text-zinc-200 leading-relaxed">{d}</p>,
    })),
    ...cl.fears.map((f, i) => ({
      id: `fe-${i}`, kind: 'fear' as const,
      node: <p className="text-[13px] text-zinc-200 leading-relaxed">{f}</p>,
    })),
  ]

  return (
    <div className="space-y-6">
      <SectionIntro text="An evidence board, not a transcript — every pin is sourced from documented customer language." />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 py-2">
        {cards.map((card, i) => {
          const cfg = KIND_CFG[card.kind]
          return (
            <div key={card.id} className="transition-transform duration-300 hover:-translate-y-1.5">
            <div
              className="rounded-sm p-4 bg-[#15151a]"
              style={{
                borderTop: `3px solid ${cfg.color}`,
                transform: `rotate(${EVIDENCE_NOTE_ROTATIONS[i % EVIDENCE_NOTE_ROTATIONS.length]}deg)`,
                boxShadow: '0 14px 28px -14px rgba(0,0,0,.7)',
              }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wider block mb-2" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
              {card.node}
            </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MARKET INTELLIGENCE — saturation + evidence + demand signals +
// dimension strip, consolidated into one research-terminal section.
// ═══════════════════════════════════════════════════════════════

const CONCENTRATION_CFG: Record<string, { label: string; cls: string }> = {
  'Low':       { label: 'Low Concentration',  cls: 'text-emerald-400 bg-emerald-400/10' },
  'Moderate':  { label: 'Moderate',           cls: 'text-amber-400   bg-amber-400/10'   },
  'High':      { label: 'High Concentration', cls: 'text-orange-400  bg-orange-400/10'  },
  'Very High': { label: 'Very High',          cls: 'text-red-400     bg-red-400/10'     },
}
const DIFFICULTY_CFG: Record<string, { cls: string }> = {
  'Low':    { cls: 'text-emerald-400' },
  'Medium': { cls: 'text-amber-400'   },
  'High':   { cls: 'text-red-400'     },
}
const DIM_LABELS: Record<string, string> = {
  demand: 'Demand', virality: 'Virality', subscription: 'Subscription',
  manufacturing: 'Manufacturing', defensibility: 'Defensibility', competition: 'Market Accessibility',
}

function MarketSaturationBlock({ m }: { m: MemoData }) {
  const sat = m.market_saturation

  if (!sat) {
    const score  = m.scores.competition?.score ?? 5
    const notes  = m.scores.competition?.notes
    const access = mapAccessibility(score)
    const [colorText, colorBg, label] =
      score >= 7 ? ['text-emerald-400', 'bg-emerald-400', 'Open Market'   ] :
      score >= 5 ? ['text-amber-400',   'bg-amber-400',   'Moderate Entry'] :
      score >= 3 ? ['text-orange-400',  'bg-orange-400',  'Crowded'       ] :
                   ['text-red-400',     'bg-red-400',     'Saturated'     ]
    return (
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <span className={`font-mono font-bold text-xl ${colorText}`}>{score}<span className="text-zinc-600 text-xs font-normal">/10</span></span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorText} bg-white/[0.06]`}>{label}</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full ${colorBg}`} style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
        </div>
        <div className="ledger mb-4">
          {([['Seller Density', access.density],['Entry Barriers', access.barriers],['Revenue Concentration', access.revenue],['Whitespace', access.whitespace]] as [string,string][]).map(([l,v]) => (
            <div key={l} className="ledger-row justify-between gap-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">{l}</p>
              <p className="text-xs text-zinc-300 leading-snug text-right">{v}</p>
            </div>
          ))}
        </div>
        {notes && <p className="text-xs text-zinc-500 leading-relaxed">{notes}</p>}
      </div>
    )
  }

  const concCfg = CONCENTRATION_CFG[sat.concentration] ?? CONCENTRATION_CFG['Moderate']
  const diffCfg = DIFFICULTY_CFG[sat.entry_difficulty] ?? DIFFICULTY_CFG['Medium']

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-zinc-300 border border-white/[0.1]">{sat.maturity ?? '—'}</span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border border-transparent ${concCfg.cls}`}>{concCfg.label}</span>
        <span className={`text-xs font-semibold ${diffCfg.cls}`}>Entry: {sat.entry_difficulty}</span>
      </div>
      {sat.competitive_intensity && (
        <p className="text-sm text-zinc-300 leading-relaxed">{sat.competitive_intensity}</p>
      )}
    </div>
  )
}

function MarketIntelligenceContent({ m }: { m: MemoData }) {
  const { demand, virality, subscription } = m.scores
  const sig = m.signal_metadata
  const demandBadge:   EvidenceType = sig?.demand_verified   ? 'multi-source' : 'ai-synthesis'
  const viralityBadge: EvidenceType = sig?.virality_verified ? 'verified'     : 'ai-synthesis'
  const demandSource   = sig?.demand_verified   ? 'Amazon (Keepa)' : 'AI Synthesis'
  const viralitySource = sig?.virality_verified ? 'TikTok API'     : 'AI Synthesis'

  const displayDims = (Object.entries(m.scores) as [string, { score: number; notes: string }][])
    .filter(([key]) => key !== 'competition')
  const { decision } = computeScore(m)
  const radarColor = decision === 'BUILD_NOW' ? '#34d399' : decision === 'VALIDATE_FURTHER' ? '#fbbf24' : '#f87171'

  return (
    <div className="space-y-6">
      {/* Market structure */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Market Structure</p>
        <MarketSaturationBlock m={m} />
      </div>

      {/* Signal terminal — demand / virality / subscription as data rows */}
      <div className="pt-5 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Signal Terminal</p>
        <div className="ledger">
          {[
            { label: 'Demand',       dim: demand,       badge: demandBadge,   source: demandSource },
            { label: 'Virality',     dim: virality,     badge: viralityBadge, source: viralitySource },
            { label: 'Subscription', dim: subscription, badge: 'ai-synthesis' as EvidenceType, source: 'AI Synthesis' },
          ].map(row => {
            const level = row.dim.score >= 8 ? 'Strong' as const : row.dim.score >= 6 ? 'Moderate' as const : 'Weak' as const
            return (
              <div key={row.label} className="ledger-row">
                <span className="text-xs font-semibold text-zinc-300 w-28 shrink-0">{row.label}</span>
                <span className="font-serif font-medium text-base text-zinc-100 w-10 shrink-0">{row.dim.score}<span className="text-zinc-600 text-[10px] font-sans">/10</span></span>
                {row.label === 'Virality' ? <PulseRings level={level} /> : <SignalBars level={level} />}
                <span className="flex-1 text-xs text-zinc-500 truncate hidden md:inline">{row.dim.notes}</span>
                <span className="ml-auto shrink-0 flex items-center gap-2">
                  <EvidenceBadge type={row.badge} />
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dimension radar — the shape of the opportunity at a glance */}
      <div className="pt-5 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Dimension Scores</p>
        <DimensionRadar
          dims={displayDims.map(([key, { score }]) => [DIM_LABELS[key] ?? key, score] as [string, number])}
          color={radarColor}
        />
      </div>

      {/* Market gaps */}
      <div className="pt-5 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Documented Market Gaps</p>
        <NumList items={m.market_gaps} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// COMPETITIVE LANDSCAPE — comp-table treatment
// ═══════════════════════════════════════════════════════════════

// ── Competitive Position Map — where the incumbent sits vs. the specific
// gap you'd enter through, instead of a brand/revenue/gap table. Axes are
// derived from the same market_saturation fields the text version used —
// nothing fabricated, just plotted instead of described.
const CONCENTRATION_X: Record<string, number> = { Low: 22, Moderate: 48, High: 72, 'Very High': 90 }
const DIFFICULTY_WHITESPACE: Record<string, number> = { Low: 84, Medium: 62, High: 22 }

function CompetitivePositionMap({ m }: { m: MemoData }) {
  const sat = m.market_saturation
  const comp = m.biggest_competitor
  const hasComp = !!(comp?.name && comp.name !== 'N/A')

  const x = CONCENTRATION_X[sat?.concentration ?? 'Moderate'] ?? 50
  const usY = DIFFICULTY_WHITESPACE[sat?.entry_difficulty ?? 'Medium'] ?? 50
  const incumbentY = 16

  const cx = 150, cy = 150, w = 300, h = 300
  const toPx = (px: number, py: number) => [24 + (px / 100) * (w - 48), 24 + (1 - py / 100) * (h - 48)]
  const [usX, usPy]   = toPx(Math.min(94, x + 6), usY)
  const [incX, incPy] = toPx(Math.max(6, x - 6), incumbentY)

  return (
    <div className="rounded-xl border border-white/[0.07] p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Competitive Position Map</p>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider hidden sm:inline">Concentration vs. whitespace</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[360px] mx-auto mt-3">
        <line x1={cx} y1="24" x2={cx} y2={h - 24} stroke="#ffffff" strokeOpacity="0.08" />
        <line x1="24" y1={cy} x2={w - 24} y2={cy} stroke="#ffffff" strokeOpacity="0.08" />
        {/* quadrant labels live at the true corners, well clear of any plotted point */}
        <text x={w - 28} y="40" textAnchor="end" style={{ fill: '#34d399', fontSize: 9, letterSpacing: 1 }}>HIDDEN GAP</text>
        <text x="28" y="40" style={{ fill: '#71717a', fontSize: 9, letterSpacing: 1 }}>WIDE OPEN</text>
        <text x="28" y={h - 22} style={{ fill: '#71717a', fontSize: 9, letterSpacing: 1 }}>LOW PRIORITY</text>
        <text x={w - 28} y={h - 22} textAnchor="end" style={{ fill: '#f87171', fontSize: 9, letterSpacing: 1 }}>SATURATED</text>

        {hasComp && (
          <>
            <circle cx={incX} cy={incPy} r="9" fill="#0a0a0c" stroke="#f87171" strokeOpacity="0.7" strokeWidth="1.5" />
            <circle cx={incX} cy={incPy} r="2.5" fill="#f87171" />
            <text x={incX} y={incPy + 22} textAnchor="middle" style={{ fill: '#e4e4e7', fontSize: 11, fontWeight: 600 }}>{truncateLabel(comp.name, 16)}</text>
            <text x={incX} y={incPy + 35} textAnchor="middle" style={{ fill: '#71717a', fontSize: 9.5 }}>Incumbent</text>
          </>
        )}

        <circle cx={usX} cy={usPy} r="11" fill="#0a0a0c" stroke="#34d399" strokeWidth="2" />
        <circle cx={usX} cy={usPy} r="3" fill="#34d399" />
        <text x={usX} y={usPy - 18} textAnchor="middle" style={{ fill: '#e4e4e7', fontSize: 11, fontWeight: 600 }}>Your Entry Point</text>
        <text x={usX} y={usPy - 5} textAnchor="middle" style={{ fill: '#71717a', fontSize: 9.5 }}>{truncateLabel(m.brand_opportunities?.[0] ?? 'Documented gap', 30)}</text>
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-zinc-600 uppercase tracking-wider">
        <span>← Less concentrated</span>
        <span>More concentrated →</span>
      </div>
    </div>
  )
}

function CompetitiveLandscapeContent({ m }: { m: MemoData }) {
  const comp = m.biggest_competitor
  const hasComp = comp?.name && comp.name !== 'N/A'

  return (
    <div className="space-y-6">
      <SectionIntro text="Lead incumbent and the unclaimed positioning around them." />

      <CompetitivePositionMap m={m} />

      {hasComp && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="grid grid-cols-3 bg-white/[0.04] px-4 py-2.5 text-[10px] text-zinc-500 uppercase tracking-wider">
            <span>Brand</span><span>Est. Revenue</span><span>Their Gap</span>
          </div>
          <div className="grid grid-cols-3 px-4 py-3.5 text-sm">
            <span className="font-semibold text-zinc-100">{comp.name}</span>
            <span className="font-mono text-zinc-300">{comp.revenue}</span>
            <span className="text-zinc-400 text-xs leading-relaxed col-span-1">{comp.gap}</span>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Unclaimed Positioning Angles</p>
        <NumList items={m.brand_opportunities} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FINANCIAL OUTLOOK
// ═══════════════════════════════════════════════════════════════

// ── Trajectory Timeline — the three probability bars as a milestone path
// instead of three stacked progress bars. Node size/color tracks probability,
// so the funnel reads as a trajectory you're walking, not a checklist.
function TrajectoryTimeline({ fp }: { fp: MemoData['financial_projections'] }) {
  const pct = (v?: string) => (v ? parseInt(v, 10) || 0 : 0)
  const colorFor = (p: number) => (p >= 60 ? '#34d399' : p >= 30 ? '#fbbf24' : '#71717a')

  const milestones = [
    { label: 'Validate',  sub: '30–60 days', value: undefined as string | undefined, color: '#9aa0a6', size: 11 },
    { label: '$10k / mo',  sub: undefined, value: fp.ten_k_probability },
    { label: '$100k / mo', sub: undefined, value: fp.hundred_k_probability },
    { label: '$1M / mo',   sub: undefined, value: fp.one_m_probability },
  ].map(ms => ms.value !== undefined
    ? { ...ms, color: colorFor(pct(ms.value)), size: 7 + (pct(ms.value) / 100) * 9 }
    : ms)

  return (
    <div className="rounded-xl border border-white/[0.07] p-5 sm:p-7">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-7">Revenue Trajectory</p>
      <div className="relative flex justify-between items-start">
        <div className="absolute left-[8%] right-[8%] top-[10px] h-[1.5px] bg-gradient-to-r from-zinc-600 via-amber-400/50 to-emerald-400/60" />
        {milestones.map(ms => (
          <div key={ms.label} className="relative flex flex-col items-center flex-1">
            <span
              className="rounded-full border-2 bg-[#0a0a0c] relative z-10"
              style={{ width: ms.size, height: ms.size, borderColor: ms.color }}
            />
            <span className="mt-3 text-sm font-semibold text-zinc-100 text-center">{ms.label}</span>
            <span className="text-xs font-mono mt-0.5" style={{ color: ms.value ? ms.color : '#71717a' }}>
              {ms.value ?? ms.sub}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancialOutlookContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  const marketSizeIsUnverified = !m.market_size ||
    m.market_size === 'N/A' ||
    m.market_size.toLowerCase().includes('not independently') ||
    m.market_size.toLowerCase().includes('vary widely')
  return (
    <div className="space-y-5">
      <SectionIntro text="Probability estimates based on comparable DTC launches. Not independently verified — treat as directional, not forecasts." />
      {marketSizeIsUnverified && (
        <div className="flex items-start gap-2.5 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2.5">
          <IconAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Market size not independently verified. Figures shown are AI estimates — consult industry reports before citing.</span>
        </div>
      )}
      <TrajectoryTimeline fp={fp} />
      <div className="flex divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-hidden">
        {([
          ['Gross Margin',     fp.gross_margin],
          ['Net at Scale',     fp.net_margin_at_scale],
          ['Subscription LTV', fp.subscription_ltv],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 px-3 py-3.5 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">{l}</p>
            <p className="font-serif font-medium text-base">{v ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LAUNCH STRATEGY — product direction + market entry + Higgs placeholders
// ═══════════════════════════════════════════════════════════════

const MEDIA_PLACEHOLDERS = [
  'AI Product Hero Image',
  'Packaging Concepts',
  'Lifestyle Images',
  'Product Shelf Visualization',
  'Brand Moodboard',
  'Launch Creative',
  'Short AI Commercial Preview',
]

// ── Product Concept Visual — a generated concept silhouette, not a photo.
// Honest framing: this renders an abstract package shape inferred from the
// recommended format, with premium glass/metal shading for depth. It is
// explicitly labeled as a concept render so it never reads as a real
// product photo (that still requires a real image-gen pipeline).
type ProductShape = 'capsule' | 'bottle' | 'jar' | 'pouch' | 'dropper' | 'bar'

function inferProductShape(format: string): ProductShape {
  const f = format.toLowerCase()
  if (['capsule', 'softgel', 'tablet', 'pill'].some(t => f.includes(t))) return 'capsule'
  if (['powder', 'sachet', 'stick pack'].some(t => f.includes(t))) return 'pouch'
  if (['gummy', 'chewable', 'cream', 'lotion', 'balm', 'mask'].some(t => f.includes(t))) return 'jar'
  if (['liquid', 'tincture', 'serum', 'oil', 'drop'].some(t => f.includes(t))) return 'dropper'
  if (['bar', 'gel', 'ready-to-drink', 'rtd', 'protein'].some(t => f.includes(t))) return 'bar'
  return 'bottle'
}

function ProductConceptVisual({ format, categoryName }: { format: string; categoryName: string }) {
  const shape = inferProductShape(format)
  const accent = '#C8A463'

  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent p-6 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Product Concept</p>
        <p className="text-[10px] text-zinc-600 italic">Generated concept render — not a product photo</p>
      </div>
      <div className="flex items-center justify-center py-4">
        <svg viewBox="0 0 200 240" className="w-36 sm:w-44 h-auto" style={{ animation: 'productFloat 5s ease-in-out infinite' }}>
          <defs>
            <linearGradient id="pcvBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="48%" stopColor="#1c1c20" />
              <stop offset="100%" stopColor="#0a0a0c" />
            </linearGradient>
            <radialGradient id="pcvSheen" cx="32%" cy="22%" r="55%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse cx="100" cy="222" rx="48" ry="9" fill="#000000" opacity="0.45" />

          {shape === 'capsule' && (
            <g>
              <defs><clipPath id="pcvCapClip"><rect x="68" y="38" width="64" height="164" rx="32" /></clipPath></defs>
              <rect x="68" y="38" width="64" height="164" rx="32" fill="url(#pcvBody)" />
              <rect x="68" y="120" width="64" height="82" fill={accent} clipPath="url(#pcvCapClip)" opacity="0.85" />
              <rect x="68" y="38" width="64" height="164" rx="32" fill="url(#pcvSheen)" />
            </g>
          )}

          {shape === 'bottle' && (
            <g>
              <rect x="56" y="88" width="88" height="116" rx="14" fill="url(#pcvBody)" />
              <rect x="86" y="58" width="28" height="36" fill="url(#pcvBody)" />
              <rect x="78" y="38" width="44" height="24" rx="5" fill={accent} />
              <rect x="56" y="136" width="88" height="34" fill="#000000" opacity="0.22" />
              <rect x="56" y="88" width="88" height="116" rx="14" fill="url(#pcvSheen)" />
            </g>
          )}

          {shape === 'jar' && (
            <g>
              <rect x="50" y="82" width="100" height="118" rx="16" fill="url(#pcvBody)" />
              <rect x="44" y="60" width="112" height="28" rx="10" fill={accent} />
              <rect x="50" y="82" width="100" height="118" rx="16" fill="url(#pcvSheen)" />
            </g>
          )}

          {shape === 'pouch' && (
            <g>
              <path d="M60,200 L60,112 Q60,92 80,86 L120,86 Q140,92 140,112 L140,200 Z" fill="url(#pcvBody)" />
              <path d="M70,86 L75,58 L125,58 L130,86 Z" fill={accent} opacity="0.9" />
              <rect x="60" y="130" width="80" height="30" fill="#000000" opacity="0.2" />
              <path d="M60,200 L60,112 Q60,92 80,86 L120,86 Q140,92 140,112 L140,200 Z" fill="url(#pcvSheen)" />
            </g>
          )}

          {shape === 'dropper' && (
            <g>
              <rect x="62" y="118" width="76" height="92" rx="14" fill="url(#pcvBody)" />
              <rect x="90" y="46" width="20" height="74" fill={accent} />
              <ellipse cx="100" cy="44" rx="15" ry="11" fill={accent} />
              <rect x="62" y="118" width="76" height="92" rx="14" fill="url(#pcvSheen)" />
            </g>
          )}

          {shape === 'bar' && (
            <g>
              <rect x="36" y="92" width="128" height="64" rx="10" fill="url(#pcvBody)" />
              <line x1="36" y1="124" x2="164" y2="124" stroke="#000000" strokeOpacity="0.25" strokeWidth="2" />
              <rect x="36" y="92" width="128" height="64" rx="10" fill="url(#pcvSheen)" />
            </g>
          )}
        </svg>
      </div>
      <p className="text-center text-sm font-medium text-zinc-300">{categoryName}</p>
      <p className="text-center text-xs text-zinc-600 mt-0.5">{format}</p>
    </div>
  )
}

function MediaIcon() {
  return (
    <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function MediaPlaceholders() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Brand &amp; Creative Assets</p>
        <span className="text-[10px] text-zinc-600 italic">Higgs Field integration — coming soon</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {MEDIA_PLACEHOLDERS.map(label => (
          <div key={label} className="media-tile">
            <MediaIcon />
            <p className="text-[11px] text-zinc-500 leading-tight">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function LaunchStrategyContent({ m }: { m: MemoData }) {
  const rec = m.product_recommendation
  const fp  = m.financial_projections
  return (
    <div className="space-y-6">
      <SectionIntro text="Recommended product configuration and entry sequence based on gap analysis, manufacturing constraints, and margin targets." />

      <ProductConceptVisual format={rec.format} categoryName={m.category_name} />

      <div className="flex flex-wrap sm:flex-nowrap divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-hidden">
        {([
          ['Format', rec.format],
          ['Usage',  rec.dosing],
          ['COGS',   rec.cogs_estimate],
          ['Retail', rec.retail_price],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 min-w-[100px] px-3 py-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-zinc-300 leading-snug font-mono">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Key Ingredients / Components</p>
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-white/[0.04] text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 w-[30%]">Ingredient</th>
                <th className="text-left py-2.5 px-3 w-[14%]">Dose</th>
                <th className="text-left py-2.5 px-3">Role</th>
                <th className="text-center py-2.5 px-3 w-[14%]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rec.formula.map((row, i) => (
                <tr key={i} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-medium text-sm">{row.ingredient}</td>
                  <td className="py-3 px-3 font-mono text-brass text-xs">{row.dose}</td>
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
                <IconX className="w-3 h-3 text-red-400/70 shrink-0 mt-1" />{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fp.path_to_10m && (
        <div className="bg-white/[0.04] rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Path to $10M ARR</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{fp.path_to_10m}</p>
        </div>
      )}

      <div className="pt-5 border-t border-white/[0.05]">
        <MediaPlaceholders />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// RISK ASSESSMENT — severity-sorted register
// ═══════════════════════════════════════════════════════════════

function RiskAssessmentContent({ m }: { m: MemoData }) {
  const dims = (Object.entries(m.scores) as [string, { score: number; notes: string }][])
    .filter(([key]) => key !== 'competition')
  const weak = dims.filter(([, v]) => v.score <= 5).sort((a, b) => a[1].score - b[1].score)

  if (weak.length === 0) return (
    <p className="text-sm text-zinc-400">No dimension scored below 6. Overall risk profile is moderate — primary risk is execution, not market structure.</p>
  )

  return (
    <div className="space-y-3">
      <SectionIntro text="Dimensions where market structure works against you — each is a thesis-breaking risk if not addressed at launch." />
      <div className="rounded-xl border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
        {weak.map(([key, { score, notes }]) => (
          <div key={key} className={`flex gap-3 px-4 py-3.5 ${score <= 3 ? 'bg-red-400/[0.04]' : 'bg-amber-400/[0.03]'}`}>
            <span className={`font-serif font-medium text-base shrink-0 w-10 ${score <= 3 ? 'text-red-400' : 'text-amber-400'}`}>{score}/10</span>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${score <= 3 ? 'text-red-400' : 'text-amber-400'}`}>
                {DIM_LABELS[key] ?? key}
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">{notes}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MANUFACTURING INTELLIGENCE — supply-chain dashboard shell.
// Fetch/state logic is UNCHANGED from the prior implementation —
// only the rendered output (ManufacturingDisplay) is restyled.
// ═══════════════════════════════════════════════════════════════

function inferManufacturingCategory(format: string): string {
  const f = format.toLowerCase()
  if (['capsule','powder','gummy','liquid','softgel','tincture'].some(t => f.includes(t))) return 'supplements'
  if (['serum','moisturizer','cream','cleanser','toner','mask','spf','oil','treatment'].some(t => f.includes(t))) return 'beauty'
  if (['chew','treat','kibble','topical','freeze-dried'].some(t => f.includes(t))) return 'pets'
  if (['bar','gel','ready-to-drink','protein','pre-workout'].some(t => f.includes(t))) return 'fitness'
  return 'consumer goods'
}

function PipelineStage({ label, value, sub }: { label: string; value: string; sub?: string; active?: boolean }) {
  return (
    <div className="flex-1 min-w-[110px] px-3 py-3">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-sm font-semibold text-zinc-200 font-mono leading-snug">{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function MfgConfidencePill({ label }: { label: 'High' | 'Medium' | 'Low' }) {
  const cfg = {
    High:   { cls: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5', dot: 'bg-emerald-400' },
    Medium: { cls: 'text-amber-400   border-amber-400/20   bg-amber-400/5',   dot: 'bg-amber-400'   },
    Low:    { cls: 'text-zinc-500    border-white/[0.1]        bg-white/[0.04]',   dot: 'bg-zinc-500'    },
  }[label]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{label} confidence
    </span>
  )
}

function ManufacturingDisplay({ est, mfgScore }: { est: MfgEstimate; mfgScore: number }) {
  const formatCurrency = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 === 0 ? n : n.toFixed(1)}`
  const isVerified   = est.data_source !== 'ai_synthesis'
  const sourceBadge: EvidenceType = isVerified ? 'verified' : 'ai-synthesis'

  const unitCostLow  = formatCurrency(est.unit_cost.low)
  const unitCostHigh = formatCurrency(est.unit_cost.high)
  const moq       = `${est.moq.low.toLocaleString()}–${est.moq.high.toLocaleString()} ${est.moq.unit}`
  const leadTime  = `${est.lead_time_days.low}–${est.lead_time_days.high} days`
  const suppliers = `~${est.supplier_count.estimate.toLocaleString()}`
  const rating    = est.top_supplier_rating != null ? `${est.top_supplier_rating}/5` : '—'

  const complexityColor =
    est.complexity === 'Low'    ? 'text-emerald-400' :
    est.complexity === 'Medium' ? 'text-amber-400'   :
    est.complexity === 'High'   ? 'text-orange-400'  :
                                   'text-red-400'

  const introText = isVerified
    ? `Live supplier data from ${est.data_source.replace(/_/g, ' ')}. Prices reflect per-unit cost at high-volume tier (USD).`
    : 'AI estimates based on category benchmarks. Activate live supplier credentials for verified quotes.'

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500 italic leading-relaxed">{introText}</p>

      {/* Headline number */}
      <div className="flex items-end gap-2">
        <span className="font-serif font-medium text-3xl text-zinc-50 tracking-tight">{unitCostLow}–{unitCostHigh}</span>
        <span className="text-xs text-zinc-500 mb-1">per unit, landed</span>
      </div>

      {/* Pipeline strip — Sourcing → Production → QA → Shipping */}
      <div className="flex divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-x-auto">
        <PipelineStage label="Sourcing"   value={suppliers}        sub={`${est.supplier_count.confidence} confidence`} />
        <PipelineStage label="Production" value={moq}              sub="MOQ" />
        <PipelineStage label="QA"         value={rating}           sub="avg. supplier rating" />
        <PipelineStage label="Shipping"   value={leadTime}         sub="lead time" />
      </div>

      <div className="flex divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-hidden">
        <div className="flex-1 px-3 py-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Manufacturing Difficulty</p>
          <p className={`text-sm font-semibold leading-snug ${complexityColor}`}>{est.complexity}</p>
          {mfgScore > 0 && <p className="text-[11px] text-zinc-500 mt-0.5">Score: {mfgScore}/10</p>}
        </div>
        <div className="flex-1 px-3 py-3 flex items-center justify-between">
          <MfgConfidencePill label={est.confidence_label} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span>Source:</span><EvidenceBadge type={sourceBadge} />
        </div>
      </div>

      {est.notes && isVerified && (
        <p className="text-xs text-zinc-500 leading-relaxed">{est.notes}</p>
      )}
    </div>
  )
}

function ManufacturingIntelligenceContent({ m, isActive }: { m: MemoData; isActive: boolean }) {
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [estimate, setEstimate] = useState<MfgEstimate | null>(null)

  const mfgScore = m.scores.manufacturing?.score ?? 5
  const complexityHint = mfgScore >= 8 ? 'Low' : mfgScore >= 6 ? 'Medium' : 'High'

  const load = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('loading')
    try {
      const res = await fetch('/api/manufacturing', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product:    m.category_name,
          category:   inferManufacturingCategory(m.product_recommendation?.format ?? ''),
          complexity: complexityHint,
          moq_hint:   m.product_recommendation?.cogs_estimate ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setEstimate(await res.json())
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }, [status, m, complexityHint])

  // fetch once, the first time this tab is actually viewed — not on page load
  useEffect(() => {
    if (isActive && status === 'idle') load()
  }, [isActive, status, load])

  const evidence: EvidenceType = estimate?.data_source && estimate.data_source !== 'ai_synthesis' ? 'verified' : 'ai-synthesis'

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.07]">
        <h2 className="font-serif text-xl font-medium">Manufacturing Intelligence</h2>
        {status === 'done' && <EvidenceBadge type={evidence} />}
      </div>
      {status === 'loading' && (
        <div className="flex items-center gap-2.5 text-sm text-zinc-500 py-6 justify-center">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin shrink-0" />
          Estimating manufacturing parameters…
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-red-400/80 bg-red-400/5 border border-red-400/15 rounded-lg px-3 py-2.5">
          <IconX className="w-3.5 h-3.5 shrink-0 mt-px" />
          Manufacturing estimate unavailable — please try again later.
        </div>
      )}
      {status === 'done' && estimate && (
        <ManufacturingDisplay est={estimate} mfgScore={mfgScore} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FINAL RECOMMENDATION — closing visual moment, derived from
// existing decision/derive helpers, no new data.
// ═══════════════════════════════════════════════════════════════

function FinalRecommendation({ m, decision }: { m: MemoData; decision: BuildDecision }) {
  const budget = deriveValidationBudget(m)
  const kill   = deriveKillCriteria(m)
  const cfg = {
    BUILD_NOW:        { label: 'Build Now',      cls: 'text-emerald-400', bg: 'bg-emerald-400/5 border-emerald-400/15' },
    VALIDATE_FURTHER: { label: 'Validate First', cls: 'text-amber-400',   bg: 'bg-amber-400/5 border-amber-400/15'   },
    SKIP:             { label: 'Pass',           cls: 'text-red-400',     bg: 'bg-red-400/5 border-red-400/15'       },
  }[decision]

  return (
    <div className={`card-premium p-6 sm:p-9 border ${cfg.bg}`}>
      <p className="label mb-5">Final Recommendation</p>
      <div className="flex items-baseline gap-3 mb-4">
        <span className={`font-serif text-3xl font-medium tracking-tight ${cfg.cls}`}>{cfg.label}</span>
        <span className="text-sm text-zinc-500">at {budget.range} initial validation spend</span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-6">{m.build_explanation}</p>
      <div className="pt-5 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Watch for</p>
        <p className="text-xs text-zinc-400 leading-relaxed">{kill[0]}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT — full report assembly
// ═══════════════════════════════════════════════════════════════

function DeepDiveSection({
  title, evidence, children,
}: { title: string; evidence?: EvidenceType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.07]">
        <h2 className="font-serif text-xl font-medium">{title}</h2>
        {evidence && <EvidenceBadge type={evidence} />}
      </div>
      {children}
    </div>
  )
}

export default function MemoDisplay({ memo: m, generatedAt }: { memo: MemoData; generatedAt?: string }) {
  const { score, decision } = computeScore(m)
  const confidence          = computeConfidence(m)
  const blocks              = deriveDecisionBlocks(m)
  const containerRef        = useRef<HTMLDivElement>(null)
  const tabPanelRef         = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState(NAV_SECTIONS[0].id)

  function jumpToTab(id: string) {
    setActiveTab(id)
    tabPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={containerRef} className="lg:grid lg:grid-cols-[1fr_272px] lg:gap-10 lg:items-start">

      {/* ── Main document column ────────────────────────────────────── */}
      <div className="space-y-5 min-w-0">

        {/* ── Always visible: ticker, masthead, executive summary, graph, thesis ── */}
        <div className="space-y-5 animate-in">
          <TickerStrip score={score} decision={decision} confidence={confidence} m={m} />
          <Masthead m={m} score={score} decision={decision} confidence={confidence} generatedAt={generatedAt} />
          <ExecutiveSummary m={m} />
          <IntelligenceGraph m={m} score={score} decision={decision} onJump={jumpToTab} />
          <InvestmentThesisSection m={m} blocks={blocks} />
        </div>

        {/* ── Sticky horizontal tab strip (mobile/tablet only) ───────── */}
        <SectionNav active={activeTab} onSelect={jumpToTab} />

        {/* ── Deep-dive sections — true tabs: one pane visible at a time ── */}
        <div ref={tabPanelRef} className="card-premium p-6 sm:p-8 min-h-[420px] scroll-mt-6">
          <div className={activeTab === 'market-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Market Intelligence" evidence="multi-source">
              <MarketIntelligenceContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'consumer-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Consumer Intelligence" evidence="ai-synthesis">
              <ConsumerIntelligenceContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'manufacturing-intelligence' ? '' : 'hidden'}>
            <ManufacturingIntelligenceContent m={m} isActive={activeTab === 'manufacturing-intelligence'} />
          </div>

          <div className={activeTab === 'competitive-landscape' ? '' : 'hidden'}>
            <DeepDiveSection title="Competitive Landscape" evidence="ai-synthesis">
              <CompetitiveLandscapeContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'financial-outlook' ? '' : 'hidden'}>
            <DeepDiveSection title="Financial Outlook" evidence="estimated">
              <FinancialOutlookContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'launch-strategy' ? '' : 'hidden'}>
            <DeepDiveSection title="Launch Strategy" evidence="ai-synthesis">
              <LaunchStrategyContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'risk-assessment' ? '' : 'hidden'}>
            <DeepDiveSection title="Risk Assessment" evidence="ai-synthesis">
              <RiskAssessmentContent m={m} />
            </DeepDiveSection>
          </div>
        </div>

        {/* ── Closing moment ───────────────────────────────────────── */}
        <FinalRecommendation m={m} decision={decision} />
      </div>

      {/* ── Persistent inspector rail (desktop only) ────────────────── */}
      <aside className="hidden lg:block lg:sticky lg:top-6 space-y-4">
        <AtAGlanceRail m={m} score={score} decision={decision} confidence={confidence} />
        <div className="card-premium p-5">
          <RailNav active={activeTab} onSelect={jumpToTab} />
        </div>
      </aside>
    </div>
  )
}
