'use client'

import Link from 'next/link'
import { m, useReducedMotion } from 'framer-motion'
import { Sparkles, Hourglass } from 'lucide-react'
import type { ChangedItem } from './types'

// Screen Definition S1, Zone A: present ONLY when something changed —
// the strip renders nothing at all (not an empty box) otherwise.
// Launch scope (approved amendment): analysis-complete + staleness only;
// divergence joins when its migration lands, stall notes are post-beta.
export function WhatChangedStrip({ items }: { items: ChangedItem[] }) {
  const reduce = useReducedMotion()
  if (items.length === 0) return null

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-xl border border-pi-gold/25 bg-pi-sand/60 px-5 py-3.5"
      role="status"
      aria-label="What changed"
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-pi-gold">Since you were away</p>
      <ul className="space-y-1.5">
        {items.map(it => (
          <li key={`${it.kind}-${it.candidateId}`}>
            <Link
              href={it.href}
              className="group inline-flex items-center gap-2 text-[13px] text-pi-sub transition-colors duration-200 hover:text-pi-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
            >
              {it.kind === 'analysis-complete'
                ? <Sparkles size={13} aria-hidden className="text-pi-gold" />
                : <Hourglass size={13} aria-hidden className="text-pi-faint" />}
              <span className="font-semibold text-pi-ink">{it.name}</span>
              <span>{it.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </m.div>
  )
}
