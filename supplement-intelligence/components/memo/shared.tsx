'use client'

// ═══════════════════════════════════════════════════════════════════════
// components/memo/shared.tsx — pure derive*/compute* helpers and small
// shared presentational primitives used across the memo/* section files.
// This is the direct successor to the derive*/Evidence-badge machinery
// that used to live inline in the old 3418-line components/MemoDisplay.tsx
// and components/lab/{Badges,Surfaces,Indicators}.tsx (both deleted) — same
// logic, same honesty rules, restyled onto the new design-token system
// (components/ui, tailwind verdict-* tokens) instead of hardcoded lab hex.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { ReactNode, ElementType } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'
import type { Provenance, ProvenanceLevel } from '@/lib/provenance'

// Phase 3 Investor Report integration (Roadmap M2.2–M2.5, M2.8, M1.4): the
// pure field-derivation functions live in field-derivations.ts (a plain
// .ts module, no JSX) so they're directly testable without a React
// component-testing toolchain — re-exported here so every existing
// `from './shared'` import site is unaffected.
export {
  deriveConfidenceDisplay,
  deriveKillCriteriaItems,
  deriveLifecycleDisplay, LIFECYCLE_STAGES,
  formatGapVelocity,
  deriveV2VerdictDisplay,
  deriveSupplyVelocityDisplay,
  deriveScienceDisplay,
} from './field-derivations'
export type {
  LifecycleDisplay, GapVelocityDisplay, V2VerdictDisplay, SupplyVelocityDisplay, ScienceDisplay,
} from './field-derivations'

// ── pi-* surface primitive ────────────────────────────────────────────────
// UIv2-M2 Phase 2 (2026-07-21): the warm-cream "pi" card, matching
// CandidateCoreHero/PipelineView/CandidateRow/app/analyze's already-shipped
// pattern (rounded-xl, hairline border, pi-card fill) — the direct visual
// replacement for components/ui/HardCard within this report. HardCard
// itself is left untouched since other, out-of-scope pages still use it.
export function PiCard({
  children, className = '', as: As = 'div', padded = true,
}: { children: ReactNode; className?: string; as?: ElementType; padded?: boolean }) {
  return (
    <As className={`rounded-xl border border-pi-hairline bg-pi-card ${padded ? 'p-4 sm:p-5' : ''} ${className}`}>
      {children}
    </As>
  )
}

// ── Provenance disclosure ────────────────────────────────────────────────
// Every real-vs-AI-judgment claim in the memo carries one of these. Direct
// successor to components/lab/Badges.tsx's EvidenceBadge/ProvenanceBadge/
// ProvenanceCaption — same five-level classification, same behavior,
// restyled onto pi-* design tokens (was verdict-*/black-white).

const EVIDENCE_CFG: Record<ProvenanceLevel, { label: string; cls: string; dot: string }> = {
  verified:    { label: 'Verified Data',                    cls: 'text-pi-ink border-pi-hairline bg-pi-card',            dot: 'bg-pi-ink' },
  estimated:   { label: 'AI Interpretation',                cls: 'text-pi-gold-bright border-pi-gold/30 bg-pi-gold/10',  dot: 'bg-pi-gold-bright' },
  synthesized: { label: 'AI Interpretation',                cls: 'text-pi-sub border-pi-hairline bg-pi-card',            dot: 'bg-pi-sub' },
  unknown:     { label: 'Unsupported / Needs Verification', cls: 'text-pi-risk border-pi-risk/30 bg-pi-risk/10',         dot: 'bg-pi-risk' },
  unsupported: { label: 'Unsupported / Needs Verification', cls: 'text-pi-risk border-pi-risk/30 bg-pi-risk/10',         dot: 'bg-pi-risk' },
}

