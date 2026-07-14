import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runVocPipeline, isoWeekString, VOC_PIPELINE_VERSION } from '../pipeline'
import { PROBLEM_TOPICS, DATAFORSEO_SEED_PHRASES } from '../topics'

const fetchYoutubePosts = vi.fn()
const fetchDataForSeoQuestionPosts = vi.fn()
const getPreviousTopicPostCount = vi.fn()
const writeClusterRun = vi.fn().mockResolvedValue(undefined)

vi.mock('../youtube-listing', () => ({ fetchYoutubePosts: (...args: unknown[]) => fetchYoutubePosts(...args) }))
vi.mock('../dataforseo-question-posts', () => ({ fetchDataForSeoQuestionPosts: (...args: unknown[]) => fetchDataForSeoQuestionPosts(...args) }))
vi.mock('../store', () => ({
  getPreviousTopicPostCount: (...args: unknown[]) => getPreviousTopicPostCount(...args),
  writeClusterRun: (...args: unknown[]) => writeClusterRun(...args),
}))

describe('isoWeekString', () => {
  it('computes a real, stable ISO week label for a known date', () => {
    // 2026-07-13 is a Monday in ISO week 29 of 2026.
    expect(isoWeekString(new Date('2026-07-13T12:00:00Z'))).toBe('2026-W29')
  })

  it('is stable across different times of the same day', () => {
    const a = isoWeekString(new Date('2026-07-13T00:05:00Z'))
    const b = isoWeekString(new Date('2026-07-13T23:55:00Z'))
    expect(a).toBe(b)
  })
})

describe('runVocPipeline — Roadmap M2.13 (re-sourced from Reddit to YouTube + DataForSEO)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeClusterRun.mockResolvedValue(undefined)
    fetchYoutubePosts.mockResolvedValue([])
    fetchDataForSeoQuestionPosts.mockResolvedValue([])
    getPreviousTopicPostCount.mockResolvedValue(null)
  })

  it('queries YouTube with real topic labels and DataForSEO with real search-style seed phrases (not the same list) — never returns null even when both are empty', async () => {
    const result = await runVocPipeline(new Date('2026-07-13T12:00:00Z'))

    const expectedYoutubeQueries = PROBLEM_TOPICS.map(t => t.label)
    const expectedDataforseoSeeds = PROBLEM_TOPICS.map(t => DATAFORSEO_SEED_PHRASES[t.key])
    expect(fetchYoutubePosts).toHaveBeenCalledWith(expectedYoutubeQueries)
    expect(fetchDataForSeoQuestionPosts).toHaveBeenCalledWith(expectedDataforseoSeeds, expect.any(Date))
    expect(result).toMatchObject({ topicsRanked: 0, postsFetched: 0, youtubePostsFetched: 0, dataforseoPostsFetched: 0 })
    expect(writeClusterRun).toHaveBeenCalledWith([])
  })

  it('combines real posts from both sources into one clustered, ranked, written run', async () => {
    fetchYoutubePosts.mockResolvedValue([
      { title: 'Real Video', body: 'brain fog perimenopause is so bad', score: 10, num_comments: 5, created_utc: 0, subreddit: 'youtube:abc123' },
    ])
    fetchDataForSeoQuestionPosts.mockResolvedValue([
      { title: 'how to fix perimenopause brain fog', score: 0, num_comments: 0, created_utc: 0, subreddit: 'dataforseo-question-keywords' },
    ])
    getPreviousTopicPostCount.mockResolvedValue(null)

    const now = new Date('2026-07-13T12:00:00Z')
    const result = await runVocPipeline(now)

    expect(result).toMatchObject({
      runWeek: '2026-W29', topicsRanked: 1, postsFetched: 2,
      youtubePostsFetched: 1, dataforseoPostsFetched: 1,
    })
    expect(writeClusterRun).toHaveBeenCalledTimes(1)
    const rows = writeClusterRun.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      run_week: '2026-W29', topic_key: 'perimenopause_hormonal', rank: 1,
      post_count: 2, trend_pct: null, pipeline_version: VOC_PIPELINE_VERSION,
    })
    // The real YouTube comment (engagement 20) must rank ahead of the
    // score:0 DataForSEO post in sample_quotes.
    expect(rows[0].sample_quotes[0]).toContain('Real Video')
  }, 15_000)

  it('computes a real week-over-week trend_pct when a prior observation exists', async () => {
    fetchYoutubePosts.mockResolvedValue(
      Array.from({ length: 20 }, () => ({ title: 'brain fog perimenopause', score: 1, num_comments: 0, created_utc: 0, subreddit: 'youtube:x' })),
    )
    getPreviousTopicPostCount.mockResolvedValue(10)

    const result = await runVocPipeline(new Date('2026-07-13T12:00:00Z'))
    expect(result.topicsRanked).toBe(1)
    const rows = writeClusterRun.mock.calls[0][0]
    expect(rows[0].trend_pct).toBeCloseTo(((20 - 10) / 10) * 100, 5)
  }, 15_000)

  it('completes with only real DataForSEO data when YouTube alone returns nothing (independent, non-fatal degradation — no shared all-or-nothing gate)', async () => {
    fetchYoutubePosts.mockResolvedValue([])
    fetchDataForSeoQuestionPosts.mockResolvedValue([
      { title: 'how to fix perimenopause brain fog', score: 0, num_comments: 0, created_utc: 0, subreddit: 'dataforseo-question-keywords' },
    ])

    const result = await runVocPipeline(new Date('2026-07-13T12:00:00Z'))
    expect(result).toMatchObject({ topicsRanked: 1, youtubePostsFetched: 0, dataforseoPostsFetched: 1 })
    expect(writeClusterRun).toHaveBeenCalledTimes(1)
  }, 15_000)
})
