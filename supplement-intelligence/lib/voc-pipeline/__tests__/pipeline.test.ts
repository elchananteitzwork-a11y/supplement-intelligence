import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runVocPipeline, isoWeekString, VOC_PIPELINE_VERSION } from '../pipeline'
import { VOC_SEED_SUBREDDITS } from '../subreddits'

const fetchRedditAccessToken = vi.fn()
const fetchWeeklyTopPosts    = vi.fn()
const getPreviousTopicPostCount = vi.fn()
const writeClusterRun = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/reddit-client/token', () => ({ fetchRedditAccessToken: (...args: unknown[]) => fetchRedditAccessToken(...args) }))
vi.mock('../reddit-listing', () => ({ fetchWeeklyTopPosts: (...args: unknown[]) => fetchWeeklyTopPosts(...args) }))
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

describe('runVocPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeClusterRun.mockResolvedValue(undefined)
  })

  it('returns null (never runs partially against a fabricated token) when Reddit auth fails', async () => {
    fetchRedditAccessToken.mockResolvedValue(null)
    const result = await runVocPipeline()
    expect(result).toBeNull()
    expect(fetchWeeklyTopPosts).not.toHaveBeenCalled()
    expect(writeClusterRun).not.toHaveBeenCalled()
  })

  it('fetches every seed subreddit sequentially, clusters real posts, and writes ranked rows', async () => {
    fetchRedditAccessToken.mockResolvedValue({ value: 'tok', expires: Date.now() + 3600_000 })
    fetchWeeklyTopPosts.mockImplementation(async (subreddit: string) => {
      if (subreddit === 'Menopause') {
        return [{ title: 'brain fog perimenopause', score: 10, num_comments: 5, created_utc: 0, subreddit: 'Menopause' }]
      }
      return []
    })
    getPreviousTopicPostCount.mockResolvedValue(null)

    const now = new Date('2026-07-13T12:00:00Z')
    const result = await runVocPipeline(now)

    expect(fetchWeeklyTopPosts).toHaveBeenCalledTimes(VOC_SEED_SUBREDDITS.length)
    expect(result).toMatchObject({ runWeek: '2026-W29', topicsRanked: 1, postsFetched: 1, subredditsOk: 1 })
    expect(writeClusterRun).toHaveBeenCalledTimes(1)
    const rows = writeClusterRun.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      run_week: '2026-W29', topic_key: 'perimenopause_hormonal', rank: 1,
      trend_pct: null, pipeline_version: VOC_PIPELINE_VERSION,
    })
  }, 15_000)

  it('computes a real week-over-week trend_pct when a prior observation exists', async () => {
    fetchRedditAccessToken.mockResolvedValue({ value: 'tok', expires: Date.now() + 3600_000 })
    fetchWeeklyTopPosts.mockImplementation(async (subreddit: string) => {
      if (subreddit === 'Menopause') {
        return Array.from({ length: 20 }, () => ({ title: 'brain fog perimenopause', score: 1, num_comments: 0, created_utc: 0, subreddit: 'Menopause' }))
      }
      return []
    })
    getPreviousTopicPostCount.mockResolvedValue(10)

    const result = await runVocPipeline(new Date('2026-07-13T12:00:00Z'))
    expect(result?.topicsRanked).toBe(1)
    const rows = writeClusterRun.mock.calls[0][0]
    expect(rows[0].trend_pct).toBeCloseTo(((20 - 10) / 10) * 100, 5)
  }, 15_000)

  it('degrades honestly (subredditsFailed counted) when some subreddits return no real posts', async () => {
    fetchRedditAccessToken.mockResolvedValue({ value: 'tok', expires: Date.now() + 3600_000 })
    fetchWeeklyTopPosts.mockResolvedValue([])
    getPreviousTopicPostCount.mockResolvedValue(null)

    const result = await runVocPipeline(new Date('2026-07-13T12:00:00Z'))
    expect(result).toMatchObject({ topicsRanked: 0, postsFetched: 0, subredditsOk: 0, subredditsFailed: VOC_SEED_SUBREDDITS.length })
    expect(writeClusterRun).toHaveBeenCalledWith([])
  }, 15_000)
})
