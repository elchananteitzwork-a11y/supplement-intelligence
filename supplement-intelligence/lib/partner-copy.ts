// ═══════════════════════════════════════════════════════════════════════
// lib/partner-copy.ts — V4 Phase 1 (docs/V4_PRODUCT_ARCHITECTURE.md,
// docs/RD_V4_PHASE1.md). Pure, JSX-free copy/derivation logic for the
// partner's voice on the Stream/Brief/Pull surfaces (app/app/**,
// components/partner/**).
//
// Every function here is a pure transform of real, already-computed
// backend types (GroundedScore, ConfidenceAssessment, MemoData, ...) — no
// new number is ever invented, no LLM call happens here. Where the
// underlying data is absent, functions return null/empty rather than
// fabricating a value (same standing rule as components/memo/
// field-derivations.ts, which this file is the V4-namespace sibling of).
//
// NOTE on reuse boundary (frontend-engineering-agent hard boundary): the
// Brief/Pull spec asks for "the real plan (steps + real budget + success
// metrics) reusing the derive functions used by StrategicReadinessChecklist"
// — those functions (deriveValidationSteps/Budget/SuccessMetrics,
// deriveTop3Build/Risks) live in components/memo/shared.tsx, a 'use client'
// JSX file explicitly banned from this namespace's imports (only
// components/memo/field-derivations.ts's pure exports are allowed). This
// file therefore REIMPLEMENTS equivalent pure derivations from the same
// real MemoData fields, in the partner's own first-person voice, rather
// than importing the banned module. See the frontend-engineering-agent's
// final report for this explicit call.
// ═══════════════════════════════════════════════════════════════════════

import type { BuildDecision, MemoData, DimScore } from '@/types/index'
import type { GroundedScore, ScoreDimension, EvidenceBreadth } from '@/lib/scoring'
import type { ConfidenceAssessment } from '@/lib/confidence'
import type { ProvenanceLevel } from '@/lib/provenance'

// Independent-review fix (finding 2): components/memo/shared.tsx's
// dimLevel() falls back to this exact legacy score->level bucketing
// (legacyScoreToLevelDisplay, shared.tsx:206-209) for pre-2026-06-26 memos
// that only ever wrote a numeric DimScore.score, never DimScore.level
// (types/index.ts:92-101's own comment on the field). shared.tsx stays
// banned from this namespace's imports, so the tiny bucketing rule is
// restated here verbatim (>=7 High, >=4 Medium, else Low) rather than
// silently dropping the legacy fallback and drifting to a flat default.
function legacyLevelFromScore(score: number | undefined): 'High' | 'Medium' | 'Low' | undefined {
  if (typeof score !== 'number') return undefined
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'
}

function dimLevelWithLegacyFallback(dim: DimScore | undefined): 'High' | 'Medium' | 'Low' {
  return dim?.level ?? legacyLevelFromScore(dim?.score) ?? 'Medium'
}

// ── Verdict words (frozen vocabulary — V4_PRODUCT_ARCHITECTURE.md §9 /
// RD_V4_PHASE1.md §1: "the existing frozen labels ... are reused as the
// canonical plain-language verdict vocabulary — no new vocabulary
// invented." These four strings are already shipped in multiple places
// (components/ui/VerdictBadge.tsx, components/pi/candidate-core/
// coreDataAdapter.ts, components/dashboard/DashboardOpportunityCard.tsx,
// components/memo/CurrentSignal.tsx) — restated here as plain data because
// every one of those files lives in a banned import path for this
// namespace. ─────────────────────────────────────────────────────────────
export const VERDICT_WORD: Record<BuildDecision, string> = {
  BUILD_NOW:                    'Entry Supported',
  VALIDATE_FURTHER:             'Validation Required',
  SKIP:                         'Not Supported',
  CATEGORY_CREATION_CANDIDATE:  'Category Creation',
}

export const INSUFFICIENT_EVIDENCE_VERDICT_WORD = "I can't call this one"

