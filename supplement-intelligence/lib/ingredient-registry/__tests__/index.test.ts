import { describe, it, expect } from 'vitest'
import { TRACKED_INGREDIENTS } from '@/lib/science-engine/tracked-ingredients'
import { INGREDIENT_REGISTRY, getIngredientProfile, REGISTERED_INGREDIENTS } from '../index'

describe('ingredient-registry (Roadmap M2.15)', () => {
  it('has a real profile for every currently-tracked ingredient, no more, no fewer', () => {
    expect(REGISTERED_INGREDIENTS).toEqual(TRACKED_INGREDIENTS)
    expect(Object.keys(INGREDIENT_REGISTRY).sort()).toEqual([...TRACKED_INGREDIENTS].sort())
  })

  it('every profile has a real, non-empty display name and at least one real alias', () => {
    for (const ingredient of TRACKED_INGREDIENTS) {
      const profile = INGREDIENT_REGISTRY[ingredient]
      expect(profile.displayName.length).toBeGreaterThan(0)
      expect(profile.aliases.length).toBeGreaterThan(0)
      expect(profile.aliases.every(a => a.length > 0)).toBe(true)
    }
  })

  it('canonicalSearchTerm equals the bare tracked-ingredient string for all 3 entries today — proves the PubMed/ClinicalTrials.gov calls are provably unchanged by this milestone', () => {
    for (const ingredient of TRACKED_INGREDIENTS) {
      expect(INGREDIENT_REGISTRY[ingredient].canonicalSearchTerm).toBe(ingredient)
    }
  })

  it('magnesium aliases include real, recognizable commercial forms', () => {
    const aliases = INGREDIENT_REGISTRY.magnesium.aliases
    expect(aliases).toContain('magnesium glycinate')
    expect(aliases).toContain('magnesium citrate')
    expect(aliases).toContain('magnesium oxide')
  })

  describe('getIngredientProfile', () => {
    it('returns the real profile for a known tracked ingredient', () => {
      expect(getIngredientProfile('berberine')).toEqual(INGREDIENT_REGISTRY.berberine)
    })

    it('returns undefined (never a fabricated profile) for an unknown key', () => {
      expect(getIngredientProfile('ashwagandha')).toBeUndefined()
      expect(getIngredientProfile('')).toBeUndefined()
    })
  })
})
