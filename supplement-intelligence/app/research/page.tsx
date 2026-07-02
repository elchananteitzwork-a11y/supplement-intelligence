'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/research/market-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      router.push(`/research/${data.signal_id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-24">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Market Intelligence Engine
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Stage 1: Provider data collection — no AI synthesis. All signals
            are labeled by source type and evidence quality before any
            interpretation occurs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. magnesium glycinate, collagen peptides…"
              disabled={loading}
              className="
                flex-1 rounded-lg border border-gray-700 bg-gray-900
                px-4 py-3 text-sm placeholder:text-gray-500
                focus:outline-none focus:ring-2 focus:ring-indigo-500
                disabled:opacity-50
              "
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="
                rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium
                hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {loading ? 'Running…' : 'Analyze'}
            </button>
          </div>

          {loading && (
            <p className="text-xs text-gray-400 animate-pulse">
              Collecting provider signals — Keepa, Apify, Google Trends, TikTok, openFDA, PubMed…
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">
              {error}
            </p>
          )}
        </form>

        <div className="border border-gray-800 rounded-lg p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400">What Stage 1 collects:</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Demand signals — Keepa BSR, monthly units sold, Google Trends</li>
            <li>Competition map — Apify Amazon search, review concentration</li>
            <li>Price distribution — Keepa avg90/avg365 with compression signal</li>
            <li>Growth momentum — 90-day and YoY BSR trend</li>
            <li>Social demand — TikTok hashtag views</li>
            <li>Safety signals — openFDA recalls, PubMed adverse events</li>
          </ul>
          <p className="pt-1 text-gray-600">
            No AI synthesis in Stage 1. Data Quality Gate runs before Stage 2.
          </p>
        </div>
      </div>
    </main>
  )
}
