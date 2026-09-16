'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type ItemFechaEntrega = {
  id: string;
  nombre: string;
  cantidad: number;
  unidadMedida: string;
  fechaActual: string | null;
};

export async function obtenerPedidoPorToken(token: string) {
  const supabase = createAdminClient();

  const { data: envio } = await supabase
    .from('pedido_emails')
    .select('numero_tecmelec, pedido_id')
    .eq('token', token)
    .maybeSingle();

  if (!envio) {
    return { error: 'Este enlace no es válido o ha caducado.' };
  }

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, cantidad, fecha_estimada_entrega, proveedor_id, productos(nombre, unidad_medida)')
    .eq('numero_tecmelec', envio.numero_tecmelec);

  if (!items || items.length === 0) {
    return { error: 'No se encontraron artículos para este pedido.' };
  }

  let proveedorNombre = '';
  const proveedorId = (items[0] as any).proveedor_id;
  if (proveedorId) {
    const { data: proveedor } = await supabase.from('proveedores').select('nombre').eq('id', proveedorId).single();
    proveedorNombre = proveedor?.nombre || '';
  }

  const itemsFormateados: ItemFechaEntrega[] = items.map((it: any) => ({
    id: it.id,
    nombre: it.productos?.nombre || '',
    cantidad: it.cantidad,
    unidadMedida: it.productos?.unidad_medida || '',
    fechaActual: it.fecha_estimada_entrega,
  }));

  return {
    success: true,
    numeroTecmelec: envio.numero_tecmelec,
    proveedorNombre,
    items: itemsFormateados,
  };
}

export async function guardarFechaEntregaProveedor(
  token: string,
  payload:
    | { modo: 'unica'; fecha: string }
    | { modo: 'porArticulo'; fechas: { itemId: string; fecha: string }[] }
) {
  const supabase = createAdminClient();

  const { data: envio } = await supabase
    .from('pedido_emails')
    .select('numero_tecmelec')
    .eq('token', token)
    .maybeSingle();

  if (!envio) {
    return { error: 'Este enlace no es válido o ha caducado.' };
  }

  if (payload.modo === 'unica') {
    if (!payload.fecha) {
      return { error: 'Indica una fecha.' };
    }
    const { error } = await supabase
      .from('pedido_items')
      .update({ fecha_estimada_entrega: payload.fecha })
      .eq('numero_tecmelec', envio.numero_tecmelec);

    if (error) return { error: error.message };
    return { success: true };
  }

  const fechasValidas = payload.fechas.filter((f) => f.fecha);
  if (fechasValidas.length === 0) {
    return { error: 'Indica al menos una fecha.' };
  }

  // Se valida uno a uno que el artículo pertenezca a este pedido (por el
  // mismo Nº pedido Tecmelec del token), para que no se pueda modificar
  // nada fuera de este pedido aunque alguien manipule el itemId enviado.
  for (const f of fechasValidas) {
    const { error } = await supabase
      .from('pedido_items')
      .update({ fecha_estimada_entrega: f.fecha })
      .eq('id', f.itemId)
      .eq('numero_tecmelec', envio.numero_tecmelec);

    if (error) return { error: error.message };
  }

  return { success: true };
}
