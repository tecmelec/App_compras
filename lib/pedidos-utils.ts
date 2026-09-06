import type { SupabaseClient } from '@supabase/supabase-js';

export function numerosTecmelecTexto(items: { numero_tecmelec: string | null }[] | undefined | null): string {
  if (!items || items.length === 0) return '—';
  const unicos = Array.from(new Set(items.map((i) => i.numero_tecmelec).filter(Boolean))) as string[];
  return unicos.length > 0 ? unicos.join(', ') : '—';
}

// Devuelve [miPropioId, ...idsDeQuienesSustituyoActivamente]
export async function idsEfectivos(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('sustituto_id', userId)
    .eq('sustituto_activo', true);

  return [userId, ...(data || []).map((p) => p.id)];
}
