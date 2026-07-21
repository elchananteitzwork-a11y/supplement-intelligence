import type { Config } from 'tailwindcss'

// Neo-brutalist design system — ported from the imported Stitch prototype's
// own embedded design tokens (stitch-import/product-intelligence-design-foundation/
// design-system.md and the matching values repeated across every screen's
// inline Tailwind config). Monochrome surfaces; verdict colors are the only
// chromatic values permitted anywhere in the UI.
const config: Config = {
    darkMode: ['class'],
    content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: [
  				'var(--font-inter)',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'sans-serif'
  			],
  			mono: [
  				'var(--font-jbmono)',
  				'Fira Code',
  				'monospace'
  			],
  			serif: [
  				'var(--font-serif-pi)',
  				'Georgia',
  				'serif'
  			]
  		},
  		colors: {
  			// Product Intelligence v2 warm-cream system (Design Spec v2) —
  			// namespaced so the legacy surface/ink system stays untouched.
  			pi: {
  				cream: '#FBF7EE',
  				card: '#FFFFFF',
  				sand: '#F6F0E0',
  				ink: '#16171A',
  				sub: '#6B6F76',
  				faint: '#8C877C',
  				gold: '#8D6A16',
  				'gold-bright': '#C9971F',
  				'gold-deep': '#D4A94A',
  				build: '#2E6B48',
  				invest: '#35507A',
  				pass: '#6E6A5C',
  				risk: '#A13F2E',
  				hairline: 'rgba(22,23,26,0.09)'
  			},
  			surface: {
  				DEFAULT: '#f9f9f9',
  				dim: '#dadada',
  				bright: '#f9f9f9',
  				'container-lowest': '#ffffff',
  				'container-low': '#f3f3f3',
  				container: '#eeeeee',
  				'container-high': '#e8e8e8',
  				'container-highest': '#e2e2e2',
  				variant: '#e2e2e2'
  			},
  			ink: {
  				DEFAULT: '#1a1c1c',
  				variant: '#4c4546',
  				inverse: '#2f3131',
  				'inverse-on': '#f1f1f1'
  			},
  			outline: {
  				DEFAULT: '#7e7576',
  				variant: '#cfc4c5'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				on: '#ffffff',
  				container: '#1b1b1b',
  				'on-container': '#848484',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				on: '#ffffff',
  				container: '#dfe0e0',
  				'on-container': '#616363',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			error: {
  				DEFAULT: '#ba1a1a',
  				on: '#ffffff',
  				container: '#ffdad6',
  				'on-container': '#93000a'
  			},
  			verdict: {
  				positive: '#008a00',
  				caution: '#fbc02d',
  				'caution-text': '#a67c00',
  				negative: '#d32f2f',
  				neutral: '#000000'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: 'hsl(var(--destructive))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontSize: {
  			'headline-xl': [
  				'56px',
  				{
  					lineHeight: '64px',
  					letterSpacing: '-0.02em',
  					fontWeight: '800'
  				}
  			],
  			'headline-xl-mobile': [
  				'32px',
  				{
  					lineHeight: '40px',
  					letterSpacing: '-0.01em',
  					fontWeight: '800'
  				}
  			],
  			'headline-md': [
  				'24px',
  				{
  					lineHeight: '32px',
  					fontWeight: '700'
  				}
  			],
  			'body-lg': [
  				'18px',
  				{
  					lineHeight: '28px',
  					fontWeight: '400'
  				}
  			],
  			'body-md': [
  				'14px',
  				{
  					lineHeight: '20px',
  					fontWeight: '400'
  				}
  			],
  			'label-mono': [
  				'12px',
  				{
  					lineHeight: '16px',
  					letterSpacing: '0.05em',
  					fontWeight: '500'
  				}
  			],
  			'verdict-sm': [
  				'12px',
  				{
  					lineHeight: '12px',
  					fontWeight: '900'
  				}
  			]
  		},
  		spacing: {
  			gutter: '24px',
  			'container-p': '40px',
  			'element-gap': '16px',
  			'section-gap': '64px'
  		},
  		borderRadius: {
  			none: '0px',
  			full: '9999px',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			hard: '2px 2px 0px 0px rgba(0,0,0,1)',
  			'hard-lg': '4px 4px 0px 0px rgba(0,0,0,1)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
