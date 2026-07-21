// ═══════════════════════════════════════════════════════════════════════
// Keyword Intelligence charts — direct port of components/lab/Charts.tsx
// (deleted with the rest of components/lab/*), same data shapes and math
// (see lib/keyword-engine/derive.ts — every number here is already real).
// No lab-specific classes/vars; plain SVG + the pi-* token colors
// (UIv2-M2 Phase 2, 2026-07-21 — was the neo-brutalist token colors).
// ═══════════════════════════════════════════════════════════════════════

import type { KeywordCluster, KeywordForecastPoint, KeywordMetric, KeywordSeasonality } from '@/lib/keyword-engine/types'

// pi-* palette only (UIv2-M2 Phase 2, 2026-07-21) — was raw neo-brutalist
// hex constants (PHOTON/AMBER/VERDANT/EMBER), remapped 1:1 onto the pi
// tokens with the same meaning (ink/gold/build/risk).
const PHOTON = '#16171A'   // pi-ink
const AMBER  = '#C9971F'   // pi-gold-bright
const VERDANT = '#2E6B48'  // pi-build
const EMBER  = '#A13F2E'   // pi-risk
const GRID = 'rgba(22,23,26,0.09)'  // pi-hairline
const AXIS_TEXT = '#8C877C'  // pi-faint

export function VolumeTrendChart({ history }: { history: { year: number; month: number; volume: number }[] }) {
  if (history.length < 3) return null
  const W = 600, H = 160, PAD = 22
  const maxVol = Math.max(...history.map(h => h.volume), 1)
  const barW = (W - PAD * 2) / history.length
  const linePoints = history.map((h, i) => {
    const x = PAD + i * barW + barW / 2
    const y = H - PAD - (h.volume / maxVol) * (H - PAD * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {history.map((h, i) => {
          const x = PAD + i * barW
          const barH = (h.volume / maxVol) * (H - PAD * 2)
          return <rect key={i} x={x + 1} y={H - PAD - barH} width={Math.max(1, barW - 2)} height={barH} fill="rgba(22,23,26,0.08)" />
        })}
        <polyline points={linePoints} fill="none" stroke={PHOTON} strokeWidth="1.75" strokeLinejoin="round" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-pi-faint mt-1.5">
        <span>{history[0].year}-{String(history[0].month).padStart(2, '0')}</span>
        <span>{history[history.length - 1].year}-{String(history[history.length - 1].month).padStart(2, '0')}</span>
      </div>
    </div>
  )
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function SeasonalityChart({ history, seasonality }: {
  history: { year: number; month: number; volume: number }[]
  seasonality: KeywordSeasonality
}) {
  const byMonth: Record<number, number[]> = {}
  for (const h of history) {
    const idx = h.month - 1
    if (!byMonth[idx]) byMonth[idx] = []
    byMonth[idx].push(h.volume)
  }
  const bars = MONTH_NAMES_SHORT.map((name, i) => {
    const vals = byMonth[i] ?? []
    const avgVol = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    return { name, avgVol, isPeak: seasonality.peak_months.includes(name), isLow: seasonality.low_months.includes(name) }
  })
  const maxVol = Math.max(...bars.map(b => b.avgVol), 1)
  const W = 600, H = 120, PAD = 8
  const barW = (W - PAD * 2) / 12

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {bars.map((b, i) => {
        const barH = (b.avgVol / maxVol) * (H - 24)
        const x = PAD + i * barW
        const color = b.isPeak ? VERDANT : b.isLow ? EMBER : '#F6F0E0'
        return (
          <g key={b.name}>
            <rect x={x + 1} y={H - 18 - barH} width={Math.max(1, barW - 2)} height={barH} fill={color} />
            <text x={x + barW / 2} y={H - 4} fontSize="8" textAnchor="middle" fill={AXIS_TEXT}>{b.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function ForecastChart({ forecast }: { forecast: KeywordForecastPoint[] }) {
  const W = 600, H = 120, PAD = 20
  const maxVol = Math.max(...forecast.map(f => f.projected_volume), 1)
  const points = forecast.map((f, i) => {
    const x = PAD + (forecast.length > 1 ? (i / (forecast.length - 1)) * (W - PAD * 2) : 0)
    const y = H - PAD - (f.projected_volume / maxVol) * (H - PAD * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <div>
      {/* Dashed line = projected/estimated, the uncertainty convention used
          throughout this design system (see GapChart's supply line). */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <polyline points={points} fill="none" stroke={AMBER} strokeWidth="1.75" strokeDasharray="4 3" strokeLinejoin="round" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-pi-faint mt-1.5">
        <span>{forecast[0]?.month}</span>
        <span>{forecast[forecast.length - 1]?.month}</span>
      </div>
    </div>
  )
}

export function OpportunityHeatmap({ metrics }: { metrics: KeywordMetric[] }) {
  const pts = [...metrics]
    .filter(m => m.competition !== null && m.competition !== undefined)
    .sort((a, b) => b.monthly_searches - a.monthly_searches)
    .slice(0, 25)
  if (!pts.length) return <p className="text-xs text-pi-faint italic py-4 text-center">No competition-index data available for this query.</p>

  const W = 600, H = 260, PAD = 30
  const maxVol = Math.max(...pts.map(p => p.monthly_searches), 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={GRID} />
      {pts.map((p, i) => {
        const x = PAD + (p.competition ?? 0) * (W - PAD * 2)
        const y = H - PAD - (Math.log10(p.monthly_searches + 1) / Math.log10(maxVol + 1)) * (H - PAD * 2)
        const score = p.opportunity_score ?? 0
        const r = 3 + (score / 100) * 8
        const color = score >= 60 ? VERDANT : score >= 35 ? AMBER : '#8C877C'
        return <circle key={p.keyword + i} cx={x} cy={y} r={r} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1} />
      })}
      <text x={PAD} y={H - 10} fontSize="8" fill={AXIS_TEXT}>Low competition</text>
      <text x={W - PAD - 62} y={H - 10} fontSize="8" fill={AXIS_TEXT}>High competition</text>
      <text x={PAD + 2} y={PAD - 8} fontSize="8" fill={AXIS_TEXT}>High volume ↑</text>
    </svg>
  )
}

export function ClusterDistributionChart({ clusters }: { clusters: KeywordCluster[] }) {
  const withCounts = clusters.map(c => ({ label: c.label, count: c.keywords.length }))
  const maxCount = Math.max(...withCounts.map(c => c.count), 1)
  return (
    <div className="space-y-2">
      {withCounts.map(c => (
        <div key={c.label} className="flex items-center gap-3">
          <span className="text-xs text-pi-sub w-28 shrink-0 truncate">{c.label}</span>
          <div className="flex-1 h-2 rounded-full bg-pi-hairline overflow-hidden">
            <div className="h-full bg-pi-ink/60" style={{ width: `${(c.count / maxCount) * 100}%` }} />
          </div>
          <span className="font-mono text-xs text-pi-sub w-8 text-right shrink-0">{c.count}</span>
        </div>
      ))}
    </div>
  )
}
