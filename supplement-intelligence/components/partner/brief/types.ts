// Shared view-model types between app/app/brief/[id]/page.tsx (the real
// server-side fetch + derivation) and the client Brief components below.
// Deliberately a plain .ts module (no JSX) — the server page computes this
// once from real, already-fetched data; the client only renders it.

import type { BuildDecision } from '@/types/index'
import type { CaseDriver, ClaimEvidence, PullVerb } from '@/lib/partner-copy'

export interface ReversalConditionVM {
  label:      string
  watching:   boolean   // true only when this analysis is genuinely on the user's watchlist
  marker:     { currentPct: number; thresholdPct: number } | null  // only for the one naturally-bounded metric; see field-derivations.ts's deriveReversalMarker
}

export interface LifecycleVM {
  stages:       string[]
  currentIndex: number
}

export interface BriefViewModel {
  analysisId:  string
  categoryName: string
  createdAtIso: string
  freshness:    string

  decision:            BuildDecision
  insufficientEvidence: boolean
  verdictWord:          string
  emptyChannels:        string[]        // only populated when insufficientEvidence
  callableCondition:    string | null   // only populated when insufficientEvidence

  whySentence:      string
  convictionSentence: string

  recommendedVerb:     PullVerb
  recommendedSublabel: string
  alternativeVerbs:    PullVerb[]

  forDrivers:     CaseDriver[]
  againstDrivers: CaseDriver[]
  claimEvidence:  Record<string, ClaimEvidence>

  windowText: string | null
  windowNumbers: { demandLabel: string; supplyLabel: string } | null
  lifecycle:     LifecycleVM | null
  whyNow:        string | null
  channelAgreement: string | null
  hasGapChapter: boolean

  reversalConditions: ReversalConditionVM[]

  validationSteps:  string[]
  validationBudget: { range: string; breakdown: string }
  successMetrics:   string[]
  killRedirect:     string | null
}
