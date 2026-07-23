// ═══════════════════════════════════════════════════════════════════════
// Demand Intensity / Concordance — canonical Stitch section name
// (Investor Report, 80f611873dbf4a5087134b00e73b9f31.html §3). Direct
// successor to the "Evidence" + "Other Signals" halves of the old
// components/memo/MarketIntelligence.tsx (renamed from "Market
// Intelligence," which was the backend field name, not a Stitch section).
// Same real fields, same derivation logic — only the section boundary and
// name changed, per docs/STITCH_NARRATIVE_REMAPPING.md §1.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import type { ViralitySignal } from '@/lib/signal-engine/types'
import { computeGroundedScore } from '@/lib/scoring'
import {
  demandProvenance, viralityProvenance, subscriptionProvenance,
  searchVolumeProvenance, searchGrowthProvenance,
  demandMomentum90dProvenance, topRegionsProvenance, revenueEvidenceProvenance, unitsSoldProvenance,
  categoryReviewDataProvenance, realFeeDataProvenance, type Provenance,
} from '@/lib/provenance'
import { ProvenanceBadge, LabNoData, SignalBars, LEVEL_TO_SIGNAL, dimLevel, deriveScienceDisplay, PiCard } from './shared'
import KeywordIntelligence from './KeywordIntelligence'
import type { ConcordanceMatrix, Momentum } from '@/lib/concordance'
import { scienceProvenance } from '@/lib/provenance'

// ── Roadmap M2.1: per-channel scorecard ─────────────────────────────────
// "Each demand channel emits accelerating/stable/decelerating/absent;
// render it in the report as a per-channel scorecard with actual numbers."
// Real per-provider directional reads (lib/concordance.ts), not the single
// blended momentum shown elsewhere in this section — a channel that never
// reported for this query shows Absent honestly rather than being hidden.
const MOMENTUM_CLS: Record<Momentum, string> = {
  Accelerating: 'text-pi-build-noir border-pi-noir-hairline bg-pi-elevated',
  Stable:       'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated',
  Decelerating: 'text-pi-risk-noir border-pi-noir-hairline bg-pi-elevated',
  Absent:       'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated',
}
const AGREEMENT_LABEL: Record<ConcordanceMatrix['agreement'], string> = {
  Unanimous:    'Unanimous — every reporting channel agrees',
  Majority:     'Majority — most reporting channels agree',
  Mixed:        'Mixed — reporting channels disagree',
  Insufficient: 'Insufficient — fewer than 2 channels reported',
}

