'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { buildRotorGeometry } from './buildRotorGeometry'
import { easeOutExpo } from './motionEasing'
import { useCorePullGesture } from './useCorePullGesture'
import { bladeReactionIntensity, type PullDirection } from './corePullPhysics'
import type { CoreBladeViewModel } from './coreDataAdapter'

// ═══════════════════════════════════════════════════════════════════════
// Candidate Core rotor — ported from the approved design prototype's
// EvidenceCoreRotor.tsx (hero3d-prototype). The GEOMETRY/ROTATION MODEL
// (blades spin around a never-rotating hub, constant angular velocity
// within a held state, exponential lerp of only the *target* speed) is
// carried over structurally unchanged — it's locked interaction language,
// not data. What changed, per RD-UIv2-M2-candidate-detail-core-phase1.md
// §4/§6:
//   - Blade resting emissive (luminosity) is now driven by each blade's
//     REAL magnitude/provenance (see bladeRestingEmissive below), not an
//     illustrative direction — "luminosity = confidence" design DNA,
//     applied honestly at the per-dimension level.
//   - Hub resting emissive is driven by the REAL overall confidence
//     (weakest-link), same design DNA applied at the verdict level.
//   - No per-blade "Supports/Against/Mixed" stance exists or is rendered
//     anywhere — see corePullPhysics.ts's own HONESTY CAVEAT.
//   - Per-blade keyboard/screen-reader interaction is NOT duplicated here
//     as a drei <Html><button> overlay (the prototype's pattern) — the
//     always-present, always-real DOM blade legend rendered by
//     CandidateCoreHero.tsx below/beside this canvas is the actual
//     accessible interaction surface (real DOM, works with zero WebGL/JS,
//     satisfies the mobile/weak-device/reduced-motion fallback
//     requirement by construction). The mesh's own onClick/onPointerOver
//     below is a decorative bonus hit-target only, not a11y-load-bearing.
// ═══════════════════════════════════════════════════════════════════════

const REST_PERIOD_S = 60 // one full blade rotation every ~60s at rest
const RESTING_ANGULAR_SPEED = (Math.PI * 2) / REST_PERIOD_S
const HOVER_SPEED_FACTOR = 0.35
const VELOCITY_TAU = 0.18

const MAX_FRAME_DT_S = 1 / 30
const ENTRANCE_DURATION_S = 0.62
const ENTRANCE_START_SCALE = 0.9

// Hub luminosity = real overall confidence (design DNA, applied honestly).
// Unknown confidence (null) renders at the dim floor — "we don't know"
// must never default to looking bright/confident.
const HUB_EMISSIVE_MIN = 0.06
const HUB_EMISSIVE_MAX = 0.32
const HUB_EMISSIVE_START = 0.01

const SCORE_REVEAL_DELAY_MS = 460
const SCORE_REVEAL_DURATION_MS = 380

// Blade luminosity bands — monotonic and honest: no real data (unavailable)
// is always dimmer than AI-judgment-only (synthesized), which is always
// dimmer than the weakest real verified magnitude. See bladeRestingEmissive.
const BLADE_EMISSIVE_UNAVAILABLE = 0.04
const BLADE_EMISSIVE_SYNTH: Record<'Low' | 'Medium' | 'High', number> = { Low: 0.08, Medium: 0.12, High: 0.16 }
const BLADE_EMISSIVE_SYNTH_DEFAULT = 0.10
const BLADE_EMISSIVE_VERIFIED_MIN = 0.18
const BLADE_EMISSIVE_VERIFIED_MAX = 0.58
const BLADE_EMISSIVE_START = 0.02

const BLADE_HOVER_BOOST = 0.2
const BLADE_HOVER_TAU = 0.1

const PULL_HANDLE_MAX_PX = 40
const PULL_REACT_EMISSIVE_MAX = 0.42
const PULL_REACT_PULSE_HZ = 1.4
const PULL_HINT_DEPTH_THRESHOLD = 0.12

