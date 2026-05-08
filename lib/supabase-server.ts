import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Client with anon key + cookies — for auth checks
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component - can't set cookies
          }
        },
      },
    }
  )
}

// Admin client with service_role key — bypasses RLS for data access
// ONLY use after verifying auth with createServerSupabaseClient()
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Fetch ALL rows from a Supabase table, bypassing PostgREST's max_rows limit
 * (default 1000) by paginating automatically in batches of PAGE_SIZE.
 *
 * Usage:
 *   const invoices = await fetchAllRows((q) =>
 *     q.from('invoices').select('*').is('deleted_at', null).order('issue_date', { ascending: false })
 *   )
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (client: ReturnType<typeof createAdminSupabaseClient>) => any,
  pageSize = 900
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // Fix 8/05/2026: cliente fuera del loop. Antes se creaba uno por iteración
  // (memoria + conexiones desperdiciadas innecesariamente).
  const supabase = createAdminSupabaseClient()

  while (true) {
    const { data, error } = await buildQuery(supabase).range(from, from + pageSize - 1)

    if (error) {
      console.error('[fetchAllRows] error:', error)
      break
    }
    if (!data || data.length === 0) break

    all.push(...(data as T[]))
    if (data.length < pageSize) break // last page — no more rows
    from += pageSize
  }

  return all
}
