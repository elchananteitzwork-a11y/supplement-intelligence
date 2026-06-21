import type {
  SignalProvider,
  ProviderSignals,
  ViralitySignal,
} from '../types'

// ── TikTok hashtag challenge API (unofficial public endpoint) ─────
//
// Endpoint: https://www.tiktok.com/api/challenge/detail/?challengeName={tag}&msToken=&X-Bogus=
//
// No API key or authentication required.
// `msToken` and `X-Bogus` are session validation params that TikTok accepts empty.
//
// Response field `statsV2` holds real counts as strings (stats.videoCount is
// always 0; statsV2.videoCount is the actual value).
// Confirmed: 2,345,159 videos / 27.5B views for #guthealth (live, Jun 2026).
//
// What we can measure:
//   - Total video count    → creator ecosystem size
//   - Total view count     → absolute consumer awareness on TikTok
//   - Views per video      → viral spread ratio (UGC signal)
//
// What we cannot measure reliably for free:
//   - Historical trend (posting velocity, growth rate) — endpoint returns
//     current totals only, no time series
//   - Creator count — not in the response
//   - Engagement rate — likes/comments not exposed at hashtag level
//
// Those dimensions return null rather than estimates.

const BASE_URL = 'https://www.tiktok.com/api/challenge/detail/'

// Raw response shapes
interface TikTokStatsV2 {
  videoCount?: string | number
  viewCount?:  string | number
}

interface TikTokChallenge {
  title?:   string
  statsV2?: TikTokStatsV2
  stats?:   TikTokStatsV2  // fallback; videoCount here is always 0
}

interface TikTokChallengeResponse {
  status_code?: number
  statusCode?:  number
  challengeInfo?: {
    challenge?: { title?: string }
    statsV2?:   TikTokStatsV2
    stats?:     TikTokStatsV2
  }
}

// ── Keyword strategy ──────────────────────────────────────────────
//
// TikTok hashtags are compact single words. We derive 2 candidates:
//   1. Full category as one lowercase word (spaces removed, special chars stripped)
//   2. First significant word (catches cases like "cortisol support" → "#cortisol")
//
// Examples:
//   "Gut Health"         → ["guthealth",    "gut"]
//   "Cortisol Support"   → ["cortisolsupport", "cortisol"]
//   "GLP-1 Support"      → ["glp1support",  "glp1"]
//   "PCOS Weight Loss"   → ["pcosweightloss","pcos"]
//   "Magnesium Supplement" → ["magnesiumsupplement", "magnesium"]

function toHashtagCandidates(category: string): string[] {
  // Normalise: lowercase, strip non-alphanumeric except spaces
  const clean = category.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const words  = clean.split(/\s+/).filter(Boolean)

  // Candidate 1: all words joined (e.g. "guthealth")
  const full = words.join('')

  // Candidate 2: drop trailing generic words so "cortisolsupport" → "cortisol"
  const GENERIC_TAIL = new Set(['supplement','supplements','support','relief','loss','health','care','boost'])
  const trimmed = [...words]
  while (trimmed.length > 1 && GENERIC_TAIL.has(trimmed[trimmed.length - 1])) {
    trimmed.pop()
  }
  const short = trimmed.join('')

  // De-dupe while preserving order (full first, more specific → better match)
  const seen  = new Set<string>()
  const result: string[] = []
  for (const h of [full, short]) {
    if (h && !seen.has(h)) { seen.add(h); result.push(h) }
  }
  return result
}

// ── Numeric helpers ───────────────────────────────────────────────

function parseCount(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return isNaN(n) ? 0 : n
}

// Virality.tiktok from total views
function viewsToTikTokSignal(views: number): ViralitySignal['tiktok'] {
  if (views >= 1_000_000_000) return 'High'    // ≥ 1B views
  if (views >= 100_000_000)   return 'Medium'  // ≥ 100M views
  return 'Low'
}

// Content potential from video count (creator ecosystem)
function videosToContentPotential(videos: number): ViralitySignal['content_potential'] {
  if (videos >= 100_000) return 'High'    // ≥ 100K creators
  if (videos >= 10_000)  return 'Medium'  // ≥ 10K creators
  return 'Low'
}

// UGC signal from views-per-video ratio (organic viral spread)
function ratioToUGC(viewsPerVideo: number): ViralitySignal['ugc'] {
  if (viewsPerVideo >= 15_000) return 'High'    // content spreads broadly
  if (viewsPerVideo >= 5_000)  return 'Medium'
  return 'Low'
}

