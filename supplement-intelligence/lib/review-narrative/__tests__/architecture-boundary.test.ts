// Architecture boundary tests — Milestone 7, Option 2 (memo-only narrative
// enrichment). Static proof, at the source-text level, that the Decision
// Engine's source files contain zero references to review-narrative or
// review-engine — the strongest guarantee available short of a full
// dependency-graph analyzer: if these files don't even mention the module,
// they structurally cannot read its output, now or after any future edit
// that doesn't also touch this test.
//
// Complements (does not replace) the behavioral proof in
// scoring-isolation.test.ts, which shows that EVEN IF a future bug adds
// data into memo.review_narrative before scoring runs, the score is
// unaffected. This test proves the import graph itself excludes it.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '../../..')

const DECISION_ENGINE_FILES = [
  'lib/scoring.ts',
  ...readdirSync(join(REPO_ROOT, 'lib/confidence'))
    .filter(f => f.endsWith('.ts') && !f.includes('__tests__'))
    .map(f => `lib/confidence/${f}`),
]

const FORBIDDEN_PATTERNS = [
  /review-narrative/,
  /review_narrative/,
  /ReviewNarrativeSynthesis/,
  /synthesizeReviewNarrative/,
  /['"]@\/lib\/review-engine['"]/,
]

describe('Architecture boundary — Decision Engine never references review-narrative or review-engine', () => {
  for (const relPath of DECISION_ENGINE_FILES) {
    it(`${relPath} contains no reference to review-narrative/review-engine`, () => {
      const source = readFileSync(join(REPO_ROOT, relPath), 'utf-8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern)
      }
    })
  }

  it('enumerated at least scoring.ts plus every lib/confidence file (sanity check the list itself is non-trivial)', () => {
    expect(DECISION_ENGINE_FILES.length).toBeGreaterThanOrEqual(5)
    expect(DECISION_ENGINE_FILES).toContain('lib/scoring.ts')
  })
})

describe('Architecture boundary — review-narrative never imports the Decision Engine as a scoring dependency', () => {
  it('lib/review-narrative/synthesize.ts does not import computeGroundedScore or the Decision Engine gate functions', () => {
    const source = readFileSync(join(REPO_ROOT, 'lib/review-narrative/synthesize.ts'), 'utf-8')
    expect(source).not.toMatch(/computeGroundedScore/)
    expect(source).not.toMatch(/computeChannelIndependenceGateTier/)
    expect(source).not.toMatch(/computeConfidenceAssessment/)
  })
})