/** The verdict word shown as the Brief's one large first-viewport element. */
export function verdictWord(grounded: Pick<GroundedScore, 'decision' | 'insufficientEvidence'>): string {
  if (grounded.insufficientEvidence) return INSUFFICIENT_EVIDENCE_VERDICT_WORD
  return VERDICT_WORD[grounded.decision]
}

// Independent-review fix (finding 1, honesty): the Positions strip
// (components/partner/PositionsStrip.tsx) reads a persisted `decision` off
// GET /api/positions, which — same as `analyses.build_decision` — can be
// computeGroundedScore's internal 'SKIP' artifact for an insufficient-
// evidence analysis, never a real "Not Supported" market judgment. This is
// the same verdictWord() logic but over the persisted, already-computed
// `{decision, insufficientEvidence}` pair the positions API now returns
// (see lib/positions.ts's Position type) instead of a live GroundedScore —
// same "measured / my judgment / couldn't verify" honesty family the
// Brief's verdictWord() already uses, just accepting a nullable decision
// (a position whose analysis failed to join returns null).
export function positionVerdictLabel(decision: BuildDecision | null, insufficientEvidence: boolean): string {
  if (insufficientEvidence) return INSUFFICIENT_EVIDENCE_VERDICT_WORD
  if (!decision) return 'Unknown'
  return VERDICT_WORD[decision]
}

// ── Recommended Pull verb (RD_V4_PHASE1.md §4.3 / §3 item 3 — deterministic,
// no new judgment computed) ──────────────────────────────────────────────
export type PullVerb = 'Validate' | 'Kill' | 'Watch'

export interface RecommendedPull {
  verb:     PullVerb
  sublabel: string  // short qualifier shown next to the verb
}

export const RECOMMENDED_PULL: Record<BuildDecision, RecommendedPull> = {
  BUILD_NOW:                    { verb: 'Validate', sublabel: 'execute the entry plan' },
  VALIDATE_FURTHER:             { verb: 'Validate', sublabel: 'test before committing capital' },
  SKIP:                         { verb: 'Kill',     sublabel: 'recorded as a save' },
  CATEGORY_CREATION_CANDIDATE:  { verb: 'Watch',     sublabel: 'the category, not this exact variant' },
}

export function recommendedPull(decision: BuildDecision): RecommendedPull {
  return RECOMMENDED_PULL[decision]
}

// Alternatives shown behind "or…" — every other verb, in a fixed order.
const ALL_VERBS: PullVerb[] = ['Validate', 'Watch', 'Kill']
export function alternativePulls(decision: BuildDecision): PullVerb[] {
  const primary = recommendedPull(decision).verb
  return ALL_VERBS.filter(v => v !== primary)
}

// ── Conviction sentence (confidence tier folded into the partner's own
// language + weakest link named) — reuses the exact 50%/25% tier boundary
// already shipped in components/memo/field-derivations.ts's
// deriveConfidenceDisplay (not a new threshold; that file is JSX-free but
// still off-limits by name, so the same disclosed thresholds are restated
// here as plain data, not re-derived differently). ───────────────────────
export interface ConvictionSentence {
  tier:             'High' | 'Medium' | 'Low' | 'None'
  phrase:           string
  weakestLinkLabel: string | null
  sentence:         string
}

const CONVICTION_PHRASE: Record<'High' | 'Medium' | 'Low' | 'None', string> = {
  High:   "I'm fairly sure of this one",
  Medium: "I'm moderately sure",
  Low:    'hold this one loosely',
  None:   "I don't have enough independently-confirmed evidence to be sure",
}

export function buildConvictionSentence(
  assessment: Pick<ConfidenceAssessment, 'overallConfidence' | 'weakestDimension'>,
  dimensions: Pick<ScoreDimension, 'key' | 'label'>[],
): ConvictionSentence {
  const pct = assessment.overallConfidence
  const tier: 'High' | 'Medium' | 'Low' | 'None' =
    pct === null ? 'None' : pct >= 0.5 ? 'High' : pct >= 0.25 ? 'Medium' : 'Low'
  const phrase = CONVICTION_PHRASE[tier]

  const weakestDim = assessment.weakestDimension
    ? dimensions.find(d => d.key === assessment.weakestDimension)
    : undefined
  const weakestLinkLabel = weakestDim ? weakestDim.label : null

  const sentence = weakestLinkLabel
    ? `${phrase} — ${weakestLinkLabel} is the weakest link.`
    : `${phrase}.`

  return { tier, phrase, weakestLinkLabel, sentence }
}

