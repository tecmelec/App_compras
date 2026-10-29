'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sincronizarFechasConBC } from '@/app/actions/proveedor-fecha-entrega';

// Perfil "Seguidor IA": lo único que puede modificar es la "Fecha estimada de entrega" de
// las líneas de una solicitud. Queda registrada la confirmación (fecha y hora) para
// mostrar el check azul "Confirmada por el Seguidor IA". Se escribe con el cliente admin
// (el perfil solo tiene permisos de lectura en la base de datos) tras comprobar el rol.
export async function guardarFechasSeguidorIA(pedidoId: string, cambios: { itemId: string; fecha: string }[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || perfil.rol !== 'seguidor_ia') return { error: 'No autorizado.' };

  const validos = (cambios || []).filter((c) => c?.itemId && /^\d{4}-\d{2}-\d{2}$/.test(String(c.fecha || '')));
  if (validos.length === 0) return { error: 'No hay fechas válidas que guardar.' };
  for (const c of validos) {
    const f = new Date(c.fecha + 'T00:00:00');
    if (Number.isNaN(f.getTime()) || f.getFullYear() < 2020 || f.getFullYear() > 2100) return { error: `Fecha no válida: ${c.fecha}` };
  }

  const admin = createAdminClient();
  const { data: items } = await admin
    .from('pedido_items')
    .select('id, numero_tecmelec, fecha_estimada_entrega')
    .eq('pedido_id', pedidoId)
    .in(
      'id',
      validos.map((c) => c.itemId)
    );
  const porId = new Map((items || []).map((i: any) => [i.id, i]));
  const ahora = new Date().toISOString();
  const aSincronizar = new Map<string, { itemId: string; fecha: string }[]>();
  let guardadas = 0;

  for (const c of validos) {
    const actual: any = porId.get(c.itemId);
    if (!actual) return { error: 'Alguna línea no pertenece a esta solicitud.' };
    // Solo las fechas que cambian de verdad (si no cambia, no se marca como confirmada).
    if ((actual.fecha_estimada_entrega || '').slice(0, 10) === c.fecha) continue;
    const { error } = await admin
      .from('pedido_items')
      .update({
        fecha_estimada_entrega: c.fecha,
        fecha_estimada_entrega_seguidor_en: ahora,
        // La confirmación del proveedor deja de corresponder a la fecha que se ve.
        fecha_estimada_entrega_confirmada_en: null,
      })
      .eq('id', c.itemId);
    if (error) {
      return {
        error: /seguidor_en/.test(error.message || '')
          ? 'Falta aplicar la migración del perfil Seguidor IA (20261029120000) en la base de datos.'
          : 'No se pudo guardar la fecha: ' + error.message,
      };
    }
    guardadas++;
    if (actual.numero_tecmelec) {
      aSincronizar.set(actual.numero_tecmelec, [...(aSincronizar.get(actual.numero_tecmelec) || []), { itemId: c.itemId, fecha: c.fecha }]);
    }
  }

  // Reflejar la fecha también en el pedido de compra de BC (mejor esfuerzo, como al guardar
  // el comprador o el proveedor): si no, la siguiente sincronización la volvería a pisar.
  for (const [numero, lista] of Array.from(aSincronizar.entries())) {
    await sincronizarFechasConBC(admin, numero, lista);
  }

  revalidatePath(`/comprador/${pedidoId}`);
  revalidatePath('/lineas-compras');
  return { success: true, guardadas };
}

// Confirmar la fecha estimada tal como está, sin modificarla ("la fecha sigue siendo esta").
// Solo si la línea tiene fecha, la fecha enviada sigue siendo la actual (por si ha cambiado
// mientras tanto) y NO está ya confirmada por el proveedor. Se puede volver a confirmar una
// fecha ya confirmada por el Seguidor IA: se actualiza la fecha y hora.
export async function confirmarFechasSeguidorIA(pedidoId: string, items: { itemId: string; fecha: string }[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || perfil.rol !== 'seguidor_ia') return { error: 'No autorizado.' };
  const lista = (items || []).filter((c) => c?.itemId && /^\d{4}-\d{2}-\d{2}$/.test(String(c.fecha || '')));
  if (lista.length === 0) return { error: 'No hay fechas que confirmar.' };

  const admin = createAdminClient();
  const { data: actuales } = await admin
    .from('pedido_items')
    .select('id, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en')
    .eq('pedido_id', pedidoId)
    .in(
      'id',
      lista.map((c) => c.itemId)
    );
  const porId = new Map((actuales || []).map((a: any) => [a.id, a]));
  const ahora = new Date().toISOString();
  let confirmadas = 0;
  let delProveedor = 0;
  let sinFecha = 0;
  let desactualizadas = 0;

  for (const c of lista) {
    const a: any = porId.get(c.itemId);
    if (!a) return { error: 'Alguna línea no pertenece a esta solicitud.' };
    if (!a.fecha_estimada_entrega) {
      sinFecha++;
      continue;
    }
    if (String(a.fecha_estimada_entrega).slice(0, 10) !== c.fecha) {
      desactualizadas++; // la fecha ha cambiado desde que se vio
      continue;
    }
    if (a.fecha_estimada_entrega_confirmada_en) {
      delProveedor++; // ya la confirmó el proveedor: no hace falta
      continue;
    }
    const { error } = await admin.from('pedido_items').update({ fecha_estimada_entrega_seguidor_en: ahora }).eq('id', c.itemId);
    if (error) {
      return {
        error: /seguidor_en/.test(error.message || '')
          ? 'Falta aplicar la migración del perfil Seguidor IA (20261029120000) en la base de datos.'
          : 'No se pudo confirmar la fecha: ' + error.message,
      };
    }
    confirmadas++;
  }

  revalidatePath(`/comprador/${pedidoId}`);
  revalidatePath('/lineas-compras');
  return { success: true, confirmadas, delProveedor, sinFecha, desactualizadas };
}