export function EvidenceBadge({ type, detail, source }: { type: ProvenanceLevel; detail?: string; source?: string }) {
  const { label, cls, dot } = EVIDENCE_CFG[type]
  const title = detail ? (source ? `${source} — ${detail}` : detail) : undefined
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold rounded-full border px-2.5 py-0.5 uppercase tracking-wide shrink-0 cursor-default ${cls}`}
      title={title}
    >
      <span className={`w-1 h-1 rounded-full ${dot} shrink-0`} />
      {label}
    </span>
  )
}

export function ProvenanceBadge({ p }: { p: Provenance }) {
  return <EvidenceBadge type={p.level} source={p.source} detail={p.detail} />
}

// Same evidence levels, but the detail renders as visible text — for
// first-read content where "hover to find out if this is real" is exactly
// the failure mode being avoided.
export function ProvenanceCaption({ p }: { p: Provenance }) {
  const { label, cls } = EVIDENCE_CFG[p.level]
  return (
    <div className={`flex items-start gap-2 text-[11px] rounded-lg border px-2.5 py-2 ${cls}`}>
      <span className="font-semibold shrink-0 whitespace-nowrap">{label}:</span>
      <span className="opacity-90">{p.detail}</span>
    </div>
  )
}

export function ConfidencePill({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High'
    ? 'text-pi-build border-pi-build/30 bg-pi-build/10'
    : level === 'Medium'
      ? 'text-pi-gold-bright border-pi-gold/30 bg-pi-gold/10'
      : 'text-pi-sub border-pi-hairline bg-pi-card'
  const dot = level === 'High' ? 'bg-pi-build' : level === 'Medium' ? 'bg-pi-gold-bright' : 'bg-pi-sub'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {note}
    </span>
  )
}

export function LabNoData({ label = 'No data available' }: { label?: string }) {
  return <span className="font-mono text-sm text-pi-faint italic">{label}</span>
}

export function LabEmptyState({
  icon, title, description,
}: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-12 h-12 rounded-lg border border-pi-hairline flex items-center justify-center mb-4 text-pi-faint">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-pi-sub">{title}</p>
      {description && <p className="text-xs text-pi-faint mt-1.5 max-w-sm leading-relaxed">{description}</p>}
    </div>
  )
}

export function SectionIntro({ text }: { text: string }) {
  return <p className="text-xs text-pi-faint italic mb-4 leading-relaxed">{text}</p>
}

// Ascending 3-bar signal glyph — direct successor to
// components/lab/Indicators.tsx SignalBars, same three-tier meaning.
export function SignalBars({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const filled = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  const color  = level === 'Strong' ? 'bg-pi-build' : level === 'Moderate' ? 'bg-pi-gold-deep' : 'bg-pi-faint'
  return (
    <div className="flex items-end gap-0.5 h-3.5 shrink-0">
      {[0, 1, 2].map(i => (
        <span key={i} className={`w-1 ${i < filled ? color : 'bg-pi-hairline'}`} style={{ height: `${40 + i * 30}%` }} />
      ))}
    </div>
  )
}

// Collapsed to the top 2 by default — these lists run up to 10 items deep;
// the first 1-2 are almost always the ones that actually inform the
// decision.
export function NumList({ items, collapseAt = 2 }: { items: string[]; collapseAt?: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, collapseAt)
  const hiddenCount = Math.max(0, items.length - collapseAt)
  return (
    <ol className="space-y-3">
      {shown.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="font-mono text-pi-faint shrink-0 w-4 text-right mt-px">{i + 1}</span>
          <span className="text-pi-sub leading-relaxed">{item}</span>
        </li>
      ))}
      {hiddenCount > 0 && !expanded && (
        <li>
          <button onClick={() => setExpanded(true)} className="text-[11px] text-pi-gold-bright hover:underline transition-colors ml-7">
            Show {hiddenCount} more →
          </button>
        </li>
      )}
    </ol>
  )
}

export function truncateLabel(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/^.+?[.!?](?:\s|$)/)
  return (match ? match[0] : text).trim()
}

// 2026-06-26 redesign: financial/competitor fields now sometimes contain
// the full "Not independently verified — ..." sentence instead of a
// fabricated number — correct, but too long for a compact chip.
export function isUnverifiedText(v: string | undefined | null): boolean {
  return !v || v === 'N/A' || v.toLowerCase().includes('not independently verified')
}
export function shortFactValue(v: string): string {
  return isUnverifiedText(v) ? 'Not verified' : v
}

export const LEVEL_TO_SIGNAL: Record<'High' | 'Medium' | 'Low', 'Strong' | 'Moderate' | 'Weak'> = {
  High: 'Strong', Medium: 'Moderate', Low: 'Weak',
}

export function legacyScoreToLevelDisplay(score: number | undefined): 'High' | 'Medium' | 'Low' | undefined {
  if (typeof score !== 'number') return undefined
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'
}

// Qualitative-only (2026-06-26): 'High' is the build-reason bucket, 'Low'
// is the risk bucket. No magnitude exists to sort multiple 'High'
// dimensions against each other, since that magnitude was always the AI's
// own invented number.
export function dimLevel(m: MemoData, k: 'demand' | 'virality' | 'subscription' | 'manufacturing'): 'High' | 'Medium' | 'Low' | undefined {
  return m.scores[k]?.level ?? legacyScoreToLevelDisplay(m.scores[k]?.score)
}

export function mapAccessibility(score: number) {
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

// ── Real-data citations for derived reasons/risks ────────────────────────
// Returns null — not a fabricated fallback — when no real signal_evidence
// exists for that tag, so the UI can say "no real evidence" honestly.
export function evidenceCitation(tag: string, m: MemoData): string | null {
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
    if (!rev?.est_monthly_revenue && !rev?.top_seller_revenue) return null
    return `Avg bestseller ${rev.est_monthly_revenue ?? '—'}, top bestseller ${rev.top_seller_revenue ?? '—'} (${ev.revenue!.primarySource})`
  }
  return null
}

export interface DecisionBlocksData { win: string; fail: string; validate: string; angle: string }

export function deriveDecisionBlocks(m: MemoData): DecisionBlocksData {
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

export interface DerivedPoint { text: string; tag: string; evidence: string | null }
export interface DerivedRisk  { text: string; severity: 'High' | 'Medium' | 'Low'; evidence: string | null }
export interface VBudget      { range: string; breakdown: string }

export const TAG_LABEL: Record<string, string> = {
  demand: 'Demand', virality: 'Virality', subscription: 'Subscription',
  manufacturing: 'Manufacturing', gap: 'Market Gap', market: 'Market', angle: 'Entry Angle',
}

export const SEVERITY_CFG: Record<string, { cls: string; dot: string }> = {
  High:   { cls: 'text-pi-risk bg-pi-risk/10 border-pi-risk/30',            dot: 'bg-pi-risk' },
  Medium: { cls: 'text-pi-gold-bright bg-pi-gold/10 border-pi-gold/30',     dot: 'bg-pi-gold-bright' },
  Low:    { cls: 'text-pi-sub bg-pi-sand border-pi-hairline',               dot: 'bg-pi-faint' },
}

export function deriveTop3Build(m: MemoData): DerivedPoint[] {
  const points: Omit<DerivedPoint, 'evidence'>[] = []
  const dims = (
    ['demand','virality','subscription'] as const
  ).map(k => ({ k, level: dimLevel(m, k), notes: m.scores[k]?.notes ?? '' }))
    .filter(d => d.level === 'High' && d.notes)

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

export function deriveTop3Risks(m: MemoData): DerivedRisk[] {
  const risks: Omit<DerivedRisk, 'evidence'>[] = []
  const dimRisks = (
    ['demand','virality','subscription','manufacturing'] as const
  ).map(k => ({ level: dimLevel(m, k), notes: m.scores[k]?.notes ?? '', k }))
    .filter(d => d.level === 'Low' && d.notes)

  const riskTags: string[] = []
  for (const d of dimRisks.slice(0, 2)) {
    risks.push({ text: d.notes, severity: 'Medium' })
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

  const competitorIsVerified = m.biggest_competitor?.name
    && m.biggest_competitor.name !== 'N/A'
    && !m.biggest_competitor.name.toLowerCase().includes('not independently verified')
  if (risks.length < 3 && competitorIsVerified) {
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

export function deriveValidationSteps(m: MemoData, decision: BuildDecision): string[] {
  const d    = decision
  const gap  = m.market_gaps?.[0]?.replace(/\.$/, '') ?? 'the primary market gap'
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
  if (d === 'CATEGORY_CREATION_CANDIDATE') {
    return [
      `Real demand evidence exists for the broader category, not this exact idea — validate that the specific variant has its own distinct demand before assuming the category's demand transfers.`,
      `Run a small paid test or landing page using THIS exact positioning, not the broader category's, to see if it converts on its own.`,
      `Do not commit to manufacturing until the specific-variant test above shows real signal — broader-category strength alone is not evidence for this exact product.`,
    ]
  }
  return [
    `Do not allocate manufacturing capital at this score.`,
    `If pursuing anyway, validate the primary risk with the smallest possible test before any spend.`,
  ]
}

