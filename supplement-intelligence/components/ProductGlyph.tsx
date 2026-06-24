// Shared product-shape visualization — silhouette inference from the recommended
// format string, plus two render fidelities: a compact flat glyph for cards/lists,
// and a premium studio-lit hero render for the memo's Launch Strategy section.
// Pure SVG/CSS — no images, no external calls. Nothing here is a real product
// photo; the hero render is explicitly labeled a concept render by its caller.

export type ProductShape = 'capsule' | 'bottle' | 'jar' | 'pouch' | 'dropper' | 'bar'

export function inferProductShape(format: string): ProductShape {
  const f = (format ?? '').toLowerCase()
  if (['capsule', 'softgel', 'tablet', 'pill'].some(t => f.includes(t))) return 'capsule'
  if (['powder', 'sachet', 'stick pack'].some(t => f.includes(t))) return 'pouch'
  if (['gummy', 'chewable', 'cream', 'lotion', 'balm', 'mask'].some(t => f.includes(t))) return 'jar'
  if (['liquid', 'tincture', 'serum', 'oil', 'drop'].some(t => f.includes(t))) return 'dropper'
  if (['bar', 'gel', 'ready-to-drink', 'rtd', 'protein'].some(t => f.includes(t))) return 'bar'
  return 'bottle'
}

// ── Mini glyph — single-tone silhouette, sized for a card corner or list row.
// No gradients/shading at this scale; just enough form to read as "a product."
export const MINI_PATHS: Record<ProductShape, string> = {
  capsule: 'M17 6a7 7 0 0 1 7 7v17a7 7 0 0 1-14 0V13a7 7 0 0 1 7-7Z M10 16h14',
  bottle:  'M13 14h8v4.5h2.5a2 2 0 0 1 2 2V40a2 2 0 0 1-2 2H10.5a2 2 0 0 1-2-2V20.5a2 2 0 0 1 2-2H13Z M12 8h10v6H12Z',
  jar:     'M8 16h18a2 2 0 0 1 2 2v20a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V18a2 2 0 0 1 2-2Z M7 11h20v5H7Z',
  pouch:   'M11 38V21q0-4 4-5h6q4 1 4 5v17a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3Z M13 16l1-5h8l1 5Z',
  dropper: 'M12 22h12v15a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 12 37Z M16 8h4v12h-4Z M18 5.5a3 3 0 0 1 3 3v1.5h-6V8.5a3 3 0 0 1 3-3Z',
  bar:     'M6 17a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z',
}

export function ProductGlyphMini({
  shape, className, title,
}: { shape: ProductShape; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 36 44" className={className} fill="currentColor" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={MINI_PATHS[shape]} fillRule="evenodd" />
    </svg>
  )
}

