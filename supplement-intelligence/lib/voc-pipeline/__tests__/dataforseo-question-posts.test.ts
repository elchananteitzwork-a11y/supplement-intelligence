import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchRelatedKeywords = vi.fn()
vi.mock('@/lib/keyword-engine/dataforseo', () => ({ fetchRelatedKeywords: (...args: unknown[]) => fetchRelatedKeywords(...args) }))

const ORIGINAL_ENV = { ...process.env }

describe('dataforseo-question-posts (Roadmap M2.13)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATAFORSEO_LOGIN = 'test-login'
    process.env.DATAFORSEO_PASSWORD = 'test-password'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('returns [] (no real call attempted) when DataForSEO credentials are unset', async () => {
    delete process.env.DATAFORSEO_LOGIN
    const { fetchDataForSeoQuestionPostsForSeed } = await import('../dataforseo-question-posts')
    expect(await fetchDataForSeoQuestionPostsForSeed('gut health', new Date())).toEqual([])
    expect(fetchRelatedKeywords).not.toHaveBeenCalled()
  })

  it('returns [] (never fabricated) when the real call fails', async () => {
    fetchRelatedKeywords.mockResolvedValue(null)
    const { fetchDataForSeoQuestionPostsForSeed } = await import('../dataforseo-question-posts')
    expect(await fetchDataForSeoQuestionPostsForSeed('gut health', new Date())).toEqual([])
  })

  it('filters to real problem-language keywords only, mapped with score:0/num_comments:0 — no invented engagement number', async () => {
    fetchRelatedKeywords.mockResolvedValue([
      { keyword: 'how to fix bloating naturally', monthly_searches: 2400, growth_pct: null, competition: null, difficulty: null, cpc: null },
      { keyword: 'best probiotic brand', monthly_searches: 9000, growth_pct: null, competition: null, difficulty: null, cpc: null },   // not problem-language, excluded
      { keyword: 'gut health symptoms explained', monthly_searches: 500, growth_pct: null, competition: null, difficulty: null, cpc: null },
    ])
    const { fetchDataForSeoQuestionPostsForSeed } = await import('../dataforseo-question-posts')
    const now = new Date('2026-07-14T08:00:00Z')
    const posts = await fetchDataForSeoQuestionPostsForSeed('gut health', now)

    expect(posts).toHaveLength(2)
    expect(posts.every(p => p.score === 0 && p.num_comments === 0)).toBe(true)
    expect(posts.every(p => p.subreddit === 'dataforseo-question-keywords')).toBe(true)
    expect(posts.map(p => p.title)).toEqual(['how to fix bloating naturally', 'gut health symptoms explained'])
    expect(posts[0].created_utc).toBe(Math.floor(now.getTime() / 1000))
  })

  it('fetchDataForSeoQuestionPosts is category-agnostic: takes seeds as a parameter, contains no fixed topic import', async () => {
    fetchRelatedKeywords.mockResolvedValue(null)
    const { fetchDataForSeoQuestionPosts } = await import('../dataforseo-question-posts')
    const posts = await fetchDataForSeoQuestionPosts(['some-beauty-seed', 'some-pets-seed'])
    expect(fetchRelatedKeywords).toHaveBeenCalledWith('some-beauty-seed')
    expect(fetchRelatedKeywords).toHaveBeenCalledWith('some-pets-seed')
    expect(posts).toEqual([])
  })
})