// ── The why sentence — real writer_output.causal_paragraph (falling back
// to build_explanation when the AI writer step itself fell back), with a
// gate named explicitly when one overrode the score-threshold verdict. ──
//
// QA fix (V4_PRODUCT_ARCHITECTURE.md §5, two symptoms of one root cause):
// (1) "the score (0-100) does not appear on the Brief" — causal_paragraph
// was written for the old Memo page, where the score IS shown, so it
// routinely opens with "The market score of 61 reflects...". Returning it
// verbatim leaked the score onto the Brief. (2) that verbatim paragraph
// runs 4-5 sentences, pushing "The Case" into the first 390x844 viewport,
// breaking "first viewport = exactly three things." Fix is SELECTION only
// — never truncation/ellipsis, never rewritten prose: split the real
// source text into real sentences (reimplemented locally in the same
// spirit as components/memo/shared.tsx's firstSentence(), which stays
// banned) and take the first one that doesn't cite a numeric score. If
// every sentence of the primary source cites a score, the other real
// source is tried with the same rule. Only if NEITHER source has a clean
// sentence does this compose a why-sentence from real structured fields
// (never inventing a fact) — the top for-driver's own real claim, joined
// to the real primary gate/risk clause.

// Lightweight sentence splitter — same non-greedy "up to a terminator"
// heuristic as firstSentence(), generalized to return every sentence
// rather than just the first. Not a full NLP tokenizer (doesn't special-
// case abbreviations/decimals) — the same acceptable heuristic tier the
// banned original used.
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g)
  const sentences = (matches ?? []).map(s => s.trim()).filter(Boolean)
  const consumed = (matches ?? []).join('').length
  const remainder = text.slice(consumed).trim()
  if (remainder) sentences.push(remainder)
  return sentences
}

// Case-insensitive patterns for a raw 0-100 opportunity-score reference —
// exactly the QA-specified set. Deliberately narrow (numeric-score
// mentions only) — a sentence that says "score" in some other sense
// (e.g. a gate's own "score-threshold verdict" wording) is not filtered;
// only sentences citing an actual number are excluded from the why-sentence.
const SCORE_MENTION_PATTERNS = [
  /\bscore of \d+/i,
  /\bmarket score\b/i,
  /\b\d{1,3}\s*\/\s*100\b/i,
  /\bscore\s*[:=]?\s*\d{1,3}\b/i,
]

function mentionsScore(sentence: string): boolean {
  return SCORE_MENTION_PATTERNS.some(p => p.test(sentence))
}

function firstCleanSentence(text: string | undefined | null): string | null {
  if (!text) return null
  return splitSentences(text).find(s => !mentionsScore(s)) ?? null
}

// Lowercases only the first alphabetic character — for naturally joining
// a real clause after "but " without shouting a mid-sentence capital.
function lowerFirst(s: string): string {
  return s.replace(/[A-Za-z]/, c => c.toLowerCase())
}

// Deterministic presentation over real, already-computed data — never an
// invented fact. Used only when no real sentence anywhere is clean.
function composeWhyFromStructuredFields(
  m: Pick<MemoData, 'writer_output'>,
  grounded: Pick<GroundedScore, 'dimensions' | 'verdictOverrideReasons'>,
): string {
  const topDriver = selectForDrivers(grounded, 1)[0]
  const gate = grounded.verdictOverrideReasons?.[0]
  const riskClause = m.writer_output?.risk_sentence ? splitSentences(m.writer_output.risk_sentence)[0] : undefined
  const contrast = gate ?? riskClause

  if (topDriver && contrast) return `${topDriver.text} — but ${lowerFirst(contrast)}`
  if (topDriver) return topDriver.text
  if (contrast) return contrast
  return "I don't have a clean read on this one yet."
}

