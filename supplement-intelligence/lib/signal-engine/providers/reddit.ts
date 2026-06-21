import type {
  SignalProvider,
  ProviderSignals,
  DemandSignal,
  GrowthSignal,
  ReviewVelocitySignal,
} from '../types'

// ── Reddit provider (OAuth2 client_credentials) ────────────────────
//
// Reddit requires OAuth2 for ALL API access (public data included).
// The client_credentials grant needs no user login — just a Script App.
//
// HOW TO GET FREE CREDENTIALS (2 minutes):
//   1. Go to https://www.reddit.com/prefs/apps
//   2. Click "Create another app" → choose "script"
//   3. Name: "supplement-intelligence", redirect URI: http://localhost
//   4. Copy the "personal use script" client ID (under the app name)
//   5. Copy the "secret" value
//   6. Set: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME
//      (REDDIT_USERNAME is required for the User-Agent string per Reddit ToS)
//
// Rate limit: 60 requests/minute with OAuth (well within discovery cache budget)
//
// ── What this provider measures (real API data) ────────────────────
//
//   MEASURED:
//     post_count     — posts mentioning the category in supplement subreddits (last 12 months)
//     avg_score      — mean upvotes per post (community endorsement)
//     avg_comments   — mean comments per post (discussion depth / engagement)
//     upvote_ratio   — mean upvote ratio (sentiment signal; 0.0–1.0)
//     pain_posts     — % of titles containing problem-language patterns
//     velocity_ratio — recent posts (last 60d) vs earlier posts (days 61–180)
//     subreddits     — which communities discuss this category
//
//   NOT MEASURED (data not in API response):
//     unique_user_count  — not exposed in search results
//     comment_text       — would require per-post fetch (too many tokens)
//     exact_view_count   — Reddit does not expose view counts via API
//
// ── Signal mapping ─────────────────────────────────────────────────
//
//   demand       — post count + engagement level
//   growth       — velocity ratio (recent vs older posts)
//   review_velocity — avg_comments (engagement depth) + sentiment

// ── Constants ──────────────────────────────────────────────────────

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'
const API_BASE  = 'https://oauth.reddit.com'

// Supplement-relevant subreddits, in priority order.
// Search is run across all of them via Reddit's cross-subreddit search.
const SUPPLEMENT_SUBREDDITS = [
  'Supplements', 'nutrition', 'GutHealth', 'Nootropics',
  'sleep', 'hormones', 'PCOS', 'Fitness', 'HealthSupplements',
]

