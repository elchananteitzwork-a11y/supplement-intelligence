'use client'

import {
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import type {
  ThesisEvent,
  ThesisRequest,
  MarketThesis,
  ProviderId,
} from '@/lib/thesis-engine'

// ── Section key type (matches ThesisEvent 'thesis:section' discriminant) ──

export type SectionKey = keyof Pick<
  MarketThesis,
  'verdict' | 'timing' | 'market_failures' | 'difficulty' | 'product_thesis'
>

// ── State ──────────────────────────────────────────────────────────────────

export type ThesisStatus = 'idle' | 'streaming' | 'complete' | 'error'

export interface ThesisState {
  status:             ThesisStatus
  events:             ThesisEvent[]
  activeProviders:    ProviderId[]
  completedProviders: ProviderId[]
  failedProviders:    ProviderId[]
  synthesizing:       boolean
  sectionsReady:      SectionKey[]
  thesis:             MarketThesis | null
  error:              string | null
  needsLogin:         boolean
}

// ── Actions ────────────────────────────────────────────────────────────────

type ThesisAction =
  | { type: 'START' }
  | { type: 'EVENT';      payload:  ThesisEvent }
  | { type: 'COMPLETE';   thesis:   MarketThesis }
  | { type: 'ERROR';      message:  string }
  | { type: 'NEED_LOGIN' }
  | { type: 'RESET' }

const INITIAL_STATE: ThesisState = {
  status:             'idle',
  events:             [],
  activeProviders:    [],
  completedProviders: [],
  failedProviders:    [],
  synthesizing:       false,
  sectionsReady:      [],
  thesis:             null,
  error:              null,
  needsLogin:         false,
}

// ── Reducer ────────────────────────────────────────────────────────────────

function reducer(state: ThesisState, action: ThesisAction): ThesisState {
  switch (action.type) {

    case 'START':
      return { ...INITIAL_STATE, status: 'streaming' }

    case 'RESET':
      return INITIAL_STATE

    case 'NEED_LOGIN':
      return { ...state, status: 'error', error: 'Unauthorized', needsLogin: true }

    case 'COMPLETE':
      return { ...state, status: 'complete', thesis: action.thesis }

    case 'ERROR':
      return { ...state, status: 'error', error: action.message }

    case 'EVENT': {
      const ev   = action.payload
      const next = { ...state, events: [...state.events, ev] }

      switch (ev.event) {
        case 'source:started':
          return {
            ...next,
            activeProviders: [...state.activeProviders, ev.provider],
          }

        case 'source:completed':
          return {
            ...next,
            activeProviders:    state.activeProviders.filter(p => p !== ev.provider),
            completedProviders: [...state.completedProviders, ev.provider],
          }

        case 'source:failed':
          return {
            ...next,
            activeProviders: state.activeProviders.filter(p => p !== ev.provider),
            failedProviders: [...state.failedProviders, ev.provider],
          }

        case 'synthesis:started':
          return { ...next, synthesizing: true }

        case 'thesis:section':
          return {
            ...next,
            sectionsReady: [...state.sectionsReady, ev.section],
          }

        default:
          return next
      }
    }

    default:
      return state
  }
}

// ── Derived helpers ────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  keepa:          'Amazon / Keepa',
  google_trends:  'Google Trends',
  reddit:         'Reddit',
  tiktok:         'TikTok',
  amazon_reviews: 'Amazon Reviews',
  meta_ads:       'Meta Ads',
  amazon_ads:     'Amazon Ads',
}

const SECTION_LABELS: Record<string, string> = {
  verdict:         'Verdict',
  timing:          'Timing',
  market_failures: 'Market Failures',
  difficulty:      'Difficulty',
  product_thesis:  'Product Thesis',
}

function calcProgress(state: ThesisState): number {
  if (state.status === 'idle')     return 0
  if (state.status === 'complete') return 100
  if (state.status === 'error')    return 0

  const hasStarted = state.events.some(e => e.event === 'analysis:started')
  if (!hasStarted) return 2

  // Provider phase: 5 → 45%
  const providersDone = state.completedProviders.length + state.failedProviders.length
  if (!state.synthesizing) {
    return 5 + Math.min(40, Math.round((providersDone / 5) * 40))
  }

  // Synthesis phase: 50 → 95%
  return 50 + Math.min(44, Math.round((state.sectionsReady.length / 5) * 44))
}

