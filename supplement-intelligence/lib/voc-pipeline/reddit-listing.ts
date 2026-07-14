// ── Real subreddit "top of week" listing fetch — Roadmap M2.7 ───────────────
//
// Unlike lib/signal-engine/providers/reddit.ts (which searches for a
// specific per-query keyword), this pipeline mines broad problem language
// with no product category in mind — so it pulls Reddit's own real,
// documented `/r/{subreddit}/top?t=week` listing endpoint (no search term
// required) rather than a search call. Same OAuth2 token (lib/reddit-
// client/token.ts), same real API, different endpoint shape for a
// different real question: "what did people actually post about this
// week," not "does this specific query show up."
//
// Roadmap M2.13: pipeline.ts no longer calls fetchWeeklyTopPosts (Reddit is
// deferred, per standing decision) — kept fully intact and dormant here,
// not deleted, same treatment as lib/signal-engine/providers/reddit.ts.
// Still produces the shared lib/voc-pipeline/clustering.ts VocPost shape
// (renamed from this file's own VocRedditPost) so it stays typecheck-clean
// and ready to be reactivated later without being a stale, incompatible
// relic.

import { redditUserAgent } from '@/lib/reddit-client/token'
import type { VocPost } from './clustering'

const API_BASE = 'https://oauth.reddit.com'

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        title?:        string
        selftext?:     string
        score?:        number
        num_comments?: number
        created_utc?:  number
        subreddit?:    string
      }
    }>
  }
}

// Real weekly top-post listing for one subreddit. Returns [] (never a
// fabricated post list) on any network/parse failure or non-200 response —
// the caller simply has one less subreddit's worth of real data for this
// run, not a fake substitute for it.
export async function fetchWeeklyTopPosts(subreddit: string, token: string, limit = 100): Promise<VocPost[]> {
  const url = `${API_BASE}/r/${subreddit}/top?t=week&limit=${limit}`

  let res: Response
  try {
    res = await fetch(url, {
      signal:  AbortSignal.timeout(10_000),
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent':    redditUserAgent(),
        'Accept':        'application/json',
      },
    })
  } catch (e: unknown) {
    console.warn('VOC pipeline: subreddit listing request failed', { subreddit, error: e instanceof Error ? e.message : e })
    return []
  }

  if (res.status === 429) {
    console.warn('VOC pipeline: rate-limited', { subreddit })
    return []
  }
  if (!res.ok) {
    console.warn('VOC pipeline: non-200 listing response', { subreddit, status: res.status })
    return []
  }

  let body: RedditListingResponse
  try { body = await res.json() as RedditListingResponse } catch { return [] }

  return (body.data?.children ?? [])
    .map(c => c.data)
    .filter((d): d is NonNullable<typeof d> & { title: string; subreddit: string } =>
      !!d && typeof d.title === 'string' && d.title.trim().length > 0 && typeof d.subreddit === 'string')
    .map(d => ({
      title:        d.title,
      body:         d.selftext,
      score:        d.score ?? 0,
      num_comments: d.num_comments ?? 0,
      created_utc:  d.created_utc ?? 0,
      subreddit:    d.subreddit,
    }))
}
