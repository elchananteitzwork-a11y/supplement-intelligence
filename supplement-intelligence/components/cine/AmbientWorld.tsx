import Image from 'next/image'
import { AmbientParticles } from './AmbientParticles'
import { AmbientVideo } from './AmbientVideo'

// ═══════════════════════════════════════════════════════════════════════
// AmbientWorld — the persistent cinematic environment behind the "One
// World" redesign (Landing, Login, Dashboard, Discover, Candidate Detail).
//
// Per owner clarification: this is NOT one hardcoded image reused on every
// screen — each major screen gets its own generated composition/atmosphere
// (its own Phase's own approved Artifact), while sharing the same visual
// grammar here: identical color-grade math, particle system, Ken Burns
// drift, and glass/scrim treatment. That shared grammar — not a literal
// shared photograph — is what makes the screens read as one world. The
// Candidate Detail stage (Phase 3) is "the same world at night": same
// logic, a different generated image and a darker intensity.
//
// `image` is required and always caller-supplied — a still fallback/poster
// even when `video` is also provided (used under prefers-reduced-motion,
// and while the video loads). Landing/Login (2026-07-22 owner decision)
// pass `video="/ambient/video/landing-hero-bamboo.mp4"` — a real generated
// clip the owner chose over the static Cathedral of Palms photo for these
// two screens specifically. Other screens keep passing only `image` — the
// video path is opt-in per screen, never a default.
//
// `intensity="full"` (the environment IS the page) vs. `intensity="calm"`
// (content-dense screens, world recedes further so real data stays
// legible) only changes overlay opacity/darkness, never the image/video.
// ═══════════════════════════════════════════════════════════════════════

export type AmbientIntensity = 'full' | 'calm'

const GRADE_BY_INTENSITY: Record<AmbientIntensity, string> = {
  full: 'saturate(0.94) brightness(0.9)',
  calm: 'saturate(0.82) brightness(0.72)',
}

const SCRIM_OPACITY_BY_INTENSITY: Record<AmbientIntensity, number> = {
  full: 0.68,
  calm: 0.86,
}

export function AmbientWorld({
  image,
  imagePosition = '50% 40%',
  video,
  intensity = 'full',
  children,
  className = '',
}: {
  /** Public/ path to this screen's own approved composition — never shared/hardcoded. Also the reduced-motion / pre-load fallback when `video` is set. */
  image: string
  /** CSS object-position for the source photo's focal point on this screen. */
  imagePosition?: string
  /** Optional: public/ path to an approved video loop. Opt-in per screen — omit to stay image-only. */
  video?: string
  intensity?: AmbientIntensity
  children?: React.ReactNode
  className?: string
}) {
  const scrim = SCRIM_OPACITY_BY_INTENSITY[intensity]

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className={`${video ? 'fixed' : 'absolute'} inset-0 z-0 ${video ? '' : 'motion-safe:animate-cine-kenburns'}`}
        style={{ filter: GRADE_BY_INTENSITY[intensity] }}
      >
        {video ? (
          <AmbientVideo src={video} poster={image} objectPosition={imagePosition} />
        ) : (
          <Image
            src={image}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: imagePosition }}
          />
        )}
      </div>

      {/* color-grade + legibility scrim — pulls the photograph toward the
          locked warm cream/gold palette and keeps foreground content readable.
          Pinned to the viewport (not the document) whenever the video is
          active, for the same reason the video layer above is — see that
          layer's comment and AmbientVideo.tsx. */}
      <div
        aria-hidden
        className={`pointer-events-none ${video ? 'fixed' : 'absolute'} inset-0 z-[1]`}
        style={{
          background: `
            linear-gradient(100deg, rgba(22,20,13,${scrim}) 0%, rgba(22,20,13,${scrim * 0.5}) 32%, rgba(22,20,13,${scrim * 0.08}) 58%, transparent 78%),
            linear-gradient(0deg, rgba(12,11,9,${scrim * 0.75}) 0%, rgba(12,11,9,0) 30%)
          `,
        }}
      />

      <AmbientParticles count={intensity === 'full' ? 22 : 12} />

      <div className="relative z-10">{children}</div>
    </div>
  )
}
