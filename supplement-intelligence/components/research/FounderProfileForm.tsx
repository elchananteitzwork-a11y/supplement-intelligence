'use client'

import { useState } from 'react'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

interface Props {
  initial?: Partial<FounderProfile>
  onSave: (profile: FounderProfile) => Promise<void>
  saving: boolean
}

type Step = 'capital' | 'experience' | 'channel' | 'goals'

const STEPS: Step[] = ['capital', 'experience', 'channel', 'goals']

function RadioGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string
  name: string
  options: { value: T; label: string; note?: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-300">{label}</legend>
      <div className="space-y-2">
        {options.map(o => (
          <label
            key={o.value}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
              value === o.value
                ? 'border-indigo-500 bg-indigo-950/30'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 accent-indigo-500"
            />
            <div>
              <span className="text-sm text-gray-200">{o.label}</span>
              {o.note && <p className="text-xs text-gray-500 mt-0.5">{o.note}</p>}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function FounderProfileForm({ initial, onSave, saving }: Props) {
  const [step, setStep] = useState<Step>('capital')
  const [form, setForm] = useState<Partial<FounderProfile>>({
    capital_available:        initial?.capital_available,
    capital_confidence:       initial?.capital_confidence,
    manufacturing_experience: initial?.manufacturing_experience,
    regulatory_experience:    initial?.regulatory_experience,
    channel_type:             initial?.channel_type,
    channel_size:             initial?.channel_size,
    target_geography:         initial?.target_geography,
    time_horizon:             initial?.time_horizon,
    risk_posture:             initial?.risk_posture,
    long_term_goal:           initial?.long_term_goal,
  })

  function set<K extends keyof FounderProfile>(k: K, v: FounderProfile[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function isStepComplete(s: Step): boolean {
    switch (s) {
      case 'capital':
        return !!form.capital_available && !!form.capital_confidence
      case 'experience':
        return !!form.manufacturing_experience && !!form.regulatory_experience && !!form.target_geography
      case 'channel':
        return !!form.channel_type && !!form.time_horizon
      case 'goals':
        return !!form.risk_posture && !!form.long_term_goal
    }
  }

  function stepIndex(s: Step) { return STEPS.indexOf(s) }
  const currentIndex = stepIndex(step)
  const isComplete = STEPS.every(isStepComplete)

  async function handleSubmit() {
    if (!isComplete) return
    await onSave(form as FounderProfile)
  }

  return (
    <div className="space-y-6">
      {/* Step nav */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 text-xs py-1.5 rounded transition-colors ${
              s === step
                ? 'bg-indigo-600 text-white'
                : isStepComplete(s)
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : i <= currentIndex
                ? 'bg-gray-800 text-gray-400'
                : 'bg-gray-900 text-gray-600 cursor-default'
            }`}
            disabled={i > currentIndex && !isStepComplete(STEPS[i - 1])}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Step content */}
      {step === 'capital' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Capital available for this venture (USD)
            </label>
            <input
              type="number"
              min={0}
              value={form.capital_available ?? ''}
              onChange={e => set('capital_available', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 50000"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500">Include what you can realistically deploy in the first 12 months.</p>
          </div>

          <RadioGroup
            label="How confident are you in this figure?"
            name="capital_confidence"
            value={form.capital_confidence}
            onChange={v => set('capital_confidence', v)}
            options={[
              { value: 'committed', label: 'Committed', note: 'Already liquid or in a dedicated account' },
              { value: 'estimated', label: 'Estimated', note: 'Realistic but not yet liquid — e.g. home equity, investor conversation' },
              { value: 'speculative', label: 'Speculative', note: 'Would need to raise or liquidate to access' },
            ]}
          />
        </div>
      )}

      {step === 'experience' && (
        <div className="space-y-5">
          <RadioGroup
            label="Manufacturing & sourcing experience"
            name="manufacturing_experience"
            value={form.manufacturing_experience}
            onChange={v => set('manufacturing_experience', v)}
            options={[
              { value: 'none', label: 'None', note: 'Never sourced a physical product' },
              { value: 'sourced_before', label: 'Sourced before', note: 'Have worked with a contract manufacturer or supplier' },
              { value: 'established_relationships', label: 'Established relationships', note: 'Active relationships with co-manufacturers or 3PLs' },
            ]}
          />

          <RadioGroup
            label="FDA / supplement regulatory experience"
            name="regulatory_experience"
            value={form.regulatory_experience}
            onChange={v => set('regulatory_experience', v)}
            options={[
              { value: 'none', label: 'None', note: 'Not familiar with CFR 111, labeling requirements, or cGMP' },
              { value: 'familiar', label: 'Familiar', note: 'Understand requirements; have not managed a compliance program' },
              { value: 'certified', label: 'Certified', note: 'Have managed FDA compliance or hold a relevant credential' },
            ]}
          />

          <RadioGroup
            label="Target geography"
            name="target_geography"
            value={form.target_geography}
            onChange={v => set('target_geography', v)}
            options={[
              { value: 'us_only', label: 'US only' },
              { value: 'multi_region', label: 'Multi-region', note: 'US + Canada or EU' },
              { value: 'international', label: 'International from day one' },
            ]}
          />
        </div>
      )}

      {step === 'channel' && (
        <div className="space-y-5">
          <RadioGroup
            label="Primary customer acquisition channel"
            name="channel_type"
            value={form.channel_type}
            onChange={v => set('channel_type', v)}
            options={[
              { value: 'none', label: 'None', note: 'Starting from zero — will rely on paid acquisition' },
              { value: 'social_audience', label: 'Social audience', note: 'Instagram, TikTok, YouTube, or podcast following' },
              { value: 'email_list', label: 'Email list', note: 'Opt-in email list with healthy open rates' },
              { value: 'retail_relationships', label: 'Retail relationships', note: 'Existing buyer relationships at retail chains' },
              { value: 'wholesale', label: 'Wholesale / B2B', note: 'Gym chains, practitioners, distributors' },
              { value: 'multiple', label: 'Multiple channels' },
            ]}
          />

          {(form.channel_type === 'social_audience' || form.channel_type === 'email_list') && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Audience / list size
              </label>
              <input
                type="number"
                min={0}
                value={form.channel_size ?? ''}
                onChange={e => set('channel_size', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 25000"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <RadioGroup
            label="Time horizon to first sale"
            name="time_horizon"
            value={form.time_horizon}
            onChange={v => set('time_horizon', v)}
            options={[
              { value: 'under_6mo', label: 'Under 6 months', note: 'Need revenue quickly — low-complexity only' },
              { value: '6_to_18mo', label: '6–18 months', note: 'Can invest time in proper product development' },
              { value: '18_plus_mo', label: '18+ months', note: 'Building for the long term; runway available' },
            ]}
          />
        </div>
      )}

      {step === 'goals' && (
        <div className="space-y-5">
          <RadioGroup
            label="Risk posture"
            name="risk_posture"
            value={form.risk_posture}
            onChange={v => set('risk_posture', v)}
            options={[
              { value: 'capital_preservation', label: 'Capital preservation', note: 'Cannot afford to lose the investment — need high confidence' },
              { value: 'balanced', label: 'Balanced', note: 'Willing to accept moderate risk for meaningful upside' },
              { value: 'high_risk_tolerance', label: 'High risk tolerance', note: 'Willing to lose everything if the upside is right' },
            ]}
          />

          <RadioGroup
            label="Long-term goal"
            name="long_term_goal"
            value={form.long_term_goal}
            onChange={v => set('long_term_goal', v)}
            options={[
              { value: 'lifestyle_business', label: 'Lifestyle business', note: 'Profitable, self-sustaining — $1–5M/yr revenue is the goal' },
              { value: 'scale_to_exit', label: 'Scale to exit', note: 'Build to $10–50M revenue and sell or raise a Series A' },
              { value: 'strategic_asset', label: 'Strategic asset', note: 'Complement an existing business or portfolio' },
            ]}
          />
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep(STEPS[currentIndex - 1])}
          disabled={currentIndex === 0}
          className="text-sm text-gray-400 hover:text-gray-200 disabled:opacity-0 transition-colors"
        >
          ← Back
        </button>

        {step !== 'goals' ? (
          <button
            onClick={() => setStep(STEPS[currentIndex + 1])}
            disabled={!isStepComplete(step)}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!isComplete || saving}
            className="rounded-lg bg-green-700 px-5 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        )}
      </div>

      {/* Completion indicator */}
      <div className="flex gap-2">
        {STEPS.map(s => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              isStepComplete(s) ? 'bg-indigo-500' : 'bg-gray-800'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
