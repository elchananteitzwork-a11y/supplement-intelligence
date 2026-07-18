// ── Manufacturer recall history (firm-scoped OpenFDA lookup) ──────────────
//
// Roadmap M2.20, narrowed from "Manufacturing Credibility" to recall history
// only — facility registration/GMP/inspection status has no live structured
// source and is NOT honestly buildable (same narrowing pattern as M2.18,
// "interaction/safety" → "safety only").
//
// Sibling module to index.ts/claim-risk.ts (M2.19 pattern) — does not modify
// index.ts's existing behavior; only reuses its now-additively-exported
// openFDA HTTP client (OPENFDA_BASE, openfdaFetch) rather than duplicating
// it. Reuses index.ts's proven food/enforcement.json Class I/II/III
// counting/classification approach (fetchRecalls(), ~lines 142-172), re-keyed
// to query by `recalling_firm` instead of `product_description`. Confirmed
// live during M2.20 research: real field "recalling_firm": "Pharmatech LLC"
// exists on real openFDA food/enforcement.json records, and
// search=recalling_firm:"{firmName}" is a real, working query against the
// same endpoint fetchRecalls() already uses.
//
// Applied additively to real competitor manufacturer/brand identity already
// fetched by Keepa (p.manufacturer / p.brand) and Apify (r.brand) — no new
// upstream data source, no AI call (Constitution Law 6), pure deterministic
// HTTP + counting logic.

import { cacheGet, cacheSet } from '../provider-cache'
// Reuse the same openFDA HTTP client index.ts already exports — avoids a
// second, drift-prone copy of OPENFDA_BASE/apiKey()/openfdaFetch(). Additive
// export from index.ts only; no existing behavior there changed.
import { OPENFDA_BASE, openfdaFetch, metaTotal } from './index'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 h — same TTL as index.ts; FDA data is stable

// Disclosed, same convention as claim-risk.ts's CLAIM_RISK_DISCLAIMER and
// index.ts's DISCLAIMER. `recalling_firm` is a legal/filer name on the FDA
// enforcement record, not a marketplace `brand` string — the two frequently
// differ. Confirmed live during M2.20 research: a real product's Keepa
// `brand` ("Nature's Bounty"), Keepa `manufacturer` ("Nestle Health
// Science"), and a real recall record's `recalling_firm` for that same
// manufacturer ("Nestle Product Technology Center - Nestle Health Science")
// were three distinct strings for effectively the same real supply chain.
// This lookup uses exact-string matching only (v1 scope decision, not a
// silent gap) — a real recall filed under a differently-named legal or
// contract-manufacturing entity will be missed. This is NOT a complete or
// authoritative manufacturer-safety check.
export const MANUFACTURER_RECALL_DISCLAIMER =
  'FDA enforcement/recall records are indexed by `recalling_firm`, a legal/filer name that ' +
  'frequently differs from the marketplace brand string shown to shoppers (real confirmed ' +
  'example: one real product had three different name strings across its marketplace brand ' +
  'context, its `recalling_firm`, and a separate "Manufactured for" company). This lookup uses ' +
  'exact-string matching only — a real recall filed under a differently-named legal or ' +
  'contract-manufacturing entity will be missed (false negative). This is NOT a complete or ' +
  'authoritative manufacturer-safety check; always verify with qualified regulatory counsel ' +
  'before making sourcing or business decisions.'

export interface ManufacturerRecallHistory {
  firm_name_searched:         string
  total_recalls:              number
  class_i_recalls:            number
  class_ii_recalls:           number
  class_iii_recalls:          number
  recent_recall_descriptions: string[]
  data_source:                string
  fetched_at:                 string
  disclaimer:                 string
}

/**
 * Firm-scoped OpenFDA recall-history lookup. Queries
 * food/enforcement.json?search=recalling_firm:"{firmName}", reuses the same
 * Class I/II/III counting/classification approach as index.ts's
 * fetchRecalls(), and returns real counts — or `undefined` on no data or any
 * error, matching this codebase's established convention for optional,
 * non-fatal provider calls. Never fabricates a fallback value.
 */
export async function fetchManufacturerRecallHistory(
  firmName: string,
): Promise<ManufacturerRecallHistory | undefined> {
  try {
    const trimmed = typeof firmName === 'string' ? firmName.trim() : ''
    if (!trimmed) return undefined

    const cacheKey = `regulatory:mfg-recall:v1:${trimmed.toLowerCase()}`
    const cached = await cacheGet<ManufacturerRecallHistory>(cacheKey)
    if (cached) return cached

    const encoded = encodeURIComponent(`recalling_firm:"${trimmed}"`)
    const url = `${OPENFDA_BASE}/food/enforcement.json?search=${encoded}&limit=25`
    const body = await openfdaFetch(url)
    if (!body || !Array.isArray(body.results)) return undefined

    const results = body.results as Array<Record<string, string>>
    if (results.length === 0) return undefined

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

    // Finding 3 fix (2026-07-18 audit, same bug class already fixed in
    // index.ts's fetchRecalls): honest openFDA total, not a sum of only the
    // fetched `limit=25` page — was silently undercounting when a firm had
    // more real recalls than the page size.
    const total = metaTotal(body)
    if (total === 0) return undefined

    const result: ManufacturerRecallHistory = {
      firm_name_searched:         trimmed,
      total_recalls:              total,
      class_i_recalls:            classI,
      class_ii_recalls:           classII,
      class_iii_recalls:          classIII,
      recent_recall_descriptions: descriptions,
      data_source:                `https://api.fda.gov/food/enforcement.json?search=recalling_firm:"${trimmed}"`,
      fetched_at:                 new Date().toISOString(),
      disclaimer:                 MANUFACTURER_RECALL_DISCLAIMER,
    }

    cacheSet(cacheKey, 'openfda', result, CACHE_TTL_MS).catch(() => {})
    return result
  } catch (err) {
    console.error('[manufacturer-credibility] non-fatal error', err instanceof Error ? err.message : err)
    return undefined
  }
}

/**
 * Reduces a full ManufacturerRecallHistory down to the compact per-class
 * count array stored on `top_competitors[].manufacturer_recall_flags`.
 * Returns undefined when there is no history or zero recalls in every
 * class — never a guessed/zero-filled default.
 */
export function toManufacturerRecallFlags(
  history: ManufacturerRecallHistory | undefined,
): { class: string; count: number }[] | undefined {
  if (!history) return undefined
  const flags: { class: string; count: number }[] = []
  if (history.class_i_recalls > 0)   flags.push({ class: 'Class I',   count: history.class_i_recalls })
  if (history.class_ii_recalls > 0)  flags.push({ class: 'Class II',  count: history.class_ii_recalls })
  if (history.class_iii_recalls > 0) flags.push({ class: 'Class III', count: history.class_iii_recalls })
  return flags.length ? flags : undefined
}

/**
 * Given a list of firm names (may contain duplicates, blanks, or
 * undefined), dedupes to the unique non-empty set and resolves recall
 * history for each exactly once — avoids issuing redundant live calls for
 * competitors that share the same manufacturer/brand within one response.
 */
export async function fetchManufacturerRecallHistoryBatch(
  firmNames: Array<string | undefined>,
): Promise<Map<string, ManufacturerRecallHistory | undefined>> {
  const unique = Array.from(
    new Set(
      firmNames
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .map(n => n.trim()),
    ),
  )

  const results = await Promise.all(
    unique.map(async name => [name, await fetchManufacturerRecallHistory(name)] as const),
  )

  return new Map(results)
}
