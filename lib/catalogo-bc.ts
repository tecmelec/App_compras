// Catálogo completo de artículos de BC: se lee de la réplica que mantiene la app
// ALTA-PRODUCTOS-BC (tabla "products" de su propio proyecto de Supabase, sincronizada
// con BC). Solo desde el servidor, con su service role.
//
// Variables de entorno (Vercel, Preview y Production):
//   ALTA_SUPABASE_URL, ALTA_SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

function clienteReplica(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.ALTA_SUPABASE_URL;
  const key = process.env.ALTA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan las variables ALTA_SUPABASE_URL y ALTA_SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

export type ArticuloCatalogoBC = {
  no: string;
  descripcion: string;
  categoria: string | null;
  fabricante: string | null;
  unidad: string | null;
  precio: number | null;
};

// Misma búsqueda que la pestaña "Productos" de ALTA-PRODUCTOS-BC: el texto se trocea
// en palabras y CADA una debe aparecer (en cualquier orden) en el código, la
// descripción, la categoría o el fabricante. Ordenado por Nº descendente.
export async function buscarCatalogoBC(busqueda: string, desde = 0, cuantos = 100): Promise<ArticuloCatalogoBC[]> {
  const palabras = Array.from(
    new Set(
      busqueda
        .split(/[\s*]+/)
        .map((t) => t.replace(/[%_"\\,()]/g, '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 8);

  let consulta = clienteReplica()
    .from('products')
    .select('no, description, item_category_code, manufacturer_code, base_unit_of_measure, unit_price')
    .order('no', { ascending: false })
    .range(desde, desde + cuantos - 1);
  for (const p of palabras) {
    const patron = `"*${p}*"`;
    consulta = consulta.or(
      [`description.ilike.${patron}`, `no.ilike.${patron}`, `item_category_code.ilike.${patron}`, `manufacturer_code.ilike.${patron}`].join(',')
    );
  }
  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudo leer el catálogo de BC: ${error.message}`);
  return (data || []).map((r: any) => ({
    no: r.no,
    descripcion: r.description || '',
    categoria: r.item_category_code || null,
    fabricante: r.manufacturer_code || null,
    unidad: r.base_unit_of_measure || null,
    precio: r.unit_price ?? null,
  }));
}
