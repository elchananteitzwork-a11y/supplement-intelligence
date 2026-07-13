// Reddit OAuth2 token helper tests — Roadmap M2.7 (extracted from
// lib/signal-engine/providers/reddit.ts). No live network calls — mocked
// global fetch, matching this codebase's established convention.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRedditAccessToken, redditUserAgent } from '../token'

const ORIGINAL_ENV = { ...process.env }

describe('fetchRedditAccessToken', () => {
  beforeEach(() => {
    process.env.REDDIT_CLIENT_ID     = 'test-id'
    process.env.REDDIT_CLIENT_SECRET = 'test-secret'
    process.env.REDDIT_USERNAME      = 'testbot'
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it('returns null (never a fabricated token) when credentials are not configured', async () => {
    delete process.env.REDDIT_CLIENT_ID
    delete process.env.REDDIT_CLIENT_SECRET
    const fetchSpy = vi.spyOn(global, 'fetch')
    expect(await fetchRedditAccessToken()).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns a real access token from a successful response, with a 60s expiry margin', async () => {
    const before = Date.now()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: () => Promise.resolve({ access_token: 'tok_123', expires_in: 3600 }),
    } as Response)
    const token = await fetchRedditAccessToken()
    expect(token?.value).toBe('tok_123')
    expect(token?.expires).toBeGreaterThanOrEqual(before + 3540 * 1000)
    expect(token?.expires).toBeLessThanOrEqual(Date.now() + 3540 * 1000 + 100)
  })

  it('posts client_credentials grant with Basic auth built from the real env credentials', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: () => Promise.resolve({ access_token: 'tok_abc', expires_in: 3600 }),
    } as Response)
    await fetchRedditAccessToken()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://www.reddit.com/api/v1/access_token')
    expect(init?.body).toBe('grant_type=client_credentials')
    const expectedAuth = `Basic ${Buffer.from('test-id:test-secret').toString('base64')}`
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(expectedAuth)
  })

  it('returns null on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response)
    expect(await fetchRedditAccessToken()).toBeNull()
  })

  it('returns null when the response has no access_token', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve({ error: 'invalid_grant' }) } as Response)
    expect(await fetchRedditAccessToken()).toBeNull()
  })

  it('returns null on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchRedditAccessToken()).toBeNull()
  })
})

describe('redditUserAgent', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('includes the configured REDDIT_USERNAME', () => {
    process.env.REDDIT_USERNAME = 'my_real_username'
    expect(redditUserAgent()).toContain('my_real_username')
  })

  it('falls back to "bot" when REDDIT_USERNAME is unset', () => {
    delete process.env.REDDIT_USERNAME
    expect(redditUserAgent()).toContain('/u/bot')
  })
})
