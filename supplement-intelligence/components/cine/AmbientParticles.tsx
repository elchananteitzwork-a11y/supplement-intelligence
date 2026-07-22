'use client'

import { useEffect, useRef } from 'react'

// Floating haze motes for AmbientWorld — meant to read as humidity
// catching the light, not dust or film grain: soft, fully-diffuse glows
// (no hard edge/core), irregular sizes and blur, biased toward the upper-
// center of the frame where our hero compositions place their light source,
// with a wandering (non-linear) drift path and a gentle opacity shimmer
// instead of a flat on/off plateau — real scattered light isn't constant.
//
// Randomized positions/timings are generated client-side only, after
// mount — never during server render — so there is no hydration mismatch
// between the server's deterministic markup and the client's randomized
// one (the same pattern the approved Ambient World mockup used: a
// post-mount script appending particle elements rather than rendering
// them with SSR-visible random values). Purely decorative; respects
// prefers-reduced-motion by simply not rendering any particles at all.
export function AmbientParticles({ count = 20 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const frag = document.createDocumentFragment()
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i')
      // Average of two draws pulls the spawn X toward center (roughly
      // where the light source sits across our hero compositions) without
      // a hard cutoff — some still drift in from the edges.
      const centerBiasedX = (Math.random() + Math.random()) / 2 * 100
      const size = 7 + Math.random() * 15
      const blur = 1.5 + size / 15 + Math.random() * 2

      dot.className = 'absolute rounded-full opacity-0 motion-safe:animate-cine-drift'
      dot.style.width = `${size}px`
      dot.style.height = `${size}px`
      dot.style.filter = `blur(${blur.toFixed(1)}px)`
      dot.style.background = 'radial-gradient(circle, rgba(246,231,184,.85) 0%, rgba(246,231,184,.3) 45%, transparent 72%)'
      dot.style.left = `${centerBiasedX.toFixed(1)}%`
      dot.style.top = `${45 + Math.random() * 50}%`
      dot.style.animationDuration = `${28 + Math.random() * 34}s`
      dot.style.animationDelay = `${-Math.random() * 50}s`
      dot.style.setProperty('--cine-particle-opacity', (0.1 + Math.random() * 0.22).toFixed(2))
      dot.style.setProperty('--cine-particle-x', `${Math.round(Math.random() * 50 - 25)}px`)
      frag.appendChild(dot)
    }
    el.appendChild(frag)
    return () => { el.innerHTML = '' }
  }, [count])

  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" />
}
