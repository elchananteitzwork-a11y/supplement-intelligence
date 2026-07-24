// ═══════════════════════════════════════════════════════════════════════
// lib/opportunities.ts — V4 Phase 2 (docs/RD_V4_PHASE2.md Milestone D).
// Pure, JSX-free: turns a user's own real past analyses into the
// "Opportunities worth a look" list on the Stream. Corpus browsing only
// (RD §7 Non-goals) — never a personalized "build this instead"
// suggestion, never blended/averaged verdicts.
//
// The supersede rule exists because the same real category can legitimately
// be analyzed more than once and land on a different verdict — confirmed
// live 2026-07-24 (7 real conflicting groups, one user's own repeated
// queries) via scoring_version drift (2.2.0 → 2.11.0 over the same month)
// plus genuine same-version pipeline non-determinism. Only the highest
// scoring_version survives per normalized category; ties break to the most
// recent created_at. scoring_version is compared as a real MAJOR.MINOR.PATCH
// tuple, never as a string — "2.10.0" sorts below "2.2.0" lexicographically,
// which would silently pick the wrong winner for the exact drift this rule
// exists to handle. A null scoring_version (pre-M2.x rows) always loses to
// any real version.
// ═══════════════════════════════════════════════════════════════════════

import type { BuildDecision } from '@/types/index'

export interface OpportunityRow {
  id:               string
  categoryName:     string
  scoringVersion:   string | null
  buildDecision:    BuildDecision
  opportunityScore: number
  createdAt:        string
}

export interface OpportunityVM {
  id:               string
  categoryName:     string
  buildDecision:    BuildDecision
  opportunityScore: number
  createdAt:         string
  href:             string
}

// Positive-verdict categories only — "worth a look" never surfaces a SKIP.
const QUALIFYING_DECISIONS: readonly BuildDecision[] = ['BUILD_NOW', 'CATEGORY_CREATION_CANDIDATE']

export function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function compareScoringVersion(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function supersedeAnalyses<T extends OpportunityRow>(rows: readonly T[]): T[] {
  const winners = new Map<string, T>()
  for (const row of rows) {
    const key = normalizeCategoryKey(row.categoryName)
    const current = winners.get(key)
    if (!current) { winners.set(key, row); continue }
    const svCompare = compareScoringVersion(row.scoringVersion, current.scoringVersion)
    if (svCompare > 0 || (svCompare === 0 && row.createdAt > current.createdAt)) {
      winners.set(key, row)
    }
  }
  return Array.from(winners.values())
}

export function buildOpportunities(rows: readonly OpportunityRow[]): OpportunityVM[] {
  const qualifying = rows.filter(r => QUALIFYING_DECISIONS.includes(r.buildDecision))
  return supersedeAnalyses(qualifying)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .map(r => ({
      id:               r.id,
      categoryName:     r.categoryName,
      buildDecision:    r.buildDecision,
      opportunityScore: r.opportunityScore,
      createdAt:        r.createdAt,
      href:             `/app/brief/${r.id}`,
    }))
}
