'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STEPS = [
  'Mapping market conditions...',
  'Scoring demand and competition...',
  'Analyzing virality potential...',
  'Building formula recommendation...',
  'Calculating financial projections...',
  'Writing investment memo...',
]

const EXAMPLES = [
  'Cortisol support for women 35+',
  'PCOS weight loss supplement',
  'Postpartum recovery supplement',
  'Blood sugar and energy crash',
  'Dog anxiety and gut health',
]

const PRICES = [
  { value: '',         label: 'Not sure' },
  { value: 'under-30', label: 'Under $30/mo' },
  { value: '30-50',    label: '$30–$50/mo' },
  { value: '50-75',    label: '$50–$75/mo' },
  { value: '75-plus',  label: '$75+/mo' },
]

export default function AnalyzePage() {
  const router = useRouter()

  const [input,      setInput]      = useState('')
  const [audience,   setAudience]   = useState('')
  const [price,      setPrice]      = useState('')
  const [extra,      setExtra]      = useState('')
  const [showExtra,  setShowExtra]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [stepIdx,    setStepIdx]    = useState(0)
  const [error,      setError]      = useState('')

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    setLoading(true); setError(''); setStepIdx(0)

    const timer = setInterval(
      () => setStepIdx(i => Math.min(i + 1, STEPS.length - 1)),
      8000
    )

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input:          input.trim(),
          targetAudience: audience.trim() || undefined,
          pricePoint:     price || undefined,
          context:        extra.trim()  || undefined,
        }),
      })

      clearInterval(timer)

      if (res.status === 429) { setError('You have used all your beta analyses. Thank you for testing!'); setLoading(false); return }
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Generation failed') }

      const { analysisId } = await res.json()
      router.push(`/memo/${analysisId}`)
    } catch (err: unknown) {
      clearInterval(timer)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  /* ── LOADING SCREEN ── */
  if (loading) {
    const pct = Math.round(((stepIdx + 1) / STEPS.length) * 100)
    const r   = 40
    const circ = 2 * Math.PI * r
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-10 text-center animate-in">

          {/* ring */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r={r} fill="none" stroke="#27272a" strokeWidth="6"/>
              <circle cx="48" cy="48" r={r} fill="none" stroke="#34d399" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ - (circ * pct) / 100}
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-emerald-400">
              {pct}%
            </span>
          </div>

          <p className="text-base font-semibold mb-1 truncate px-4">&ldquo;{input}&rdquo;</p>
          <p className="text-sm text-zinc-400 mb-8 h-5">{STEPS[stepIdx]}</p>

          <div className="space-y-2.5 text-left">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3 text-sm">
                {i < stepIdx
                  ? <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                  : i === stepIdx
                    ? <div className="w-4 h-4 shrink-0 grid place-items-center"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/></div>
                    : <div className="w-4 h-4 shrink-0 rounded-full border border-zinc-700"/>
                }
                <span className={i < stepIdx ? 'text-zinc-600 line-through' : i === stepIdx ? 'text-white' : 'text-zinc-600'}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── FORM ── */
  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-xl mx-auto animate-in">

        {/* breadcrumb */}
        <Link href="/dashboard" className="btn-ghost text-xs mb-6 -ml-2 inline-flex">← Analyses</Link>

        <h1 className="text-2xl font-bold mb-1">New Analysis</h1>
        <p className="text-sm text-zinc-400 mb-8">Be specific. &ldquo;Stress hair loss women 35+&rdquo; beats &ldquo;hair supplement&rdquo;.</p>

        <form onSubmit={generate} className="space-y-5">

          {/* main input */}
          <div className="card p-6 space-y-3">
            <label className="block text-sm font-medium">
              What supplement idea do you want to analyze?
              <span className="text-red-400 ml-1">*</span>
            </label>
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              placeholder={`e.g. stress and hair loss supplement for women 35–50\ne.g. PCOS weight management with inositol\ne.g. postpartum recovery for new mothers`}
              className="field resize-none h-28 text-sm leading-relaxed"
              maxLength={200} required autoFocus
            />
            <div className="flex justify-between">
              <p className="text-xs text-zinc-600">Costs 1 analysis · ~45 seconds</p>
              <span className="text-xs text-zinc-600">{input.length}/200</span>
            </div>
          </div>

          {/* optional */}
          <div className="card p-6">
            <button type="button" onClick={() => setShowExtra(v => !v)}
              className="flex items-center justify-between w-full text-left group">
              <div>
                <p className="text-sm font-medium">Optional context</p>
                <p className="text-xs text-zinc-500 mt-0.5">Audience, price point, background knowledge</p>
              </div>
              <svg className={`w-4 h-4 text-zinc-500 shrink-0 ml-4 transition-transform ${showExtra ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {showExtra && (
              <div className="mt-5 space-y-4 animate-in">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Target audience</label>
                  <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                    placeholder="e.g. women 30–45 with hormonal issues"
                    className="field text-sm" maxLength={100}/>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Price point</label>
                  <select value={price} onChange={e => setPrice(e.target.value)} className="field text-sm">
                    {PRICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Additional context</label>
                  <textarea value={extra} onChange={e => setExtra(e.target.value)}
                    placeholder="Unique ingredient, competitor you've spotted, your background..."
                    className="field text-sm resize-none h-20" maxLength={500}/>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-sm text-red-400">{error}</div>
          )}

          <button type="submit" disabled={!input.trim()} className="btn-white w-full py-3 text-base">
            Generate Investment Memo →
          </button>

          {/* examples */}
          <div>
            <p className="text-xs text-zinc-600 mb-2.5">Quick examples:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(ex => (
                <button key={ex} type="button" onClick={() => setInput(ex)}
                  className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
