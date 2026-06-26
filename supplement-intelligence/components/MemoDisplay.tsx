'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { MemoData, BuildDecision, SignalMetadata } from '@/types/index'
import type { ViralitySignal } from '@/lib/signal-engine/types'
import type { KeywordMetric } from '@/lib/keyword-engine/types'
import type { ThemeInsight } from '@/lib/consumer-intelligence'
import { computeGroundedScore } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import {
  IconTrendUp, IconTrendDown, IconBeaker, IconArrowRight, IconX, IconAlert,
} from '@/components/icons'
import { inferProductShape, ProductRenderHero } from '@/components/ProductGlyph'
import { LifestyleScene } from '@/components/LifestyleScene'
import {
  STATIC_PROVENANCE, demandProvenance, viralityProvenance, subscriptionProvenance,
  manufacturingScoreProvenance, marketSaturationProvenance,
  manufacturingTabProvenance, legacyCompetitionProvenance, toConfidenceBand,
  searchVolumeProvenance, searchGrowthProvenance, unitsSoldProvenance,
  revenueEvidenceProvenance, competitionEvidenceProvenance, categoryReviewDataProvenance,
  marketAccessibilityProvenance, keywordIntelligenceProvenance, consumerIntelligenceProvenance,
  scoreDimensionProvenance, opportunityScoreProvenance, consistencyFlagProvenance,
  biggestCompetitorProvenance, computeEvidenceCoverage, newsIntelligenceProvenance,
  type Provenance, type ProvenanceLevel,
} from '@/lib/provenance'
import type { NewsItem } from '@/lib/news-engine/types'

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
// SCORE — always recomputed from dimensions (corrects LLM math), same as
// before. As of 2026-06-24, the formula itself moved to lib/scoring.ts:
// real provider scores (Keepa/Apify/DataForSEO/TikTok) replace the model's
// own self-assessment wherever a real signal exists; only dimensions with
// no real data source stay model-estimated, and are marked as such in the
// UI breakdown rather than blended in invisibly. See lib/scoring.ts for the
// full rationale — this wrapper exists only so existing call sites below
// don't need to change.
// ═══════════════════════════════════════════════════════════════