export function deriveValidationBudget(m: MemoData, decision: BuildDecision): VBudget {
  const mfgLevel = dimLevel(m, 'manufacturing') ?? 'Medium'
  const d        = decision

  if (d === 'SKIP') {
    return { range: '$500–$2k', breakdown: 'Market research only — no manufacturing recommended' }
  }
  if (d === 'VALIDATE_FURTHER') {
    return { range: '$1k–$3k', breakdown: 'Pre-sell page + customer research — no manufacturing at this stage' }
  }
  if (d === 'CATEGORY_CREATION_CANDIDATE') {
    return { range: '$1k–$3k', breakdown: 'Specific-variant pre-sell test — broader category demand does not transfer automatically; no manufacturing at this stage' }
  }
  const [mfgLo, mfgHi, totalLo, totalHi] =
    mfgLevel === 'High'   ? ['$2k', '$5k',  '$4k',  '$10k'] :
    mfgLevel === 'Medium' ? ['$4k', '$10k', '$7k',  '$18k'] :
                             ['$8k', '$20k', '$12k', '$28k']
  return {
    range:     `${totalLo}–${totalHi}`,
    breakdown: `Manufacturing test batch (${mfgLo}–${mfgHi}) + paid acquisition test ($2k–$5k) + logistics`,
  }
}

