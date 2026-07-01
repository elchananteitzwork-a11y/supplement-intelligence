import type { CollectedReview } from '../review-collector/types'

// ── TikTok Comment Intelligence ───────────────────────────────────────────────
//
// Uses `clockworks/free-tiktok-scraper` (27M total runs, updated daily, free
// tier) to collect comments from the top-N videos under a product hashtag.
//
// TikTok comments differ from Amazon reviews:
//   - No star rating — all comments mapped to rating=3 (neutral) so they feed
//     into the allSentences pool (mostMentionedProblems + featureRequests) but
//     NOT into positiveThemes (4-5★) or negativeThemes (1-2★).
//   - Short, emoji-heavy, informal — PROBLEM_CUES/REQUEST_CUES still fire on
//     "doesn't work", "wish it would", "want them to add" etc.
//   - Purchase intent signals common: "ordering this", "where can I buy",
//     "just got mine" — captured by PURCHASE_INTENT_CUES below.
//   - "Subscribe" = YouTube subscribe, NOT product subscription — excluded
//     from the standard repurchaseLanguage computation in analyze.ts by
//     filtering on source_provider === 'tiktok-comments'.
//
// Pricing: clockworks~free-tiktok-scraper uses compute units, not PAY_PER_EVENT.
//   Estimated cost: < $0.02 per run for 10 videos + comments.
//
// Output: CollectedReview[] with source_provider = 'tiktok-comments'
//   These are passed into analyzeConsumerIntelligence() alongside Amazon reviews.

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items'

// Max videos to fetch per hashtag. More videos = more comment datasets to check.
// 10 videos × ~20 comments/video ≈ 200 raw comments (after dedup and filtering).
const MAX_VIDEOS   = 10
// Comments requested per video (the actor collects up to this many per post).
const COMMENTS_PER_POST = 50

// Minimum comment length — filters out emoji-only and single-word replies.
const MIN_COMMENT_LENGTH = 12

// TikTok-specific purchase intent signals (distinct from Amazon repurchase language).
// These are comments expressing intent to buy, just-purchased, or price curiosity.
export const PURCHASE_INTENT_CUES = /\b(ordering\s+this|just\s+ordered|just\s+bought|where\s+(?:can\s+i\s+buy|do\s+i\s+get|to\s+get)|what(?:'s|\s+is)\s+the\s+link|link\s+(?:in|to)\s+(?:bio|buy|get)|add(?:ed|ing)?\s+to\s+(?:cart|my\s+cart)|going\s+to\s+(?:try|buy|get|order)|need\s+to\s+(?:buy|get|order|try)|already\s+(?:have|got|use|bought)|i\s+(?:got|have)\s+this|this\s+(?:works|helped|fixed|changed)|it\s+(?:actually|really|finally)\s+works)\b/i

interface TikTokVideoItem {
  id?:                string
  text?:              string
  commentCount?:      number
  commentsDatasetUrl?: string | null
}

interface TikTokComment {
  cid?:           string
  text?:          string
  diggCount?:     number
  createTimeISO?: string
  videoWebUrl?:   string
}

export interface TikTokCommentResult {
  hashtag:         string
  videosScraped:   number
  commentsCollected: number
  reviews:         CollectedReview[]
  purchaseIntentCount: number  // distinct comments matching PURCHASE_INTENT_CUES
}

export async function collectTikTokComments(
  hashtag:        string,
  timeoutMs:      number = 90_000,
): Promise<TikTokCommentResult | null> {
  if (!process.env.APIFY_API_TOKEN) return null

  const clean = hashtag.replace(/^#/, '').toLowerCase().trim()
  if (!clean) return null

  let videoItems: TikTokVideoItem[] = []

  try {
    const t0 = Date.now()
    const res = await fetch(`${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}`, {
      method:  'POST',
      signal:  AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashtags:                   [clean],
        resultsPerPage:             MAX_VIDEOS,
        maxProfilesPerQuery:        1,
        shouldDownloadVideos:       false,
        shouldDownloadCovers:       false,
        shouldDownloadSlideshowImages: false,
        commentsPerPost:            COMMENTS_PER_POST,
      }),
    })

    if (!res.ok) {
      console.error('[TikTokComments] actor HTTP error', res.status, { hashtag: clean })
      return null
    }

    videoItems = await res.json() as TikTokVideoItem[]
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log('[TikTokComments] actor completed', {
      hashtag: clean,
      videos:  videoItems.length,
      elapsed: elapsed + 's',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[TikTokComments] actor fetch failed', { hashtag: clean, error: msg.slice(0, 120) })
    return null
  }

  if (!videoItems.length) return null

  // Collect comments from the dataset URL (same URL for all videos in the run)
  const commentsDatasetUrl = videoItems.find(v => v.commentsDatasetUrl)?.commentsDatasetUrl
  if (!commentsDatasetUrl) {
    console.log('[TikTokComments] no commentsDatasetUrl found', { hashtag: clean })
    return null
  }

  let rawComments: TikTokComment[] = []
  try {
    const dsRes = await fetch(`${commentsDatasetUrl}&limit=500`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!dsRes.ok) {
      console.error('[TikTokComments] dataset fetch error', dsRes.status)
      return null
    }
    rawComments = await dsRes.json() as TikTokComment[]
  } catch (e: unknown) {
    console.error('[TikTokComments] dataset fetch failed', e instanceof Error ? e.message : e)
    return null
  }

  const seen = new Set<string>()
  let purchaseIntentCount = 0

  const reviews: CollectedReview[] = rawComments
    .filter(c => {
      if (!c.cid || !c.text?.trim()) return false
      if (c.text.trim().length < MIN_COMMENT_LENGTH) return false
      if (seen.has(c.cid)) return false
      seen.add(c.cid)
      return true
    })
    .map(c => {
      const body = c.text!.trim()
      if (PURCHASE_INTENT_CUES.test(body)) purchaseIntentCount++
      return {
        id:              `tiktok-${c.cid!}`,
        asin:            `#${clean}`,      // hashtag as product identifier
        title:           '',
        body,
        rating:          3,                // neutral — no star rating for comments
        verified:        false,
        helpful_votes:   typeof c.diggCount === 'number' ? c.diggCount : 0,
        date:            c.createTimeISO ?? new Date().toISOString(),
        country:         'US',
        source_provider: 'tiktok-comments',
        collected_at:    new Date().toISOString(),
      } satisfies CollectedReview
    })

  console.log('[TikTokComments] collected', {
    hashtag:       clean,
    videosScraped: videoItems.length,
    rawComments:   rawComments.length,
    usable:        reviews.length,
    purchaseIntent: purchaseIntentCount,
  })

  return {
    hashtag:           clean,
    videosScraped:     videoItems.length,
    commentsCollected: reviews.length,
    reviews,
    purchaseIntentCount,
  }
}
