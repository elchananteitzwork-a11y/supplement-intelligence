import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { deriveKillCriteriaItems, deriveLifecycleDisplay, formatGapVelocity } from '@/components/memo/field-derivations'
import { listWatches } from '@/lib/watchlist/store'
import {
  verdictWord, buildWhySentence, buildConvictionSentence, buildInsufficientEvidenceReadout,
  recommendedPull, alternativePulls,
  selectForDrivers, buildAgainstCase, buildClaimEvidence,
  windowInWords, freshnessStamp, buildValidationPlan, killRedirectionLine,
} from '@/lib/partner-copy'
import type { BriefViewModel, ReversalConditionVM } from '@/components/partner/brief/types'
import { BriefView } from '@/components/partner/brief/BriefView'

// ── /app/brief/[id] — the Brief (V4 Phase 1, docs/V4_PRODUCT_ARCHITECTURE.md
// §5, docs/RD_V4_PHASE1.md). Auth/fetch/ownership-check pattern reused from
// app/memo/[id]/page.tsx's own block (pattern only, nothing visual — this
// is a complete reset, not a port). By the time a user reaches this route
// the analysis is always already complete: /api/generate (called from
// components/partner/Stream.tsx) is a single synchronous request that only
// resolves once the row is written, so there is no separate pending/Hunt
// state to render here — the Hunt lives in the Stream while the request is
// in flight (documented decision; see components/partner/Hunt.tsx header).
export default async function BriefPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb.from('analyses').select('*').eq('id', params.id).single()
  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  const m = a.memo_data
  const grounded = computeGroundedScore(m)
  const confidence = computeConfidenceAssessment(grounded)

  const lifecycle = deriveLifecycleDisplay(m)
  const gapVelocity = formatGapVelocity(m.gap_velocity)
  const killItems = deriveKillCriteriaItems(m.kill_criteria)

  const watches = await listWatches(sb, user.id)
  const isWatching = watches.some(w => w.analysis_id === a.id && w.active)
  const reversalConditions: ReversalConditionVM[] = (killItems ?? []).map(label => ({ label, watching: isWatching }))

  const forDrivers = grounded.insufficientEvidence ? [] : selectForDrivers(grounded)
  const againstDrivers = grounded.insufficientEvidence ? [] : buildAgainstCase(m, grounded)

  const claimEvidence: Record<string, ReturnType<typeof buildClaimEvidence>> = {}
  for (const d of [...forDrivers, ...againstDrivers]) {
    if (!claimEvidence[d.claimKey]) claimEvidence[d.claimKey] = buildClaimEvidence(d.claimKey, m)
  }

  const insufficientReadout = grounded.insufficientEvidence ? buildInsufficientEvidenceReadout(grounded.evidenceBreadth) : null
  const validationPlan = buildValidationPlan(m, grounded.decision)

  // Insufficient evidence is a first-class state, not a real SKIP judgment
  // (computeGroundedScore returns decision:'SKIP' as an internal artifact of
  // "no candidates scored," not an assessment that this is a bad idea) — the
  // RD_V4_PHASE1.md §4.3 deterministic verb table is silent on this case, so
  // recommending "Watch, until more evidence comes in" here (rather than the
  // table's literal SKIP->Kill mapping) is the documented decision taken to
  // fill that real gap honestly.
  const recommended = grounded.insufficientEvidence
    ? { verb: 'Watch' as const, sublabel: 'until more evidence comes in' }
    : recommendedPull(grounded.decision)
  const alternatives = grounded.insufficientEvidence
    ? (['Validate', 'Kill'] as const)
    : alternativePulls(grounded.decision)

  const vm: BriefViewModel = {
    analysisId: a.id,
    categoryName: a.category_name,
    createdAtIso: a.created_at,
    freshness: freshnessStamp(a.created_at),

    decision: grounded.decision,
    insufficientEvidence: grounded.insufficientEvidence,
    verdictWord: verdictWord(grounded),
    emptyChannels: insufficientReadout?.emptyChannels ?? [],
    callableCondition: insufficientReadout?.callableCondition ?? null,

    whySentence: buildWhySentence(m, grounded),
    convictionSentence: buildConvictionSentence(confidence, grounded.dimensions).sentence,

    recommendedVerb: recommended.verb,
    recommendedSublabel: recommended.sublabel,
    alternativeVerbs: [...alternatives],

    forDrivers,
    againstDrivers,
    claimEvidence,

    windowText: windowInWords(lifecycle, gapVelocity),

    reversalConditions,

    validationSteps: validationPlan.steps,
    validationBudget: validationPlan.budget,
    successMetrics: validationPlan.successMetrics,
    killRedirect: killRedirectionLine(m),
  }

  return <BriefView vm={vm} />
}