export function deriveSuccessMetrics(m: MemoData): string[] {
  const fp  = m.financial_projections
  const sub = dimLevel(m, 'subscription')
  const out: string[] = []

  if (fp.ten_k_probability && fp.ten_k_probability !== 'N/A') {
    out.push(`Reach $10k MRR within 90 days (model probability: ${fp.ten_k_probability})`)
  }
  if (fp.gross_margin && fp.gross_margin !== 'N/A' && !fp.gross_margin.toLowerCase().includes('not independently verified')) {
    out.push(`Gross margin at or above ${fp.gross_margin} by month 3`)
  }
  out.push(sub === 'High'
    ? 'Subscription conversion rate > 30% of first-time purchasers'
    : 'Repeat purchase rate > 20% within 60 days')

  return out.slice(0, 4)
}

// ── Hero decision chips (Demand / Competition / Revenue / Risk) ─────────
// Every value here traces to a real provider — no AI-estimated number is
// ever eligible for this row. A dimension with no real source shows "No
// real data" rather than falling back to the model's guess.

export interface DecisionChip { label: string; value: string; subValue?: string; source: string; trend?: 'up' | 'down' }

export function parseTrendDirection(text: string | undefined): 'up' | 'down' | undefined {
  if (!text) return undefined
  const m = text.match(/([+-])\s*\d/)
  if (!m) return undefined
  return m[1] === '-' ? 'down' : 'up'
}

// Anchored to the analysis's own stable, stored generatedAt timestamp
// (never the live clock) so a frozen report never shows a "days ago"
// figure that changes on reload.
export function daysAgo(iso: string, asOf: string): number {
  return Math.max(0, Math.round((new Date(asOf).getTime() - new Date(iso).getTime()) / 86_400_000))
}

export function deriveDecisionChips(m: MemoData, generatedAt: string): DecisionChip[] {
  const se = m.signal_evidence
  const chips: DecisionChip[] = []

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

  const rev = se?.revenue?.value
  if (rev?.top_seller_revenue) {
    chips.push({ label: 'Bestseller Rev', value: `${rev.top_seller_revenue} top seller`, source: se!.revenue!.primarySource })
  } else if (rev?.est_monthly_revenue) {
    chips.push({ label: 'Bestseller Rev', value: `${rev.est_monthly_revenue} avg`, source: se!.revenue!.primarySource })
  } else {
    chips.push({ label: 'Bestseller Rev', value: 'No verified product revenue', source: '—' })
  }

  const ni = m.news_intelligence
  if (ni?.hasRecentNews) {
    const recall = ni.items.find(it => it.category === 'FDA Recall')
    chips.push({
      label: 'Risk',
      value: recall
        ? `${recall.recall_classification && recall.recall_classification !== 'Not Yet Classified' ? `${recall.recall_classification} ` : ''}Recall, ${daysAgo(recall.date, generatedAt)}d ago`
        : 'No recalls found',
      subValue: recall?.recall_status ? `status: ${recall.recall_status}` : undefined,
      source: recall ? 'openFDA' : ni.providersUsed.join('/'),
    })
  } else if (ni) {
    chips.push({ label: 'Risk', value: 'No recent events', source: ni.providersUsed.join('/') || 'openFDA/PubMed/GDELT' })
  } else {
    chips.push({ label: 'Risk', value: 'Not checked', source: '—' })
  }

  return chips
}
