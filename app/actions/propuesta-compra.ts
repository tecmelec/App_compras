'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcularPropuestaCompra, leerParametrosPropuesta, type LineaPropuesta } from '@/lib/propuesta-compra';
import { notasIAPropuesta } from '@/lib/propuesta-compra-ia';

// Comprador IA — Fase 1, paso 1: "Proponer compra" (reglas, sin IA). Solo comprador/admin.

async function compradorOAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !['comprador', 'admin'].includes(perfil.rol)) return null;
  return user;
}

export async function proponerCompra(pedidoId: string) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'No autorizado.' };
  try {
    const params = await leerParametrosPropuesta();
    const { lineas, avisos } = await calcularPropuestaCompra(pedidoId, params);
    if (lineas.length === 0) return { error: 'No hay líneas sin pedido de compra en esta solicitud.' };
    const { data: guardada, error } = await createAdminClient()
      .from('propuestas_compra')
      .insert({ pedido_id: pedidoId, creado_por: user.id, parametros: params, lineas })
      .select('id')
      .single();
    if (error || !guardada) {
      return {
        error: /propuestas_compra/.test(error?.message || '')
          ? 'Falta aplicar la migración de la propuesta de compra (20261022140000) en la base de datos.'
          : 'No se pudo guardar la propuesta: ' + (error?.message || ''),
      };
    }
    return { propuestaId: guardada.id as string, lineas, avisos: avisos || [], parametros: params, iaActiva: params.iaActiva };
  } catch (e: any) {
    return { error: 'No se pudo calcular la propuesta: ' + (e?.message || e) };
  }
}

// Aplica las líneas elegidas (con lo que haya ajustado el comprador) y registra qué
// se aceptó tal cual, qué se modificó y qué se descartó.
export async function aplicarPropuestaCompra(
  propuestaId: string,
  elegidas: { itemId: string; proveedorId: string | null; precio: number }[]
) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { data: propuesta } = await admin.from('propuestas_compra').select('id, pedido_id, lineas').eq('id', propuestaId).single();
  if (!propuesta) return { error: 'No se encontró la propuesta.' };
  const lineas = (propuesta.lineas || []) as LineaPropuesta[];

  const { data: items } = await admin
    .from('pedido_items')
    .select('id, numero_tecmelec, rechazada_por_aprobador')
    .eq('pedido_id', propuesta.pedido_id);
  const libres = new Set((items || []).filter((i) => !i.numero_tecmelec && !i.rechazada_por_aprobador).map((i) => i.id));

  let aplicadas = 0;
  for (const e of elegidas) {
    if (!libres.has(e.itemId)) continue;
    if (!(Number(e.precio) >= 0)) return { error: 'Precio no válido en una de las líneas.' };
    const l = lineas.find((x) => x.itemId === e.itemId);
    const deEstePresupuesto =
      l?.propuesta.origen === 'presupuesto' &&
      l.propuesta.presupuestoId &&
      Number(l.propuesta.precio) === Number(e.precio)
        ? l.propuesta.presupuestoId
        : null;
    const { error } = await admin
      .from('pedido_items')
      .update({
        precio_unitario: Number(e.precio),
        ...(e.proveedorId ? { proveedor_id: e.proveedorId } : {}),
        propuesta_compra_id: propuesta.id,
        precio_presupuesto_id: deEstePresupuesto,
      })
      .eq('id', e.itemId);
    if (error) return { error: 'No se pudo aplicar una de las líneas: ' + error.message };
    aplicadas++;
  }

  // Registro para medir el acierto
  const resultado = lineas.map((l) => {
    const e = elegidas.find((x) => x.itemId === l.itemId);
    const estado = !e
      ? 'descartada'
      : e.proveedorId === l.propuesta.proveedorId && Number(e.precio) === Number(l.propuesta.precio)
        ? 'aceptada'
        : 'modificada';
    return {
      itemId: l.itemId,
      origen: l.propuesta.origen,
      confianza: l.propuesta.confianza,
      propuesto: { proveedorId: l.propuesta.proveedorId, precio: l.propuesta.precio },
      aplicado: e ? { proveedorId: e.proveedorId, precio: Number(e.precio) } : null,
      estado,
    };
  });
  await admin.from('propuestas_compra').update({ resultado, aplicado_en: new Date().toISOString() }).eq('id', propuesta.id);

  // Total estimado
  const { data: itemsFinal } = await admin
    .from('pedido_items')
    .select('cantidad, precio_unitario, rechazada_por_aprobador, productos(precio)')
    .eq('pedido_id', propuesta.pedido_id);
  const total = (itemsFinal || [])
    .filter((it: any) => !it.rechazada_por_aprobador)
    .reduce((s: number, it: any) => s + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad, 0);
  await admin.from('pedidos').update({ total_estimado: Number(total.toFixed(2)) }).eq('id', propuesta.pedido_id);

  revalidatePath(`/comprador/${propuesta.pedido_id}`);
  return { success: true, aplicadas };
}

// Paso 2: la IA revisa la propuesta ya calculada (una llamada por propuesta) y deja
// notas. Se puede apagar en Administración → Configuración. Si falla, el panel sigue
// funcionando con lo de las reglas.
export async function notasIAPropuestaCompra(propuestaId: string) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'No autorizado.' };
  const params = await leerParametrosPropuesta();
  if (!params.iaActiva) return { desactivada: true as const };
  const admin = createAdminClient();
  const { data: propuesta } = await admin.from('propuestas_compra').select('id, pedido_id, lineas').eq('id', propuestaId).single();
  if (!propuesta) return { error: 'No se encontró la propuesta.' };
  const { data: pedido } = await admin.from('pedidos').select('*').eq('id', propuesta.pedido_id).maybeSingle();
  try {
    const ia = await notasIAPropuesta((propuesta.lineas || []) as LineaPropuesta[], (pedido as any)?.comentarios_comprador || null);
    await admin.from('propuestas_compra').update({ ia }).eq('id', propuesta.id);
    return { ia };
  } catch (e: any) {
    return { error: 'Notas de la IA no disponibles: ' + (e?.message || e) };
  }
}
