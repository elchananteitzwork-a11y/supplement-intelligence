import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

// ── Rotor geometry — ported near-verbatim from the approved design
// prototype (hero3d-prototype/src/three/buildRotorGeometry.ts), per the
// R&D document's explicit instruction to port the rotor's geometry/
// rotation model as interaction/visual language. Unlike the rest of that
// prototype, this file carries zero illustrative DATA — it is pure brand-
// mark geometry, so there is nothing here that needed re-deriving from
// real fields. These are the exact six blade paths from the locked
// Rotor logo brand mark (six gold blades + dark core — see the "Brand
// identity LOCKED" project record), copied verbatim from the prototype's
// own copy of candidate_detail_mockup.html (viewBox -20 -20 240 240, fill
// #D4A94A, dark hub #16171C) — do not invent new geometry here, only
// extrude the already-approved 2D mark into 3D.
const BLADE_PATHS = [
  'M 132.45 86.89 L 133.47 110.23 L 172.75 142.00 L 182.97 86.86 Z',
  'M 127.58 121.55 L 107.87 134.10 L 100.00 184.00 L 152.86 165.28 Z',
  'M 95.13 134.66 L 74.40 123.87 L 27.25 142.00 L 69.90 178.42 Z',
  'M 67.55 113.11 L 66.53 89.77 L 27.25 58.00 L 17.03 113.14 Z',
  'M 72.42 78.45 L 92.13 65.90 L 100.00 16.00 L 47.14 34.72 Z',
  'M 104.87 65.34 L 125.60 76.13 L 172.75 58.00 L 130.10 21.58 Z',
]

const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 240 240">
  ${BLADE_PATHS.map((d, i) => `<path id="blade-${i}" d="${d}" fill="#D4A94A"/>`).join('\n  ')}
  <circle id="hub" cx="100" cy="100" r="30" fill="#16171C"/>
</svg>`

const SVG_CENTER = 100
const WORLD_SCALE = 1 / 90 // maps ~85-unit blade radius to ~0.95 world units

export interface RotorGeometry {
  blades: THREE.ExtrudeGeometry[]
  hub: THREE.ExtrudeGeometry
}

let cached: RotorGeometry | null = null

/** Extrudes the locked brand-mark SVG into 3D geometry. Memoized module-wide
 * since the source paths never change between renders/instances. */
export function buildRotorGeometry(): RotorGeometry {
  if (cached) return cached

  const loader = new SVGLoader()
  const data = loader.parse(SVG_MARKUP)

  const blades: THREE.ExtrudeGeometry[] = []
  let hub: THREE.ExtrudeGeometry | null = null

  for (const path of data.paths) {
    const node = path.userData?.node as SVGElement | undefined
    const isHub = node?.id === 'hub'
    // isCCW=true: SVGLoader's own documented recommendation for solid
    // (non-hole) fills like this brand mark's blade/hub paths — @types/
    // three requires this argument explicitly even though the prototype's
    // JS call site left it implicit (defaulted false at runtime there).
    const shapes = path.toShapes(true)
    const depth = isHub ? 7.5 : 6

    for (const shape of shapes) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: isHub ? 0.55 : 1.05,
        bevelSize: isHub ? 0.45 : 0.85,
        bevelSegments: 4,
        curveSegments: 32,
      })

      // SVG space is y-down and centered on (100,100); recenter, flip Y,
      // scale to world units, and center the extrusion on z=0.
      geometry.translate(-SVG_CENTER, -SVG_CENTER, -depth / 2)
      geometry.scale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE)
      geometry.computeVertexNormals()

      if (isHub) hub = geometry
      else blades.push(geometry)
    }
  }

  if (!hub) {
    throw new Error('Evidence Core hub geometry failed to parse from brand-mark SVG')
  }

  cached = { blades, hub }
  return cached
}
