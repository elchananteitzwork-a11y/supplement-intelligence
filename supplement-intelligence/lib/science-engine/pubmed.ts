// ── PubMed (NCBI E-utilities) — real publication counts by year ─────────────
//
// V2 Blueprint §5: "PubMed | science | Leading indicator native to the
// vertical: publication velocity per ingredient. Free." Uses NCBI's public
// esearch.fcgi endpoint — no API key required (CONFIRMED VIA LIVE CALL
// 2026-07-13: berberine/2023 returned a real count of 683). An optional
// PUBMED_API_KEY raises the rate limit from 3 req/s to 10 req/s per NCBI's
// own documentation, but this provider works correctly without one.
//
// One real HTTP call per calendar year requested — there is no single
// endpoint that returns a multi-year time series directly, so the "velocity"
// series is built from N real point-in-time counts, one per year, run
// sequentially (never in parallel) to stay under the keyless rate limit.
// This is why the pipeline only runs as a nightly batch (app/api/cron/
// science-pipeline), never live inside a request — N sequential calls at
// ~350ms apart cannot fit the fast tier's <500ms budget.

import { STUDY_TYPE_PRIORITY, pickStudyType } from '@/lib/news-engine/providers/pubmed'

const EUTILS_BASE     = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const ESEARCH_URL      = `${EUTILS_BASE}/esearch.fcgi`
const ESUMMARY_URL     = `${EUTILS_BASE}/esummary.fcgi`
const REQUEST_DELAY_MS = 350   // keeps us under the keyless 3 req/s limit with margin

// Roadmap M2.16: bounded, disclosed sample size for the strongest-evidence-
// type read below — real recent PMIDs, not exhaustive (the fast-tier <500ms
// budget doesn't apply here either way, since this pipeline is nightly-only,
// but an unbounded esummary batch would still be an unnecessary real cost).
const EVIDENCE_SAMPLE_SIZE = 20

interface EsearchResponse {
  esearchresult?: { count?: string; idlist?: string[] }
}

interface EsummaryItem { pubtype?: string[] }
interface EsummaryResponse { result?: Record<string, EsummaryItem | string[]> }

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Real publication count for one ingredient in one calendar year. Returns
// null (never a fabricated 0) on any network/parse failure — the caller
// simply omits that year from the series rather than reporting a count
// that was never actually measured.
async function fetchYearCount(ingredient: string, year: number): Promise<number | null> {
  const params = new URLSearchParams({
    db:       'pubmed',
    term:     ingredient,
    datetype: 'pdat',
    mindate:  String(year),
    maxdate:  String(year),
    retmax:   '0',
    retmode:  'json',
  })
  if (process.env.PUBMED_API_KEY) params.set('api_key', process.env.PUBMED_API_KEY)

  try {
    const res = await fetch(`${EUTILS_BASE}?${params.toString()}`)
    if (!res.ok) {
      console.warn('PubMed: non-200 response', { ingredient, year, status: res.status })
      return null
    }
    const data = await res.json() as EsearchResponse
    const count = data.esearchresult?.count
    if (count === undefined) return null
    const n = parseInt(count, 10)
    return Number.isFinite(n) ? n : null
  } catch (e: unknown) {
    console.warn('PubMed: request failed', { ingredient, year, error: e instanceof Error ? e.message : e })
    return null
  }
}

// Real publication counts for the last `yearsBack` COMPLETE calendar years
// (the current, still-in-progress year is deliberately excluded — including
// it would make the most recent year look like a decline purely because
// it isn't over yet, not because publication activity actually slowed).
// Returns null only when every single year's request failed; a partial
// series (some years missing) is still returned, since it's still real data.
export async function fetchPublicationCountsByYear(
  ingredient: string,
  yearsBack = 6,
  now = new Date(),
): Promise<Record<string, number> | null> {
  const currentYear = now.getUTCFullYear()
  const years = Array.from({ length: yearsBack }, (_, i) => currentYear - yearsBack + i)

  const counts: Record<string, number> = {}
  for (const year of years) {
    const n = await fetchYearCount(ingredient, year)
    if (n !== null) counts[String(year)] = n
    await sleep(REQUEST_DELAY_MS)
  }

  return Object.keys(counts).length ? counts : null
}

export interface StrongestEvidenceResult {
  strongest_evidence_type?: string
  evidence_sample_size:     number
}

// ── Roadmap M2.16: Clinical Evidence Engine ──────────────────────────────────
// Real PubMed pubtype[] classification for a bounded, recent sample of this
// ingredient's literature — esearch (real PMIDs) then one batched esummary
// call, reusing the exact STUDY_TYPE_PRIORITY/pickStudyType logic already
// live in lib/news-engine/providers/pubmed.ts (CONFIRMED VIA LIVE CALL
// 2026-07-14: esummary's pubtype[] returns real values like
// ["Journal Article", "Randomized Controlled Trial"] for this exact term).
// Returns the single strongest real classification found across the sample,
// or undefined (never a fabricated "anecdotal"/"in-vitro" label — PubMed's
// real vocabulary has no such category) when nothing in the sample matches
// the priority list. evidence_sample_size is always the real count of
// articles actually classified, so a caller can tell "0 found" apart from
// "found some, none had a specific type."
export async function fetchStrongestEvidenceType(ingredient: string): Promise<StrongestEvidenceResult | null> {
  const searchParams = new URLSearchParams({
    db:      'pubmed',
    term:    ingredient,
    retmax:  String(EVIDENCE_SAMPLE_SIZE),
    retmode: 'json',
  })
  if (process.env.PUBMED_API_KEY) searchParams.set('api_key', process.env.PUBMED_API_KEY)

  try {
    const searchRes = await fetch(`${ESEARCH_URL}?${searchParams.toString()}`)
    if (!searchRes.ok) {
      console.warn('PubMed: non-200 esearch response (evidence type)', { ingredient, status: searchRes.status })
      return null
    }
    const searchData = await searchRes.json() as EsearchResponse
    const ids = searchData.esearchresult?.idlist ?? []
    if (!ids.length) return { evidence_sample_size: 0 }

    const summaryParams = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' })
    if (process.env.PUBMED_API_KEY) summaryParams.set('api_key', process.env.PUBMED_API_KEY)

    const summaryRes = await fetch(`${ESUMMARY_URL}?${summaryParams.toString()}`)
    if (!summaryRes.ok) {
      console.warn('PubMed: non-200 esummary response (evidence type)', { ingredient, status: summaryRes.status })
      return null
    }
    const summaryData = await summaryRes.json() as EsummaryResponse

    const priorityRank = (t: string | undefined) => t ? STUDY_TYPE_PRIORITY.indexOf(t) : -1
    let strongest: string | undefined
    for (const pmid of ids) {
      const entry = summaryData.result?.[pmid]
      if (!entry || Array.isArray(entry)) continue
      const type = pickStudyType(entry.pubtype)
      if (type && (strongest === undefined || priorityRank(type) < priorityRank(strongest))) strongest = type
    }

    return { strongest_evidence_type: strongest, evidence_sample_size: ids.length }
  } catch (e: unknown) {
    console.warn('PubMed: request failed (evidence type)', { ingredient, error: e instanceof Error ? e.message : e })
    return null
  }
}
