// ── ClinicalTrials.gov (API v2) — real trial registration counts ────────────
//
// V2 Blueprint §5: "ClinicalTrials.gov | science | Trial registrations per
// ingredient/condition. Free." Uses the public v2 REST API — no API key,
// no auth (CONFIRMED VIA LIVE CALL 2026-07-13: berberine returned a real
// totalCount of 133). A single request per ingredient (countTotal=true,
// pageSize=1 — we only need the count, not the study list itself).
//
// Deliberately a single real total, not a fabricated multi-year series:
// the roadmap's own acceptance criteria attach "velocity" only to PubMed's
// publication counts, not to trial registrations — building a year-by-year
// trial series would mean either date-filtering by study start date (a
// materially different, noisier question — "when was this trial first
// registered" vs "when did it start") or inventing a series this milestone
// never asked for. A real, current total is the honest scope.

const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2/studies'

// Roadmap M2.16: bounded, disclosed sample size for the real study-design
// breakdown below — same "recent sample, not exhaustive" judgment call as
// pubmed.ts's EVIDENCE_SAMPLE_SIZE.
const DESIGN_SAMPLE_SIZE = 10

interface StudiesResponse {
  totalCount?: number
}

interface DesignField { studyType?: string; phases?: string[] }
interface StatusModule { overallStatus?: string }
interface ProtocolSection { designModule?: DesignField; statusModule?: StatusModule }
interface StudyRecord { protocolSection?: ProtocolSection }
interface StudiesListResponse { studies?: StudyRecord[] }

// NCI's real phase vocabulary, live under protocolSection.designModule.phases
// (CONFIRMED VIA LIVE CALL 2026-07-14 against ClinicalTrials.gov API v2 —
// the field does NOT live under a separate phaseModule, a real 400 the
// first implementation attempt hit). Real values seen: 'NA' (most
// supplement/behavioral trials — the FDA phase system applies to drugs, not
// dietary ingredients), 'EARLY_PHASE1', 'PHASE1'..'PHASE4'. 'NA' is
// deliberately excluded from the max-phase comparison below — it means "not
// applicable," not "phase zero," so counting it as a reached phase would be
// a fabricated signal, not a real one.
const PHASE_ORDER = ['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4']

export interface TrialDesignBreakdown {
  trial_study_types:        { interventional: number; observational: number }
  trial_max_phase_reached?: string
}

export async function fetchTrialRegistrationsCount(ingredient: string): Promise<number | null> {
  const params = new URLSearchParams({
    'query.term': ingredient,
    countTotal:   'true',
    pageSize:     '1',
  })

  try {
    const res = await fetch(`${CTGOV_BASE}?${params.toString()}`)
    if (!res.ok) {
      console.warn('ClinicalTrials.gov: non-200 response', { ingredient, status: res.status })
      return null
    }
    const data = await res.json() as StudiesResponse
    return typeof data.totalCount === 'number' ? data.totalCount : null
  } catch (e: unknown) {
    console.warn('ClinicalTrials.gov: request failed', { ingredient, error: e instanceof Error ? e.message : e })
    return null
  }
}

// ── Roadmap M2.16: Clinical Evidence Engine ──────────────────────────────────
// Real studyType/phases breakdown for a bounded, recent sample of this
// ingredient's registered trials (CONFIRMED VIA LIVE CALL 2026-07-14:
// protocolSection.designModule.studyType returns real 'INTERVENTIONAL' /
// 'OBSERVATIONAL' values; protocolSection.designModule.phases returns a real
// array like ['PHASE2'] or ['NA']). Counts, not a fabricated ratio — a study
// whose studyType is neither real value is simply excluded from the tally
// rather than guessed into one bucket. trial_max_phase_reached is undefined
// (never a fabricated value) when no sampled trial reported a real phase.
export async function fetchTrialDesignBreakdown(ingredient: string): Promise<TrialDesignBreakdown | null> {
  const params = new URLSearchParams({
    'query.term': ingredient,
    pageSize:     String(DESIGN_SAMPLE_SIZE),
    fields:       'protocolSection.designModule.studyType,protocolSection.designModule.phases,protocolSection.statusModule.overallStatus',
  })

  try {
    const res = await fetch(`${CTGOV_BASE}?${params.toString()}`)
    if (!res.ok) {
      console.warn('ClinicalTrials.gov: non-200 response (design breakdown)', { ingredient, status: res.status })
      return null
    }
    const data = await res.json() as StudiesListResponse
    const studies = data.studies ?? []

    let interventional = 0
    let observational   = 0
    let maxPhaseIdx = -1

    for (const study of studies) {
      const studyType = study.protocolSection?.designModule?.studyType
      if (studyType === 'INTERVENTIONAL') interventional++
      else if (studyType === 'OBSERVATIONAL') observational++

      for (const phase of study.protocolSection?.designModule?.phases ?? []) {
        const idx = PHASE_ORDER.indexOf(phase)
        if (idx > maxPhaseIdx) maxPhaseIdx = idx
      }
    }

    return {
      trial_study_types: { interventional, observational },
      trial_max_phase_reached: maxPhaseIdx >= 0 ? PHASE_ORDER[maxPhaseIdx] : undefined,
    }
  } catch (e: unknown) {
    console.warn('ClinicalTrials.gov: request failed (design breakdown)', { ingredient, error: e instanceof Error ? e.message : e })
    return null
  }
}
