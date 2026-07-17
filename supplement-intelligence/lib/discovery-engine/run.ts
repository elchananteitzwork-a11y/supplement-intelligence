// ── Discovery Intelligence Engine — orchestrator — Roadmap M2.12 ─────────────
//
// docs/MASTER_EXECUTION_PLAN.md §2/§4. Reads real niche_timeseries history
// for a given list of candidate niche keys, runs the acceleration detector
// per real (source, metric) series, and records a Discovery Alert on every
// real crossing. No new fetches — this only reads what M2.11's batch jobs
// already wrote.
//
// Category-agnostic by design: this module takes candidateNicheKeys as a
// PARAMETER and never imports a category-specific candidate list itself
// (e.g. lib/science-engine's TRACKED_INGREDIENTS). Today's only real call
// site (app/api/cron/science-pipeline) passes TRACKED_INGREDIENTS in —
// Supplements-First execution is a wiring choice at that call site, not an
// assumption baked into this engine. A future Beauty/Pets/Home cron can
// call runDiscoveryDetection with its own candidate list without editing
// anything in this directory.
//
// Deliberately NOT built here (see the M2.12 R&D doc for full reasoning):
// cross-source confirmation (no candidate has a second real source yet),
// a sustained/hype-window requirement (would delay any real alert for
// weeks with no evidence it's needed), a Decision Engine handoff, and a
// calibration worker — none have real data to operate on yet.
//
// Roadmap M2.22 review fix: app/api/cron/science-pipeline now runs this
// AND runDivergenceDetection over the identical candidate list in the same
// request, which would otherwise issue two separate niche_timeseries reads
// per candidate. The optional observationsByNicheKey parameter lets that
// one real call site fetch each candidate's series once and hand the same
// already-fetched result to both detectors. Falls back to this function's
// original self-fetch per candidate when the map is absent, or when a
// given candidate has no entry in it — fully backward-compatible with
// every existing caller and test.

import { getRecentObservations, writeDiscoveryAlert, type NicheSeries } from './service-store'
import { detectAcceleration } from './detector'

export interface DiscoveryDetectionResult {
  candidatesChecked: number
  seriesEvaluated:   number
  alertsRecorded:    number
}

export async function runDiscoveryDetection(
  candidateNicheKeys: string[],
  now = new Date(),
  observationsByNicheKey?: Map<string, NicheSeries[]>,
): Promise<DiscoveryDetectionResult> {
  const result: DiscoveryDetectionResult = { candidatesChecked: 0, seriesEvaluated: 0, alertsRecorded: 0 }

  for (const nicheKey of candidateNicheKeys) {
    const series = observationsByNicheKey?.get(nicheKey) ?? await getRecentObservations(nicheKey)
    result.candidatesChecked++

    for (const s of series) {
      result.seriesEvaluated++
      const accel = detectAcceleration(s.points)
      if (!accel || !accel.isAccelerating) continue

      await writeDiscoveryAlert({
        nicheKey,
        source: s.source,
        metric: s.metric,
        priorValue: accel.priorValue,
        latestValue: accel.latestValue,
        changePct: accel.changePct,
        detectedAt: now,
      })
      result.alertsRecorded++
    }
  }

  return result
}
