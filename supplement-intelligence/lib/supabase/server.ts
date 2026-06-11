import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (list: { name: string; value: string; options: Record<string, unknown> }[]) => {
          try { list.forEach(({ name, value, options }) => jar.set(name, value, options)) }
          catch { /* server component – middleware handles refresh */ }
        },
      },
    }
  )
}
