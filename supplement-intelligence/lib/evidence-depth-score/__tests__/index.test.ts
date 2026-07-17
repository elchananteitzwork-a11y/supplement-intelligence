// Evidence Depth Score tests — Roadmap M2.21.
//
// Covers the three real coverage scenarios named in the approved R&D
// document (all 6 inputs present, partial 3-ingredient-tracked case with
// only fields 4-6, and minimal non-tracked case) plus the fully-empty
// defensive case.

import { describe, it, expect } from 'vitest'
import { computeEvidenceDepthScore, EVIDENCE_DEPTH_SCORE_VERSION } from '../index'
import type { EvidenceDepthScoreInput } from '../index'
import type { RegulatoryIntelligence } from '@/lib/regulatory-engine/types'

function regulatory(confidence: number): RegulatoryIntelligence {
  return {
    query_term: 'berberine',
    ingredient_searched: 'berberine',
    adverse_events: null,
    recalls: null,
    risk_level: 'Low',
    risk_summary: 'test',
    warning_flags: [],
    confidence,
    data_sources: ['openFDA'],
    fetched_at: new Date().toISOString(),
    disclaimer: 'test disclaimer',
  }
}

describe('computeEvidenceDepthScore', () => {
  it('returns an honest "no evidence depth data available" result for a fully-empty input, without crashing', () => {
    const result = computeEvidenceDepthScore({})
    expect(result.available).toBe(false)
    expect(result.score).toBeUndefined()
    expect(result.coverage).toBe(0)
    expect(result.inputs_available).toEqual([])
    expect(result.contributions).toEqual([])
    expect(result.version).toBe(EVIDENCE_DEPTH_SCORE_VERSION)
  })

  it('computes a full-coverage composite when all 6 inputs are present (tracked ingredient + competitor data)', () => {
    const input: EvidenceDepthScoreInput = {
      ingredient_tracked: true,
      strongest_evidence_type: 'Randomized Controlled Trial',
      market_dose_mg: { median: 500, min: 100, max: 1500 },
      regulatory: regulatory(0.8),
      competitors: [
        { claim_risk_flags: ['cures diabetes'], manufacturer_recall_flags: [{ class: 'II', count: 1 }] },
        { claim_risk_flags: undefined, manufacturer_recall_flags: undefined },
      ],
    }
    const result = computeEvidenceDepthScore(input)

    expect(result.available).toBe(true)
    expect(result.coverage).toBe(1) // 6/6
    expect(result.inputs_available).toEqual([
      'ingredient_canonicalization',
      'strongest_evidence_type',
      'market_dose_mg',
      'regulatory_intelligence',
      'claim_risk_scan',
      'manufacturer_recall_scan',
    ])
    expect(result.contributions).toHaveLength(6)
    expect(result.competitors_scanned).toBe(2)
    expect(result.total_claim_risk_flags).toBe(1)
    expect(result.competitors_with_recall_flags).toBe(1)

    // ingredient_canonicalization=100, RCT rank=2 of 10 -> 80, market_dose_mg=100,
    // regulatory=80, claim_risk_scan=100, manufacturer_recall_scan=100
    // average = (100+80+100+80+100+100)/6 = 93.33... -> rounds to 93
    expect(result.score).toBe(93)
  })

  it('computes a partial composite for a tracked ingredient with no market/regulatory/evidence-type data yet (only fields 1, 5, 6)', () => {
    const input: EvidenceDepthScoreInput = {
      ingredient_tracked: true,
      // science pipeline hasn't populated 2/3 for this ingredient yet
      strongest_evidence_type: undefined,
      market_dose_mg: undefined,
      regulatory: undefined,
      competitors: [{ claim_risk_flags: [], manufacturer_recall_flags: [] }],
    }
    const result = computeEvidenceDepthScore(input)

    expect(result.available).toBe(true)
    expect(result.inputs_available).toEqual([
      'ingredient_canonicalization',
      'claim_risk_scan',
      'manufacturer_recall_scan',
    ])
    expect(result.coverage).toBe(0.5) // 3/6
    // (100 + 100 + 100) / 3 = 100
    expect(result.score).toBe(100)
    expect(result.competitors_scanned).toBe(1)
    expect(result.total_claim_risk_flags).toBe(0)
    expect(result.competitors_with_recall_flags).toBe(0)
  })

  it('computes a minimal composite for a non-tracked-ingredient query with only competitor data (fields 5-6, field 1 = false)', () => {
    const input: EvidenceDepthScoreInput = {
      ingredient_tracked: false,
      competitors: [{ claim_risk_flags: ['relieves pain'] }],
    }
    const result = computeEvidenceDepthScore(input)

    expect(result.available).toBe(true)
    expect(result.inputs_available).toEqual([
      'ingredient_canonicalization',
      'claim_risk_scan',
      'manufacturer_recall_scan',
    ])
    expect(result.coverage).toBe(0.5)
    // (0 + 100 + 100) / 3 = 66.67 -> rounds to 67
    expect(result.score).toBe(67)
  })

  it('excludes an unrecognized strongest_evidence_type string rather than guessing a score', () => {
    const result = computeEvidenceDepthScore({
      ingredient_tracked: true,
      strongest_evidence_type: 'Not A Real PubMed Pubtype',
    })
    expect(result.inputs_available).toEqual(['ingredient_canonicalization'])
    expect(result.coverage).toBe(0.17) // round(1/6, 2)
  })

  it('grades strongest_evidence_type by real PubMed STUDY_TYPE_PRIORITY rank (Meta-Analysis scores highest)', () => {
    const meta = computeEvidenceDepthScore({ strongest_evidence_type: 'Meta-Analysis' })
    const caseReports = computeEvidenceDepthScore({ strongest_evidence_type: 'Case Reports' })
    expect(meta.contributions[0].score).toBeGreaterThan(caseReports.contributions[0].score)
    expect(meta.contributions[0].score).toBe(100)
  })

  it('does not let claim/recall flag counts change the depth score itself, only the disclosure counts', () => {
    const clean = computeEvidenceDepthScore({ competitors: [{}] })
    const flagged = computeEvidenceDepthScore({
      competitors: [{ claim_risk_flags: ['a', 'b', 'c'], manufacturer_recall_flags: [{ class: 'I', count: 3 }] }],
    })
    expect(clean.score).toBe(flagged.score)
    expect(clean.total_claim_risk_flags).toBe(0)
    expect(flagged.total_claim_risk_flags).toBe(3)
    expect(flagged.competitors_with_recall_flags).toBe(1)
  })

  it('never treats an empty competitors array as "scanned"', () => {
    const result = computeEvidenceDepthScore({ ingredient_tracked: true, competitors: [] })
    expect(result.inputs_available).toEqual(['ingredient_canonicalization'])
    expect(result.competitors_scanned).toBeUndefined()
  })

  it('clamps an out-of-range regulatory confidence rather than producing a >100 or <0 score', () => {
    const over = computeEvidenceDepthScore({ regulatory: regulatory(1.5) })
    const under = computeEvidenceDepthScore({ regulatory: regulatory(-0.5) })
    expect(over.contributions[0].score).toBe(100)
    expect(under.contributions[0].score).toBe(0)
  })
})
