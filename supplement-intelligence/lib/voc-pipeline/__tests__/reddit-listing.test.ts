import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeeklyTopPosts } from '../reddit-listing'

describe('fetchWeeklyTopPosts', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('parses real listing children into VocRedditPost objects', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          children: [
            { data: { title: 'Brain fog again', selftext: 'ugh', score: 100, num_comments: 20, created_utc: 1720000000, subreddit: 'Menopause' } },
            { data: { title: '', score: 5, num_comments: 1, created_utc: 1720000000, subreddit: 'Menopause' } },   // empty title, filtered
          ],
        },
      }),
    } as Response)

    const posts = await fetchWeeklyTopPosts('Menopause', 'tok')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ title: 'Brain fog again', selftext: 'ugh', score: 100, num_comments: 20, subreddit: 'Menopause' })
  })

  it('returns [] (never fabricated posts) on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
    expect(await fetchWeeklyTopPosts('Menopause', 'tok')).toEqual([])
  })

  it('returns [] on a 429 rate-limit response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) } as Response)
    expect(await fetchWeeklyTopPosts('Menopause', 'tok')).toEqual([])
  })

  it('returns [] on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchWeeklyTopPosts('Menopause', 'tok')).toEqual([])
  })

  it('requests the real top-of-week listing endpoint for the given subreddit', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { children: [] } }) } as Response)
    await fetchWeeklyTopPosts('xxfitness', 'tok')
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('https://oauth.reddit.com/r/xxfitness/top?t=week&limit=100')
  })
})
