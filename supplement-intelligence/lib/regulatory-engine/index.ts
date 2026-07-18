import { cacheGet, cacheSet } from '../provider-cache'
import type {
  RegulatoryIntelligence,
  RegulatoryRiskLevel,
  AdverseEventStats,
  RecallStats,
} from './types'

export type { RegulatoryIntelligence, RegulatoryRiskLevel } from './types'

// Exported (additive, M2.20) so lib/regulatory-engine/manufacturer-credibility.ts
// can reuse the same openFDA client instead of duplicating it — see that
// module's imports. No behavior change to this file.
export const OPENFDA_BASE  = 'https://api.fda.gov'
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000   // 24 h — FDA data is stable
const REQUEST_TIMEOUT_MS = 8_000

const DISCLAIMER =
  'Regulatory signal from OpenFDA / CAERS (Center for Food Safety and Applied Nutrition Adverse Event Reporting System) — ' +
  'adverse event reports are not proof of causation. Reports represent suspected associations, not confirmed causal events. ' +
  'Always verify with qualified regulatory counsel before making business or safety decisions.'

// ── Ingredient extraction ─────────────────────────────────────────────────
// Strips common supplement qualifiers; keeps first 2 meaningful words so
// "magnesium glycinate for sleep" → "magnesium glycinate".

const STOP = new Set([
  'supplement', 'supplements', 'for', 'with', 'and', 'or', 'by', 'the', 'a', 'an',
  'capsule', 'capsules', 'powder', 'tablet', 'tablets', 'gummies', 'gummy', 'pill',
  'pills', 'extract', 'complex', 'blend', 'formula', 'natural', 'organic', 'pure',
  'best', 'high', 'potency', 'ultra', 'premium', 'advanced', 'mg', 'mcg', 'iu',
  'vitamin', 'mineral', 'herb', 'herbal', 'dietary', 'daily', 'support', 'health',
])

function extractIngredient(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
  return words.slice(0, 2).join(' ').trim() || query.toLowerCase().trim()
}

// ── OpenFDA fetch helpers ─────────────────────────────────────────────────

export function apiKey(): string {
  return process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : ''
}

export async function openfdaFetch(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url + apiKey(), { signal: controller.signal })
    clearTimeout(timer)
    if (res.status === 404) return null   // "NOT_FOUND" = zero results, not an error
    if (!res.ok) return null
    return await res.json() as Record<string, unknown>
  } catch {
    clearTimeout(timer)
    return null
  }
}

// Exported (additive) so lib/regulatory-engine/manufacturer-credibility.ts
// can reuse the same honest-total helper instead of summing only its
// fetched page (the same Finding-3-class undercount bug already fixed in
// this file's fetchRecalls() — 2026-07-18 audit). No behavior change here.
export function metaTotal(body: Record<string, unknown> | null): number {
  if (!body) return 0
  const meta = body.meta as Record<string, unknown> | undefined
  const results = meta?.results as Record<string, unknown> | undefined
  return typeof results?.total === 'number' ? results.total : 0
}

// ── CAERS queries (food/event — dietary supplements) ─────────────────────
// CAERS = Center for Food Safety and Applied Nutrition Adverse Event Reporting System
// Uses /food/event.json (not /drug/event.json which is FAERS for pharmaceuticals)

function caersSearchUrl(ingredient: string, extra = '', limit = 1): string {
  const terms = ingredient.includes(' ')
    ? `products.name_brand:"${ingredient}"`
    : `products.name_brand:${ingredient}`
  const encoded = encodeURIComponent(extra ? `${terms} AND ${extra}` : terms)
  return `${OPENFDA_BASE}/food/event.json?search=${encoded}&limit=${limit}`
}

function caersRecentUrl(ingredient: string): string {
  const currentYear = new Date().getFullYear()
  const twoYearsAgo = currentYear - 2
  // LIVE-CONFIRMED (2026-07-17 audit): the real openFDA CAERS (/food/event.json)
  // schema field is `date_started`, not `date_started_mfr` — the latter 404s
  // for every ingredient, which openfdaFetch() correctly treats as "zero
  // results" (a genuine NOT_FOUND), silently forcing `recent` to always be 0
  // and `recent_trend` to always resolve to 'Decreasing'. `date_started` is
  // the real field and returns real, current matches.
  const dateFilter = `date_started:[${twoYearsAgo}0101 TO ${currentYear}1231]`
  return caersSearchUrl(ingredient, dateFilter)
}