function bladeRestingEmissive(blade: CoreBladeViewModel): number {
  if (blade.source === 'verified' && blade.magnitude !== null) {
    const t = Math.max(0, Math.min(10, blade.magnitude)) / 10
    return THREE.MathUtils.lerp(BLADE_EMISSIVE_VERIFIED_MIN, BLADE_EMISSIVE_VERIFIED_MAX, t)
  }
  if (blade.source === 'synthesized') {
    return blade.qualitativeLevel ? BLADE_EMISSIVE_SYNTH[blade.qualitativeLevel] : BLADE_EMISSIVE_SYNTH_DEFAULT
  }
  return BLADE_EMISSIVE_UNAVAILABLE
}

function bladeCaption(blade: CoreBladeViewModel): string {
  if (blade.source === 'verified' && blade.magnitude !== null) return `${blade.label} — ${blade.magnitude.toFixed(1)}/10, verified`
  if (blade.source === 'synthesized') return `${blade.label} — AI judgment${blade.qualitativeLevel ? ` (${blade.qualitativeLevel})` : ''}, no real basis`
  return `${blade.label} — not computed for this analysis`
}

export interface CandidateCoreRotorProps {
  animate: boolean
  enableTransmission: boolean
  pointer: React.RefObject<[number, number]>
  anchor: [number, number, number]
  scale?: number
  score: number
  /** 0-100 or null — real computeConfidenceAssessment output, drives hub
   * luminosity. */
  confidencePct: number | null
  /** Exactly 6, index-aligned with buildRotorGeometry's 6 blade meshes. */
  blades: CoreBladeViewModel[]
  onBladeClick?: (sectionId: string) => void
  /** Fired once per significant Pull release. Never touches score/verdict
   * state (Pull cannot change what it's testing) — see corePullPhysics.ts.
   * No "record your conviction" affordance exists yet in production to
   * wire this to; undefined/no-op if the caller doesn't supply one,
   * matching the prototype's own documented convention. */
  onSignificantPull?: (direction: PullDirection) => void
  /** Fired exactly once, the instant this rotor's own WebGL score becomes
   * visible (mirrors scoreRevealed below). CandidateCoreHero.tsx uses this
   * to know precisely when it's safe to stop rendering the real DOM score
   * fallback — pre-beta audit fix: it used to hide that fallback the
   * instant WebGL capability was merely detected, leaving the score
   * invisible for the whole chunk-load + SCORE_REVEAL_DELAY_MS window. */
  onScoreRevealed?: () => void
}

