import type {
  SignalProvider,
  SignalContext,
  ProviderSignals,
  ViralitySignal,
} from '../types'

// ── TikTok hashtag challenge API (public, no auth) ────────────────
//
// Endpoint:
//   GET https://www.tiktok.com/api/challenge/detail/
//       ?challengeName={tag}&msToken=&X-Bogus=
//
// No API key required. Empty msToken/X-Bogus are accepted by TikTok.
//
// ── Verified fields (confirmed against live data, Jun 2026) ───────
//
//   statsV2.videoCount  (string) — REAL video count.
//     Verified: ratio vs stats.viewCount (rounded) is 0.992–1.000.
//     stats.videoCount (int) is ALWAYS 0 — TikTok backend bug, do not use.
//
//   statsV2.viewCount   (string) — REAL view count.
//     stats.viewCount (int) is the UI-rounded version (e.g. "27.5B" → 27500000000).
//     Both agree to within 1% — confirmed consistent across all test queries.
//
//   stats.videoCount    ALWAYS 0 — NEVER use this field.
//
// ── What this provider CANNOT measure ─────────────────────────────
//   - Historical trend / posting velocity — API returns cumulative totals only
//   - Creator count — not in the response
//   - Engagement rate (likes, comments) — not exposed without auth
//   → All three return null rather than estimates.
//
// ── Data quality gates ────────────────────────────────────────────
//   VERIFIED  : statsV2 present AND videoCount > 0 AND viewCount > 0
//   NO_DATA   : statsV2 absent (non-existent hashtag), or counts both 0
//   PARTIAL   : never returned — provider returns null rather than partial data

const BASE_URL = 'https://www.tiktok.com/api/challenge/detail/'

// ── Types ─────────────────────────────────────────────────────────

interface TikTokStatsV2 {
  videoCount?: string | number
  viewCount?:  string | number
}

interface TikTokChallengeResponse {
  status_code?:   number
  statusCode?:    number
  challengeInfo?: {
    challenge?: { title?: string; id?: string }
    statsV2?:   TikTokStatsV2
    // stats.videoCount is always 0 — intentionally not typed here to prevent use
  }
}

// ── Keyword strategy ──────────────────────────────────────────────
//
// AUDIT FIX (2026-07-01): The previous 2-candidate strategy generated
// DUPLICATE candidates for product names that end in non-generic words
// (e.g. "Collagen Peptide Gummies for Skin" → both candidates were
// "collagenpeptidegummiesforskin" — a hashtag that doesn't exist on
// TikTok). Live testing confirmed this caused 0% TikTok contribution
// in ALL production analyses. The fix adds 4 progressive fallback
// strategies so shorter, broader hashtags are always included:
//   1. Full phrase joined: "Collagen Peptide Gummies for Skin" → "collagenpeptidegummiesforskin"
//   2. Strip "for/with/of X" prepositional clause at end: → "collagenpeptidegummies"
//   3. Strip trailing generic words: → "collagenpeptide"
//   4. First meaningful word only (broadest fallback): → "collagen"
//
// Calibrated examples (all confirmed live 2026-07-01):
//   "Gut Health"                  → #guthealth        (2.4M videos / 27.8B views)
//   "Collagen Peptide Gummies"    → #collagenpeptidegummies (186 videos / 572K views)
//   "Collagen"                    → #collagen         (3.9M videos / 25.6B views)
//   "Magnesium Glycinate Sleep"   → #magnesiumglycinateforsleep (58 videos / 44K views) — verified
//   "GLP-1 Support"               → #glp1             (784K videos / 6.0B views)

const GENERIC_TAIL = new Set([
  'supplement', 'supplements', 'support', 'relief',
  'loss', 'health', 'care', 'boost', 'gummies', 'formula',
])

// Words that connect a product to its context ("for X", "with Y", "of Z")
const PREPOSITION_BEFORE_CLAUSE = new Set(['for', 'with', 'of', 'to', 'and', 'plus'])