export function buildWhySentence(
  m: Pick<MemoData, 'writer_output' | 'build_explanation'>,
  grounded: Pick<GroundedScore, 'verdictOverrideReasons' | 'dimensions'>,
): string {
  const w = m.writer_output
  const causalIsReal = !!w && !w.causal_paragraph_is_fallback
  const primaryText = causalIsReal ? w!.causal_paragraph : m.build_explanation
  const otherText    = causalIsReal ? m.build_explanation : w?.causal_paragraph

  const chosen =
    firstCleanSentence(primaryText) ??
    firstCleanSentence(otherText) ??
    composeWhyFromStructuredFields(m, grounded)

  const gate = grounded.verdictOverrideReasons?.[0]
  return gate ? `${chosen} A gate held the verdict back: ${gate}` : chosen
}

// ── Insufficient-evidence first-class state (S-Brief spec: "I can't call
// this one" + which channels came up empty + what would make it callable).
// ─────────────────────────────────────────────────────────────────────────
export interface InsufficientEvidenceReadout {
  verdictWord:       string
  emptyChannels:     string[]
  callableCondition: string
}

export function buildInsufficientEvidenceReadout(evidenceBreadth: EvidenceBreadth): InsufficientEvidenceReadout {
  const empty = evidenceBreadth.channelBreakdown.filter(c => !c.contributed).map(c => c.label)
  const callableCondition = empty.length
    ? `This becomes callable once ${empty.slice(0, 2).join(' or ')} data comes in.`
    : 'This becomes callable once more evidence channels report in.'
  return { verdictWord: INSUFFICIENT_EVIDENCE_VERDICT_WORD, emptyChannels: empty, callableCondition }
}

// ── Provenance: 5-level internal taxonomy → 3 plain user-facing words
// (V4_PRODUCT_ARCHITECTURE.md §3: "measured / my judgment / couldn't
// verify"). ────────────────────────────────────────────────────────────
export type PlainProvenance = 'measured' | 'my judgment' | "couldn't verify"

export function toPlainProvenance(level: ProvenanceLevel): PlainProvenance {
  switch (level) {
    case 'verified':    return 'measured'
    case 'estimated':
    case 'synthesized': return 'my judgment'
    case 'unknown':
    case 'unsupported': return "couldn't verify"
  }
}

// ScoreDimension.source only has the 2-level 'verified'|'synthesized' —
// the same mapping, restricted to that narrower domain.
export function scoreDimensionProvenance(source: ScoreDimension['source']): PlainProvenance {
  return source === 'verified' ? 'measured' : 'my judgment'
}

// ── The Case — driver selection (RD_V4_PHASE1.md §3/§4 risk 4): top-3
// "for" / top-2 "against", each a real ScoreDimension, words-left (label +
// its own real sourceLabel) + one real number right (rawScore when
// verified, the qualitative word when only AI judgment exists — never a
// fabricated number). NEVER pads to a fixed count — renders fewer, always
// honestly, when fewer than 3/2 real strong/weak dimensions exist. ──────
export interface CaseDriver {
  claimKey:   string   // ScoreDimension.key — the tap-to-interrogate handle
  label:      string
  text:       string   // words-left sentence
  number:     string   // one real number/word right
  provenance: PlainProvenance
}

const STRONG_RAW_THRESHOLD = 6
const WEAK_RAW_THRESHOLD   = 4

function dimensionNumber(d: ScoreDimension): string {
  return d.rawScore !== undefined ? `${d.rawScore.toFixed(1)}/10` : (d.qualitativeLevel ?? '—')
}

// Same "strong" test selectForDrivers uses below — factored out so
// buildPrimaryRiskDriver (independent-review fix, finding 3) can ask "is
// this dimension one a reasonable reader would already read as a FOR
// driver" without duplicating the threshold logic.
function isStrongDimension(d: ScoreDimension): boolean {
  return d.rawScore !== undefined ? d.rawScore >= STRONG_RAW_THRESHOLD : d.qualitativeLevel === 'High'
}

