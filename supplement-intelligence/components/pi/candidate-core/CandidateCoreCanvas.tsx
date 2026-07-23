'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { CandidateCoreRotor } from './CandidateCoreRotor'
import type { CoreBladeViewModel } from './coreDataAdapter'
import type { PullDirection } from './corePullPhysics'
import { contactShadowFrames } from './contactShadowFrames'

// Simplify-pass fix: this static geometry was previously inline JSX inside
// <Environment>, so it got a brand-new `children` array reference on
// EVERY CandidateCoreCanvas render (e.g. every time the unrelated Sources
// toggle in CandidateCoreHero.tsx re-renders this tree). drei's Environment
// re-bakes its cube map in a useLayoutEffect keyed on `children` — a new
// reference each time silently defeated the "baked once" (`frames={1}`)
// intent, re-running the WebGL capture on every re-render. A module-level
// constant has one stable reference for the component's whole lifetime, so
// the bake genuinely only runs once, matching this file's own comment.
const REFLECTION_RIG = (
  <>
    <Lightformer form="rect" color="#F7F2E6" intensity={2.4} position={[2, 3, 3]} scale={[5, 3, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" color="#D4A94A" intensity={1.0} position={[-3, 0.4, 2.5]} scale={[3, 4, 1]} target={[0, 0, 0]} />
    <Lightformer form="ring" color="#F7F2E6" intensity={0.6} position={[0, -2, 3]} scale={2} target={[0, 0, 0]} />
  </>
)

// The actual <Canvas> mount — kept in its own file so app/memo/[id]/page.tsx
// -> CandidateCoreHero.tsx can `next/dynamic(..., { ssr: false })` this
// specific module. Next.js/WebGL have no meaningful SSR story, and R&D §4
// explicitly flags bundle-size/first-load-JS impact as a real risk to
// mitigate via code-splitting — this is that split point. Lighting is
// ambient + two directional lights PLUS (RD-UIv2-M4, owner-approved live
// via the isolated research harness) a drei <Environment> fed entirely by
// procedural <Lightformer> primitives — plain plane/ring geometry driven by
// MeshBasicMaterial, no textures, baked once (`frames={1}`). This is
// deliberately NOT drei's stock `preset`/`useMatcapTexture` helpers, which
// fetch HDRI/matcap assets from cdn.jsdelivr.net at runtime — a real
// network dependency this production page cannot take on. The Lightformer
// rig instead renders into an offscreen cube camera from geometry already
// in this file, so it stays zero-network, consistent with the standing
// "graceful fallback on weak devices" requirement. Feeds the rotor's own
// already-declared `envMapIntensity` (CandidateCoreRotor.tsx's
// MeshPhysicalMaterial) with real specular highlights that had nothing to
// reflect before this change.
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
        {/* Procedural reflection rig (RD-UIv2-M4 §1/§3) — geometry-only
            Lightformer panels baked once into an offscreen cube map, never
            fetched from network. Deliberately positioned camera-side
            (z > 0, no panel placed behind the rotor) — the owner tested and
            rejected a rim/backlight combo (R&D §1/§7); this is
            reflection-alone, not an added directional accent. */}
        <Environment frames={1} resolution={256}>{REFLECTION_RIG}</Environment>
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
        {/* Pronounced contact shadow (RD-UIv2-M4 §1, owner-chosen strength:
            opacity 0.62 / blur 2.0 over the tested-and-rejected "subtle"
            0.4/3.4 tuning). `frames` MUST be capped to 1 under reduceMotion —
            ContactShadows defaults to `frames = Infinity`, i.e. it
            re-renders its own depth pass every frame regardless of whether
            the rotor above it is animating; left uncapped this would be a
            real, silent per-frame cost under a visually "frozen" rotor. */}
        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={0.62}
          blur={2.0}
          scale={2.6}
          far={3}
          resolution={256}
          frames={contactShadowFrames(reduceMotion)}
        />
      </Canvas>
    </div>
  )
}
