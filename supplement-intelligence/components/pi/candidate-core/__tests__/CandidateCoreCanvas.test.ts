// RD-UIv2-M4 §4/§5 — regression test for the reduced-motion ContactShadows
// fix, committed to in the R&D doc's own Risks section: "a silent per-frame
// cost under 'frozen' motion would be a real accessibility/performance
// regression... needs a real regression test, not just visual inspection."
// (Independent-review follow-up — the original implementation was verified
// live via a real pixel-diff, but that verification wasn't persisted as an
// automated test.)
//
// contactShadowFrames() is the one line of actual regression risk: if a
// future edit silently drops the reduceMotion gate, ContactShadows falls
// back to its own default (frames = Infinity) and re-renders its depth
// pass every frame regardless of whether the rotor above it is visually
// frozen. Imported from its own plain module (contactShadowFrames.ts, not
// the .tsx component file) because importing a .tsx file's JSX into a
// plain .ts test broke vitest's import-analysis transform — this repo has
// no prior React-component-test precedent, so that friction was real, not
// a fluke; moving the pure function out sidesteps it entirely.

import { describe, it, expect } from 'vitest'
import { contactShadowFrames } from '../contactShadowFrames'

describe('contactShadowFrames', () => {
  it('caps to a single bake under reduced motion — the real regression this guards against', () => {
    expect(contactShadowFrames(true)).toBe(1)
  })

  it('re-renders every frame when motion is not reduced', () => {
    expect(contactShadowFrames(false)).toBe(Infinity)
  })
})
