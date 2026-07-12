import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Supplement Intelligence — Know Before You Build',
  description: 'Generate investor-grade supplement analysis in 60 seconds. Market gaps, formula, financials, and a grounded Entry Supported or Not Supported verdict.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
