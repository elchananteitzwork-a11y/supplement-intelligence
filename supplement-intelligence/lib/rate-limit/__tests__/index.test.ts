import { describe, it, expect, vi, afterEach } from 'vitest'

const memoryMock = vi.fn()
const redisMock  = vi.fn()

vi.mock('../memory-store', () => ({ checkRateLimitInMemory: memoryMock }))
vi.mock('../redis-store',  () => ({ checkRateLimitRedis: redisMock }))

describe('checkRateLimit — backend selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    memoryMock.mockReset()
    redisMock.mockReset()
    vi.resetModules()
  })

  it('uses the distributed Redis store in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    redisMock.mockResolvedValue(true)
    const { checkRateLimit } = await import('../index')

    const result = await checkRateLimit('user-1', 5, 60_000)

    expect(result).toBe(true)
    expect(redisMock).toHaveBeenCalledWith('user-1', 5, 60_000)
    expect(memoryMock).not.toHaveBeenCalled()
  })

  it('uses the in-memory store outside production (development)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    memoryMock.mockReturnValue(true)
    const { checkRateLimit } = await import('../index')

    const result = await checkRateLimit('user-2', 5, 60_000)

    expect(result).toBe(true)
    expect(memoryMock).toHaveBeenCalledWith('user-2', 5, 60_000)
    expect(redisMock).not.toHaveBeenCalled()
  })

  it('uses the in-memory store outside production (test)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    memoryMock.mockReturnValue(true)
    const { checkRateLimit } = await import('../index')

    await checkRateLimit('user-3', 5, 60_000)

    expect(memoryMock).toHaveBeenCalled()
    expect(redisMock).not.toHaveBeenCalled()
  })

  it('applies the default 60s window when none is passed, regardless of backend', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    redisMock.mockResolvedValue(true)
    const { checkRateLimit } = await import('../index')

    await checkRateLimit('user-4', 5)

    expect(redisMock).toHaveBeenCalledWith('user-4', 5, 60_000)
  })
})

describe('checkRateLimit — re-exported limit constants are unchanged', () => {
  afterEach(() => { vi.resetModules() })

  it('preserves every existing limit value', async () => {
    const {
      DISCOVER_LIMIT, GENERATE_LIMIT, REVIEWS_COLLECT_LIMIT, REVIEWS_ANALYZE_LIMIT,
      REVIEWS_COMPETITIVE_LIMIT, MANUFACTURING_LIMIT, RESEARCH_LIMIT,
    } = await import('../index')

    expect(DISCOVER_LIMIT).toBe(10)
    expect(GENERATE_LIMIT).toBe(3)
    expect(REVIEWS_COLLECT_LIMIT).toBe(5)
    expect(REVIEWS_ANALYZE_LIMIT).toBe(5)
    expect(REVIEWS_COMPETITIVE_LIMIT).toBe(3)
    expect(MANUFACTURING_LIMIT).toBe(5)
    expect(RESEARCH_LIMIT).toBe(5)
  })
})