function dimensionText(d: ScoreDimension): string {
  return `${d.label}: ${d.sourceLabel}`
}

function toDriver(d: ScoreDimension): CaseDriver {
  return {
    claimKey:   d.key,
    label:      d.label,
    text:       dimensionText(d),
    number:     dimensionNumber(d),
    provenance: scoreDimensionProvenance(d.source),
  }
}

export function selectForDrivers(grounded: Pick<GroundedScore, 'dimensions'>, max = 3): CaseDriver[] {
  const strong = grounded.dimensions
    .filter(d => d.weight > 0 && (d.rawScore !== undefined ? d.rawScore >= STRONG_RAW_THRESHOLD : d.qualitativeLevel === 'High'))
    .sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0))
  return strong.slice(0, max).map(toDriver)
}

export function selectAgainstDrivers(grounded: Pick<GroundedScore, 'dimensions'>, max = 2): CaseDriver[] {
  const weak = grounded.dimensions
    .filter(d => d.weight > 0 && (d.rawScore !== undefined ? d.rawScore <= WEAK_RAW_THRESHOLD : d.qualitativeLevel === 'Low'))
    .sort((a, b) => (a.rawScore ?? 10) - (b.rawScore ?? 10))
  return weak.slice(0, max).map(toDriver)
}

// The primary-risk sentence (writer_output.risk_sentence), when real and
// not a fallback — surfaced as the FIRST "against" row so the Brief's
// primary risk is said unprompted (V4 §3 T1) without adding a fourth
// first-viewport element. Its evidence-sheet grounding is the weakest
// scored dimension (the real driver most likely behind that sentence).
//
// Independent-review fix (finding 3a): the naive "globally weakest
// dimension" pick can land on a dimension that is itself strong (rawScore
// >= STRONG_RAW_THRESHOLD, or qualitativeLevel 'High') whenever EVERY
// scored dimension is strong — the exact same dimension would then also
// appear in selectForDrivers' "for" list, showing the same claim as both a
// reason for and against in one Brief. When the weakest-of-all candidate
// is itself strong, this no longer attaches it as evidence at all: the
// risk sentence stands alone, "my judgment," no number, no dimension tie
// (falls back to the synthetic 'primary_risk' claim key, which can never
// collide with a real ScoreDimension.key).
export interface PrimaryRiskDriver extends CaseDriver { isRiskSentence: true }

export function buildPrimaryRiskDriver(
  m: Pick<MemoData, 'writer_output'>,
  grounded: Pick<GroundedScore, 'dimensions'>,
): PrimaryRiskDriver | null {
  const w = m.writer_output
  if (!w || w.risk_sentence_is_fallback || !w.risk_sentence) return null
  const weakest = [...grounded.dimensions]
    .filter(d => d.weight > 0)
    .sort((a, b) => (a.rawScore ?? (a.qualitativeLevel === 'Low' ? 0 : 10)) - (b.rawScore ?? (b.qualitativeLevel === 'Low' ? 0 : 10)))[0]
  const groundable = !!weakest && !isStrongDimension(weakest)
  return {
    claimKey:       groundable ? weakest!.key : 'primary_risk',
    label:          'Primary risk',
    text:           w.risk_sentence,
    number:         groundable ? dimensionNumber(weakest!) : '—',
    provenance:     groundable ? scoreDimensionProvenance(weakest!.source) : 'my judgment',
    isRiskSentence: true,
  }
}

/** Composes the final against-list: primary risk sentence first (when real), then the next-weakest dimensions, capped at `max`, deduplicated on claimKey, never padded. Independent-review fix (finding 3b): hard cross-dedup against forDrivers' own claim keys — the same dimension must never appear in both lists, belt-and-suspenders alongside 3a. */
export function buildAgainstCase(
  m: Pick<MemoData, 'writer_output'>,
  grounded: Pick<GroundedScore, 'dimensions'>,
  max = 2,
): CaseDriver[] {
  const forKeys = new Set(selectForDrivers(grounded).map(d => d.claimKey))
  const risk = buildPrimaryRiskDriver(m, grounded)
  const riskCollides = !!risk && forKeys.has(risk.claimKey)
  const rest = selectAgainstDrivers(grounded, max)
    .filter(d => !forKeys.has(d.claimKey))
    .filter(d => !risk || d.claimKey !== risk.claimKey)
  const combined = (risk && !riskCollides) ? [risk, ...rest] : rest
  return combined.slice(0, max)
}

