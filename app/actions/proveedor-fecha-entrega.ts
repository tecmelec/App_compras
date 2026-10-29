'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerLineasPedidoCompraBC, actualizarFechaEntregaLineaCompraBC } from '@/lib/business-central';

export type ItemFechaEntrega = {
  id: string;
  nombre: string;
  cantidad: number;
  unidadMedida: string;
  fechaActual: string | null;
};

// El token puede venir de un email enviado desde la app (pedido_emails) o de
// un enlace generado manualmente con el botón "Copiar enlace"
// (enlaces_proveedor_pedido); ambos dan acceso a la misma página pública.
async function resolverNumeroTecmelecPorToken(
  supabase: ReturnType<typeof createAdminClient>,
  token: string
): Promise<string | null> {
  const { data: envio } = await supabase
    .from('pedido_emails')
    .select('numero_tecmelec')
    .eq('token', token)
    .maybeSingle();

  if (envio) return envio.numero_tecmelec;

  const { data: enlace } = await supabase
    .from('enlaces_proveedor_pedido')
    .select('numero_tecmelec')
    .eq('token', token)
    .maybeSingle();

  return enlace?.numero_tecmelec || null;
}

// Intenta reflejar también en Business Central la fecha que acaba de indicar
// el proveedor (Expected_Receipt_Date de la línea). Es un "mejor esfuerzo":
// si BC no deja tocar esa línea (documento bloqueado, cambios de permisos,
// etc.) no debe impedir que la fecha quede guardada en la app —que es la
// referencia real para el seguimiento interno—, así que cualquier fallo
// aquí solo se registra en los logs de Vercel.
// Se exporta porque también se usa desde la edición manual del comprador
// (actualizarLineasTecmelec en app/actions/pedidos.ts) cuando cambia la
// fecha de una línea a mano, no solo desde el enlace del proveedor — por
// eso el cliente de Supabase se tipa suelto: puede ser el admin (esta
// página pública) o el cliente normal autenticado (formulario del comprador).
export async function sincronizarFechasConBC(
  supabase: any,
  numeroTecmelec: string,
  cambios: { itemId: string; fecha: string }[]
) {
  if (cambios.length === 0) return;

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, cantidad, productos(bc_item_no)')
    .in(
      'id',
      cambios.map((c) => c.itemId)
    );

  const itemsConBcNo = (items || []).filter((it: any) => it.productos?.bc_item_no);
  if (itemsConBcNo.length === 0) return;

  let lineasBC: Awaited<ReturnType<typeof obtenerLineasPedidoCompraBC>>;
  try {
    lineasBC = await obtenerLineasPedidoCompraBC(numeroTecmelec);
  } catch (e: any) {
    console.error(`[sincronizarFechasConBC ${numeroTecmelec}] No se pudo leer BC:`, e.message || e);
    return;
  }

  for (const cambio of cambios) {
    const item = itemsConBcNo.find((it: any) => it.id === cambio.itemId) as any;
    if (!item) continue;

    // Mismo criterio de desambiguación (Nº de artículo + cantidad exacta)
    // que usa el resto de la sincronización con BC, por si el pedido tiene
    // varias líneas con el mismo artículo en cantidades distintas.
    const linea = lineasBC.find((l) => l.No === item.productos.bc_item_no && l.Quantity === item.cantidad);
    if (!linea) {
      console.error(
        `[sincronizarFechasConBC ${numeroTecmelec}] No se encontró la línea de BC para el artículo ${item.productos.bc_item_no} (cantidad ${item.cantidad}).`
      );
      continue;
    }

    try {
      await actualizarFechaEntregaLineaCompraBC(linea, cambio.fecha);
    } catch (e: any) {
      console.error(
        `[sincronizarFechasConBC ${numeroTecmelec}] No se pudo actualizar la línea ${linea.No} en BC:`,
        e.message || e
      );
    }
  }
}

