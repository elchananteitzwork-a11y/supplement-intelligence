'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { CandidateCoreRotor } from './CandidateCoreRotor'
import type { CoreBladeViewModel } from './coreDataAdapter'
import type { PullDirection } from './corePullPhysics'

// The actual <Canvas> mount — kept in its own file so app/memo/[id]/page.tsx
// -> CandidateCoreHero.tsx can `next/dynamic(..., { ssr: false })` this
// specific module. Next.js/WebGL have no meaningful SSR story, and R&D §4
// explicitly flags bundle-size/first-load-JS impact as a real risk to
// mitigate via code-splitting — this is that split point. Lighting is
// deliberately simple (ambient + two directional lights, no drei
// <Environment> HDRI/PMREM fetch) — a disclosed, real trade against the
// approved prototype's fuller lighting rig: avoids a network-dependent
// asset fetch in a production page (a real reliability risk an isolated
// design-review sandbox doesn't have to worry about), consistent with the
// standing "graceful fallback on weak devices" requirement.
export function CandidateCoreCanvas({
  score,
  confidencePct,
  blades,
  onBladeClick,
  onSignificantPull,
  onScoreRevealed,
}: {
  score: number
  confidencePct: number | null
  blades: CoreBladeViewModel[]
  onBladeClick?: (sectionId: string) => void
  onSignificantPull?: (direction: PullDirection) => void
  onScoreRevealed?: () => void
}) {
  const pointer = useRef<[number, number]>([0, 0])
  const wrapRef = useRef<HTMLDivElement>(null)
  // Read synchronously (lazy useState initializer, not an effect) so the
  // very FIRST render of CandidateCoreRotor already receives the correct
  // `animate` value — that prop seeds several useRef initializers there
  // (entranceP, scoreRevealed) that only ever read it once at mount, so an
  // effect-based (one-render-late) detection would let a real
  // reduced-motion user see one animated frame before it caught up. This
  // component is only ever mounted client-side (dynamic import, ssr:false,
  // see CandidateCoreHero.tsx), so `window` is always defined here.
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    pointer.current = [x, y]
  }

  return (
    <div ref={wrapRef} onPointerMove={handlePointerMove} className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 34 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: 'pan-y' }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} color="#F7F2E6" />
        <directionalLight position={[-4, -2, -3]} intensity={0.35} color="#D4A94A" />
        <CandidateCoreRotor
          animate={!reduceMotion}
          enableTransmission={false}
          pointer={pointer}
          anchor={[0, 0, 0]}
          scale={1.35}
          score={score}
          confidencePct={confidencePct}
          blades={blades}
          onBladeClick={onBladeClick}
          onSignificantPull={onSignificantPull}
          onScoreRevealed={onScoreRevealed}
        />
      </Canvas>
    </div>
  )
}
