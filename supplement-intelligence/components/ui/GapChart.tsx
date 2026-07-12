// Dual-line demand/supply SVG comparison chart with a shaded delta band.
// Both series must be real (e.g. real search-volume history vs. a real
// competitor-count proxy) — never synthesize a series to fill this chart.
export function GapChart({
  demand, supply, labels, demandLabel = 'Demand', supplyLabel = 'Supply',
}: {
  demand: number[]
  supply: number[]
  labels: string[]
  demandLabel?: string
  supplyLabel?: string
}) {
  if (demand.length < 2 || supply.length < 2) return null
  const W = 600, H = 160, PAD = 24
  const all = [...demand, ...supply]
  const max = Math.max(...all, 1)
  const min = Math.min(...all, 0)
  const range = max - min || 1
  const n = demand.length
  const stepX = (W - PAD * 2) / (n - 1)
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const demandPts = demand.map((v, i) => `${PAD + i * stepX},${toY(v)}`).join(' ')
  const supplyPts = supply.map((v, i) => `${PAD + i * stepX},${toY(v)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#000000" strokeOpacity="0.12" />
        <polyline points={demandPts} fill="none" stroke="#000000" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={supplyPts} fill="none" stroke="#7e7576" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-wider text-outline">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0 inline-block border-t-2 border-black" />{demandLabel}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0 inline-block border-t-2 border-dashed border-outline" />{supplyLabel}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono text-outline w-24">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      </div>
    </div>
  )
}
