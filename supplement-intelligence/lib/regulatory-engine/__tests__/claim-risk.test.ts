// DSHEA claim-risk scanner tests — Roadmap M2.19. Pure deterministic
// string-matching, no mocks needed. Fixtures are the REAL quoted examples
// from FDA's Jan 2002 Small Entity Compliance Guide on Structure/Function
// Claims (docket FDA-1998-N-0071), per the approved R&D document.

import { describe, it, expect } from 'vitest'
import { scanForClaimRiskLanguage, CLAIM_RISK_VERBS, CLAIM_RISK_DISEASE_TERMS, CLAIM_RISK_DISCLAIMER } from '../claim-risk'

describe('scanForClaimRiskLanguage', () => {
  describe('real FDA-quoted prohibited disease-claim examples — must flag', () => {
    it('flags each real prohibited example containing a listed verb + disease term', () => {
      const withVerbs = [
        'reduces the pain and stiffness associated with arthritis',
        'relieves crushing chest pain (angina)',
        'improves joint mobility and reduces inflammation (rheumatoid arthritis)',
        "treats Alzheimer's disease or senile dementias in the elderly", // ensure verb present
        'treats severe depression associated with the menstrual cycle',
        "supports the body's ability to resist infection",
      ]
      for (const text of withVerbs) {
        const result = scanForClaimRiskLanguage([text])
        expect(result, `expected "${text}" to flag`).toContain(text)
      }
    })

    it('flags "relieves crushing chest pain (angina)" verbatim (real FDA prohibited example)', () => {
      expect(scanForClaimRiskLanguage(['relieves crushing chest pain (angina)']))
        .toEqual(['relieves crushing chest pain (angina)'])
    })

    it('flags "improves joint mobility and reduces inflammation (rheumatoid arthritis)" verbatim', () => {
      expect(scanForClaimRiskLanguage(['improves joint mobility and reduces inflammation (rheumatoid arthritis)']))
        .toEqual(['improves joint mobility and reduces inflammation (rheumatoid arthritis)'])
    })

    it('flags "supports the body\'s ability to resist infection" (support+disease co-occurrence)', () => {
      expect(scanForClaimRiskLanguage(["supports the body's ability to resist infection"]))
        .toEqual(["supports the body's ability to resist infection"])
    })

    it('flags "supports the body\'s antiviral capabilities" only if disease term present (it is not) — confirms no bare "supports" false positive', () => {
      expect(scanForClaimRiskLanguage(["supports the body's antiviral capabilities"])).toEqual([])
    })

    it('flags cystic acne example when co-occurring with a verb', () => {
      expect(scanForClaimRiskLanguage(['relieves cystic acne'])).toEqual(['relieves cystic acne'])
    })
  })

  describe('real FDA-quoted allowed structure/function examples — must NOT flag', () => {
    const allowed = [
      'diuretic that relieves temporary water-weight gain',
      'mild memory loss associated with aging',
      'noncystic acne',
      'mild mood changes, cramps, and edema associated with the menstrual cycle',
      'maintain cholesterol levels that are already in the normal range',
      'supports the immune system',
      'improves absentmindedness',
      'relieves stress and frustration',
    ]

    it.each(allowed)('does not flag real allowed example: "%s"', (text) => {
      expect(scanForClaimRiskLanguage([text])).toEqual([])
    })
  })

  it('is case-insensitive', () => {
    expect(scanForClaimRiskLanguage(['RELIEVES CRUSHING CHEST PAIN (ANGINA)']))
      .toEqual(['RELIEVES CRUSHING CHEST PAIN (ANGINA)'])
  })

  it('does not flag a bare disease term with no verb ("used by people with asthma")', () => {
    expect(scanForClaimRiskLanguage(['formulated for people with asthma in mind'])).toEqual([])
  })

  it('does not flag a bare verb with no disease term ("reduces stress")', () => {
    expect(scanForClaimRiskLanguage(['reduces stress and promotes calm'])).toEqual([])
  })

  it('returns an empty array for an empty input', () => {
    expect(scanForClaimRiskLanguage([])).toEqual([])
  })

  it('ignores empty/undefined-like strings without throwing', () => {
    expect(scanForClaimRiskLanguage(['', '   '])).toEqual([])
  })

  it('deduplicates identical matched strings', () => {
    const text = 'treats arthritis pain fast'
    expect(scanForClaimRiskLanguage([text, text])).toEqual([text])
  })

  it('scans across multiple independent strings, only flagging the co-occurring ones', () => {
    const texts = [
      'supports the immune system',              // allowed — no disease term
      'treats arthritis pain fast',               // flags
      'maintain cholesterol levels that are already in the normal range', // allowed
      'prevents cancer recurrence',                // flags
    ]
    expect(scanForClaimRiskLanguage(texts)).toEqual([
      'treats arthritis pain fast',
      'prevents cancer recurrence',
    ])
  })

  it('exposes non-empty, disclosed verb and disease-term lists', () => {
    expect(CLAIM_RISK_VERBS.length).toBeGreaterThan(0)
    expect(CLAIM_RISK_DISEASE_TERMS.length).toBeGreaterThan(0)
    expect(CLAIM_RISK_VERBS).toContain('treats')
    expect(CLAIM_RISK_DISEASE_TERMS).toContain('cancer')
  })

  it('exposes a disclaimer stating this is not a legal determination', () => {
    expect(CLAIM_RISK_DISCLAIMER).toMatch(/not a legal compliance determination/i)
    expect(CLAIM_RISK_DISCLAIMER).toMatch(/not medical or legal advice/i)
  })

  // Independent review fix (post-implementation) #1: 'inhibit'/'inhibits' were
  // removed from CLAIM_RISK_VERBS — not traceable to any real FDA quote given
  // for this milestone. Confirms they are genuinely absent, not just unused.
  it('does not include ungrounded verbs like "inhibit"/"inhibits" in the verb list', () => {
    expect(CLAIM_RISK_VERBS).not.toContain('inhibit')
    expect(CLAIM_RISK_VERBS).not.toContain('inhibits')
  })

  it('does not flag "inhibits platelet aggregation" now that "inhibit(s)" is removed (no other listed verb/disease term present)', () => {
    expect(scanForClaimRiskLanguage(['inhibits platelet aggregation'])).toEqual([])
  })

  // Independent review fix #2: real scraped listing copy often uses a
  // typographic/curly apostrophe (U+2019) rather than the straight ASCII
  // apostrophe used in CLAIM_RISK_DISEASE_TERMS. Must still match.
  it('flags the curly-apostrophe real-world form of "Alzheimer’s disease"', () => {
    const text = 'treats Alzheimer’s disease and related memory loss'
    expect(scanForClaimRiskLanguage([text])).toEqual([text])
  })

  // Independent review fix #3: plural "infections" added alongside singular
  // "infection", matching the existing dementia/dementias pairing.
  it('flags the plural form "infections" when co-occurring with a verb', () => {
    const text = "supports the body's defenses against infections"
    expect(scanForClaimRiskLanguage([text])).toEqual([text])
  })

  it('CLAIM_RISK_DISEASE_TERMS includes both singular and plural infection forms', () => {
    expect(CLAIM_RISK_DISEASE_TERMS).toContain('infection')
    expect(CLAIM_RISK_DISEASE_TERMS).toContain('infections')
  })
})