// Real openFDA CAERS report shape (LIVE-CONFIRMED 2026-07-17 audit, via
// GET /food/event.json — see products[].role below).
interface CaersProduct {
  role?: string
  name_brand?: string
  industry_name?: string
}
interface CaersReport {
  outcomes?: string[]
  reactions?: string[]
  products?: CaersProduct[]
}

// LIVE-CONFIRMED (2026-07-17 audit): openFDA's flat query syntax
// (`products.name_brand:X AND products.role:SUSPECT`) does NOT scope the
// role condition to X's own products[] entry within a report — it only
// requires SOME product in the report to be a SUSPECT, not that X itself
// is. Real sample: 8/20 (40%) of magnesium's raw text matches had magnesium
// present only as a CONCOMITANT (co-occurring, not causally suspected)
// product. There is no query-string-level fix; this fetches actual report
// bodies and checks, per report, whether THIS ingredient's own products[]
// entry is the one marked role === 'SUSPECT'.
function reportImplicatesIngredient(report: CaersReport, ingredientLower: string): boolean {
  const products = Array.isArray(report.products) ? report.products : []
  return products.some(p => {
    if ((p.role ?? '').toUpperCase() !== 'SUSPECT') return false
    const name = `${p.name_brand ?? ''} ${p.industry_name ?? ''}`.toLowerCase()
    return name.includes(ingredientLower)
  })
}

// Real page size of full report bodies fetched for SUSPECT-role filtering.
// openFDA gives no server-side way to filter by a specific product's role,
// so causal-implication filtering is necessarily sample-based (disclosed via
// AdverseEventStats.sample_size) rather than exhaustive. LIVE-CONFIRMED
// (2026-07-18 audit): openFDA's real documented max `limit` for this
// endpoint is 1000 per request (limit=1001 returns a real HTTP 400
// BAD_REQUEST: "Limit cannot exceed 1000 results for search requests") — at
// zero extra request cost vs the previous limit=100, so raised to the real
// max for a meaningfully larger real sample.
const ADVERSE_EVENT_SAMPLE_LIMIT = 1000

async function fetchAdverseEvents(ingredient: string): Promise<AdverseEventStats | null> {
  const ingredientLower = ingredient.toLowerCase()

  const [sampleBody, recentBody] = await Promise.all([
    openfdaFetch(caersSearchUrl(ingredient, '', ADVERSE_EVENT_SAMPLE_LIMIT)),
    openfdaFetch(caersRecentUrl(ingredient)),
  ])

  const total = metaTotal(sampleBody)   // raw, honest openFDA total — unfiltered
  if (total === 0) return null

  const reports = Array.isArray(sampleBody?.results)
    ? (sampleBody!.results as CaersReport[])
    : []
  const sample_size = reports.length

  const implicated = reports.filter(r => reportImplicatesIngredient(r, ingredientLower))

  const hospitalization_count = implicated.filter(r =>
    (r.outcomes ?? []).some(o => o.toLowerCase().includes('hospitalization'))).length
  const death_count = implicated.filter(r =>
    (r.outcomes ?? []).some(o => o.toLowerCase().includes('death'))).length

  // LIVE-CONFIRMED (2026-07-18 audit, Finding 2): real CAERS report bodies
  // have no `serious` field at all (real fields: report_number, outcomes,
  // date_created, reactions, date_started, consumer, products) — the old
  // `products.name_brand:X AND serious:1` query 404s unconditionally for
  // every ingredient, which silently resolved to 0 and was displayed to
  // founders as if it were a real "0 serious reports" fact. There is no
  // real queryable "serious" signal in this schema, so `serious_reports` is
  // now an honest proxy: the count of causally-implicated reports (SUSPECT
  // role, per reportImplicatesIngredient) with a hospitalization or death
  // outcome — deduplicated so a report with both isn't double-counted.
  const serious_reports = implicated.filter(r =>
    (r.outcomes ?? []).some(o => {
      const lower = o.toLowerCase()
      return lower.includes('hospitalization') || lower.includes('death')
    })).length

  // Top reactions among the causally-implicated subset only — previously
  // derived from an unfiltered reactions aggregation query, which suffered
  // the same SUSPECT-vs-CONCOMITANT conflation as the rest of this endpoint.
  const reactionCounts = new Map<string, number>()
  for (const r of implicated) {
    for (const reaction of r.reactions ?? []) {
      const key = reaction.trim()
      if (!key) continue
      reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1)
    }
  }
  const top_reactions = Array.from(reactionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term.charAt(0) + term.slice(1).toLowerCase())

  const recent = metaTotal(recentBody)

  // Derive trend: compare recent-2yr share to expected baseline.
  // CAERS reports have grown significantly; use 20% as the "Increasing" threshold.
  let recent_trend: AdverseEventStats['recent_trend'] = 'Unknown'
  if (total >= 10) {
    const recentPct = total > 0 ? (recent / total) * 100 : 0
    if (recentPct > 25) recent_trend = 'Increasing'
    else if (recentPct < 5) recent_trend = 'Decreasing'
    else recent_trend = 'Stable'
  }

  return {
    total_reports:        total,
    implicated_reports:   implicated.length,
    serious_reports,
    hospitalization_count,
    death_count,
    top_reactions,
    recent_trend,
    sample_size,
  }
}

