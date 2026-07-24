import { describe, it, expect } from 'vitest'
import { normalizeCategoryKey, compareScoringVersion, supersedeAnalyses, buildOpportunities, type OpportunityRow } from '../opportunities'

// Fixtures below are the real conflicting-verdict groups confirmed live
// against production on 2026-07-24 (docs/RD_V4_PHASE2.md §4 risk 5) — same
// user, same normalized category, different build_decision, caused by
// scoring_version drift (2.2.0 → 2.11.0) and same-version pipeline
// non-determinism. IDs/timestamps are the real ones observed; category
// names/scores are real, user_id omitted (not needed — supersedeAnalyses
// operates on an already user-scoped row set).

describe('normalizeCategoryKey', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeCategoryKey('  Berberine   Blood Sugar Support  ')).toBe('berberine blood sugar support')
  })
})

describe('compareScoringVersion', () => {
  it('compares as a real semver tuple, not a string', () => {
    // "2.10.0" < "2.2.0" lexicographically — the exact bug this rule exists to avoid.
    expect(compareScoringVersion('2.10.0', '2.2.0')).toBeGreaterThan(0)
    expect(compareScoringVersion('2.2.0', '2.10.0')).toBeLessThan(0)
    expect(compareScoringVersion('2.7.0', '2.7.0')).toBe(0)
  })

  it('treats null as lower than any real version', () => {
    expect(compareScoringVersion(null, '2.2.0')).toBeLessThan(0)
    expect(compareScoringVersion('2.2.0', null)).toBeGreaterThan(0)
    expect(compareScoringVersion(null, null)).toBe(0)
  })
})

describe('supersedeAnalyses — real 2026-07-24 conflicting groups', () => {
  it('glp-1 digestive support: null-version rows lose to the one real scoring_version row', () => {
    const rows: OpportunityRow[] = [
      { id: '831569dc', categoryName: 'GLP-1 Digestive Support', scoringVersion: null,     buildDecision: 'BUILD_NOW',         opportunityScore: 74, createdAt: '2026-06-23T05:45:38.030077+00:00' },
      { id: 'c37fc0b9', categoryName: 'GLP-1 Digestive Support', scoringVersion: null,     buildDecision: 'BUILD_NOW',         opportunityScore: 72, createdAt: '2026-06-24T20:24:27.947902+00:00' },
      { id: '6155bcb8', categoryName: 'GLP-1 Digestive Support', scoringVersion: null,     buildDecision: 'BUILD_NOW',         opportunityScore: 74, createdAt: '2026-06-24T20:24:58.711079+00:00' },
      { id: 'b306fde3', categoryName: 'GLP-1 Digestive Support', scoringVersion: '2.10.0', buildDecision: 'VALIDATE_FURTHER',  opportunityScore: 58, createdAt: '2026-07-11T22:33:19.661731+00:00' },
    ]
    const result = supersedeAnalyses(rows)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b306fde3')
  })

  it('berberine blood sugar support: 2.7.0 beats 2.2.0', () => {
    const rows: OpportunityRow[] = [
      { id: '3f3fbdad', categoryName: 'Berberine Blood Sugar Support', scoringVersion: '2.2.0', buildDecision: 'VALIDATE_FURTHER', opportunityScore: 61, createdAt: '2026-07-05T01:16:22.053485+00:00' },
      { id: '6a1ea4cc', categoryName: 'Berberine Blood Sugar Support', scoringVersion: '2.7.0', buildDecision: 'BUILD_NOW',        opportunityScore: 71, createdAt: '2026-07-08T02:39:21.056665+00:00' },
    ]
    expect(supersedeAnalyses(rows).map(r => r.id)).toEqual(['6a1ea4cc'])
  })

  it("dog allergy relief chews: same top scoring_version ties broken by latest created_at", () => {
    const rows: OpportunityRow[] = [
      { id: 'f9c6b9d0', categoryName: "Dog Allergy Relief Chews", scoringVersion: '2.6.0', buildDecision: 'BUILD_NOW',        opportunityScore: 83, createdAt: '2026-07-07T20:08:07.263872+00:00' },
      { id: 'ac32c9d5', categoryName: "Dog Allergy Relief Chews", scoringVersion: '2.7.0', buildDecision: 'VALIDATE_FURTHER', opportunityScore: 83, createdAt: '2026-07-08T00:10:48.870368+00:00' },
      { id: 'fe10643e', categoryName: "Dog Allergy Relief Chews", scoringVersion: '2.7.0', buildDecision: 'VALIDATE_FURTHER', opportunityScore: 69, createdAt: '2026-07-08T00:51:02.675085+00:00' },
    ]
    // Latest-created 2.7.0 row wins even though its score is lower — the
    // rule is never allowed to pick "the higher score," only "the newest
    // engine's real output."
    expect(supersedeAnalyses(rows).map(r => r.id)).toEqual(['fe10643e'])
  })

  it('is a no-op for a category with only one real row', () => {
    const rows: OpportunityRow[] = [
      { id: 'solo', categoryName: 'Creatine For Women', scoringVersion: '2.6.0', buildDecision: 'BUILD_NOW', opportunityScore: 80, createdAt: '2026-07-01T00:00:00Z' },
    ]
    expect(supersedeAnalyses(rows).map(r => r.id)).toEqual(['solo'])
  })

  it('never blends or averages conflicting verdicts/scores', () => {
    const rows: OpportunityRow[] = [
      { id: 'a', categoryName: 'X', scoringVersion: '1.0.0', buildDecision: 'BUILD_NOW', opportunityScore: 90, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'b', categoryName: 'X', scoringVersion: '2.0.0', buildDecision: 'SKIP',       opportunityScore: 10, createdAt: '2026-07-02T00:00:00Z' },
    ]
    const result = supersedeAnalyses(rows)
    expect(result).toHaveLength(1)
    expect(result[0].opportunityScore).toBe(10) // the real winning row's real score, not an average
  })
})

