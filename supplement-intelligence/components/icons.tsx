// Minimal thin-stroke icon set — replaces decorative unicode glyphs (◎ ⬡ ⬟ ◈ ◉ ◫ ▲ ▼ →)
// used throughout the app. Consistent 1.5px stroke, 24x24 viewbox, no fill.

type IconProps = { className?: string }

const base = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5 }

export function IconTarget({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" strokeLinecap="round" />
      <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

export function IconGrid({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" strokeLinecap="round" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" strokeLinecap="round" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" strokeLinecap="round" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconBeaker({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M10 3v6.5L4.8 18.4A1.8 1.8 0 0 0 6.35 21h11.3a1.8 1.8 0 0 0 1.55-2.6L14 9.5V3" />
      <path strokeLinecap="round" d="M7.5 15h9" />
    </svg>
  )
}

export function IconChart({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 19v-5M12 19V8M17 19v-9" />
    </svg>
  )
}

export function IconGauge({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" d="M4.5 17.5a8 8 0 1 1 15 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.5l3.2-5.3" />
      <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBubbles({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 10.5c0 3.6-3.4 6.5-7.6 6.5-.8 0-1.6-.1-2.3-.3L6 18.5l.9-3.1C5.4 14.2 4.4 12.5 4.4 10.5 4.4 6.9 7.8 4 12 4s8 2.9 8 6.5Z" />
    </svg>
  )
}

export function IconTrendUp({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l5.5-5.5 4 4L20 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 8H20v5.5" />
    </svg>
  )
}

export function IconTrendDown({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8l5.5 5.5 4-4L20 16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 16H20v-5.5" />
    </svg>
  )
}

export function IconFlag({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 21V4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5c1.5-1 3.5-1 5 0s3.5 1 5 0v8c-1.5 1-3.5 1-5 0s-3.5-1-5 0" />
    </svg>
  )
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  )
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function IconX({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l9 16h-18l9-16Z" />
      <path strokeLinecap="round" d="M12 10v4" />
      <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSpark({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  )
}
