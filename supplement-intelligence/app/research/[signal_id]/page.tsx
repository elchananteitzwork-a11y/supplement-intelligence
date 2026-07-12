import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { MarketBriefing } from '@/components/research/MarketBriefing'
import { FounderProfileBanner } from '@/components/research/FounderProfileBanner'
import Link from 'next/link'
import type { FounderProfile } from '@/lib/stage25/fit-layer'
import { PrimaryLinkButton } from '@/components/ui'

interface Props {
  params: Promise<{ signal_id: string }>
}

export default async function SignalBriefingPage({ params }: Props) {
  const { signal_id } = await params

  // Auth check
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !authData?.user) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-surface">
        <p className="text-outline text-sm">Please sign in to view this report.</p>
      </main>
    )
  }
  const user = authData.user

  // Fetch the signal row (service role so RLS doesn't interfere with server render)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [{ data: signal, error }, { data: existingTheses }, { data: founderProfile }] = await Promise.all([
    supabase
      .from('market_signals')
      .select('*')
      .eq('id', signal_id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('investment_theses')
      .select('id')
      .eq('market_signal_id', signal_id)
      .eq('user_id', user.id)
      .limit(1),
    supabase
      .from('founder_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (error || !signal) {
    notFound()
  }

  if (!signal.signal_data || !signal.quality_detail) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-surface">
        <p className="text-outline text-sm">Signal data is incomplete. Try re-running Stage 1.</p>
      </main>
    )
  }

  const hasTheses   = (existingTheses?.length ?? 0) > 0
  const profile     = (founderProfile ?? null) as FounderProfile | null

  return (
    <main className="min-h-screen bg-surface font-sans text-ink max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-center gap-3 text-xs font-mono uppercase text-outline">
        <Link href="/research" className="hover:text-black transition-colors">
          ← Research
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-ink-variant">{signal_id.slice(0, 8)}…</span>
      </div>

      <MarketBriefing signal={signal} />

      {/* Founder profile status — shown below market briefing */}
      <div className="mt-6">
        <FounderProfileBanner
          profile={profile}
          returnTo={`/research/${signal_id}`}
          compact={!!profile}
        />
      </div>

      {!signal.pipeline_blocked && (
        <div className="mt-12 border-2 border-black bg-white px-5 py-4">
          <p className="text-sm font-bold text-black mb-1">
            Stage 2 — Opportunity Map
          </p>
          <p className="text-xs text-ink-variant mb-3">
            {hasTheses
              ? 'Theses already generated for this signal. View or regenerate.'
              : 'Data quality gate passed. Generate investment theses from this market data.'}
          </p>
          <PrimaryLinkButton href={`/research/${signal_id}/opportunity`}>
            {hasTheses ? 'View Opportunity Map →' : 'Generate Opportunity Map →'}
          </PrimaryLinkButton>
        </div>
      )}
    </main>
  )
}
