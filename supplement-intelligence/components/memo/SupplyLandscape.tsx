// ═══════════════════════════════════════════════════════════════════════
// Supply Landscape — canonical Stitch section name (Investor Report §4).
// Direct successor to the "Competition" half of the old MarketIntelligence.tsx
// PLUS the old, separately-named "Competitive Landscape" top-level section
// (components/memo/CompetitiveLandscape.tsx) — Stitch has one section for
// this topic, not two named differently; merged here per
// docs/STITCH_NARRATIVE_REMAPPING.md §1. Same real fields, same derivation
// logic, only the section boundary changed.
// ═══════════════════════════════════════════════════════════════════════

import { Fragment } from 'react'
import type { MemoData } from '@/types/index'
import {
  legacyCompetitionProvenance, marketSaturationProvenance, competitionEvidenceProvenance,
  marketAccessibilityProvenance, biggestCompetitorProvenance, supplyVelocityProvenance, STATIC_PROVENANCE, type Provenance,
} from '@/lib/provenance'
import {
  ProvenanceBadge, ProvenanceCaption, LabNoData, NumList, SignalBars, mapAccessibility, truncateLabel,
  deriveSupplyVelocityDisplay, PiCard,
} from './shared'

interface EvidenceRowSpec { label: string; value: string | undefined; provenance: Provenance | null }

function EvidenceMetricRow({ label, value }: { label: string; value: string | undefined; provenance: Provenance | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-pi-hairline last:border-b-0">
      <span className="text-xs text-pi-faint">{label}</span>
      {value ? <span className="font-mono text-sm font-semibold text-pi-ink text-right">{value}</span> : <LabNoData />}
    </div>
  )
}

