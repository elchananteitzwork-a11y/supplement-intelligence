'use client'

import type { InvestmentCase } from '@/lib/stage3/adversarial'
import type { KillSwitchResult } from '@/lib/stage3/kill-switches'

interface DebateRow {
  id: string
  bull_case: InvestmentCase
  bear_case: InvestmentCase
  conflicts: string[]
  unknowns: string[]
  kill_switches: KillSwitchResult[]
  all_switches_clear: boolean
  ai_model_version: string
}

interface Props {
  debate: DebateRow
  thesisLabel: string
}

const KS_COLORS: Record<string, string> = {
  clear:    'border-green-800 bg-green-950/20',
  flagged:  'border-yellow-800 bg-yellow-950/20',
  boundary: 'border-orange-800 bg-orange-950/20',
}

function KillSwitchPanel({ ks }: { ks: KillSwitchResult }) {
  const state = ks.triggered ? 'flagged' : ks.boundary_zone ? 'boundary' : 'clear'
  const icon  = ks.triggered ? '⚠' : ks.boundary_zone ? '△' : '✓'
  const colors = KS_COLORS[state]

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1 ${colors}`}>
      <div className="flex items-start gap-2">
        <span className={`font-bold text-sm ${
          state === 'flagged' ? 'text-yellow-400' :
          state === 'boundary' ? 'text-orange-400' :
          'text-green-400'
        }`}>{icon}</span>
        <div className="flex-1">
          <p className="text-xs font-mono font-semibold text-gray-300">{ks.id}</p>
          <p className="text-xs text-gray-400 mt-0.5">{ks.reason}</p>
        </div>
      </div>
      {ks.mandatory_notice && (
        <div className="mt-2 text-xs text-yellow-300 border-t border-yellow-900/50 pt-2 leading-relaxed">
          {ks.mandatory_notice}
        </div>
      )}
    </div>
  )
}

function CasePanel({
  label,
  color,
  case: c,
}: {
  label: string
  color: 'bull' | 'bear'
  case: InvestmentCase
}) {
  const headerClass = color === 'bull'
    ? 'border-green-800 bg-green-950/20'
    : 'border-red-800 bg-red-950/20'
  const labelClass = color === 'bull' ? 'text-green-400' : 'text-red-400'
  const pointDot   = color === 'bull' ? 'text-green-600' : 'text-red-600'

  return (
    <div className={`rounded-xl border ${headerClass} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}>{label}</span>
        <span className="text-xs text-gray-500 font-mono">
          {color === 'bull' ? 'temp 0.5' : 'temp 0.8'} · confidence {Math.round(c.confidence * 100)}%
        </span>
      </div>

      <p className="text-sm text-gray-200 leading-relaxed">{c.core_argument}</p>

      {c.strongest_points.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Strongest points</p>
          <ul className="space-y-1">
            {c.strongest_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 ${pointDot} font-bold shrink-0`}>·</span>
                <span className="text-gray-300">{pt}</span>
                {c.evidence_citations[i] && (
                  <span className="text-gray-600 shrink-0 italic text-[10px] ml-auto">
                    [{c.evidence_citations[i]}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.key_assumptions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Assumptions</p>
          <ul className="space-y-1">
            {c.key_assumptions.map((a, i) => (
              <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                <span className="shrink-0">if</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500 italic border-t border-gray-800 pt-2">{c.confidence_note}</p>
    </div>
  )
}

export function AdversarialDebate({ debate, thesisLabel }: Props) {
  const triggeredSwitches = debate.kill_switches.filter(k => k.triggered || k.boundary_zone)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Adversarial Evaluation</h2>
          {debate.all_switches_clear ? (
            <span className="text-xs bg-green-950 border border-green-800 text-green-400 px-2 py-0.5 rounded">
              All kill switches clear
            </span>
          ) : (
            <span className="text-xs bg-yellow-950 border border-yellow-800 text-yellow-400 px-2 py-0.5 rounded">
              {debate.kill_switches.filter(k => k.triggered).length} kill switch(es) triggered
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">{thesisLabel} · {debate.ai_model_version}</p>
      </div>

      {/* Kill switches */}
      {triggeredSwitches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kill Switches</p>
          {debate.kill_switches.map(ks => <KillSwitchPanel key={ks.id} ks={ks} />)}
        </div>
      )}

      {/* Bull / Bear side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CasePanel label="Bull Case" color="bull" case={debate.bull_case} />
        <CasePanel label="Bear Case" color="bear" case={debate.bear_case} />
      </div>

      {/* Conflicts */}
      {debate.conflicts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Direct Conflicts</p>
          <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
            {debate.conflicts.map((c, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-orange-500 font-bold shrink-0">⇔</span>
                <span className="text-gray-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unknowns */}
      {debate.unknowns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Key Unknowns</p>
          <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
            {debate.unknowns.map((u, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-gray-600 font-bold shrink-0">?</span>
                <span className="text-gray-400">{u}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kill switches — all (clear ones shown as confirmation) */}
      {triggeredSwitches.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kill Switch Status</p>
          {debate.kill_switches.map(ks => <KillSwitchPanel key={ks.id} ks={ks} />)}
        </div>
      )}
    </div>
  )
}
