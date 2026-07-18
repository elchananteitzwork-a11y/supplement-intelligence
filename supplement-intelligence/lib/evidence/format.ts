// ── Shared evidence display-string formatting ──────────────────────────────
// 2026-07-18 audit Finding 2: lib/stage4/memo-generator.ts and
// lib/stage2/thesis-generator.ts each maintained their own independent copy
// of CAERS/recalls/warning-flags regulatory-line formatting. Both happened
// to get the implicated-vs-raw-total honesty fix applied correctly on the
// same day, but nothing structurally prevented them from drifting apart on
// the next edit — the exact defect class this file exists to close off.
//
// Lives in lib/evidence/ (not lib/regulatory-engine/ or lib/stage4/) since
// both stage2 and stage4 already import types from lib/evidence/, and a
// stage4-owned location would invert the stage2 -> stage4 dependency
// direction.
//
// This is the exact format lib/stage4/memo-generator.ts's
// formatRegulatoryLinesForMemo already used (memo-generator.ts now delegates
// to this function verbatim — see its updated definition).

import type { RegulatoryIntelligence } from '../regulatory-engine/types'

export function formatRegulatoryIntelligence(reg: RegulatoryIntelligence | null | undefined): string[] {
  const lines: string[] = []
  if (!reg) return lines
  lines.push(`Regulatory risk (OpenFDA/CAERS): ${reg.risk_level} — ${reg.risk_summary}`)
  if (reg.adverse_events) {
    const ae = reg.adverse_events
    lines.push(`  CAERS reports: ${ae.implicated_reports} implicated of ${ae.total_reports.toLocaleString()} total · deaths: ${ae.death_count} · hospitalizations: ${ae.hospitalization_count}`)
    if (ae.top_reactions.length) lines.push(`  Top reported reactions: ${ae.top_reactions.slice(0, 4).join(', ')}`)
  }
  if (reg.recalls && reg.recalls.total_recalls > 0) {
    lines.push(`  Recalls on record: ${reg.recalls.implicated_recalls} implicated of ${reg.recalls.total_recalls} total (Class I: ${reg.recalls.class_i_recalls}, Class II: ${reg.recalls.class_ii_recalls})`)
  }
  if (reg.warning_flags.length) {
    lines.push(`  Regulatory flags: ${reg.warning_flags.join(' | ')}`)
  }
  lines.push(`  Note for prose: ${reg.disclaimer}`)
  return lines
}
