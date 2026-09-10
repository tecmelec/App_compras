import type { SupabaseClient } from '@supabase/supabase-js';

export function numerosTecmelecTexto(items: { numero_tecmelec: string | null }[] | undefined | null): string {
  if (!items || items.length === 0) return '—';
  const unicos = Array.from(new Set(items.map((i) => i.numero_tecmelec).filter(Boolean))) as string[];
  return unicos.length > 0 ? unicos.join(', ') : '—';
}

export function fechasEstimadasTexto(
  items: { fecha_estimada_entrega: string | null }[] | undefined | null
): string {
  if (!items || items.length === 0) return '—';
  const unicas = Array.from(new Set(items.map((i) => i.fecha_estimada_entrega).filter(Boolean))) as string[];
  if (unicas.length === 0) return 'Por definir';
  return unicas
    .sort()
    .map((f) => new Date(f + 'T00:00:00').toLocaleDateString('es-ES'))
    .join(', ');
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
