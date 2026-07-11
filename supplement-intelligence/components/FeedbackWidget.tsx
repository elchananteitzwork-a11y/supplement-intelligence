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
      <div className="bg-white border border-black p-6 text-center animate-in">
        <IconCheck className="w-5 h-5 text-[#008a00] mx-auto mb-2" />
        <p className="text-sm text-black font-medium">Thank you for the feedback.</p>
        <p className="text-xs text-[#7e7576] mt-1">It directly shapes the next version.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-black p-6">
      <p className="text-sm font-medium text-black mb-4">Was this analysis useful?</p>

      <div className="flex gap-1 mb-5">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s} type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl transition-transform hover:scale-110"
          >
            <span className={s <= (hover || rating) ? 'text-[#fbc02d]' : 'text-black/15'}>★</span>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="space-y-4 animate-in">
          <div>
            <p className="text-xs font-mono text-[#7e7576] uppercase mb-2">What was most useful?</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value} type="button"
                  onClick={() => setCategory(c.value)}
                  className={`text-xs px-3 py-1.5 border transition-colors ${
                    category === c.value
                      ? 'bg-black border-black text-white'
                      : 'bg-white border-black text-[#4c4546] hover:text-black hover:bg-[#f3f3f3]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-mono text-[#7e7576] uppercase mb-2">One thing to improve (optional)</p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Be blunt. What was wrong or missing?"
              className="w-full bg-white border-2 border-black px-4 py-2.5 text-sm text-black placeholder-[#7e7576] focus:outline-none transition-colors resize-none h-20"
              maxLength={500}
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-black border-2 border-black text-white text-sm font-black uppercase tracking-wide px-5 py-2.5 hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  )
}
