import { describe, it, expect, afterEach, vi } from 'vitest'
import { isErrorMonitoringEnabled, buildSentryInitOptions } from '../sentry-config'

describe('isErrorMonitoringEnabled', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('is false when NEXT_PUBLIC_SENTRY_DSN is unset — safe by default', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined)
    expect(isErrorMonitoringEnabled()).toBe(false)
  })

  it('is true when NEXT_PUBLIC_SENTRY_DSN is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0')
    expect(isErrorMonitoringEnabled()).toBe(true)
  })
})

describe('buildSentryInitOptions', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('passes dsn=undefined through untouched when unconfigured — Sentry.init no-ops on this, never a guessed value', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined)
    expect(buildSentryInitOptions().dsn).toBeUndefined()
  })

  it('uses the real configured DSN', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0')
    expect(buildSentryInitOptions().dsn).toBe('https://public@o0.ingest.sentry.io/0')
  })

  it('never enables performance tracing — error capture only, in scope for this fix', () => {
    expect(buildSentryInitOptions().tracesSampleRate).toBe(0)
  })

  it('always includes the console-capture integration, so every existing console.error() call reports automatically', () => {
    const options = buildSentryInitOptions()
    expect(Array.isArray(options.integrations)).toBe(true)
    const integrations = options.integrations as { name: string }[]
    expect(integrations).toHaveLength(1)
    expect(integrations[0].name).toBe('CaptureConsole')
  })

  it('tags the environment from VERCEL_ENV when present', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(buildSentryInitOptions().environment).toBe('preview')
  })

  it('falls back to NODE_ENV when VERCEL_ENV is absent', () => {
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    expect(buildSentryInitOptions().environment).toBe('production')
  })

  it('falls back to "development" when neither is set', () => {
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('NODE_ENV', undefined)
    expect(buildSentryInitOptions().environment).toBe('development')
  })
})
