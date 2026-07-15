// ── NIH Dietary Supplement Label Database (DSLD) — real market dosing ───────
//
// Roadmap M2.17 (Dosage Adequacy, third of the Evidence Depth Cluster). Uses
// NIH ODS's public v9 REST API (CONFIRMED VIA LIVE CALL 2026-07-15: no API
// key, no documented rate limit — a real, structured government database of
// 200,000+ actual on-market supplement-product labels, not a text scrape).
//
// Two real calls: `search-filter` (real product IDs whose label lists this
// ingredient) then a bounded, disclosed sample of `label/{id}` detail calls
// (real per-ingredient mg amounts, correctly nested inside proprietary
// blends — live-confirmed against real berberine/creatine/magnesium
// products). This is a strictly better source than
// lib/signal-engine/providers/competition.ts's `ingredients_label` — that
// field is real Amazon listing TEXT, deliberately never parsed into
// structured dose values ("label formatting varies too much across brands
// to parse reliably" — see its own header comment); DSLD is already
// structured, government-verified data, nothing to parse.
//
// No "clinically effective dose" is computed for any ingredient here — no
// honest source for that exists for non-essential-nutrient ingredients
// (berberine, creatine have no RDA/UL; inventing one from literature would
// be exactly the "invented number" this codebase's own scoring.ts header
// forbids). What IS computed is the real, observed MARKET dosing landscape
// — what real, currently-sold products actually contain.

import { getIngredientProfile } from '@/lib/ingredient-registry'

const DSLD_BASE = 'https://api.ods.od.nih.gov/dsld/v9'
const REQUEST_TIMEOUT_MS = 10_000

// Bounded, disclosed sample — same convention as pubmed.ts's
// EVIDENCE_SAMPLE_SIZE (20). Real, recent, not exhaustive: berberine has
// 140 real matching products, magnesium has 38,000+ (CONFIRMED VIA LIVE
// CALL 2026-07-15) — fetching every one nightly would be real, unnecessary
// cost for a signal whose whole point is "what does the current market
// typically contain," not a census.
const DOSE_SAMPLE_SIZE = 20

// DSLD documents no rate limit, but self-throttling a bounded batch of
// detail calls is a cheap, disclosed "good citizen" choice — same spirit as
// pubmed.ts's REQUEST_DELAY_MS, just via concurrency-capping instead of a
// fixed delay (no NCBI-style hard req/s ceiling to stay under here).
const DETAIL_FETCH_CONCURRENCY = 5

// The ONE static (not live-fetched) fact in this milestone — flagged as
// such in the approved R&D document. NIH ODS's Magnesium Health
// Professional fact sheet (https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/,
// confirmed 2026-07-15) publishes the adult RDA as 400-420 mg/day for men,
// 310-320 mg/day for women — no structured API exposes this value, only an
// HTML fact sheet, so it is hand-entered here with its citation rather than
// fetched. Berberine and creatine are not essential nutrients — no
// official RDA/UL exists for either, so no equivalent constant is defined
// for them; market_dose_vs_rda is therefore only ever populated for
// magnesium (see fetchMarketDoseDistribution).
const MAGNESIUM_RDA_RANGE_MG = { min: 310, max: 420 }

interface DsldSearchHit { _id?: string }
interface DsldSearchResponse { hits?: DsldSearchHit[] }

interface DsldQuantity { quantity?: number; unit?: string }
interface DsldIngredientRow {
  name?:        string
  quantity?:    DsldQuantity[]
  nestedRows?:  DsldIngredientRow[]
}
interface DsldLabelResponse { ingredientRows?: DsldIngredientRow[] }

export interface MarketDoseResult {
  market_dose_mg?:          { median: number; min: number; max: number }
  market_dose_sample_size:  number
  rda_range_mg?:            { min: number; max: number }
  market_dose_vs_rda?:      'Below' | 'Within' | 'Above'
}

// Converts a real DSLD quantity+unit into mg. Returns null (never a
// fabricated conversion) for units that aren't a direct mass — IU is
// compound-specific and would need an invented conversion factor; "NP"
// ("Not Present" — a real DSLD placeholder for an undisclosed amount inside
// a proprietary blend, CONFIRMED VIA LIVE CALL 2026-07-15) is a real
// "unknown," not a real zero.
function toMg(quantity: number | undefined, unit: string | undefined): number | null {
  if (typeof quantity !== 'number' || !unit) return null
  const u = unit.trim().toLowerCase()
  if (u === 'mg') return quantity
  if (u === 'g')  return quantity * 1000
  if (u === 'mcg' || u === 'µg' || u === 'ug') return quantity / 1000
  return null
}

