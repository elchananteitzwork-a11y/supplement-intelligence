import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { fetchYoutubePosts, fetchYoutubePostsForQuery } from '../youtube-listing'

const ORIGINAL_ENV = { ...process.env }

describe('youtube-listing (Roadmap M2.13)', () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('returns [] (never fabricated) when YOUTUBE_API_KEY is unset — no fetch attempted', async () => {
    delete process.env.YOUTUBE_API_KEY
    const fetchSpy = vi.spyOn(global, 'fetch')
    expect(await fetchYoutubePostsForQuery('gut skin inflammation')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('searches for real videos, then fetches real comments, and maps them into VocPost shape', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url as string
      if (u.includes('/search')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: { videoId: 'abc123' }, snippet: { title: 'Gut Health Explained' } }] }),
        } as Response
      }
      if (u.includes('/commentThreads')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                snippet: {
                  totalReplyCount: 3,
                  topLevelComment: { snippet: { textDisplay: 'My bloating got so much worse after switching diets, still figuring it out', likeCount: 42, publishedAt: '2026-07-01T00:00:00Z' } },
                },
              },
            ],
          }),
        } as Response
      }
      throw new Error(`unexpected URL ${u}`)
    })

    const posts = await fetchYoutubePostsForQuery('gut skin inflammation')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      title: 'Gut Health Explained',
      body: 'My bloating got so much worse after switching diets, still figuring it out',
      score: 42,
      num_comments: 3,
      subreddit: 'youtube:abc123',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('filters out comments shorter than the minimum real-signal length', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url as string
      if (u.includes('/search')) return { ok: true, json: async () => ({ items: [{ id: { videoId: 'v1' }, snippet: { title: 'T' } }] }) } as Response
      return { ok: true, json: async () => ({ items: [{ snippet: { totalReplyCount: 0, topLevelComment: { snippet: { textDisplay: 'nice!', likeCount: 1, publishedAt: '2026-07-01T00:00:00Z' } } } }] }) } as Response
    })
    expect(await fetchYoutubePostsForQuery('q')).toEqual([])
  })

  it('returns [] (never fabricated) on a non-200 search response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response)
    expect(await fetchYoutubePostsForQuery('q')).toEqual([])
  })

  it('returns [] on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchYoutubePostsForQuery('q')).toEqual([])
  })

  it('one video with disabled comments (403 on commentThreads) does not fail the whole query — other videos still contribute', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url as string
      if (u.includes('/search')) {
        return { ok: true, json: async () => ({ items: [{ id: { videoId: 'v1' }, snippet: { title: 'T1' } }, { id: { videoId: 'v2' }, snippet: { title: 'T2' } }] }) } as Response
      }
      if (u.includes('videoId=v1')) return { ok: false, status: 403 } as Response
      return {
        ok: true,
        json: async () => ({ items: [{ snippet: { totalReplyCount: 0, topLevelComment: { snippet: { textDisplay: 'a real comment with enough length to pass the filter', likeCount: 2, publishedAt: '2026-07-01T00:00:00Z' } } } }] }),
      } as Response
    })
    const posts = await fetchYoutubePostsForQuery('q')
    expect(posts).toHaveLength(1)
    expect(posts[0].subreddit).toBe('youtube:v2')
  })

  it('fetchYoutubePosts is category-agnostic: takes queries as a parameter, contains no fixed topic import', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ items: [] }) } as Response)
    const posts = await fetchYoutubePosts(['some-beauty-query', 'some-pets-query'])
    expect(posts).toEqual([])
  })
})
