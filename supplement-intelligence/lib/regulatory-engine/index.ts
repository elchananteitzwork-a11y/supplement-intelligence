import { cacheGet, cacheSet } from '../provider-cache'
import type {
  RegulatoryIntelligence,
  RegulatoryRiskLevel,
  AdverseEventStats,
  RecallStats,
} from './types'

export type { RegulatoryIntelligence, RegulatoryRiskLevel } from './types'

const OPENFDA_BASE  = 'https://api.fda.gov'
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

function apiKey(): string {
  return process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : ''
}

async function openfdaFetch(url: string): Promise<Record<string, unknown> | null> {
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

function metaTotal(body: Record<string, unknown> | null): number {
  if (!body) return 0
  const meta = body.meta as Record<string, unknown> | undefined
  const results = meta?.results as Record<string, unknown> | undefined
  return typeof results?.total === 'number' ? results.total : 0
}

// ── CAERS queries (food/event — dietary supplements) ─────────────────────
// CAERS = Center for Food Safety and Applied Nutrition Adverse Event Reporting System
// Uses /food/event.json (not /drug/event.json which is FAERS for pharmaceuticals)

function caersSearchUrl(ingredient: string, extra = ''): string {
  const terms = ingredient.includes(' ')
    ? `products.name_brand:"${ingredient}"`
    : `products.name_brand:${ingredient}`
  const encoded = encodeURIComponent(extra ? `${terms} AND ${extra}` : terms)
  return `${OPENFDA_BASE}/food/event.json?search=${encoded}&limit=1`
}

function caersCountUrl(ingredient: string): string {
  const terms = ingredient.includes(' ')
    ? `products.name_brand:"${ingredient}"`
    : `products.name_brand:${ingredient}`
  const encoded = encodeURIComponent(terms)
  return `${OPENFDA_BASE}/food/event.json?search=${encoded}&count=reactions.reaction_meddra_pt.exact&limit=8`
}

function caersRecentUrl(ingredient: string): string {
  const currentYear = new Date().getFullYear()
  const twoYearsAgo = currentYear - 2
  const dateFilter = `date_started_mfr:[${twoYearsAgo}0101 TO ${currentYear}1231]`
  return caersSearchUrl(ingredient, dateFilter)
}

async function fetchAdverseEvents(ingredient: string): Promise<AdverseEventStats | null> {
  const [totalBody, seriousBody, hospBody, deathBody, recentBody, reactionsBody] = await Promise.all([
    openfdaFetch(caersSearchUrl(ingredient)),
    openfdaFetch(caersSearchUrl(ingredient, 'serious:1')),
    openfdaFetch(caersSearchUrl(ingredient, 'outcomes.outcome:Hospitalization')),
    openfdaFetch(caersSearchUrl(ingredient, 'outcomes.outcome:Death')),
    openfdaFetch(caersRecentUrl(ingredient)),
    openfdaFetch(caersCountUrl(ingredient)),
  ])

  const total           = metaTotal(totalBody)
  if (total === 0) return null

  const serious         = metaTotal(seriousBody)
  const hospitalizations = metaTotal(hospBody)
  const deaths          = metaTotal(deathBody)
  const recent          = metaTotal(recentBody)

  // Derive trend: compare recent-2yr share to expected baseline.
  // CAERS reports have grown significantly; use 20% as the "Increasing" threshold.
  let recent_trend: AdverseEventStats['recent_trend'] = 'Unknown'
  if (total >= 10) {
    const recentPct = total > 0 ? (recent / total) * 100 : 0
    if (recentPct > 25) recent_trend = 'Increasing'
    else if (recentPct < 5) recent_trend = 'Decreasing'
    else recent_trend = 'Stable'
  }

  const reactionsArr = Array.isArray(reactionsBody?.results)
    ? (reactionsBody!.results as Array<{ term: string; count: number }>)
        .slice(0, 5)
        .map(r => r.term.charAt(0) + r.term.slice(1).toLowerCase())
    : []

  return {
    total_reports:        total,
    serious_reports:      serious,
    hospitalization_count: hospitalizations,
    death_count:          deaths,
    top_reactions:        reactionsArr,
    recent_trend,
  }
}

// ── Enforcement / recall queries ──────────────────────────────────────────

async function fetchRecalls(ingredient: string): Promise<RecallStats | null> {
  const encoded = encodeURIComponent(`product_description:"${ingredient}"`)
  const url = `${OPENFDA_BASE}/food/enforcement.json?search=${encoded}&limit=25`
  const body = await openfdaFetch(url)
  if (!body || !Array.isArray(body.results)) return null

  const results = body.results as Array<Record<string, string>>
  if (results.length === 0) return null

  let classI = 0, classII = 0, classIII = 0
  const descriptions: string[] = []

  for (const r of results) {
    const cls = (r.classification ?? '').trim()
    if (cls === 'Class I')   classI++
    else if (cls === 'Class II')  classII++
    else if (cls === 'Class III') classIII++

    if (r.reason_for_recall && descriptions.length < 3) {
      descriptions.push(r.reason_for_recall.slice(0, 120))
    }
  }

  return {
    total_recalls:             classI + classII + classIII,
    class_i_recalls:           classI,
    class_ii_recalls:          classII,
    class_iii_recalls:         classIII,
    recent_recall_descriptions: descriptions,
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
  const classI  = recalls?.class_i_recalls ?? 0
  const classII = recalls?.class_ii_recalls ?? 0
  const deaths  = adverse?.death_count ?? 0
  const hosp    = adverse?.hospitalization_count ?? 0
  const total   = adverse?.total_reports ?? 0
  const flags: string[] = []

  if (classI > 0)   flags.push(`${classI} Class I recall(s) — life-threatening or serious health risk`)
  if (deaths > 8)   flags.push(`${deaths} reported deaths in CAERS`)
  if (hosp > 30)    flags.push(`${hosp} hospitalizations reported in CAERS`)
  if (classII > 1)  flags.push(`${classII} Class II recalls on record`)

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
  if ((recalls?.total_recalls ?? 0) > 0) {
    return {
      level: 'Medium',
      summary: `${recalls!.total_recalls} recall(s) on record — review recall classifications before launch`,
      flags,
    }
  }

  // Low
  return {
    level: 'Low',
    summary: total > 0
      ? `${total} total adverse event reports, primarily minor reactions — standard supplement safety profile`
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
  if (adverse && adverse.total_reports > 50)  score += 0.2
  if (adverse && adverse.total_reports > 200) score += 0.1
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
