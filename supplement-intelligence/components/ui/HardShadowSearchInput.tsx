'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

// The ONE element in the design system permitted a hard shadow, per
// design-system.md: "A single, subtle, non-diffused 'hard shadow' ... is
// permitted only for the primary search input." Shadow recedes on focus
// (press-in effect), matching the Stitch Sign In / Landing reference.
export const HardShadowSearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function HardShadowSearchInput({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={`w-full bg-white border-2 border-black px-4 py-3 text-body-md font-sans text-ink placeholder-outline shadow-hard focus:outline-none focus:shadow-none focus:translate-x-px focus:translate-y-px transition-all ${className}`}
      />
    )
  },
)

export const HardShadowSearchTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function HardShadowSearchTextarea({ className = '', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        className={`w-full bg-white border-2 border-black px-4 py-3 text-body-md font-sans text-ink placeholder-outline shadow-hard focus:outline-none focus:shadow-none focus:translate-x-px focus:translate-y-px transition-all resize-none ${className}`}
      />
    )
  },
)
