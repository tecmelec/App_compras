'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { idsEfectivos } from '@/lib/pedidos-utils';
import { esCantidadValida, esMultiploDe } from '@/lib/cantidad';

// Lo que el aprobador puede hacer en la solicitud antes de aprobarla: comentarios al
// comprador y añadir artículos (los documentos van por documentos-solicitud.ts).
// Solo el aprobador de la solicitud (o su sustituto) o el admin, y solo mientras está
// pendiente de aprobación.
export async function aprobadorDeSolicitud(pedidoId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo, nombre_completo').eq('id', user.id).single();
  if (!perfil?.activo) return null;
  const admin = createAdminClient();
  const { data: pedido } = await admin
    .from('pedidos')
    .select('id, responsable_id, requiere_aprobacion, aprobado, estado_general')
    .eq('id', pedidoId)
    .maybeSingle();
  if (!pedido || !pedido.requiere_aprobacion || pedido.aprobado !== null || pedido.estado_general === 'Anulado') return null;
  if (perfil.rol !== 'admin') {
    if (!['responsable', 'integral'].includes(perfil.rol)) return null;
    const ids = await idsEfectivos(admin, user.id);
    if (!pedido.responsable_id || !ids.includes(pedido.responsable_id)) return null;
  }
  return { user, perfil, pedido };
}

export async function guardarComentarioAprobador(pedidoId: string, texto: string) {
  const q = await aprobadorDeSolicitud(pedidoId);
  if (!q) return { error: 'Solo el aprobador puede comentar mientras la solicitud está pendiente.' };
  const limpio = texto.trim().slice(0, 2000);
  const { error } = await createAdminClient()
    .from('pedidos')
    .update({ comentarios_aprobador: limpio || null, comentarios_aprobador_por: limpio ? q.perfil.nombre_completo : null })
    .eq('id', pedidoId);
  if (error) {
    return {
      error: /comentarios_aprobador/.test(error.message)
        ? 'Falta aplicar la migración 20261028120000 en la base de datos.'
        : 'No se pudo guardar el comentario: ' + error.message,
    };
  }
  revalidatePath(`/responsable/${pedidoId}`);
  return { success: true };
}

export async function buscarArticulosParaAnadir(texto: string) {
  const supabase = createClient();
  const palabras = texto
    .replace(/[%,()]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 2)
    .slice(0, 5);
  if (palabras.length === 0) return { articulos: [] };
  let q = supabase
    .from('productos')
    .select('id, nombre, bc_item_no, unidad_medida, multiplo_compra, precio, imagen_url')
    .eq('visible', true)
    .order('nombre')
    .limit(20);
  for (const p of palabras) q = q.or(`nombre.ilike.%${p}%,bc_item_no.ilike.%${p}%,categoria.ilike.%${p}%`);
  const { data, error } = await q;
  if (error) return { error: error.message, articulos: [] };
  return { articulos: (data || []) as any[] };
}

export async function anadirArticuloAprobador(pedidoId: string, productoId: string, cantidad: number) {
  const q = await aprobadorDeSolicitud(pedidoId);
  if (!q) return { error: 'Solo el aprobador puede añadir artículos mientras la solicitud está pendiente.' };
  const admin = createAdminClient();
  const { data: producto } = await admin
    .from('productos')
    .select('id, nombre, multiplo_compra, proveedor_predeterminado_id, visible')
    .eq('id', productoId)
    .maybeSingle();
  if (!producto || !producto.visible) return { error: 'Artículo no encontrado.' };
  const n = Number(cantidad);
  const m = producto.multiplo_compra || 1;
  if (!esCantidadValida(n)) return { error: 'Cantidad no válida (máx. 3 decimales).' };
  if (!esMultiploDe(n, m)) return { error: `La cantidad de "${producto.nombre}" debe ser múltiplo de ${m}.` };

  const fila: Record<string, any> = {
    pedido_id: pedidoId,
    producto_id: producto.id,
    cantidad: n,
    proveedor_id: producto.proveedor_predeterminado_id || null,
    anadida_por_aprobador: true,
  };
  let { error } = await admin.from('pedido_items').insert(fila);
  if (error && /anadida_por_aprobador/.test(error.message || '')) {
    delete fila.anadida_por_aprobador;
    ({ error } = await admin.from('pedido_items').insert(fila));
  }
  if (error) return { error: 'No se pudo añadir el artículo: ' + error.message };

  // Total estimado
  const { data: items } = await admin
    .from('pedido_items')
    .select('cantidad, precio_unitario, rechazada_por_aprobador, productos(precio)')
    .eq('pedido_id', pedidoId);
  const total = (items || [])
    .filter((it: any) => !it.rechazada_por_aprobador)
    .reduce((s: number, it: any) => s + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad, 0);
  await admin.from('pedidos').update({ total_estimado: Number(total.toFixed(2)) }).eq('id', pedidoId);

  revalidatePath(`/responsable/${pedidoId}`);
  return { success: true };
}
