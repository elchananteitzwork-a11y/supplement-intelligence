import { describe, it, expect } from 'vitest'
import { matchTrackedIngredient, TRACKED_INGREDIENTS } from '../tracked-ingredients'
import { INGREDIENT_VOCABULARY } from '../ingredient-vocabulary'

describe('matchTrackedIngredient', () => {
  it('matches a tracked ingredient as a whole word inside free-text queries', () => {
    expect(matchTrackedIngredient('Berberine for blood sugar support')).toBe('berberine')
    expect(matchTrackedIngredient('creatine gummies')).toBe('creatine')
    expect(matchTrackedIngredient('Magnesium Glycinate Sleep')).toBe('magnesium')
  })

  it('is case-insensitive', () => {
    expect(matchTrackedIngredient('BERBERINE')).toBe('berberine')
  })

  it('does not match a substring that is not a whole word', () => {
    // "magnesiumx" should not match "magnesium" as a whole word.
    expect(matchTrackedIngredient('magnesiumx supplement')).toBeNull()
  })

  it('every tracked ingredient is a real, distinct entry', () => {
    expect(new Set(TRACKED_INGREDIENTS).size).toBe(TRACKED_INGREDIENTS.length)
    expect(TRACKED_INGREDIENTS.length).toBeGreaterThan(0)
  })
})

// Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md) —
// the widened vocabulary fallback. The 3 pre-existing tests above (tracked-3
// matching, case-insensitivity, whole-word discipline) are left completely
// unmodified — this milestone's own acceptance bar (byte-identical behavior
// for the existing 3).
describe('matchTrackedIngredient — widened vocabulary fallback', () => {
  it('matches a single-word vocabulary ingredient', () => {
    expect(matchTrackedIngredient('Ashwagandha Gummies for Stress')).toBe('ashwagandha')
  })

  it('matches a multiword vocabulary canonical name as a whole phrase', () => {
    expect(matchTrackedIngredient('Panax Ginseng Extract 500mg')).toBe('panax ginseng')
  })

  it('matches a real known alias, not just the canonical name', () => {
    expect(matchTrackedIngredient('Withania Somnifera root powder')).toBe('ashwagandha')
    expect(matchTrackedIngredient('KSM-66 capsules')).toBe('ashwagandha')
  })

  it('is case-insensitive for vocabulary matches too', () => {
    expect(matchTrackedIngredient('ASHWAGANDHA CAPSULES')).toBe('ashwagandha')
  })

  it('longest match wins when a query names more than one vocabulary term (disclosed non-goal: no multi-ingredient support)', () => {
    // "green tea extract" (18 chars) is the longer, more specific match vs.
    // "quercetin" appearing later in the same query — only the first/longest
    // match is returned, never both.
    expect(matchTrackedIngredient('Green Tea Extract with Quercetin')).toBe('green tea extract')
  })

  it('a tracked-3 ingredient still wins over a vocabulary term appearing in the same query', () => {
    expect(matchTrackedIngredient('Magnesium and Ashwagandha Sleep Blend')).toBe('magnesium')
  })

  it('does not match a substring that is not a whole word in the vocabulary either', () => {
    expect(matchTrackedIngredient('ashwagandhaX supplement')).toBeNull()
  })

  it('returns null for a genuine miss — no fabricated match for an untracked, unlisted ingredient', () => {
    expect(matchTrackedIngredient('some totally invented compound xyz123')).toBeNull()
  })

  it('the vocabulary never duplicates a tracked-3 canonical name', () => {
    const canonicals = INGREDIENT_VOCABULARY.map(e => e.canonical)
    for (const tracked of TRACKED_INGREDIENTS) {
      expect(canonicals).not.toContain(tracked)
    }
  })

  it('every vocabulary canonical name is unique', () => {
    const canonicals = INGREDIENT_VOCABULARY.map(e => e.canonical)
    expect(new Set(canonicals).size).toBe(canonicals.length)
  })

  it('the vocabulary is a real, non-trivial size (~150-250 entries per the R&D doc)', () => {
    expect(INGREDIENT_VOCABULARY.length).toBeGreaterThanOrEqual(150)
    expect(INGREDIENT_VOCABULARY.length).toBeLessThanOrEqual(250)
  })
})