function calcStatusMessage(events: ThesisEvent[]): string {
  if (!events.length) return 'Starting...'
  const last = events[events.length - 1]

  switch (last.event) {
    case 'analysis:started':   return `Analyzing "${last.query}"...`
    case 'intent:classified':  return 'Understanding query...'
    case 'cache:hit':          return 'Loading from cache...'
    case 'source:started':     return `Fetching ${PROVIDER_LABELS[last.provider] ?? last.provider}...`
    case 'source:progress':    return last.message
    case 'source:completed':   return `${PROVIDER_LABELS[last.provider] ?? last.provider} complete`
    case 'source:failed':      return `${PROVIDER_LABELS[last.provider] ?? last.provider} unavailable — continuing`
    case 'synthesis:started':  return 'Synthesizing market intelligence...'
    case 'thesis:section':     return `${SECTION_LABELS[last.section] ?? last.section} ready`
    case 'thesis:complete':    return 'Analysis complete'
    case 'analysis:error':     return last.message
    default:                   return 'Processing...'
  }
}

// ── SSE stream reader ──────────────────────────────────────────────────────
// Reads a ReadableStream<Uint8Array>, parses SSE data: frames, and calls
// onEvent for each complete frame. Stops when the stream closes or the
// AbortSignal fires. Non-fatal: malformed frames are silently skipped.

async function readSSEStream(
  stream:  ReadableStream<Uint8Array>,
  signal:  AbortSignal,
  onEvent: (event: ThesisEvent) => void,
): Promise<void> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Messages are separated by double newline
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const message = buffer.slice(0, boundary)
        buffer        = buffer.slice(boundary + 2)

        // A message may have multiple header lines; extract data: lines
        const lines = message.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.startsWith('data: ')) {
            const json = line.slice(6).trim()
            if (!json) continue
            try {
              onEvent(JSON.parse(json) as ThesisEvent)
            } catch {
              // skip malformed frame
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Public hook interface ──────────────────────────────────────────────────

export interface UseThesisReturn extends ThesisState {
  start:         (request: ThesisRequest) => void
  reset:         () => void
  progress:      number     // 0–100
  statusMessage: string
}

// ── useThesis ──────────────────────────────────────────────────────────────

export function useThesis(): UseThesisReturn {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const abortRef          = useRef<AbortController | null>(null)

  const start = useCallback((request: ThesisRequest) => {
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'START' })

    void (async () => {
      try {
        const res = await fetch('/api/thesis', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(request),
          signal:  controller.signal,
        })

        // Handle non-streaming error responses before touching the body
        if (!res.ok) {
          if (res.status === 401) {
            dispatch({ type: 'NEED_LOGIN' })
            return
          }
          const body = await res.json().catch(() => ({})) as { error?: string }
          dispatch({ type: 'ERROR', message: body.error ?? `Server error (${res.status})` })
          return
        }

        if (!res.body) {
          dispatch({ type: 'ERROR', message: 'No response stream from server' })
          return
        }

        // Process the SSE stream
        let completed = false
        await readSSEStream(res.body, controller.signal, (event: ThesisEvent) => {
          dispatch({ type: 'EVENT', payload: event })

          if (event.event === 'thesis:complete') {
            dispatch({ type: 'COMPLETE', thesis: event.thesis })
            completed = true
          } else if (event.event === 'analysis:error') {
            dispatch({ type: 'ERROR', message: event.message })
            completed = true
          }
        })

        // Stream ended without a terminal event (unexpected disconnect)
        if (!completed && !controller.signal.aborted) {
          dispatch({ type: 'ERROR', message: 'Connection closed before analysis completed — please try again' })
        }

      } catch (err) {
        // Abort is intentional (reset() or a new start()) — stay silent
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unexpected error'
        dispatch({ type: 'ERROR', message })
      }
    })()
  }, [])   // dispatch is stable; no deps needed

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: 'RESET' })
  }, [])

  // Abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const progress = useMemo(() => calcProgress(state), [state])
  const statusMessage = useMemo(() => calcStatusMessage(state.events), [state.events])

  return { ...state, start, reset, progress, statusMessage }
}
