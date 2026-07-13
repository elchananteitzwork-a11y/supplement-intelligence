// ── ClinicalTrials.gov (API v2) — real trial registration counts ────────────
//
// V2 Blueprint §5: "ClinicalTrials.gov | science | Trial registrations per
// ingredient/condition. Free." Uses the public v2 REST API — no API key,
// no auth (CONFIRMED VIA LIVE CALL 2026-07-13: berberine returned a real
// totalCount of 133). A single request per ingredient (countTotal=true,
// pageSize=1 — we only need the count, not the study list itself).
//
// Deliberately a single real total, not a fabricated multi-year series:
// the roadmap's own acceptance criteria attach "velocity" only to PubMed's
// publication counts, not to trial registrations — building a year-by-year
// trial series would mean either date-filtering by study start date (a
// materially different, noisier question — "when was this trial first
// registered" vs "when did it start") or inventing a series this milestone
// never asked for. A real, current total is the honest scope.

const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2/studies'

interface StudiesResponse {
  totalCount?: number
}

export async function fetchTrialRegistrationsCount(ingredient: string): Promise<number | null> {
  const params = new URLSearchParams({
    'query.term': ingredient,
    countTotal:   'true',
    pageSize:     '1',
  })

  try {
    const res = await fetch(`${CTGOV_BASE}?${params.toString()}`)
    if (!res.ok) {
      console.warn('ClinicalTrials.gov: non-200 response', { ingredient, status: res.status })
      return null
    }
    const data = await res.json() as StudiesResponse
    return typeof data.totalCount === 'number' ? data.totalCount : null
  } catch (e: unknown) {
    console.warn('ClinicalTrials.gov: request failed', { ingredient, error: e instanceof Error ? e.message : e })
    return null
  }
}