// ── The window, in words (deriveLifecycleDisplay + formatGapVelocity —
// both real, both from components/memo/field-derivations.ts, the caller's
// job to pass in; this function only composes the sentence). Returns null
// (render nothing) unless the lifecycle stage is real. ───────────────────
export function windowInWords(
  lifecycle: { stage: string } | null,
  gapVelocity: { display: string; value: number } | null,
): string | null {
  if (!lifecycle) return null
  if (!gapVelocity) return `The window: ${lifecycle.stage}.`
  const direction = gapVelocity.value > 0 ? 'widening' : gapVelocity.value < 0 ? 'narrowing' : 'flat'
  return `The window: ${lifecycle.stage}, and ${direction} (${gapVelocity.display}).`
}

// ── Freshness stamp (CPO amendment, mandatory — V4_PRODUCT_ARCHITECTURE.md
// §5). ─────────────────────────────────────────────────────────────────
export function freshnessStamp(createdAtIso: string): string {
  const d = new Date(createdAtIso)
  const dateStr = isNaN(d.getTime())
    ? 'an unknown date'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `Researched ${dateStr} · conditions re-checked weekly · the full picture may have moved since`
}

// ── Validation plan (Pull → Validate sheet): steps + real budget + real
// success metrics. See the header note — a fresh pure derivation over the
// same real MemoData fields components/memo/shared.tsx's deriveValidation*
// read, NOT an import of that banned module. Never fabricates a field: a
// missing real input (no ad_phrases, no consumer_intelligence themes,
// etc.) simply falls back to a decision-generic line, exactly as the
// legacy derivations already did. ─────────────────────────────────────────
export interface ValidationPlan {
  steps:          string[]
  budget:         { range: string; breakdown: string }
  successMetrics: string[]
}

