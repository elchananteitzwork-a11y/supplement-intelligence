// llm-cost-rate-governance retrofit tests (item ג, docs/RD_V4_COMPETITIVE_REVIEWS.md
// §3.3): the ClaudeProvider call boundary must retry transient failures
// boundedly, never retry credit exhaustion, and classify both into honest,
// user-showable messages instead of raw SDK throws.

import { describe, it, expect, vi } from 'vitest'
import { ClaudeProvider } from '../ai/claude'

function apiError(status: number, message: string) {
  const e = new Error(message) as Error & { status: number }
  e.status = status
  return e
}

const OK_RESPONSE = {
  content: [{ type: 'text', text: 'ok' }],
  usage: { input_tokens: 10, output_tokens: 5 },
}

function providerWithMock(create: ReturnType<typeof vi.fn>) {
  const provider = new ClaudeProvider('test-key')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(provider as any).client = { messages: { create } }
  return provider
}

const OPTS = { messages: [{ role: 'user' as const, content: 'x' }] }

describe('ClaudeProvider.complete — bounded retry & classification', () => {
  it('retries a 429 with backoff and succeeds on a later attempt', async () => {
    vi.useFakeTimers()
    try {
      const create = vi.fn()
        .mockRejectedValueOnce(apiError(429, 'rate limited'))
        .mockResolvedValueOnce(OK_RESPONSE)
      const p = providerWithMock(create)
      const done = p.complete(OPTS)
      await vi.runAllTimersAsync()
      const result = await done
      expect(result.content).toBe('ok')
      expect(create).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up after 3 attempts on persistent 429 with a classified message — never indefinite', async () => {
    vi.useFakeTimers()
    try {
      const create = vi.fn().mockRejectedValue(apiError(429, 'rate limited'))
      const p = providerWithMock(create)
      const done = p.complete(OPTS)
      const assertion = expect(done).rejects.toThrow(/rate limit reached/i)
      await vi.runAllTimersAsync()
      await assertion
      expect(create).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('NEVER retries credit exhaustion and classifies it (the real past incident)', async () => {
    const create = vi.fn().mockRejectedValue(apiError(400, 'Your credit balance is too low to access the Anthropic API'))
    const p = providerWithMock(create)
    await expect(p.complete(OPTS)).rejects.toThrow(/credits exhausted/i)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('propagates non-transient errors unchanged without retrying', async () => {
    const create = vi.fn().mockRejectedValue(apiError(400, 'invalid_request: bad schema'))
    const p = providerWithMock(create)
    await expect(p.complete(OPTS)).rejects.toThrow('invalid_request: bad schema')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('retries 5xx/overloaded as transient', async () => {
    vi.useFakeTimers()
    try {
      const create = vi.fn()
        .mockRejectedValueOnce(apiError(529, 'Overloaded'))
        .mockResolvedValueOnce(OK_RESPONSE)
      const p = providerWithMock(create)
      const done = p.complete(OPTS)
      await vi.runAllTimersAsync()
      await expect(done).resolves.toMatchObject({ content: 'ok' })
      expect(create).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
