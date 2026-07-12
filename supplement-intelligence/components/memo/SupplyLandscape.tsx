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
  marketAccessibilityProvenance, biggestCompetitorProvenance, STATIC_PROVENANCE, type Provenance,
} from '@/lib/provenance'
import { HardCard } from '@/components/ui'
import {
  ProvenanceBadge, ProvenanceCaption, LabNoData, NumList, SignalBars, mapAccessibility, truncateLabel,
} from './shared'

interface EvidenceRowSpec { label: string; value: string | undefined; provenance: Provenance | null }

function EvidenceMetricRow({ label, value }: { label: string; value: string | undefined; provenance: Provenance | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-black last:border-b-0">
      <span className="text-xs text-outline">{label}</span>
      {value ? <span className="font-mono text-sm font-semibold text-black text-right">{value}</span> : <LabNoData />}
    </div>
  )
}

function EvidencePanel({
  title, metrics, scoreLabel, scoreProvenance, score, scoreLevel,
}: {
  title: string; metrics: EvidenceRowSpec[]; scoreLabel: string; scoreProvenance: Provenance | null
  score: number | null; scoreLevel: 'Strong' | 'Moderate' | 'Weak' | null
}) {
  const color = scoreLevel === 'Strong' ? 'text-verdict-positive' : scoreLevel === 'Moderate' ? 'text-verdict-caution-text' : 'text-outline'
  const tier  = scoreProvenance?.level ?? 'unknown'
  const borderTier = tier === 'verified' ? 'border-l-black' : tier === 'estimated' ? 'border-l-verdict-caution-text' : tier === 'unsupported' ? 'border-l-verdict-negative' : tier === 'unknown' ? 'border-l-outline' : 'border-l-black'

  const uniqueProvenances = Array.from(
    new Map(
      metrics.filter(row => row.value && row.provenance)
        .map(row => [`${row.provenance!.level}|${row.provenance!.source}|${row.provenance!.detail}`, row.provenance!] as const),
    ).values(),
  )

  return (
    <div className={`bg-white border border-black border-l-[3px] ${borderTier} p-4 sm:p-5`}>
      <p className="text-xs font-semibold text-black mb-3">{title}</p>
      <div>{metrics.map(row => <EvidenceMetricRow key={row.label} {...row} />)}</div>
      {uniqueProvenances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-black">
          {uniqueProvenances.map((p, i) => <ProvenanceBadge key={i} p={p} />)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-black">
        <span className="text-[10px] text-outline uppercase tracking-wider">{scoreLabel}</span>
        {score !== null && scoreLevel !== null && scoreProvenance ? (
          <div className="flex items-center gap-2">
            <ProvenanceBadge p={scoreProvenance} />
            <SignalBars level={scoreLevel} />
            <span className={`font-mono font-bold text-lg leading-none ${color}`}>{score}<span className="text-outline text-[10px] font-sans">/10</span></span>
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
    <HardCard>
      <p className="text-xs font-semibold text-black mb-1">Meaningful Competitors</p>
      {sharedBreadcrumb && <p className="text-[10px] text-outline mb-3">{sharedBreadcrumb}</p>}
      <div className="overflow-x-auto border border-black">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="bg-surface-container text-[10px] text-outline uppercase tracking-wider">
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
                <tr className="border-t border-black hover:bg-surface-container-low transition-colors">
                  <td className="py-2 px-3 font-mono text-outline">{c.position ?? '—'}</td>
                  <td className="py-2 px-3 font-medium text-black">{c.brand}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-variant">{c.reviewCount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-variant">{c.rating.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-variant">${c.price.toFixed(2)}</td>
                </tr>
                {c.bullets && c.bullets.length > 0 && (
                  <tr className="border-t border-black bg-surface-container-low">
                    <td colSpan={5} className="py-2 px-3 text-[11px] text-outline leading-relaxed">
                      Real listing copy: {c.bullets.slice(0, 2).join(' · ')}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </HardCard>
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
  'Low':       { label: 'Low Concentration',  cls: 'text-verdict-positive bg-white' },
  'Moderate':  { label: 'Moderate',           cls: 'text-verdict-caution-text bg-white' },
  'High':      { label: 'High Concentration', cls: 'text-orange-600 bg-orange-50' },
  'Very High': { label: 'Very High',          cls: 'text-verdict-negative bg-white' },
}
const DIFFICULTY_CFG: Record<string, { cls: string }> = {
  'Low': { cls: 'text-verdict-positive' }, 'Medium': { cls: 'text-verdict-caution-text' }, 'High': { cls: 'text-verdict-negative' },
}

function MarketSaturationBlock({ m }: { m: MemoData }) {
  const sat = m.market_saturation
  if (!sat) {
    const score  = m.scores.competition?.score ?? 5
    const notes  = m.scores.competition?.notes
    const access = mapAccessibility(score)
    const colorText = score >= 7 ? 'text-verdict-positive' : score >= 5 ? 'text-verdict-caution-text' : score >= 3 ? 'text-orange-600' : 'text-verdict-negative'
    const colorBg   = score >= 7 ? 'bg-verdict-positive' : score >= 5 ? 'bg-verdict-caution' : score >= 3 ? 'bg-orange-500' : 'bg-verdict-negative'
    const label = score >= 7 ? 'Open Market' : score >= 5 ? 'Moderate Entry' : score >= 3 ? 'Crowded' : 'Saturated'
    return (
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <span className={`font-mono font-bold text-xl ${colorText}`}>{score}<span className="text-outline text-xs font-normal">/10</span></span>
          <span className={`text-xs font-semibold px-2 py-0.5 ${colorText} bg-surface-container`}>{label}</span>
        </div>
        <div className="h-1.5 bg-outline-variant overflow-hidden mb-4">
          <div className={`h-full ${colorBg}`} style={{ width: `${(score / 10) * 100}%` }} />
        </div>
        <div className="border border-black overflow-hidden divide-y divide-black mb-4">
          {([['Seller Density', access.density], ['Entry Barriers', access.barriers], ['Revenue Concentration', access.revenue], ['Whitespace', access.whitespace]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex items-center gap-3 px-4 py-3.5 justify-between">
              <p className="text-[10px] text-outline uppercase tracking-wider shrink-0">{l}</p>
              <p className="text-xs text-ink-variant leading-snug text-right">{v}</p>
            </div>
          ))}
        </div>
        {notes && <p className="text-xs text-outline leading-relaxed">{notes}</p>}
      </div>
    )
  }
  const concCfg = CONCENTRATION_CFG[sat.concentration] ?? CONCENTRATION_CFG['Moderate']
  const diffCfg = DIFFICULTY_CFG[sat.entry_difficulty] ?? DIFFICULTY_CFG['Medium']
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-semibold px-2.5 py-1 bg-surface-container text-ink-variant border border-black">{sat.maturity ?? '—'}</span>
        <span className={`text-xs font-semibold px-2.5 py-1 ${concCfg.cls}`}>{concCfg.label}</span>
        <span className={`text-xs font-semibold ${diffCfg.cls}`}>Entry: {sat.entry_difficulty}</span>
      </div>
      {sat.competitive_intensity && <p className="text-sm text-ink-variant leading-relaxed">{sat.competitive_intensity}</p>}
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
    <div className="bg-white border border-black p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-outline uppercase tracking-wider">Competitive Position Map</p>
        <p className="text-[10px] text-outline uppercase tracking-wider hidden sm:inline">Concentration vs. whitespace</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[360px] mx-auto mt-3">
        <line x1={cx} y1="24" x2={cx} y2={h - 24} stroke="#000000" strokeOpacity="0.12" />
        <line x1="24" y1={cy} x2={w - 24} y2={cy} stroke="#000000" strokeOpacity="0.12" />
        <text x={w - 28} y="40" textAnchor="end" style={{ fill: '#008a00', fontSize: 9, letterSpacing: 1 }}>HIDDEN GAP</text>
        <text x="28" y="40" style={{ fill: '#7e7576', fontSize: 9, letterSpacing: 1 }}>WIDE OPEN</text>
        <text x="28" y={h - 22} style={{ fill: '#7e7576', fontSize: 9, letterSpacing: 1 }}>LOW PRIORITY</text>
        <text x={w - 28} y={h - 22} textAnchor="end" style={{ fill: '#d32f2f', fontSize: 9, letterSpacing: 1 }}>SATURATED</text>

        {hasComp && (
          <>
            <circle cx={incX} cy={incPy} r="9" fill="#ffffff" stroke="#d32f2f" strokeWidth="1.5" />
            <circle cx={incX} cy={incPy} r="2.5" fill="#d32f2f" />
            <text x={incX} y={incPy + 22} textAnchor="middle" style={{ fill: '#1a1c1c', fontSize: 11, fontWeight: 600 }}>{truncateLabel(comp.name, 16)}</text>
            <text x={incX} y={incPy + 35} textAnchor="middle" style={{ fill: '#7e7576', fontSize: 9.5 }}>Incumbent</text>
          </>
        )}

        <circle cx={usX} cy={usPy} r="11" fill="#ffffff" stroke="#008a00" strokeWidth="2" />
        <circle cx={usX} cy={usPy} r="3" fill="#008a00" />
        <text x={usX} y={usPy - 18} textAnchor="middle" style={{ fill: '#1a1c1c', fontSize: 11, fontWeight: 600 }}>Your Entry Point</text>
        <text x={usX} y={usPy - 5} textAnchor="middle" style={{ fill: '#7e7576', fontSize: 9.5 }}>{truncateLabel(m.brand_opportunities?.[0] ?? 'Documented gap', 30)}</text>
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-outline uppercase tracking-wider">
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
  const diffCls = difficultyLabel === 'Low' ? 'text-verdict-positive' : difficultyLabel === 'Medium' ? 'text-verdict-caution-text' : 'text-verdict-negative'

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="border-2 border-black p-5 bg-white flex flex-col justify-between">
        <div className="flex justify-between items-start mb-3">
          <span className="font-bold text-xs uppercase">Entry Difficulty</span>
          <span className={`font-mono font-bold text-sm ${diffCls}`}>{difficultyLabel}</span>
        </div>
        <p className="text-xs text-outline leading-relaxed">{access.barriers}</p>
      </div>
      <div className="space-y-3">
        {rv?.meaningful_competitor_count !== undefined && (
          <div className="bg-surface-container p-4">
            <p className="font-mono text-[10px] text-outline uppercase">Meaningful Competitors</p>
            <p className="font-bold text-headline-md text-black">{rv.meaningful_competitor_count}</p>
          </div>
        )}
        {rv?.avg_review_count !== undefined && (
          <div className="bg-surface-container p-4">
            <p className="font-mono text-[10px] text-outline uppercase">Median Incumbent Moat</p>
            <p className="font-bold text-headline-md text-black">{rv.avg_review_count.toLocaleString()} <span className="text-xs font-normal">reviews</span></p>
          </div>
        )}
        {rv?.review_concentration_ratio !== undefined && (
          <div className="bg-surface-container p-4">
            <p className="font-mono text-[10px] text-outline uppercase">Market Concentration</p>
            <p className="font-bold text-headline-md text-black">{Math.round(rv.review_concentration_ratio * 100)}% <span className="text-xs font-normal">top 3</span></p>
          </div>
        )}
      </div>
    </div>
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

      <div className="grid gap-3 pt-5 border-t border-black">
        <CompetitionEvidencePanel m={m} />
      </div>

      <div className="pt-5 border-t border-black">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-outline uppercase tracking-widest">Market Structure</p>
          <ProvenanceBadge p={m.market_saturation ? marketSaturationProvenance(sig) : legacyCompetitionProvenance()} />
        </div>
        <MarketSaturationBlock m={m} />
      </div>

      <div className="pt-5 border-t border-black space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-outline uppercase tracking-widest">Competitive Position</p>
          <ProvenanceBadge p={compProvenance} />
        </div>
        {compVerified && <ProvenanceCaption p={compProvenance} />}

        <CompetitivePositionMap m={m} />

        {hasComp && (
          <div className="bg-white border border-black overflow-hidden">
            <div className="grid grid-cols-3 bg-surface-container px-4 py-2.5 text-[10px] text-outline uppercase tracking-wider">
              <span>Brand</span><span>Est. Revenue</span><span>Their Gap</span>
            </div>
            <div className="grid grid-cols-3 px-4 py-3.5 text-sm">
              <span className="font-semibold text-black">{comp.name}</span>
              <span className="font-mono text-ink-variant">{comp.revenue}</span>
              <span className="text-ink-variant text-xs leading-relaxed col-span-1">{comp.gap}</span>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs text-outline uppercase tracking-widest">Unclaimed Positioning Angles</p>
            <ProvenanceBadge p={STATIC_PROVENANCE.brandOpportunities} />
          </div>
          <NumList items={m.brand_opportunities} />
        </div>
      </div>
    </div>
  )
}
