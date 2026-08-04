// Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md) —
// verifies this route's own sequencing contract: the tracked-3 refresh
// (runScienceIngestionPipeline) always completes BEFORE the queue-drain
// phase (drainScienceIngredientQueue) starts — "tracked-3 priority
// unchanged" from the R&D doc's testing plan (§3.7). Everything downstream
// of these two calls (Discovery/Divergence detection) is out of scope for
// this test — no prior test file existed for this route before this
// milestone.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

const runScienceIngestionPipeline = vi.fn()
const drainScienceIngredientQueue = vi.fn()
const runDiscoveryDetection       = vi.fn()
const runDivergenceDetection      = vi.fn()
const getRecentObservations       = vi.fn()
const getFetchedQueueRowsByDemand = vi.fn()

vi.mock('@/lib/science-engine/pipeline', () => ({
  runScienceIngestionPipeline: (...args: unknown[]) => runScienceIngestionPipeline(...args),
  drainScienceIngredientQueue: (...args: unknown[]) => drainScienceIngredientQueue(...args),
}))
vi.mock('@/lib/science-engine/queue', () => ({
  getFetchedQueueRowsByDemand: (...args: unknown[]) => getFetchedQueueRowsByDemand(...args),
}))
vi.mock('@/lib/discovery-engine/run', () => ({
  runDiscoveryDetection: (...args: unknown[]) => runDiscoveryDetection(...args),
}))
vi.mock('@/lib/divergence-detector/run', () => ({
  runDivergenceDetection: (...args: unknown[]) => runDivergenceDetection(...args),
}))
vi.mock('@/lib/discovery-engine/service-store', () => ({
  getRecentObservations: (...args: unknown[]) => getRecentObservations(...args),
}))

describe('GET /api/cron/science-pipeline', () => {
  const OLD_ENV = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    runScienceIngestionPipeline.mockResolvedValue([
      { ingredient: 'berberine', success: true },
      { ingredient: 'creatine', success: true },
      { ingredient: 'magnesium', success: true },
    ])
    drainScienceIngredientQueue.mockResolvedValue({ drained: [], skippedForBudget: 0, timeExhausted: false })
    getFetchedQueueRowsByDemand.mockResolvedValue([])
    getRecentObservations.mockResolvedValue([])
    runDiscoveryDetection.mockResolvedValue([])
    runDivergenceDetection.mockResolvedValue([])
  })

  afterAll(() => { process.env.CRON_SECRET = OLD_ENV })

  it('runs the tracked-3 refresh to completion before starting the queue drain (tracked-3 priority unchanged)', async () => {
    const callOrder: string[] = []
    runScienceIngestionPipeline.mockImplementation(async () => {
      callOrder.push('tracked-3-refresh-start')
      await Promise.resolve()
      callOrder.push('tracked-3-refresh-end')
      return [{ ingredient: 'berberine', success: true }]
    })
    drainScienceIngredientQueue.mockImplementation(async () => {
      callOrder.push('queue-drain')
      return { drained: [], skippedForBudget: 0, timeExhausted: false }
    })

    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/cron/science-pipeline', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(callOrder).toEqual(['tracked-3-refresh-start', 'tracked-3-refresh-end', 'queue-drain'])
  })

  it('includes the queue drain result in the response and log payload', async () => {
    drainScienceIngredientQueue.mockResolvedValue({ drained: ['ashwagandha'], skippedForBudget: 2, timeExhausted: false })

    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/cron/science-pipeline', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(body.queueDrain).toEqual({ drained: ['ashwagandha'], skippedForBudget: 2, timeExhausted: false })
  })

  it('fails closed (401) without a valid CRON_SECRET, and never even calls the pipeline', async () => {
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/cron/science-pipeline', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(runScienceIngestionPipeline).not.toHaveBeenCalled()
    expect(drainScienceIngredientQueue).not.toHaveBeenCalled()
  })
})

// ── Dynamic Detection Coverage (docs/RD_DYNAMIC_DETECTION_COVERAGE.md) ──────
describe('detection candidate widening', () => {
  const FRESH = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()      // 2h ago
  const STALE = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()     // 3 days ago
  const qRow = (ingredient: string, fetched_at: string | null, request_count = 1) =>
    ({ ingredient, fetched_at, first_requested_at: STALE, last_requested_at: FRESH, request_count })

  async function run() {
    const { GET } = await import('../route')
    const req = new NextRequest('http://localhost/api/cron/science-pipeline', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    return { res, body: await res.json() }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    runScienceIngestionPipeline.mockResolvedValue([
      { ingredient: 'berberine', success: true },
      { ingredient: 'creatine', success: true },
      { ingredient: 'magnesium', success: true },
    ])
    drainScienceIngredientQueue.mockResolvedValue({ drained: [], skippedForBudget: 0, timeExhausted: false })
    getRecentObservations.mockResolvedValue([])
    runDiscoveryDetection.mockResolvedValue({ candidatesChecked: 0, seriesEvaluated: 0, alertsRecorded: 0 })
    runDivergenceDetection.mockResolvedValue({ candidatesChecked: 0, seriesEvaluated: 0, alertsRecorded: 0 })
  })

  it('widens candidates to tracked-3 + FRESH queue ingredients only (stale/null fetched_at excluded)', async () => {
    getFetchedQueueRowsByDemand.mockResolvedValue([
      qRow('ashwagandha', FRESH, 9),
      qRow('lions mane', STALE, 5),      // refreshed too long ago — unchanged series must not rescan
      qRow('rhodiola', null, 3),          // defensive: null fetched_at never scans
      qRow('berberine', FRESH, 2),        // tracked ingredient — deduped defensively
    ])
    const { body } = await run()
    expect(body.detectionCandidates).toEqual(['berberine', 'creatine', 'magnesium', 'ashwagandha'])
    expect(runDiscoveryDetection.mock.calls[0][0]).toEqual(['berberine', 'creatine', 'magnesium', 'ashwagandha'])
    expect(runDivergenceDetection.mock.calls[0][0]).toEqual(['berberine', 'creatine', 'magnesium', 'ashwagandha'])
    // one observations read per candidate, shared by both detectors
    expect(getRecentObservations).toHaveBeenCalledTimes(4)
  })

  it('falls back to tracked-3 only when the drain hit the route elapsed ceiling', async () => {
    drainScienceIngredientQueue.mockResolvedValue({ drained: [], skippedForBudget: 3, timeExhausted: true })
    getFetchedQueueRowsByDemand.mockResolvedValue([qRow('ashwagandha', FRESH, 9)])
    const { body } = await run()
    expect(body.detectionCandidates).toEqual(['berberine', 'creatine', 'magnesium'])
    expect(getFetchedQueueRowsByDemand).not.toHaveBeenCalled()
  })

  it('queue-read failure degrades to tracked-3 only and never fails the route', async () => {
    getFetchedQueueRowsByDemand.mockResolvedValue([])   // queue.ts returns [] on any error by contract
    const { res, body } = await run()
    expect(res.status).toBe(200)
    expect(body.detectionCandidates).toEqual(['berberine', 'creatine', 'magnesium'])
  })
})