function ConcordanceMatrixCard({ matrix }: { matrix: ConcordanceMatrix }) {
  return (
    <PiCard>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold text-pi-noir-text">Cross-Channel Demand Concordance</p>
        <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-wider">{matrix.distinctReportingChannels}/{matrix.reads.length} channels reporting</span>
      </div>
      <div className="rounded-lg border border-pi-noir-hairline divide-y divide-pi-noir-hairline overflow-hidden">
        {matrix.reads.map(r => (
          <div key={r.channel} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-pi-noir-text">{r.label}</p>
              {r.provider && <p className="text-[10px] text-pi-noir-sub font-mono">{r.provider}</p>}
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 shrink-0 ${MOMENTUM_CLS[r.momentum]}`}>{r.momentum}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-pi-noir-sub italic mt-3 leading-relaxed">{AGREEMENT_LABEL[matrix.agreement]}</p>
    </PiCard>
  )
}

// ── Stitch's literal §3 row pattern (re-confirmed by direct re-read of
// 80f611873dbf4a5087134b00e73b9f31.html lines 231-300): one row per real
// signal, label left / value right-aligned mono / small bar-glyph far
// right. Stitch's own bar-glyphs are a decorative fabricated sparkline
// with no real trend series behind them — this app has no historical time
// series to draw honestly in that slot, so SignalBars (an existing,
// already-real Strong/Moderate/Weak glyph used throughout the rest of the
// report) fills the same visual role without inventing history. This row
// list opens the section to match Stitch's actual visual density; the
// fuller evidence panels below remain as disclosed supporting detail.
function ConcordanceRow({ label, value, level }: { label: string; value: string | undefined; level: 'Strong' | 'Moderate' | 'Weak' | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-pi-noir-hairline last:border-b-0 px-1">
      <span className="font-bold uppercase text-xs w-1/3 text-pi-noir-text">{label}</span>
      <span className="font-mono text-sm text-right w-1/3 pr-4 text-pi-noir-text">{value}</span>
      <div className="w-1/3 flex justify-end">{level && <SignalBars level={level} />}</div>
    </div>
  )
}

interface EvidenceRowSpec { label: string; value: string | undefined; provenance: Provenance | null }

function EvidenceMetricRow({ label, value }: { label: string; value: string | undefined; provenance: Provenance | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-pi-noir-hairline last:border-b-0">
      <span className="text-xs text-pi-noir-sub">{label}</span>
      {value ? <span className="font-mono text-sm font-semibold text-pi-noir-text text-right">{value}</span> : <LabNoData />}
    </div>
  )
}

function EvidencePanel({
  title, metrics, scoreLabel, scoreProvenance, score, scoreLevel, footer,
}: {
  title: string; metrics: EvidenceRowSpec[]; scoreLabel: string; scoreProvenance: Provenance | null
  score: number | null; scoreLevel: 'Strong' | 'Moderate' | 'Weak' | null; footer?: string
}) {
  const color = scoreLevel === 'Strong' ? 'text-pi-build-noir' : scoreLevel === 'Moderate' ? 'text-pi-gold-bright' : 'text-pi-noir-sub'
  const tier  = scoreProvenance?.level ?? 'unknown'
  const borderTier = tier === 'verified' ? 'border-l-pi-noir-text' : tier === 'estimated' ? 'border-l-pi-gold-bright' : tier === 'unsupported' ? 'border-l-pi-risk-noir' : tier === 'unknown' ? 'border-l-pi-noir-sub' : 'border-l-pi-noir-text'

  const uniqueProvenances = Array.from(
    new Map(
      metrics.filter(row => row.value && row.provenance)
        .map(row => [`${row.provenance!.level}|${row.provenance!.source}|${row.provenance!.detail}`, row.provenance!] as const),
    ).values(),
  )

  return (
    <div className={`rounded-xl border border-pi-noir-hairline bg-pi-elevated border-l-[3px] ${borderTier} p-4 sm:p-5`}>
      <p className="text-xs font-semibold text-pi-noir-text mb-3">{title}</p>
      <div>{metrics.map(row => <EvidenceMetricRow key={row.label} {...row} />)}</div>
      {uniqueProvenances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-pi-noir-hairline">
          {uniqueProvenances.map((p, i) => <ProvenanceBadge key={i} p={p} />)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-pi-noir-hairline">
        <span className="text-[10px] text-pi-noir-sub uppercase tracking-wider">{scoreLabel}</span>
        {score !== null && scoreLevel !== null && scoreProvenance ? (
          <div className="flex items-center gap-2">
            <ProvenanceBadge p={scoreProvenance} />
            <SignalBars level={scoreLevel} />
            <span className={`font-mono font-bold text-lg leading-none ${color}`}>{score}<span className="text-pi-noir-sub text-[10px] font-sans">/10</span></span>
          </div>
        ) : <LabNoData />}
      </div>
      {footer && <p className="mt-2 text-[10px] text-pi-noir-sub italic leading-relaxed">{footer}</p>}
    </div>
  )
}

function DemandEvidencePanel({ m }: { m: MemoData }) {
  const ev = m.signal_evidence
  const ki = m.keyword_intelligence
  const growthSig = ev?.growth?.value
  const demandSig = ev?.demand?.value
  const demandDim = computeGroundedScore(m).dimensions.find(d => d.key === 'demand')
  const score = demandDim?.rawScore ?? null
  const level = score === null ? null : score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const

  const topKeyword = ki?.top_buying?.[0]
  const searchVolValue = topKeyword
    ? `${topKeyword.monthly_searches.toLocaleString()}/mo ("${topKeyword.keyword}")`
    : ki?.relevance_rejected
      ? 'No verified search volume for the exact product. Related market volume found but not credited.'
      : undefined

  return (
    <EvidencePanel
      title="Demand Evidence"
      metrics={[
        { label: 'Monthly Search Volume',  value: searchVolValue, provenance: searchVolumeProvenance(ki) },
        { label: 'Search Growth %',        value: growthSig?.yoy_change, provenance: searchGrowthProvenance(ev) },
        { label: 'Search Trend Direction', value: growthSig?.momentum,   provenance: searchGrowthProvenance(ev) },
        { label: '90-Day Demand Momentum', value: growthSig?.momentum_90d_pct != null ? `${growthSig.momentum_90d_pct > 0 ? '+' : ''}${growthSig.momentum_90d_pct}%` : undefined, provenance: demandMomentum90dProvenance(ev) },
        { label: 'Top Regions',            value: demandSig?.top_regions?.length ? demandSig.top_regions.join(', ') : undefined, provenance: topRegionsProvenance(ev) },
      ]}
      scoreLabel="Demand Score" scoreProvenance={demandProvenance(m.signal_metadata)} score={score} scoreLevel={level}
    />
  )
}

function RevenueEvidencePanel({ m }: { m: MemoData }) {
  const ev = m.signal_evidence
  const rev = ev?.revenue?.value
  const revP = revenueEvidenceProvenance(ev)
  const score = rev ? rev.score : null
  const level = rev ? (rev.score >= 7 ? 'Strong' as const : rev.score >= 4 ? 'Moderate' as const : 'Weak' as const) : null

  const noRelevantRevenue = !!rev && !rev.top_seller_revenue && !rev.est_monthly_revenue
  const estMonthlyRevenueValue = rev?.est_monthly_revenue
    ?? (noRelevantRevenue ? 'No verified product revenue for this product — category-wide bestseller revenue was not credited.' : undefined)
  const sampleCount = rev?.revenue_sample_count

  return (
    <EvidencePanel
      title="Revenue Evidence"
      metrics={[
        { label: 'Bestseller Avg Units/Mo',    value: rev?.est_monthly_units_sold, provenance: unitsSoldProvenance(ev) },
        { label: 'Bestseller Avg Revenue/Mo',  value: estMonthlyRevenueValue,      provenance: revP },
        { label: 'Top Seller Revenue/Mo',      value: rev?.top_seller_revenue,     provenance: revP },
        { label: 'Bestseller Avg Rating',      value: rev?.avg_rating ? `${rev.avg_rating}/5` : undefined, provenance: categoryReviewDataProvenance(ev) },
        { label: 'Bestseller Avg Reviews',     value: rev?.avg_review_count !== undefined ? rev.avg_review_count.toLocaleString() : undefined, provenance: categoryReviewDataProvenance(ev) },
        { label: 'Amazon Referral Fee',        value: rev?.avg_referral_fee_pct !== undefined ? `${rev.avg_referral_fee_pct}%` : undefined, provenance: realFeeDataProvenance(ev) },
        { label: 'FBA Pick & Pack Fee',        value: rev?.avg_fba_pick_pack_fee, provenance: realFeeDataProvenance(ev) },
      ]}
      scoreLabel="Revenue Score" scoreProvenance={revP} score={score} scoreLevel={level}
      footer={sampleCount !== undefined ? `Based on ${sampleCount} relevant bestseller${sampleCount === 1 ? '' : 's'} in category (not total market)` : 'Bestseller sample only — not total market revenue'}
    />
  )
}

function TikTokSignalCard({
  score, qualitativeLevel, notes, provenance, virality,
}: { score: number | null; qualitativeLevel?: 'High' | 'Medium' | 'Low'; notes: string; provenance: Provenance; virality?: ViralitySignal }) {
  const level = score !== null
    ? (score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const)
    : qualitativeLevel ? LEVEL_TO_SIGNAL[qualitativeLevel] : null
  const color = level === 'Strong' ? 'text-pi-build-noir' : level === 'Moderate' ? 'text-pi-gold-bright' : 'text-pi-noir-sub'
  const hasRaw = virality?.video_count !== undefined && virality?.view_count !== undefined
  return (
    <PiCard>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg border border-pi-noir-hairline shrink-0 grid place-items-center">
          {level && <span className={`w-2 h-2 rounded-full ${level === 'Strong' ? 'bg-pi-build-noir' : level === 'Moderate' ? 'bg-pi-gold-bright' : 'bg-pi-noir-sub'}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-pi-noir-text">TikTok Signal</span>
            <ProvenanceBadge p={provenance} />
          </div>
          <p className="text-xs text-pi-noir-sub leading-snug line-clamp-2">{notes}</p>
        </div>
        <div className="text-right shrink-0">
          {score !== null ? (
            <p className={`font-bold text-2xl leading-none ${color}`}>{score}<span className="text-pi-noir-sub text-[10px] font-sans">/10</span></p>
          ) : (
            <p className={`font-bold text-base leading-none ${color}`}>{qualitativeLevel ?? '—'}</p>
          )}
          {level && <p className="text-[9px] text-pi-noir-sub uppercase tracking-wider mt-1">{level}</p>}
        </div>
      </div>
      {hasRaw && (
        <div className="flex mt-3 pt-3 border-t border-pi-noir-hairline">
          <div className="flex-1 px-2 text-center">
            <p className="text-[9px] text-pi-noir-sub uppercase tracking-wider">#{virality!.hashtag}</p>
            <p className="text-xs text-pi-noir-sub">real hashtag</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-pi-noir-text">{virality!.video_count!.toLocaleString()}</p>
            <p className="text-[9px] text-pi-noir-sub uppercase tracking-wider">videos</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-pi-noir-text">{virality!.view_count!.toLocaleString()}</p>
            <p className="text-[9px] text-pi-noir-sub uppercase tracking-wider">views</p>
          </div>
        </div>
      )}
    </PiCard>
  )
}

// ── Roadmap M2.5 (Phase 3 integration) — real science signal ────────────
// Blueprint §2 Pillar 1 lists science (publication/trial velocity) as a
// real demand-side leading indicator. Absent for the large majority of
// real analyses (the nightly batch only tracks a small, fixed ingredient
// list — lib/science-engine/tracked-ingredients.ts) — kept as a single
// compact disclosure line rather than a full empty card so the common
// case doesn't clutter this section.
function ScienceSignalRow({ m }: { m: MemoData }) {
  const sci = deriveScienceDisplay(m.signal_evidence?.science?.value)
  if (!sci) {
    return (
      <p className="text-[11px] text-pi-noir-sub italic py-2">
        Science signal (publication/trial velocity): not tracked for this query — the nightly batch covers a small, fixed ingredient list only.
      </p>
    )
  }
  return (
    <PiCard>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold text-pi-noir-text">Science Signal — {sci.ingredient}</p>
        <ProvenanceBadge p={scienceProvenance()} />
      </div>
      <div className="rounded-lg border border-pi-noir-hairline divide-y divide-pi-noir-hairline overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-xs text-pi-noir-sub">Publication Trend</span>
          <span className="font-mono text-sm font-semibold text-pi-noir-text">{sci.publicationTrend ?? <LabNoData />}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-xs text-pi-noir-sub">Publication Velocity (YoY)</span>
          <span className="font-mono text-sm font-semibold text-pi-noir-text">{sci.publicationVelocityPct !== null ? `${sci.publicationVelocityPct > 0 ? '+' : ''}${sci.publicationVelocityPct}%` : <LabNoData />}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-xs text-pi-noir-sub">Registered Clinical Trials</span>
          <span className="font-mono text-sm font-semibold text-pi-noir-text">{sci.trialRegistrationsCount ?? <LabNoData />}</span>
        </div>
      </div>
    </PiCard>
  )
}

export default function DemandIntensity({ m }: { m: MemoData }) {
  const subscriptionLevel = dimLevel(m, 'subscription')
  const sig = m.signal_metadata
  const dims = computeGroundedScore(m).dimensions
  const demandScore = dims.find(d => d.key === 'demand')?.rawScore ?? null
  const demandLevel = demandScore === null ? null : demandScore >= 8 ? 'Strong' as const : demandScore >= 6 ? 'Moderate' as const : 'Weak' as const
  const viralityScore = dims.find(d => d.key === 'virality')?.rawScore ?? null
  const viralityLevel = viralityScore !== null
    ? (viralityScore >= 8 ? 'Strong' as const : viralityScore >= 6 ? 'Moderate' as const : 'Weak' as const)
    : dimLevel(m, 'virality') ? LEVEL_TO_SIGNAL[dimLevel(m, 'virality')!] : null
  const growthSig = m.signal_evidence?.growth?.value
  const rev = m.signal_evidence?.revenue?.value
  const revLevel = rev ? (rev.score >= 7 ? 'Strong' as const : rev.score >= 4 ? 'Moderate' as const : 'Weak' as const) : null

  return (
    <div className="space-y-6">
      <div className="space-y-0">
        <ConcordanceRow label="Search Growth" value={growthSig?.yoy_change} level={demandLevel} />
        <ConcordanceRow label="Search Trend" value={growthSig?.momentum} level={demandLevel} />
        <ConcordanceRow label="Bestseller Velocity" value={rev?.est_monthly_units_sold} level={revLevel} />
        <ConcordanceRow label="Subscription Strength" value={subscriptionLevel ?? undefined} level={subscriptionLevel ? LEVEL_TO_SIGNAL[subscriptionLevel] : null} />
        <ConcordanceRow label="Social / TikTok Signal" value={viralityLevel ?? undefined} level={viralityLevel} />
      </div>

      {m.concordance_matrix && (
        <div className="pt-5 border-t border-pi-noir-hairline">
          <ConcordanceMatrixCard matrix={m.concordance_matrix} />
        </div>
      )}

      <div className="pt-5 border-t border-pi-noir-hairline">
        <ScienceSignalRow m={m} />
      </div>

      <div className="grid gap-3 pt-5 border-t border-pi-noir-hairline">
        <DemandEvidencePanel m={m} />
        <RevenueEvidencePanel m={m} />
      </div>

      <div className="pt-5 border-t border-pi-noir-hairline space-y-3">
        {subscriptionLevel && (
          <div className="rounded-xl border border-pi-noir-hairline bg-pi-elevated flex items-center gap-3 px-4 py-3.5">
            <span className="text-xs font-semibold text-pi-noir-sub w-28 shrink-0">Subscription</span>
            <span className="font-semibold text-base text-pi-noir-text w-16 shrink-0">{subscriptionLevel}</span>
            <SignalBars level={LEVEL_TO_SIGNAL[subscriptionLevel]} />
            <span className="flex-1 text-xs text-pi-noir-sub truncate hidden md:inline">{m.scores.subscription?.notes}</span>
            <ProvenanceBadge p={subscriptionProvenance()} />
          </div>
        )}
        <TikTokSignalCard
          score={computeGroundedScore(m).dimensions.find(d => d.key === 'virality')?.rawScore ?? null}
          qualitativeLevel={dimLevel(m, 'virality')}
          notes={m.scores.virality?.notes ?? ''}
          provenance={viralityProvenance(sig)}
          virality={m.signal_evidence?.virality?.value}
        />
      </div>

      {/* Real per-keyword DataForSEO search evidence — same topic as this
          whole section (demand), was previously its own top-level
          "Keyword Intelligence" section named after the backend field
          (m.keyword_intelligence) rather than grouped by subject matter. */}
      <div className="pt-5 border-t border-pi-noir-hairline">
        <p className="text-[10px] text-pi-noir-sub uppercase tracking-widest mb-3">Keyword-Level Search Evidence</p>
        <KeywordIntelligence m={m} />
      </div>
    </div>
  )
}
