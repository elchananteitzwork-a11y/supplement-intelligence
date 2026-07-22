// ═══════════════════════════════════════════════════════════════════════
// GlassPanel — the shared glass surface recipe behind every floating
// instrument in the "One World" redesign (verdict panels, the search bar,
// the login instrument, CTA panels). Not a generic "Card" reused
// identically everywhere — each caller composes its own content on top;
// this only owns the surface: translucent blur, corner sheen highlight,
// a thin reflection streak, soft depth shadow, and an optional 3D hover
// tilt with a tone-colored glow ring.
//
// Owner-approved technique ("Borderless Live Graph Modules" direction):
// glass plane furthest back (z0) via absolutely-positioned pseudo-content,
// real content sits in normal flow above it so 3D tilt can never occlude
// what the caller renders.
// ═══════════════════════════════════════════════════════════════════════

export type GlassTone = 'build' | 'invest' | 'risk' | 'neutral'

const TONE_RING: Record<GlassTone, string> = {
  build: '#3FA36E',
  invest: '#5B7FBB',
  risk: '#C9573F',
  neutral: '#D4A94A',
}

export function GlassPanel({
  tone = 'neutral',
  hover3d = false,
  radius = 'rounded-2xl',
  children,
  className = '',
}: {
  tone?: GlassTone
  /** Enables the preserve-3d hover tilt (verdict/proof cards). Off for surfaces meant to stay still (search bar, login instrument). */
  hover3d?: boolean
  radius?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`group relative overflow-hidden ${radius} ${hover3d ? 'transition-transform duration-[500ms] ease-cine [perspective:1400px] [transform-style:preserve-3d] hover:[transform:rotateX(3deg)_rotateY(-4deg)_translateY(-4px)]' : ''} ${className}`}
    >
      {/* glass plane — backdrop-brightness dims whatever sits behind the
          blur (a bright sun-ray zone in the photo, say) by a consistent
          amount regardless of where on the image this panel lands, so
          content legibility never depends on the panel's position. The
          white-highlight gradient alone doesn't do this — it only adds
          haze, which makes an already-bright area harder to read, not
          easier. */}
      <div
        className={`pointer-events-none absolute inset-0 z-0 ${radius} border border-white/20 bg-gradient-to-br from-white/[0.13] via-black/[0.18] to-black/[0.32] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_26px_56px_rgba(0,0,0,0.46)] backdrop-blur-2xl backdrop-brightness-75 backdrop-saturate-150 transition-shadow duration-cine ease-cine`}
        style={
          hover3d
            ? ({ '--glow': TONE_RING[tone] } as React.CSSProperties)
            : undefined
        }
      />
      {hover3d && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-0 ${radius} opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_34px_68px_rgba(0,0,0,0.54)] transition-opacity duration-cine ease-cine group-hover:opacity-100`}
          style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,.24), 0 34px 68px rgba(0,0,0,.54), 0 0 0 1px ${TONE_RING[tone]}` }}
        />
      )}
      {/* corner sheen — a soft highlight as if light is catching the surface */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[20%] -top-[30%] z-0 h-[75%] w-[70%] rounded-full blur-[2px]"
        style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,.22), transparent 72%)' }}
      />
      {/* reflection streak */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[14%] top-[-10%] z-0 h-[120%] w-px rotate-[14deg]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.6), transparent)' }}
      />
      <div className="relative z-[2]">{children}</div>
    </div>
  )
}