// Pain-signal patterns in post titles (case-insensitive).
// High frequency of these → category has real consumer pain.
const PAIN_PATTERNS = [
  /\b(looking for|need|trying to find|recommend|suggestions? for)\b/i,
  /\b(struggle|struggling|can'?t|nothing works|tried everything)\b/i,
  /\b(help with|help me|what (can|should) i|any advice)\b/i,
  /\b(frustrated|disappointing|side effects?|stopped working)\b/i,
  /\b(best .* for|worst .* for|alternative to|replacement for)\b/i,
]

// ── Types ─────────────────────────────────────────────────────────

interface RedditTokenResponse {
  access_token?: string
  token_type?:   string
  expires_in?:   number
  error?:        string
}

interface RedditPost {
  data: {
    title:        string
    score:        number
    upvote_ratio: number
    num_comments: number
    created_utc:  number
    subreddit:    string
    is_self:      boolean
  }
}

interface RedditSearchResponse {
  data?: {
    dist?:     number
    children?: RedditPost[]
    after?:    string
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function painFraction(posts: RedditPost[]): number {
  if (!posts.length) return 0
  const painCount = posts.filter(p =>
    PAIN_PATTERNS.some(rx => rx.test(p.data.title))
  ).length
  return painCount / posts.length
}

// Map post count to demand score (0–10)
function postCountToScore(count: number, avgScore: number): number {
  const volumeScore =
    count >= 500 ? 9 :
    count >= 200 ? 8 :
    count >= 100 ? 7 :
    count >=  50 ? 6 :
    count >=  20 ? 5 :
    count >=   5 ? 4 : 2

  // Boost by +1 if community is actively engaging (avg score > 50)
  const engagementBoost = avgScore >= 50 ? 1 : 0
  return Math.min(10, volumeScore + engagementBoost)
}

function demandSignal(score: number): DemandSignal['signal'] {
  return score >= 7 ? 'Strong' : score >= 5 ? 'Moderate' : 'Weak'
}

function velocityRatioToGrowthScore(ratio: number): number {
  // ratio = (recent 60d posts per day) / (days 61-180 posts per day)
  // >2.0 = posts doubling = strong acceleration
  if (ratio >= 2.0) return 9
  if (ratio >= 1.5) return 8
  if (ratio >= 1.2) return 7
  if (ratio >= 0.8) return 6   // stable ±20%
  if (ratio >= 0.5) return 4
  return 2
}

function velocityRatioToMomentum(ratio: number): GrowthSignal['momentum'] {
  return ratio >= 1.2 ? 'Accelerating' : ratio <= 0.8 ? 'Decelerating' : 'Stable'
}

function upvoteRatioToSentiment(ratio: number): ReviewVelocitySignal['sentiment'] {
  if (ratio >= 0.88) return 'Positive'
  if (ratio >= 0.72) return 'Mixed'
  return 'Negative'
}

// Confidence based on data size (fewer posts = less reliable)
function computeConfidence(postCount: number, hasGoodSpread: boolean): number {
  const base =
    postCount >= 100 ? 0.80 :
    postCount >=  50 ? 0.75 :
    postCount >=  20 ? 0.68 :
    postCount >=   5 ? 0.58 : 0.45
  return Math.min(0.85, base + (hasGoodSpread ? 0.03 : 0))
}

// Keyword → Reddit search query.
// Keeps the core concept without inflating specificity.
function toSearchQuery(category: string): string {
  return category
    .toLowerCase()
    .replace(/\b(supplement|support|relief|care)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Core provider class ───────────────────────────────────────────

export class RedditProvider implements SignalProvider {
  readonly name    = 'reddit'
  // Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (free Script App — see .env.example).
  // Set REDDIT_DISABLED=true to skip even when credentials are present.
  readonly enabled = !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) &&
    process.env.REDDIT_DISABLED !== 'true'

  // Cached token (per cold-start invocation)
  private _token: { value: string; expires: number } | null = null

  async fetch(category: string): Promise<ProviderSignals | null> {
    if (!this.enabled) return null

    try {
      const token = await this.getToken()
      if (!token) {
        console.error('Reddit: failed to obtain access token')
        return null
      }

      const query   = toSearchQuery(category)
      const posts   = await this.searchPosts(token, query)

      if (posts.length < 3) {
        console.log('Reddit: too few posts', { category, query, count: posts.length })
        return null
      }

      return this.computeSignals(category, query, posts)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const isRL = msg.toLowerCase().includes('429') || msg.toLowerCase().includes('rate')
      if (isRL) {
        console.warn('Reddit: rate-limited, skipping', { category })
      } else {
        console.error('Reddit provider error', { category, error: msg.slice(0, 120) })
      }
      return null
    }
  }

  // ── Private: OAuth2 token ─────────────────────────────────────

  private async getToken(): Promise<string | null> {
    // Reuse if still valid (Reddit tokens last 1 hour)
    if (this._token && Date.now() < this._token.expires) {
      return this._token.value
    }

    const clientId     = process.env.REDDIT_CLIENT_ID!
    const clientSecret = process.env.REDDIT_CLIENT_SECRET!
    const username     = process.env.REDDIT_USERNAME ?? 'bot'
    const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    let res: Response
    try {
      res = await fetch(TOKEN_URL, {
        method:  'POST',
        signal:  AbortSignal.timeout(8_000),
        headers: {
          'Authorization': `Basic ${credentials}`,
          'User-Agent':    `supplement-intelligence/1.0 by /u/${username}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      })
    } catch { return null }

    if (!res.ok) {
      console.error('Reddit token error', { status: res.status })
      return null
    }

    let body: RedditTokenResponse
    try { body = await res.json() as RedditTokenResponse } catch { return null }

    if (!body.access_token) {
      console.error('Reddit token: no access_token in response', body.error)
      return null
    }

    this._token = {
      value:   body.access_token,
      expires: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    }
    return this._token.value
  }

  // ── Private: search across supplement subreddits ──────────────

  private async searchPosts(token: string, query: string): Promise<RedditPost[]> {
    const username  = process.env.REDDIT_USERNAME ?? 'bot'
    const subreddit = SUPPLEMENT_SUBREDDITS.join('+')
    const url = `${API_BASE}/r/${subreddit}/search` +
      `?q=${encodeURIComponent(query)}` +
      `&sort=new&t=year&limit=100&type=link&restrict_sr=1`

    let res: Response
    try {
      res = await fetch(url, {
        signal:  AbortSignal.timeout(10_000),
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent':    `supplement-intelligence/1.0 by /u/${username}`,
          'Accept':        'application/json',
        },
      })
    } catch { return [] }

    if (res.status === 429) throw new Error('429 rate-limited')
    if (!res.ok) {
      console.error('Reddit search error', { status: res.status, query })
      return []
    }

    let body: RedditSearchResponse
    try { body = await res.json() as RedditSearchResponse } catch { return [] }

    return (body.data?.children ?? []).filter(
      p => p.data && typeof p.data.title === 'string' && p.data.title.trim().length > 0
    )
  }

  // ── Private: compute signals ──────────────────────────────────

  private computeSignals(
    category: string,
    query:    string,
    posts:    RedditPost[],
  ): ProviderSignals {
    const now = Date.now() / 1000  // Unix seconds

    // Velocity: posts in last 60 days vs. days 61–180
    const recent = posts.filter(p => (now - p.data.created_utc) < 60  * 86400)
    const older  = posts.filter(p => {
      const age = now - p.data.created_utc
      return age >= 60 * 86400 && age < 180 * 86400
    })
    const recentPerDay = recent.length / 60
    const olderPerDay  = older.length  / 120
    const velocityRatio = olderPerDay > 0 ? recentPerDay / olderPerDay : (recent.length > 0 ? 2 : 1)

    // Aggregates
    const totalPosts  = posts.length
    const avgScore    = posts.reduce((s, p) => s + p.data.score, 0) / totalPosts
    const avgComments = posts.reduce((s, p) => s + p.data.num_comments, 0) / totalPosts
    const avgRatio    = posts.reduce((s, p) => s + p.data.upvote_ratio, 0) / totalPosts
    const pain        = painFraction(posts)
    const subSet: string[] = []
    posts.forEach(p => { const s = `r/${p.data.subreddit}`; if (!subSet.includes(s)) subSet.push(s) })
    const subreddits  = subSet.slice(0, 5)
    const hasSpread   = subreddits.length >= 3

    // Demand: post volume + engagement
    const demandScore = postCountToScore(totalPosts, avgScore)
    const postsPerMonth = Math.round((totalPosts / 12) * 10) / 10

    // Growth: velocity trend
    const growthScore = velocityRatioToGrowthScore(velocityRatio)
    const momentum    = velocityRatioToMomentum(velocityRatio)
    const trendPct    = Math.round((velocityRatio - 1) * 100)
    const trendStr    = Math.abs(trendPct) <= 15 ? 'Stable'
      : trendPct > 0 ? `+${trendPct}% recent velocity`
      : `${trendPct}% recent velocity`

    // Review velocity: engagement depth + sentiment
    const rvScore     = Math.min(10, Math.max(1, Math.round(Math.log10(Math.max(1, avgComments)) * 3)))
    const sentiment   = upvoteRatioToSentiment(avgRatio)

    const confidence  = computeConfidence(totalPosts, hasSpread)

    console.log('Reddit signals computed', {
      category,
      query,
      data_quality:         'VERIFIED',
      total_posts:          totalPosts,
      posts_per_month:      postsPerMonth,
      recent_posts_60d:     recent.length,
      older_posts_61_180d:  older.length,
      velocity_ratio:       Math.round(velocityRatio * 100) / 100,
      avg_score:            Math.round(avgScore),
      avg_comments:         Math.round(avgComments),
      avg_upvote_ratio:     Math.round(avgRatio * 100) / 100,
      pain_post_fraction:   Math.round(pain * 100) + '%',
      subreddits_found:     subreddits,
      demand_score:         demandScore,
      growth_score:         growthScore,
      sentiment,
      confidence:           Math.round(confidence * 100) + '%',
    })

    return {
      demand: {
        score:         demandScore,
        confidence,
        search_volume: `~${postsPerMonth} posts/month in supplement communities`,
        trend:         trendStr,
        signal:        demandSignal(demandScore),
      },
      growth: {
        score:      growthScore,
        confidence,
        yoy_change: trendStr,
        momentum,
      },
      review_velocity: {
        score:           rvScore,
        confidence,
        monthly_reviews: `~${postsPerMonth} posts/month`,
        sentiment,
        avg_rating:      `${Math.round(avgRatio * 100)}% upvoted`,
      },
      provider:   'reddit',
      fetched_at: new Date().toISOString(),
      confidence,
    }
  }
}
