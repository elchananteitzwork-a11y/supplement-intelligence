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
import type { MarketReport } from '@/lib/competitive-review-engine'
import { matchTrackedIngredient } from '@/lib/science-engine/tracked-ingredients'

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

// Item ב (docs/RD_V4_NICHE_COMPETITOR_ECONOMICS.md): every measured-revenue
// figure carries a "~" because monthlySold is Amazon's rounded-down band —
// these are floors, never exact counts. Same $Xk/mo convention as
// lib/real-competitor.ts's fmtRevenue.
function fmtMeasuredMonthly(n: number): string {
  if (n >= 1_000_000) return `~$${(Math.round(n / 100_000) / 10).toFixed(1)}M/mo`
  if (n >= 1000) return `~$${Math.round(n / 1000)}k/mo`
  return `~$${Math.round(n)}/mo`
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
    // biggest_competitor is an LLM-written memo field UNLESS the server-side
    // real-data override ran (lib/real-competitor.ts sets
    // signal_metadata.competitor_revenue_verified when name/revenue were
    // replaced with real Apify+Keepa values) — the marker must follow the
    // flag, not the field name (truth audit 2026-08-02, RD_TRUTH_AUDIT.md).
    const leaderMarker: RecordRow['marker'] = m.signal_metadata?.competitor_revenue_verified ? 'measured' : 'judgment'
    compRows.push({ claim: 'Category leader', value: m.biggest_competitor.name, marker: leaderMarker })
    if (m.biggest_competitor.revenue) compRows.push({ claim: "Leader's revenue", value: m.biggest_competitor.revenue, marker: leaderMarker })
    if (m.biggest_competitor.gap) compRows.push({ claim: 'The gap they leave open', value: m.biggest_competitor.gap, marker: 'judgment' })
  }
  if (m.market_saturation?.dominant_brands) {
    // LLM-written field — never 'measured' (truth audit 2026-08-02).
    compRows.push({ claim: 'Dominant brands', value: m.market_saturation.dominant_brands, marker: 'judgment' })
  }
  // Item ב: leader's share of the measured per-competitor revenue (only
  // present when ≥2 niche search products were measured on both axes).
  const revVal = m.signal_evidence?.revenue?.value
  if (revVal?.revenue_concentration_top1 !== undefined) {
    compRows.push({
      claim: "Leader's share of measured revenue",
      value: `~${Math.round(revVal.revenue_concentration_top1 * 100)}%`,
      marker: 'measured',
    })
  }
  // Entry Proof ladder (docs/RD_ENTRY_PROOF.md): wording scales with how
  // many low-review sellers are genuinely moving volume — 1 example / 2
  // independent examples / 3+ = "pattern" (the owner's strongest tier).
  // Every number is a raw Keepa field (marker measured); the tilde is the
  // monthlySold floor convention; the niche median gives honest scale;
  // suspected deep-discount volume is disclosed inline, never hidden.
  // Rows stored before the ladder existed have no `members` — they render
  // the single-example wording unchanged.
  const ep = revVal?.entry_proof
  if (ep) {
    const members = ep.members ?? []
    const typical = `(typical here: ${ep.niche_median_reviews.toLocaleString()} reviews)`
    if (members.length >= 2) {
      const minSold     = Math.min(...members.map(m => m.monthly_sold))
      const maxReviews  = Math.max(...members.map(m => m.review_count))
      const dumped      = members.find(m => m.price_dump_suspected)
      const dumpNote    = dumped ? ` — incl. one at $${Math.round(dumped.price)} vs typical $${ep.niche_median_price}` : ''
      const isPattern   = members.length >= 3
      compRows.push({
        claim: isPattern
          ? 'Entry pattern — multiple low-review sellers moving volume'
          : 'Proof of entry — two independent low-review sellers',
        value: isPattern
          ? `${members.length} different brands, each ≤${maxReviews.toLocaleString()} reviews, each moving ~${minSold.toLocaleString()}+/mo ${typical}${dumpNote}`
          : `${members[0].brand} + ${members[1].brand}: each ≤${maxReviews.toLocaleString()} reviews, each moving ~${minSold.toLocaleString()}+/mo ${typical}${dumpNote}`,
        marker: 'measured',
      })
    } else {
      const dump = ep.price_dump_suspected
        ? ` — at $${Math.round(ep.price)} vs typical $${ep.niche_median_price}`
        : ''
      compRows.push({
        claim: 'Proof of entry — low-review seller moving volume',
        value: `${ep.brand}: ~${ep.monthly_sold.toLocaleString()}/mo with only ${ep.review_count.toLocaleString()} reviews ${typical}${dump}`,
        marker: 'measured',
      })
    }
  }
  // Entry Outcomes (docs/RD_ENTRY_OUTCOMES.md): one state-dependent row on
  // the visible young cohort. Every number traces to stored member lists
  // (marker measured); 'insufficient' renders nothing (absence over weak
  // claims); the visibility-floor caveat lives in the appendix footnote,
  // not here. The no_small_entrants copy is an observation about review
  // scale — never a brand-identity claim (critique rule).
  const eo = revVal?.entry_outcomes
  if (eo && eo.state !== 'insufficient') {
    if (eo.state === 'welcoming') {
      compRows.push({
        claim: 'Young sellers here break through',
        value: `${eo.broke_out.length} of ${eo.judgeable_count} small-scale young listings (6-24mo) are selling past ~${eo.stall_threshold_sold.toLocaleString()}/mo`,
        marker: 'measured',
      })
    } else if (eo.state === 'contested') {
      compRows.push({
        claim: 'Young sellers here often stall',
        value: `${eo.stalled.length} of ${eo.judgeable_count} small-scale young listings (6-24mo) are stuck at ~${eo.stall_threshold_sold.toLocaleString()}/mo or less by Amazon's own sales badge`,
        marker: 'measured',
      })
    } else {
      compRows.push({
        claim: 'No small-scale young seller visible',
        value: `Every young listing visible here (${eo.young_total}) already carries a 1,000+ review base`,
        marker: 'measured',
      })
    }
  }
  // Wounded Leader (docs/RD_WOUNDED_LEADER_AMAZON_PRESENCE.md): the revenue
  // leader's real cracks, numbers only, no attack advice. Absent = no wound
  // detected or data missing — no health claim is made on silence.
  const wl = revVal?.wounded_leader
  if (wl && wl.wounds.length > 0) {
    const parts = wl.wounds.map(w =>
      w.type === 'rating_slide' ? `rating ${w.now.toFixed(1)}, down from ${w.baseline.toFixed(1)} a year ago` :
      w.type === 'rating_gap'   ? `rating ${w.now.toFixed(1)} vs ${w.baseline.toFixed(1)} typical here` :
      `price up ${Math.round((w.now / w.baseline - 1) * 100)}% vs its yearly average`)
    compRows.push({
      claim: 'The revenue leader shows cracks',
      value: `${wl.brand}: ${parts.join('; ')}`,
      marker: 'measured',
    })
  }
  // Amazon First-Party Presence: two DISTINCT facts, never conflated
  // (critique rule) — a house brand selling here vs Amazon-as-retailer
  // (vendor-supplied brands). Facts with real numbers; the "should you
  // enter" conclusion is deliberately not made (the veto is half-folklore
  // — research context lives in the appendix line).
  const ap = revVal?.amazon_presence
  if (ap) {
    if (ap.house_brands.length > 0) {
      const hb = ap.house_brands[0]
      const sold = hb.monthly_sold !== null ? ` at ~${hb.monthly_sold.toLocaleString()}/mo` : ''
      const more = ap.house_brands.length > 1 ? ` (+${ap.house_brands.length - 1} more Amazon brand${ap.house_brands.length > 2 ? 's' : ''})` : ''
      compRows.push({
        claim: "Amazon's own brand sells here",
        value: `${hb.brand}${sold}${more}`,
        marker: 'measured',
      })
    }
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
  // Item ב: what this exact niche's top sellers measurably gross — market
  // context first, then unit economics. Floor semantics via "~" (see
  // fmtMeasuredMonthly).
  if (revVal?.measured_revenue_total_mo !== undefined && revVal.top_competitor_revenues?.length) {
    econRows.push({
      claim: `Measured revenue, top ${revVal.top_competitor_revenues.length} sellers`,
      value: fmtMeasuredMonthly(revVal.measured_revenue_total_mo),
      marker: 'measured',
    })
  }
  // product_recommendation.* are LLM-written memo fields — never 'measured'
  // (truth audit 2026-08-02, RD_TRUTH_AUDIT.md; previously the top item on
  // the dormant fee-honesty list).
  if (m.product_recommendation?.cogs_estimate) econRows.push({ claim: 'Landed unit cost', value: m.product_recommendation.cogs_estimate, marker: 'judgment' })
  if (m.product_recommendation?.retail_price) econRows.push({ claim: 'Comparable retail price', value: m.product_recommendation.retail_price, marker: 'judgment' })
  // Real Amazon fee schedule for this category's top sellers, mirrored by
  // Keepa per product and averaged at fetch time (docs/RD_V4_MEASURED_FEES.md).
  // Placed between price and margin so the reading order is cost → price →
  // what Amazon takes → margin. Each row gates on its own field; absence
  // renders nothing. Deliberately NOT combined with cogs/price into a
  // fee-adjusted margin — that would blend a measured number with an
  // AI-judged one under a single marker (RD §7).
  const revValue = m.signal_evidence?.revenue?.value
  if (revValue?.avg_referral_fee_pct !== undefined) {
    econRows.push({ claim: 'Amazon referral fee', value: `${revValue.avg_referral_fee_pct}% of price`, marker: 'measured' })
  }
  if (revValue?.avg_fba_pick_pack_fee) {
    econRows.push({ claim: 'Fulfillment fee (FBA, category average)', value: revValue.avg_fba_pick_pack_fee, marker: 'measured' })
  }
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
  // customer_language is LLM-synthesized from real reviews — a paraphrase,
  // not a verbatim measured quote, so 'judgment' (truth audit 2026-08-02).
  if (cl?.frustrations?.length) custRows.push({ claim: 'Top frustration', value: cl.frustrations[0], marker: 'judgment' })
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
      claim: 'Top brands with flagged claim language',
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
  competitorsNote: string  // honest disclosure — rendered ONLY when competitorRows is empty (legacy analyses)
  // Item ב: the per-competitor measured revenue table the note above always
  // promised as "a fast follow". Empty for analyses generated before the
  // fields existed (no backfill — real provider cost).
  // reviewsLabel (Entry Proof, docs/RD_ENTRY_PROOF.md): real per-ASIN review
  // count on EVERY row — the full continuum stays visible no matter what the
  // headline logic picked. '—' when the row predates the field or the stats
  // slot was absent (never a fabricated 0).
  competitorRows: { brand: string; price: string; unitsLabel: string; revenueLabel: string; reviewsLabel: string }[]
  competitorsFootnote: string | null  // floor semantics + off-category exclusion disclosure
  // Entry Outcomes visibility caveat (docs/RD_ENTRY_OUTCOMES.md): rendered
  // whenever a young-cohort claim was made — the invisible graveyard stays
  // invisible and the reader must know it.
  entryOutcomesCaveat: string | null
  // Amazon-presence research context (docs/RD_WOUNDED_LEADER_AMAZON_
  // PRESENCE.md): rendered only when an Amazon-presence fact was shown —
  // both halves of the evidence, so the fact never silently implies a
  // verdict.
  amazonPresenceContext: string | null
  // Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md):
  // honest disclosure for a vocabulary-matched ingredient with no science
  // signal yet — replaces silent absence with a real, disclosed "not yet
  // available" state. Null whenever the query didn't match the ingredient
  // vocabulary at all, or a science signal already exists.
  //
  // Review fix: wording deliberately avoids the word "queued" — this note
  // also renders for one of the 3 benchmark tracked ingredients (berberine/
  // creatine/magnesium), which shouldEnqueueScienceDemand (lib/science-engine/
  // queue.ts) explicitly excludes from science_ingredient_queue (they already
  // refresh nightly for free). Saying "queued" for that case would be
  // literally false — they were never queued, just awaiting their existing
  // nightly refresh cadence. The wording below is accurate for both cases.
  scienceQueuedNote: string | null
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

  // Item ב: real per-competitor measured revenue rows, when this analysis
  // has them. Values are floors (monthlySold is Amazon's rounded-down band).
  const compRevs = m.signal_evidence?.revenue?.value?.top_competitor_revenues ?? []
  const competitorRows = compRevs.map(r => ({
    brand:        r.brand,
    price:        `$${Math.round(r.price)}`,
    unitsLabel:   `~${r.monthly_sold.toLocaleString()}/mo`,
    revenueLabel: fmtMeasuredMonthly(r.est_monthly_revenue_mo),
    reviewsLabel: r.review_count !== null && r.review_count !== undefined
      ? `${r.review_count.toLocaleString()} reviews`
      : '—',
  }))
  const excludedCount = m.signal_evidence?.revenue?.value?.off_category_excluded_count
  const competitorsFootnote = competitorRows.length
    ? 'Amazon reports monthly units in rounded-down bands, so every figure here is a floor, not an exact count.'
      + (excludedCount
        ? ` ${excludedCount} search result${excludedCount === 1 ? '' : 's'} from a different product category (e.g. OTC medicines a supplement can't legally compete with) excluded.`
        : '')
    : null

  // Roadmap "Dynamic Science Coverage": re-derive the vocabulary match from
  // the exact query string the user entered at generation time (not a new
  // parameter — m.product_query already carries this) rather than threading
  // a new field through. Additive: never touches coverageLine or any other
  // field above.
  const queuedIngredient = matchTrackedIngredient(m.product_query ?? '')
  const scienceQueuedNote = queuedIngredient && !m.signal_evidence?.science
    ? `Science evidence for ${queuedIngredient.charAt(0).toUpperCase()}${queuedIngredient.slice(1)} is not yet available — it will appear after the next automated science update.`
    : null

  // Entry Outcomes visibility caveat — rendered whenever the Record made a
  // young-cohort claim (state !== insufficient). Listings that failed and
  // lost search visibility never appear in our sample; every count is a
  // floor (docs/RD_ENTRY_OUTCOMES.md §2, external-research finding).
  const eoState = m.signal_evidence?.revenue?.value?.entry_outcomes?.state
  const entryOutcomesCaveat = eoState && eoState !== 'insufficient'
    ? 'Young-seller outcomes reflect visible top-search results only — listings that failed and lost visibility don\'t appear here, so failure counts are floors, and their absence is never evidence of safety.'
    : null

  const amazonPresenceContext = m.signal_evidence?.revenue?.value?.amazon_presence
    ? "On Amazon's own presence here: research documents real ranking advantages for Amazon's brands and retail listings, but Amazon's house brands are only ~1% of its overall sales — whether to compete alongside them is your call, not a verdict this report makes."
    : null

  return {
    keywords,
    sources,
    overallConfidence: m.signal_metadata?.overall_confidence ?? null,
    coverageLine,
    competitorsNote: 'Full per-competitor pricing and listing-age table: not yet surfaced here — the underlying data is real and already captured (see the Competition chapter for the category leader), a fast follow to this appendix.',
    competitorRows,
    competitorsFootnote,
    scienceQueuedNote,
    entryOutcomesCaveat,
    amazonPresenceContext,
  }
}

