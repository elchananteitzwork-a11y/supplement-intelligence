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

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const REQUEST_DELAY_MS = 350   // keeps us under the keyless 3 req/s limit with margin

interface EsearchResponse {
  esearchresult?: { count?: string }
}

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
