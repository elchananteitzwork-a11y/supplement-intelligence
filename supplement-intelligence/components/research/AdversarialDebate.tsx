'use client'

import type { InvestmentCase } from '@/lib/stage3/adversarial'
import type { KillSwitchResult } from '@/lib/stage3/kill-switches'
import { HardCard } from '@/components/ui'

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
  clear:    'border-verdict-positive',
  flagged:  'border-verdict-caution-text',
  boundary: 'border-verdict-negative',
}

function KillSwitchPanel({ ks }: { ks: KillSwitchResult }) {
  const state = ks.triggered ? 'flagged' : ks.boundary_zone ? 'boundary' : 'clear'
  const icon  = ks.triggered ? '⚠' : ks.boundary_zone ? '△' : '✓'
  const colors = KS_COLORS[state]

  return (
    <div className={`border px-4 py-3 space-y-1 bg-white ${colors}`}>
      <div className="flex items-start gap-2">
        <span className={`font-bold text-sm ${
          state === 'flagged' ? 'text-verdict-caution-text' :
          state === 'boundary' ? 'text-verdict-negative' :
          'text-verdict-positive'
        }`}>{icon}</span>
        <div className="flex-1">
          <p className="text-xs font-mono font-semibold text-ink-variant">{ks.id}</p>
          <p className="text-xs text-ink-variant mt-0.5">{ks.reason}</p>
        </div>
      </div>
      {ks.mandatory_notice && (
        <div className="mt-2 text-xs text-verdict-caution-text border-t border-black/10 pt-2 leading-relaxed">
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
  const headerClass = color === 'bull' ? 'border-verdict-positive' : 'border-verdict-negative'
  const labelClass  = color === 'bull' ? 'text-verdict-positive' : 'text-verdict-negative'
  const pointDot    = color === 'bull' ? 'text-verdict-positive' : 'text-verdict-negative'

  return (
    <div className={`border-2 ${headerClass} bg-white p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</span>
        <span className="text-xs text-outline font-mono">
          {color === 'bull' ? 'temp 0.5' : 'temp 0.8'} · confidence {Math.round(c.confidence * 100)}%
        </span>
      </div>

      <p className="text-sm text-ink leading-relaxed">{c.core_argument}</p>

      {c.strongest_points.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-mono font-semibold text-outline uppercase tracking-wider">Strongest points</p>
          <ul className="space-y-1">
            {c.strongest_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 ${pointDot} font-bold shrink-0`}>·</span>
                <span className="text-ink-variant">{pt}</span>
                {c.evidence_citations?.[i] && (
                  <span className="text-outline shrink-0 italic text-[10px] ml-auto">
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
          <p className="text-[10px] font-mono font-semibold text-outline uppercase tracking-wider">Assumptions</p>
          <ul className="space-y-1">
            {c.key_assumptions.map((a, i) => (
              <li key={i} className="text-xs text-outline flex gap-1.5">
                <span className="shrink-0">if</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-outline italic border-t border-black/10 pt-2">{c.confidence_note}</p>
    </div>
  )
}

export function AdversarialDebate({ debate, thesisLabel }: Props) {
  const triggeredSwitches = debate.kill_switches.filter(k => k.triggered || k.boundary_zone)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-headline-md text-black">Adversarial Evaluation</h2>
          {debate.all_switches_clear ? (
            <span className="text-xs font-mono uppercase px-2 py-0.5 border border-verdict-positive text-verdict-positive bg-white">
              All kill switches clear
            </span>
          ) : (
            <span className="text-xs font-mono uppercase px-2 py-0.5 border border-verdict-caution-text text-verdict-caution-text bg-white">
              {debate.kill_switches.filter(k => k.triggered).length} kill switch(es) triggered
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-outline">{thesisLabel} · {debate.ai_model_version}</p>
      </div>

      {/* Kill switches */}
      {triggeredSwitches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Kill Switches</p>
          {triggeredSwitches.map(ks => <KillSwitchPanel key={ks.id} ks={ks} />)}
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
          <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Direct Conflicts</p>
          <HardCard padded={false} className="divide-y divide-black/10">
            {debate.conflicts.map((c, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-verdict-caution-text font-bold shrink-0">⇔</span>
                <span className="text-ink-variant">{c}</span>
              </div>
            ))}
          </HardCard>
        </div>
      )}

      {/* Unknowns */}
      {debate.unknowns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Key Unknowns</p>
          <HardCard padded={false} className="divide-y divide-black/10">
            {debate.unknowns.map((u, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-outline font-bold shrink-0">?</span>
                <span className="text-ink-variant">{u}</span>
              </div>
            ))}
          </HardCard>
        </div>
      )}

      {/* Kill switches — all (clear ones shown as confirmation) */}
      {triggeredSwitches.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Kill Switch Status</p>
          {debate.kill_switches.map(ks => <KillSwitchPanel key={ks.id} ks={ks} />)}
        </div>
      )}
    </div>
  )
}