export async function obtenerPedidoPorToken(token: string) {
  const supabase = createAdminClient();

  const numeroTecmelec = await resolverNumeroTecmelecPorToken(supabase, token);

  if (!numeroTecmelec) {
    return { error: 'Este enlace no es válido o ha caducado.' };
  }

  const items = await lineasActivasPedido(supabase, numeroTecmelec);

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
    numeroTecmelec,
    proveedorNombre,
    items: itemsFormateados,
  };
}

// Líneas que se le piden al proveedor: igual que en el PDF, fuera las de cantidad 0 y
// las anuladas (estado o recepción "Anulado").
async function lineasActivasPedido(supabase: any, numeroTecmelec: string) {
  const [{ data: items }, { data: anulado }] = await Promise.all([
    supabase
      .from('pedido_items')
      .select('id, cantidad, estado_id, estado_recepcion, fecha_estimada_entrega, proveedor_id, productos(nombre, unidad_medida)')
      .eq('numero_tecmelec', numeroTecmelec),
    supabase.from('estados_pedido').select('id').ilike('nombre', 'anulado').maybeSingle(),
  ]);
  const idAnulado: number | null = anulado?.id ?? null;
  return ((items || []) as any[]).filter(
    (it) => Number(it.cantidad) > 0 && it.estado_recepcion !== 'Anulado' && (idAnulado == null || it.estado_id !== idAnulado)
  );
}

export async function guardarFechaEntregaProveedor(
  token: string,
  payload:
    | { modo: 'unica'; fecha: string }
    | { modo: 'porArticulo'; fechas: { itemId: string; fecha: string }[] }
) {
  const supabase = createAdminClient();

  const numeroTecmelec = await resolverNumeroTecmelecPorToken(supabase, token);

  if (!numeroTecmelec) {
    return { error: 'Este enlace no es válido o ha caducado.' };
  }

  if (payload.modo === 'unica') {
    if (!payload.fecha) {
      return { error: 'Indica una fecha.' };
    }

    const itemsGrupo = await lineasActivasPedido(supabase, numeroTecmelec);
    if (itemsGrupo.length === 0) return { error: 'No hay artículos pendientes en este pedido.' };

    const { error } = await supabase
      .from('pedido_items')
      .update({
        fecha_estimada_entrega: payload.fecha,
        fecha_estimada_entrega_confirmada_en: new Date().toISOString(),
      })
      .in(
        'id',
        itemsGrupo.map((it: any) => it.id)
      )
      .eq('numero_tecmelec', numeroTecmelec);

    if (error) return { error: error.message };
    // La confirmación del proveedor sustituye a la del Seguidor IA (si la hubiera).
    await supabase
      .from('pedido_items')
      .update({ fecha_estimada_entrega_seguidor_en: null })
      .in(
        'id',
        itemsGrupo.map((it: any) => it.id)
      );

    await sincronizarFechasConBC(
      supabase,
      numeroTecmelec,
      (itemsGrupo || []).map((it) => ({ itemId: it.id, fecha: payload.fecha }))
    );

    return { success: true };
  }

  const activas = new Set((await lineasActivasPedido(supabase, numeroTecmelec)).map((it: any) => it.id));
  const fechasValidas = payload.fechas.filter((f) => f.fecha && activas.has(f.itemId));
  if (fechasValidas.length === 0) {
    return { error: 'Indica al menos una fecha.' };
  }

  // Se valida uno a uno que el artículo pertenezca a este pedido (por el
  // mismo Nº pedido Tecmelec del token), para que no se pueda modificar
  // nada fuera de este pedido aunque alguien manipule el itemId enviado.
  for (const f of fechasValidas) {
    const { error } = await supabase
      .from('pedido_items')
      .update({
        fecha_estimada_entrega: f.fecha,
        fecha_estimada_entrega_confirmada_en: new Date().toISOString(),
      })
      .eq('id', f.itemId)
      .eq('numero_tecmelec', numeroTecmelec);

    if (error) return { error: error.message };
    await supabase.from('pedido_items').update({ fecha_estimada_entrega_seguidor_en: null }).eq('id', f.itemId);
  }

  await sincronizarFechasConBC(supabase, numeroTecmelec, fechasValidas);

  return { success: true };
}
