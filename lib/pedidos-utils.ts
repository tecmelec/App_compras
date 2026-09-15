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

// Igual que fechasEstimadasTexto, pero como rango "min – max" en vez de listar todas
export function rangoFechasEstimadas(
  items: { fecha_estimada_entrega: string | null }[] | undefined | null
): string {
  if (!items || items.length === 0) return 'Por definir';
  const unicas = Array.from(new Set(items.map((i) => i.fecha_estimada_entrega).filter(Boolean))) as string[];
  if (unicas.length === 0) return 'Por definir';
  unicas.sort();
  const formatear = (f: string) => new Date(f + 'T00:00:00').toLocaleDateString('es-ES');
  if (unicas.length === 1) return formatear(unicas[0]);
  return `${formatear(unicas[0])} – ${formatear(unicas[unicas.length - 1])}`;
}

export type ContactoComprador = { nombre_completo: string; email: string; telefono: string | null };

// Comprador asignado del usuario logueado (o su sustituto, si tiene uno activo).
// Se usa para el botón "Contactar con Compras": email y teléfono reales en vez
// del buzón genérico compras@tecmelec.es.
export async function obtenerContactoComprador(
  supabase: SupabaseClient,
  userId: string
): Promise<ContactoComprador | null> {
  const { data: perfil } = await supabase.from('profiles').select('comprador_id').eq('id', userId).single();

  if (!perfil?.comprador_id) return null;

  const { data: compradorAsignado } = await supabase
    .from('profiles')
    .select('nombre_completo, email, telefono, sustituto_id, sustituto_activo')
    .eq('id', perfil.comprador_id)
    .single();

  if (!compradorAsignado) return null;

  if (compradorAsignado.sustituto_activo && compradorAsignado.sustituto_id) {
    const { data: sustituto } = await supabase
      .from('profiles')
      .select('nombre_completo, email, telefono')
      .eq('id', compradorAsignado.sustituto_id)
      .single();
    return sustituto || compradorAsignado;
  }

  return compradorAsignado;
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

// Recalcula el "Estado" general del pedido (estado_general) a partir del estado
// detallado de cada línea, y lo guarda. Regla: en cuanto una línea llega a
// "Pedido lanzado" (o más adelante en la barra de progreso, p.ej. Recibido),
// cuenta como "lanzada"; si todas las líneas están lanzadas -> "Tramitado";
// si solo algunas -> "Tramitado parcial". No toca pedidos ya "Anulado".
export async function recalcularEstadoGeneral(supabase: SupabaseClient, pedidoId: string): Promise<void> {
  const { data: pedido } = await supabase.from('pedidos').select('estado_general').eq('id', pedidoId).single();
  if (!pedido || pedido.estado_general === 'Anulado') return;

  const { data: estados } = await supabase.from('estados_pedido').select('id, orden, nombre');
  const estadoLanzado = (estados || []).find((e: any) => e.nombre === 'Pedido lanzado');
  if (!estadoLanzado) return; // el admin renombró/quitó ese estado en /admin/estados; no se puede calcular

  const { data: items } = await supabase.from('pedido_items').select('estado_id').eq('pedido_id', pedidoId);
  if (!items || items.length === 0) return;

  const ordenPorId = new Map((estados || []).map((e: any) => [e.id, e.orden]));
  const lanzados = items.filter((i: any) => (ordenPorId.get(i.estado_id) ?? -1) >= estadoLanzado.orden).length;

  let nuevoEstado: string;
  if (lanzados === 0) nuevoEstado = 'Pendiente de tramitar';
  else if (lanzados < items.length) nuevoEstado = 'Tramitado parcial';
  else nuevoEstado = 'Tramitado';

  if (nuevoEstado !== pedido.estado_general) {
    await supabase.from('pedidos').update({ estado_general: nuevoEstado }).eq('id', pedidoId);
  }
}
