import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Source_Serif_4 } from 'next/font/google'
import './globals.css'

// Font stack per the Stitch design system: Inter (body/headline) + JetBrains
// Mono (labels/data). No other typefaces are part of this design.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jbmono',
  display: 'swap',
})

// Pre-beta audit fix: tailwind.config.ts's fontFamily.serif has referenced
// var(--font-serif-pi) since the pi-* system was introduced, but the
// variable itself was only ever defined under app/pipeline/layout.tsx —
// every other pi-* page's "font-serif" className silently fell back to
// Georgia. Hoisted to the root layout now that the One World redesign
// needs the same serif display face on every in-scope route (Landing,
// Login, Dashboard, Discover, Candidate Detail), not just Pipeline.
const serifPi = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-serif-pi',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Supplement Intelligence — Know Before You Build',
  description: 'Generate investor-grade supplement analysis in 60 seconds. Market gaps, formula, financials, and a grounded Entry Supported or Not Supported verdict.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jbMono.variable} ${serifPi.variable}`}>
      <body>{children}</body>
    </html>
  )
}