function computeScore(m: MemoData): { score: number; decision: BuildDecision } {
  const { score, decision } = computeGroundedScore(m)
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
// EVIDENCE BADGE — source transparency on every section. Four levels,
// matching exactly how the data is actually produced (see lib/provenance.ts
// for the full classification and the reasoning behind each one):
//   verified    — pulled directly from a real external source, no LLM step
//   estimated   — real data was retrieved and given to the model as
//                 grounding, but the model still wrote the final text
//   synthesized — pure model output, no external data involved
//   unknown     — provenance can't be reconstructed (legacy fields)
// Every badge carries a `title` tooltip with the specific one-line
// explanation for that exact field — hover for the full reasoning.
// ═══════════════════════════════════════════════════════════════

type EvidenceType = ProvenanceLevel

// Three user-facing tiers, not four — 'estimated' and 'synthesized' are kept
// as distinct internal ProvenanceLevel values (for nuance in code/tooltips)
// but read identically to a user: both are the model's own judgment, not a
// real external source. 'unknown' and 'unsupported' both surface as the
// same alarming "needs verification" treatment.
const EVIDENCE_CFG: Record<EvidenceType, { label: string; cls: string }> = {
  verified:    { label: 'Verified Data',                    cls: 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20' },
  estimated:   { label: 'AI Interpretation',                cls: 'text-amber-400   bg-amber-400/8   border-amber-400/20'   },
  synthesized: { label: 'AI Interpretation',                cls: 'text-amber-400   bg-amber-400/8   border-amber-400/20'   },
  unknown:     { label: 'Unsupported / Needs Verification', cls: 'text-red-400     bg-red-400/8     border-red-400/25'     },
  unsupported: { label: 'Unsupported / Needs Verification', cls: 'text-red-400     bg-red-400/8     border-red-400/25'     },
}

function EvidenceBadge({ type, detail, source }: { type: EvidenceType; detail?: string; source?: string }) {
  const { label, cls } = EVIDENCE_CFG[type]
  const title = detail ? (source ? `${source} — ${detail}` : detail) : undefined
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 tracking-wide shrink-0 cursor-default ${cls}`}
      title={title}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-70 shrink-0"/>
      {label}
    </span>
  )
}

// Same badge, but the detail renders as visible text underneath instead of
// a hover-only title — for first-read content (market thesis, score
// breakdown, consistency flags) where "hover to find out if this is real"
// is exactly the failure mode being fixed.
function ProvenanceCaption({ p }: { p: Provenance }) {
  const { label, cls } = EVIDENCE_CFG[p.level]
  return (
    <div className={`flex items-start gap-2 text-[11px] rounded-lg border px-2.5 py-2 ${cls}`}>
      <span className="font-semibold shrink-0 whitespace-nowrap">{label}:</span>
      <span className="opacity-90">{p.detail}</span>
    </div>
  )
}

// Convenience wrapper — render straight from a lib/provenance.ts Provenance
// object instead of hand-assembling type/source/detail at every call site.
function ProvenanceBadge({ p }: { p: Provenance }) {
  return <EvidenceBadge type={p.level} source={p.source} detail={p.detail} />
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

function truncateLabel(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
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


// Market/Margin appear in three different always-visible spots (Ticker
// Strip, Masthead, At-a-Glance rail) — same provenance caveat applies to all
// three, so it's centralized here rather than repeated at each call site.
const FACT_TOOLTIP: Record<string, string> = {
  MARKET: STATIC_PROVENANCE.marketSize.detail,
  MARGIN: STATIC_PROVENANCE.financialProjections.detail,
}

// These two (Market/Margin) are always AI Interpretation — no compact
// "at a glance" chip layout can fit a full visible caption, so this adds a
// consistent color + dot (same visual language as EvidenceBadge) instead of
// relying on the hover title alone. The same fields get a full visible
// caption in their dedicated tabs (Financial/Competitive) — this is the
// at-a-glance summary, not the only place they're explained.
function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center" title={FACT_TOOLTIP[label.toUpperCase()]}>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider flex items-center justify-center gap-1">
        <span className="w-1 h-1 rounded-full bg-amber-400/70 shrink-0" />
        {label}
      </p>
      <p className="text-xs font-semibold text-amber-200/90 mt-0.5 font-mono">{value}</p>
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
  { id: 'news-intelligence',         label: 'News' },
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

// ═══════════════════════════════════════════════════════════════
// DECISION STRIP — the first 15 seconds, and the only 15 seconds most
// readers get. Replaces TickerStrip (2026-06-26): same "glance at it from
// across the room" register, but every value is real evidence with its
// source named inline, not a duplicate rendering of the score that already
// appears in the Masthead two inches below. Verdict, score+grounding%
// (always shown fused — a score with no visible confidence is a number
// lying by omission), four real-evidence chips in a fixed narrative order
// (demand → competition → revenue → risk), and exactly one sentence of
// attributed AI synthesis. Nothing else competes for this screen.
// ═══════════════════════════════════════════════════════════════

interface DecisionChip { label: string; value: string; subValue?: string; source: string; trend?: 'up' | 'down' }

function parseTrendDirection(text: string | undefined): 'up' | 'down' | undefined {
  if (!text) return undefined
  const m = text.match(/([+-])\s*\d/)
  if (!m) return undefined
  return m[1] === '-' ? 'down' : 'up'
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// Every value here traces to a real provider — no AI-estimated number is
// ever eligible for this row. A dimension with no real source shows "No
// real data" rather than falling back to the model's guess, same rule as
// the rest of this report's evidence layer.
function deriveDecisionChips(m: MemoData): DecisionChip[] {
  const se = m.signal_evidence
  const chips: DecisionChip[] = []

  // DEMAND — prefer DataForSEO's real monthly search count, then a real
  // demand/growth signal from whichever provider supplied one.
  const topKw = m.keyword_intelligence?.top_buying?.[0]
  if (topKw) {
    chips.push({
      label: 'Demand', value: `${topKw.monthly_searches.toLocaleString()}/mo`,
      source: 'DataForSEO', trend: parseTrendDirection(se?.growth?.value.yoy_change ?? se?.demand?.value.trend),
    })
  } else if (se?.demand?.value.search_volume) {
    chips.push({ label: 'Demand', value: se.demand.value.search_volume, source: se.demand.primarySource, trend: parseTrendDirection(se.demand.value.trend) })
  } else if (se?.growth) {
    chips.push({ label: 'Demand', value: se.growth.value.yoy_change ?? 'Growth signal', source: se.growth.primarySource, trend: parseTrendDirection(se.growth.value.yoy_change) })
  } else {
    chips.push({ label: 'Demand', value: 'No real data', source: '—' })
  }

  // COMPETITION — real seller count + concentration; folds in the named
  // biggest competitor only when that name is itself real (Apify+Keepa
  // verified), never the model's guessed name.
  const rv = se?.review_velocity?.value
  if (rv?.meaningful_competitor_count !== undefined) {
    const verifiedName = m.signal_metadata?.competitor_revenue_verified ? m.biggest_competitor?.name : null
    chips.push({
      label: 'Competition',
      value: `${rv.meaningful_competitor_count} sellers`,
      subValue: verifiedName ? `top: ${verifiedName}` : undefined,
      source: se!.review_velocity!.primarySource,
    })
  } else {
    chips.push({ label: 'Competition', value: 'No real data', source: '—' })
  }

  // REVENUE — real price × real units-sold, never a category guess.
  const rev = se?.revenue?.value
  if (rev?.top_seller_revenue) {
    chips.push({ label: 'Revenue', value: `${rev.top_seller_revenue} top seller`, source: se!.revenue!.primarySource })
  } else if (rev?.est_monthly_revenue) {
    chips.push({ label: 'Revenue', value: `${rev.est_monthly_revenue} avg`, source: se!.revenue!.primarySource })
  } else {
    chips.push({ label: 'Revenue', value: 'No real data', source: '—' })
  }

  // RISK — real FDA recall check via News Intelligence. Absence of a
  // recall is itself a checked, real fact, not an omission.
  const ni = m.news_intelligence
  if (ni?.hasRecentNews) {
    const recall = ni.items.find(it => it.category === 'FDA Recall')
    chips.push({
      label: 'Risk',
      value: recall ? `Recall, ${daysAgo(recall.date)}d ago` : 'No recalls found',
      source: recall ? 'openFDA' : ni.providersUsed.join('/'),
    })
  } else if (ni) {
    chips.push({ label: 'Risk', value: 'No recent events', source: ni.providersUsed.join('/') || 'openFDA/PubMed/GDELT' })
  } else {
    chips.push({ label: 'Risk', value: 'Not checked', source: '—' })
  }

  return chips
}

function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/^.+?[.!?](?:\s|$)/)
  return (match ? match[0] : text).trim()
}

function DecisionChipRow({ chip }: { chip: DecisionChip }) {
  return (
    <div className="flex-1 min-w-[150px] max-w-[220px]">
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">{chip.label}</p>
      <p className="text-sm font-semibold text-zinc-100 font-mono flex items-center gap-1.5">
        {chip.trend === 'up' && <IconTrendUp className="w-3 h-3 text-emerald-400 shrink-0" />}
        {chip.trend === 'down' && <IconTrendDown className="w-3 h-3 text-red-400 shrink-0" />}
        <span className="truncate">{chip.value}</span>
      </p>
      {chip.subValue && <p className="text-xs text-zinc-400 truncate mt-0.5">{chip.subValue}</p>}
      <p className="text-[10px] text-zinc-600 mt-0.5">{chip.source}</p>
    </div>
  )
}

function DecisionStrip({
  m, score, decision, generatedAt,
}: {
  m: MemoData; score: number; decision: BuildDecision; generatedAt?: string
}) {
  const c = decision === 'BUILD_NOW' ? 'text-emerald-400' : decision === 'VALIDATE_FURTHER' ? 'text-amber-400' : 'text-red-400'
  const { groundedPct } = computeGroundedScore(m)
  const groundedC = groundedPct >= 50 ? 'text-emerald-400' : groundedPct >= 25 ? 'text-amber-400' : 'text-red-400'
  const chips = deriveDecisionChips(m)
  const synthesis = firstSentence(m.market_thesis ?? m.executive_summary)
  const dateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card-premium p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{m.category_name}</p>
          <div className="flex items-baseline gap-3">
            <VerdictBadge d={decision} />
            <span className={`font-serif font-medium text-2xl ${c}`}>{score}<span className="text-zinc-600 text-sm font-sans"> / 100</span></span>
            <span className={`text-[11px] font-mono ${groundedC}`}>{groundedPct}% real data</span>
          </div>
        </div>
        {dateLabel && <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider shrink-0">as of {dateLabel}</span>}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-4 pt-4 border-t border-white/[0.06]">
        {chips.map(chip => <DecisionChipRow key={chip.label} chip={chip} />)}
      </div>

      {synthesis && (
        <div className="mt-5 rounded-lg bg-amber-400/[0.04] border border-amber-400/15 px-3.5 py-3">
          <p className="text-[9px] text-amber-400/80 uppercase tracking-widest font-semibold mb-1.5">Analyst View</p>
          <p className="text-sm text-zinc-300 leading-relaxed font-serif italic">{synthesis}</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MASTHEAD — document header. Establishes "dossier", not "AI output".
// ═══════════════════════════════════════════════════════════════

// Score Breakdown — every dimension behind the headline number, each
// labeled Verified Data or AI Interpretation, visible by default (not a
// hover tooltip). This is the direct fix for "the score is mostly
// ungrounded but reads as confident" — the grounded % and the per-
// dimension source are now impossible to miss on first read.
// Evidence Coverage — a whole-report metric, distinct from the Score
// Breakdown below (which only covers the 8 dimensions feeding the
// opportunity score). This counts every field a memo can show — narrative,
// financial, competitive, evidence-layer — and reports what fraction is
// real data vs AI judgment for THIS specific generation. "No data
// available" counts as not-grounded here, same as anything AI-only by
// nature, since both mean less of this report is backed by real evidence.
function EvidenceCoveragePanel({ m }: { m: MemoData }) {
  const cov = computeEvidenceCoverage(m)
  const color = cov.pct >= 50 ? 'text-emerald-400' : cov.pct >= 25 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="mt-7 pt-5 border-t border-white/[0.06]">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Evidence Coverage</p>
        <span className={`text-lg font-serif font-medium ${color}`}>{cov.pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
        <div className={`h-full ${cov.pct >= 50 ? 'bg-emerald-400/60' : cov.pct >= 25 ? 'bg-amber-400/60' : 'bg-red-400/60'}`} style={{ width: `${cov.pct}%` }} />
      </div>
      <p className="text-[11px] text-zinc-500">
        {cov.groundedCount} of {cov.totalCount} report fields are backed by real provider data ({cov.verifiedCount} verified, {cov.estimatedCount} estimated) — the rest ({cov.synthesizedCount + cov.unknownCount}) are AI judgment or unavailable for this query.
      </p>
    </div>
  )
}

function ScoreBreakdownPanel({ m }: { m: MemoData }) {
  const { dimensions, groundedPct } = computeGroundedScore(m)
  return (
    <div className="mt-7 pt-5 border-t border-white/[0.06]">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
        Score Breakdown — {groundedPct}% grounded in real data
      </p>
      <ProvenanceCaption p={opportunityScoreProvenance(groundedPct)} />
      <div className="mt-3 space-y-2.5">
        {dimensions.map(d => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-xs text-zinc-300 w-40 shrink-0 truncate">{d.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full ${d.source === 'verified' ? 'bg-emerald-400/60' : 'bg-amber-400/60'}`}
                style={{ width: `${d.rawScore * 10}%` }}
              />
            </div>
            <span className="text-xs font-mono text-zinc-400 w-10 text-right shrink-0">{d.rawScore}/10</span>
            <EvidenceBadge type={d.source} source={d.sourceLabel} detail={`Weighted ${Math.round(d.weight * 100)}% of the final score.`} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Consistency Flags — claims that were checked against real evidence
// (lib/consistency.ts) and contradicted it, or had none to point to.
// Rendered visibly, not suppressed — finding zero flags is reported too,
// so absence of warnings isn't ambiguous with "wasn't checked."
function ConsistencyFlagsPanel({ m }: { m: MemoData }) {
  const flags = checkConsistency(m)
  return (
    <div className="mt-6 pt-5 border-t border-white/[0.06]">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Consistency Check</p>
      {flags.length === 0 ? (
        <ProvenanceCaption p={{ level: 'verified', source: 'Consistency check', detail: 'No contradictions found between this memo’s claims and the real evidence collected for it.' }} />
      ) : (
        <div className="space-y-2">
          {flags.map((f, i) => <ProvenanceCaption key={i} p={consistencyFlagProvenance(f)} />)}
        </div>
      )}
    </div>
  )
}

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

  const consumerIntelTimedOut = !m.consumer_intelligence && !!m.signal_metadata?.consumer_intelligence_attempted

  return (
    <div className={`card-premium p-6 sm:p-9 ${glow}`}>
      <div className="flex items-center justify-between mb-6 pb-5 border-b border-white/[0.06]">
        <span className="eyebrow text-[13px]">Investment Dossier</span>
        <span className="text-[10px] font-medium text-zinc-600 font-mono uppercase tracking-wider">
          {dateLabel ? `Prepared ${dateLabel}` : 'Confidential'}
        </span>
      </div>

      {consumerIntelTimedOut && (
        <div className="mb-6 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-400 mb-0.5">Partial results available</p>
          <p className="text-[11px] text-zinc-500">Most real-data providers responded normally. The Consumer Intelligence review-data provider timed out for this run — see the Consumer tab for details. Everything else below reflects the providers that did respond.</p>
        </div>
      )}

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
          {([['Market', m.market_size], ['Margin', m.gross_margin]] as [string, string][])
            .filter(([, v]) => v && v !== 'N/A')
            .map(([l, v]) => <MetaChip key={l} label={l} value={v} />)}
        </div>
      </div>

      <EvidenceCoveragePanel m={m} />
      <ScoreBreakdownPanel m={m} />
      <ConsistencyFlagsPanel m={m} />
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
  const facts = ([['Market', m.market_size], ['Margin', m.gross_margin]] as [string, string][])
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
            <div key={l} className="flex items-center justify-between gap-3" title={FACT_TOOLTIP[l.toUpperCase()]}>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0">{l}</span>
              <span className="text-xs font-semibold text-zinc-300 font-mono text-right">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Momentum — turns the "Why Now" claim into a visual instead of pure
// prose. If the text quantifies its own growth claim (e.g. "+34% YoY"),
// that exact figure drives an animated trend sparkline. If it doesn't,
// momentum falls back to the existing demand score via the same SignalBars
// glyph used in the Signal Terminal — never a number that isn't in the data.
function extractGrowthPct(text?: string | null): number | null {
  if (!text) return null
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*%/)
  return match ? parseFloat(match[1]) : null
}

function MomentumSparkline({ positive, accent }: { positive: boolean; accent: string }) {
  const points: [number, number][] = positive
    ? [[2, 34], [26, 28], [50, 19], [74, 11], [98, 4]]
    : [[2, 4], [26, 11], [50, 19], [74, 28], [98, 35]]
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const [lx, ly] = points[points.length - 1]
  return (
    <svg viewBox="0 0 100 40" className="w-16 h-7 shrink-0">
      <path d={d} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 130, animation: 'sparklineDraw 1s var(--ease-premium, ease) both' }} />
      <circle cx={lx} cy={ly} r="3" fill={accent} />
    </svg>
  )
}

