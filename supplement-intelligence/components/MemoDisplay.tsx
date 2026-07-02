'use client'

import { useState, useCallback, useEffect, useRef, Fragment } from 'react'
import type { MemoData, BuildDecision, SignalMetadata } from '@/types/index'
import type { ViralitySignal } from '@/lib/signal-engine/types'
import type {
  KeywordMetric, KeywordIntelligence, KeywordCluster, KeywordOpportunitySignals,
  KeywordSeasonality, KeywordForecastPoint, KeywordAIInsights,
} from '@/lib/keyword-engine/types'
import type { ThemeInsight } from '@/lib/consumer-intelligence'
import { computeGroundedScore, CHANNEL_COVERAGE_NOTES } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import {
  IconTrendUp, IconTrendDown, IconBeaker, IconArrowRight, IconX, IconAlert,
} from '@/components/icons'
import { inferProductShape, ProductGlyphMini, ProductRenderHero } from '@/components/ProductGlyph'
import { LifestyleScene } from '@/components/LifestyleScene'
import { LabCard, LabEvidenceCard, LabCardInteractive, LabGlass, LabSkeletonLines, LabEmptyState, LabNoData } from '@/components/lab/Surfaces'
import { EvidenceBadge, ProvenanceBadge, ProvenanceCaption, VerdictBadge, ConfidencePill, EvidenceMeter } from '@/components/lab/Badges'
import { ScoreGauge } from '@/components/lab/ScoreGauge'
import { SignalBars, PulseRings } from '@/components/lab/Indicators'
import {
  VolumeTrendChart, SeasonalityChart, ForecastChart,
  OpportunityHeatmap, ClusterDistributionChart,
} from '@/components/lab/Charts'
import {
  STATIC_PROVENANCE, demandProvenance, viralityProvenance, subscriptionProvenance,
  manufacturingScoreProvenance, marketSaturationProvenance,
  manufacturingTabProvenance, legacyCompetitionProvenance, toConfidenceBand,
  searchVolumeProvenance, searchGrowthProvenance, unitsSoldProvenance,
  revenueEvidenceProvenance, competitionEvidenceProvenance, categoryReviewDataProvenance,
  marketAccessibilityProvenance, keywordIntelligenceProvenance, consumerIntelligenceProvenance,
  scoreDimensionProvenance, opportunityScoreProvenance, consistencyFlagProvenance,
  biggestCompetitorProvenance, computeEvidenceCoverage, newsIntelligenceProvenance,
  keywordClusterProvenance, keywordOpportunityScoreProvenance, keywordClickConversionProvenance,
  keywordAmazonPpcProvenance, keywordSearchIntentProvenance, keywordSeasonalityProvenance,
  keywordForecastProvenance, keywordAiInsightsProvenance,
  demandMomentum90dProvenance, realFeeDataProvenance, newsSentimentProvenance,
  topRegionsProvenance,
  evidenceBreadthProvenance, channelConcentrationProvenance, coverageNoteProvenance,
  categoryCreationProvenance, consumerPainLimitationNote,
  type Provenance, type ProvenanceLevel,
} from '@/lib/provenance'
import type { NewsItem } from '@/lib/news-engine/types'

// ── Manufacturing Intelligence local types (mirrors /api/manufacturing response) ──
interface MfgEstimate {
  product:            string
  category:           string
  // Optional since 2026-06-26 — the ai_synthesis fallback no longer
  // fabricates these when no real supplier data exists (see
  // lib/manufacturing-engine/providers/ai.ts); only the real Apify/Alibaba
  // path populates them.
  unit_cost?:          { low: number; high: number; currency: string }
  moq?:                { low: number; high: number; unit: string }
  supplier_count?:     { estimate: number; confidence: 'High' | 'Medium' | 'Low' }
  top_supplier_rating: number | null
  lead_time_days?:     { low: number; high: number }
  complexity:         string
  confidence:         number
  confidence_label:   'High' | 'Medium' | 'Low'
  data_source:        string
  notes:              string
  // Real named suppliers (2026-06-26 data-coverage audit) — optional since
  // only the Apify path currently populates this; absent from any AI-
  // synthesis-sourced estimate.
  top_suppliers?: { name: string; rating?: number | null; trade_assurance?: boolean; gold_supplier_years?: string; country_code?: string; customizable?: boolean }[]
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

// EvidenceBadge/ProvenanceCaption/ProvenanceBadge/ScoreGauge/VerdictBadge/
// ConfidencePill/SignalBars/PulseRings moved to components/lab/ — see
// design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md §10, §16. Imported above.

function truncateLabel(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// Collapsed to the top 2 by default — these lists run 5 items deep, and
// the first 1-2 are almost always the ones that actually inform the
// decision; the rest are detail for someone already convinced enough to
// dig further.
function NumList({ items, collapseAt = 2 }: { items: string[]; collapseAt?: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, collapseAt)
  const hiddenCount = Math.max(0, items.length - collapseAt)
  return (
    <ol className="space-y-3">
      {shown.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="lab-text-data text-lab-text-tertiary shrink-0 w-4 text-right mt-px">{i + 1}</span>
          <span className="text-lab-text-secondary leading-relaxed">{item}</span>
        </li>
      ))}
      {hiddenCount > 0 && !expanded && (
        <li>
          <button onClick={() => setExpanded(true)} className="text-[11px] text-lab-photon/70 hover:text-lab-photon transition-colors ml-7">
            Show {hiddenCount} more →
          </button>
        </li>
      )}
    </ol>
  )
}


// Market/Margin appear in three different always-visible spots (Hero,
// Evidence & Confidence, At-a-Glance rail) — same provenance caveat applies
// to all three, so it's centralized here rather than repeated at each call site.
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
      <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider flex items-center justify-center gap-1">
        <span className="w-1 h-1 rounded-full bg-lab-amber/70 shrink-0" />
        {label}
      </p>
      <p className="lab-text-data text-xs font-semibold text-lab-amber/90 mt-0.5">{value}</p>
    </div>
  )
}

function SectionIntro({ text }: { text: string }) {
  return <p className="text-xs text-lab-text-tertiary italic mb-4 leading-relaxed">{text}</p>
}

// ═══════════════════════════════════════════════════════════════
// STICKY SECTION NAV
// ═══════════════════════════════════════════════════════════════