function EvidencePanel({
  title, metrics, scoreLabel, scoreProvenance, score, scoreLevel,
}: {
  title: string; metrics: EvidenceRowSpec[]; scoreLabel: string; scoreProvenance: Provenance | null
  score: number | null; scoreLevel: 'Strong' | 'Moderate' | 'Weak' | null
}) {
  const color = scoreLevel === 'Strong' ? 'text-pi-build' : scoreLevel === 'Moderate' ? 'text-pi-gold-bright' : 'text-pi-faint'
  const tier  = scoreProvenance?.level ?? 'unknown'
  const borderTier = tier === 'verified' ? 'border-l-pi-ink' : tier === 'estimated' ? 'border-l-pi-gold-bright' : tier === 'unsupported' ? 'border-l-pi-risk' : tier === 'unknown' ? 'border-l-pi-faint' : 'border-l-pi-ink'

  const uniqueProvenances = Array.from(
    new Map(
      metrics.filter(row => row.value && row.provenance)
        .map(row => [`${row.provenance!.level}|${row.provenance!.source}|${row.provenance!.detail}`, row.provenance!] as const),
    ).values(),
  )

  return (
    <div className={`rounded-xl border border-pi-hairline bg-pi-card border-l-[3px] ${borderTier} p-4 sm:p-5`}>
      <p className="text-xs font-semibold text-pi-ink mb-3">{title}</p>
      <div>{metrics.map(row => <EvidenceMetricRow key={row.label} {...row} />)}</div>
      {uniqueProvenances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-pi-hairline">
          {uniqueProvenances.map((p, i) => <ProvenanceBadge key={i} p={p} />)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-pi-hairline">
        <span className="text-[10px] text-pi-faint uppercase tracking-wider">{scoreLabel}</span>
        {score !== null && scoreLevel !== null && scoreProvenance ? (
          <div className="flex items-center gap-2">
            <ProvenanceBadge p={scoreProvenance} />
            <SignalBars level={scoreLevel} />
            <span className={`font-mono font-bold text-lg leading-none ${color}`}>{score}<span className="text-pi-faint text-[10px] font-sans">/10</span></span>
          </div>
        ) : <LabNoData />}
      </div>
    </div>
  )
}

interface MeaningfulCompetitor {
  brand: string; reviewCount: number; rating: number; price: number
  position?: number; breadcrumb?: string; bullets?: string[]; ingredients_label?: string
}

function MeaningfulCompetitorsList({ competitors }: { competitors: MeaningfulCompetitor[] }) {
  const sharedBreadcrumb = competitors.find(c => c.breadcrumb)?.breadcrumb
  return (
    <PiCard>
      <p className="text-xs font-semibold text-pi-ink mb-1">Meaningful Competitors</p>
      {sharedBreadcrumb && <p className="text-[10px] text-pi-faint mb-3">{sharedBreadcrumb}</p>}
      <div className="overflow-x-auto rounded-lg border border-pi-hairline">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="bg-pi-sand text-[10px] text-pi-faint uppercase tracking-wider">
              <th className="text-left py-2 px-3 w-10">Rank</th>
              <th className="text-left py-2 px-3">Brand</th>
              <th className="text-right py-2 px-3">Reviews</th>
              <th className="text-right py-2 px-3">Rating</th>
              <th className="text-right py-2 px-3">Price</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((c, i) => (
              <Fragment key={i}>
                <tr className="border-t border-pi-hairline hover:bg-pi-sand/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-pi-faint">{c.position ?? '—'}</td>
                  <td className="py-2 px-3 font-medium text-pi-ink">{c.brand}</td>
                  <td className="py-2 px-3 text-right font-mono text-pi-sub">{c.reviewCount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-pi-sub">{c.rating.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono text-pi-sub">${c.price.toFixed(2)}</td>
                </tr>
                {c.bullets && c.bullets.length > 0 && (
                  <tr className="border-t border-pi-hairline bg-pi-sand/40">
                    <td colSpan={5} className="py-2 px-3 text-[11px] text-pi-faint leading-relaxed">
                      Real listing copy: {c.bullets.slice(0, 2).join(' · ')}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </PiCard>
  )
}

function CompetitionEvidencePanel({ m }: { m: MemoData }) {
  const ev = m.signal_evidence
  const rv = ev?.review_velocity?.value
  const hasReal = rv?.meaningful_competitor_count !== undefined
  const compP = competitionEvidenceProvenance(ev)
  const sat = m.market_saturation
  const fallbackScore = sat ? (sat.entry_difficulty === 'Low' ? 8 : sat.entry_difficulty === 'Medium' ? 5 : 2) : 5
  const score = hasReal ? rv!.score : fallbackScore
  const level = score >= 7 ? 'Strong' as const : score >= 4 ? 'Moderate' as const : 'Weak' as const

  return (
    <div className="space-y-3">
      <EvidencePanel
        title="Competition Evidence"
        metrics={[
          { label: 'Competitor Count',     value: rv?.meaningful_competitor_count !== undefined ? String(rv.meaningful_competitor_count) : undefined, provenance: compP },
          { label: 'Average Review Count', value: rv?.avg_review_count !== undefined ? rv.avg_review_count.toLocaleString() : undefined, provenance: compP },
          { label: 'Market Concentration', value: rv?.review_concentration_ratio !== undefined ? `${Math.round(rv.review_concentration_ratio * 100)}% held by top 3 sellers` : undefined, provenance: compP },
        ]}
        scoreLabel="Market Accessibility Score" scoreProvenance={marketAccessibilityProvenance(ev, m.keyword_intelligence)} score={score} scoreLevel={level}
      />
      {rv?.top_competitors && rv.top_competitors.length > 0 && <MeaningfulCompetitorsList competitors={rv.top_competitors} />}
    </div>
  )
}

const CONCENTRATION_CFG: Record<string, { label: string; cls: string }> = {
  'Low':       { label: 'Low Concentration',  cls: 'text-pi-build bg-pi-build/10' },
  'Moderate':  { label: 'Moderate',           cls: 'text-pi-gold-bright bg-pi-gold/10' },
  'High':      { label: 'High Concentration', cls: 'text-pi-risk bg-pi-risk/10' },
  'Very High': { label: 'Very High',          cls: 'text-pi-risk bg-pi-risk/15' },
}
const DIFFICULTY_CFG: Record<string, { cls: string }> = {
  'Low': { cls: 'text-pi-build' }, 'Medium': { cls: 'text-pi-gold-bright' }, 'High': { cls: 'text-pi-risk' },
}

function MarketSaturationBlock({ m }: { m: MemoData }) {
  const sat = m.market_saturation
  if (!sat) {
    const score  = m.scores.competition?.score ?? 5
    const notes  = m.scores.competition?.notes
    const access = mapAccessibility(score)
    const colorText = score >= 7 ? 'text-pi-build' : score >= 5 ? 'text-pi-gold-bright' : score >= 3 ? 'text-pi-gold-bright' : 'text-pi-risk'
    const colorBg   = score >= 7 ? 'bg-pi-build' : score >= 5 ? 'bg-pi-gold-deep' : score >= 3 ? 'bg-pi-gold-deep' : 'bg-pi-risk'
    const label = score >= 7 ? 'Open Market' : score >= 5 ? 'Moderate Entry' : score >= 3 ? 'Crowded' : 'Saturated'
    return (
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <span className={`font-mono font-bold text-xl ${colorText}`}>{score}<span className="text-pi-faint text-xs font-normal">/10</span></span>
          <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${colorText} bg-pi-sand`}>{label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-pi-hairline overflow-hidden mb-4">
          <div className={`h-full ${colorBg}`} style={{ width: `${(score / 10) * 100}%` }} />
        </div>
        <div className="rounded-lg border border-pi-hairline overflow-hidden divide-y divide-pi-hairline mb-4">
          {([['Seller Density', access.density], ['Entry Barriers', access.barriers], ['Revenue Concentration', access.revenue], ['Whitespace', access.whitespace]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex items-center gap-3 px-4 py-3.5 justify-between">
              <p className="text-[10px] text-pi-faint uppercase tracking-wider shrink-0">{l}</p>
              <p className="text-xs text-pi-sub leading-snug text-right">{v}</p>
            </div>
          ))}
        </div>
        {notes && <p className="text-xs text-pi-faint leading-relaxed">{notes}</p>}
      </div>
    )
  }
  const concCfg = CONCENTRATION_CFG[sat.concentration] ?? CONCENTRATION_CFG['Moderate']
  const diffCfg = DIFFICULTY_CFG[sat.entry_difficulty] ?? DIFFICULTY_CFG['Medium']
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-pi-sand text-pi-sub border border-pi-hairline">{sat.maturity ?? '—'}</span>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${concCfg.cls}`}>{concCfg.label}</span>
        <span className={`text-xs font-semibold ${diffCfg.cls}`}>Entry: {sat.entry_difficulty}</span>
      </div>
      {sat.competitive_intensity && <p className="text-sm text-pi-sub leading-relaxed">{sat.competitive_intensity}</p>}
    </div>
  )
}

const CONCENTRATION_X: Record<string, number> = { Low: 22, Moderate: 48, High: 72, 'Very High': 90 }
const DIFFICULTY_WHITESPACE: Record<string, number> = { Low: 84, Medium: 62, High: 22 }

function CompetitivePositionMap({ m }: { m: MemoData }) {
  const sat = m.market_saturation
  const comp = m.biggest_competitor
  const hasComp = !!(comp?.name && comp.name !== 'N/A' && !comp.name.toLowerCase().includes('not independently verified'))

  const x = CONCENTRATION_X[sat?.concentration ?? 'Moderate'] ?? 50
  const usY = DIFFICULTY_WHITESPACE[sat?.entry_difficulty ?? 'Medium'] ?? 50
  const incumbentY = 16

  const cx = 150, cy = 150, w = 300, h = 300
  const toPx = (px: number, py: number) => [24 + (px / 100) * (w - 48), 24 + (1 - py / 100) * (h - 48)]
  const [usX, usPy] = toPx(Math.min(94, x + 6), usY)
  const [incX, incPy] = toPx(Math.max(6, x - 6), incumbentY)

  return (
    <div className="rounded-xl border border-pi-hairline bg-pi-card p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-pi-faint uppercase tracking-wider">Competitive Position Map</p>
        <p className="text-[10px] text-pi-faint uppercase tracking-wider hidden sm:inline">Concentration vs. whitespace</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[360px] mx-auto mt-3">
        <line x1={cx} y1="24" x2={cx} y2={h - 24} stroke="#16171A" strokeOpacity="0.09" />
        <line x1="24" y1={cy} x2={w - 24} y2={cy} stroke="#16171A" strokeOpacity="0.09" />
        <text x={w - 28} y="40" textAnchor="end" style={{ fill: '#2E6B48', fontSize: 9, letterSpacing: 1 }}>HIDDEN GAP</text>
        <text x="28" y="40" style={{ fill: '#8C877C', fontSize: 9, letterSpacing: 1 }}>WIDE OPEN</text>
        <text x="28" y={h - 22} style={{ fill: '#8C877C', fontSize: 9, letterSpacing: 1 }}>LOW PRIORITY</text>
        <text x={w - 28} y={h - 22} textAnchor="end" style={{ fill: '#A13F2E', fontSize: 9, letterSpacing: 1 }}>SATURATED</text>

        {hasComp && (
          <>
            <circle cx={incX} cy={incPy} r="9" fill="#FFFFFF" stroke="#A13F2E" strokeWidth="1.5" />
            <circle cx={incX} cy={incPy} r="2.5" fill="#A13F2E" />
            <text x={incX} y={incPy + 22} textAnchor="middle" style={{ fill: '#16171A', fontSize: 11, fontWeight: 600 }}>{truncateLabel(comp.name, 16)}</text>
            <text x={incX} y={incPy + 35} textAnchor="middle" style={{ fill: '#8C877C', fontSize: 9.5 }}>Incumbent</text>
          </>
        )}

        <circle cx={usX} cy={usPy} r="11" fill="#FFFFFF" stroke="#2E6B48" strokeWidth="2" />
        <circle cx={usX} cy={usPy} r="3" fill="#2E6B48" />
        <text x={usX} y={usPy - 18} textAnchor="middle" style={{ fill: '#16171A', fontSize: 11, fontWeight: 600 }}>Your Entry Point</text>
        <text x={usX} y={usPy - 5} textAnchor="middle" style={{ fill: '#8C877C', fontSize: 9.5 }}>{truncateLabel(m.brand_opportunities?.[0] ?? 'Documented gap', 30)}</text>
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-pi-faint uppercase tracking-wider">
        <span>← Less concentrated</span>
        <span>More concentrated →</span>
      </div>
    </div>
  )
}

// ── Stitch's literal §4 layout (re-confirmed by direct re-read of
// 80f611873dbf4a5087134b00e73b9f31.html lines 327-360): a 2-column grid —
// one bordered stat card on the left, three stacked stat tiles on the
// right. Stitch's left card is a 24-month new-listings trend bar chart;
// this app has no historical listings time series to draw honestly there,
// so it's replaced with the real, already-computed market-accessibility
// read instead of a fabricated chart. The three right-hand tiles use real
// review-velocity fields that are the closest honest match to Stitch's
// Trademark Filings / Median Incumbent Moat / Median Price triad.
function SupplySnapshot({ m }: { m: MemoData }) {
  const rv = m.signal_evidence?.review_velocity?.value
  const sat = m.market_saturation
  const score = m.scores.competition?.score ?? 5
  const access = mapAccessibility(score)
  const difficultyLabel = sat?.entry_difficulty ?? (score >= 7 ? 'Low' : score >= 4 ? 'Medium' : 'High')
  const diffCls = difficultyLabel === 'Low' ? 'text-pi-build' : difficultyLabel === 'Medium' ? 'text-pi-gold-bright' : 'text-pi-risk'

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-xl border border-pi-hairline p-5 bg-pi-card flex flex-col justify-between">
        <div className="flex justify-between items-start mb-3">
          <span className="font-bold text-xs uppercase text-pi-ink">Entry Difficulty</span>
          <span className={`font-mono font-bold text-sm ${diffCls}`}>{difficultyLabel}</span>
        </div>
        <p className="text-xs text-pi-faint leading-relaxed">{access.barriers}</p>
      </div>
      <div className="space-y-3">
        {rv?.meaningful_competitor_count !== undefined && (
          <div className="rounded-lg bg-pi-sand p-4">
            <p className="font-mono text-[10px] text-pi-faint uppercase">Meaningful Competitors</p>
            <p className="font-bold text-2xl text-pi-ink">{rv.meaningful_competitor_count}</p>
          </div>
        )}
        {rv?.avg_review_count !== undefined && (
          <div className="rounded-lg bg-pi-sand p-4">
            <p className="font-mono text-[10px] text-pi-faint uppercase">Median Incumbent Moat</p>
            <p className="font-bold text-2xl text-pi-ink">{rv.avg_review_count.toLocaleString()} <span className="text-xs font-normal">reviews</span></p>
          </div>
        )}
        {rv?.review_concentration_ratio !== undefined && (
          <div className="rounded-lg bg-pi-sand p-4">
            <p className="font-mono text-[10px] text-pi-faint uppercase">Market Concentration</p>
            <p className="font-bold text-2xl text-pi-ink">{Math.round(rv.review_concentration_ratio * 100)}% <span className="text-xs font-normal">top 3</span></p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roadmap M2.3 (Phase 3 integration) — real new-listing velocity ──────
// This is the real data Stitch's own §4 left-card ("24-month new-listings
// trend bar chart") wanted — SupplySnapshot's own header comment
// previously said no historical listings series existed to draw that
// honestly; M2.3 shipped exactly this (a real listedSince-derived
// distribution, not a fabricated chart) after that comment was written.
// Null (honest unavailable state) when the real competitive-set sample
// was too small for Keepa's own minimum-sample gate.
function SupplyVelocityPanel({ m }: { m: MemoData }) {
  const sv = deriveSupplyVelocityDisplay(m.signal_evidence?.supply_velocity?.value)
  return (
    <PiCard>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold text-pi-ink">New-Listing Velocity (Supply Response)</p>
        {sv && <ProvenanceBadge p={supplyVelocityProvenance()} />}
      </div>
      {sv ? (
        <>
          <div className="rounded-lg border border-pi-hairline divide-y divide-pi-hairline overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs text-pi-faint">Listed within last 12 months</span>
              <span className="font-mono text-sm font-semibold text-pi-ink">{sv.youngListingPct12m !== null ? `${Math.round(sv.youngListingPct12m * 100)}%` : <LabNoData />}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs text-pi-faint">Listed within last 24 months</span>
              <span className="font-mono text-sm font-semibold text-pi-ink">{sv.youngListingPct24m !== null ? `${Math.round(sv.youngListingPct24m * 100)}%` : <LabNoData />}</span>
            </div>
          </div>
          <p className="text-[11px] text-pi-faint italic mt-3 leading-relaxed">
            {sv.entryVelocity
              ? `New-entrant pace: ${sv.entryVelocity} (single-snapshot proxy, not a true two-point-in-time delta).`
              : 'New-entrant pace not available for this sample.'}
          </p>
        </>
      ) : (
        <LabNoData label="Not available — competitive-set sample too small for a real listedSince read" />
      )}
    </PiCard>
  )
}

export default function SupplyLandscape({ m }: { m: MemoData }) {
  const sig = m.signal_metadata
  const comp = m.biggest_competitor
  const hasComp = !!(comp?.name && comp.name !== 'N/A' && !comp.name.toLowerCase().includes('not independently verified'))
  const compProvenance = biggestCompetitorProvenance(sig)
  const compVerified = !!sig?.competitor_revenue_verified

  return (
    <div className="space-y-6">
      <SupplySnapshot m={m} />

      <div className="pt-5 border-t border-pi-hairline">
        <SupplyVelocityPanel m={m} />
      </div>

      <div className="grid gap-3 pt-5 border-t border-pi-hairline">
        <CompetitionEvidencePanel m={m} />
      </div>

      <div className="pt-5 border-t border-pi-hairline">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-pi-faint uppercase tracking-widest">Market Structure</p>
          <ProvenanceBadge p={m.market_saturation ? marketSaturationProvenance(sig) : legacyCompetitionProvenance()} />
        </div>
        <MarketSaturationBlock m={m} />
      </div>

      <div className="pt-5 border-t border-pi-hairline space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-pi-faint uppercase tracking-widest">Competitive Position</p>
          <ProvenanceBadge p={compProvenance} />
        </div>
        {compVerified && <ProvenanceCaption p={compProvenance} />}

        <CompetitivePositionMap m={m} />

        {hasComp && (
          <div className="rounded-xl border border-pi-hairline bg-pi-card overflow-hidden">
            <div className="grid grid-cols-3 bg-pi-sand px-4 py-2.5 text-[10px] text-pi-faint uppercase tracking-wider">
              <span>Brand</span><span>Est. Revenue</span><span>Their Gap</span>
            </div>
            <div className="grid grid-cols-3 px-4 py-3.5 text-sm">
              <span className="font-semibold text-pi-ink">{comp.name}</span>
              <span className="font-mono text-pi-sub">{comp.revenue}</span>
              <span className="text-pi-sub text-xs leading-relaxed col-span-1">{comp.gap}</span>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs text-pi-faint uppercase tracking-widest">Unclaimed Positioning Angles</p>
            <ProvenanceBadge p={STATIC_PROVENANCE.brandOpportunities} />
          </div>
          <NumList items={m.brand_opportunities} />
        </div>
      </div>
    </div>
  )
}
