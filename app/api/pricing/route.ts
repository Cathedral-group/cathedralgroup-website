import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { buildConfigFromRows, DEFAULT_CONFIG } from '@/lib/pricing'

// Lectura pública de los parámetros de la calculadora (/presupuesto).
// Solo datos que el usuario ya ve en la web (precios, factores, zonas, extras);
// NO se exponen explanation/source/updated_by (internos del panel).
// service_role server-side (la clave nunca llega al navegador). Cache CDN ~5 min;
// las ediciones del panel se reflejan en ese plazo. Si la tabla aún no existe,
// devolvemos las constantes del código → la calculadora nunca se rompe.
export const revalidate = 300

export async function GET() {
  try {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('pricing_config')
      .select(
        'category,item_key,sort_order,val_min,val_mid,val_max,val_factor,pricing,scope,min_level,in_interiorismo,is_contact,is_custom'
      )
      .eq('active', true)
      .order('category')
      .order('sort_order')
    if (error) throw error
    return NextResponse.json(buildConfigFromRows(data))
  } catch {
    return NextResponse.json(DEFAULT_CONFIG, { headers: { 'Cache-Control': 'no-store' } })
  }
}
