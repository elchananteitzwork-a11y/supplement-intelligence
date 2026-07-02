import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { MarketBriefing } from '@/components/research/MarketBriefing'
import Link from 'next/link'

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
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Please sign in to view this report.</p>
      </main>
    )
  }

  // Fetch the signal row (service role so RLS doesn't interfere with server render)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [{ data: signal, error }, { data: existingTheses }] = await Promise.all([
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
  ])

  if (error || !signal) {
    notFound()
  }

  const hasTheses = (existingTheses?.length ?? 0) > 0

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <Link
          href="/research"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Research
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-xs text-gray-500 font-mono">{signal_id.slice(0, 8)}…</span>
      </div>

      <MarketBriefing signal={signal} />

      {!signal.pipeline_blocked && (
        <div className="mt-12 rounded-lg border border-indigo-800 bg-indigo-950/20 px-5 py-4">
          <p className="text-sm font-medium text-indigo-300 mb-1">
            Stage 2 — Opportunity Map
          </p>
          <p className="text-xs text-indigo-400/70 mb-3">
            {hasTheses
              ? 'Theses already generated for this signal. View or regenerate.'
              : 'Data quality gate passed. Generate investment theses from this market data.'}
          </p>
          <Link
            href={`/research/${signal_id}/opportunity`}
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            {hasTheses ? 'View Opportunity Map →' : 'Generate Opportunity Map →'}
          </Link>
        </div>
      )}
    </main>
  )
}