export function CandidateCoreRotor({
  animate,
  enableTransmission,
  pointer,
  anchor,
  scale = 1,
  score,
  confidencePct,
  blades,
  onBladeClick,
  onSignificantPull,
  onScoreRevealed,
}: CandidateCoreRotorProps) {
  const { blades: bladeGeoms, hub } = useMemo(() => buildRotorGeometry(), [])

  const rotorRef = useRef<THREE.Group>(null)
  const floatRef = useRef<THREE.Group>(null)
  const t = useRef(0)
  const angularVelocity = useRef(RESTING_ANGULAR_SPEED)
  const hoveringRef = useRef(false)
  const entranceP = useRef(animate ? 0 : 1)

  const hubEmissiveTarget = useMemo(
    () => (confidencePct !== null ? THREE.MathUtils.lerp(HUB_EMISSIVE_MIN, HUB_EMISSIVE_MAX, confidencePct / 100) : HUB_EMISSIVE_MIN),
    [confidencePct],
  )
  const bladeEmissiveTargets = useMemo(() => blades.map(bladeRestingEmissive), [blades])

  const bladeMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#D4A94A'), // locked brand gold — never changes with data
      metalness: 0.3,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      reflectivity: 0.6,
      ior: 1.45,
      transmission: enableTransmission ? 0.18 : 0,
      thickness: enableTransmission ? 0.6 : 0,
      envMapIntensity: 1.4,
      emissive: new THREE.Color('#5A3F14'),
      // Template only — never rendered directly (each mesh below gets its
      // own clone in bladeMaterials, whose emissiveIntensity is fully
      // owned by the per-frame loop below via bladeEmissiveTargets). Its
      // own starting value is irrelevant beyond being a harmless default.
      emissiveIntensity: BLADE_EMISSIVE_START,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableTransmission])

  const bladeMaterials = useMemo(() => bladeGeoms.map(() => bladeMaterial.clone()), [bladeMaterial, bladeGeoms])
  useEffect(() => {
    return () => {
      bladeMaterials.forEach(m => m.dispose())
    }
  }, [bladeMaterials])
  // Pre-beta audit fix: the template material these clones came from was
  // never itself disposed — a real GPU-resource leak on every unmount
  // (candidate navigation, tab close) since MeshPhysicalMaterial holds
  // native buffers independent of its clones.
  useEffect(() => {
    return () => bladeMaterial.dispose()
  }, [bladeMaterial])

  const hoveredBladeIndex = useRef<number | null>(null)
  const [activeBladeIndex, setActiveBladeIndex] = useState<number | null>(null)
  const setBladeHover = (index: number | null) => {
    hoveredBladeIndex.current = index
    setActiveBladeIndex(prev => (prev === index ? prev : index))
  }
  const hoverBoost = useRef<number[]>(bladeGeoms.map(() => 0))

  const hubMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#16171C'),
        metalness: 0.3,
        roughness: 0.35,
        clearcoat: 0.6,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.5,
        emissive: new THREE.Color('#8a5f1e'),
        emissiveIntensity: animate ? HUB_EMISSIVE_START : hubEmissiveTarget,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    return () => hubMaterial.dispose()
  }, [hubMaterial])

  const [scoreRevealed, setScoreRevealed] = useState(!animate)
  useEffect(() => {
    if (!animate) {
      setScoreRevealed(true)
      onScoreRevealed?.()
      return
    }
    const id = setTimeout(() => {
      setScoreRevealed(true)
      onScoreRevealed?.()
    }, SCORE_REVEAL_DELAY_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pullBlades = useMemo(() => blades.map(b => ({ weight: b.weight, magnitude: b.magnitude, source: b.source })), [blades])
  const handlePullRelease = useCallback(
    (_finalValue: number, direction: PullDirection | null, wasSignificant: boolean) => {
      if (wasSignificant && direction) onSignificantPull?.(direction)
    },
    [onSignificantPull],
  )
  const pull = useCorePullGesture(pullBlades, handlePullRelease)
  const pullHandleRef = useRef<HTMLDivElement>(null)
  const pullHintRef = useRef<HTMLDivElement>(null)
  const lastHintTextRef = useRef('')
  const lastAriaBucketRef = useRef(0)
  const [pullDragging, setPullDragging] = useState(false)

  useFrame((_, delta) => {
    if (animate) t.current += Math.min(delta, MAX_FRAME_DT_S)

    if (animate && entranceP.current < 1) {
      entranceP.current = Math.min(1, t.current / ENTRANCE_DURATION_S)
      const eased = easeOutExpo(entranceP.current)
      hubMaterial.emissiveIntensity = THREE.MathUtils.lerp(HUB_EMISSIVE_START, hubEmissiveTarget, eased)
    } else if (!animate) {
      hubMaterial.emissiveIntensity = hubEmissiveTarget
    }

    pull.integrate(delta, animate)
    const pullValue = pull.valueRef.current
    const pullDir: PullDirection | null = pullValue > 0.0005 ? 'build' : pullValue < -0.0005 ? 'skip' : null
    const pullMaxReach = pullDir === 'build' ? pull.maxReachBuild : pullDir === 'skip' ? pull.maxReachSkip : 1
    const pullDepth = pullDir ? Math.min(1, Math.abs(pullValue) / pullMaxReach) : 0

    const hoverSmoothing = animate ? 1 - Math.exp(-delta / BLADE_HOVER_TAU) : 1
    for (let i = 0; i < bladeMaterials.length; i++) {
      const restTarget = entranceP.current < 1
        ? THREE.MathUtils.lerp(BLADE_EMISSIVE_START, bladeEmissiveTargets[i] ?? BLADE_EMISSIVE_UNAVAILABLE, easeOutExpo(entranceP.current))
        : bladeEmissiveTargets[i] ?? BLADE_EMISSIVE_UNAVAILABLE

      const targetBoost = activeBladeIndex === i ? BLADE_HOVER_BOOST : 0
      hoverBoost.current[i] += (targetBoost - hoverBoost.current[i]) * hoverSmoothing

      // Real-evidence reaction under Pull load — every verified blade
      // pushes back proportional to its own real weight*magnitude share
      // (symmetric, direction-agnostic — see corePullPhysics.ts).
      let pullBoost = 0
      if (pullDir && pullBlades[i]) {
        const reaction = bladeReactionIntensity(pullBlades[i], pullDepth)
        if (reaction > 0) {
          const pulse = animate ? 0.75 + 0.25 * Math.sin(t.current * PULL_REACT_PULSE_HZ * Math.PI * 2) : 1
          pullBoost = reaction * PULL_REACT_EMISSIVE_MAX * pulse
        }
      }

      bladeMaterials[i].emissiveIntensity = Math.max(0.02, restTarget + hoverBoost.current[i] + pullBoost)
    }

    if (pullHandleRef.current) {
      const px = -pullValue * PULL_HANDLE_MAX_PX
      const handleScale = 1 + pullDepth * 0.05
      pullHandleRef.current.style.transform = `translateY(${px.toFixed(2)}px) scale(${handleScale.toFixed(3)})`

      const rounded = Math.round((pullValue * 100) / 5) * 5
      if (rounded !== lastAriaBucketRef.current) {
        lastAriaBucketRef.current = rounded
        const percentOfReach = Math.round(pullDepth * 100)
        const valueText =
          pullDir === 'build'
            ? `Testing toward Build — ${percentOfReach}% of the way before the real evidence weight holds`
            : pullDir === 'skip'
              ? `Testing toward Skip — ${percentOfReach}% of the way before the real evidence weight holds`
              : 'At rest, on the current verdict'
        pullHandleRef.current.setAttribute('aria-valuenow', String(rounded))
        pullHandleRef.current.setAttribute('aria-valuetext', valueText)
      }
    }
    if (pullHintRef.current) {
      const showHint = pullDir !== null && pullDepth > PULL_HINT_DEPTH_THRESHOLD
      pullHintRef.current.style.opacity = showHint ? String(Math.min(1, (pullDepth - PULL_HINT_DEPTH_THRESHOLD) / 0.3)) : '0'
      if (showHint) {
        const strongest = pullBlades.reduce<{ i: number; c: number } | null>((best, b, i) => {
          const c = bladeReactionIntensity(b, 1)
          return !best || c > best.c ? { i, c } : best
        }, null)
        const text = strongest && strongest.c > 0 ? `Held mainly by: ${blades[strongest.i]?.label ?? ''}, real weighted evidence` : 'Held by thin, largely qualitative evidence'
        if (text !== lastHintTextRef.current) {
          pullHintRef.current.textContent = text
          lastHintTextRef.current = text
        }
      }
    }

    if (rotorRef.current) {
      const targetSpeed = hoveringRef.current ? RESTING_ANGULAR_SPEED * HOVER_SPEED_FACTOR : RESTING_ANGULAR_SPEED
      if (animate) {
        const smoothing = 1 - Math.exp(-delta / VELOCITY_TAU)
        angularVelocity.current += (targetSpeed - angularVelocity.current) * smoothing
        rotorRef.current.rotation.z += angularVelocity.current * delta
      }
    }

    if (floatRef.current) {
      const breath = animate ? 1 + Math.sin(t.current * (Math.PI / 4)) * 0.014 : 1
      const bob = animate ? Math.sin(t.current * (Math.PI / 4.5)) * 0.055 : 0
      const entranceScale = ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * easeOutExpo(entranceP.current)
      floatRef.current.scale.setScalar(breath * scale * entranceScale)
      floatRef.current.position.set(anchor[0], anchor[1] + bob, anchor[2])

      const [px, py] = pointer.current ?? [0, 0]
      const targetRotX = -py * 0.12
      const targetRotY = px * 0.16
      floatRef.current.rotation.x += (targetRotX - floatRef.current.rotation.x) * 0.03
      floatRef.current.rotation.y += (targetRotY - floatRef.current.rotation.y) * 0.03
    }
  })

  return (
    <group
      ref={floatRef}
      position={anchor}
      scale={scale}
      onPointerOver={e => {
        e.stopPropagation()
        hoveringRef.current = true
      }}
      onPointerOut={e => {
        e.stopPropagation()
        hoveringRef.current = false
      }}
    >
      <group ref={rotorRef}>
        {bladeGeoms.map((geometry, i) => (
          <mesh
            key={i}
            geometry={geometry}
            material={bladeMaterials[i]}
            castShadow
            receiveShadow
            onClick={
              onBladeClick && blades[i]
                ? (e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation()
                    onBladeClick(blades[i].sectionId)
                  }
                : undefined
            }
            onPointerOver={() => {
              setBladeHover(i)
              if (typeof document !== 'undefined') document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setBladeHover(null)
              if (typeof document !== 'undefined') document.body.style.cursor = 'auto'
            }}
          />
        ))}
      </group>
      <mesh geometry={hub} material={hubMaterial} castShadow receiveShadow />

      {/* Non-rotating caption naming the active blade + its real value —
          decorative echo of the always-present DOM legend, not the a11y
          surface itself (see file header). */}
      <Html center pointerEvents="none" position={[0, -1.08, 0.05]} style={{ pointerEvents: 'none' }}>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            fontSize: '10.5px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            maxWidth: '260px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none',
            textAlign: 'center',
            color: activeBladeIndex !== null ? '#D4A94A' : 'rgba(247,242,230,0.42)',
            transition: 'color 200ms ease-out',
          }}
        >
          {activeBladeIndex !== null && blades[activeBladeIndex] ? bladeCaption(blades[activeBladeIndex]) : 'Evidence Core'}
        </div>
      </Html>

      <Html center pointerEvents="none" position={[0, -1.34, 0.05]} style={{ pointerEvents: 'none' }}>
        <div
          ref={pullHintRef}
          style={{
            fontFamily: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            fontSize: '10px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            maxWidth: '220px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none',
            textAlign: 'center',
            color: 'rgba(247,242,230,0.72)',
            opacity: 0,
          }}
        />
      </Html>

      <Html center pointerEvents="auto" position={[0, 0, 0.05]} style={{ pointerEvents: 'auto' }}>
        <div
          ref={pullHandleRef}
          role="slider"
          tabIndex={0}
          aria-label="Pull the verdict to test how much real evidence weight resists moving it"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-valuetext="At rest, on the current verdict"
          className={`core-pull-handle${pullDragging ? ' dragging' : ''}`}
          onPointerDown={e => {
            setPullDragging(true)
            pull.onPointerDown(e)
          }}
          onPointerMove={pull.onPointerMove}
          onPointerUp={e => {
            setPullDragging(false)
            pull.onPointerUp(e)
          }}
          onPointerCancel={e => {
            setPullDragging(false)
            pull.onPointerCancel(e)
          }}
          onKeyDown={pull.onKeyDown}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            cursor: 'grab',
            opacity: scoreRevealed ? 1 : 0,
            transition: `opacity ${SCORE_REVEAL_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1)`,
          }}
        >
          <span
            style={{
              fontFamily: "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace",
              fontWeight: 600,
              fontSize: '27.4px',
              lineHeight: 1,
              color: '#D4A94A',
              letterSpacing: '-0.01em',
            }}
          >
            {score}
          </span>
          <span
            style={{
              fontFamily: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
              fontWeight: 700,
              fontSize: '9.1px',
              letterSpacing: '0.14em',
              marginTop: '5.6px',
              color: 'rgba(212,169,74,0.55)',
            }}
          >
            SCORE
          </span>
        </div>
      </Html>
    </group>
  )
}
