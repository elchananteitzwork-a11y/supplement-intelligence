'use client'

import { useState } from 'react'
import type { MemoData } from '@/types/index'
import MemoDisplay from '@/components/memo/MemoDisplay'
import { CandidateCoreHero } from '@/components/pi/candidate-core'
import type { CoreViewModel } from '@/components/pi/candidate-core'

// RD-UIv2-M4 — the one new client-side state boundary this milestone
// needs. app/memo/[id]/page.tsx is (and must stay) an async Server
// Component — it does the real Supabase fetch (analysis + watch entries/
// alerts) — so it cannot itself hold the `sourcesOpen` React state the
// Sources toggle needs. <CandidateCoreHero> and <MemoDisplay> are both
// already separate 'use client' components (siblings in the page today),
// so the boolean has to live in a shared client ancestor of both, not in
// either one individually.
//
// This component IS that shared ancestor — the smallest correct one:
// it receives only real, already-fetched, plain-serializable data as
// props (the CoreViewModel, category name, build_explanation string, and
// the memo/generatedAt MemoDisplay already took), and owns nothing but
// the toggle boolean. Deliberately NOT implemented as "pass <MemoDisplay
// .../> down as a `children` prop into CandidateCoreHero and have
// CandidateCoreHero decide whether to render `children`" — that pattern
// still requires the server to construct/serialize the MemoDisplay
// element tree up front regardless of the boolean, which would undercut
// the real "collapsed means not rendered, not just visually hidden"
// requirement (R&D-UIv2-M4's own verification plan). Here, MemoDisplay is
// only ever instantiated at all when `sourcesOpen` is true.
export function MemoDetailBody({
  vm,
  categoryName,
  buildExplanation,
  memo,
  generatedAt,
}: {
  vm: CoreViewModel
  categoryName: string
  buildExplanation: string
  memo: MemoData
  generatedAt: string
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <>
      <div className="max-w-[720px] mx-auto mb-2">
        <CandidateCoreHero
          vm={vm}
          categoryName={categoryName}
          buildExplanation={buildExplanation}
          sourcesOpen={sourcesOpen}
          onToggleSources={() => setSourcesOpen(open => !open)}
        />
      </div>

      {sourcesOpen && <MemoDisplay memo={memo} generatedAt={generatedAt} />}
    </>
  )
}
