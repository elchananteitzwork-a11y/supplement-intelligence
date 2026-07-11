// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — charts
// Same data shapes and math as the prior implementation (every number
// already real — see lib/keyword-engine/derive.ts) — re-skinned per §11:
// solid Photon for verified series, dashed Amber for estimated/projected,
// rounded bars, single zero baseline, mono data labels.
// ═══════════════════════════════════════════════════════════════════════

import type { KeywordCluster, KeywordForecastPoint, KeywordMetric, KeywordSeasonality } from '@/lib/keyword-engine/types'

const PHOTON = '#000000'
const AMBER = '#a67c00'
const VERDANT = '#008a00'
const EMBER = '#d32f2f'
const GRID = 'rgba(0,0,0,0.15)'
const AXIS_TEXT = '#7e7576'

export function MomentumSparkline({ positive, accent }: { positive: boolean; accent: string }) {
  const points: [number, number][] = positive
    ? [[2, 34], [26, 28], [50, 19], [74, 11], [98, 4]]
    : [[2, 4], [26, 11], [50, 19], [74, 28], [98, 35]]
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const [lx, ly] = points[points.length - 1]
  return (
    <svg viewBox="0 0 100 40" className="w-16 h-7 shrink-0">
      <path
        d={d} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 130, animation: 'sparklineDraw 1s var(--lab-ease-enter, ease) both' }}
      />
      <circle cx={lx} cy={ly} r="3" fill={accent} />
    </svg>
  )
}

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
          return (
            <rect
              key={i} x={x + 1} y={H - PAD - barH} width={Math.max(1, barW - 2)} height={barH}
              rx={2} fill="rgba(0,0,0,0.10)"
            />
          )
        })}
        <polyline points={linePoints} fill="none" stroke={PHOTON} strokeWidth="1.75" strokeLinejoin="round" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-[#7e7576] mt-1.5">
        <span>{history[0].year}-{String(history[0].month).padStart(2, '0')}</span>
        <span>{history[history.length - 1].year}-{String(history[history.length - 1].month).padStart(2, '0')}</span>
      </div>
    </div>
  )
}

const KEYWORD_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const bars = KEYWORD_NAMES_SHORT.map((name, i) => {
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
        const color = b.isPeak ? VERDANT : b.isLow ? EMBER : '#e2e2e2'
        return (
          <g key={b.name}>
            <rect x={x + 1} y={H - 18 - barH} width={Math.max(1, barW - 2)} height={barH} rx={2} fill={color} />
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
      {/* Dashed line = projected/estimated, per §11's uncertainty convention */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <polyline points={points} fill="none" stroke={AMBER} strokeWidth="1.75" strokeDasharray="4 3" strokeLinejoin="round" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} />
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-[#7e7576] mt-1.5">
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
  if (!pts.length) return <p className="text-xs text-[#7e7576] italic py-4 text-center">No competition-index data available for this query.</p>

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
        const color = score >= 60 ? VERDANT : score >= 35 ? AMBER : '#7e7576'
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
          <span className="text-xs text-[#4c4546] w-28 shrink-0 truncate">{c.label}</span>
          <div className="flex-1 h-2 rounded-full bg-[#e2e2e2] overflow-hidden">
            <div className="h-full rounded-full bg-black/60" style={{ width: `${(c.count / maxCount) * 100}%` }} />
          </div>
          <span className="font-mono text-xs text-[#4c4546] w-8 text-right shrink-0">{c.count}</span>
        </div>
      ))}
    </div>
  )
}