describe('buildOpportunities', () => {
  it('excludes SKIP and VALIDATE_FURTHER — only positive verdicts are "worth a look"', () => {
    const rows: OpportunityRow[] = [
      { id: 'skip1', categoryName: 'Bad Idea',      scoringVersion: '2.6.0', buildDecision: 'SKIP',              opportunityScore: 20, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'val1',  categoryName: 'Maybe Idea',    scoringVersion: '2.6.0', buildDecision: 'VALIDATE_FURTHER',  opportunityScore: 55, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'good1', categoryName: 'Good Idea',     scoringVersion: '2.6.0', buildDecision: 'BUILD_NOW',         opportunityScore: 80, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'cat1',  categoryName: 'Category King', scoringVersion: '2.6.0', buildDecision: 'CATEGORY_CREATION_CANDIDATE', opportunityScore: 95, createdAt: '2026-07-01T00:00:00Z' },
    ]
    const result = buildOpportunities(rows)
    expect(result.map(r => r.id).sort()).toEqual(['cat1', 'good1'])
  })

  it('sorts by opportunity score descending and builds a real Brief href', () => {
    const rows: OpportunityRow[] = [
      { id: 'lower',  categoryName: 'Lower',  scoringVersion: '2.6.0', buildDecision: 'BUILD_NOW', opportunityScore: 70, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'higher', categoryName: 'Higher', scoringVersion: '2.6.0', buildDecision: 'BUILD_NOW', opportunityScore: 90, createdAt: '2026-07-01T00:00:00Z' },
    ]
    const result = buildOpportunities(rows)
    expect(result.map(r => r.id)).toEqual(['higher', 'lower'])
    expect(result[0].href).toBe('/app/brief/higher')
  })

  it('applies the supersede rule before sorting, so a superseded row never appears', () => {
    const rows: OpportunityRow[] = [
      { id: 'old', categoryName: 'Same Category', scoringVersion: '2.2.0', buildDecision: 'BUILD_NOW', opportunityScore: 99, createdAt: '2026-07-01T00:00:00Z' },
      { id: 'new', categoryName: 'Same Category', scoringVersion: '2.7.0', buildDecision: 'BUILD_NOW', opportunityScore: 60, createdAt: '2026-07-02T00:00:00Z' },
    ]
    const result = buildOpportunities(rows)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new')
  })
})
