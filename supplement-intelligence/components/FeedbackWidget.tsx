'use client'

import { useState } from 'react'
import { IconCheck } from '@/components/icons'

const CATEGORIES = [
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'usefulness', label: 'Usefulness' },
  { value: 'formula', label: 'Formula' },
  { value: 'ui', label: 'UI / Design' },
  { value: 'other', label: 'Other' },
]

export default function FeedbackWidget({ analysisId }: { analysisId: string }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover]   = useState(0)
  const [category, setCategory] = useState('usefulness')
  const [comment, setComment]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  async function submit() {
    if (!rating || loading) return
    setLoading(true)
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis_id: analysisId, rating, category, comment: comment.trim() || undefined }),
    })
    setLoading(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="bg-pi-card border border-pi-hairline rounded-xl p-6 text-center animate-in">
        <IconCheck className="w-5 h-5 text-pi-build mx-auto mb-2" />
        <p className="text-sm text-pi-ink font-medium">Thank you for the feedback.</p>
        <p className="text-xs text-pi-sub mt-1">It directly shapes the next version.</p>
      </div>
    )
  }

  return (
    <div className="bg-pi-card border border-pi-hairline rounded-xl p-6">
      <p className="text-sm font-medium text-pi-ink mb-4">Was this analysis useful?</p>

      <div className="flex gap-1 mb-5">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s} type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl transition-transform hover:scale-110"
          >
            <span className={s <= (hover || rating) ? 'text-pi-gold-deep' : 'text-pi-ink/10'}>★</span>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="space-y-4 animate-in">
          <div>
            <p className="text-xs font-mono text-pi-sub uppercase mb-2">What was most useful?</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value} type="button"
                  onClick={() => setCategory(c.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === c.value
                      ? 'bg-pi-ink border-pi-ink text-pi-cream'
                      : 'bg-pi-card border-pi-hairline text-pi-sub hover:text-pi-ink hover:bg-pi-sand'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-mono text-pi-sub uppercase mb-2">One thing to improve (optional)</p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Be blunt. What was wrong or missing?"
              className="w-full bg-pi-card border border-pi-hairline rounded-lg px-4 py-2.5 text-sm text-pi-ink placeholder-pi-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright transition-colors resize-none h-20"
              maxLength={500}
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-pi-ink border border-pi-ink rounded-lg text-pi-cream text-sm font-black uppercase tracking-wide px-5 py-2.5 hover:bg-[#24262B] transition-colors duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  )
}
