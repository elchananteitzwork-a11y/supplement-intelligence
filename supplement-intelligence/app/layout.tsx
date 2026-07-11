import type { Metadata } from 'next'
import { Inter, Fraunces, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import './design-tokens.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT', 'WONK'],
  variable: '--font-fraunces',
  display: 'swap',
})

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jbmono',
  display: 'swap',
})

// Intelligence Lab design system — display face for the upcoming visual
// redesign (see design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md). Loaded now,
// additively, so the token foundation is real and usable; not yet
// referenced by any page — Fraunces remains the active display face
// until the page-by-page redesign pass cuts over.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Supplement Intelligence — Know Before You Build',
  description: 'Generate investor-grade supplement analysis in 60 seconds. Market gaps, formula, financials, and a grounded Entry Supported or Not Supported verdict.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jbMono.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  )
}
