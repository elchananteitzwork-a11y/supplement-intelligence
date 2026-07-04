import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif:   ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
        mono:    ['var(--font-jbmono)', 'Fira Code', 'monospace'],
        // Intelligence Lab display face — not yet used by any page; see
        // design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md §2.
        display: ['var(--font-space-grotesk)', 'var(--font-inter)', 'sans-serif'],
      },
      colors: {
        // signature accent — replaces emerald as the default "brand" color.
        // emerald/amber/red are kept, but only for BUILD/VALIDATE/SKIP verdict semantics.
        brass: {
          DEFAULT: '#C8A463',
          dim:     '#9C814F',
          bright:  '#E0C285',
          bg:      'rgba(200, 164, 99, 0.08)',
          border:  'rgba(200, 164, 99, 0.22)',
        },
        ink: {
          DEFAULT: '#0a0a0c',
          raised:  '#111114',
        },
        // Intelligence Lab palette — additive, namespaced `lab.*` to avoid
        // any collision with brass/ink while pages still use them. Mirrors
        // the CSS custom properties in app/design-tokens.css 1:1 so the
        // same values are usable as Tailwind utilities (bg-lab-void-2,
        // text-lab-photon, border-lab-border-soft, etc.) or as raw CSS vars.
        lab: {
          void: {
            0: '#050507', 1: '#0a0a0d', 2: '#0f0f13', 3: '#15161b', 4: '#1b1c23', 5: '#21222b',
          },
          text: {
            primary: '#f2f3f5', secondary: '#9b9fac', tertiary: '#686c78', disabled: '#44474f', inverse: '#08090b',
          },
          photon: { dim: '#2e84d9', DEFAULT: '#4fa8ff', bright: '#7fc4ff' },
          spectrum: { dim: '#6c5ce0', DEFAULT: '#8b7cff', bright: '#aba0ff' },
          verdant: '#34d9a0',
          amber:   '#f5b947',
          ember:   '#ff6259',
          border: {
            faint: 'rgba(255,255,255,0.05)', soft: 'rgba(255,255,255,0.08)',
            default: 'rgba(255,255,255,0.12)', strong: 'rgba(255,255,255,0.18)',
          },
        },
      },
      borderRadius: {
        'lab-xs': '6px', 'lab-sm': '8px', 'lab-md': '12px', 'lab-lg': '16px', 'lab-xl': '20px',
      },
      boxShadow: {
        'lab-xs': '0 1px 2px rgba(0,0,0,0.4)',
        'lab-sm': '0 4px 12px -4px rgba(0,0,0,0.5)',
        'lab-md': '0 12px 32px -8px rgba(0,0,0,0.6)',
        'lab-lg': '0 24px 56px -16px rgba(0,0,0,0.7)',
        'lab-xl': '0 40px 96px -24px rgba(0,0,0,0.75)',
        'lab-glow-photon':   '0 0 80px rgba(79,168,255,0.18)',
        'lab-glow-spectrum': '0 0 80px rgba(139,124,255,0.16)',
        'lab-glow-verdant':  '0 0 60px rgba(52,217,160,0.16)',
        'lab-glow-amber':    '0 0 60px rgba(245,185,71,0.14)',
        'lab-glow-ember':    '0 0 60px rgba(255,98,89,0.14)',
      },
      transitionTimingFunction: {
        premium:      'cubic-bezier(.16,1,.3,1)',
        'lab-standard': 'cubic-bezier(.22,1,.36,1)',
        'lab-enter':    'cubic-bezier(.16,1,.3,1)',
      },
      transitionDuration: {
        'lab-instant': '100ms', 'lab-fast': '200ms', 'lab-base': '350ms', 'lab-slow': '600ms', 'lab-cinematic': '900ms',
      },
      keyframes: {
        riseIn: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        labFadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        labGlowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
        piFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        piGlow: {
          '0%, 100%': { opacity: '0.35' },
          '50%':      { opacity: '0.75' },
        },
        piSpin: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        piPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%':      { transform: 'scale(1.05)', opacity: '0.85' },
        },
        piBar: {
          from: { transform: 'scaleX(0)' },
          to:   { transform: 'scaleX(1)' },
        },
        piSlideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        piScaleIn: {
          from: { opacity: '0', transform: 'scale(0.9)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        piTickerLeft: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        piShimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition:  '200% center' },
        },
      },
      animation: {
        'rise-in': 'riseIn .6s cubic-bezier(.16,1,.3,1) both',
        'lab-fade-up':   'labFadeUp .35s cubic-bezier(.16,1,.3,1) both',
        'lab-glow-pulse': 'labGlowPulse 2.4s ease-in-out infinite',
        'pi-float':   'piFloat 5s ease-in-out infinite',
        'pi-float-d1':'piFloat 5s ease-in-out 1s infinite',
        'pi-float-d2':'piFloat 5s ease-in-out 2s infinite',
        'pi-glow':    'piGlow 3s ease-in-out infinite',
        'pi-spin':    'piSpin 12s linear infinite',
        'pi-pulse':   'piPulse 2s ease-in-out infinite',
        'pi-bar':     'piBar 1.2s cubic-bezier(.16,1,.3,1) both',
        'pi-slide-up':'piSlideUp .6s cubic-bezier(.16,1,.3,1) both',
        'pi-scale-in':'piScaleIn .5s cubic-bezier(.16,1,.3,1) both',
        'pi-ticker':  'piTickerLeft 28s linear infinite',
        'pi-shimmer': 'piShimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
