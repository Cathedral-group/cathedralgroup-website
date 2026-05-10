/**
 * GET /api/admin/geocode?q=...
 *
 * Proxy a Nominatim (OpenStreetMap) para autocompletado de direcciones.
 * Devuelve hasta 5 sugerencias con lat/lng + nombre completo.
 *
 * Por qué proxy server-side:
 *   - Nominatim requiere User-Agent identificable (si lo llamas desde browser
 *     el navegador usa el suyo, pero algunas redes lo bloquean / CORS issues).
 *   - Centraliza rate-limit (Nominatim pide 1 req/s; aquí podemos cachear).
 *   - Permite añadir contexto España/Madrid automáticamente.
 *
 * Auth: admin allow-list + AAL2 (misma que el resto de /api/admin/*).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export interface GeocodeResult {
  lat: number
  lng: number
  display: string
  /** Tipo OSM: city, road, house, etc. (informativo) */
  type?: string
  /** Importancia 0-1 (informativo, para ordenar) */
  importance?: number
}

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 3) {
    return NextResponse.json({ results: [] satisfies GeocodeResult[] })
  }

  // Si el usuario no incluye 'madrid' ni 'españa' ni un código postal de 5 dígitos,
  // añadimos ", Madrid, España" para sesgar la búsqueda a la zona de Cathedral.
  const ql = q.toLowerCase()
  const hasContext =
    ql.includes('madrid') ||
    ql.includes('españa') ||
    ql.includes('espana') ||
    /\b\d{5}\b/.test(ql)
  const finalQuery = hasContext ? q : `${q}, Madrid, España`

  // Nominatim: free, no API key, ~1 req/s rate limit
  // https://nominatim.org/release-docs/develop/api/Search/
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', finalQuery)
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'es')
  url.searchParams.set('addressdetails', '0')
  url.searchParams.set('accept-language', 'es')

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim ToS exige User-Agent identificable con email de contacto
        'User-Agent': 'CathedralGroupAdmin/1.0 (admin@cathedralgroup.es)',
        Accept: 'application/json',
      },
      // Cachear 60s la misma búsqueda
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Geocoder devolvió ${res.status}`, results: [] },
        { status: 502 },
      )
    }

    const raw = (await res.json()) as Array<{
      lat: string
      lon: string
      display_name: string
      type?: string
      importance?: number
    }>

    const results: GeocodeResult[] = raw.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      display: r.display_name,
      type: r.type,
      importance: r.importance,
    }))

    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Error desconocido',
        results: [] as GeocodeResult[],
      },
      { status: 502 },
    )
  }
}

export const dynamic = 'force-dynamic'
