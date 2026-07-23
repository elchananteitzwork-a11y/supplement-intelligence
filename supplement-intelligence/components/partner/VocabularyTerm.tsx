'use client'

import { useEffect, useState, type ReactNode } from 'react'

// ── Vocabulary subtitle primitive (V4_PRODUCT_ARCHITECTURE.md §3/§5) ────────
// "Plain-language first: every term of art carries a subtitle on first
// encounters ('Conviction — how sure I am') that retires itself after a few
// exposures. No tours, no tooltip storms, no onboarding checklists."
//
// Client-local (localStorage), per V4 R&D §4 risk 6 — acceptable loss on
// device switch, not worth a schema for Phase 1. Exposure count is bumped
// once per mount (each real page view of the term), retiring after
// MAX_EXPOSURES.
//
// Hydration-safe by construction: the server (and the client's FIRST paint,
// before the effect runs) always render with the subtitle hidden — the
// exact same shape react-dom hydrates against. The effect fires after
// mount, reads the real localStorage count, and only THEN reveals the
// subtitle for the remaining exposures — a normal post-hydration update,
// not a server/client render mismatch (same pattern as components/pi/
// AttentionCard.tsx's own useReducedMotion note on this class of bug).
const MAX_EXPOSURES = 3
const STORAGE_PREFIX = 'pi_v4_vocab_seen:'

function readCount(term: string): number {
  if (typeof window === 'undefined') return MAX_EXPOSURES
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + term)
    return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0
  } catch {
    return MAX_EXPOSURES // storage unavailable (private mode etc.) — degrade to "retired", never crash
  }
}

function bumpCount(term: string, current: number) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + term, String(current + 1))
  } catch {
    // best-effort only — a failed write just means this term won't retire correctly, never a crash
  }
}

export function VocabularyTerm({
  term, subtitle, children, className,
}: { term: string; subtitle: string; children: ReactNode; className?: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const count = readCount(term)
    if (count < MAX_EXPOSURES) {
      setShow(true)
      bumpCount(term, count)
    }
  }, [term])

  return (
    <span className={className}>
      {children}
      {show && <span className="mt-0.5 block text-xs italic text-pi-faint">{subtitle}</span>}
    </span>
  )
}