// ── Enforcement / recall queries ──────────────────────────────────────────

// Real page size of full recall records fetched for causal-relevance
// filtering (see reason_for_recall check below). LIVE-CONFIRMED (2026-07-18
// audit): openFDA's real documented max `limit` for this endpoint is also
// 1000 per request (same BAD_REQUEST behavior above 1000 as /food/event.json)
// — raised to the real max at zero extra request cost vs the previous
// limit=25.
const RECALL_SAMPLE_LIMIT = 1000

async function fetchRecalls(ingredient: string): Promise<RecallStats | null> {
  const ingredientLower = ingredient.toLowerCase()
  const encoded = encodeURIComponent(`product_description:"${ingredient}"`)
  const url = `${OPENFDA_BASE}/food/enforcement.json?search=${encoded}&limit=${RECALL_SAMPLE_LIMIT}`
  const body = await openfdaFetch(url)
  if (!body || !Array.isArray(body.results)) return null

  const results = body.results as Array<Record<string, string>>
  if (results.length === 0) return null

  // Finding 3 fix: honest openFDA total, not a sum of the capped page (was
  // silently dropping real recalls beyond the first `limit` results).
  const total_recalls = metaTotal(body)
  const sample_size = results.length

  // Finding 1 fix: food/enforcement.json has no per-product role field (that
  // is CAERS-only). A product_description text match just means the
  // ingredient appears SOMEWHERE in the recalled product's description
  // (e.g. as "magnesium stearate", a minor excipient) — not that the recall
  // is actually about it. LIVE-CONFIRMED (2026-07-17): all 4 real "Class I"
  // magnesium matches were Salmonella/Listeria/steroid-adulteration recalls
  // of unrelated products; none of their `reason_for_recall` text mentioned
  // magnesium at all. `reason_for_recall` is openFDA's own stated cause, so
  // whether it actually names the ingredient is the real causal-relevance
  // signal this schema offers.
  let classI = 0, classII = 0, classIII = 0
  let implicated_recalls = 0
  const descriptions: string[] = []

  for (const r of results) {
    const reason = (r.reason_for_recall ?? '').toLowerCase()
    if (!reason.includes(ingredientLower)) continue
    implicated_recalls++

    const cls = (r.classification ?? '').trim()
    if (cls === 'Class I')   classI++
    else if (cls === 'Class II')  classII++
    else if (cls === 'Class III') classIII++

    if (r.reason_for_recall && descriptions.length < 3) {
      descriptions.push(r.reason_for_recall.slice(0, 120))
    }
  }

  return {
    total_recalls,
    implicated_recalls,
    class_i_recalls:           classI,
    class_ii_recalls:          classII,
    class_iii_recalls:         classIII,
    recent_recall_descriptions: descriptions,
    sample_size,
  }
}

// ── Risk classification ───────────────────────────────────────────────────

// Broad ingredient names can match many unrelated products in CAERS. Detect this
// by capping at 10,000 total reports; above that threshold, the search is too
// broad to yield a meaningful supplement-specific safety signal.
const BROAD_TERM_REPORT_THRESHOLD = 10_000