// Walks the full real ingredientRows tree (including nested blend
// sub-amounts) once, recording the first real mg dose found per
// lowercased row name. A single pass, looked up afterward by priority
// (displayName, then each registered alias in order) — never summed across
// rows, so one physical ingredient declared under two names on the same
// label is never double-counted.
function collectDosesByName(rows: DsldIngredientRow[] | undefined, acc: Map<string, number>): void {
  for (const row of rows ?? []) {
    const name = row.name?.trim().toLowerCase()
    if (name && !acc.has(name)) {
      const mg = toMg(row.quantity?.[0]?.quantity, row.quantity?.[0]?.unit)
      if (mg !== null) acc.set(name, mg)
    }
    collectDosesByName(row.nestedRows, acc)
  }
}

function extractDoseMg(label: DsldLabelResponse, candidateNames: string[]): number | null {
  const doses = new Map<string, number>()
  collectDosesByName(label.ingredientRows, doses)
  for (const name of candidateNames) {
    const mg = doses.get(name.toLowerCase())
    if (mg !== undefined) return mg
  }
  return null
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit)
    results.push(...await Promise.all(chunk.map(fn)))
  }
  return results
}

// Real, on-market product IDs whose label lists this ingredient — most
// recently entered first (a disclosed choice: recent labels better reflect
// current market convention than an arbitrary text-relevance score).
// apply_synonyms=Yes casts a real, broader net at the search step (DSLD's
// own synonym data finds more real candidate products); the actual dose
// extraction below still only trusts an exact match against this
// codebase's own registered displayName/aliases, so a broader candidate
// list here cannot cause a misattributed dose later.
async function fetchCandidateProductIds(canonicalSearchTerm: string): Promise<string[] | null> {
  const params = new URLSearchParams({
    q:               '*',
    ingredient_name: canonicalSearchTerm,
    apply_synonyms:  'Yes',
    status:          '1',
    sort_by:         'entryDate',
    sort_order:      'desc',
  })

  try {
    const res = await fetch(`${DSLD_BASE}/search-filter?${params.toString()}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) {
      console.warn('DSLD: non-200 search-filter response', { canonicalSearchTerm, status: res.status })
      return null
    }
    const data = await res.json() as DsldSearchResponse
    const ids = (data.hits ?? []).map(h => h._id).filter((id): id is string => !!id)
    return ids.slice(0, DOSE_SAMPLE_SIZE)
  } catch (e: unknown) {
    console.warn('DSLD: search-filter request failed', { canonicalSearchTerm, error: e instanceof Error ? e.message : e })
    return null
  }
}

async function fetchLabelDoseMg(id: string, candidateNames: string[]): Promise<number | null> {
  try {
    const res = await fetch(`${DSLD_BASE}/label/${id}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) {
      console.warn('DSLD: non-200 label response', { id, status: res.status })
      return null
    }
    const data = await res.json() as DsldLabelResponse
    return extractDoseMg(data, candidateNames)
  } catch (e: unknown) {
    console.warn('DSLD: label request failed', { id, error: e instanceof Error ? e.message : e })
    return null
  }
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
}

// Real market dosing distribution for one tracked ingredient. Takes the raw
// ingredient key (not a pre-resolved search term, unlike pubmed.ts/
// clinicaltrials.ts's fetchers) — it needs the full registry profile
// (displayName + aliases for row-matching, canonicalSearchTerm for the real
// query), not just the search term alone. Returns null only when the real
// search-filter call itself fails (network/HTTP error — nothing to report
// at all) or the ingredient isn't registered (M2.15's registry currently
// covers exactly TRACKED_INGREDIENTS, so this is always populated for a
// real pipeline call, but never assumed); a real search that succeeds but
// yields zero products, or zero products with an extractable mg dose,
// returns a real { market_dose_sample_size: 0 } rather than null — an
// honest "checked, found nothing usable" distinct from "didn't check."
export async function fetchMarketDoseDistribution(ingredient: string): Promise<MarketDoseResult | null> {
  const profile = getIngredientProfile(ingredient)
  if (!profile) return null

  const ids = await fetchCandidateProductIds(profile.canonicalSearchTerm)
  if (ids === null) return null
  if (ids.length === 0) return { market_dose_sample_size: 0 }

  const candidateNames = [profile.displayName, ...profile.aliases]
  const doses = (await mapWithConcurrency(ids, DETAIL_FETCH_CONCURRENCY, id => fetchLabelDoseMg(id, candidateNames)))
    .filter((d): d is number => d !== null)

  if (doses.length === 0) return { market_dose_sample_size: 0 }

  const sorted = [...doses].sort((a, b) => a - b)
  const result: MarketDoseResult = {
    market_dose_mg: { median: median(sorted), min: sorted[0], max: sorted[sorted.length - 1] },
    market_dose_sample_size: doses.length,
  }

  if (ingredient === 'magnesium') {
    result.rda_range_mg = MAGNESIUM_RDA_RANGE_MG
    const m = result.market_dose_mg!.median
    result.market_dose_vs_rda = m < MAGNESIUM_RDA_RANGE_MG.min ? 'Below' : m > MAGNESIUM_RDA_RANGE_MG.max ? 'Above' : 'Within'
  }

  return result
}
