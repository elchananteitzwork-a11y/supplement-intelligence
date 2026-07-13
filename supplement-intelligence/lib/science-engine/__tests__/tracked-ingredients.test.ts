import { describe, it, expect } from 'vitest'
import { matchTrackedIngredient, TRACKED_INGREDIENTS } from '../tracked-ingredients'

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

  it('returns null for an untracked ingredient (honest — no fabricated match)', () => {
    expect(matchTrackedIngredient('ashwagandha for stress')).toBeNull()
  })

  it('every tracked ingredient is a real, distinct entry', () => {
    expect(new Set(TRACKED_INGREDIENTS).size).toBe(TRACKED_INGREDIENTS.length)
    expect(TRACKED_INGREDIENTS.length).toBeGreaterThan(0)
  })
})