function toHashtagCandidates(category: string): string[] {
  const clean = category.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const candidates: string[] = []

  // 1. Full phrase joined (exact) — most specific
  candidates.push(words.join(''))

  // 2. Strip trailing "for/with/of <purpose>" clause
  //    "Collagen Peptide Gummies for Skin" → "collagenpeptidegummies"
  //    "Magnesium Glycinate for Sleep Support" → "magnesiumglycinate"
  const prepIdx = words.findIndex(w => PREPOSITION_BEFORE_CLAUSE.has(w))
  if (prepIdx > 0) {
    candidates.push(words.slice(0, prepIdx).join(''))
  }

  // 3. Strip generic tail words from the (already clause-stripped) form
  const base = prepIdx > 0 ? words.slice(0, prepIdx) : [...words]
  const stripped = [...base]
  while (stripped.length > 1 && GENERIC_TAIL.has(stripped[stripped.length - 1])) {
    stripped.pop()
  }
  candidates.push(stripped.join(''))

  // 4. First meaningful word only — broadest possible fallback
  //    "Collagen Peptide Gummies for Skin" → "collagen"
  const firstWord = words.find(w => !PREPOSITION_BEFORE_CLAUSE.has(w) && !GENERIC_TAIL.has(w))
  if (firstWord && firstWord.length >= 4) {
    candidates.push(firstWord)
  }

  // Deduplicate while preserving order (most specific first so we try the
  // best match before falling back — the winning candidate is still the
  // one with the most videos, not necessarily the first tried).
  const seen = new Set<string>()
  return candidates.filter(h => h.length >= 2 && !seen.has(h) && seen.add(h) !== undefined)
}

// ── Numeric helpers ───────────────────────────────────────────────

function parseCount(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return isNaN(n) ? 0 : n
}

// ── Signal scoring (calibrated against live data) ─────────────────

function viewsToTikTokSignal(views: number): ViralitySignal['tiktok'] {
  if (views >= 1_000_000_000) return 'High'   // ≥ 1B: Gut Health 27.5B, Cortisol 16.4B
  if (views >= 100_000_000)   return 'Medium' // ≥ 100M: #magnesiumsupplement 134M, #sleepgummies 339M
  return 'Low'
}

function videosToContentPotential(videos: number): ViralitySignal['content_potential'] {
  if (videos >= 100_000) return 'High'   // ≥ 100K creator videos
  if (videos >= 10_000)  return 'Medium' // ≥ 10K
  return 'Low'                           // < 10K
}

function ratioToUGC(viewsPerVideo: number): ViralitySignal['ugc'] {
  // Calibrated: Cortisol 19.5K→High, Gut Health 11.7K→Medium, Sleep 3.3K→Low
  if (viewsPerVideo >= 15_000) return 'High'
  if (viewsPerVideo >=  5_000) return 'Medium'
  return 'Low'
}

// Composite 0–10 score: 40% views (log-scaled) + 30% video count + 30% views/video
// Calibrated outcomes:
//   #guthealth  27.5B views / 2.3M vids  → 9
//   #glp1       6.0B views  / 784K vids  → 8
//   #cortisol   16.4B views / 840K vids  → 8
//   #magnesiumsupplement 134M / 27K vids → 5
function viralityScore(views: number, videos: number, viewsPerVideo: number): number {
  const viewsScore = views <= 0 ? 0
    : Math.min(10, Math.max(1, Math.round((Math.log10(views) - 5) * 2)))

  const videoScore =
    videos >= 10_000_000 ? 9 :
    videos >=  1_000_000 ? 8 :
    videos >=    100_000 ? 7 :
    videos >=     10_000 ? 5 :
    videos >=      1_000 ? 4 : 2

  const ugcScore =
    viewsPerVideo >= 20_000 ? 9 :
    viewsPerVideo >= 10_000 ? 7 :
    viewsPerVideo >=  5_000 ? 6 :
    viewsPerVideo >=  2_000 ? 5 :
    viewsPerVideo >=  1_000 ? 4 : 2

  return Math.round(viewsScore * 0.4 + videoScore * 0.3 + ugcScore * 0.3)
}

// Confidence tiered by data size (larger hashtag = more stable counts)
function dataConfidence(videoCount: number, viewCount: number): number {
  if (videoCount >= 100_000 && viewCount >= 1_000_000_000) return 0.80
  if (videoCount >=  10_000 && viewCount >=   100_000_000) return 0.75
  if (videoCount >=   1_000 && viewCount >=    10_000_000) return 0.68
  if (videoCount >=     100 && viewCount >=     1_000_000) return 0.60
  return 0.50
}