function classifyRisk(
  adverse: AdverseEventStats | null,
  recalls: RecallStats | null,
): { level: RegulatoryRiskLevel; summary: string; flags: string[] } {
  // classI/classII/deaths/hosp are all derived from the causally-implicated
  // subset (see fetchAdverseEvents/fetchRecalls) — not raw, unfiltered
  // matches — so these thresholds no longer fire on events this ingredient
  // was never actually implicated in (Finding 1, 2026-07-17 audit).
  const classI  = recalls?.class_i_recalls ?? 0
  const classII = recalls?.class_ii_recalls ?? 0
  const deaths  = adverse?.death_count ?? 0
  const hosp    = adverse?.hospitalization_count ?? 0
  const total   = adverse?.total_reports ?? 0
  const implicatedReports = adverse?.implicated_reports ?? 0
  const flags: string[] = []

  if (classI > 0)   flags.push(`${classI} Class I recall(s) — life-threatening or serious health risk`)
  if (deaths > 8)   flags.push(`${deaths} reported deaths in CAERS`)
  if (hosp > 30)    flags.push(`${hosp} hospitalizations reported in CAERS`)
  if (classII > 1)  flags.push(`${classII} Class II recalls on record`)

  // Disclose when classification is based on a sample smaller than the
  // real, honest total — openFDA has no server-side way to filter by a
  // specific product's causal role/relevance, so implication filtering is
  // necessarily sample-based (Finding 1).
  if (adverse && adverse.sample_size < adverse.total_reports) {
    flags.push(`Adverse-event classification based on a ${adverse.sample_size}-report sample of ${adverse.total_reports} total text matches — openFDA has no server-side "implicated product" filter, so matches beyond the sample were not inspected for causal role.`)
  }
  if (recalls && recalls.sample_size < recalls.total_recalls) {
    flags.push(`Recall classification based on a ${recalls.sample_size}-recall sample of ${recalls.total_recalls} total text matches — same sampling caveat applies.`)
  }

  // Critical: Class I recall + deaths (confirmed multi-source concern), or very
  // high absolute death count for a supplement-specific ingredient search.
  if (classI > 0 && deaths > 0) {
    return {
      level: 'Critical',
      summary: `${classI} Class I recall(s) + ${deaths} reported death(s) — requires immediate regulatory review before launch`,
      flags,
    }
  }
  if (deaths > 25) {
    return {
      level: 'Critical',
      summary: `${deaths} deaths reported in CAERS — very high adverse event death count for a dietary supplement`,
      flags,
    }
  }

  // High: Class I recall alone, or ≥9 deaths, or deaths + substantial hospitalizations
  if (classI > 0) {
    return {
      level: 'High',
      summary: `${classI} Class I recall(s) on record — active safety concern`,
      flags,
    }
  }
  if (deaths > 8) {
    return {
      level: 'High',
      summary: `${deaths} deaths reported in CAERS — ingredient has notable safety signal; review before launch`,
      flags,
    }
  }
  if (deaths > 0 && hosp > 25) {
    return {
      level: 'High',
      summary: `${deaths} deaths + ${hosp} hospitalizations — combined severity warrants pre-launch caution`,
      flags,
    }
  }

  // Medium: Class II recalls, elevated hospitalizations, or any recalls
  if (classII > 1) {
    return {
      level: 'Medium',
      summary: `${classII} Class II recalls on record — moderate risk; monitor regulatory activity`,
      flags,
    }
  }
  if (hosp > 10) {
    return {
      level: 'Medium',
      summary: `${hosp} hospitalization reports in CAERS — elevated adverse event severity signal`,
      flags,
    }
  }
  if ((recalls?.implicated_recalls ?? 0) > 0) {
    return {
      level: 'Medium',
      summary: `${recalls!.implicated_recalls} recall(s) actually implicating this ingredient (of ${recalls!.total_recalls} total text matches) — review recall classifications before launch`,
      flags,
    }
  }

  // Low
  return {
    level: 'Low',
    summary: implicatedReports > 0
      ? `${implicatedReports} adverse event report(s) where this ingredient was the suspect product, primarily minor reactions — standard supplement safety profile`
      : total > 0
        ? `${total} adverse event report(s) mention this ingredient, but none identify it as the suspect product (concomitant/incidental mentions only) — no causally-implicated safety signal found`
        : 'No significant adverse event or recall data found in OpenFDA',
    flags,
  }
}

// ── Confidence scoring ────────────────────────────────────────────────────