function MomentumBadge({ whyNow, demandNotes, demandScore }: { whyNow: string | null; demandNotes?: string; demandScore?: number }) {
  const pct = extractGrowthPct(whyNow) ?? extractGrowthPct(demandNotes)

  if (pct !== null) {
    const positive = pct >= 0
    const color = positive ? '#34d399' : '#f87171'
    const Icon = positive ? IconTrendUp : IconTrendDown
    return (
      <div className="flex items-center gap-3 shrink-0" title="Synthesized — this figure is restated from the Why Now text above, which is itself model-written and not independently sourced.">
        <MomentumSparkline positive={positive} accent={color} />
        <div>
          <div className="flex items-center gap-1" style={{ color }}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-serif font-medium text-xl leading-none">{positive ? '+' : ''}{pct}%</span>
          </div>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-1">Demand Momentum</p>
        </div>
      </div>
    )
  }

  if (typeof demandScore === 'number') {
    const level = demandScore >= 8 ? 'Strong' as const : demandScore >= 6 ? 'Moderate' as const : 'Weak' as const
    return (
      <div className="flex items-center gap-2.5 shrink-0" title="Synthesized — derived from the model's own 0–10 demand score, not a measured trend.">
        <SignalBars level={level} />
        <div>
          <p className="text-xs font-medium text-zinc-300">{level}</p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Momentum</p>
        </div>
      </div>
    )
  }
  return null
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
      </div>

      <blockquote className="border-l-2 border-brass/40 pl-4 sm:pl-5">
        <p className="font-serif italic text-xl sm:text-[1.5rem] text-zinc-50 leading-snug tracking-tight">
          {thesis}
        </p>
      </blockquote>
      <div className="mt-3">
        <ProvenanceCaption p={STATIC_PROVENANCE.marketThesis} />
      </div>

      {whyNow && (
        <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-start justify-between gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Why Now</p>
            <p className="text-sm text-zinc-400 leading-relaxed">{whyNow}</p>
            <div className="mt-3">
              <ProvenanceCaption p={STATIC_PROVENANCE.whyNow} />
            </div>
          </div>
          <MomentumBadge whyNow={whyNow} demandNotes={m.scores.demand?.notes} demandScore={m.scores.demand?.score} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// INVESTMENT THESIS — top reasons/risks, validation plan, budget.
// All content derived from existing memo fields via the same pure
// derive* helpers as before — only the shell changed.
// ═══════════════════════════════════════════════════════════════

interface DerivedPoint { text: string; tag: string; evidence: string | null }
interface DerivedRisk  { text: string; severity: 'High' | 'Medium' | 'Low'; evidence: string | null }
interface VBudget      { range: string; breakdown: string }

// Real-data citation for a derived reason/risk, keyed by the same tag used
// to label it. Returns null — not a fabricated fallback — when no real
// signal_evidence exists for that tag, so the UI can say "no real evidence"
// instead of silently showing nothing where evidence should be.
function evidenceCitation(tag: string, m: MemoData): string | null {
  const ev = m.signal_evidence
  if (!ev) return null

  if (tag === 'demand') {
    const topKeyword = m.keyword_intelligence?.top_buying?.[0]
    const g = ev.growth?.value
    const parts = [
      topKeyword ? `${topKeyword.monthly_searches.toLocaleString()}/mo searches ("${topKeyword.keyword}", DataForSEO)` : null,
      g?.yoy_change ? `${g.yoy_change} (${ev.growth!.primarySource})` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }

  if (tag === 'virality') {
    const v = ev.virality?.value
    if (v?.video_count === undefined || v.view_count === undefined) return null
    return `#${v.hashtag}: ${v.video_count.toLocaleString()} videos, ${v.view_count.toLocaleString()} views (TikTok)`
  }

  if (tag === 'market') {
    const rv = ev.review_velocity?.value
    if (rv?.meaningful_competitor_count === undefined) return null
    const concentration = rv.review_concentration_ratio !== undefined ? `, ${Math.round(rv.review_concentration_ratio * 100)}% review concentration` : ''
    return `${rv.meaningful_competitor_count} meaningful competitors${concentration} (${ev.review_velocity!.primarySource})`
  }

  if (tag === 'revenue') {
    const rev = ev.revenue?.value
    if (!rev?.avg_seller_revenue) return null
    return `Avg seller ${rev.avg_seller_revenue}, top seller ${rev.top_seller_revenue ?? '—'} (${ev.revenue!.primarySource})`
  }

  return null
}

function deriveTop3Build(m: MemoData): DerivedPoint[] {
  const points: Omit<DerivedPoint, 'evidence'>[] = []
  const dims = (
    ['demand','virality','subscription'] as const
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

  return points.slice(0, 3).map(p => ({ ...p, evidence: evidenceCitation(p.tag, m) }))
}

function deriveTop3Risks(m: MemoData): DerivedRisk[] {
  const risks: Omit<DerivedRisk, 'evidence'>[] = []
  const dimRisks = (
    ['demand','virality','subscription','manufacturing'] as const
  ).map(k => ({ score: m.scores[k]?.score ?? 10, notes: m.scores[k]?.notes ?? '', k }))
    .filter(d => d.score <= 5 && d.notes)
    .sort((a, b) => a.score - b.score)

  const riskTags: string[] = []
  for (const d of dimRisks.slice(0, 2)) {
    risks.push({ text: d.notes, severity: d.score <= 3 ? 'High' : 'Medium' })
    riskTags.push(d.k)
  }

  const sat = m.market_saturation
  if (sat?.competitive_intensity && risks.length < 3) {
    const sentence = sat.competitive_intensity.split(/\.\s+/)[0] + '.'
    const severity = sat.entry_difficulty === 'High' ? 'High'
                   : sat.entry_difficulty === 'Medium' ? 'Medium' : 'Low'
    risks.push({ text: sentence, severity })
    riskTags.push('market')
  }

  if (risks.length < 3 && m.biggest_competitor?.name && m.biggest_competitor.name !== 'N/A') {
    risks.push({
      text: `${m.biggest_competitor.name} (${m.biggest_competitor.revenue}) already occupies the space — ${m.biggest_competitor.gap}`,
      severity: 'Medium',
    })
    riskTags.push('market')
  }

  if (risks.length < 3) {
    risks.push({
      text: 'Market timing requires validation before committing capital — demand signals should be confirmed with a pre-sell test.',
      severity: 'Low',
    })
    riskTags.push('demand')
  }

  return risks.slice(0, 3).map((r, i) => ({ ...r, evidence: evidenceCitation(riskTags[i], m) }))
}

function deriveValidationSteps(m: MemoData): string[] {
  const d    = m.build_decision
  const gap  = m.market_gaps?.[0]?.replace(/\.$/, '') ?? 'the primary market gap'
  // Prefer the real, review-text-derived pain point over the AI-invented
  // one when available — same fix as the Consumer Intelligence tab: real
  // data is the primary source, not a fallback.
  const pain = m.consumer_intelligence?.negativeThemes?.[0]?.label ?? m.customer_language?.frustrations?.[0]
  const fmt  = m.product_recommendation?.format ?? 'product'
  const copy = m.customer_language?.ad_phrases?.[0]?.use_in_copy

  if (d === 'BUILD_NOW') {
    return [
      `Order minimum test batch at stated COGS and set a 30-day sell-through deadline.`,
      `Launch a conversion-optimised landing page targeting: ${gap}.`,
      copy ? `Run a $2k–$3k paid test using proven copy: "${copy}".`
           : `Run a $2k–$3k paid test on the highest-virality platform.`,
      `Track CAC and subscription conversion rate. Evaluate against success metrics at day 30 and day 60.`,
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
  if (fp.gross_margin && fp.gross_margin !== 'N/A') {
    out.push(`Gross margin at or above ${fp.gross_margin} by month 3`)
  }
  out.push(sub >= 7
    ? 'Subscription conversion rate > 30% of first-time purchasers'
    : 'Repeat purchase rate > 20% within 60 days')

  return out.slice(0, 4)
}

function deriveKillCriteria(m: MemoData): string[] {
  const sat = m.market_saturation
  const out: string[] = []

  const demandScore = m.scores.demand?.score ?? 0
  out.push(
    demandScore < 6
      ? 'Fewer than 30 organic units/month after 60-day test → insufficient market demand at this price'
      : 'Fewer than 50 organic units/month after 60-day test → adjust positioning before scaling',
  )

  out.push('CAC exceeds $80 with no subscription conversion > 20% → unprofitable unit economics')

  if (sat?.entry_difficulty === 'High' || sat?.concentration === 'Very High') {
    const comp = m.biggest_competitor?.name ?? 'dominant incumbents'
    out.push(`Unable to achieve measurable differentiation from ${comp} within 3 months → pivot or exit category`)
  } else {
    out.push('Direct competitor launches identical product at 20%+ lower price before reaching $10k MRR → reassess positioning')
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
  manufacturing: 'Manufacturing', gap: 'Market Gap', market: 'Market', angle: 'Entry Angle',
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
        <EvidenceBadge
          type="synthesized"
          detail="This section re-ranks and restates the dimension scores and market fields shown elsewhere in this memo — it does not add independent evidence of its own. Check Market Intelligence for which specific inputs were signal-grounded."
        />
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
            <ol className="space-y-2.5">
              {buildPts.map((pt, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="font-mono text-zinc-600 shrink-0 mt-px w-4 text-right">{i+1}</span>
                  <span>
                    {pt.text}{' '}
                    <span className="text-[10px] text-zinc-600 ml-1">[{TAG_LABEL[pt.tag] ?? pt.tag}]</span>
                    <span className="block text-[10px] mt-1 font-mono" style={{ color: pt.evidence ? '#34d399' : '#52525b' }}>
                      {pt.evidence ? `Evidence: ${pt.evidence}` : 'No real evidence available — model judgment only'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5">Top 3 Risks</p>
            <ol className="space-y-2.5">
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
                      <span className="block text-[10px] mt-1 font-mono" style={{ color: r.evidence ? '#34d399' : '#52525b' }}>
                        {r.evidence ? `Evidence: ${r.evidence}` : 'No real evidence available — model judgment only'}
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

// ── Consumer Archetype — the person behind the data, not just a transcript
// of quotes. An abstract, explicitly-synthesized subject card: a geometric
// signal-scan glyph (never implies a real photo) paired with the four
// customer_language fields recomposed as a profile instead of a pinboard.
// Every line is a literal pull from existing fields — nothing invented.
function PersonaGlyph({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 120 136" className="w-[72px] h-20 shrink-0" style={{ animation: 'heroRenderIn .6s var(--ease-premium, ease) both' }}>
      <circle cx="60" cy="68" r="54" fill="none" stroke={accent} strokeOpacity="0.10" />
      <circle cx="60" cy="68" r="42" fill="none" stroke={accent} strokeOpacity="0.16" strokeDasharray="2 4" />
      <path d="M16,132 Q16,92 60,88 Q104,92 104,132" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="46" r="26" fill="#0d0d10" stroke={accent} strokeWidth="2.5" />
      <circle cx="60" cy="46" r="3" fill={accent} />
    </svg>
  )
}

function ConsumerArchetype({ m }: { m: MemoData }) {
  const cl = m.customer_language
  const accent = '#C8A463'
  const fields = ([
    ['Core Frustration', cl.frustrations?.[0]],
    ['What They Want',   cl.desires?.[0]],
    ['What They Fear',   cl.fears?.[0]],
    ['Where This Lands', cl.ad_phrases?.[0]?.use_in_copy],
  ] as [string, string | undefined][]).filter(([, v]) => !!v)

  if (fields.length === 0) return null

  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Customer Archetype</p>
        <ProvenanceBadge p={STATIC_PROVENANCE.customerLanguage} />
      </div>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex justify-center sm:justify-start">
          <PersonaGlyph accent={accent} />
        </div>
        <dl className="flex-1 grid sm:grid-cols-2 gap-x-5 gap-y-3.5 min-w-0">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</dt>
              <dd className="text-[13px] text-zinc-200 leading-snug">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

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
      <ConsumerArchetype m={m} />
      <div className="flex items-center justify-between gap-3">
        <SectionIntro text="A pinboard, not a transcript — but every pin is AI-synthesized customer language, not a real review or survey quote. Useful for ideation and ad-copy testing, not as evidence of documented sentiment." />
        <ProvenanceBadge p={STATIC_PROVENANCE.customerLanguage} />
      </div>
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
  manufacturing: 'Manufacturing', competition: 'Market Accessibility',
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

// ── TikTok Signal Card — virality is the one dimension that's genuinely
// platform-native rather than a market metric, so it gets pulled out of the
// ledger into its own short-form-video-flavored card: a phone-frame glyph
// with the existing pulse-ring animation, instead of another data row.
// Score and notes are the same scores.virality fields the ledger row used.
function TikTokSignalCard({
  score, notes, provenance, virality,
}: { score: number; notes: string; provenance: Provenance; virality?: ViralitySignal }) {
  const level = score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const
  const color = level === 'Strong' ? '#34d399' : level === 'Moderate' ? '#fbbf24' : '#71717a'
  const hasRaw = virality?.video_count !== undefined && virality?.view_count !== undefined
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0d10] p-4">
      <div className="flex items-center gap-4">
        <div className="relative w-10 h-[58px] rounded-[11px] border-2 shrink-0 grid place-items-center" style={{ borderColor: `${color}55` }}>
          <PulseRings level={level} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-zinc-200">TikTok Signal</span>
            <ProvenanceBadge p={provenance} />
          </div>
          <p className="text-xs text-zinc-500 leading-snug line-clamp-2">{notes}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-serif font-medium text-2xl leading-none" style={{ color }}>
            {score}<span className="text-zinc-600 text-[10px] font-sans">/10</span>
          </p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-1">{level}</p>
        </div>
      </div>
      {hasRaw && (
        <div className="flex divide-x divide-white/[0.06] mt-3 pt-3 border-t border-white/[0.06]">
          <div className="flex-1 px-2 text-center">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider">#{virality!.hashtag}</p>
            <p className="text-xs text-zinc-500">real hashtag</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-zinc-200">{virality!.video_count!.toLocaleString()}</p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider">videos</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-zinc-200">{virality!.view_count!.toLocaleString()}</p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider">views</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EVIDENCE-FIRST PANELS — Demand / Revenue / Competition. Real metrics
// rendered first, the AI-facing dimension score last — the literal
// inverse of the old "score + one line of notes" ledger row. When no
// real signal data exists for this query, says so plainly rather than
// silently falling back to a number that looks the same as a real one.
// ═══════════════════════════════════════════════════════════════

// Every row always renders — label + (real value and its provenance badge)
// OR the literal string "No data available." Never a guessed number with
// nothing to back it, and never a row that just silently disappears.
function EvidenceMetricRow({
  label, value, provenance,
}: { label: string; value: string | undefined; provenance: Provenance | null }) {
  const hasData = !!value && !!provenance
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {hasData ? (
          <>
            <span className="text-sm font-mono font-semibold text-zinc-100 text-right">{value}</span>
            <ProvenanceBadge p={provenance!} />
          </>
        ) : (
          <span className="text-sm font-mono text-zinc-600 italic">No data available</span>
        )}
      </div>
    </div>
  )
}

interface EvidenceRowSpec { label: string; value: string | undefined; provenance: Provenance | null }

function EvidencePanel({
  title, metrics, scoreLabel, scoreProvenance, score, scoreLevel,
}: {
  title:           string
  metrics:         EvidenceRowSpec[]
  scoreLabel:      string
  scoreProvenance: Provenance | null
  score:           number | null
  scoreLevel:      'Strong' | 'Moderate' | 'Weak' | null
}) {
  const color = scoreLevel === 'Strong' ? '#34d399' : scoreLevel === 'Moderate' ? '#fbbf24' : '#71717a'

  return (
    <div className="rounded-xl border border-white/[0.07] p-4 sm:p-5">
      <p className="text-xs font-semibold text-zinc-200 mb-3">{title}</p>

      <div>
        {metrics.map(row => <EvidenceMetricRow key={row.label} {...row} />)}
      </div>

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/[0.06]">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{scoreLabel}</span>
        {score !== null && scoreLevel !== null && scoreProvenance ? (
          <div className="flex items-center gap-2">
            <ProvenanceBadge p={scoreProvenance} />
            <SignalBars level={scoreLevel} />
            <span className="font-serif font-medium text-lg leading-none" style={{ color }}>
              {score}<span className="text-zinc-600 text-[10px] font-sans">/10</span>
            </span>
          </div>
        ) : (
          <span className="text-sm font-mono text-zinc-600 italic">No data available</span>
        )}
      </div>
    </div>
  )
}

function DemandEvidencePanel({ m }: { m: MemoData }) {
  const ev        = m.signal_evidence
  const ki        = m.keyword_intelligence
  const growthSig = ev?.growth?.value
  const score     = m.scores.demand?.score ?? 0
  const level     = score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const

  // "Monthly Search Volume" real only via DataForSEO's top keyword for this query.
  const topKeyword = ki?.top_buying?.[0]
  const searchVolP = searchVolumeProvenance(ki)

  return (
    <EvidencePanel
      title="Demand Evidence"
      metrics={[
        { label: 'Monthly Search Volume',  value: topKeyword ? `${topKeyword.monthly_searches.toLocaleString()}/mo ("${topKeyword.keyword}")` : undefined, provenance: searchVolP },
        { label: 'Search Growth %',        value: growthSig?.yoy_change, provenance: searchGrowthProvenance(ev) },
        { label: 'Search Trend Direction', value: growthSig?.momentum,   provenance: searchGrowthProvenance(ev) },
      ]}
      scoreLabel="Demand Score"
      scoreProvenance={demandProvenance(m.signal_metadata)}
      score={score}
      scoreLevel={level}
    />
  )
}

function RevenueEvidencePanel({ m }: { m: MemoData }) {
  const ev     = m.signal_evidence
  const rev    = ev?.revenue?.value
  const revP   = revenueEvidenceProvenance(ev)
  const unitsP = unitsSoldProvenance(ev)
  const reviewP = categoryReviewDataProvenance(ev)
  // There is no dimension in m.scores for revenue (unlike demand/virality/etc.) —
  // so when Keepa has no revenue signal, there is no fallback number at all,
  // real or synthesized. "No data available" applies to the score too here.
  const score = rev ? rev.score : null
  const level = rev ? (rev.score >= 7 ? 'Strong' as const : rev.score >= 4 ? 'Moderate' as const : 'Weak' as const) : null

  return (
    <EvidencePanel
      title="Revenue Evidence"
      metrics={[
        { label: 'Estimated Monthly Units Sold', value: rev?.est_monthly_units_sold, provenance: unitsP },
        { label: 'Estimated Monthly Revenue',    value: rev?.est_monthly_revenue,    provenance: revP },
        { label: 'Top Seller Revenue',           value: rev?.top_seller_revenue,     provenance: revP },
        { label: 'Average Seller Revenue',       value: rev?.avg_seller_revenue,     provenance: revP },
        { label: 'Category Avg Rating',          value: rev?.avg_rating ? `${rev.avg_rating}/5` : undefined, provenance: reviewP },
        { label: 'Category Avg Review Count',    value: rev?.avg_review_count !== undefined ? rev.avg_review_count.toLocaleString() : undefined, provenance: reviewP },
      ]}
      scoreLabel="Revenue Score"
      scoreProvenance={revP}
      score={score}
      scoreLevel={level}
    />
  )
}

// Compact list of the real top competitors behind the aggregate metrics
// above — same source data (Apify junglee/amazon-crawler), itemized rather
// than just counted. No sponsored-ad flag exists on this actor's output
// (confirmed live, documented in providers/competition.ts) — these are the
// top real results by review count, not filtered for ad placement.
function MeaningfulCompetitorsList({ competitors }: { competitors: { brand: string; reviewCount: number; rating: number; price: number }[] }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-4 sm:p-5">
      <p className="text-xs font-semibold text-zinc-200 mb-3">Meaningful Competitors</p>
      <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm min-w-[360px]">
          <thead>
            <tr className="bg-white/[0.04] text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left py-2 px-3">Brand</th>
              <th className="text-right py-2 px-3">Reviews</th>
              <th className="text-right py-2 px-3">Rating</th>
              <th className="text-right py-2 px-3">Price</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((c, i) => (
              <tr key={i} className="border-t border-white/[0.05]">
                <td className="py-2 px-3 font-medium text-zinc-200">{c.brand}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-300">{c.reviewCount.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-300">{c.rating.toFixed(1)}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-300">${c.price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompetitionEvidencePanel({ m }: { m: MemoData }) {
  const ev      = m.signal_evidence
  const rv      = ev?.review_velocity?.value
  const hasReal = rv?.meaningful_competitor_count !== undefined
  const compP   = competitionEvidenceProvenance(ev)

  const sat = m.market_saturation
  const fallbackScore = sat ? (sat.entry_difficulty === 'Low' ? 8 : sat.entry_difficulty === 'Medium' ? 5 : 2) : 5
  const score = hasReal ? rv!.score : fallbackScore
  const level = score >= 7 ? 'Strong' as const : score >= 4 ? 'Moderate' as const : 'Weak' as const

  return (
    <div className="space-y-3">
      <EvidencePanel
        title="Competition Evidence"
        metrics={[
          { label: 'Competitor Count',       value: rv?.meaningful_competitor_count !== undefined ? String(rv.meaningful_competitor_count) : undefined, provenance: compP },
          { label: 'Average Review Count',   value: rv?.avg_review_count !== undefined ? rv.avg_review_count.toLocaleString() : undefined,               provenance: compP },
          { label: 'Market Concentration',   value: rv?.review_concentration_ratio !== undefined ? `${Math.round(rv.review_concentration_ratio * 100)}% held by top 3 sellers` : undefined, provenance: compP },
        ]}
        scoreLabel="Market Accessibility Score"
        scoreProvenance={marketAccessibilityProvenance(ev)}
        score={score}
        scoreLevel={level}
      />
      {rv?.top_competitors && rv.top_competitors.length > 0 && (
        <MeaningfulCompetitorsList competitors={rv.top_competitors} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// KEYWORD INTELLIGENCE — real per-keyword search data from DataForSEO
// (m.keyword_intelligence, server-captured, never touched by the model).
// Four buckets, each a literal Keyword / Monthly Searches / Growth table —
// the goal is that a user immediately sees what people actually search for,
// not a paraphrase of it.
// ═══════════════════════════════════════════════════════════════

const KEYWORD_BUCKETS = [
  { key: 'top_buying'   as const, label: 'Top Buying' },
  { key: 'opportunity'  as const, label: 'Opportunity' },
  { key: 'long_tail'    as const, label: 'Long-Tail' },
  { key: 'fast_growing' as const, label: 'Fast-Growing' },
]

function KeywordTable({ keywords }: { keywords: KeywordMetric[] }) {
  if (keywords.length === 0) {
    return <p className="text-xs text-zinc-600 italic py-4 text-center">No keywords met this bucket&rsquo;s criteria for this query.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="bg-white/[0.04] text-[10px] text-zinc-500 uppercase tracking-wider">
            <th className="text-left py-2.5 px-3">Keyword</th>
            <th className="text-right py-2.5 px-3">Monthly Searches</th>
            <th className="text-right py-2.5 px-3">Growth</th>
            <th className="text-right py-2.5 px-3 hidden sm:table-cell">Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => (
            <tr key={i} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
              <td className="py-2.5 px-3 font-medium text-zinc-200">{k.keyword}</td>
              <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{k.monthly_searches.toLocaleString()}</td>
              <td className={`py-2.5 px-3 text-right font-mono ${k.growth_pct === null ? 'text-zinc-600' : k.growth_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {k.growth_pct === null ? '—' : `${k.growth_pct >= 0 ? '+' : ''}${k.growth_pct}%`}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-zinc-500 hidden sm:table-cell">{k.difficulty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeywordIntelligenceSection({ m }: { m: MemoData }) {
  const ki = m.keyword_intelligence
  const [active, setActive] = useState<typeof KEYWORD_BUCKETS[number]['key']>('top_buying')

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Keyword Intelligence</p>
        {keywordIntelligenceProvenance(ki) && <ProvenanceBadge p={keywordIntelligenceProvenance(ki)!} />}
      </div>

      {!ki ? (
        <p className="text-sm font-mono text-zinc-600 italic py-3">No data available</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-[10px] text-zinc-600">Seed: &ldquo;{ki.seed_keyword}&rdquo;</p>
            <p className="text-[10px] text-zinc-500">
              Keyword Source: <span className="font-mono text-zinc-300">{ki.provider === 'dataforseo' ? 'DataForSEO' : ki.provider}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 mb-3 overflow-x-auto no-scrollbar">
            {KEYWORD_BUCKETS.map(b => (
              <button
                key={b.key}
                onClick={() => setActive(b.key)}
                className={`text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                  active === b.key
                    ? 'bg-brass/10 border-brass/40 text-brass'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.16]'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <KeywordTable keywords={ki[active]} />
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER INTELLIGENCE — real review-text themes (lib/consumer-intelligence).
// Every row below is traceable to a literal phrase pulled from real
// customer reviews via deterministic clustering, never LLM summarization.
// No insight without a review count behind it — that's the whole point.
// ═══════════════════════════════════════════════════════════════

function ThemeList({ themes, limit, emptyLabel }: { themes: ThemeInsight[]; limit?: number; emptyLabel: string }) {
  const shown = limit ? themes.slice(0, limit) : themes
  if (!shown.length) {
    return <p className="text-xs text-zinc-600 italic py-2">{emptyLabel}</p>
  }
  return (
    <ul className="space-y-2">
      {shown.map((t, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-zinc-200 font-medium">&ldquo;{t.label}&rdquo;</span>
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">{t.mentionedBy}/{t.outOf} reviews</span>
          </div>
          <p className="text-[11px] text-zinc-600 italic mt-0.5 truncate">&ldquo;{t.exampleQuote}&rdquo;</p>
        </li>
      ))}
    </ul>
  )
}

function SentimentBars({ m }: { m: MemoData }) {
  const sb = m.consumer_intelligence?.sentimentBreakdown
  if (!sb) return null
  return (
    <div className="space-y-1.5">
      {sb.distribution.slice().reverse().map(d => (
        <div key={d.star} className="flex items-center gap-2 text-[11px]">
          <span className="text-zinc-500 w-10 shrink-0">{d.star}★</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-brass/50" style={{ width: `${d.pct}%` }} />
          </div>
          <span className="text-zinc-500 font-mono w-10 text-right shrink-0">{d.pct}%</span>
        </div>
      ))}
    </div>
  )
}

function ConsumerIntelligenceSection({ m }: { m: MemoData }) {
  const ci = m.consumer_intelligence
  const provenance = consumerIntelligenceProvenance(ci)
  // Distinguishes "never attempted" (no real competitor ASINs were found —
  // expected, honest) from "attempted but the Apify call timed out or
  // failed" (a real provider outage worth flagging, not silent).
  const attemptedButFailed = !ci && !!m.signal_metadata?.consumer_intelligence_attempted

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Consumer Intelligence</p>
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {!ci ? (
        attemptedButFailed ? (
          <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-400 mb-1">Some providers timed out</p>
            <p className="text-[11px] text-zinc-500">Real competitor products were found, but the review-data provider didn&rsquo;t return in time. This section is empty rather than estimated — re-running the analysis may succeed if the provider was just slow this once.</p>
          </div>
        ) : (
          <p className="text-sm font-mono text-zinc-600 italic py-3">No data available</p>
        )
      ) : (
        <div className="space-y-5 mt-3">
          <p className="text-[11px] text-zinc-600">
            Source: {ci.totalReviewsCollected} real reviews
            {(ci.productsAnalyzed ?? []).length > 0 && <> across {(ci.productsAnalyzed ?? []).map(p => p.brand).join(', ')}</>}
            {' '}({ci.confidence >= 0.7 ? 'high' : ci.confidence >= 0.4 ? 'moderate' : 'low'} confidence)
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">Sentiment Breakdown</p>
              <p className="text-[11px] text-zinc-500 mb-2">
                Avg rating <span className="font-mono text-zinc-300">{ci.sentimentBreakdown.avgRating}/5</span> across {ci.sentimentBreakdown.totalReviews} reviews
                {' '}— {ci.sentimentBreakdown.positivePct}% positive, {ci.sentimentBreakdown.neutralPct}% neutral, {ci.sentimentBreakdown.negativePct}% negative
              </p>
              <SentimentBars m={m} />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">Top Complaints</p>
              <ThemeList themes={ci.negativeThemes} limit={5} emptyLabel="No recurring complaints met the minimum review-count threshold." />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">What Customers Love</p>
              <ThemeList themes={ci.positiveThemes} limit={5} emptyLabel="No recurring praise met the minimum review-count threshold." />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">Most Mentioned Problems <span className="text-[10px] text-zinc-600 font-normal">(any rating)</span></p>
              <ThemeList themes={ci.mostMentionedProblems} limit={5} emptyLabel="No problems mentioned widely enough across all ratings." />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">Feature Requests</p>
              <ThemeList themes={ci.featureRequests} limit={5} emptyLabel="No recurring feature requests found in this review sample." />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-zinc-200 mb-3">Customer Pain Points & Positive Themes <span className="text-[10px] text-zinc-600 font-normal">(full lists)</span></p>
              <p className="text-[10px] text-zinc-600 mb-2">Pain Points / Negative Themes — same data as Top Complaints, full ranked list:</p>
              <ThemeList themes={ci.negativeThemes} emptyLabel="None." />
              <p className="text-[10px] text-zinc-600 mt-3 mb-2">Positive Themes — same data as What Customers Love, full ranked list:</p>
              <ThemeList themes={ci.positiveThemes} emptyLabel="None." />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// RECENT MARKET INTELLIGENCE — real news items (openFDA/PubMed/GDELT),
// never the LLM. Only the per-item caption and the summary block below are
// AI-written, and only as an explanation of items already fetched — see
// lib/news-engine and newsIntelligenceProvenance for the full contract.
// ═══════════════════════════════════════════════════════════════

const NEWS_CATEGORY_CLS: Record<string, string> = {
  'FDA Recall':              'text-red-400 bg-red-400/10 border-red-400/20',
  'Regulatory Change':       'text-amber-400 bg-amber-400/10 border-amber-400/20',
  'Acquisition':             'text-violet-400 bg-violet-400/10 border-violet-400/20',
  'Funding Round':           'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  'Competitor Announcement': 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  'Product Launch':          'text-sky-400 bg-sky-400/10 border-sky-400/20',
  'Scientific Study':        'text-zinc-300 bg-white/[0.06] border-white/[0.12]',
  'Industry News':           'text-zinc-400 bg-white/[0.04] border-white/[0.1]',
}

const TRAJECTORY_CLS: Record<string, string> = {
  Accelerating: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Stable:       'text-zinc-300 bg-white/[0.06] border-white/[0.12]',
  Slowing:      'text-amber-400 bg-amber-400/10 border-amber-400/20',
  Unknown:      'text-zinc-500 bg-white/[0.03] border-white/[0.08]',
}

function NewsItemCard({ item }: { item: NewsItem }) {
  const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-white/[0.07] p-4 hover:border-white/[0.16] hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${NEWS_CATEGORY_CLS[item.category] ?? NEWS_CATEGORY_CLS['Industry News']}`}>
          {item.category}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono shrink-0">{dateStr}</span>
      </div>
      <p className="text-sm text-zinc-200 leading-snug mb-1.5">{item.headline}</p>
      <p className="text-[11px] text-zinc-600 mb-2">{item.source} · {Math.round(item.confidence * 100)}% relevance match</p>
      {item.why_it_matters && (
        <p className="text-[11px] text-zinc-500 leading-relaxed border-t border-white/[0.06] pt-2 mt-2">{item.why_it_matters}</p>
      )}
    </a>
  )
}

function NewsIntelligenceSection({ m }: { m: MemoData }) {
  const ni = m.news_intelligence
  const provenance = newsIntelligenceProvenance(ni)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Recent Market Intelligence</p>
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {!ni ? (
        <p className="text-sm font-mono text-zinc-600 italic py-3">No data available</p>
      ) : (
        <div className="space-y-6 mt-3">
          <p className="text-[11px] text-zinc-600">
            Window: last {ni.windowDays} days · Sources: {ni.providersUsed.length ? ni.providersUsed.join(', ') : 'none returned results'}
          </p>

          <div className="rounded-xl border border-white/[0.07] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-zinc-200">What Changed</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${TRAJECTORY_CLS[ni.summary.trajectory]}`}>
                {ni.summary.trajectory}
              </span>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">{ni.summary.what_changed}</p>

            {(ni.summary.new_risks.length > 0 || ni.summary.new_opportunities.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {ni.summary.new_risks.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">New Risks</p>
                    <ul className="space-y-1">
                      {ni.summary.new_risks.map((r, i) => <li key={i} className="text-[11px] text-zinc-500">• {r}</li>)}
                    </ul>
                  </div>
                )}
                {ni.summary.new_opportunities.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">New Opportunities</p>
                    <ul className="space-y-1">
                      {ni.summary.new_opportunities.map((o, i) => <li key={i} className="text-[11px] text-zinc-500">• {o}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {ni.items.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {ni.items.map(item => <NewsItemCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MarketIntelligenceContent({ m }: { m: MemoData }) {
  const { subscription } = m.scores
  const sig = m.signal_metadata
  const viralityP = viralityProvenance(sig)

  return (
    <div className="space-y-6">
      {/* Evidence first — real metrics before any AI-judged score. See
          DemandEvidencePanel/RevenueEvidencePanel/CompetitionEvidencePanel:
          each pulls straight from m.signal_evidence (server-captured at
          generation time, never touched by the model) and says plainly
          when no real data source was available, instead of quietly
          falling back to a number that looks the same as a real one. */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Evidence</p>
        <div className="grid sm:grid-cols-1 gap-3">
          <DemandEvidencePanel m={m} />
          <RevenueEvidencePanel m={m} />
          <CompetitionEvidencePanel m={m} />
        </div>
      </div>

      {/* Market structure — qualitative narrative, distinct from the
          quantitative Competition evidence panel above */}
      <div className="pt-5 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Market Structure (Narrative)</p>
          <ProvenanceBadge p={m.market_saturation ? marketSaturationProvenance(sig) : legacyCompetitionProvenance()} />
        </div>
        <MarketSaturationBlock m={m} />
      </div>

      {/* Subscription — no real data source exists for this dimension;
          virality gets its own platform-native card with raw evidence
          (see TikTokSignalCard) */}
      <div className="pt-5 border-t border-white/[0.06] space-y-3">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Other Signals</p>
        <div className="ledger">
          {(() => {
            const level = subscription.score >= 8 ? 'Strong' as const : subscription.score >= 6 ? 'Moderate' as const : 'Weak' as const
            return (
              <div className="ledger-row">
                <span className="text-xs font-semibold text-zinc-300 w-28 shrink-0">Subscription</span>
                <span className="font-serif font-medium text-base text-zinc-100 w-10 shrink-0">{subscription.score}<span className="text-zinc-600 text-[10px] font-sans">/10</span></span>
                <SignalBars level={level} />
                <span className="flex-1 text-xs text-zinc-500 truncate hidden md:inline">{subscription.notes}</span>
                <span className="ml-auto shrink-0 flex items-center gap-2">
                  <ProvenanceBadge p={subscriptionProvenance()} />
                </span>
              </div>
            )
          })()}
        </div>
        <TikTokSignalCard
          score={m.scores.virality.score}
          notes={m.scores.virality.notes}
          provenance={viralityP}
          virality={m.signal_evidence?.virality?.value}
        />
      </div>

      {/* Market gaps */}
      <div className="pt-5 border-t border-white/[0.06]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Market Gaps (AI-Identified)</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.marketGaps} />
        </div>
        <NumList items={m.market_gaps} />
      </div>

      {/* Keyword Intelligence — real per-keyword search data, when available */}
      <div className="pt-5 border-t border-white/[0.06]">
        <KeywordIntelligenceSection m={m} />
      </div>
      {/* Real review-text themes now live in the Consumer Intelligence tab
          itself (see DeepDiveSection "Consumer Intelligence" below) — moved
          there 2026-06-24 so it's the PRIMARY content of that tab instead of
          being buried in Market while the fabricated customer_language
          pinboard occupied the Consumer tab alone. */}
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
  const compProvenance = biggestCompetitorProvenance(m.signal_metadata)
  const compVerified = !!m.signal_metadata?.competitor_revenue_verified

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionIntro text={compVerified
          ? "Lead incumbent by real review count — name and revenue are real data, not model recall."
          : "Lead incumbent and the unclaimed positioning around them — competitor name, revenue, and gap are model recall, not pulled from any company database."} />
        <ProvenanceBadge p={compProvenance} />
      </div>
      {compVerified && (
        <ProvenanceCaption p={compProvenance} />
      )}

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
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Unclaimed Positioning Angles</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.brandOpportunities} />
        </div>
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
      <div className="flex items-center justify-between gap-3 mb-7">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Revenue Trajectory</p>
        <ProvenanceBadge p={STATIC_PROVENANCE.financialProjections} />
      </div>
      <div className="relative flex justify-between items-start">
        <div className="absolute left-[8%] right-[8%] top-[10px] h-[1.5px] bg-gradient-to-r from-zinc-600 via-amber-400/50 to-emerald-400/60" />
        {milestones.map(ms => (
          <div key={ms.label} className="relative flex flex-col items-center flex-1">
            <span
              className="rounded-full border-2 bg-[#0a0a0c] relative z-10"
              style={{ width: ms.size, height: ms.size, borderColor: ms.color }}
            />
            <span className="mt-3 text-sm font-semibold text-zinc-100 text-center">{ms.label}</span>
            <span className="text-xs font-mono mt-0.5" style={{ color: ms.value ? ms.color : '#71717a' }} title={ms.value ? 'Rounded to a 10-point band — the model\'s exact percentage implies more precision than an ungrounded estimate can support.' : undefined}>
              {ms.value ? toConfidenceBand(ms.value) : ms.sub}
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
      <div className="flex items-center justify-between gap-3">
        <SectionIntro text="Probability estimates based on comparable DTC launches. Not independently verified — treat as directional, not forecasts." />
        <ProvenanceBadge p={STATIC_PROVENANCE.financialProjections} />
      </div>
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
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 px-3 py-3.5 text-center" title={STATIC_PROVENANCE.financialProjections.detail}>
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

// 'AI Product Hero Image' and 'Lifestyle Images' shipped as generated
// concept visuals above (ProductConceptVisual / LifestyleScene) — removed
// from this list since they're no longer placeholders.
const MEDIA_PLACEHOLDERS = [
  'Packaging Concepts',
  'Product Shelf Visualization',
  'Brand Moodboard',
  'Launch Creative',
  'Short AI Commercial Preview',
]

// ── Product Concept Visual — a generated concept render, not a photo.
// Honest framing: studio-lit package shape inferred from the recommended
// format (cylindrical light wrap, specular hotspot, rim light, blurred
// contact shadow). It is explicitly labeled as a concept render so it
// never reads as a real product photo (that still requires a real
// image-gen pipeline). Shape inference + SVG rendering live in ProductGlyph.tsx.
function ProductConceptVisual({ format, categoryName }: { format: string; categoryName: string }) {
  const shape = inferProductShape(format)

  return (
    <div className="relative rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent p-6 sm:p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-1 relative z-10">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Product Concept</p>
        <p className="text-[10px] text-zinc-600 italic">Generated concept render — not a product photo</p>
      </div>
      <div className="flex items-center justify-center py-4 relative z-10" style={{ animation: 'heroRenderIn .8s var(--ease-premium, ease) both' }}>
        <ProductRenderHero shape={shape} />
      </div>
      <p className="text-center text-sm font-medium text-zinc-300 relative z-10">{categoryName}</p>
      <p className="text-center text-xs text-zinc-600 mt-0.5 relative z-10">{format}</p>
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
      <div className="flex items-center justify-between gap-3">
        <SectionIntro text="Recommended product configuration and entry sequence based on gap analysis, manufacturing constraints, and margin targets." />
        <ProvenanceBadge p={STATIC_PROVENANCE.productEconomics} />
      </div>

      <ProductConceptVisual format={rec.format} categoryName={m.category_name} />
      <LifestyleScene format={rec.format} dosing={rec.dosing} />

      <div className="flex flex-wrap sm:flex-nowrap divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-hidden">
        {([
          ['Format', rec.format],
          ['Usage',  rec.dosing],
          ['COGS',   rec.cogs_estimate],
          ['Retail', rec.retail_price],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 min-w-[100px] px-3 py-3" title={(l === 'COGS' || l === 'Retail') ? STATIC_PROVENANCE.productEconomics.detail : undefined}>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-zinc-300 leading-snug font-mono">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-zinc-500 uppercase tracking-widest">Key Ingredients / Components</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.productFormula} />
        </div>
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

// Each scored dimension has a different provenance function (demand/virality
// vary by signal_metadata, the rest are always model judgment) — this maps
// dimension key to the right one so Risk Assessment can badge each row
// accurately instead of guessing at a single blanket label for the tab.
function dimensionProvenance(key: string, sig?: SignalMetadata): Provenance {
  switch (key) {
    case 'demand':        return demandProvenance(sig)
    case 'virality':       return viralityProvenance(sig)
    case 'subscription':  return subscriptionProvenance()
    case 'manufacturing': return manufacturingScoreProvenance()
    default:               return legacyCompetitionProvenance()
  }
}

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
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${score <= 3 ? 'text-red-400' : 'text-amber-400'}`}>
                  {DIM_LABELS[key] ?? key}
                </p>
                <ProvenanceBadge p={dimensionProvenance(key, m.signal_metadata)} />
              </div>
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
  const sourceProvenance = manufacturingTabProvenance(est.data_source)

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
          <span>Source:</span><ProvenanceBadge p={sourceProvenance} />
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.07]">
        <h2 className="font-serif text-xl font-medium">Manufacturing Intelligence</h2>
        {status === 'done' && <ProvenanceBadge p={manufacturingTabProvenance(estimate?.data_source)} />}
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

// No single blanket evidence badge here — each tab mixes verified/estimated/
// synthesized fields, so a tab-level badge would necessarily oversimplify.
// Provenance is shown per-field/per-section throughout each tab's content
// instead (see the granular badges below each header).
function DeepDiveSection({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.07]">
        <h2 className="font-serif text-xl font-medium">{title}</h2>
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

        {/* ── Always visible: the first 15 seconds, then supporting detail ── */}
        <div className="space-y-5 animate-in">
          <DecisionStrip m={m} score={score} decision={decision} generatedAt={generatedAt} />
          <Masthead m={m} score={score} decision={decision} confidence={confidence} generatedAt={generatedAt} />
          <ExecutiveSummary m={m} />
          <InvestmentThesisSection m={m} blocks={blocks} />
        </div>

        {/* ── Sticky horizontal tab strip (mobile/tablet only) ───────── */}
        <SectionNav active={activeTab} onSelect={jumpToTab} />

        {/* ── Deep-dive sections — true tabs: one pane visible at a time ── */}
        <div ref={tabPanelRef} className="card-premium p-6 sm:p-8 min-h-[420px] scroll-mt-6">
          <div className={activeTab === 'market-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Market Intelligence">
              <MarketIntelligenceContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'news-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Recent Market Intelligence">
              <NewsIntelligenceSection m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'consumer-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Consumer Intelligence">
              <div className="space-y-8">
                {/* Real review-text data is the PRIMARY content of this tab —
                    moved here 2026-06-24 from the Market tab, where it was
                    easy to miss while this tab showed only AI-invented
                    personas with no real source. */}
                <ConsumerIntelligenceSection m={m} />

                <div className="pt-6 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest">AI-Generated Customer Personas</p>
                  </div>
                  <ProvenanceCaption p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: 'Everything below is invented by the model to read like real customer quotes. It is not pulled from the real reviews shown above — treat it as a creative starting point for messaging, not as research.' }} />
                  <div className="mt-4">
                    <ConsumerIntelligenceContent m={m} />
                  </div>
                </div>
              </div>
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'manufacturing-intelligence' ? '' : 'hidden'}>
            <ManufacturingIntelligenceContent m={m} isActive={activeTab === 'manufacturing-intelligence'} />
          </div>

          <div className={activeTab === 'competitive-landscape' ? '' : 'hidden'}>
            <DeepDiveSection title="Competitive Landscape">
              <CompetitiveLandscapeContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'financial-outlook' ? '' : 'hidden'}>
            <DeepDiveSection title="Financial Outlook">
              <FinancialOutlookContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'launch-strategy' ? '' : 'hidden'}>
            <DeepDiveSection title="Launch Strategy">
              <LaunchStrategyContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'risk-assessment' ? '' : 'hidden'}>
            <DeepDiveSection title="Risk Assessment">
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
