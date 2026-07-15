// Science pipeline tests — Roadmap M2.5.
//
// computePublicationVelocity is tested against real PubMed data (fetched
// live 2026-07-13 for berberine: 2019:523, 2020:652, 2021:718, 2022:726,
// 2023:683, 2024:796, 2025:946 — confirmed via live esearch.fcgi calls
// before writing this pipeline) rather than an invented fixture series.
// ingestScienceSignal/runScienceIngestionPipeline are tested against mocked
// pubmed/clinicaltrials/provider-cache modules — no live network calls in
// this suite (the live validation already happened separately, out-of-band,
// documented in the roadmap completion note).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computePublicationVelocity, ingestScienceSignal, runScienceIngestionPipeline } from '../pipeline'

const fetchPublicationCountsByYear = vi.fn()
const fetchTrialRegistrationsCount = vi.fn()
const fetchStrongestEvidenceType   = vi.fn()
const fetchTrialDesignBreakdown    = vi.fn()
const cacheSet = vi.fn().mockResolvedValue(undefined)
const appendObservations = vi.fn().mockResolvedValue(undefined)

vi.mock('../pubmed', () => ({
  fetchPublicationCountsByYear: (...args: unknown[]) => fetchPublicationCountsByYear(...args),
  fetchStrongestEvidenceType:   (...args: unknown[]) => fetchStrongestEvidenceType(...args),
}))
vi.mock('../clinicaltrials', () => ({
  fetchTrialRegistrationsCount: (...args: unknown[]) => fetchTrialRegistrationsCount(...args),
  fetchTrialDesignBreakdown:    (...args: unknown[]) => fetchTrialDesignBreakdown(...args),
}))
vi.mock('@/lib/provider-cache', () => ({ cacheSet: (...args: unknown[]) => cacheSet(...args) }))
vi.mock('@/lib/niche-timeseries/store', () => ({ appendObservations: (...args: unknown[]) => appendObservations(...args) }))

describe('computePublicationVelocity — real berberine PubMed data', () => {
  it('computes velocity from the last two complete years actually present (2024 vs 2023: 796 vs 683)', () => {
    const real = { '2019': 523, '2020': 652, '2021': 718, '2022': 726, '2023': 683, '2024': 796 }
    const v = computePublicationVelocity(real)
    expect(v.velocity_pct).toBeCloseTo(((796 - 683) / 683) * 100, 1)
    expect(v.trend).toBe('Accelerating')   // +16.5% > the 15% threshold
  })

  it('never fabricates a comparison when fewer than two years exist', () => {
    expect(computePublicationVelocity({ '2024': 796 })).toEqual({ velocity_pct: null, trend: undefined })
    expect(computePublicationVelocity({})).toEqual({ velocity_pct: null, trend: undefined })
  })

  it('classifies Stable within the threshold band and Declining below it', () => {
    expect(computePublicationVelocity({ '2023': 100, '2024': 105 }).trend).toBe('Stable')   // +5%
    expect(computePublicationVelocity({ '2023': 100, '2024': 80 }).trend).toBe('Declining')  // -20%
  })

  it('is picked from the two most recent years even when the record has more history', () => {
    const v = computePublicationVelocity({ '2019': 1, '2020': 999, '2023': 200, '2024': 100 })
    // Should compare 2024 vs 2023 (100 vs 200 = -50%), not 2020 vs 2019.
    expect(v.velocity_pct).toBeCloseTo(-50, 1)
    expect(v.trend).toBe('Declining')
  })
})

