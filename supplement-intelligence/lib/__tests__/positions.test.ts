import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isPositionState,
  isProductEventName,
  fetchPositions,
  upsertPosition,
  logEvent,
  POSITION_STATES,
  PRODUCT_EVENTS,
} from '../positions'

// ── Pure validator guards ─────────────────────────────────────────────────

describe('isPositionState', () => {
  it('accepts every real state', () => {
    for (const s of POSITION_STATES) expect(isPositionState(s)).toBe(true)
  })
  it('rejects unrelated strings, non-strings, and undefined', () => {
    expect(isPositionState('archived')).toBe(false)
    expect(isPositionState('')).toBe(false)
    expect(isPositionState(42)).toBe(false)
    expect(isPositionState(null)).toBe(false)
    expect(isPositionState(undefined)).toBe(false)
  })
})

describe('isProductEventName', () => {
  it('accepts every real Phase-1 gate event', () => {
    for (const e of PRODUCT_EVENTS) expect(isProductEventName(e)).toBe(true)
  })
  it('rejects any event outside the closed Phase-1 set (no third-party analytics scope creep)', () => {
    expect(isProductEventName('page_view')).toBe(false)
    expect(isProductEventName('button_clicked')).toBe(false)
    expect(isProductEventName(123)).toBe(false)
    expect(isProductEventName(undefined)).toBe(false)
  })
})

// ── Fetch wrappers ─────────────────────────────────────────────────────────

describe('fetchPositions / upsertPosition / logEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchPositions returns the real parsed body on a 200', async () => {
    const body = { positions: [{ analysisId: 'a1', state: 'validating', successMetrics: null, killReason: null, createdAt: '2026-01-01', categoryName: 'Magnesium', decision: 'BUILD_NOW' }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
    const result = await fetchPositions()
    expect(result).toEqual(body)
  })

  it('fetchPositions throws the real server error string (e.g. a 503 pending-migration message), never swallows it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Positions are not yet available' }), { status: 503 })))
    await expect(fetchPositions()).rejects.toThrow('Positions are not yet available')
  })

  it('upsertPosition POSTs the exact input shape and returns the real position', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ position: { analysisId: 'a1', state: 'watching' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await upsertPosition({ analysisId: 'a1', state: 'watching' })
    expect(result).toEqual({ position: { analysisId: 'a1', state: 'watching' } })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ analysisId: 'a1', state: 'watching' })
  })

  it('logEvent resolves on a 204 with no body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(logEvent({ event: 'claim_tapped', analysisId: 'a1' })).resolves.toBeUndefined()
  })

  it('logEvent throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    await expect(logEvent({ event: 'verdict_viewed' })).rejects.toThrow('Unauthorized')
  })
})