// ── Competitive reviews VM — item ג (docs/RD_V4_COMPETITIVE_REVIEWS.md §3.4)
// Pure mapping from the engine's MarketReport to what the Record's
// Competition chapter renders. Marker discipline (enforced by the UI's own
// labels, encoded here structurally): counts/prevalence/ratings are
// measured facts; gap/complaint/feature TEXT is AI synthesis over real
// reviews — presented in the partner's judgment voice, never as a measured
// claim.
export interface CompetitiveReviewsVM {
  statsLine: string   // deterministic from real counts
  gaps: { text: string; prevalenceLabel: string; severity: 'High' | 'Medium' | 'Low' }[]
  winnerFeatures: string[]
  competitors: { name: string; rating: string; reviews: number; topComplaints: string[] }[]
  productBrief: string | null
}

export function buildCompetitiveReviewsVM(report: MarketReport): CompetitiveReviewsVM {
  // Live finding (2026-07-28 validation): with real 5-product data the
  // cross-product gap clustering can land EVERYTHING in niche_gaps
  // (per-product phrasing varies too much to merge), leaving
  // universal+common empty — which would render the marquee gaps block
  // blank. Falling back to the top niche gaps is honest: each carries its
  // real "1 of N" prevalence label, never an inflated tier.
  const crossProduct = [...report.universal_gaps, ...report.common_gaps]
  const gapSource = crossProduct.length > 0 ? crossProduct : report.niche_gaps
  const gaps = [...gapSource]
    .sort((a, b) => b.prevalence - a.prevalence)
    .slice(0, 6)
    .map(g => ({
      text: g.description,
      prevalenceLabel: `${g.product_count} of the ${report.products_analyzed} top brands`,
      severity: g.severity,
    }))

  const competitors = report.products
    .filter(p => !p.error)
    .map(p => ({
      name: p.brand || p.title || p.asin,
      rating: p.avg_rating.toFixed(1),
      reviews: p.reviews_collected,
      topComplaints: (p.top_complaints ?? []).slice(0, 3),
    }))

  return {
    statsLine: `${report.total_reviews_analyzed.toLocaleString()} real reviews across the ${report.products_analyzed} strongest brands here`,
    gaps,
    winnerFeatures: (report.winner_features ?? []).slice(0, 4),
    competitors,
    productBrief: report.ai_product_brief || null,
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
