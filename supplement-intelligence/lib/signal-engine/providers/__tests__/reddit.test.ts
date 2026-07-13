// RedditProvider tests — Roadmap M2.7 refactor safety net (no dedicated test
// file existed for this provider before; this covers the gating logic and
// confirms the OAuth2 extraction to lib/reddit-client/token.ts didn't change
// observable behavior). No live network calls — mocked global fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RedditProvider } from '../reddit'

const ORIGINAL_ENV = { ...process.env }

describe('RedditProvider', () => {
  beforeEach(() => {
    process.env.REDDIT_CLIENT_ID     = 'test-id'
    process.env.REDDIT_CLIENT_SECRET = 'test-secret'
    process.env.REDDIT_USERNAME      = 'testbot'
    delete process.env.REDDIT_DISABLED
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it('is disabled when credentials are not configured', () => {
    delete process.env.REDDIT_CLIENT_ID
    delete process.env.REDDIT_CLIENT_SECRET
    expect(new RedditProvider().enabled).toBe(false)
  })

  it('is enabled when credentials are configured', () => {
    expect(new RedditProvider().enabled).toBe(true)
  })

  it('is disabled when REDDIT_DISABLED=true even with credentials present', () => {
    process.env.REDDIT_DISABLED = 'true'
    expect(new RedditProvider().enabled).toBe(false)
  })

  it('returns null for a non-supplements category without making any real request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new RedditProvider().fetch({ query: 'dog anxiety', categoryId: 'pets' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null (via the shared token helper) when Reddit token auth fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)
    const result = await new RedditProvider().fetch({ query: 'berberine', categoryId: 'supplements' })
    expect(result).toBeNull()
  })

  it('fetches a real token then searches, returning real computed signals for a sufficiently large result set', async () => {
    const now = Math.floor(Date.now() / 1000)
    const posts = Array.from({ length: 10 }, (_, i) => ({
      data: {
        title: `Struggling with berberine dosing #${i}`, score: 20, upvote_ratio: 0.9,
        num_comments: 5, created_utc: now - i * 86400, subreddit: 'Supplements', is_self: false,
      },
    }))
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { children: posts } }) } as Response)

    const result = await new RedditProvider().fetch({ query: 'berberine', categoryId: 'supplements' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result?.provider).toBe('reddit')
    expect(result?.demand?.score).toBeGreaterThan(0)
  })
})