// ── Hero render — studio-lit concept render. Cylindrical multi-stop body
// gradient (mimics a turntable product-photo light wrap), a concentrated
// specular hotspot, a cool rim light on the trailing edge, a blurred contact
// shadow, and a soft backdrop glow — the vocabulary of premium e-commerce
// product photography, built entirely from layered SVG shapes.
function HeroDefs({ uid, accent }: { uid: string; accent: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="#08080a" />
        <stop offset="16%"  stopColor="#3a3a40" />
        <stop offset="32%"  stopColor="#1a1a1e" />
        <stop offset="58%"  stopColor="#242428" />
        <stop offset="80%"  stopColor="#101013" />
        <stop offset="100%" stopColor="#020203" />
      </linearGradient>
      <linearGradient id={`${uid}-brass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#F1DCA8" />
        <stop offset="45%"  stopColor={accent} />
        <stop offset="100%" stopColor="#8A6E3F" />
      </linearGradient>
      <radialGradient id={`${uid}-spec`} cx="30%" cy="18%" r="38%">
        <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="#ffffff" stopOpacity="0" />
        <stop offset="86%"  stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
      </linearGradient>
      <radialGradient id={`${uid}-backdrop`} cx="50%" cy="38%" r="55%">
        <stop offset="0%"   stopColor={accent} stopOpacity="0.16" />
        <stop offset="100%" stopColor={accent} stopOpacity="0" />
      </radialGradient>
      <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
  )
}

export function ProductRenderHero({
  shape, accent = '#C8A463',
}: { shape: ProductShape; accent?: string }) {
  const uid = `pr-${shape}`
  const body  = `url(#${uid}-body)`
  const brass = `url(#${uid}-brass)`
  const spec  = `url(#${uid}-spec)`
  const rim   = `url(#${uid}-rim)`

  return (
    <svg viewBox="0 0 220 280" className="w-40 sm:w-48 h-auto" style={{ animation: 'productFloat 5s ease-in-out infinite' }}>
      <HeroDefs uid={uid} accent={accent} />
      <circle cx="110" cy="120" r="108" fill={`url(#${uid}-backdrop)`} />
      <ellipse cx="110" cy="252" rx="54" ry="10" fill="#000000" opacity="0.55" filter={`url(#${uid}-blur)`} />
      <line x1="36" y1="262" x2="184" y2="262" stroke={accent} strokeOpacity="0.18" strokeWidth="1" />

      {shape === 'capsule' && (
        <g>
          <defs><clipPath id={`${uid}-clip`}><rect x="74" y="42" width="72" height="190" rx="36" /></clipPath></defs>
          <rect x="74" y="42" width="72" height="190" rx="36" fill={body} />
          <rect x="74" y="138" width="72" height="94" fill={brass} clipPath={`url(#${uid}-clip)`} opacity="0.92" />
          <rect x="74" y="134" width="72" height="3" fill="#000000" opacity="0.35" clipPath={`url(#${uid}-clip)`} />
          <rect x="74" y="42" width="72" height="190" rx="36" fill={spec} />
          <rect x="138" y="42" width="8" height="190" rx="4" fill={rim} />
        </g>
      )}

      {shape === 'bottle' && (
        <g>
          <rect x="60" y="98" width="100" height="134" rx="16" fill={body} />
          <rect x="92" y="64" width="36" height="40" fill={body} />
          <rect x="92" y="64" width="36" height="3.5" fill="#000" opacity="0.3" />
          <rect x="92" y="72" width="36" height="2" fill="#000" opacity="0.25" />
          <rect x="92" y="80" width="36" height="2" fill="#000" opacity="0.25" />
          <rect x="82" y="40" width="56" height="28" rx="6" fill={brass} />
          <rect x="82" y="62" width="56" height="3" fill="#000" opacity="0.25" />
          <rect x="68" y="146" width="84" height="46" rx="3" fill="#000000" opacity="0.28" />
          <rect x="68" y="146" width="84" height="2" fill="#ffffff" opacity="0.12" />
          <rect x="60" y="98" width="100" height="134" rx="16" fill={spec} />
          <rect x="150" y="98" width="10" height="134" rx="5" fill={rim} />
        </g>
      )}

      {shape === 'jar' && (
        <g>
          <rect x="52" y="92" width="116" height="138" rx="18" fill={body} />
          <rect x="44" y="64" width="132" height="32" rx="11" fill={brass} />
          <rect x="44" y="92" width="132" height="3" fill="#000" opacity="0.3" />
          <rect x="74" y="148" width="72" height="50" rx="4" fill="#000000" opacity="0.24" />
          <rect x="74" y="148" width="72" height="2" fill="#ffffff" opacity="0.1" />
          <rect x="52" y="92" width="116" height="138" rx="18" fill={spec} />
          <rect x="158" y="92" width="10" height="138" rx="5" fill={rim} />
        </g>
      )}

      {shape === 'pouch' && (
        <g>
          <path d="M64,232 L64,128 Q64,100 92,92 L128,92 Q156,100 156,128 L156,232 Z" fill={body} />
          <path d="M76,92 L82,54 L138,54 L144,92 Z" fill={brass} opacity="0.95" />
          <path d="M76,92 L144,92" stroke="#000" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M70,150 L150,150" stroke="#000" strokeOpacity="0.18" strokeWidth="1" />
          <path d="M70,168 L150,168" stroke="#000" strokeOpacity="0.14" strokeWidth="1" />
          <rect x="86" y="148" width="48" height="34" rx="3" fill="#000000" opacity="0.22" />
          <path d="M64,232 L64,128 Q64,100 92,92 L128,92 Q156,100 156,128 L156,232 Z" fill={spec} />
          <path d="M148,100 L156,128 L156,232" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="4" fill="none" />
        </g>
      )}

      {shape === 'dropper' && (
        <g>
          <rect x="70" y="132" width="80" height="100" rx="16" fill={body} opacity="0.94" />
          <rect x="78" y="140" width="10" height="84" rx="5" fill="#ffffff" opacity="0.08" />
          <rect x="100" y="52" width="20" height="82" fill={brass} />
          <ellipse cx="110" cy="50" rx="16" ry="12" fill={brass} />
          <ellipse cx="110" cy="50" rx="16" ry="12" fill={spec} />
          <rect x="104" y="62" width="3" height="60" fill="#000" opacity="0.2" />
          <rect x="70" y="132" width="80" height="100" rx="16" fill={spec} />
          <rect x="142" y="132" width="8" height="100" rx="4" fill={rim} />
        </g>
      )}

      {shape === 'bar' && (
        <g>
          <rect x="38" y="106" width="144" height="68" rx="11" fill={body} />
          <path d="M38,118 L26,110 L26,134 L38,126Z" fill={brass} />
          <path d="M182,118 L194,110 L194,134 L182,126Z" fill={brass} />
          <line x1="38" y1="140" x2="182" y2="140" stroke="#000" strokeOpacity="0.28" strokeWidth="2" />
          <line x1="60" y1="106" x2="60" y2="174" stroke="#000" strokeOpacity="0.12" strokeWidth="1" />
          <line x1="160" y1="106" x2="160" y2="174" stroke="#000" strokeOpacity="0.12" strokeWidth="1" />
          <rect x="38" y="106" width="144" height="68" rx="11" fill={spec} />
          <rect x="172" y="106" width="10" height="68" rx="5" fill={rim} />
        </g>
      )}
    </svg>
  )
}
