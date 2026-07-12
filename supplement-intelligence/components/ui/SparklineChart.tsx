// Inline small SVG trend line — for a single row/tile, not a full chart.
export function SparklineChart({
  values, className = 'w-16 h-7', color = '#000000',
}: { values: number[]; className?: string; color?: string }) {
  if (values.length < 2) return null
  const W = 100, H = 40, PAD = 4
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const stepX = (W - PAD * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = PAD + i * stepX
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return [x, y] as const
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${className} shrink-0`}>
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill={color} />
    </svg>
  )
}
