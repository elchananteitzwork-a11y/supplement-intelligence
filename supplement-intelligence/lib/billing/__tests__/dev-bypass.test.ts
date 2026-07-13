import { describe, it, expect, afterEach, vi } from 'vitest'
import { isDevUnlimitedAnalysesEnabled } from '../dev-bypass'

// NODE_ENV is typed read-only on process.env — vi.stubEnv is the
// type-safe way to override it per test; vi.unstubAllEnvs() restores the
// real value afterward. DEV_UNLIMITED_ANALYSES isn't read-only, but is
// stubbed the same way here for consistency within this file.

describe('isDevUnlimitedAnalysesEnabled — production fails closed', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('is false in production even when DEV_UNLIMITED_ANALYSES="true"', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', 'true')
    expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
  })

  it('is false in production when the env var is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', undefined)
    expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
  })

  it('is false in production for any malformed/truthy-looking value', () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const malformed of ['TRUE', '1', 'yes', 'True ', '']) {
      vi.stubEnv('DEV_UNLIMITED_ANALYSES', malformed)
      expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
    }
  })

  it('warns loudly (but still returns false) when the flag is left on in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', 'true')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NO EFFECT'))
    warnSpy.mockRestore()
  })

  it('does not warn in production when the flag is simply absent (no misconfiguration to report)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    isDevUnlimitedAnalysesEnabled()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('isDevUnlimitedAnalysesEnabled — local development convenience is preserved', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('is true in development when explicitly set to "true"', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', 'true')
    expect(isDevUnlimitedAnalysesEnabled()).toBe(true)
  })

  it('is false in development when the env var is missing — never guessed on', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', undefined)
    expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
  })

  it('is false in development for any malformed/truthy-looking value — exact match only', () => {
    vi.stubEnv('NODE_ENV', 'development')
    for (const malformed of ['TRUE', '1', 'yes', 'true ', ' true']) {
      vi.stubEnv('DEV_UNLIMITED_ANALYSES', malformed)
      expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
    }
  })

  it('is true for any non-production NODE_ENV (e.g. "test"), not only "development"', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', 'true')
    expect(isDevUnlimitedAnalysesEnabled()).toBe(true)
  })

  it('is false outside production when the flag is unset regardless of NODE_ENV value', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DEV_UNLIMITED_ANALYSES', undefined)
    expect(isDevUnlimitedAnalysesEnabled()).toBe(false)
  })
})