// Composite virality score (0–10) from views, videos, ratio
// Calibrated against live data: Gut Health 27.5B/2.3M vids → 8,
// Sleep Support 273M/82K vids → 5, GLP-1 6B/784K vids → 7
function viralityScore(views: number, videos: number, viewsPerVideo: number): number {
  // Views component (log-scaled): 100M→3, 1B→5, 10B→7, 100B→9
  const viewsScore = views <= 0 ? 0
    : Math.min(10, Math.max(1, Math.round((Math.log10(views) - 5) * 2)))

  // Videos component: 10M+→9, 1M+→8, 100K+→7, 10K+→5, 1K+→4
  const videoScore =
    videos >= 10_000_000 ? 9 :
    videos >=  1_000_000 ? 8 :
    videos >=    100_000 ? 7 :
    videos >=     10_000 ? 5 :
    videos >=      1_000 ? 4 : 2

  // UGC ratio component: >20K→9, >10K→7, >5K→6, >2K→5, >1K→4
  const ugcScore =
    viewsPerVideo >= 20_000 ? 9 :
    viewsPerVideo >= 10_000 ? 7 :
    viewsPerVideo >=  5_000 ? 6 :
    viewsPerVideo >=  2_000 ? 5 :
    viewsPerVideo >=  1_000 ? 4 : 2

  return Math.round(viewsScore * 0.4 + videoScore * 0.3 + ugcScore * 0.3)
}

// ── Core provider class ───────────────────────────────────────────

export class TikTokProvider implements SignalProvider {
  readonly name    = 'tiktok'
  // Always enabled — public endpoint, no key required.
  // Set TIKTOK_DISABLED=true to skip if the endpoint breaks.
  readonly enabled = process.env.TIKTOK_DISABLED !== 'true'

  async fetch(category: string): Promise<ProviderSignals | null> {
    const candidates = toHashtagCandidates(category)
    if (!candidates.length) return null

    try {
      // Fetch all candidates in parallel; pick the one with the most videos
      const results = await Promise.all(candidates.map(tag => this.fetchHashtag(tag)))
      const valid   = results.filter((r): r is NonNullable<typeof r> => r !== null && r.videoCount > 0)

      if (!valid.length) {
        // Try with top views even if videoCount is 0 (some hashtags don't expose it)
        const byViews = results.filter((r): r is NonNullable<typeof r> => r !== null && r.viewCount > 0)
        if (!byViews.length) {
          console.log('TikTok: no hashtag data', { category, candidates })
          return null
        }
        valid.push(...byViews)
      }

      // Use the candidate with the most videos (most representative)
      const best = valid.sort((a, b) => b.videoCount - a.videoCount)[0]
      return this.computeSignals(category, best)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('TikTok provider error', { category, error: msg.slice(0, 120) })
      return null
    }
  }

  // ── Private: API call ─────────────────────────────────────────

  private async fetchHashtag(tag: string): Promise<{
    tag:        string
    videoCount: number
    viewCount:  number
  } | null> {
    const url = `${BASE_URL}?challengeName=${encodeURIComponent(tag)}&msToken=&X-Bogus=`

    let res: Response
    try {
      res = await fetch(url, {
        signal:  AbortSignal.timeout(6_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer':    'https://www.tiktok.com/',
          'Accept':     'application/json, text/plain, */*',
        },
      })
    } catch {
      return null  // network / timeout
    }

    if (!res.ok) return null

    let body: TikTokChallengeResponse
    try {
      body = await res.json() as TikTokChallengeResponse
    } catch {
      return null
    }

    if ((body.status_code ?? body.statusCode ?? 1) !== 0) return null

    const ci   = body.challengeInfo ?? {}
    // statsV2 has actual counts (stats.videoCount is always 0 — known TikTok bug)
    const s2   = ci.statsV2 ?? ci.stats ?? {}

    return {
      tag,
      videoCount: parseCount(s2.videoCount),
      viewCount:  parseCount(s2.viewCount),
    }
  }

  // ── Private: compute signals from best hashtag ────────────────

  private computeSignals(
    category: string,
    best: { tag: string; videoCount: number; viewCount: number },
  ): ProviderSignals {
    const { tag, videoCount, viewCount } = best
    const viewsPerVideo = videoCount > 0 ? Math.round(viewCount / videoCount) : 0

    const score      = viralityScore(viewCount, videoCount, viewsPerVideo)
    const tiktok     = viewsToTikTokSignal(viewCount)
    const content    = videosToContentPotential(videoCount)
    const ugc        = ratioToUGC(viewsPerVideo)

    // Confidence: higher when both views and videos are large
    const hasGoodData = videoCount > 1_000 && viewCount > 10_000_000
    const confidence  = hasGoodData ? 0.78 : 0.55

    console.log('TikTok signals computed', {
      category,
      hashtag:       `#${tag}`,
      videoCount,
      viewCount,
      viewsPerVideo,
      score,
      tiktok,
      content_potential: content,
      ugc,
      confidence: Math.round(confidence * 100) + '%',
    })

    return {
      virality: {
        score,
        confidence,
        tiktok,
        content_potential: content,
        ugc,
      },
      provider:   'tiktok',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
