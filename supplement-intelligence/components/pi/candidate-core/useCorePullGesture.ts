import { useCallback, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react'
import { computeResistance, maxReachForResistance, type PullBladeInput, type PullDirection } from './corePullPhysics'

/**
 * Gesture + spring-physics state machine for the Pull mechanic's drag
 * handle (the score-in-hub). Ported from the approved design prototype's
 * usePullGesture.ts — the gesture/keyboard/spring-integration STATE
 * MACHINE is pure interaction language with no illustrative data of its
 * own, so it's carried over structurally unchanged; only the resistance
 * source (corePullPhysics.ts, real magnitude+weight, symmetric — see its
 * own HONESTY CAVEAT) differs from the original's direction-based math.
 * Deliberately framework-render-agnostic about WHEN it updates: pointer/
 * keyboard handlers only ever write a *target*; `integrate()` must be
 * called once per frame from the caller's own `useFrame` to actually
 * advance `valueRef`.
 *
 * Axis convention (unchanged from the prototype, documented once here):
 * pointer UP or Arrow-Up = positive value = pulling toward Build.
 * pointer DOWN or Arrow-Down = negative value = pulling toward Skip.
 * Since resistance is now symmetric (corePullPhysics.ts), maxReachBuild
 * and maxReachSkip are always numerically equal — both are still exposed
 * separately (rather than collapsed to one field) so this hook's shape
 * stays a drop-in match for the ported EvidenceCoreRotor's existing
 * Build/Skip-labeled call sites.
 */

const DRAG_SENSITIVITY_PX = 140 // px of raw pointer travel mapped to a full (pre-resistance) 0..1 desire -- "a short vertical axis," not a long swipe
const KEYBOARD_STEP = 0.16 // per-arrow-press nudge (pre-resistance)
const APPROACH_TAU = 0.09 // seconds -- displayed value chasing an active pull's resistance-limited target
const RELEASE_TAU = 0.22 // seconds -- slower settle back toward rest on release
/** Fraction of the resistance-limited max reach past which a release
 * counts as a genuine, deliberate test of the verdict (not an incidental
 * nudge) -- same judgment call/value as the approved prototype. */
export const SIGNIFICANT_PULL_THRESHOLD = 0.55

export interface PullGestureHandlers {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerCancel: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
}

export interface PullGestureApi extends PullGestureHandlers {
  // MutableRefObject (never-null `current`), not React.RefObject — these
  // refs are always created here via useRef(<initial value>), so `current`
  // is never actually null; typing them as the nullable RefObject would
  // force every read-site (the caller's useFrame) to null-check a value
  // that structurally can't be null.
  valueRef: MutableRefObject<number>
  activeRef: MutableRefObject<boolean>
  resistance: number
  maxReachBuild: number
  maxReachSkip: number
  integrate: (delta: number, animate: boolean) => void
}

export function useCorePullGesture(
  blades: readonly PullBladeInput[],
  onRelease: (finalValue: number, direction: PullDirection | null, wasSignificant: boolean) => void,
): PullGestureApi {
  const valueRef = useRef(0)
  const targetRawRef = useRef(0) // pre-resistance desire, -1..1
  const activeRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const startClientYRef = useRef(0)
  const startTargetRef = useRef(0)

  // Symmetric by construction (corePullPhysics.ts's HONESTY CAVEAT) --
  // one real resistance value drives both directions.
  const resistance = useMemo(() => computeResistance(blades), [blades])
  const maxReach = useMemo(() => maxReachForResistance(resistance), [resistance])

  const finishRelease = useCallback(() => {
    const finalValue = valueRef.current
    const direction: PullDirection | null = finalValue > 0.001 ? 'build' : finalValue < -0.001 ? 'skip' : null
    const wasSignificant = direction !== null && Math.abs(finalValue) / maxReach >= SIGNIFICANT_PULL_THRESHOLD
    pointerIdRef.current = null
    activeRef.current = false
    targetRawRef.current = 0
    onRelease(finalValue, direction, wasSignificant)
  }, [maxReach, onRelease])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation()
    // Defense-in-depth alongside CSS `user-select: none` on the handle --
    // without this, a mouse drag on real DOM score text can still start a
    // native text-selection gesture in some browsers.
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pointerIdRef.current = e.pointerId
    startClientYRef.current = e.clientY
    startTargetRef.current = targetRawRef.current
    activeRef.current = true
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return
    e.stopPropagation()
    const deltaY = startClientYRef.current - e.clientY // up = positive = Build
    const raw = startTargetRef.current + deltaY / DRAG_SENSITIVITY_PX
    targetRawRef.current = Math.max(-1, Math.min(1, raw))
  }, [])

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return
      e.stopPropagation()
      finishRelease()
    },
    [finishRelease],
  )

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault()
        targetRawRef.current = Math.max(-1, Math.min(1, targetRawRef.current + KEYBOARD_STEP))
        activeRef.current = true
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault()
        targetRawRef.current = Math.max(-1, Math.min(1, targetRawRef.current - KEYBOARD_STEP))
        activeRef.current = true
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        finishRelease()
      }
    },
    [finishRelease],
  )

  const integrate = useCallback(
    (delta: number, animate: boolean) => {
      const rawTarget = targetRawRef.current
      let resistanceLimitedTarget = 0
      if (rawTarget > 0) resistanceLimitedTarget = Math.min(rawTarget, maxReach)
      else if (rawTarget < 0) resistanceLimitedTarget = Math.max(rawTarget, -maxReach)

      const tau = activeRef.current ? APPROACH_TAU : RELEASE_TAU
      const smoothing = animate ? 1 - Math.exp(-delta / tau) : 1
      valueRef.current += (resistanceLimitedTarget - valueRef.current) * smoothing
      if (!activeRef.current && Math.abs(valueRef.current) < 0.0015) valueRef.current = 0
    },
    [maxReach],
  )

  return {
    valueRef,
    activeRef,
    resistance,
    maxReachBuild: maxReach,
    maxReachSkip: maxReach,
    integrate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onKeyDown,
  }
}
