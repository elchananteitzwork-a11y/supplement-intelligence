// ── Cross-competitor theme correlation ───────────────────────────────────────
//
// Step 3 of the Customer Pain improvement plan (2026-07-03).
//
// Problem: after Steps 1-2, we have normalized negative themes from the
// critical corpus — but no distinction between:
//
//   (a) Category-wide pain — a complaint shared by multiple competitors.
//       Example: "poor adhesion" appearing in reviews of GORILLA GRIP *and*
//       KIMERSE drawer liners. This is a structural market gap: the category
//       itself hasn't solved the problem. A new entrant who fixes it has a
//       genuine wedge.
//
//   (b) Competitor-specific defect — a complaint present in only one
//       competitor's reviews. Example: "incorrect dimensions" only in GTJ's
//       reviews. This is that brand's execution failure — not proof of a
//       market gap, and a weaker signal for deciding whether to BUILD.
//
// Solution: for each normalized cluster, map its reviewIds back to their
// source ASINs (every CollectedReview carries an `asin` field). Count how
// many distinct ASINs contributed reviews to this theme. Tag the theme:
//   - isCategoryGap = true   if withTheme >= 2 (cross-competitor evidence)
//   - isCategoryGap = false  if withTheme == 1 (one brand's problem)
//
// The threshold of 2 is a conservative, explicit choice:
//   - With 2 competitors: both must share the theme
//   - With 3+ competitors: at least 2 independent products surface it
// A percentage-based threshold (e.g. 50%) would be too loose with 2 ASINs
// (1-of-2 = 50% would qualify everything) and too conservative with 5 ASINs.
//
// This module is pure (no I/O, no LLM calls) and deterministic.
// Its output feeds directly into consumerPainScore() weighting in scoring.ts.

import type { PhraseCluster } from './cluster'

export interface CorrelatedCluster extends PhraseCluster {
  competitorCount: {
    total:     number   // total ASINs in this analysis
    withTheme: number   // distinct ASINs whose critical reviews contain this theme
  }
  competitorCoverage: number    // withTheme / total, 0–1
  isCategoryGap:      boolean   // true if withTheme >= 2
}

/**
 * Correlate normalized clusters against their source ASINs.
 *
 * @param clusters     Normalized PhraseCluster[] from normalizeAndMerge()
 * @param reviewToAsin Map<reviewId, asin> built from the negative corpus
 * @param totalAsins   Number of distinct ASINs in the critical corpus
 */
export function correlateThemes(
  clusters:     PhraseCluster[],
  reviewToAsin: Map<string, string>,
  totalAsins:   number,
): CorrelatedCluster[] {
  return clusters.map(cluster => {
    // Collect the set of distinct ASINs that contributed reviews to this theme.
    const asinsWithTheme = new Set<string>()
    for (const reviewId of cluster.reviewIds) {
      const asin = reviewToAsin.get(reviewId)
      if (asin) asinsWithTheme.add(asin)
    }

    const withTheme         = asinsWithTheme.size
    const competitorCoverage = totalAsins > 0 ? withTheme / totalAsins : 0
    const isCategoryGap     = withTheme >= 2

    return {
      ...cluster,
      competitorCount:     { total: totalAsins, withTheme },
      competitorCoverage,
      isCategoryGap,
    }
  })
}
