import { Source_Serif_4 } from 'next/font/google'
import type { ReactNode } from 'react'

// The serif carries exactly one editorial moment per screen (Design Spec v2) —
// loaded only under /pipeline, so no other route pays for it.
const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-serif-pi',
  display: 'swap',
})

export default function PipelineLayout({ children }: { children: ReactNode }) {
  return <div className={serif.variable}>{children}</div>
}
