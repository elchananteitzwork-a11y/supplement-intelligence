'use client'

// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — Score Gauge
// Instrument-dial hero score. Same math as the prior ScoreRing (semi-
// circular arc, tick marks, eased count-up) — re-skinned to the Lab
// palette with an ambient glow. The count-up is the system's one
// permitted celebratory motion exception (§7).
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import type { BuildDecision } from '@/types/index'

export function useCountUp(target: number, durationMs = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return val
}

const DECISION_COLOR: Record<BuildDecision, string> = {
  BUILD_NOW: '#34d9a0',
  VALIDATE_FURTHER: '#f5b947',
  SKIP: '#ff6259',
  CATEGORY_CREATION_CANDIDATE: '#8b7cff',
}

export function ScoreGauge({ s, decision, size = 176 }: { s: number; decision: BuildDecision; size?: number }) {
  const animated = useCountUp(s)
  const w = size
  const h = Math.round(size / 2) + 20
  const m = 18
  const cx = w / 2
  const cy = h - m
  const r = w / 2 - m
  const c = DECISION_COLOR[decision]
  const pathLen = Math.PI * r
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const ticks = [0, 20, 40, 60, 80, 100]
  const gradId = `lab-score-glow-${decision}`

  return (
    <div className="relative shrink-0" style={{ width: w, height: h }}>
      {/* Ambient glow behind the dial — instrument backlight, not decoration */}
      <div
        className="absolute inset-0 -z-10 blur-2xl opacity-40"
        style={{ background: `radial-gradient(circle at 50% 85%, ${c}55, transparent 70%)` }}
        aria-hidden
      />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c} stopOpacity="0.6" />
            <stop offset="100%" stopColor={c} stopOpacity="1" />
          </linearGradient>
        </defs>
        {ticks.map(t => {
          const theta = ((180 - (t / 100) * 180) * Math.PI) / 180
          const x1 = cx + (r + 4) * Math.cos(theta)
          const y1 = cy - (r + 4) * Math.sin(theta)
          const x2 = cx + (r + 9) * Math.cos(theta)
          const y2 = cy - (r + 9) * Math.sin(theta)
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2c35" strokeWidth={1.5} strokeLinecap="round" />
        })}
        <path d={arcPath} fill="none" stroke="#1b1c23" strokeWidth={7} strokeLinecap="round" />
        <path
          d={arcPath} fill="none" stroke={`url(#${gradId})`} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen - (pathLen * s) / 100}
          style={{ transition: 'stroke-dashoffset 1.1s var(--lab-ease-enter)' }}
        />
      </svg>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: cy - r * 0.62 }}>
        <span className="lab-text-data font-bold leading-none tabular-nums" style={{ color: c, fontSize: w * 0.24 }}>
          {animated}
        </span>
        <span className="text-lab-text-tertiary text-[10px] mt-1.5 tracking-wide font-sans">/ 100</span>
      </div>
    </div>
  )
}
