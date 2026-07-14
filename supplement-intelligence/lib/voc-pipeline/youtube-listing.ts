// ── Real YouTube video/comment fetch — Roadmap M2.13 ─────────────────────────
//
// Reddit's per-subreddit "top of week" listing (reddit-listing.ts) has no
// real YouTube equivalent — YouTube has no generic "hot feed for a topic-
// agnostic community," only query-directed search. So this pulls YouTube's
// own real, documented Data API v3 REST endpoints directly (no SDK/package
// dependency, same "plain fetch()" pattern already used for PubMed/
// ClinicalTrials.gov/openFDA/DataForSEO in this codebase): search.list to
// find real videos for a given real topic-language query, then
// commentThreads.list to pull real top-level comments from those videos.
// Category-agnostic by construction (Roadmap M2.12 precedent): this module
// takes queries as a PARAMETER and has no import of PROBLEM_TOPICS or any
// other category-specific list — lib/voc-pipeline/pipeline.ts supplies the
// 8 real topic labels at the call site.
//
// Non-fatal by design, same posture as reddit-listing.ts and
// lib/consumer-intelligence/tiktok-comments.ts: any missing credential,
// network failure, or non-200 response degrades this one query to zero
// real posts (logged), never a fabricated substitute, never a thrown error
// that could break the pipeline.

import type { VocPost } from './clustering'

const SEARCH_ENDPOINT   = 'https://www.googleapis.com/youtube/v3/search'
const COMMENTS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/commentThreads'

const MAX_VIDEOS_PER_QUERY   = 5    // disclosed, bounded — keeps real API quota cost small and predictable
const MAX_COMMENTS_PER_VIDEO = 20
const MIN_COMMENT_LENGTH     = 20   // same order of magnitude as tiktok-comments.ts's own MIN_COMMENT_LENGTH filter

interface YoutubeSearchResponse {
  items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }>
}

interface YoutubeCommentThreadsResponse {
  items?: Array<{
    snippet?: {
      totalReplyCount?: number
      topLevelComment?: {
        snippet?: {
          textDisplay?:  string
          likeCount?:    number
          publishedAt?:  string
        }
      }
    }
  }>
}

async function searchVideos(query: string, apiKey: string): Promise<Array<{ videoId: string; title: string }>> {
  const url = `${SEARCH_ENDPOINT}?part=snippet&type=video&maxResults=${MAX_VIDEOS_PER_QUERY}&q=${encodeURIComponent(query)}&key=${apiKey}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (e: unknown) {
    console.warn('VOC pipeline: YouTube search request failed', { query, error: e instanceof Error ? e.message : e })
    return []
  }
  if (!res.ok) {
    console.warn('VOC pipeline: YouTube search non-200 response', { query, status: res.status })
    return []
  }
  let body: YoutubeSearchResponse
  try { body = await res.json() as YoutubeSearchResponse } catch { return [] }

  return (body.items ?? [])
    .map(it => ({ videoId: it.id?.videoId, title: it.snippet?.title }))
    .filter((v): v is { videoId: string; title: string } => !!v.videoId && !!v.title)
}

async function fetchCommentsForVideo(videoId: string, videoTitle: string, apiKey: string): Promise<VocPost[]> {
  const url = `${COMMENTS_ENDPOINT}?part=snippet&videoId=${videoId}&maxResults=${MAX_COMMENTS_PER_VIDEO}&order=relevance&key=${apiKey}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (e: unknown) {
    console.warn('VOC pipeline: YouTube commentThreads request failed', { videoId, error: e instanceof Error ? e.message : e })
    return []
  }
  if (!res.ok) {
    // Real, expected case, not just a generic failure: comments can be
    // disabled for a specific video (403) — one video's worth of real data
    // is simply absent for this run, not an error to alarm on.
    console.warn('VOC pipeline: YouTube commentThreads non-200 response', { videoId, status: res.status })
    return []
  }
  let body: YoutubeCommentThreadsResponse
  try { body = await res.json() as YoutubeCommentThreadsResponse } catch { return [] }

  return (body.items ?? [])
    .map((it): VocPost | null => {
      const c = it.snippet?.topLevelComment?.snippet
      if (!c?.textDisplay || c.textDisplay.trim().length < MIN_COMMENT_LENGTH) return null
      return {
        title:        videoTitle,
        body:         c.textDisplay,
        score:        c.likeCount ?? 0,
        num_comments: it.snippet?.totalReplyCount ?? 0,
        created_utc:  c.publishedAt ? Math.floor(new Date(c.publishedAt).getTime() / 1000) : 0,
        subreddit:    `youtube:${videoId}`,
      }
    })
    .filter((p): p is VocPost => p !== null)
}

// Real posts for one topic-language query — [] (never fabricated) when the
// API key is unset or any real call fails, exactly like every other
// non-fatal collector in this codebase.
export async function fetchYoutubePostsForQuery(query: string): Promise<VocPost[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const videos = await searchVideos(query, apiKey)
  const perVideo = await Promise.all(videos.map(v => fetchCommentsForVideo(v.videoId, v.title, apiKey)))
  return perVideo.flat()
}

// Category-agnostic entry point (Roadmap M2.12 precedent): takes queries as
// a parameter, no fixed topic list imported here.
export async function fetchYoutubePosts(queries: string[]): Promise<VocPost[]> {
  const perQuery = await Promise.all(queries.map(fetchYoutubePostsForQuery))
  return perQuery.flat()
}
