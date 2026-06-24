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
        sans:  ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
        mono:  ['var(--font-jbmono)', 'Fira Code', 'monospace'],
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
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        riseIn: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'rise-in': 'riseIn .6s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
}

export default config