describe('ingestScienceSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheSet.mockResolvedValue(undefined)
    appendObservations.mockResolvedValue(undefined)
    // Roadmap M2.16 additive calls — default to "found nothing" so existing
    // tests that don't care about them stay unaffected.
    fetchStrongestEvidenceType.mockResolvedValue(null)
    fetchTrialDesignBreakdown.mockResolvedValue(null)
  })

  it('writes a real, complete ScienceSignal to the cache when both real sources succeed', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 683, '2024': 796 })
    fetchTrialRegistrationsCount.mockResolvedValue(133)

    const result = await ingestScienceSignal('berberine')
    expect(result).toEqual({ ingredient: 'berberine', success: true })
    expect(cacheSet).toHaveBeenCalledTimes(1)
    const [key, provider, payload] = cacheSet.mock.calls[0]
    expect(key).toBe('science:v1:berberine')
    expect(provider).toBe('science-pipeline')
    expect(payload).toMatchObject({
      ingredient: 'berberine',
      publication_counts_by_year: { '2023': 683, '2024': 796 },
      trial_registrations_count: 133,
      publication_trend: 'Accelerating',
    })
  })

  it('still writes a partial, honest signal when only one real source succeeds', async () => {
    fetchPublicationCountsByYear.mockResolvedValue(null)
    fetchTrialRegistrationsCount.mockResolvedValue(50)

    const result = await ingestScienceSignal('creatine')
    expect(result.success).toBe(true)
    const payload = cacheSet.mock.calls[0][2] as Record<string, unknown>
    expect(payload.publication_counts_by_year).toBeUndefined()
    expect(payload.publication_velocity_pct).toBeUndefined()
    expect(payload.trial_registrations_count).toBe(50)
  })

  it('fails (never writes a fabricated cache entry) when both real sources fail', async () => {
    fetchPublicationCountsByYear.mockResolvedValue(null)
    fetchTrialRegistrationsCount.mockResolvedValue(null)

    const result = await ingestScienceSignal('magnesium')
    expect(result.success).toBe(false)
    expect(cacheSet).not.toHaveBeenCalled()
  })

  it('Roadmap M2.15: calls PubMed/ClinicalTrials.gov with the registry\'s canonicalSearchTerm for a real tracked ingredient', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 100, '2024': 110 })
    fetchTrialRegistrationsCount.mockResolvedValue(10)

    await ingestScienceSignal('magnesium')
    expect(fetchPublicationCountsByYear).toHaveBeenCalledWith('magnesium', 6, expect.any(Date))
    expect(fetchTrialRegistrationsCount).toHaveBeenCalledWith('magnesium')
  })

  it('Roadmap M2.15: falls back to the bare ingredient string (never throws) for an ingredient not in the registry', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 10, '2024': 11 })
    fetchTrialRegistrationsCount.mockResolvedValue(1)

    const result = await ingestScienceSignal('ashwagandha')
    expect(result.success).toBe(true)
    expect(fetchPublicationCountsByYear).toHaveBeenCalledWith('ashwagandha', 6, expect.any(Date))
    expect(fetchTrialRegistrationsCount).toHaveBeenCalledWith('ashwagandha')
  })

  it('Roadmap M2.16: populates the real evidence-type and trial-design fields on the cached signal', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 100, '2024': 110 })
    fetchTrialRegistrationsCount.mockResolvedValue(10)
    fetchStrongestEvidenceType.mockResolvedValue({ strongest_evidence_type: 'Meta-Analysis', evidence_sample_size: 20 })
    fetchTrialDesignBreakdown.mockResolvedValue({ trial_study_types: { interventional: 6, observational: 2 }, trial_max_phase_reached: 'PHASE3' })

    await ingestScienceSignal('berberine')
    const payload = cacheSet.mock.calls[0][2] as Record<string, unknown>
    expect(payload).toMatchObject({
      strongest_evidence_type: 'Meta-Analysis',
      evidence_sample_size: 20,
      trial_study_types: { interventional: 6, observational: 2 },
      trial_max_phase_reached: 'PHASE3',
    })
    expect(appendObservations).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ metric: 'evidence_sample_size', value: 20 }),
      expect.objectContaining({ metric: 'trial_interventional_count', value: 6 }),
      expect.objectContaining({ metric: 'trial_observational_count', value: 2 }),
    ]))
  })

  it('Roadmap M2.16: never blocks a successful signal when the new evidence-type/trial-design calls fail (additive, non-fatal)', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 100, '2024': 110 })
    fetchTrialRegistrationsCount.mockResolvedValue(10)
    fetchStrongestEvidenceType.mockResolvedValue(null)
    fetchTrialDesignBreakdown.mockResolvedValue(null)

    const result = await ingestScienceSignal('creatine')
    expect(result.success).toBe(true)
    const payload = cacheSet.mock.calls[0][2] as Record<string, unknown>
    expect(payload.strongest_evidence_type).toBeUndefined()
    expect(payload.trial_study_types).toBeUndefined()
    expect(payload.trial_max_phase_reached).toBeUndefined()
  })
})

describe('runScienceIngestionPipeline', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('runs every tracked ingredient sequentially and reports a result for each', async () => {
    fetchPublicationCountsByYear.mockResolvedValue({ '2023': 100, '2024': 110 })
    fetchTrialRegistrationsCount.mockResolvedValue(10)

    const results = await runScienceIngestionPipeline()
    expect(results).toHaveLength(3)   // berberine, creatine, magnesium
    expect(results.every(r => r.success)).toBe(true)
    expect(cacheSet).toHaveBeenCalledTimes(3)
  })
})
