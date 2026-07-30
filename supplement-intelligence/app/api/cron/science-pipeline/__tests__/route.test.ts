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

vi.mock('@/lib/science-engine/pipeline', () => ({
  runScienceIngestionPipeline: (...args: unknown[]) => runScienceIngestionPipeline(...args),
  drainScienceIngredientQueue: (...args: unknown[]) => drainScienceIngredientQueue(...args),
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