export function buildValidationPlan(m: MemoData, decision: BuildDecision): ValidationPlan {
  const gap  = m.market_gaps?.[0]?.replace(/\.$/, '') ?? 'the gap I found'
  const pain = m.consumer_intelligence?.negativeThemes?.[0]?.label ?? m.customer_language?.frustrations?.[0]
  const copy = m.customer_language?.ad_phrases?.[0]?.use_in_copy
  const fmt  = m.product_recommendation?.format ?? 'the product'

  let steps: string[]
  if (decision === 'BUILD_NOW') {
    steps = [
      'Order a minimum test batch at the stated cost and set a 30-day sell-through deadline.',
      `Launch a landing page built around: ${gap}.`,
      copy ? `Run a $2k–$3k paid test with this line: "${copy}".` : 'Run a $2k–$3k paid test on your strongest channel.',
      "Track CAC and subscription conversion — I'll hold you to the numbers below at day 30 and day 60.",
    ]
  } else if (decision === 'VALIDATE_FURTHER') {
    steps = [
      'Hold off on manufacturing. Build the pre-sell page first.',
      pain ? `Talk to 10–20 customers about: "${pain}".` : 'Talk to 10–20 customers about the core pain point.',
      'Run a $1k–$2k paid test to see if organic demand and signups show up.',
      `Only move to ${fmt} manufacturing if pre-sell conversion clears 2% in 30 days.`,
    ]
  } else if (decision === 'CATEGORY_CREATION_CANDIDATE') {
    steps = [
      'The demand I found is for the broader category, not this exact idea — test the specific variant on its own before assuming it inherits that demand.',
      'Run a small paid test or landing page using this exact positioning.',
      'Hold off on manufacturing until the specific-variant test shows real signal of its own.',
    ]
  } else {
    steps = [
      'I would not put manufacturing capital here at this evidence level.',
      'If you go anyway, test the single biggest risk first, as cheaply as possible.',
    ]
  }

  const mfgLevel = dimLevelWithLegacyFallback(m.scores?.manufacturing)
  let budget: ValidationPlan['budget']
  if (decision === 'SKIP') {
    budget = { range: '$500–$2k', breakdown: 'Market research only — I would not fund manufacturing here.' }
  } else if (decision === 'VALIDATE_FURTHER') {
    budget = { range: '$1k–$3k', breakdown: 'Pre-sell page + customer interviews — no manufacturing yet.' }
  } else if (decision === 'CATEGORY_CREATION_CANDIDATE') {
    budget = { range: '$1k–$3k', breakdown: "A specific-variant pre-sell test — the category's demand does not transfer automatically." }
  } else {
    const [mfgLo, mfgHi, totalLo, totalHi] =
      mfgLevel === 'High'   ? ['$2k', '$5k',  '$4k',  '$10k'] :
      mfgLevel === 'Medium' ? ['$4k', '$10k', '$7k',  '$18k'] :
                               ['$8k', '$20k', '$12k', '$28k']
    budget = { range: `${totalLo}–${totalHi}`, breakdown: `Test batch (${mfgLo}–${mfgHi}) + paid acquisition test ($2k–$5k) + logistics.` }
  }

  const fp  = m.financial_projections
  const sub = m.scores?.subscription?.level
  const successMetrics: string[] = []
  if (fp?.ten_k_probability && fp.ten_k_probability !== 'N/A') {
    successMetrics.push(`Reach $10k MRR within 90 days (my model's probability at generation: ${fp.ten_k_probability}).`)
  }
  if (fp?.gross_margin && fp.gross_margin !== 'N/A' && !fp.gross_margin.toLowerCase().includes('not independently verified')) {
    successMetrics.push(`Hold gross margin at or above ${fp.gross_margin} by month 3.`)
  }
  successMetrics.push(sub === 'High'
    ? 'Subscription conversion above 30% of first-time buyers.'
    : 'Repeat purchase rate above 20% within 60 days.')

  return { steps, budget, successMetrics: successMetrics.slice(0, 4) }
}

// ── Tap-to-interrogate: templated grounded lookups (V4_PRODUCT_
// ARCHITECTURE.md §5 Interrogation — "no free-text LLM chat," every number
// carrying its source). Maps a ScoreDimension key to the real underlying
// facts already persisted on this analysis's memo_data — never a second
// LLM call, never a fabricated fact. Returns an empty facts list (never a
// fabricated one) when this analysis has none of the relevant real fields. */
export interface EvidenceFact { label: string; value: string; provenance: PlainProvenance }
export interface ClaimEvidence { title: string; facts: EvidenceFact[] }

