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
      <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-6 text-center lab-animate-fade-up">
        <IconCheck className="w-5 h-5 text-lab-verdant mx-auto mb-2" />
        <p className="text-sm text-lab-text-primary font-medium">Thank you for the feedback.</p>
        <p className="text-xs text-lab-text-tertiary mt-1">It directly shapes the next version.</p>
      </div>
    )
  }

  return (
    <div className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-6">
      <p className="text-sm font-medium text-lab-text-primary mb-4">Was this analysis useful?</p>

      <div className="flex gap-1 mb-5">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s} type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl transition-transform hover:scale-110"
          >
            <span className={s <= (hover || rating) ? 'text-lab-amber' : 'text-white/[0.15]'}>★</span>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="space-y-4 lab-animate-fade-up">
          <div>
            <p className="text-xs text-lab-text-tertiary mb-2">What was most useful?</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value} type="button"
                  onClick={() => setCategory(c.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === c.value
                      ? 'bg-lab-photon/15 border-lab-photon/40 text-lab-photon'
                      : 'bg-white/[0.04] border-lab-border-default text-lab-text-tertiary hover:text-lab-text-primary'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-lab-text-tertiary mb-2">One thing to improve (optional)</p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Be blunt. What was wrong or missing?"
              className="w-full bg-white/[0.03] border border-lab-border-default rounded-lab-sm px-4 py-2.5 text-sm text-lab-text-primary placeholder-lab-text-tertiary focus:outline-none focus:border-lab-photon/50 transition-colors resize-none h-20"
              maxLength={500}
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-white/[0.06] border border-lab-border-default text-lab-text-primary text-sm font-medium px-5 py-2.5 rounded-lab-sm hover:bg-white/[0.1] transition-colors disabled:opacity-40"
          >
            {loading ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  )
}
