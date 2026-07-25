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
  clear:    'border-pi-build/40',
  flagged:  'border-pi-gold/40',
  boundary: 'border-pi-risk/40',
}

function KillSwitchPanel({ ks }: { ks: KillSwitchResult }) {
  const state = ks.triggered ? 'flagged' : ks.boundary_zone ? 'boundary' : 'clear'
  const icon  = ks.triggered ? '⚠' : ks.boundary_zone ? '△' : '✓'
  const colors = KS_COLORS[state]

  return (
    <div className={`border px-4 py-3 space-y-1 bg-pi-card ${colors}`}>
      <div className="flex items-start gap-2">
        <span className={`font-bold text-sm ${
          state === 'flagged' ? 'text-pi-gold' :
          state === 'boundary' ? 'text-pi-risk' :
          'text-pi-build'
        }`}>{icon}</span>
        <div className="flex-1">
          <p className="text-xs font-mono font-semibold text-pi-sub">{ks.id}</p>
          <p className="text-xs text-pi-sub mt-0.5">{ks.reason}</p>
        </div>
      </div>
      {ks.mandatory_notice && (
        <div className="mt-2 text-xs text-pi-gold border-t border-pi-hairline/10 pt-2 leading-relaxed">
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
  const headerClass = color === 'bull' ? 'border-pi-build/40' : 'border-pi-risk/40'
  const labelClass  = color === 'bull' ? 'text-pi-build' : 'text-pi-risk'
  const pointDot    = color === 'bull' ? 'text-pi-build' : 'text-pi-risk'

  return (
    <div className={`border-2 ${headerClass} bg-pi-card p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</span>
        <span className="text-xs text-pi-faint font-mono">
          {color === 'bull' ? 'temp 0.5' : 'temp 0.8'} · confidence {Math.round(c.confidence * 100)}%
        </span>
      </div>

      <p className="text-sm text-pi-ink leading-relaxed">{c.core_argument}</p>

      {c.strongest_points.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">Strongest points</p>
          <ul className="space-y-1">
            {c.strongest_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 ${pointDot} font-bold shrink-0`}>·</span>
                <span className="text-pi-sub">{pt}</span>
                {c.evidence_citations?.[i] && (
                  <span className="text-pi-faint shrink-0 italic text-[10px] ml-auto">
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
          <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">Assumptions</p>
          <ul className="space-y-1">
            {c.key_assumptions.map((a, i) => (
              <li key={i} className="text-xs text-pi-faint flex gap-1.5">
                <span className="shrink-0">if</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-pi-faint italic border-t border-pi-hairline/10 pt-2">{c.confidence_note}</p>
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
          <h2 className="font-serif text-[26px] font-semibold leading-snug tracking-tight text-pi-ink">Adversarial Evaluation</h2>
          {debate.all_switches_clear ? (
            <span className="rounded-xl text-xs font-mono uppercase px-2 py-0.5 border border-pi-build/40 text-pi-build bg-pi-card">
              All kill switches clear
            </span>
          ) : (
            <span className="rounded-xl text-xs font-mono uppercase px-2 py-0.5 border border-pi-gold/40 text-pi-gold bg-pi-card">
              {debate.kill_switches.filter(k => k.triggered).length} kill switch(es) triggered
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-pi-faint">{thesisLabel} · {debate.ai_model_version}</p>
      </div>

      {/* Kill switches */}
      {triggeredSwitches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Kill Switches</p>
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
          <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Direct Conflicts</p>
          <HardCard variant="pi" padded={false} className="divide-y divide-pi-hairline/10">
            {debate.conflicts.map((c, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-pi-gold font-bold shrink-0">⇔</span>
                <span className="text-pi-sub">{c}</span>
              </div>
            ))}
          </HardCard>
        </div>
      )}

      {/* Unknowns */}
      {debate.unknowns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Key Unknowns</p>
          <HardCard variant="pi" padded={false} className="divide-y divide-pi-hairline/10">
            {debate.unknowns.map((u, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-xs">
                <span className="text-pi-faint font-bold shrink-0">?</span>
                <span className="text-pi-sub">{u}</span>
              </div>
            ))}
          </HardCard>
        </div>
      )}

      {/* Kill switches — all (clear ones shown as confirmation) */}
      {triggeredSwitches.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Kill Switch Status</p>
          {debate.kill_switches.map(ks => <KillSwitchPanel key={ks.id} ks={ks} />)}
        </div>
      )}
    </div>
  )
}
