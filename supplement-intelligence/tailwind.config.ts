import type { Config } from 'tailwindcss'

// Neo-brutalist design system — ported from the imported Stitch prototype's
// own embedded design tokens (stitch-import/product-intelligence-design-foundation/
// design-system.md and the matching values repeated across every screen's
// inline Tailwind config). Monochrome surfaces; verdict colors are the only
// chromatic values permitted anywhere in the UI.
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-jbmono)', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#f9f9f9',
          dim: '#dadada',
          bright: '#f9f9f9',
          'container-lowest': '#ffffff',
          'container-low': '#f3f3f3',
          container: '#eeeeee',
          'container-high': '#e8e8e8',
          'container-highest': '#e2e2e2',
          variant: '#e2e2e2',
        },
        ink: {
          DEFAULT: '#1a1c1c',       // on-surface — primary body text
          variant: '#4c4546',       // on-surface-variant — secondary text
          inverse: '#2f3131',
          'inverse-on': '#f1f1f1',
        },
        outline: {
          DEFAULT: '#7e7576',
          variant: '#cfc4c5',
        },
        primary: {
          DEFAULT: '#000000',
          on: '#ffffff',
          container: '#1b1b1b',
          'on-container': '#848484',
        },
        secondary: {
          DEFAULT: '#5d5f5f',
          on: '#ffffff',
          container: '#dfe0e0',
          'on-container': '#616363',
        },
        error: {
          DEFAULT: '#ba1a1a',
          on: '#ffffff',
          container: '#ffdad6',
          'on-container': '#93000a',
        },
        // The ONLY chromatic colors permitted anywhere in the UI — every
        // other surface/text color above is monochrome by design.
        verdict: {
          positive: '#008a00', // BUILD_NOW / PURSUE
          caution:  '#fbc02d', // VALIDATE_FURTHER / PURSUE_WITH_CAUTION / INVESTIGATE_FURTHER (badge fill; use #a67c00 for standalone text on white)
          'caution-text': '#a67c00',
          negative: '#d32f2f', // SKIP / DO_NOT_PURSUE
          neutral:  '#000000', // CATEGORY_CREATION_CANDIDATE
        },
      },
      fontSize: {
        'headline-xl': ['56px', { lineHeight: '64px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-xl-mobile': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '800' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-mono': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'verdict-sm': ['12px', { lineHeight: '12px', fontWeight: '900' }],
      },
      spacing: {
        gutter: '24px',
        'container-p': '40px',
        'element-gap': '16px',
        'section-gap': '64px',
      },
      borderRadius: {
        none: '0px',
        full: '9999px', // reserved for Witness Dots and other explicit circular elements
      },
      boxShadow: {
        // The one permitted "hard shadow" — reserved for HardShadowSearchInput
        // and, sparingly, primary CTA hover states. Never a soft/blurred shadow.
        hard: '2px 2px 0px 0px rgba(0,0,0,1)',
        'hard-lg': '4px 4px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
  plugins: [],
}

export default config