function scoreConfidence(
  adverse: AdverseEventStats | null,
  recalls: RecallStats | null,
  ingredient: string,
): number {
  if (!adverse && !recalls) return 0.1
  let score = 0.5
  // Confidence reflects the causally-implicated report volume (products[]
  // role === 'SUSPECT', name-matched to this ingredient) rather than the
  // raw unfiltered match count — a large raw total inflated by concomitant
  // mentions is not itself strong safety evidence (Finding 1). Thresholds
  // are unchanged by the 2026-07-18 ADVERSE_EVENT_SAMPLE_LIMIT increase
  // (100 → 1000) — implicated_reports can never exceed the fetched sample
  // size, so a larger real sample can only raise real confidence, never
  // fabricate it.
  if (adverse && adverse.implicated_reports > 20) score += 0.2
  if (adverse && adverse.implicated_reports > 50) score += 0.1
  if (recalls !== null) score += 0.1
  // Single-word specific ingredients have better search recall than generic terms
  if (ingredient.split(' ').length === 1) score += 0.05
  return Math.min(0.95, score)
}

// ── Main export ───────────────────────────────────────────────────────────

export async function fetchRegulatoryIntelligence(
  query: string,
): Promise<RegulatoryIntelligence | null> {
  try {
    const ingredient = extractIngredient(query)
    if (!ingredient) return null

    const cacheKey = `regulatory:openfda:v1:${ingredient}`
    const cached = await cacheGet<RegulatoryIntelligence>(cacheKey)
    if (cached) return cached

    const [adverse, recalls] = await Promise.all([
      fetchAdverseEvents(ingredient),
      fetchRecalls(ingredient),
    ])

    // Broad-term detection: if total CAERS reports >> 10k, the search term likely
    // matches many unrelated products — cannot derive a meaningful safety signal.
    if (adverse && adverse.total_reports > BROAD_TERM_REPORT_THRESHOLD) {
      const broadResult: RegulatoryIntelligence = {
        query_term:          query,
        ingredient_searched: ingredient,
        adverse_events:      null,
        recalls:             null,
        risk_level:          'Low',
        risk_summary:        `Search term "${ingredient}" is too broad for CAERS supplement assessment — it matches too many products (${adverse.total_reports.toLocaleString()} reports). Cannot derive a supplement-specific safety signal.`,
        warning_flags:       ['Search term too broad for CAERS — manual regulatory review recommended for the specific supplement form (e.g., "magnesium glycinate" instead of "magnesium")'],
        confidence:          0.05,
        data_sources:        [`https://api.fda.gov/food/event.json (CAERS)`],
        fetched_at:          new Date().toISOString(),
        disclaimer:          DISCLAIMER,
      }
      cacheSet(cacheKey, 'openfda', broadResult, CACHE_TTL_MS).catch(() => {})
      return broadResult
    }

    if (!adverse && !recalls) {
      // No data found at all — return a minimal Low-risk result rather than null,
      // so downstream stages know we tried and found nothing.
      const result: RegulatoryIntelligence = {
        query_term:          query,
        ingredient_searched: ingredient,
        adverse_events:      null,
        recalls:             null,
        risk_level:          'Low',
        risk_summary:        'No adverse event or recall data found in OpenFDA for this ingredient',
        warning_flags:       [],
        confidence:          0.1,
        data_sources:        [
          `https://api.fda.gov/food/event.json (CAERS)`,
          `https://api.fda.gov/food/enforcement.json`,
        ],
        fetched_at:          new Date().toISOString(),
        disclaimer:          DISCLAIMER,
      }
      cacheSet(cacheKey, 'openfda', result, CACHE_TTL_MS).catch(() => {})
      return result
    }

    const { level, summary, flags } = classifyRisk(adverse, recalls)
    const confidence = scoreConfidence(adverse, recalls, ingredient)

    const result: RegulatoryIntelligence = {
      query_term:          query,
      ingredient_searched: ingredient,
      adverse_events:      adverse,
      recalls,
      risk_level:          level,
      risk_summary:        summary,
      warning_flags:       flags,
      confidence,
      data_sources:        [
        `https://api.fda.gov/food/event.json?search=products.name_brand:"${ingredient}" (CAERS)`,
        `https://api.fda.gov/food/enforcement.json?search=product_description:"${ingredient}"`,
      ],
      fetched_at:          new Date().toISOString(),
      disclaimer:          DISCLAIMER,
    }

    cacheSet(cacheKey, 'openfda', result, CACHE_TTL_MS).catch(() => {})
    return result
  } catch (err) {
    console.error('[regulatory-engine] non-fatal error', err instanceof Error ? err.message : err)
    return null
  }
}