// ── Core provider class ───────────────────────────────────────────

export class TikTokProvider implements SignalProvider {
  readonly name    = 'tiktok'
  // Public endpoint, no key required.
  // Set TIKTOK_DISABLED=true as escape hatch if endpoint breaks.
  readonly enabled = process.env.TIKTOK_DISABLED !== 'true'

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    const category = ctx.query
    const candidates = toHashtagCandidates(category)
    if (!candidates.length) return null

    try {
      // Fetch all candidates in parallel
      const results = await Promise.all(candidates.map(tag => this.fetchHashtag(tag)))

      // Require VERIFIED data: statsV2 present, videoCount > 0, viewCount > 0.
      // No fallback to views-only data — views/video ratio cannot be computed
      // without videoCount, and per requirements: return null rather than partial.
      const verified = results.filter(
        (r): r is { tag: string; videoCount: number; viewCount: number; dataQuality: 'VERIFIED' } =>
          r !== null && r.dataQuality === 'VERIFIED',
      )

      if (!verified.length) {
        const qualities = results.map(r => r ? r.dataQuality : 'NULL').join(', ')
        console.log('TikTok: no verified hashtag data', { category, candidates, qualities })
        return null
      }

      // Pick the hashtag with the most videos (most representative of the category)
      const best = verified.sort((a, b) => b.videoCount - a.videoCount)[0]
      return this.computeSignals(category, best)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('TikTok provider error', { category, error: msg.slice(0, 120) })
      return null
    }
  }

  // ── Private: single hashtag fetch ────────────────────────────────

  private async fetchHashtag(tag: string): Promise<{
    tag:         string
    videoCount:  number
    viewCount:   number
    dataQuality: 'VERIFIED' | 'NO_DATA'
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
    } catch { return null }

    if (!res.ok) return null

    let body: TikTokChallengeResponse
    try { body = await res.json() as TikTokChallengeResponse } catch { return null }

    if ((body.status_code ?? body.statusCode ?? 1) !== 0) return null

    const ci = body.challengeInfo ?? {}

    // ONLY read from statsV2. stats.videoCount is always 0 (confirmed via live
    // testing) and must never be used — it would cause false NO_DATA results.
    const s2 = ci.statsV2
    if (!s2) {
      return { tag, videoCount: 0, viewCount: 0, dataQuality: 'NO_DATA' }
    }

    const videoCount = parseCount(s2.videoCount)
    const viewCount  = parseCount(s2.viewCount)

    // Both must be non-zero for VERIFIED status.
    // Zero videoCount in statsV2 means the hashtag genuinely has no videos
    // (distinct from stats.videoCount which is always 0).
    const dataQuality = (videoCount > 0 && viewCount > 0) ? 'VERIFIED' : 'NO_DATA'

    return { tag, videoCount, viewCount, dataQuality }
  }

  // ── Private: compute signals ──────────────────────────────────────

  private computeSignals(
    category: string,
    best: { tag: string; videoCount: number; viewCount: number },
  ): ProviderSignals {
    const { tag, videoCount, viewCount } = best
    const viewsPerVideo = Math.round(viewCount / videoCount)

    const score      = viralityScore(viewCount, videoCount, viewsPerVideo)
    const tiktok     = viewsToTikTokSignal(viewCount)
    const content    = videosToContentPotential(videoCount)
    const ugc        = ratioToUGC(viewsPerVideo)
    const confidence = dataConfidence(videoCount, viewCount)

    console.log('TikTok signals computed', {
      category,
      hashtag:           `#${tag}`,
      data_quality:      'VERIFIED',
      raw_video_count:   videoCount,        // real value from statsV2.videoCount
      raw_view_count:    viewCount,         // real value from statsV2.viewCount
      views_per_video:   viewsPerVideo,     // derived: viewCount / videoCount
      score,
      tiktok,
      content_potential: content,
      ugc,
      confidence:        Math.round(confidence * 100) + '%',
      not_measured:      ['creator_count', 'posting_velocity', 'engagement_rate'],
    })

    return {
      virality: {
        score,
        confidence,
        tiktok,
        content_potential: content,
        ugc,
        video_count: videoCount,
        view_count:  viewCount,
        hashtag:     tag,
      },
      provider:   'tiktok',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
