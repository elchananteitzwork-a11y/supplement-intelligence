'use client'

import { useEffect, useRef, useState } from 'react'

// AmbientVideo — the video-backed variant of AmbientWorld's background
// layer (2026-07-22, owner decision to use a real generated clip for
// Landing/Login instead of the static Cathedral of Palms photo). Client-
// only: prefers-reduced-motion must be checked before ever attempting
// autoplay, and the check itself requires the browser. Under reduced
// motion, or before the browser has told us it's safe, this renders only
// the poster frame — never plays.
export function AmbientVideo({
  src,
  poster,
  objectPosition,
}: {
  src: string
  poster: string
  objectPosition: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [canPlay, setCanPlay] = useState(false)

  useEffect(() => {
    setCanPlay(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (canPlay) ref.current?.play().catch(() => {})
  }, [canPlay])

  return (
    <>
      {/* poster is always in the DOM as a plain <img>-equivalent background so
          there is no flash of empty space before the video can play, and so
          reduced-motion users get the exact same frame the video opens on. */}
      <div
        className="absolute inset-0 h-full w-full bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${poster})`, backgroundPosition: objectPosition }}
      />
      {canPlay && (
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-hidden
        />
      )}
    </>
  )
}
