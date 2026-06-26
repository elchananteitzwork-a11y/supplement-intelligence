import { toSearchKeyword } from './keyword'

// ── GDELT real sentiment (mode=tonechart) ───────────────────────────────────
//
// CONFIRMED VIA LIVE CALL 2026-06-26: GDELT's DOC 2.0 `mode=artlist` (used by
// providers/gdelt.ts for headlines) does NOT include a per-article tone field
// — that was an unverified assumption corrected before writing this. The real
// sentiment surface is a separate mode, `mode=tonechart`, which returns a
// real histogram of article counts per integer tone bin (-10..+10) across
// all real articles matching the query — not a per-article number. A
// real, deterministic weighted average over that histogram is computed
// here; nothing in this file is AI-touched.
//
// Kept as its own module (not inside providers/gdelt.ts) because it's a
// second, independent GDELT request, not a per-article field — and GDELT
// enforces a strict global 1-request-per-5-seconds rate limit, confirmed
// live (multiple consecutive requests spaced 6-8s apart still got rejected
// during testing). Treated as fully best-effort: failing/rate-limiting
// here must never block headline items or the rest of news intelligence.

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc'

interface ToneChartBin { bin?: number; count?: number }
interface ToneChartResponse { tonechart?: ToneChartBin[] }

export interface GdeltSentiment {
  avg_tone:  number                              // real weighted average, -10..+10
  histogram: { bin: number; count: number }[]     // real counts per bin
  sample_size: number                             // total real articles behind the average
}

export async function fetchGdeltSentiment(query: string, windowDays: number, timeoutMs = 6_000): Promise<GdeltSentiment | null> {
  if (process.env.GDELT_DISABLED === 'true') return null
  const keyword = toSearchKeyword(query)
  if (!keyword) return null

  try {
    const url = `${GDELT_API}?query=${encodeURIComponent(`${keyword} sourcelang:english`)}&mode=tonechart&format=json&timespan=${windowDays}d`
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null

    const text = await res.text()
    let data: ToneChartResponse
    try {
      data = JSON.parse(text)
    } catch {
      // Rate-limited (plain-text message) or malformed — soft-fail, same as providers/gdelt.ts.
      if (text.toLowerCase().includes('limit')) console.warn('[GDELT sentiment] rate-limited, skipping')
      return null
    }

    const bins = (data.tonechart ?? []).filter(
      (b): b is Required<ToneChartBin> => typeof b.bin === 'number' && typeof b.count === 'number' && b.count > 0,
    )
    if (!bins.length) return null

    const totalCount = bins.reduce((s, b) => s + b.count, 0)
    const weightedSum = bins.reduce((s, b) => s + b.bin * b.count, 0)

    return {
      avg_tone:    Math.round((weightedSum / totalCount) * 10) / 10,
      histogram:   bins.map(b => ({ bin: b.bin, count: b.count })),
      sample_size: totalCount,
    }
  } catch (e: unknown) {
    console.warn('[GDELT sentiment] fetch failed', { keyword, error: e instanceof Error ? e.message : e })
    return null
  }
}
