import { NextResponse }         from 'next/server'
import { cookies }              from 'next/headers'
import { createServerClient }   from '@supabase/ssr'
import { fetchManufacturingEstimate } from '@/lib/manufacturing-engine'
import { checkRateLimit, MANUFACTURING_LIMIT } from '@/lib/rate-limit'

export const maxDuration = 30

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// POST /api/manufacturing
// Body: { product, category, complexity? }
// Returns: ManufacturingEstimate | { error }
export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)
  if (!(await checkRateLimit(user.id, MANUFACTURING_LIMIT))) return err('Too many requests — please wait a moment', 429)

  let body: { product?: string; category?: string; complexity?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { product, category, complexity } = body

  if (!product?.trim())  return err('product is required')
  if (!category?.trim()) return err('category is required')
  if (product.trim().length  > 200) return err('product too long — max 200 characters')
  if (category.trim().length > 100) return err('category too long — max 100 characters')

  const estimate = await fetchManufacturingEstimate({
    product:    product.trim(),
    category:   category.trim(),
    complexity: complexity?.trim(),
  }, 28_000)

  if (!estimate) {
    return err('Manufacturing estimate unavailable — please try again.', 503)
  }

  return NextResponse.json(estimate)
}
