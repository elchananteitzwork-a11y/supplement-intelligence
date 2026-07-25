'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { PrimitiveVariant } from './HardCard'

// The ONE element in the design system permitted a hard shadow, per
// design-system.md: "A single, subtle, non-diffused 'hard shadow' ... is
// permitted only for the primary search input." Shadow recedes on focus
// (press-in effect), matching the Stitch Sign In / Landing reference.
//
// `variant="pi"` (2026-07-24): pi warm-cream opt-in — soft depth + gold
// focus ring instead of the hard shadow. Default ('legacy') unchanged.
const LEGACY_INPUT = 'w-full bg-white border-2 border-black px-4 py-3 text-body-md font-sans text-ink placeholder-outline shadow-hard focus:outline-none focus:shadow-none focus:translate-x-px focus:translate-y-px transition-all'
const PI_INPUT = 'w-full rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 text-sm font-sans text-pi-ink placeholder:text-pi-faint shadow-[0_1px_2px_rgba(22,23,26,0.04)] focus:outline-none focus:ring-2 focus:ring-pi-gold-bright transition-shadow'

type VariantProp = { variant?: PrimitiveVariant }

export const HardShadowSearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & VariantProp>(
  function HardShadowSearchInput({ className = '', variant = 'legacy', ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={`${variant === 'pi' ? PI_INPUT : LEGACY_INPUT} ${className}`}
      />
    )
  },
)

export const HardShadowSearchTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & VariantProp>(
  function HardShadowSearchTextarea({ className = '', variant = 'legacy', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        className={`${variant === 'pi' ? PI_INPUT : LEGACY_INPUT} resize-none ${className}`}
      />
    )
  },
)
