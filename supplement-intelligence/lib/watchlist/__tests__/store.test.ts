import { describe, it, expect, vi } from 'vitest'
import { addWatch, listWatches, removeWatch, listAlerts } from '../store'

function mockClient() {
  const single = vi.fn()
  const select2 = vi.fn(() => ({ single }))
  const upsert = vi.fn(() => ({ select: select2 }))

  const order = vi.fn()
  const eqActive = vi.fn(() => ({ order }))
  const eqUser = vi.fn(() => ({ eq: eqActive }))
  const selectList = vi.fn(() => ({ eq: eqUser }))

  const eqUpdate2 = vi.fn()
  const eqUpdate1 = vi.fn(() => ({ eq: eqUpdate2 }))
  const update = vi.fn(() => ({ eq: eqUpdate1 }))

  const limit = vi.fn()
  const orderAlerts = vi.fn(() => ({ limit }))
  const eqAlerts = vi.fn(() => ({ order: orderAlerts }))
  const selectAlerts = vi.fn(() => ({ eq: eqAlerts }))

  const from = vi.fn((table: string) => {
    if (table === 'watchlist_alerts') return { select: selectAlerts }
    return { upsert, select: selectList, update }
  })

  return { from, single, order, eqUpdate2, limit, upsert, update }
}

describe('addWatch', () => {
  it('upserts on (user_id, analysis_id) and returns the real row', async () => {
    const client = mockClient()
    client.single.mockResolvedValue({ data: { id: 'w1', analysis_id: 'a1' }, error: null })

    const result = await addWatch(client as never, 'u1', {
      analysisId: 'a1', categoryName: 'Berberine', categoryId: 'supplements',
      lifecycleStageAtWatch: 'Window Open', killCriteria: [],
    })

    expect(result).toEqual({ id: 'w1', analysis_id: 'a1' })
    expect(client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', analysis_id: 'a1', active: true, lifecycle_stage_at_watch: 'Window Open' }),
      { onConflict: 'user_id,analysis_id' },
    )
  })

  it('returns null (never fabricated) on a DB error', async () => {
    const client = mockClient()
    client.single.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const result = await addWatch(client as never, 'u1', {
      analysisId: 'a1', categoryName: 'Berberine', categoryId: 'supplements',
      lifecycleStageAtWatch: null, killCriteria: [],
    })
    expect(result).toBeNull()
  })
})

describe('listWatches', () => {
  it('returns the real active watches for this user', async () => {
    const client = mockClient()
    client.order.mockResolvedValue({ data: [{ id: 'w1' }], error: null })
    const result = await listWatches(client as never, 'u1')
    expect(result).toEqual([{ id: 'w1' }])
  })

  it('returns [] on a DB error', async () => {
    const client = mockClient()
    client.order.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await listWatches(client as never, 'u1')).toEqual([])
  })
})

describe('removeWatch', () => {
  it('soft-deactivates (sets active=false) rather than a hard delete', async () => {
    const client = mockClient()
    client.eqUpdate2.mockResolvedValue({ error: null })
    const ok = await removeWatch(client as never, 'u1', 'w1')
    expect(ok).toBe(true)
    expect(client.update).toHaveBeenCalledWith({ active: false })
  })

  it('returns false on a DB error', async () => {
    const client = mockClient()
    client.eqUpdate2.mockResolvedValue({ error: { message: 'down' } })
    expect(await removeWatch(client as never, 'u1', 'w1')).toBe(false)
  })
})

describe('listAlerts', () => {
  it('returns the real alerts for this user', async () => {
    const client = mockClient()
    client.limit.mockResolvedValue({ data: [{ id: 'alert1' }], error: null })
    const result = await listAlerts(client as never, 'u1')
    expect(result).toEqual([{ id: 'alert1' }])
  })
})
