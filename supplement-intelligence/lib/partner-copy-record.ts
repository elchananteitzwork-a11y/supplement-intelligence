// ═══════════════════════════════════════════════════════════════════════
// lib/partner-copy-record.ts — V4 Phase 2 (docs/RD_V4_PHASE2.md Milestone B).
// Pure, JSX-free mapping from real MemoData fields to the Record's six
// chapters. Same standing rule as lib/partner-copy.ts: no number is ever
// invented, no LLM call happens here; a section renders nothing rather
// than fabricate when its real field is absent.
//
// Scope note (smallest-correct-scope, RD §6): the Evidence appendix's
// "full competitor table" is deliberately narrowed for this milestone to
// the fields already safely and cheaply available (keyword_intelligence,
// signal_metadata, evidence_depth_score) — the raw top_competitors array
// (lib/evidence/adapter.ts) is real but not surfaced row-by-row here yet;
// a fast follow, not silently dropped (see EvidenceAppendixVM's
// `competitorsNote`).
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'

export interface RecordRow {
  claim: string
  value: string
  marker: 'measured' | 'judgment'
}

export interface RecordChapterVM {
  key:      'demand' | 'competition' | 'economics' | 'customers' | 'gap' | 'safety'
  title:    string
  headline: string
  rows:     RecordRow[]
  read:     string | null   // "My read" — only ever composed from real fields already on this chapter, never a new claim
}

export interface GapLetterVM {
  opening:        string
  openingFirstLetter: string
  openingRest:    string
  gapStatements:  { text: string; marker: 'measured' | 'judgment' }[]
  specIntro:      string
  specRows:       RecordRow[]
  avoidLine:      string | null
  brandMoves:     string[]
  customerQuote:  string | null
  closingLine:    string
  noReviewCorpus: boolean
}

function splitFirstLetter(s: string): { first: string; rest: string } {
  if (!s) return { first: '', rest: '' }
  return { first: s[0], rest: s.slice(1) }
}

export function buildRecordChapters(m: MemoData): RecordChapterVM[] {
  const chapters: RecordChapterVM[] = []

  // ── Demand ──────────────────────────────────────────────────────────
  // Real search volume lives only on m.keyword_intelligence (DataForSEO) —
  // never on signal_evidence.demand, which has no absolute-volume field
  // (see lib/signal-engine/types.ts's DemandSignal header comment).
  const demandRows: RecordRow[] = []
  const topKeyword = m.keyword_intelligence?.top_buying?.[0]
  if (topKeyword) {
    demandRows.push({ claim: topKeyword.keyword, value: `${topKeyword.monthly_searches.toLocaleString()}/mo`, marker: 'measured' })
  }
  if (m.scores.demand?.notes) demandRows.push({ claim: 'Demand read', value: m.scores.demand.level ?? '—', marker: 'judgment' })
  if (demandRows.length > 0) {
    chapters.push({
      key: 'demand', title: 'Demand',
      headline: m.scores.demand?.notes ?? 'Real search and market interest for this category.',
      rows: demandRows,
      read: m.scores.demand?.notes ?? null,
    })
  }

  // ── Competition ─────────────────────────────────────────────────────
  const compRows: RecordRow[] = []
  if (m.biggest_competitor?.name) {
    compRows.push({ claim: 'Category leader', value: m.biggest_competitor.name, marker: 'measured' })
    if (m.biggest_competitor.revenue) compRows.push({ claim: "Leader's revenue", value: m.biggest_competitor.revenue, marker: 'measured' })
    if (m.biggest_competitor.gap) compRows.push({ claim: 'The gap they leave open', value: m.biggest_competitor.gap, marker: 'judgment' })
  }
  if (m.market_saturation?.dominant_brands) {
    compRows.push({ claim: 'Dominant brands', value: m.market_saturation.dominant_brands, marker: 'measured' })
  }
  if (compRows.length > 0) {
    chapters.push({
      key: 'competition', title: 'Competition',
      headline: m.market_saturation?.competitive_intensity ?? 'Who else is already here.',
      rows: compRows,
      read: m.scores.competition?.notes ?? null,
    })
  }

  // ── Economics ───────────────────────────────────────────────────────
  const econRows: RecordRow[] = []
  if (m.product_recommendation?.cogs_estimate) econRows.push({ claim: 'Landed unit cost', value: m.product_recommendation.cogs_estimate, marker: 'measured' })
  if (m.product_recommendation?.retail_price) econRows.push({ claim: 'Comparable retail price', value: m.product_recommendation.retail_price, marker: 'measured' })
  if (m.product_recommendation?.gross_margin) econRows.push({ claim: 'Gross margin', value: m.product_recommendation.gross_margin, marker: 'judgment' })
  if (m.financial_projections?.traction_band) econRows.push({ claim: 'Traction band', value: m.financial_projections.traction_band, marker: 'judgment' })
  if (econRows.length > 0) {
    chapters.push({
      key: 'economics', title: 'Economics',
      headline: m.market_size ?? 'What it costs to enter, and what it could return.',
      rows: econRows,
      read: m.financial_projections?.net_margin_at_scale ?? null,
    })
  }

  // ── Customers ───────────────────────────────────────────────────────
  const custRows: RecordRow[] = []
  const cl = m.customer_language
  if (cl?.frustrations?.length) custRows.push({ claim: 'Top frustration', value: cl.frustrations[0], marker: 'measured' })
  if (cl?.desires?.length) custRows.push({ claim: 'What they want instead', value: cl.desires[0], marker: 'judgment' })
  if (custRows.length > 0) {
    chapters.push({
      key: 'customers', title: 'Customers',
      headline: cl?.fears?.[0] ?? 'Who buys this, and why.',
      rows: custRows,
      read: cl?.ad_phrases?.[0] ? `A real phrase buyers use: "${cl.ad_phrases[0].they_say}"` : null,
    })
  }

  // ── The gap — and how you'd win ─────────────────────────────────────
  const gap = buildGapLetter(m)
  if (gap) {
    chapters.push({
      key: 'gap', title: "The gap — and how you'd win",
      headline: gap.opening.slice(0, 120) + (gap.opening.length > 120 ? '…' : ''),
      rows: [],
      read: null,
    })
  }

  // ── Signals & Safety ────────────────────────────────────────────────
  const safetyRows: RecordRow[] = []
  const eds = m.evidence_depth_score
  if (eds?.available) {
    safetyRows.push({ claim: 'Evidence coverage', value: `${Math.round(eds.coverage * 100)}%`, marker: 'measured' })
  }
  // top_competitors lives on ReviewVelocitySignal, not CompetitionSignal —
  // see lib/signal-engine/types.ts.
  const topCompetitors = m.signal_evidence?.review_velocity?.value?.top_competitors ?? []
  const flaggedForClaims = topCompetitors.filter(c => (c.claim_risk_flags?.length ?? 0) > 0).length
  const recallCount = topCompetitors.reduce((sum, c) => sum + (c.manufacturer_recall_flags?.reduce((s, r) => s + r.count, 0) ?? 0), 0)
  if (topCompetitors.length > 0) {
    safetyRows.push({
      claim: 'Competitors with flagged claim language',
      value: `${flaggedForClaims} of ${topCompetitors.length}`,
      marker: 'measured',
    })
    safetyRows.push({ claim: 'Manufacturer recall records found', value: String(recallCount), marker: 'measured' })
  }
  if (safetyRows.length > 0) {
    chapters.push({
      key: 'safety', title: 'Signals & Safety',
      headline: 'What the regulatory and evidence scans found.',
      rows: safetyRows,
      read: null,
    })
  }

  return chapters
}

