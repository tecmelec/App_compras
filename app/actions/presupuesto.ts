'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LineaPresupuesto } from '@/lib/presupuesto';

// Aplica a las líneas de la solicitud los precios del presupuesto elegidos en la
// revisión (y el proveedor, si se indica). Solo en líneas sin pedido de compra y no
// rechazadas. Marca la línea con precio_presupuesto_id ("Precios desde presupuesto").
export async function aplicarPreciosPresupuesto(
  presupuestoId: string,
  asignaciones: { item_id: string; linea_idx: number }[],
  proveedorId: string | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  if (!perfil || !['comprador', 'admin'].includes(perfil.rol)) return { error: 'No autorizado.' };

  const admin = createAdminClient();
  const { data: presupuesto } = await admin
    .from('presupuestos')
    .select('id, pedido_id, lineas')
    .eq('id', presupuestoId)
    .single();
  if (!presupuesto) return { error: 'No se encontró el presupuesto.' };

  const lineas = (presupuesto.lineas || []) as LineaPresupuesto[];
  const { data: items } = await admin
    .from('pedido_items')
    .select('id, numero_tecmelec, rechazada_por_aprobador')
    .eq('pedido_id', presupuesto.pedido_id);
  const libres = new Set(
    (items || []).filter((i) => !i.numero_tecmelec && !i.rechazada_por_aprobador).map((i) => i.id)
  );

  let aplicadas = 0;
  const aplicadasDetalle: { item_id: string; linea_idx: number; precio: number }[] = [];
  for (const a of asignaciones) {
    if (!libres.has(a.item_id)) continue;
    const l = lineas.find((x) => x.idx === a.linea_idx);
    if (!l || l.precio_unitario == null || !(l.precio_unitario >= 0)) continue;
    const { error } = await admin
      .from('pedido_items')
      .update({
        precio_unitario: l.precio_unitario,
        precio_presupuesto_id: presupuesto.id,
        ...(proveedorId ? { proveedor_id: proveedorId } : {}),
      })
      .eq('id', a.item_id);
    if (error) return { error: 'No se pudo guardar el precio de una línea: ' + error.message };
    aplicadas++;
    aplicadasDetalle.push({ item_id: a.item_id, linea_idx: l.idx, precio: l.precio_unitario });
  }

  await admin
    .from('presupuestos')
    .update({ asignaciones: aplicadasDetalle, aplicado_en: new Date().toISOString() })
    .eq('id', presupuesto.id);

  // Total estimado
  const { data: itemsFinal } = await admin
    .from('pedido_items')
    .select('cantidad, precio_unitario, rechazada_por_aprobador, productos(precio)')
    .eq('pedido_id', presupuesto.pedido_id);
  const total = (itemsFinal || [])
    .filter((it: any) => !it.rechazada_por_aprobador)
    .reduce((s: number, it: any) => s + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad, 0);
  await admin.from('pedidos').update({ total_estimado: Number(total.toFixed(2)) }).eq('id', presupuesto.pedido_id);

  revalidatePath(`/comprador/${presupuesto.pedido_id}`);
  return { success: true, aplicadas };
}

// Borra un presupuesto (y sus archivos). Las líneas que tomaron su precio lo conservan,
// pero dejan de marcarse como "Precios desde presupuesto".
export async function eliminarPresupuesto(presupuestoId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  if (!perfil || !['comprador', 'admin'].includes(perfil.rol)) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { data: p } = await admin.from('presupuestos').select('id, pedido_id, archivos').eq('id', presupuestoId).single();
  if (!p) return { success: true };
  if ((p.archivos || []).length) await admin.storage.from('listas-foto').remove(p.archivos);
  await admin.from('presupuestos').delete().eq('id', p.id);
  revalidatePath(`/comprador/${p.pedido_id}`);
  return { success: true };
}