const NAV_SECTIONS = [
  { id: 'market-intelligence',       label: 'Market' },
  { id: 'keyword-intelligence',      label: 'Keywords' },
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
    <div className="sticky top-0 z-30 -mx-4 px-4 sm:-mx-0 sm:px-0 backdrop-blur-md bg-lab-void-0/85 border-b border-lab-border-soft -mt-px lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto py-2.5 no-scrollbar">
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`relative text-[12.5px] font-medium px-3 py-2.5 whitespace-nowrap transition-colors duration-lab-fast ${
              active === s.id ? 'text-lab-text-primary' : 'text-lab-text-tertiary hover:text-lab-text-secondary'
            }`}
          >
            {s.label}
            {active === s.id && (
              <span className="absolute left-2.5 right-2.5 bottom-0.5 h-[1.5px] rounded-full bg-lab-photon shadow-lab-glow-photon" />
            )}
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon mb-2.5">Sections</p>
      {NAV_SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left text-[13px] py-1.5 pl-3 border-l-2 transition-colors duration-lab-fast ${
            active === s.id
              ? 'border-lab-photon text-lab-text-primary font-medium'
              : 'border-lab-border-soft text-lab-text-tertiary hover:text-lab-text-secondary hover:border-lab-border-default'
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

// HYDRATION FIX (2026-06-29): was Date.now() - new Date(iso).getTime() —
// Date.now() evaluates once at SSR time and again at client hydration
// time, so any recall date close to a 24h rounding boundary could render
// a different integer server vs client, a real (if rare — only fires
// when a recall exists) cause of React's "text content does not match
// server-rendered HTML" hydration error. Anchoring to the analysis's own
// stable, stored generatedAt timestamp instead of the live clock makes
// this deterministic — and is more correct anyway: a frozen report
// shouldn't show a "days ago" figure that changes every time you reload it.
function daysAgo(iso: string, asOf: string): number {
  return Math.max(0, Math.round((new Date(asOf).getTime() - new Date(iso).getTime()) / 86_400_000))
}

// Every value here traces to a real provider — no AI-estimated number is
// ever eligible for this row. A dimension with no real source shows "No
// real data" rather than falling back to the model's guess, same rule as
// the rest of this report's evidence layer.
function deriveDecisionChips(m: MemoData, generatedAt: string): DecisionChip[] {
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

  // REVENUE — real price × real units-sold for a bestseller actually
  // relevant to this query (lib/signal-engine/providers/keepa.ts gates
  // this on checkKeywordRelevance) — never a category-wide guess.
  const rev = se?.revenue?.value
  if (rev?.top_seller_revenue) {
    chips.push({ label: 'Bestseller Rev', value: `${rev.top_seller_revenue} top seller`, source: se!.revenue!.primarySource })
  } else if (rev?.est_monthly_revenue) {
    chips.push({ label: 'Bestseller Rev', value: `${rev.est_monthly_revenue} avg`, source: se!.revenue!.primarySource })
  } else {
    chips.push({ label: 'Bestseller Rev', value: 'No verified product revenue', source: '—' })
  }

  // RISK — real FDA recall check via News Intelligence. Absence of a
  // recall is itself a checked, real fact, not an omission. Classification
  // (Class I/II/III — real, FDA-assigned severity) is far more decision-
  // relevant than "a recall exists": Class I is a serious-health-risk
  // recall, Class III is minor/technical — collapsing both into one
  // generic "Recall found" chip was hiding the single most useful fact
  // openFDA actually provides.
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

function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/^.+?[.!?](?:\s|$)/)
  return (match ? match[0] : text).trim()
}

// 2026-06-26 redesign: financial/competitor fields now sometimes contain the
// full "Not independently verified — ..." sentence instead of a fabricated
// number — correct, but too long for a compact chip. Shortened display only;
// the full sentence is still available via title/tooltip where shown.
function isUnverifiedText(v: string | undefined | null): boolean {
  return !v || v === 'N/A' || v.toLowerCase().includes('not independently verified')
}
function shortFactValue(v: string): string {
  return isUnverifiedText(v) ? 'Not verified' : v
}

// ═══════════════════════════════════════════════════════════════
// HERO — the first 15 seconds. Merges the prior DecisionStrip (verdict +
// score + 4 real-evidence chips + one sentence of attributed synthesis)
// and Masthead (score gauge + title) into one cinematic glass instrument
// panel — the flagship moment of the report. All data/logic below is
// unchanged from the prior DecisionStrip/Masthead — deriveDecisionChips,
// computeGroundedScore, deriveValidationSteps are the same pure functions,
// only the rendering changed. See design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md.
// ═══════════════════════════════════════════════════════════════

const DECISION_GLOW: Record<BuildDecision, 'verdant' | 'amber' | 'ember' | 'spectrum'> = {
  BUILD_NOW: 'verdant', VALIDATE_FURTHER: 'amber', SKIP: 'ember', CATEGORY_CREATION_CANDIDATE: 'spectrum',
}

function HeroChip({ chip }: { chip: DecisionChip }) {
  // Chips fall back to a literal '—' source when no real provider
  // contributed (see deriveDecisionChips) — that's the same real/AI-judgment
  // distinction §16 asks every claim to carry, so the chip's own accent bar
  // reuses the provenance palette instead of inventing a separate scheme.
  const hasReal = chip.source !== '—'
  return (
    <LabEvidenceCard tier={hasReal ? 'verified' : 'unknown'} className="h-full px-4 py-3.5">
      <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-1.5">{chip.label}</p>
      <p className="lab-text-data text-sm font-semibold text-lab-text-primary flex items-center gap-1.5">
        {chip.trend === 'up' && <IconTrendUp className="w-3 h-3 text-lab-verdant shrink-0" />}
        {chip.trend === 'down' && <IconTrendDown className="w-3 h-3 text-lab-ember shrink-0" />}
        <span className="truncate">{chip.value}</span>
      </p>
      {chip.subValue && <p className="text-xs text-lab-text-secondary truncate mt-0.5">{chip.subValue}</p>}
      <p className="text-[10px] text-lab-text-tertiary mt-1 lab-text-data">{chip.source}</p>
    </LabEvidenceCard>
  )
}

// Higgsfield integration point: a procedurally-inferred product silhouette
// stands in for a real generated product render until Higgsfield imagery
// is wired in. data-higgsfield-placeholder marks exactly what to replace —
// swap for an <img>/<video> of the actual generated concept render, same
// slot, same aspect treatment. Never implies a real photo (see
// components/ProductGlyph.tsx's own disclosure).
function HeroProductGlyph({ format, categoryName }: { format: string; categoryName: string }) {
  const shape = inferProductShape(format)
  return (
    <div
      data-higgsfield-placeholder="hero-product-render"
      className="relative hidden md:flex items-center justify-center w-24 h-24 shrink-0 rounded-full"
      style={{ background: 'radial-gradient(circle at 35% 30%, rgba(79,168,255,.16), transparent 70%)' }}
      title={`Concept render placeholder for ${categoryName} (${format}) — not a real product photo`}
    >
      <div className="absolute inset-0 rounded-full border border-lab-border-soft" />
      <ProductGlyphMini shape={shape} className="w-10 h-12 text-lab-photon/70" />
    </div>
  )
}

function Hero({
  m, score, decision, generatedAt,
}: {
  m: MemoData; score: number; decision: BuildDecision; generatedAt?: string
}) {
  const { groundedPct, insufficientEvidence } = computeGroundedScore(m)
  const chips = deriveDecisionChips(m, generatedAt ?? new Date(0).toISOString())
  // VALIDATE_FURTHER's most decision-relevant sentence isn't "why this
  // might work" (the thesis already says that elsewhere) — it's "what to
  // do before deciding," which is exactly deriveValidationSteps' first,
  // most concrete step. BUILD_NOW/SKIP keep the thesis-derived synthesis,
  // since for those two verdicts the "why" is the more useful one-liner.
  // CATEGORY_CREATION_CANDIDATE gets the same "what to do" treatment as
  // VALIDATE_FURTHER, not the thesis — the thesis was written about the
  // specific idea without knowing the score is actually based on a broader
  // category's real data, so it risks implying false confidence here.
  const synthesis = decision === 'VALIDATE_FURTHER' || decision === 'CATEGORY_CREATION_CANDIDATE'
    ? deriveValidationSteps(m, decision)[0] ?? firstSentence(m.market_thesis ?? m.executive_summary)
    : firstSentence(m.market_thesis ?? m.executive_summary)
  const dateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null
  const consumerIntelTimedOut = !m.consumer_intelligence && !!m.signal_metadata?.consumer_intelligence_attempted
  const glow = insufficientEvidence ? undefined : DECISION_GLOW[decision]

  return (
    <LabGlass tier="heavy" glow={glow} className="p-6 sm:p-9 lab-animate-fade-up">
      <div className="flex items-center justify-between mb-6 pb-5 border-b border-lab-border-soft">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon">Investment Dossier</span>
        <span className="text-[10px] font-medium text-lab-text-tertiary lab-text-data uppercase tracking-wider">
          {dateLabel ? `Prepared ${dateLabel}` : 'Confidential'}
        </span>
      </div>

      {consumerIntelTimedOut && (
        <div className="mb-6 rounded-lab-sm border border-lab-amber/25 bg-lab-amber/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-lab-amber mb-0.5">Partial results available</p>
          <p className="text-[11px] text-lab-text-secondary">Most real-data providers responded normally. The Consumer Intelligence review-data provider timed out for this run — see the Consumer tab for details. Everything else below reflects the providers that did respond.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-7">
        <ScoreGauge s={score} decision={decision} />
        <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <VerdictBadge d={decision} insufficientEvidence={insufficientEvidence} withGlow />
            <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-4 mb-1.5 leading-[1.15] tracking-tight text-lab-text-primary">{m.category_name}</h1>
            <div className="flex items-center gap-2.5">
              <p className="text-xs text-lab-text-tertiary uppercase tracking-wider">Opportunity Rating</p>
              <span className={`text-[11px] lab-text-data ${insufficientEvidence ? 'text-lab-ember' : 'text-lab-verdant'}`}>{groundedPct}% real data</span>
            </div>
          </div>
          <HeroProductGlyph format={m.product_recommendation?.format ?? 'bottle'} categoryName={m.category_name} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-7 pt-5 border-t border-lab-border-soft">
        {chips.map((chip, i) => (
          <div key={chip.label} className="flex-1 min-w-[150px] max-w-[240px] lab-animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <HeroChip chip={chip} />
          </div>
        ))}
      </div>

      {synthesis && (
        <div className="mt-5 rounded-lab-sm bg-lab-amber/[0.05] border border-lab-amber/20 px-4 py-3.5">
          <p className="text-[9px] text-lab-amber/90 uppercase tracking-widest font-semibold mb-1.5">
            {decision === 'VALIDATE_FURTHER' || decision === 'CATEGORY_CREATION_CANDIDATE' ? 'What To Do First' : 'Analyst View'}
          </p>
          <p className="text-sm text-lab-text-secondary leading-relaxed italic">{synthesis}</p>
        </div>
      )}
    </LabGlass>
  )
}

// ═══════════════════════════════════════════════════════════════
// EVIDENCE & CONFIDENCE — coverage, score breakdown, evidence breadth,
// sources, and consistency checks. Split out from the old Masthead into
// its own flagship section (was previously folded inside Masthead).
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
// EVIDENCE & CONFIDENCE — coverage, score breakdown, evidence breadth +
// sources, and consistency checks, unified into one flagship section
// (was previously split across EvidenceCoveragePanel/ScoreBreakdownPanel/
// ConsistencyFlagsPanel, all nested inside Masthead). Every value below is
// the same real computation as before — computeEvidenceCoverage,
// computeGroundedScore, checkConsistency — only the rendering changed.
// The Sources sub-panel is new presentation over an already-real field
// (evidenceBreadth.contributingProviders) — no new data, no new logic.
function EvidenceConfidenceSection({
  m, decision, confidence,
}: {
  m: MemoData; decision: BuildDecision
  confidence: { level: 'High' | 'Medium' | 'Low'; note: string }
}) {
  const cov = computeEvidenceCoverage(m)
  const { dimensions, groundedPct, insufficientEvidence, evidenceBreadth, categoryCreationContext } = computeGroundedScore(m)
  // weight > 0 dimensions are the only ones that ever fed the 0-100 score —
  // every one of them is real, by construction (lib/scoring.ts). Dimensions
  // with no real basis (subscription/manufacturing always; demand/virality/
  // competition when their real provider returned nothing) carry zero
  // weight and are shown separately, qualitatively, never as a number.
  const scored      = dimensions.filter(d => d.weight > 0)
  const qualitative = dimensions.filter(d => d.weight === 0)
  const contributedChannels = evidenceBreadth.channelBreakdown.filter(c => c.contributed)
  // Live decision, not m.build_decision — so this panel can never
  // contradict the Hero's decision on the same render.
  const flags = checkConsistency(m, decision)
  const facts = ([
    ['Market', m.market_size ? 'Not independently verified — AI estimate only' : undefined],
    ['Margin', m.gross_margin],
  ] as [string, string | undefined][]).filter((p): p is [string, string] => !!p[1] && p[1] !== 'N/A')
  const coverageColor = cov.pct >= 50 ? 'text-lab-verdant' : cov.pct >= 25 ? 'text-lab-amber' : 'text-lab-ember'
  const coverageBar    = cov.pct >= 50 ? 'bg-lab-verdant' : cov.pct >= 25 ? 'bg-lab-amber' : 'bg-lab-ember'

  return (
    <LabCard className="p-6 sm:p-8 lab-animate-fade-up">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon">Evidence &amp; Confidence</p>
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>

      {facts.length > 0 && (
        <div className="flex gap-6 mb-6 pb-6 border-b border-lab-border-soft sm:hidden">
          {facts.map(([l, v]) => <MetaChip key={l} label={l} value={shortFactValue(v)} />)}
        </div>
      )}

      {categoryCreationContext && (
        <div className="mb-5 rounded-lab-sm bg-lab-spectrum/[0.05] border border-lab-spectrum/20 px-3.5 py-3">
          <p className="text-[9px] text-lab-spectrum/90 uppercase tracking-widest font-semibold mb-1.5">Category Creation Candidate</p>
          <ProvenanceCaption p={categoryCreationProvenance(categoryCreationContext.broadQuery)} />
        </div>
      )}

      {/* Evidence Coverage */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Evidence Coverage</p>
          <span className={`lab-text-data text-lg font-bold ${coverageColor}`}>{cov.pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
          <div className={`h-full ${coverageBar}/60`} style={{ width: `${cov.pct}%` }} />
        </div>
        <p className="text-[11px] text-lab-text-secondary">
          {cov.groundedCount} of {cov.totalCount} report fields are backed by real provider data ({cov.verifiedCount} verified, {cov.estimatedCount} estimated) — the rest ({cov.synthesizedCount + cov.unknownCount}) are AI judgment or unavailable for this query.
        </p>
      </div>

      {/* Score Breakdown */}
      <div className="mt-7 pt-6 border-t border-lab-border-soft">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">
          Score Breakdown {insufficientEvidence ? '— insufficient real evidence to score' : `— ${groundedPct}% grounded in real data`}
        </p>
        <ProvenanceCaption p={opportunityScoreProvenance(groundedPct, insufficientEvidence)} />

        {scored.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {scored.map(d => (
              <div key={d.key}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-lab-text-secondary w-40 shrink-0 truncate">{d.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full bg-lab-photon/60" style={{ width: `${(d.rawScore ?? 0) * 10}%` }} />
                  </div>
                  <span className="lab-text-data text-xs text-lab-text-secondary w-10 text-right shrink-0">{d.rawScore}/10</span>
                  <EvidenceBadge type={d.source} source={d.sourceLabel} detail={`Weighted ${Math.round(d.weight * 100)}% of the final score.`} />
                </div>
                {d.key === 'consumerPain' && (
                  <p className="mt-1 text-[10px] text-lab-text-tertiary leading-relaxed pl-[172px]">{consumerPainLimitationNote()}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {qualitative.length > 0 && (
          <div className="mt-4 pt-3 border-t border-lab-border-faint space-y-2.5">
            <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">Not Scored — AI Judgment Only, 0% Weight</p>
            {qualitative.map(d => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-xs text-lab-text-secondary w-40 shrink-0 truncate italic">{d.label}</span>
                <span className="flex-1 text-xs text-lab-text-tertiary italic">{d.qualitativeLevel ?? 'Not assessed'}</span>
                <EvidenceBadge type={d.source} source={d.sourceLabel} detail="Excluded from the 0-100 score entirely — shown for context only, never converted to a number." />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Evidence Breadth + Sources */}
      <div className="mt-7 pt-6 border-t border-lab-border-soft">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">Evidence Breadth</p>
          <span className="lab-text-data text-xs text-lab-text-secondary">{evidenceBreadth.contributingProviders.length} / {evidenceBreadth.totalScoreEligibleProviders} providers</span>
        </div>
        <EvidenceMeter filled={evidenceBreadth.contributingProviders.length} total={evidenceBreadth.totalScoreEligibleProviders} />
        <div className="mt-3">
          <ProvenanceCaption p={evidenceBreadthProvenance()} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {evidenceBreadth.channelBreakdown.map(c => (
            <span
              key={c.channel}
              title={CHANNEL_COVERAGE_NOTES[c.channel]}
              className={`text-[10px] px-2 py-1 rounded-full border ${c.contributed ? 'text-lab-verdant bg-lab-verdant/10 border-lab-verdant/25' : 'text-lab-text-tertiary bg-white/[0.02] border-lab-border-faint'}`}
            >
              {c.label}
            </span>
          ))}
        </div>

        <p className="mt-2.5 text-[10px] text-lab-text-tertiary">
          {evidenceBreadth.crossChannelCorroborated
            ? `Corroborated across ${evidenceBreadth.distinctChannelTypes} distinct channel types.`
            : contributedChannels.length === 1
              ? `Backed by only one channel type (${contributedChannels[0].label}) — no independent corroboration from a different kind of source.`
              : 'No real channel contributed evidence to this score.'}
        </p>
        <div className="mt-2">
          <ProvenanceCaption p={channelConcentrationProvenance()} />
        </div>

        {/* Sources — which real providers actually contributed, as lab sample tags. */}
        {evidenceBreadth.contributingProviders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-lab-border-faint">
            <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-2">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {evidenceBreadth.contributingProviders.map(p => (
                <span key={p} className="lab-text-data text-[10px] text-lab-photon bg-lab-photon/10 border border-lab-photon/25 rounded px-2 py-1">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {contributedChannels.length > 0 && (
          <div className="mt-3 space-y-1">
            {contributedChannels.map(c => (
              <p key={c.channel} className="text-[10px] text-lab-text-tertiary leading-relaxed">
                <span className="text-lab-text-secondary">{c.label}:</span> {CHANNEL_COVERAGE_NOTES[c.channel]}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2">
          <ProvenanceCaption p={coverageNoteProvenance()} />
        </div>
      </div>

      {/* Consistency Check — claims checked against real evidence
          (lib/consistency.ts) and contradicted, or had none to point to.
          Rendered visibly, not suppressed — zero flags is reported too. */}
      <div className="mt-7 pt-6 border-t border-lab-border-soft">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">Consistency Check</p>
        {flags.length === 0 ? (
          <ProvenanceCaption p={{ level: 'verified', source: 'Consistency check', detail: 'No contradictions found between this memo’s claims and the real evidence collected for it.' }} />
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => <ProvenanceCaption key={i} p={consistencyFlagProvenance(f)} />)}
          </div>
        )}
      </div>
    </LabCard>
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
  const c = decision === 'BUILD_NOW' ? 'text-lab-verdant' : decision === 'VALIDATE_FURTHER' ? 'text-lab-amber' : decision === 'CATEGORY_CREATION_CANDIDATE' ? 'text-lab-spectrum' : 'text-lab-ember'
  const facts = ([
    ['Market', m.market_size ? 'Not independently verified — AI estimate only' : undefined],
    ['Margin', m.gross_margin],
  ] as [string, string | undefined][]).filter((p): p is [string, string] => !!p[1] && p[1] !== 'N/A')
  const { insufficientEvidence } = computeGroundedScore(m)

  return (
    <LabGlass tier="thin" className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon mb-4">At a Glance</p>
      <div className="flex items-baseline gap-2.5 mb-1">
        <span className={`lab-text-data font-bold text-3xl ${c}`}>{score}</span>
        <span className="text-lab-text-tertiary text-xs">/ 100</span>
      </div>
      <VerdictBadge d={decision} insufficientEvidence={insufficientEvidence} />
      <div className="mt-4 pt-4 border-t border-lab-border-soft">
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>
      {facts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-lab-border-soft space-y-2.5">
          {facts.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-3" title={isUnverifiedText(v) ? v : FACT_TOOLTIP[l.toUpperCase()]}>
              <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider shrink-0">{l}</span>
              <span className="lab-text-data text-xs font-semibold text-lab-text-secondary text-right">{shortFactValue(v)}</span>
            </div>
          ))}
        </div>
      )}
    </LabGlass>
  )
}

// ── Momentum — turns the "Why Now" claim into a visual instead of pure
// prose. If the text quantifies its own growth claim (e.g. "+34% YoY"),
// that exact figure drives an animated trend sparkline. If it doesn't,
const LEVEL_TO_SIGNAL: Record<'High' | 'Medium' | 'Low', 'Strong' | 'Moderate' | 'Weak'> = {
  High: 'Strong', Medium: 'Moderate', Low: 'Weak',
}

function MomentumBadge({ demandLevel, legacyDemandScore }: {
  demandLevel?: 'High' | 'Medium' | 'Low'
  legacyDemandScore?: number   // old stored memos only — see lib/scoring.ts legacyScoreToLevel
}) {
  const level = demandLevel ?? legacyScoreToLevelDisplay(legacyDemandScore)
  if (level) {
    const signal = LEVEL_TO_SIGNAL[level]
    return (
      <div className="flex items-center gap-2.5 shrink-0" title="AI Interpretation — the model's own qualitative judgment, not a measured trend.">
        <SignalBars level={signal} />
        <div>
          <p className="text-xs font-medium text-lab-text-secondary">{signal}</p>
          <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">Momentum</p>
        </div>
      </div>
    )
  }
  return null
}

function legacyScoreToLevelDisplay(score: number | undefined): 'High' | 'Medium' | 'Low' | undefined {
  if (typeof score !== 'number') return undefined
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'
}

// ═══════════════════════════════════════════════════════════════
// AI ANALYST — thesis pull-quote + why-now, rendered once. (Renamed from
// ExecutiveSummary — same consolidation rationale as before: previously
// duplicated across InvestmentDecision + standalone InvestmentThesis/
// WhyNow cards.) Analyst-voice text gets its own visual register —
// Space Grotesk display sizing for the pull-quote, never the small
// italic-tertiary treatment §16 reserves for inline AI-judgment captions;
// this is primary narrative content, disclosed via the caption beneath it.
// ═══════════════════════════════════════════════════════════════

function AIAnalystSection({ m }: { m: MemoData }) {
  const thesis = m.market_thesis ?? m.executive_summary
  const whyNow = m.why_now ?? m.scores.demand?.notes ?? null

  return (
    <LabGlass tier="regular" className="p-6 sm:p-8 lab-animate-fade-up">
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-spectrum">AI Analyst</p>
      </div>

      <blockquote className="border-l-2 border-lab-spectrum/40 pl-4 sm:pl-5">
        <p className="font-display italic text-xl sm:text-2xl text-lab-text-primary leading-snug tracking-tight">
          {thesis}
        </p>
      </blockquote>
      <div className="mt-3">
        <ProvenanceCaption p={STATIC_PROVENANCE.marketThesis} />
      </div>

      {whyNow && (
        <div className="mt-6 pt-5 border-t border-lab-border-soft flex items-start justify-between gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-2">Why Now</p>
            <p className="text-sm text-lab-text-secondary leading-relaxed">{whyNow}</p>
            <div className="mt-3">
              <ProvenanceCaption p={STATIC_PROVENANCE.whyNow} />
            </div>
          </div>
          <MomentumBadge demandLevel={m.scores.demand?.level} legacyDemandScore={m.scores.demand?.score} />
        </div>
      )}
    </LabGlass>
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
    if (!rev?.est_monthly_revenue && !rev?.top_seller_revenue) return null
    return `Avg bestseller ${rev.est_monthly_revenue ?? '—'}, top bestseller ${rev.top_seller_revenue ?? '—'} (${ev.revenue!.primarySource})`
  }

  return null
}

// Qualitative-only (2026-06-26): 'High' is the build-reason bucket, 'Low' is
// the risk bucket — see lib/scoring.ts header comment. No magnitude exists
// to sort multiple 'High' dimensions against each other (that magnitude was
// always the AI's own invented number), so ties are broken by a fixed
// priority order instead of a numeric sort.
function dimLevel(m: MemoData, k: 'demand' | 'virality' | 'subscription' | 'manufacturing'): 'High' | 'Medium' | 'Low' | undefined {
  return m.scores[k]?.level ?? legacyScoreToLevelDisplay(m.scores[k]?.score)
}

function deriveTop3Build(m: MemoData): DerivedPoint[] {
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

function deriveTop3Risks(m: MemoData): DerivedRisk[] {
  const risks: Omit<DerivedRisk, 'evidence'>[] = []
  // No magnitude to rank 'Low' dimensions against each other (see dimLevel
  // comment) — severity is uniformly 'Medium' rather than reviving a fake
  // High/Medium split that was always just bucketing an invented number.
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

function deriveValidationSteps(m: MemoData, decision: BuildDecision): string[] {
  // Takes the live, recomputed decision — not m.build_decision (stored at
  // generation time, under whatever scoring formula was live then) — so
  // this never contradicts the masthead's decision on the same render.
  const d    = decision
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

function deriveValidationBudget(m: MemoData, decision: BuildDecision): VBudget {
  const mfgLevel = dimLevel(m, 'manufacturing') ?? 'Medium'
  // Same fix as deriveValidationSteps above — live decision, not stale m.build_decision.
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

function deriveSuccessMetrics(m: MemoData): string[] {
  const fp  = m.financial_projections
  const sub = dimLevel(m, 'subscription')
  const out: string[] = []

  // ten_k_probability: legacy-only field — new memos never populate it
  // (see lib/scoring.ts computeTractionBand). No replacement sentence here;
  // the Financial Outlook tab's Traction Read card covers this for new memos.
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

function deriveKillCriteria(m: MemoData): string[] {
  const sat = m.market_saturation
  const out: string[] = []

  const demandLevel = dimLevel(m, 'demand')
  out.push(
    demandLevel === 'Low' || demandLevel === 'Medium'
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
  High:   { cls: 'text-lab-ember/90 bg-lab-ember/5  border-lab-ember/25', dot: 'bg-lab-ember' },
  Medium: { cls: 'text-lab-amber/90 bg-lab-amber/5  border-lab-amber/25', dot: 'bg-lab-amber' },
  Low:    { cls: 'text-lab-text-secondary bg-white/[0.05] border-lab-border-default', dot: 'bg-lab-text-tertiary' },
}

const TAG_LABEL: Record<string, string> = {
  demand: 'Demand', virality: 'Virality', subscription: 'Subscription',
  manufacturing: 'Manufacturing', gap: 'Market Gap', market: 'Market', angle: 'Entry Angle',
}

const BLOCK_CFG = [
  { key: 'win'      as const, Icon: IconTrendUp,    title: 'Why this could win',      cls: 'border-lab-verdant/25 bg-lab-verdant/5',  head: 'text-lab-verdant'  },
  { key: 'fail'     as const, Icon: IconTrendDown,  title: 'Why this could fail',     cls: 'border-lab-ember/25   bg-lab-ember/5',    head: 'text-lab-ember'    },
  { key: 'validate' as const, Icon: IconBeaker,     title: 'Validate first',          cls: 'border-lab-amber/25   bg-lab-amber/5',    head: 'text-lab-amber'    },
  { key: 'angle'    as const, Icon: IconArrowRight, title: 'Recommended entry angle', cls: 'border-lab-photon/25  bg-lab-photon/5',   head: 'text-lab-photon'   },
]

function InvestmentThesisSection({ m, blocks, decision }: { m: MemoData; blocks: DecisionBlocksData; decision: BuildDecision }) {
  const buildPts = deriveTop3Build(m)
  const risks    = deriveTop3Risks(m)
  const steps    = deriveValidationSteps(m, decision)
  const budget   = deriveValidationBudget(m, decision)
  const metrics  = deriveSuccessMetrics(m)
  const kill     = deriveKillCriteria(m)

  return (
    <LabCard className="overflow-hidden">
      <div className="px-6 py-5 border-b border-lab-border-soft flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-spectrum">Investment Thesis</p>
        <EvidenceBadge
          type="synthesized"
          detail="This section re-ranks and restates the dimension scores and market fields shown elsewhere in this memo — it does not add independent evidence of its own. Check Market Intelligence for which specific inputs were signal-grounded."
        />
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Four quick-read blocks */}
        <div className="grid grid-cols-2 gap-3">
          {BLOCK_CFG.map(b => (
            <div key={b.key} className={`rounded-lab-md border p-4 ${b.cls}`}>
              <div className={`flex items-center gap-1.5 mb-2 ${b.head}`}>
                <b.Icon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{b.title}</span>
              </div>
              <p className="text-xs text-lab-text-secondary leading-relaxed">{blocks[b.key]}</p>
            </div>
          ))}
        </div>

        {/* Reasons + Risks */}
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2.5">Top 3 Reasons to Build</p>
            <ol className="space-y-2.5">
              {buildPts.map((pt, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-lab-text-secondary leading-relaxed">
                  <span className="lab-text-data text-lab-text-tertiary shrink-0 mt-px w-4 text-right">{i+1}</span>
                  <span>
                    {pt.text}{' '}
                    <span className="text-[10px] text-lab-text-tertiary ml-1">[{TAG_LABEL[pt.tag] ?? pt.tag}]</span>
                    <span className={`block text-[10px] mt-1 lab-text-data ${pt.evidence ? 'text-lab-verdant' : 'text-lab-text-tertiary'}`}>
                      {pt.evidence ? `Evidence: ${pt.evidence}` : 'No real evidence available — model judgment only'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2.5">Top 3 Risks</p>
            <ol className="space-y-2.5">
              {risks.map((r, i) => {
                const cfg = SEVERITY_CFG[r.severity]
                return (
                  <li key={i} className="flex gap-2.5 text-xs text-lab-text-secondary leading-relaxed">
                    <span className="lab-text-data text-lab-text-tertiary shrink-0 mt-px w-4 text-right">{i+1}</span>
                    <span>
                      {r.text}{' '}
                      <span className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-1.5 py-0.5 ml-1 ${cfg.cls}`}>
                        <span className={`w-1 h-1 rounded-full ${cfg.dot}`}/>{r.severity}
                      </span>
                      <span className={`block text-[10px] mt-1 lab-text-data ${r.evidence ? 'text-lab-verdant' : 'text-lab-text-tertiary'}`}>
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
        <div className="bg-white/[0.03] rounded-lab-md p-4">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2.5">First Validation Plan (30–60 days)</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-lab-text-secondary leading-relaxed">
                <span className="lab-text-data text-lab-text-tertiary shrink-0 mt-px w-4 text-right">{i+1}</span>{s}
              </li>
            ))}
          </ol>
        </div>

        {/* Budget | Metrics | Kill */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-white/[0.04] rounded-lab-md p-4">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2">Estimated Validation Budget</p>
            <p className="lab-text-data font-bold text-lg text-lab-text-primary mb-1">{budget.range}</p>
            <p className="text-[11px] text-lab-text-tertiary leading-snug">{budget.breakdown}</p>
          </div>
          <div className="bg-white/[0.04] rounded-lab-md p-4">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2">Success Metrics</p>
            <ul className="space-y-1.5">
              {metrics.map((mt, i) => (
                <li key={i} className="flex gap-2 text-xs text-lab-text-secondary leading-snug">
                  <IconArrowRight className="w-3.5 h-3.5 text-lab-photon shrink-0 mt-0.5" />{mt}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white/[0.04] rounded-lab-md p-4">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2">Kill Criteria</p>
            <ul className="space-y-1.5">
              {kill.map((k, i) => (
                <li key={i} className="flex gap-2 text-xs text-lab-text-secondary leading-snug">
                  <IconX className="w-3 h-3 text-lab-ember/70 shrink-0 mt-1" />{k}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </LabCard>
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
    <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md bg-gradient-to-b from-white/[0.03] to-transparent p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Customer Archetype</p>
        <ProvenanceBadge p={STATIC_PROVENANCE.customerLanguage} />
      </div>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex justify-center sm:justify-start">
          <PersonaGlyph accent={accent} />
        </div>
        <dl className="flex-1 grid sm:grid-cols-2 gap-x-5 gap-y-3.5 min-w-0">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-1">{label}</dt>
              <dd className="text-[13px] text-lab-text-primary leading-snug">{value}</dd>
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
      node: <p className="italic text-[13px] text-lab-text-secondary leading-relaxed">&ldquo;{q}&rdquo;</p>,
    })),
    ...cl.ad_phrases.map((ap, i) => ({
      id: `ad-${i}`, kind: 'ad' as const,
      node: (
        <div className="space-y-2">
          <p className="text-[11px] text-lab-text-tertiary italic leading-relaxed">&ldquo;{ap.they_say}&rdquo;</p>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: '#34d399' }}>
            <IconArrowRight className="w-3 h-3" />Use in copy
          </div>
          <p className="text-[13px] text-lab-text-primary font-medium leading-relaxed">{ap.use_in_copy}</p>
        </div>
      ),
    })),
    ...cl.desires.map((d, i) => ({
      id: `de-${i}`, kind: 'desire' as const,
      node: <p className="text-[13px] text-lab-text-primary leading-relaxed">{d}</p>,
    })),
    ...cl.fears.map((f, i) => ({
      id: `fe-${i}`, kind: 'fear' as const,
      node: <p className="text-[13px] text-lab-text-primary leading-relaxed">{f}</p>,
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
  'Low':       { label: 'Low Concentration',  cls: 'text-lab-verdant bg-lab-verdant/10' },
  'Moderate':  { label: 'Moderate',           cls: 'text-lab-amber   bg-lab-amber/10'   },
  'High':      { label: 'High Concentration', cls: 'text-orange-400  bg-orange-400/10'  },
  'Very High': { label: 'Very High',          cls: 'text-lab-ember     bg-lab-ember/10'     },
}
const DIFFICULTY_CFG: Record<string, { cls: string }> = {
  'Low':    { cls: 'text-lab-verdant' },
  'Medium': { cls: 'text-lab-amber'   },
  'High':   { cls: 'text-lab-ember'     },
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
      score >= 7 ? ['text-lab-verdant', 'bg-lab-verdant', 'Open Market'   ] :
      score >= 5 ? ['text-lab-amber',   'bg-lab-amber',   'Moderate Entry'] :
      score >= 3 ? ['text-orange-400',  'bg-orange-400',  'Crowded'       ] :
                   ['text-lab-ember',     'bg-lab-ember',     'Saturated'     ]
    return (
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <span className={`font-mono font-bold text-xl ${colorText}`}>{score}<span className="text-lab-text-tertiary text-xs font-normal">/10</span></span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorText} bg-white/[0.06]`}>{label}</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full ${colorBg}`} style={{ width: `${(score / 10) * 100}%`, transition: 'width .7s ease' }}/>
        </div>
        <div className="ledger mb-4">
          {([['Seller Density', access.density],['Entry Barriers', access.barriers],['Revenue Concentration', access.revenue],['Whitespace', access.whitespace]] as [string,string][]).map(([l,v]) => (
            <div key={l} className="ledger-row justify-between gap-4">
              <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider shrink-0">{l}</p>
              <p className="text-xs text-lab-text-secondary leading-snug text-right">{v}</p>
            </div>
          ))}
        </div>
        {notes && <p className="text-xs text-lab-text-tertiary leading-relaxed">{notes}</p>}
      </div>
    )
  }

  const concCfg = CONCENTRATION_CFG[sat.concentration] ?? CONCENTRATION_CFG['Moderate']
  const diffCfg = DIFFICULTY_CFG[sat.entry_difficulty] ?? DIFFICULTY_CFG['Medium']

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-lab-text-secondary border border-white/[0.1]">{sat.maturity ?? '—'}</span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border border-transparent ${concCfg.cls}`}>{concCfg.label}</span>
        <span className={`text-xs font-semibold ${diffCfg.cls}`}>Entry: {sat.entry_difficulty}</span>
      </div>
      {sat.competitive_intensity && (
        <p className="text-sm text-lab-text-secondary leading-relaxed">{sat.competitive_intensity}</p>
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
  score, qualitativeLevel, notes, provenance, virality,
}: { score: number | null; qualitativeLevel?: 'High' | 'Medium' | 'Low'; notes: string; provenance: Provenance; virality?: ViralitySignal }) {
  const level = score !== null
    ? (score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const)
    : qualitativeLevel ? LEVEL_TO_SIGNAL[qualitativeLevel] : null
  const color = level === 'Strong' ? '#34d399' : level === 'Moderate' ? '#fbbf24' : level === 'Weak' ? '#71717a' : '#52525b'
  const hasRaw = virality?.video_count !== undefined && virality?.view_count !== undefined
  return (
    <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md bg-[#0d0d10] p-4">
      <div className="flex items-center gap-4">
        <div className="relative w-10 h-[58px] rounded-[11px] border-2 shrink-0 grid place-items-center" style={{ borderColor: `${color}55` }}>
          {level && <PulseRings level={level} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-lab-text-primary">TikTok Signal</span>
            <ProvenanceBadge p={provenance} />
          </div>
          <p className="text-xs text-lab-text-tertiary leading-snug line-clamp-2">{notes}</p>
        </div>
        <div className="text-right shrink-0">
          {score !== null ? (
            <p className="font-display font-semibold text-2xl leading-none" style={{ color }}>
              {score}<span className="text-lab-text-tertiary text-[10px] font-sans">/10</span>
            </p>
          ) : (
            <p className="font-display font-semibold text-base leading-none" style={{ color }}>{qualitativeLevel ?? '—'}</p>
          )}
          {level && <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mt-1">{level}</p>}
        </div>
      </div>
      {hasRaw && (
        <div className="flex divide-x divide-white/[0.06] mt-3 pt-3 border-t border-lab-border-soft">
          <div className="flex-1 px-2 text-center">
            <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">#{virality!.hashtag}</p>
            <p className="text-xs text-lab-text-tertiary">real hashtag</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-lab-text-primary">{virality!.video_count!.toLocaleString()}</p>
            <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">videos</p>
          </div>
          <div className="flex-1 px-2 text-center">
            <p className="font-mono text-sm font-semibold text-lab-text-primary">{virality!.view_count!.toLocaleString()}</p>
            <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider">views</p>
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
// No per-row badge — when several rows in the same panel share the
// identical provenance (e.g. Revenue's three dollar figures are all "Keepa,
// AI Interpretation"), repeating that badge on every row is badge fatigue,
// not extra information. EvidencePanel shows each unique provenance once,
// beneath all the rows it actually applies to.
function EvidenceMetricRow({
  label, value,
}: { label: string; value: string | undefined; provenance: Provenance | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-lab-border-faint last:border-b-0">
      <span className="text-xs text-lab-text-tertiary">{label}</span>
      {value ? (
        <span className="lab-text-data text-sm font-semibold text-lab-text-primary text-right">{value}</span>
      ) : (
        <LabNoData />
      )}
    </div>
  )
}

interface EvidenceRowSpec { label: string; value: string | undefined; provenance: Provenance | null }

// The flagship Demand/Revenue/Competition cards all render through this one
// component — its left accent bar takes the SAME provenance tier as the
// dimension's own score provenance, so a glance at the bar tells you
// whether the whole card's verdict is real or AI-judgment before reading
// a single row (§16's evidence-card convention).
function EvidencePanel({
  title, metrics, scoreLabel, scoreProvenance, score, scoreLevel, footer,
}: {
  title:           string
  metrics:         EvidenceRowSpec[]
  scoreLabel:      string
  scoreProvenance: Provenance | null
  score:           number | null
  scoreLevel:      'Strong' | 'Moderate' | 'Weak' | null
  footer?:         string
}) {
  const color = scoreLevel === 'Strong' ? '#34d9a0' : scoreLevel === 'Moderate' ? '#f5b947' : '#686c78'
  const tier  = scoreProvenance?.level ?? 'unknown'

  const uniqueProvenances = Array.from(
    new Map(
      metrics
        .filter(row => row.value && row.provenance)
        .map(row => [`${row.provenance!.level}|${row.provenance!.source}|${row.provenance!.detail}`, row.provenance!] as const),
    ).values(),
  )

  return (
    <LabEvidenceCard tier={tier} className="p-4 sm:p-5">
      <p className="text-xs font-semibold text-lab-text-primary mb-3">{title}</p>

      <div>
        {metrics.map(row => <EvidenceMetricRow key={row.label} {...row} />)}
      </div>

      {uniqueProvenances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-lab-border-soft">
          {uniqueProvenances.map((p, i) => <ProvenanceBadge key={i} p={p} />)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-lab-border-soft">
        <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">{scoreLabel}</span>
        {score !== null && scoreLevel !== null && scoreProvenance ? (
          <div className="flex items-center gap-2">
            <ProvenanceBadge p={scoreProvenance} />
            <SignalBars level={scoreLevel} />
            <span className="lab-text-data font-bold text-lg leading-none" style={{ color }}>
              {score}<span className="text-lab-text-tertiary text-[10px] font-sans">/10</span>
            </span>
          </div>
        ) : (
          <LabNoData />
        )}
      </div>
      {footer && (
        <p className="mt-2 text-[10px] text-lab-text-tertiary italic leading-relaxed">{footer}</p>
      )}
    </LabEvidenceCard>
  )
}

function DemandEvidencePanel({ m }: { m: MemoData }) {
  const ev        = m.signal_evidence
  const ki        = m.keyword_intelligence
  const growthSig = ev?.growth?.value
  const demandSig = ev?.demand?.value
  // Real score when a real provider grounds it; null (never a fabricated
  // number) when only the AI's qualitative judgment exists — see
  // lib/scoring.ts computeGroundedScore, the single source of truth for
  // whether this dimension is actually backed by real data.
  const demandDim = computeGroundedScore(m).dimensions.find(d => d.key === 'demand')
  const score     = demandDim?.rawScore ?? null
  const level      = score === null ? null : score >= 8 ? 'Strong' as const : score >= 6 ? 'Moderate' as const : 'Weak' as const

  // "Monthly Search Volume" real only via DataForSEO's top keyword for this query.
  const topKeyword = ki?.top_buying?.[0]
  const searchVolP = searchVolumeProvenance(ki)
  // Keyword Relevance Guard: DataForSEO found real data, but it described a
  // different market than this query (e.g. "mobility scooter" for "Senior
  // Dog Mobility Support") — show that explicitly rather than the generic
  // "No data available", which would look identical to genuinely finding
  // nothing. Set as the row's `value` (not left undefined) specifically so
  // EvidencePanel's provenance-badge filter (`row.value && row.provenance`)
  // still surfaces the Unsupported badge instead of silently dropping it.
  const searchVolValue = topKeyword
    ? `${topKeyword.monthly_searches.toLocaleString()}/mo ("${topKeyword.keyword}")`
    : ki?.relevance_rejected
      ? 'No verified search volume for the exact product. Related market volume found but not credited.'
      : undefined

  return (
    <EvidencePanel
      title="Demand Evidence"
      metrics={[
        { label: 'Monthly Search Volume',  value: searchVolValue, provenance: searchVolP },
        { label: 'Search Growth %',        value: growthSig?.yoy_change, provenance: searchGrowthProvenance(ev) },
        { label: 'Search Trend Direction', value: growthSig?.momentum,   provenance: searchGrowthProvenance(ev) },
        { label: '90-Day Demand Momentum', value: growthSig?.momentum_90d_pct != null ? `${growthSig.momentum_90d_pct > 0 ? '+' : ''}${growthSig.momentum_90d_pct}%` : undefined, provenance: demandMomentum90dProvenance(ev) },
        { label: 'Top Regions',            value: demandSig?.top_regions?.length ? demandSig.top_regions.join(', ') : undefined, provenance: topRegionsProvenance(ev) },
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

  // Keepa's bestseller sample existed (rev is populated — units sold,
  // rating, fees) but none of the sampled products were relevant to this
  // query (lib/signal-engine/providers/keepa.ts's checkKeywordRelevance
  // gate), so the dollar-revenue fields specifically are undefined. Show
  // that explicitly rather than the generic "No data available", which
  // would look identical to Keepa having no bestseller data at all. Set as
  // the row's `value` (not left undefined) specifically so EvidencePanel's
  // provenance-badge filter (`row.value && row.provenance`) still surfaces
  // the Unsupported badge instead of silently dropping it — same pattern as
  // DemandEvidencePanel's searchVolValue.
  const noRelevantRevenue = !!rev && !rev.top_seller_revenue && !rev.est_monthly_revenue
  const estMonthlyRevenueValue = rev?.est_monthly_revenue
    ?? (noRelevantRevenue ? 'No verified product revenue for this product — category-wide bestseller revenue was not credited.' : undefined)

  const sampleCount = rev?.revenue_sample_count
  return (
    <EvidencePanel
      title="Revenue Evidence"
      metrics={[
        { label: 'Bestseller Avg Units/Mo',    value: rev?.est_monthly_units_sold, provenance: unitsP },
        { label: 'Bestseller Avg Revenue/Mo',  value: estMonthlyRevenueValue,      provenance: revP },
        { label: 'Top Seller Revenue/Mo',      value: rev?.top_seller_revenue,     provenance: revP },
        { label: 'Bestseller Avg Rating',      value: rev?.avg_rating ? `${rev.avg_rating}/5` : undefined, provenance: reviewP },
        { label: 'Bestseller Avg Reviews',     value: rev?.avg_review_count !== undefined ? rev.avg_review_count.toLocaleString() : undefined, provenance: reviewP },
        { label: 'Amazon Referral Fee',        value: rev?.avg_referral_fee_pct !== undefined ? `${rev.avg_referral_fee_pct}%` : undefined, provenance: realFeeDataProvenance(ev) },
        { label: 'FBA Pick & Pack Fee',        value: rev?.avg_fba_pick_pack_fee, provenance: realFeeDataProvenance(ev) },
      ]}
      scoreLabel="Revenue Score"
      scoreProvenance={revP}
      score={score}
      scoreLevel={level}
      footer={sampleCount !== undefined
        ? `Based on ${sampleCount} relevant bestseller${sampleCount === 1 ? '' : 's'} in category (not total market)`
        : 'Bestseller sample only — not total market revenue'
      }
    />
  )
}

// Compact list of the real top competitors behind the aggregate metrics
// above — same source data (Apify junglee/amazon-crawler), itemized rather
// than just counted. No sponsored-ad flag exists on this actor's output
// (confirmed live, documented in providers/competition.ts) — these are the
// top real results by review count, not filtered for ad placement.
interface MeaningfulCompetitor {
  brand: string; reviewCount: number; rating: number; price: number
  position?: number; breadcrumb?: string; bullets?: string[]
  ingredients_label?: string
}

function CompetitorIngredientsRow({ label }: { label: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <tr className="border-t border-lab-border-faint bg-white/[0.01]">
      <td colSpan={5} className="py-2 px-3">
        <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-lab-verdant/70 hover:text-lab-verdant transition-colors">
          {expanded ? 'Hide' : 'Show'} real ingredients label {expanded ? '↑' : '↓'}
        </button>
        {expanded && (
          <p className="mt-2 text-[11px] text-lab-text-tertiary leading-relaxed">{label}</p>
        )}
      </td>
    </tr>
  )
}

function CompetitorBulletsRow({ bullets }: { bullets: string[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <tr className="border-t border-lab-border-faint bg-white/[0.01]">
      <td colSpan={5} className="py-2 px-3">
        <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-lab-amber/70 hover:text-lab-amber transition-colors">
          {expanded ? 'Hide' : 'Show'} real listing copy ({bullets.length} bullets) {expanded ? '↑' : '↓'}
        </button>
        {expanded && (
          <ul className="mt-2 space-y-1.5">
            {bullets.map((b, i) => <li key={i} className="text-[11px] text-lab-text-tertiary leading-relaxed">• {b}</li>)}
          </ul>
        )}
      </td>
    </tr>
  )
}

function MeaningfulCompetitorsList({ competitors }: { competitors: MeaningfulCompetitor[] }) {
  // Real search-result rank/breadcrumb are per-listing fields, but in
  // practice every result for one query shares the same category path —
  // shown once as a caption rather than repeated on every row.
  const sharedBreadcrumb = competitors.find(c => c.breadcrumb)?.breadcrumb
  return (
    <LabCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs font-semibold text-lab-text-primary">Meaningful Competitors</p>
      </div>
      {sharedBreadcrumb && <p className="text-[10px] text-lab-text-tertiary mb-3">{sharedBreadcrumb}</p>}
      <div className="overflow-x-auto rounded-lab-sm border border-lab-border-soft">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="bg-white/[0.04] text-[10px] text-lab-text-tertiary uppercase tracking-wider">
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
                <tr className="border-t border-lab-border-faint hover:bg-lab-void-3 transition-colors duration-lab-fast">
                  <td className="py-2 px-3 lab-text-data text-lab-text-tertiary">{c.position ?? '—'}</td>
                  <td className="py-2 px-3 font-medium text-lab-text-primary">{c.brand}</td>
                  <td className="py-2 px-3 text-right lab-text-data text-lab-text-secondary">{c.reviewCount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right lab-text-data text-lab-text-secondary">{c.rating.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right lab-text-data text-lab-text-secondary">${c.price.toFixed(2)}</td>
                </tr>
                {c.bullets && c.bullets.length > 0 && <CompetitorBulletsRow bullets={c.bullets} />}
                {c.ingredients_label && <CompetitorIngredientsRow label={c.ingredients_label} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </LabCard>
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
        scoreProvenance={marketAccessibilityProvenance(ev, m.keyword_intelligence)}
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
// KEYWORD INTELLIGENCE ENGINE (2026-06-26) — real per-keyword search data
// from DataForSEO (m.keyword_intelligence, server-captured, never touched
// by the model), plus clusters / opportunity discovery / seasonality /
// forecast / per-keyword scores computed deterministically over those real
// numbers (lib/keyword-engine/derive.ts, cluster.ts), plus one narrow AI
// narrative pass over the results (lib/keyword-engine/explain.ts). See
// lib/provenance.ts's "Keyword Intelligence Engine v2" block for the exact
// verified/estimated/synthesized classification of every field below.
// Every optional field is read defensively — memos generated before this
// date have the original 4-bucket shape only and must keep rendering.
// ═══════════════════════════════════════════════════════════════

function KeywordTable({ keywords }: { keywords: KeywordMetric[] }) {
  if (keywords.length === 0) {
    return <LabNoData label="No keywords met this bucket's criteria for this query." />
  }
  return (
    <div className="overflow-x-auto rounded-lab-sm border border-lab-border-soft">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="bg-white/[0.04] text-[10px] text-lab-text-tertiary uppercase tracking-wider">
            <th className="text-left py-2.5 px-3">Keyword</th>
            <th className="text-right py-2.5 px-3">Monthly Searches</th>
            <th className="text-right py-2.5 px-3">Growth</th>
            <th className="text-right py-2.5 px-3 hidden sm:table-cell">Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => (
            <tr key={i} className="border-t border-lab-border-faint hover:bg-lab-void-3 transition-colors duration-lab-fast">
              <td className="py-2.5 px-3 font-medium text-lab-text-primary">{k.keyword}</td>
              <td className="py-2.5 px-3 text-right lab-text-data text-lab-text-secondary">{k.monthly_searches.toLocaleString()}</td>
              <td className={`py-2.5 px-3 text-right lab-text-data ${k.growth_pct === null ? 'text-lab-text-tertiary' : k.growth_pct >= 0 ? 'text-lab-verdant' : 'text-lab-ember'}`}>
                {k.growth_pct === null ? '—' : `${k.growth_pct >= 0 ? '+' : ''}${k.growth_pct}%`}
              </td>
              <td className="py-2.5 px-3 text-right lab-text-data text-lab-text-tertiary hidden sm:table-cell">{k.difficulty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExpandableKeywordTable({ keywords, collapseAt = 5 }: { keywords: KeywordMetric[]; collapseAt?: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown  = expanded ? keywords : keywords.slice(0, collapseAt)
  const hidden = Math.max(0, keywords.length - collapseAt)
  return (
    <div>
      <KeywordTable keywords={shown} />
      {hidden > 0 && !expanded && (
        <button onClick={() => setExpanded(true)} className="text-[11px] text-lab-photon/70 hover:text-lab-photon transition-colors mt-2">
          Show {hidden} more →
        </button>
      )}
    </div>
  )
}

function KeywordDataQualityBar({ ki }: { ki: KeywordIntelligence }) {
  const pct = ki.confidence !== undefined ? Math.round(ki.confidence * 100) : null
  return (
    <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap text-[10px] text-lab-text-tertiary bg-white/[0.02] border border-lab-border-soft rounded-lab-sm px-3.5 py-2.5">
      <span>Seed: <span className="lab-text-data text-lab-text-secondary">&ldquo;{ki.seed_keyword}&rdquo;</span></span>
      <span>Source: <span className="lab-text-data text-lab-text-secondary">{ki.provider === 'dataforseo' ? 'DataForSEO' : ki.provider}</span></span>
      {pct !== null && <span>Real-data completeness: <span className="lab-text-data text-lab-text-secondary">{pct}%</span></span>}
      <span>Last updated: <span className="lab-text-data text-lab-text-secondary">{new Date(ki.fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span></span>
    </div>
  )
}

// Real 12-month volume bars + trend line — the actual DataForSEO history,
// not a synthetic curve.
// VolumeTrendChart/SeasonalityChart/ForecastChart/OpportunityHeatmap/
// ClusterDistributionChart moved to components/lab/Charts.tsx — imported above.

function KeywordClusterCard({ cluster }: { cluster: KeywordCluster }) {
  return (
    <LabCard className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-xs font-semibold text-lab-text-primary">{cluster.label}</p>
        <span className="lab-text-data text-[10px] text-lab-text-tertiary">{cluster.keywords.length}</span>
      </div>
      <p className="text-[10px] text-lab-text-tertiary mb-3">{cluster.basis}</p>
      <ExpandableKeywordTable keywords={cluster.keywords} collapseAt={5} />
    </LabCard>
  )
}

function KeywordOpportunityDiscoverySection({ opp }: { opp: KeywordOpportunitySignals }) {
  const groups: { label: string; keywords: KeywordMetric[]; hint: string }[] = [
    { label: 'High Volume + Low Competition',  keywords: opp.high_volume_low_competition, hint: 'Real volume ≥1,000/mo with real competition index ≤0.35.' },
    { label: 'Fastest Growing',                 keywords: opp.fastest_growing,              hint: 'Real positive YoY growth (DataForSEO history), sorted highest first.' },
    { label: 'Highest Commercial Intent',        keywords: opp.highest_commercial_intent,    hint: 'Classified commercial/transactional intent, sorted by real volume.' },
    { label: 'White-space Opportunities',         keywords: opp.white_space,                   hint: 'Real high volume + low competition + low difficulty + no real competitor brand overlap.' },
  ]
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        {groups.map(g => (
          <LabCard key={g.label} className="p-4">
            <p className="text-xs font-semibold text-lab-text-primary mb-1">{g.label}</p>
            <p className="text-[10px] text-lab-text-tertiary mb-3">{g.hint}</p>
            <ExpandableKeywordTable keywords={g.keywords} collapseAt={5} />
          </LabCard>
        ))}
      </div>
      {opp.not_buildable.length > 0 && (
        <div className="rounded-lab-sm bg-white/[0.02] border border-lab-border-soft px-4 py-3">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2">Requested, Not Currently Buildable With Real Data</p>
          <ul className="space-y-1.5">
            {opp.not_buildable.map(item => (
              <li key={item.label} className="text-[11px] text-lab-text-tertiary">
                <span className="text-lab-text-secondary font-medium">{item.label}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProductImpactStat({ label, value, provenance }: { label: string; value: string; provenance: Provenance | null }) {
  return (
    <div className="rounded-lab-sm bg-white/[0.03] border border-lab-border-soft px-3 py-2.5">
      <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className="lab-text-data text-sm font-semibold text-lab-text-primary">{value}</p>
      {provenance && <div className="mt-1.5"><ProvenanceBadge p={provenance} /></div>}
    </div>
  )
}

function KeywordAIInsightsPanel({ insights }: { insights: KeywordAIInsights }) {
  const rows: [string, string][] = [
    ['Top Opportunities', insights.top_opportunities],
    ['Biggest Risks',     insights.biggest_risks],
    ['Hidden Demand',     insights.hidden_demand],
    ['Keyword Strategy',  insights.keyword_strategy],
    ['SEO Strategy',      insights.seo_strategy],
    ['Amazon Strategy',   insights.amazon_strategy],
    ['Google Strategy',   insights.google_strategy],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-lab-text-secondary leading-relaxed italic">{insights.summary}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {rows.filter(([, v]) => v).map(([label, text]) => (
          <div key={label} className="rounded-lab-sm border border-lab-border-soft p-3.5">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-1.5">{label}</p>
            <p className="text-xs text-lab-text-secondary leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <ProvenanceCaption p={keywordAiInsightsProvenance()} />
    </div>
  )
}

function KeywordIntelligenceContent({ m }: { m: MemoData }) {
  const ki = m.keyword_intelligence

  if (!ki) {
    return (
      <div>
        <SectionIntro text="Real per-keyword search data — volume, growth, competition, difficulty, and CPC — pulled directly from DataForSEO. Clusters, opportunity scores, and AI strategy notes are computed from those real numbers, never invented." />
        <LabEmptyState icon={<IconBeaker className="w-5 h-5" />} title="No data available" description="DataForSEO returned nothing usable for this query." />
      </div>
    )
  }

  const allMetrics = [...ki.top_buying, ...ki.opportunity, ...ki.long_tail, ...ki.fast_growing]
  const topKeyword  = [...allMetrics].sort((a, b) => b.monthly_searches - a.monthly_searches)[0] as KeywordMetric | undefined
  const hasHistory  = (topKeyword?.monthly_history?.length ?? 0) >= 6
  const volProv     = searchVolumeProvenance(ki)
  const kiProv      = keywordIntelligenceProvenance(ki)

  return (
    <div className="space-y-8">
      <SectionIntro text="Every chart and table below traces back to a real DataForSEO number. Clusters and scores are disclosed formulas over those real numbers (see badges); AI Insights at the bottom is the only narrative/interpretive layer." />
      <KeywordDataQualityBar ki={ki} />

      {hasHistory && topKeyword?.monthly_history && volProv && (
        <LabCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">Search Demand — &ldquo;{topKeyword.keyword}&rdquo;</p>
            <ProvenanceBadge p={volProv} />
          </div>
          <VolumeTrendChart history={topKeyword.monthly_history} />
        </LabCard>
      )}

      {ki.seasonality && topKeyword?.monthly_history && (
        <LabCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-xs font-semibold text-lab-text-primary">Seasonality</p>
            <ProvenanceBadge p={keywordSeasonalityProvenance(ki)!} />
          </div>
          <p className="text-[11px] text-lab-text-tertiary mb-3">
            Pattern: <span className="text-lab-text-secondary font-medium">{ki.seasonality.pattern}</span>
            {ki.seasonality.peak_months.length > 0 && <> · Peak: <span className="text-lab-verdant">{ki.seasonality.peak_months.join(', ')}</span></>}
            {ki.seasonality.low_months.length > 0  && <> · Low: <span className="text-lab-ember/80">{ki.seasonality.low_months.join(', ')}</span></>}
          </p>
          <SeasonalityChart history={topKeyword.monthly_history} seasonality={ki.seasonality} />
        </LabCard>
      )}

      {ki.forecast_12mo && ki.forecast_12mo.length > 0 && (
        <LabCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">12-Month Forecast — &ldquo;{topKeyword?.keyword}&rdquo;</p>
            <ProvenanceBadge p={keywordForecastProvenance(ki)!} />
          </div>
          <ForecastChart forecast={ki.forecast_12mo} />
        </LabCard>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <LabCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">Opportunity Heatmap</p>
            <ProvenanceBadge p={keywordOpportunityScoreProvenance()} />
          </div>
          <OpportunityHeatmap metrics={allMetrics} />
          <p className="text-[10px] text-lab-text-tertiary mt-2">X: real competition index · Y: real volume (log) · size/color: computed opportunity score</p>
        </LabCard>
        {ki.clusters && ki.clusters.length > 0 && (
          <LabCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-lab-text-primary">Keyword Distribution by Cluster</p>
              <ProvenanceBadge p={keywordClusterProvenance()} />
            </div>
            <ClusterDistributionChart clusters={ki.clusters} />
          </LabCard>
        )}
      </div>

      {ki.clusters && ki.clusters.length > 0 ? (
        <div>
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">Keyword Clusters</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {ki.clusters.map(c => <KeywordClusterCard key={c.label} cluster={c} />)}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Keyword Buckets</p>
            {kiProv && <ProvenanceBadge p={kiProv} />}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><p className="text-[10px] text-lab-text-secondary mb-2">Top Buying</p><ExpandableKeywordTable keywords={ki.top_buying} /></div>
            <div><p className="text-[10px] text-lab-text-secondary mb-2">Opportunity</p><ExpandableKeywordTable keywords={ki.opportunity} /></div>
            <div><p className="text-[10px] text-lab-text-secondary mb-2">Long-Tail</p><ExpandableKeywordTable keywords={ki.long_tail} /></div>
            <div><p className="text-[10px] text-lab-text-secondary mb-2">Fast-Growing</p><ExpandableKeywordTable keywords={ki.fast_growing} /></div>
          </div>
        </div>
      )}

      {ki.opportunities && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Opportunity Discovery</p>
            <ProvenanceBadge p={keywordOpportunityScoreProvenance()} />
          </div>
          <KeywordOpportunityDiscoverySection opp={ki.opportunities} />
        </div>
      )}

      {topKeyword && (topKeyword.amazon_ppc_estimate || topKeyword.click_potential !== undefined) && (
        <LabCard className="p-4 sm:p-5">
          <p className="text-xs font-semibold text-lab-text-primary mb-3">Product Impact — &ldquo;{topKeyword.keyword}&rdquo;</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ProductImpactStat
              label="Est. Monthly Clicks"
              value={topKeyword.click_potential != null ? `${topKeyword.click_potential.toLocaleString()}/mo` : '—'}
              provenance={keywordClickConversionProvenance()}
            />
            <ProductImpactStat
              label="Est. Monthly Conversions"
              value={topKeyword.conversion_potential != null ? `${topKeyword.conversion_potential.toLocaleString()}/mo` : '—'}
              provenance={keywordClickConversionProvenance()}
            />
            <ProductImpactStat
              label="Google CPC"
              value={topKeyword.cpc != null ? `$${topKeyword.cpc.toFixed(2)}` : '—'}
              provenance={kiProv}
            />
            <ProductImpactStat
              label="Amazon PPC (est.)"
              value={topKeyword.amazon_ppc_estimate ? `$${topKeyword.amazon_ppc_estimate.low.toFixed(2)}–$${topKeyword.amazon_ppc_estimate.high.toFixed(2)}` : '—'}
              provenance={keywordAmazonPpcProvenance()}
            />
          </div>
          {topKeyword.search_intent && (
            <p className="text-[10px] text-lab-text-tertiary mt-3">
              Search intent: <span className="text-lab-text-secondary font-medium capitalize">{topKeyword.search_intent}</span>
              {keywordSearchIntentProvenance(topKeyword.search_intent_source) && (
                <span className="ml-2"><ProvenanceBadge p={keywordSearchIntentProvenance(topKeyword.search_intent_source)!} /></span>
              )}
            </p>
          )}
        </LabCard>
      )}

      {/* Real SERP/backlink/bid signal — same DataForSEO call already being
          made, surfaced for the first time (2026-06-27 provider audit). */}
      {topKeyword && (topKeyword.serp_features?.length || topKeyword.avg_referring_domains != null || topKeyword.top_of_page_bid_range || topKeyword.competition_level) && (
        <LabCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">Search Visibility — &ldquo;{topKeyword.keyword}&rdquo;</p>
            {kiProv && <ProvenanceBadge p={kiProv} />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <ProductImpactStat
              label="Competition"
              value={topKeyword.competition_level ?? '—'}
              provenance={kiProv}
            />
            <ProductImpactStat
              label="Top-of-Page Bid"
              value={topKeyword.top_of_page_bid_range ? `$${topKeyword.top_of_page_bid_range.low.toFixed(2)}–$${topKeyword.top_of_page_bid_range.high.toFixed(2)}` : '—'}
              provenance={kiProv}
            />
            <ProductImpactStat
              label="Competing Results"
              value={topKeyword.serp_results_count != null ? topKeyword.serp_results_count.toLocaleString() : '—'}
              provenance={kiProv}
            />
            <ProductImpactStat
              label="Avg. Referring Domains"
              value={topKeyword.avg_referring_domains != null ? topKeyword.avg_referring_domains.toLocaleString() : '—'}
              provenance={kiProv}
            />
          </div>
          {topKeyword.serp_features && topKeyword.serp_features.length > 0 && (
            <div>
              <p className="text-[10px] text-lab-text-tertiary mb-1.5">SERP features currently shown for this query:</p>
              <div className="flex flex-wrap gap-1.5">
                {topKeyword.serp_features.map(f => (
                  <span key={f} className="text-[10px] text-lab-text-secondary bg-white/[0.04] border border-lab-border-default rounded-full px-2 py-0.5">
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </LabCard>
      )}

      <div>
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">AI Insights</p>
        {ki.ai_insights ? (
          <KeywordAIInsightsPanel insights={ki.ai_insights} />
        ) : (
          <LabNoData label="No data available" />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER INTELLIGENCE — real review-text themes (lib/consumer-intelligence).
// Every row below is traceable to a literal phrase pulled from real
// customer reviews via deterministic clustering, never LLM summarization.
// No insight without a review count behind it — that's the whole point.
// ═══════════════════════════════════════════════════════════════

// Expands in place instead of needing a separate "full list" card elsewhere
// duplicating the same array unlimited — that duplicate card was deleted
// 2026-06-26 in favor of this.
function ThemeList({ themes, limit, emptyLabel }: { themes: ThemeInsight[]; limit?: number; emptyLabel: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!themes.length) {
    return <p className="text-xs text-lab-text-tertiary italic py-2">{emptyLabel}</p>
  }
  const shown = (!limit || expanded) ? themes : themes.slice(0, limit)
  const hiddenCount = limit ? Math.max(0, themes.length - limit) : 0
  return (
    <ul className="space-y-2">
      {shown.map((t, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-lab-text-primary font-medium">&ldquo;{t.label}&rdquo;</span>
            <span className="text-[11px] font-mono text-lab-text-tertiary shrink-0">{t.mentionedBy}/{t.outOf} reviews</span>
          </div>
          <p className="text-[11px] text-lab-text-tertiary italic mt-0.5 truncate">&ldquo;{t.exampleQuote}&rdquo;</p>
        </li>
      ))}
      {hiddenCount > 0 && (
        <li>
          <button onClick={() => setExpanded(true)} className="text-[11px] text-lab-amber/70 hover:text-lab-amber transition-colors">
            Show {hiddenCount} more →
          </button>
        </li>
      )}
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
          <span className="text-lab-text-tertiary w-10 shrink-0">{d.star}★</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-lab-amber/50" style={{ width: `${d.pct}%` }} />
          </div>
          <span className="text-lab-text-tertiary font-mono w-10 text-right shrink-0">{d.pct}%</span>
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

  // Real Reddit discussion evidence — independent of Amazon-review consumer
  // intelligence above (different real source: what people say in r/Supplements
  // etc., not what they say in Amazon reviews). Currently dormant in this
  // deployment (no Reddit API credentials configured) — renders nothing
  // until that changes, by design, never a placeholder.
  const rv = m.signal_evidence?.review_velocity?.value
  const redditPainExamples = rv?.pain_point_examples

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Consumer Intelligence</p>
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {redditPainExamples && redditPainExamples.length > 0 && (
        <div className="mt-3 bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">Real Reddit Discussion</p>
            <ProvenanceBadge p={{ level: 'verified', source: 'Reddit', detail: `Real verbatim post titles/snippets from r/Supplements and related subreddits that matched problem-language patterns (title or self-post body text) — ${m.signal_evidence?.review_velocity?.value.monthly_reviews ?? 'unknown volume'}, ${m.signal_evidence?.review_velocity?.value.sentiment ?? 'unscored'} sentiment.` }} />
          </div>
          <ul className="space-y-2">
            {redditPainExamples.map((ex, i) => (
              <li key={i} className="text-sm text-lab-text-secondary leading-relaxed">&ldquo;{ex}&rdquo;</li>
            ))}
          </ul>
        </div>
      )}

      {!ci ? (
        attemptedButFailed ? (
          <div className="mt-3 rounded-lg border border-lab-amber/20 bg-lab-amber/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-lab-amber mb-1">Some providers timed out</p>
            <p className="text-[11px] text-lab-text-tertiary">Real competitor products were found, but the review-data provider didn&rsquo;t return in time. This section is empty rather than estimated — re-running the analysis may succeed if the provider was just slow this once.</p>
          </div>
        ) : (
          <p className="text-sm font-mono text-lab-text-tertiary italic py-3">No data available</p>
        )
      ) : (
        <div className="space-y-5 mt-3">
          <p className="text-[11px] text-lab-text-tertiary">
            Source: {ci.totalReviewsCollected} real reviews
            {(ci.productsAnalyzed ?? []).length > 0 && <> across {(ci.productsAnalyzed ?? []).map(p => p.brand).join(', ')}</>}
            {' '}({ci.confidence >= 0.7 ? 'high' : ci.confidence >= 0.4 ? 'moderate' : 'low'} confidence)
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
              <p className="text-xs font-semibold text-lab-text-primary mb-3">Sentiment Breakdown</p>
              <p className="text-[11px] text-lab-text-tertiary mb-2">
                Avg rating <span className="font-mono text-lab-text-secondary">{ci.sentimentBreakdown.avgRating}/5</span> across {ci.sentimentBreakdown.totalReviews} reviews
                {' '}— {ci.sentimentBreakdown.positivePct}% positive, {ci.sentimentBreakdown.neutralPct}% neutral, {ci.sentimentBreakdown.negativePct}% negative
              </p>
              <SentimentBars m={m} />
            </div>

            <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
              <p className="text-xs font-semibold text-lab-text-primary mb-3">Top Complaints</p>
              <ThemeList themes={ci.negativeThemes} limit={5} emptyLabel="No recurring complaints met the minimum review-count threshold." />
            </div>

            <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
              <p className="text-xs font-semibold text-lab-text-primary mb-3">What Customers Love</p>
              <ThemeList themes={ci.positiveThemes} limit={5} emptyLabel="No recurring praise met the minimum review-count threshold." />
            </div>

            <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
              <p className="text-xs font-semibold text-lab-text-primary mb-3">Most Mentioned Problems <span className="text-[10px] text-lab-text-tertiary font-normal">(any rating)</span></p>
              <ThemeList themes={ci.mostMentionedProblems} limit={5} emptyLabel="No problems mentioned widely enough across all ratings." />
            </div>

            <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
              <p className="text-xs font-semibold text-lab-text-primary mb-3">Feature Requests</p>
              <ThemeList themes={ci.featureRequests} limit={5} emptyLabel="No recurring feature requests found in this review sample." />
            </div>

            {ci.symptomSignals && ci.symptomSignals.length > 0 && (
              <div className="bg-lab-void-2 border border-lab-ember/25 rounded-lab-md p-4 sm:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-lab-text-primary">Adverse Effect Signals</p>
                  <span className="text-[10px] text-lab-ember bg-lab-ember/10 border border-lab-ember/20 rounded px-1.5 py-0.5">Amazon reviews only</span>
                </div>
                <p className="text-[11px] text-lab-text-tertiary mb-3">
                  Single-word adverse effects detected by exact-match scan — complement to phrase clustering above. Each count is distinct reviews containing the term (unnegated).
                </p>
                <ul className="space-y-2">
                  {ci.symptomSignals.slice(0, 8).map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 min-w-[90px] text-xs font-mono font-semibold text-lab-text-primary">{s.symptom}</span>
                      <span className="text-[11px] text-lab-text-tertiary">
                        {s.mentionedBy}/{s.outOf} reviews ({Math.round((s.mentionedBy / s.outOf) * 100)}%)
                        {s.exampleQuote && <> — &ldquo;{s.exampleQuote.slice(0, 120)}{s.exampleQuote.length > 120 ? '…' : ''}&rdquo;</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
  'FDA Recall':              'text-lab-ember bg-lab-ember/10 border-lab-ember/20',
  'Adverse Event Signal':    'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'Regulatory Change':       'text-lab-amber bg-lab-amber/10 border-lab-amber/20',
  'Acquisition':             'text-violet-400 bg-violet-400/10 border-violet-400/20',
  'Funding Round':           'text-lab-verdant bg-lab-verdant/10 border-lab-verdant/20',
  'Competitor Announcement': 'text-lab-spectrum bg-lab-spectrum/10 border-sky-400/20',
  'Product Launch':          'text-lab-spectrum bg-lab-spectrum/10 border-sky-400/20',
  'Scientific Study':        'text-lab-text-secondary bg-white/[0.06] border-white/[0.12]',
  'Industry News':           'text-lab-text-secondary bg-white/[0.04] border-white/[0.1]',
}

const TRAJECTORY_CLS: Record<string, string> = {
  Accelerating: 'text-lab-verdant bg-lab-verdant/10 border-lab-verdant/20',
  Stable:       'text-lab-text-secondary bg-white/[0.06] border-white/[0.12]',
  Slowing:      'text-lab-amber bg-lab-amber/10 border-lab-amber/20',
  Unknown:      'text-lab-text-tertiary bg-white/[0.03] border-white/[0.08]',
}

function NewsItemCard({ item }: { item: NewsItem }) {
  const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4 hover:border-white/[0.16] hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${NEWS_CATEGORY_CLS[item.category] ?? NEWS_CATEGORY_CLS['Industry News']}`}>
          {item.category}
        </span>
        <span className="text-[10px] text-lab-text-tertiary font-mono shrink-0">{dateStr}</span>
      </div>
      <p className="text-sm text-lab-text-primary leading-snug mb-1.5">{item.headline}</p>
      {(item.recall_classification || item.recall_status) && (
        <p className="text-[11px] mb-1.5 flex items-center gap-2 flex-wrap">
          {item.recall_classification && (
            <span className={`font-semibold ${
              item.recall_classification === 'Class I'  ? 'text-lab-ember' :
              item.recall_classification === 'Class II' ? 'text-lab-amber' :
              item.recall_classification === 'Class III' ? 'text-lab-text-secondary' : 'text-lab-text-tertiary'
            }`}>
              {item.recall_classification}
            </span>
          )}
          {item.recall_status && <span className="text-lab-text-tertiary">{item.recall_status}</span>}
        </p>
      )}
      {/* Real NLM study-design type (PubMed esummary pubtype[]) — replaces
          an AI-judged evidence tier with a verifiable methodology label for
          any study this provider actually surfaces. */}
      {item.study_type && (
        <p className="text-[11px] mb-1.5">
          <span className="font-semibold text-lab-amber">{item.study_type}</span>
        </p>
      )}
      {/* Real openFDA CAERS adverse-event reactions — a consumer-reported
          signal, distinct from a recall (no regulatory action implied). */}
      {item.adverse_event_reactions && item.adverse_event_reactions.length > 0 && (
        <p className="text-[11px] text-lab-amber/90 mb-1.5">
          Reported reactions: {item.adverse_event_reactions.slice(0, 4).join(', ')}
        </p>
      )}
      <p className="text-[11px] text-lab-text-tertiary mb-2">{item.source} · {Math.round(item.confidence * 100)}% relevance match</p>
      {item.why_it_matters && (
        <p className="text-[11px] text-lab-text-tertiary leading-relaxed border-t border-lab-border-soft pt-2 mt-2">{item.why_it_matters}</p>
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
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Recent Market Intelligence</p>
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>

      {!ni ? (
        <p className="text-sm font-mono text-lab-text-tertiary italic py-3">No data available</p>
      ) : (
        <div className="space-y-6 mt-3">
          <p className="text-[11px] text-lab-text-tertiary">
            Window: last {ni.windowDays} days · Sources: {ni.providersUsed.length ? ni.providersUsed.join(', ') : 'none returned results'}
          </p>

          {ni.sentiment && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] border border-lab-border-soft px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Real News Sentiment</span>
                <span className={`text-sm font-mono font-semibold ${
                  ni.sentiment.avg_tone <= -3 ? 'text-lab-ember' : ni.sentiment.avg_tone >= 1 ? 'text-lab-verdant' : 'text-lab-text-secondary'
                }`}>
                  {ni.sentiment.avg_tone > 0 ? '+' : ''}{ni.sentiment.avg_tone}
                </span>
                <span className="text-[11px] text-lab-text-tertiary">across {ni.sentiment.sample_size} real articles</span>
              </div>
              <ProvenanceBadge p={newsSentimentProvenance(ni)!} />
            </div>
          )}

          <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-lab-text-primary">What Changed</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${TRAJECTORY_CLS[ni.summary.trajectory]}`}>
                {ni.summary.trajectory}
              </span>
            </div>
            <p className="text-[12px] text-lab-text-secondary leading-relaxed">{ni.summary.what_changed}</p>

            {(ni.summary.new_risks.length > 0 || ni.summary.new_opportunities.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                {ni.summary.new_risks.length > 0 && (
                  <div>
                    <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wide mb-1.5">New Risks</p>
                    <ul className="space-y-1">
                      {ni.summary.new_risks.map((r, i) => <li key={i} className="text-[11px] text-lab-text-tertiary">• {r}</li>)}
                    </ul>
                  </div>
                )}
                {ni.summary.new_opportunities.length > 0 && (
                  <div>
                    <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wide mb-1.5">New Opportunities</p>
                    <ul className="space-y-1">
                      {ni.summary.new_opportunities.map((o, i) => <li key={i} className="text-[11px] text-lab-text-tertiary">• {o}</li>)}
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
  const subscription = m.scores.subscription
  const subscriptionLevel = dimLevel(m, 'subscription')
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
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">Evidence</p>
        <div className="grid sm:grid-cols-1 gap-3">
          <DemandEvidencePanel m={m} />
          <RevenueEvidencePanel m={m} />
          <CompetitionEvidencePanel m={m} />
        </div>
      </div>

      {/* Market structure — qualitative narrative, distinct from the
          quantitative Competition evidence panel above */}
      <div className="pt-5 border-t border-lab-border-soft">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Market Structure (Narrative)</p>
          <ProvenanceBadge p={m.market_saturation ? marketSaturationProvenance(sig) : legacyCompetitionProvenance()} />
        </div>
        <MarketSaturationBlock m={m} />
      </div>

      {/* Subscription — no real data source exists for this dimension;
          virality gets its own platform-native card with raw evidence
          (see TikTokSignalCard) */}
      <div className="pt-5 border-t border-lab-border-soft space-y-3">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest mb-3">Other Signals</p>
        <div className="ledger">
          {subscriptionLevel && (
            <div className="ledger-row">
              <span className="text-xs font-semibold text-lab-text-secondary w-28 shrink-0">Subscription</span>
              <span className="font-display font-semibold text-base text-lab-text-primary w-16 shrink-0">{subscriptionLevel}</span>
              <SignalBars level={LEVEL_TO_SIGNAL[subscriptionLevel]} />
              <span className="flex-1 text-xs text-lab-text-tertiary truncate hidden md:inline">{subscription?.notes}</span>
              <span className="ml-auto shrink-0 flex items-center gap-2">
                <ProvenanceBadge p={subscriptionProvenance()} />
              </span>
            </div>
          )}
        </div>
        <TikTokSignalCard
          score={computeGroundedScore(m).dimensions.find(d => d.key === 'virality')?.rawScore ?? null}
          qualitativeLevel={dimLevel(m, 'virality')}
          notes={m.scores.virality?.notes ?? ''}
          provenance={viralityP}
          virality={m.signal_evidence?.virality?.value}
        />
      </div>

      {/* Market gaps */}
      <div className="pt-5 border-t border-lab-border-soft">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">Market Gaps (AI-Identified)</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.marketGaps} />
        </div>
        <NumList items={m.market_gaps} />
      </div>

      {/* Keyword Intelligence has its own top-level tab (2026-06-26) — moved
          out of here, same reasoning as the Consumer Intelligence move
          below: a "core pillar" deserves its own destination, not a
          footnote at the bottom of Market. */}
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
  const hasComp = !!(comp?.name && comp.name !== 'N/A' && !comp.name.toLowerCase().includes('not independently verified'))

  const x = CONCENTRATION_X[sat?.concentration ?? 'Moderate'] ?? 50
  const usY = DIFFICULTY_WHITESPACE[sat?.entry_difficulty ?? 'Medium'] ?? 50
  const incumbentY = 16

  const cx = 150, cy = 150, w = 300, h = 300
  const toPx = (px: number, py: number) => [24 + (px / 100) * (w - 48), 24 + (1 - py / 100) * (h - 48)]
  const [usX, usPy]   = toPx(Math.min(94, x + 6), usY)
  const [incX, incPy] = toPx(Math.max(6, x - 6), incumbentY)

  return (
    <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-5 sm:p-7">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Competitive Position Map</p>
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider hidden sm:inline">Concentration vs. whitespace</p>
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
      <div className="flex justify-between mt-1 text-[10px] text-lab-text-tertiary uppercase tracking-wider">
        <span>← Less concentrated</span>
        <span>More concentrated →</span>
      </div>
    </div>
  )
}

function CompetitiveLandscapeContent({ m }: { m: MemoData }) {
  const comp = m.biggest_competitor
  const hasComp = !!(comp?.name && comp.name !== 'N/A' && !comp.name.toLowerCase().includes('not independently verified'))
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
        <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md overflow-hidden">
          <div className="grid grid-cols-3 bg-white/[0.04] px-4 py-2.5 text-[10px] text-lab-text-tertiary uppercase tracking-wider">
            <span>Brand</span><span>Est. Revenue</span><span>Their Gap</span>
          </div>
          <div className="grid grid-cols-3 px-4 py-3.5 text-sm">
            <span className="font-semibold text-lab-text-primary">{comp.name}</span>
            <span className="font-mono text-lab-text-secondary">{comp.revenue}</span>
            <span className="text-lab-text-secondary text-xs leading-relaxed col-span-1">{comp.gap}</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-lab-text-tertiary uppercase tracking-widest">Unclaimed Positioning Angles</p>
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

// ── Trajectory Timeline — legacy memos only (had real-looking probability
// strings with no real basis — see lib/scoring.ts header). Memos generated
// from 2026-06-26 onward never populate these three fields; TractionBand
// below replaces this entirely for new memos.
function TrajectoryTimeline({ fp }: { fp: MemoData['financial_projections'] }) {
  if (!fp.ten_k_probability && !fp.hundred_k_probability && !fp.one_m_probability) return null

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
    <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3 mb-7">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Revenue Trajectory</p>
        <ProvenanceBadge p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: 'Legacy field from a memo generated before 2026-06-26 — these probability percentages were generated to look like forecasting-tool output, with no statistical base-rate model behind them. Memos generated after this date use a qualitative traction band instead — see below.' }} />
      </div>
      <div className="relative flex justify-between items-start">
        <div className="absolute left-[8%] right-[8%] top-[10px] h-[1.5px] bg-gradient-to-r from-zinc-600 via-amber-400/50 to-emerald-400/60" />
        {milestones.map(ms => (
          <div key={ms.label} className="relative flex flex-col items-center flex-1">
            <span
              className="rounded-full border-2 bg-[#0a0a0c] relative z-10"
              style={{ width: ms.size, height: ms.size, borderColor: ms.color }}
            />
            <span className="mt-3 text-sm font-semibold text-lab-text-primary text-center">{ms.label}</span>
            <span className="text-xs font-mono mt-0.5" style={{ color: ms.value ? ms.color : '#71717a' }} title={ms.value ? 'Rounded to a 10-point band — the model\'s exact percentage implies more precision than an ungrounded estimate can support.' : undefined}>
              {ms.value ? toConfidenceBand(ms.value) : ms.sub}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Traction Band — deterministic replacement for the trajectory timeline
// above, computed server-side from real signals (lib/scoring.ts
// computeTractionBand). No invented probability, no number at all — a
// disclosed three-way qualitative read.
function TractionBandCard({ band }: { band: string }) {
  const cls = band === 'Strong comparable traction' ? 'text-lab-verdant border-lab-verdant/20 bg-lab-verdant/[0.04]'
    : band === 'Some comparable traction' ? 'text-lab-amber border-lab-amber/20 bg-lab-amber/[0.04]'
    : 'text-lab-text-secondary border-white/[0.08] bg-white/[0.02]'
  return (
    <div className={`rounded-xl border p-5 sm:p-7 ${cls}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider opacity-80">Traction Read</p>
        <ProvenanceBadge p={{ level: 'estimated', source: 'Server-side formula', detail: 'Computed deterministically from the real signal data available for this query (which real dimensions were found, and how strong the real revenue/demand score is) — not a probability, not AI-invented. Replaces the old ten_k/hundred_k/one_m probability fields, which had no real base-rate model behind them.' }} />
      </div>
      <p className="font-display text-xl font-medium">{band}</p>
    </div>
  )
}

function FinancialOutlookContent({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  const rev = m.signal_evidence?.revenue?.value
  const hasRealFeeData = rev?.avg_referral_fee_pct !== undefined || rev?.avg_fba_pick_pack_fee !== undefined
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
        <div className="flex items-start gap-2.5 text-xs text-lab-amber/80 bg-lab-amber/5 border border-lab-amber/20 rounded-lg px-3 py-2.5">
          <IconAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Market size not independently verified. Figures shown are AI estimates — consult industry reports before citing.</span>
        </div>
      )}
      {hasRealFeeData && (
        <div className="rounded-lg bg-lab-verdant/5 border border-emerald-400/15 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Real Amazon Fee Cross-Check</span>
            <ProvenanceBadge p={realFeeDataProvenance(m.signal_evidence)!} />
          </div>
          <p className="text-xs text-lab-text-secondary leading-relaxed">
            Gross/net margin above is the model&rsquo;s own guess. Amazon&rsquo;s real published fee schedule for this category:
            {rev?.avg_referral_fee_pct !== undefined && <> referral fee <span className="text-lab-text-primary font-mono">{rev.avg_referral_fee_pct}%</span></>}
            {rev?.avg_referral_fee_pct !== undefined && rev?.avg_fba_pick_pack_fee !== undefined && ', '}
            {rev?.avg_fba_pick_pack_fee !== undefined && <>FBA pick &amp; pack <span className="text-lab-text-primary font-mono">{rev.avg_fba_pick_pack_fee}</span></>}
            {' '}— use this to sanity-check the margin estimate, not as the full cost structure.
          </p>
        </div>
      )}
      <TrajectoryTimeline fp={fp} />
      {fp.traction_band && <TractionBandCard band={fp.traction_band} />}
      <div className="flex divide-x divide-white/[0.06] bg-lab-void-2 border border-lab-border-soft rounded-lab-md overflow-hidden">
        {([
          ['Gross Margin',     fp.gross_margin],
          ['Net at Scale',     fp.net_margin_at_scale],
        ] as [string, string][]).map(([l, v]) => {
          const unverified = !v || v.toLowerCase().includes('not independently verified')
          return (
            <div key={l} className="flex-1 px-3 py-3.5 text-center" title={unverified ? v ?? STATIC_PROVENANCE.financialProjections.detail : STATIC_PROVENANCE.financialProjections.detail}>
              <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-1.5">{l}</p>
              <p className={unverified ? 'text-xs text-lab-text-tertiary italic' : 'font-display font-semibold text-base'}>
                {unverified ? 'Not verified' : v}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LAUNCH STRATEGY — product direction + market entry
// ═══════════════════════════════════════════════════════════════

// ── Product Concept Visual — a generated concept render, not a photo.
// Honest framing: studio-lit package shape inferred from the recommended
// format (cylindrical light wrap, specular hotspot, rim light, blurred
// contact shadow). It is explicitly labeled as a concept render so it
// never reads as a real product photo (that still requires a real
// image-gen pipeline). Shape inference + SVG rendering live in ProductGlyph.tsx.
function ProductConceptVisual({ format, categoryName }: { format: string; categoryName: string }) {
  const shape = inferProductShape(format)

  return (
    <div className="relative bg-lab-void-2 border border-lab-border-soft rounded-lab-md bg-gradient-to-b from-white/[0.03] to-transparent p-6 sm:p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-1 relative z-10">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Product Concept</p>
        <p className="text-[10px] text-lab-text-tertiary italic">Generated concept render — not a product photo</p>
      </div>
      <div className="flex items-center justify-center py-4 relative z-10" style={{ animation: 'heroRenderIn .8s var(--ease-premium, ease) both' }}>
        <ProductRenderHero shape={shape} />
      </div>
      <p className="text-center text-sm font-medium text-lab-text-secondary relative z-10">{categoryName}</p>
      <p className="text-center text-xs text-lab-text-tertiary mt-0.5 relative z-10">{format}</p>
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

      <div className="flex flex-wrap sm:flex-nowrap divide-x divide-white/[0.06] bg-lab-void-2 border border-lab-border-soft rounded-lab-md overflow-hidden">
        {([
          ['Format', rec.format],
          ['Usage',  rec.dosing],
          ['COGS',   rec.cogs_estimate],
          ['Retail', rec.retail_price],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 min-w-[100px] px-3 py-3" title={(l === 'COGS' || l === 'Retail') ? STATIC_PROVENANCE.productEconomics.detail : undefined}>
            <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-lab-text-secondary leading-snug font-mono">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-lab-text-tertiary uppercase tracking-widest">Key Ingredients / Components</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.productFormula} />
        </div>
        <div className="overflow-x-auto bg-lab-void-2 border border-lab-border-soft rounded-lab-md">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-white/[0.04] text-[10px] text-lab-text-tertiary uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 w-[30%]">Ingredient</th>
                <th className="text-left py-2.5 px-3 w-[14%]">Dose</th>
                <th className="text-left py-2.5 px-3">Role</th>
                <th className="text-center py-2.5 px-3 w-[14%]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rec.formula.map((row, i) => (
                <tr key={i} className="border-t border-lab-border-faint hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-medium text-sm">{row.ingredient}</td>
                  <td className="py-3 px-3 font-mono text-lab-amber text-xs">{row.dose}</td>
                  <td className="py-3 px-3 text-lab-text-secondary text-xs leading-relaxed">{row.role}</td>
                  <td className="py-3 px-3 text-center text-sm">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rec.avoid?.length > 0 && (
        <div>
          <p className="text-xs text-lab-text-tertiary uppercase tracking-widest mb-2.5">Avoid</p>
          <ul className="space-y-1.5">
            {rec.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-lab-text-secondary">
                <IconX className="w-3 h-3 text-lab-ember/70 shrink-0 mt-1" />{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fp.path_to_10m && (
        <div className="bg-white/[0.04] rounded-lg p-4">
          <p className="text-xs text-lab-text-tertiary uppercase tracking-widest mb-2">Path to $10M ARR</p>
          <p className="text-sm text-lab-text-secondary leading-relaxed">{fp.path_to_10m}</p>
        </div>
      )}

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// RISK ASSESSMENT — severity-sorted register
// ═══════════════════════════════════════════════════════════════

function RiskAssessmentContent({ m }: { m: MemoData }) {
  // Single source of truth (2026-06-26 fix): previously read m.scores.X.score
  // directly — the model's OWN raw number, which could silently disagree
  // with the real, server-computed score computeGroundedScore actually used
  // elsewhere on the same memo (e.g. Score Breakdown). Now reads the same
  // resolved dimensions everywhere: real rawScore when one exists, the AI's
  // qualitativeLevel only when it doesn't.
  const resolvedDims = computeGroundedScore(m).dimensions
    .filter(d => (['demand', 'virality', 'subscription', 'manufacturing'] as const).includes(d.key as never))
  const weak = resolvedDims
    .map(d => ({
      key:      d.key,
      notes:    m.scores[d.key as 'demand' | 'virality' | 'subscription' | 'manufacturing']?.notes ?? '',
      isWeak:   d.rawScore !== undefined ? d.rawScore <= 5 : d.qualitativeLevel === 'Low',
      severity: d.rawScore !== undefined ? (d.rawScore <= 3 ? 'High' as const : 'Medium' as const) : 'Medium' as const,
      display:  d.rawScore !== undefined ? `${d.rawScore}/10` : (d.qualitativeLevel ?? 'Low'),
      provenance: { level: d.source, source: d.sourceLabel, detail: d.sourceLabel } as Provenance,
    }))
    .filter(d => d.isWeak && d.notes)
    .sort((a, b) => (a.severity === 'High' ? 0 : 1) - (b.severity === 'High' ? 0 : 1))

  // Real recall risk, from News Intelligence — this tab was previously
  // 100% AI-judged dimension scores with zero real external-event grounding,
  // even though a real FDA recall (with a real severity classification) is
  // exactly the kind of fact a risk assessment should lead with when one exists.
  const recall = m.news_intelligence?.items.find(it => it.category === 'FDA Recall')
  // Real, notably negative news sentiment — -3 on GDELT's -10..+10 scale is
  // a deliberately conservative bar (general news coverage skews negative
  // by default), so this only fires when real coverage is genuinely sour,
  // not on ordinary background negativity.
  const sentiment = m.news_intelligence?.sentiment
  const sentimentIsNegative = sentiment !== undefined && sentiment !== null && sentiment.avg_tone <= -3

  if (weak.length === 0 && !recall && !sentimentIsNegative) return (
    <LabEmptyState
      icon={<IconAlert className="w-5 h-5" />}
      title="No dimension scored below 6"
      description="Overall risk profile is moderate — primary risk is execution, not market structure."
    />
  )

  return (
    <div className="space-y-3">
      <SectionIntro text="Dimensions where market structure works against you — each is a thesis-breaking risk if not addressed at launch." />
      {sentimentIsNegative && sentiment && (
        <LabEvidenceCard tier="unsupported" className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-lab-amber">Real Negative News Sentiment</p>
            <ProvenanceBadge p={newsSentimentProvenance(m.news_intelligence)!} />
          </div>
          <p className="text-sm text-lab-text-secondary leading-relaxed">
            Real GDELT coverage of this category skews negative (avg tone <span className="lab-text-data">{sentiment.avg_tone}</span> across {sentiment.sample_size} real articles) — worth reading the actual headlines in the News tab before committing capital.
          </p>
        </LabEvidenceCard>
      )}
      {recall && (
        <LabEvidenceCard tier={recall.recall_classification === 'Class I' ? 'unsupported' : 'estimated'} className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${recall.recall_classification === 'Class I' ? 'text-lab-ember' : 'text-lab-amber'}`}>
              Real FDA Recall{recall.recall_classification && recall.recall_classification !== 'Not Yet Classified' ? ` — ${recall.recall_classification}` : ''}
            </p>
            <ProvenanceBadge p={newsIntelligenceProvenance(m.news_intelligence)!} />
          </div>
          <p className="text-sm text-lab-text-secondary leading-relaxed">{recall.headline}</p>
          {recall.recall_status && <p className="text-[11px] text-lab-text-tertiary mt-1">Status: {recall.recall_status}</p>}
        </LabEvidenceCard>
      )}
      {weak.length > 0 && (
      <LabCard className="divide-y divide-lab-border-faint overflow-hidden">
        {weak.map(d => (
          <div key={d.key} className={`flex gap-3 px-4 py-3.5 ${d.severity === 'High' ? 'bg-lab-ember/[0.04]' : 'bg-lab-amber/[0.03]'}`}>
            <span className={`lab-text-data font-bold text-base shrink-0 w-10 ${d.severity === 'High' ? 'text-lab-ember' : 'text-lab-amber'}`}>{d.display}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${d.severity === 'High' ? 'text-lab-ember' : 'text-lab-amber'}`}>
                  {DIM_LABELS[d.key] ?? d.key}
                </p>
                <ProvenanceBadge p={d.provenance} />
              </div>
              <p className="text-sm text-lab-text-secondary leading-relaxed">{d.notes}</p>
            </div>
          </div>
        ))}
      </LabCard>
      )}
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
      <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-sm font-semibold text-lab-text-primary font-mono leading-snug">{value}</p>
      {sub && <p className="text-[10px] text-lab-text-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}

function MfgConfidencePill({ label }: { label: 'High' | 'Medium' | 'Low' }) {
  const cfg = {
    High:   { cls: 'text-lab-verdant border-lab-verdant/20 bg-lab-verdant/5', dot: 'bg-lab-verdant' },
    Medium: { cls: 'text-lab-amber   border-lab-amber/20   bg-lab-amber/5',   dot: 'bg-lab-amber'   },
    Low:    { cls: 'text-lab-text-tertiary    border-white/[0.1]        bg-white/[0.04]',   dot: 'bg-zinc-500'    },
  }[label]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{label} confidence
    </span>
  )
}

function ManufacturingDisplay({ est, mfgLevel }: { est: MfgEstimate; mfgLevel: 'High' | 'Medium' | 'Low' }) {
  const formatCurrency = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 === 0 ? n : n.toFixed(1)}`
  const isVerified   = est.data_source !== 'ai_synthesis'
  const sourceProvenance = manufacturingTabProvenance(est.data_source)

  // 2026-06-26 evidence-first redesign: the ai_synthesis fallback no longer
  // fabricates these five fields when no real supplier data exists — they
  // come back undefined/null rather than a number with nothing behind it.
  // "Insufficient Verified Data" replaces the old invented figure.
  const NO_DATA = 'Insufficient Verified Data'
  const unitCostRange = est.unit_cost ? `${formatCurrency(est.unit_cost.low)}–${formatCurrency(est.unit_cost.high)}` : null
  const moq       = est.moq            ? `${est.moq.low.toLocaleString()}–${est.moq.high.toLocaleString()} ${est.moq.unit}` : NO_DATA
  const leadTime  = est.lead_time_days ? `${est.lead_time_days.low}–${est.lead_time_days.high} days` : NO_DATA
  const suppliers = est.supplier_count ? `~${est.supplier_count.estimate.toLocaleString()}` : NO_DATA
  const rating    = est.top_supplier_rating != null ? `${est.top_supplier_rating}/5` : '—'

  const complexityColor =
    est.complexity === 'Low'    ? 'text-lab-verdant' :
    est.complexity === 'Medium' ? 'text-lab-amber'   :
    est.complexity === 'High'   ? 'text-orange-400'  :
                                   'text-lab-ember'

  const introText = isVerified
    ? `Live supplier data from ${est.data_source.replace(/_/g, ' ')}. Prices reflect per-unit cost at high-volume tier (USD).`
    : 'No live supplier data was available for this query — only a qualitative complexity judgment is shown below. Activate live supplier credentials for verified quotes.'

  return (
    <div className="space-y-5">
      <p className="text-xs text-lab-text-tertiary italic leading-relaxed">{introText}</p>

      {/* Headline number — omitted entirely (not shown as "Insufficient
          Verified Data" in giant serif type) when no real cost data exists,
          rather than giving a non-number the same visual weight as a price. */}
      {unitCostRange ? (
        <div className="flex items-end gap-2">
          <span className="font-display font-semibold text-3xl text-lab-text-primary tracking-tight">{unitCostRange}</span>
          <span className="text-xs text-lab-text-tertiary mb-1">per unit, landed</span>
        </div>
      ) : (
        <p className="text-sm text-lab-text-tertiary italic">{NO_DATA} — no live supplier quote for this query.</p>
      )}

      {/* Pipeline strip — Sourcing → Production → QA → Shipping */}
      <div className="flex divide-x divide-white/[0.06] bg-lab-void-2 border border-lab-border-soft rounded-lab-md overflow-x-auto">
        <PipelineStage label="Sourcing"   value={suppliers}        sub={est.supplier_count ? `${est.supplier_count.confidence} confidence` : undefined} />
        <PipelineStage label="Production" value={moq}              sub="MOQ" />
        <PipelineStage label="QA"         value={rating}           sub="avg. supplier rating" />
        <PipelineStage label="Shipping"   value={leadTime}         sub="lead time" />
      </div>

      <div className="flex divide-x divide-white/[0.06] bg-lab-void-2 border border-lab-border-soft rounded-lab-md overflow-hidden">
        <div className="flex-1 px-3 py-3">
          <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-1">Manufacturing Difficulty</p>
          <p className={`text-sm font-semibold leading-snug ${complexityColor}`}>{est.complexity}</p>
          <p className="text-[11px] text-lab-text-tertiary mt-0.5">AI ease judgment: {mfgLevel}</p>
        </div>
        <div className="flex-1 px-3 py-3 flex items-center justify-between">
          <MfgConfidencePill label={est.confidence_label} />
        </div>
      </div>

      {est.top_suppliers && est.top_suppliers.length > 0 && (
        <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-lab-text-primary">Real Named Suppliers</p>
            {/* Deterministic count of real country_code values above — not an
                AI estimate, just an arithmetic tally of the suppliers already
                listed below. */}
            {(() => {
              const withCountry = est.top_suppliers!.filter(s => s.country_code)
              if (!withCountry.length) return null
              const counts = new Map<string, number>()
              for (const s of withCountry) counts.set(s.country_code!, (counts.get(s.country_code!) ?? 0) + 1)
              const [topCountry, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
              return (
                <span className="text-[10px] text-lab-text-tertiary font-mono">
                  {topCount}/{withCountry.length} based in {topCountry}
                </span>
              )
            })()}
          </div>
          <ul className="space-y-2">
            {est.top_suppliers.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-lab-text-secondary font-medium truncate">{s.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-lab-text-tertiary shrink-0">
                  {s.country_code && <span className="font-mono text-lab-text-tertiary">{s.country_code}</span>}
                  {s.rating != null && <span className="font-mono text-lab-text-secondary">{s.rating.toFixed(1)}/5</span>}
                  {s.customizable && <span className="text-lab-spectrum">OEM/Customizable</span>}
                  {s.trade_assurance && <span className="text-lab-verdant">Trade Assurance</span>}
                  {s.gold_supplier_years && <span>{s.gold_supplier_years} gold supplier</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-lab-text-tertiary mt-3">Real Alibaba.com supplier names for this exact search — verify independently before committing capital; this is not an endorsement.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-lab-border-soft">
        <div className="flex items-center gap-1.5 text-[11px] text-lab-text-tertiary">
          <span>Source:</span><ProvenanceBadge p={sourceProvenance} />
        </div>
      </div>

      {est.notes && isVerified && (
        <p className="text-xs text-lab-text-tertiary leading-relaxed">{est.notes}</p>
      )}
    </div>
  )
}

function ManufacturingIntelligenceContent({ m, isActive }: { m: MemoData; isActive: boolean }) {
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [estimate, setEstimate] = useState<MfgEstimate | null>(null)

  // manufacturing level is an EASE judgment (High = easiest) — complexity is
  // the inverse: High ease → Low complexity hint for the real Apify lookup below.
  const mfgLevel = dimLevel(m, 'manufacturing') ?? 'Medium'
  const complexityHint = mfgLevel === 'High' ? 'Low' : mfgLevel === 'Low' ? 'High' : 'Medium'

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
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-lab-border-soft">
        <h2 className="font-display text-xl font-medium">Manufacturing Intelligence</h2>
        {status === 'done' && <ProvenanceBadge p={manufacturingTabProvenance(estimate?.data_source)} />}
      </div>
      {status === 'loading' && (
        <div className="flex items-center gap-2.5 text-sm text-lab-text-tertiary py-6 justify-center">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin shrink-0" />
          Estimating manufacturing parameters…
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-lab-ember/80 bg-lab-ember/5 border border-red-400/15 rounded-lg px-3 py-2.5">
          <IconX className="w-3.5 h-3.5 shrink-0 mt-px" />
          Manufacturing estimate unavailable — please try again later.
        </div>
      )}
      {status === 'done' && estimate && (
        <ManufacturingDisplay est={estimate} mfgLevel={mfgLevel} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FINAL RECOMMENDATION — closing visual moment, derived from
// existing decision/derive helpers, no new data.
// ═══════════════════════════════════════════════════════════════

function FinalRecommendation({ m, decision }: { m: MemoData; decision: BuildDecision }) {
  const budget = deriveValidationBudget(m, decision)
  const kill   = deriveKillCriteria(m)
  const cfg = {
    BUILD_NOW:        { label: 'Build Now',      cls: 'text-lab-verdant', glow: 'verdant' as const },
    VALIDATE_FURTHER: { label: 'Validate First', cls: 'text-lab-amber',   glow: 'amber' as const   },
    SKIP:             { label: 'Pass',           cls: 'text-lab-ember',   glow: 'ember' as const    },
    CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation Candidate', cls: 'text-lab-spectrum', glow: 'spectrum' as const },
  }[decision]

  return (
    <LabGlass tier="regular" glow={cfg.glow} className="p-6 sm:p-9 lab-animate-fade-up">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-photon mb-5">Final Recommendation</p>
      <div className="flex items-baseline gap-3 mb-4">
        <span className={`font-display text-3xl font-semibold tracking-tight ${cfg.cls}`}>{cfg.label}</span>
        <span className="text-sm text-lab-text-tertiary">at {budget.range} initial validation spend</span>
      </div>
      <p className="text-sm text-lab-text-secondary leading-relaxed mb-6">{m.build_explanation}</p>
      <div className="pt-5 border-t border-lab-border-soft">
        <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider mb-2">Watch for</p>
        <p className="text-xs text-lab-text-secondary leading-relaxed">{kill[0]}</p>
      </div>
    </LabGlass>
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
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-lab-border-soft">
        <h2 className="font-display text-xl font-semibold text-lab-text-primary">{title}</h2>
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
        <div className="space-y-5">
          <Hero m={m} score={score} decision={decision} generatedAt={generatedAt} />
          <EvidenceConfidenceSection m={m} decision={decision} confidence={confidence} />
          <AIAnalystSection m={m} />
          <InvestmentThesisSection m={m} blocks={blocks} decision={decision} />
        </div>

        {/* ── Sticky horizontal tab strip (mobile/tablet only) ───────── */}
        <SectionNav active={activeTab} onSelect={jumpToTab} />

        {/* ── Deep-dive sections — true tabs: one pane visible at a time ── */}
        <div ref={tabPanelRef} className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md shadow-lab-xs p-6 sm:p-8 min-h-[420px] scroll-mt-6">
          <div className={activeTab === 'market-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Market Intelligence">
              <MarketIntelligenceContent m={m} />
            </DeepDiveSection>
          </div>

          <div className={activeTab === 'keyword-intelligence' ? '' : 'hidden'}>
            <DeepDiveSection title="Keyword Intelligence">
              <KeywordIntelligenceContent m={m} />
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

                <div className="pt-6 border-t border-lab-border-soft">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-[10px] text-lab-text-tertiary uppercase tracking-widest">AI-Generated Customer Personas</p>
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
        <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-5">
          <RailNav active={activeTab} onSelect={jumpToTab} />
        </div>
      </aside>
    </div>
  )
}
