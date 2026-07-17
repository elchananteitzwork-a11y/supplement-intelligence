// ── Divergence Detector — orchestrator — Roadmap M2.22 ───────────────────────
//
// Mechanical sibling of lib/discovery-engine/run.ts: reads real
// niche_timeseries history for a given list of candidate niche keys (via
// the exact same getRecentObservations read path), runs the divergence
// comparison across each candidate's real (source, metric) series, and
// records a Divergence Alert on every real crossing. No new fetches — this
// only reads what M2.11's batch jobs (and any other niche_timeseries
// writer) already wrote.
//
// Category-agnostic by design, same as lib/discovery-engine/run.ts: takes
// candidateNicheKeys as a PARAMETER and never imports a category-specific
// candidate list itself. Today's only real call site
// (app/api/cron/science-pipeline) passes the identical TRACKED_INGREDIENTS
// list this route already passes to runDiscoveryDetection.
//
// Deliberately NOT built here, matching M2.12's own precedent: a
// calibration/precision worker, cross-source confirmation beyond the raw
// two-series comparison itself, hype filtering, a Decision Engine handoff,
// or any UI surface — none have real data to operate on yet.
//
// Review fix: app/api/cron/science-pipeline runs this AND
// runDiscoveryDetection over the identical candidate list in the same
// request, which would otherwise issue two separate niche_timeseries reads
// per candidate. The optional observationsByNicheKey parameter lets that
// one real call site fetch each candidate's series once and hand the same
// already-fetched result to both detectors. Falls back to this function's
// original self-fetch per candidate when the map is absent, or when a
// given candidate has no entry in it — fully backward-compatible with
// every existing caller and test.

import { getRecentObservations, writeDivergenceAlert, type NicheSeries } from './service-store'
import { detectSeriesDivergence } from './detector'

export interface DivergenceDetectionResult {
  candidatesChecked: number
  seriesEvaluated:   number
  alertsRecorded:    number
}

export async function runDivergenceDetection(
  candidateNicheKeys: string[],
  now = new Date(),
  observationsByNicheKey?: Map<string, NicheSeries[]>,
): Promise<DivergenceDetectionResult> {
  const result: DivergenceDetectionResult = { candidatesChecked: 0, seriesEvaluated: 0, alertsRecorded: 0 }

  for (const nicheKey of candidateNicheKeys) {
    const series = observationsByNicheKey?.get(nicheKey) ?? await getRecentObservations(nicheKey)
    result.candidatesChecked++
    result.seriesEvaluated += series.length

    const divergences = detectSeriesDivergence(series)
    if (!divergences) continue

    for (const d of divergences) {
      await writeDivergenceAlert({
        nicheKey,
        sourceA: d.sourceA, metricA: d.metricA, priorValueA: d.priorValueA, latestValueA: d.latestValueA, changePctA: d.changePctA,
        sourceB: d.sourceB, metricB: d.metricB, priorValueB: d.priorValueB, latestValueB: d.latestValueB, changePctB: d.changePctB,
        divergencePct: d.divergencePct,
        detectedAt: now,
      })
      result.alertsRecorded++
    }
  }

  return result
}