export function buildClaimEvidence(claimKey: string, m: MemoData): ClaimEvidence {
  const se = m.signal_evidence
  const facts: EvidenceFact[] = []

  switch (claimKey) {
    case 'demand': {
      const topKw = m.keyword_intelligence?.top_buying?.[0]
      if (topKw) facts.push({ label: 'Search volume', value: `${topKw.monthly_searches.toLocaleString()}/mo — "${topKw.keyword}"`, provenance: 'measured' })
      if (se?.growth?.value.yoy_change) facts.push({ label: 'YoY growth', value: `${se.growth.value.yoy_change} (${se.growth.primarySource})`, provenance: 'measured' })
      if (se?.growth?.value.momentum) facts.push({ label: 'Momentum', value: se.growth.value.momentum, provenance: 'measured' })
      if (se?.demand?.value.trend) facts.push({ label: 'Trend', value: se.demand.value.trend, provenance: 'measured' })
      return { title: 'Demand', facts }
    }
    case 'marketAccessibility': {
      const rv = se?.review_velocity?.value
      if (rv?.meaningful_competitor_count !== undefined) facts.push({ label: 'Meaningful competitors', value: String(rv.meaningful_competitor_count), provenance: 'measured' })
      if (rv?.review_concentration_ratio !== undefined) facts.push({ label: 'Review concentration (top 3)', value: `${Math.round(rv.review_concentration_ratio * 100)}%`, provenance: 'measured' })
      const c = se?.competition?.value
      if (c?.distinct_brand_count !== undefined) facts.push({ label: 'Distinct brands', value: String(c.distinct_brand_count), provenance: 'measured' })
      if (c?.barrier) facts.push({ label: 'Barrier to entry', value: c.barrier, provenance: 'measured' })
      return { title: 'Market Accessibility', facts }
    }
    case 'profitability': {
      const pr = m.product_recommendation
      if (pr?.cogs_estimate) facts.push({ label: 'COGS estimate', value: pr.cogs_estimate, provenance: 'my judgment' })
      if (pr?.retail_price) facts.push({ label: 'Suggested retail', value: pr.retail_price, provenance: 'my judgment' })
      const gm = m.financial_projections?.gross_margin
      if (gm && gm !== 'N/A') facts.push({ label: 'Gross margin', value: gm, provenance: gm.toLowerCase().includes('not independently verified') ? "couldn't verify" : 'my judgment' })
      if (m.manufacturing_estimate?.realistic_unit_cost) {
        const r = m.manufacturing_estimate.realistic_unit_cost
        facts.push({ label: 'Real supplier unit cost (low-MOQ tier)', value: `$${r.low}–$${r.high}`, provenance: 'measured' })
      }
      return { title: 'Profitability', facts }
    }
    case 'consumerPain': {
      const theme = m.consumer_intelligence?.negativeThemes?.[0]
      if (theme) facts.push({ label: 'Top complaint theme', value: `${theme.label} (${theme.mentionedBy}/${theme.outOf} reviews)`, provenance: 'measured' })
      const frustration = m.customer_language?.frustrations?.[0]
      if (frustration) facts.push({ label: 'Customer language', value: frustration, provenance: 'my judgment' })
      return { title: 'Customer Opportunity', facts }
    }
    case 'virality': {
      const v = se?.virality?.value
      if (v?.video_count !== undefined) facts.push({ label: 'TikTok videos', value: v.video_count.toLocaleString(), provenance: 'measured' })
      if (v?.view_count !== undefined) facts.push({ label: 'TikTok views', value: v.view_count.toLocaleString(), provenance: 'measured' })
      if (v?.content_potential) facts.push({ label: 'Content potential', value: v.content_potential, provenance: 'my judgment' })
      return { title: 'Virality', facts }
    }
    case 'subscription': {
      const s = m.scores?.subscription
      if (s?.level) facts.push({ label: 'Retention fit', value: s.level, provenance: 'my judgment' })
      if (s?.notes) facts.push({ label: 'Why', value: s.notes, provenance: 'my judgment' })
      return { title: 'Subscription / Retention', facts }
    }
    default:
      return { title: 'Evidence', facts: [] }
  }
}

// ── Kill flow: redirection line only when real market_gaps/brand_
// opportunities exist for this memo (never fabricated). ──────────────────
export function killRedirectionLine(m: Pick<MemoData, 'market_gaps' | 'brand_opportunities'>): string | null {
  const gap = m.market_gaps?.[0]
  const angle = m.brand_opportunities?.[0]
  if (!gap && !angle) return null
  if (gap && angle) return `If you're still looking here: ${gap} — or reposition around ${angle}.`
  return `If you're still looking here: ${gap ?? angle}.`
}

// ── The one-beat reveal transition (V4_PRODUCT_ARCHITECTURE.md §5:
// "<1s; instant under prefers-reduced-motion") — extracted to a pure,
// exported function (QA finding: the reduced-motion zero-duration
// behavior was unverifiable in-browser with the available tooling and
// untested) so it gets real unit coverage. components/partner/brief/
// BriefView.tsx staggers its three first-viewport blocks via `delay`;
// `reduce` zeroes both duration and delay — the element tree itself never
// branches on `reduce` (only transition timing does), so server/client
// hydration never mismatches, same convention as components/pi/
// AttentionCard.tsx's own note on this exact class of bug.
export interface RevealTransition {
  duration: number
  delay:    number
  ease:     [number, number, number, number]
}

export function revealTransition(reduce: boolean, delay = 0): RevealTransition {
  return { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }
}