export interface EvidenceAppendixVM {
  keywords: { term: string; volume: number; growthLabel: string | null }[]
  sources:  { name: string }[]
  overallConfidence: number | null
  coverageLine: string | null
  competitorsNote: string  // honest disclosure — see file header scope note
}

export function buildEvidenceAppendix(m: MemoData): EvidenceAppendixVM {
  const kw = m.keyword_intelligence
  const allTerms = [...(kw?.top_buying ?? []), ...(kw?.opportunity ?? []), ...(kw?.long_tail ?? []), ...(kw?.fast_growing ?? [])]
  const seen = new Set<string>()
  const keywords = allTerms
    .filter(k => (seen.has(k.keyword) ? false : (seen.add(k.keyword), true)))
    .slice(0, 12)
    .map(k => ({
      term: k.keyword,
      volume: k.monthly_searches,
      growthLabel: k.growth_pct === null ? null : `${k.growth_pct > 0 ? '+' : ''}${k.growth_pct.toFixed(0)}%`,
    }))

  const sources = (m.signal_metadata?.providers_used ?? []).map(name => ({ name }))

  const eds = m.evidence_depth_score
  const coverageLine = eds?.available
    ? `Evidence coverage for this query: ${eds.contributions?.length ?? 0} of 6 deep-evidence clusters had data available (${Math.round(eds.coverage * 100)}%). A score built from partial coverage is never presented as equal to one built from full coverage.`
    : null

  return {
    keywords,
    sources,
    overallConfidence: m.signal_metadata?.overall_confidence ?? null,
    coverageLine,
    competitorsNote: 'Full per-competitor pricing and listing-age table: not yet surfaced here — the underlying data is real and already captured (see the Competition chapter for the category leader), a fast follow to this appendix.',
  }
}

export function buildGapLetter(m: MemoData): GapLetterVM | null {
  const gaps = m.market_gaps ?? []
  if (gaps.length === 0) return null

  const noReviewCorpus = !m.consumer_intelligence

  const openingSentence = gaps.length > 0
    ? `The ${m.category_name.toLowerCase()} category is crowded, but nobody has closed every real gap buyers keep naming.`
    : ''
  const { first, rest } = splitFirstLetter(openingSentence)

  const gapStatements = gaps.slice(0, 5).map((text, i) => ({
    text,
    marker: (i === 0 ? 'measured' : 'judgment') as 'measured' | 'judgment',
  }))

  const specRows: RecordRow[] = (m.product_recommendation?.formula ?? []).map(ing => ({
    claim: `${ing.ingredient}${ing.dose ? `, ${ing.dose}` : ''}`,
    value: ing.role,
    marker: 'judgment',
  }))

  const avoidLine = m.product_recommendation?.avoid?.length
    ? `What I'd avoid: ${m.product_recommendation.avoid.join('; ')}.`
    : null

  const brandMoves = (m.brand_opportunities ?? []).slice(0, 3)

  const customerQuote = m.customer_language?.ad_phrases?.[0]?.they_say
    ? `"${m.customer_language.ad_phrases[0].they_say}"`
    : null

  return {
    opening: openingSentence,
    openingFirstLetter: first,
    openingRest: rest,
    gapStatements,
    specIntro: m.product_recommendation?.format
      ? `If I were building this: a ${m.product_recommendation.format}${m.product_recommendation.dosing ? `, ${m.product_recommendation.dosing}` : ''}.`
      : "If I were building this, here's where I'd start.",
    specRows,
    avoidLine,
    brandMoves,
    customerQuote,
    closingLine: "Build the thing they're already asking for.",
    noReviewCorpus,
  }
}
