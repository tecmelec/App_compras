'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import {
  obtenerItemsComunesBC,
  obtenerProyectosBC,
  obtenerProveedoresBC,
  obtenerPedidoCompraBC,
} from '@/lib/business-central';
import { revalidatePath } from 'next/cache';

export async function sincronizarProductosBC() {
  await requireAdmin();
  const supabase = createClient();

  let items;
  try {
    items = await obtenerItemsComunesBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('productos').select('id, bc_item_no').not('bc_item_no', 'is', null);
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_item_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const item of items) {
    const idExistente = existentesPorNo.get(item.No);

    if (idExistente) {
      const { error } = await supabase
        .from('productos')
        .update({
          nombre: item.Description,
          unidad_medida: item.Base_Unit_of_Measure,
          precio: item.Unit_Price,
        })
        .eq('id', idExistente);

      if (error) errores.push(`${item.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('productos').insert({
        bc_item_no: item.No,
        nombre: item.Description,
        unidad_medida: item.Base_Unit_of_Measure,
        precio: item.Unit_Price,
        visible: false, // el admin decide cuáles mostrar y sube la imagen antes de publicarlos
      });

      if (error) errores.push(`${item.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/productos');
  revalidatePath('/tienda');

  return { success: true, creados, actualizados, totalBC: items.length, errores };
}

export async function sincronizarProyectosBC() {
  await requireAdmin();
  const supabase = createClient();

  let proyectos;
  try {
    proyectos = await obtenerProyectosBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('proyectos').select('id, bc_job_no');
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_job_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const proyecto of proyectos) {
    const idExistente = existentesPorNo.get(proyecto.No);

    if (idExistente) {
      const { error } = await supabase
        .from('proyectos')
        .update({
          descripcion: proyecto.Description,
          estado: proyecto.Status,
          direccion: proyecto.Sell_to_Address,
          codigo_postal: proyecto.Sell_to_Post_Code,
          ciudad: proyecto.Sell_to_City,
          provincia: proyecto.Sell_to_County,
        })
        .eq('id', idExistente);

      if (error) errores.push(`${proyecto.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('proyectos').insert({
        bc_job_no: proyecto.No,
        descripcion: proyecto.Description,
        estado: proyecto.Status,
        direccion: proyecto.Sell_to_Address,
        codigo_postal: proyecto.Sell_to_Post_Code,
        ciudad: proyecto.Sell_to_City,
        provincia: proyecto.Sell_to_County,
      });

      if (error) errores.push(`${proyecto.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/proyectos');
  revalidatePath('/proyectos-equipo');

  return { success: true, creados, actualizados, totalBC: proyectos.length, errores };
}

export async function sincronizarProveedoresBC() {
  await requireAdmin();
  const supabase = createClient();

  let proveedores;
  try {
    proveedores = await obtenerProveedoresBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('proveedores').select('id, bc_proveedor_no');
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_proveedor_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const proveedor of proveedores) {
    const idExistente = existentesPorNo.get(proveedor.No);

    if (idExistente) {
      const { error } = await supabase
        .from('proveedores')
        .update({ nombre: proveedor.Name })
        .eq('id', idExistente);

      if (error) errores.push(`${proveedor.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('proveedores').insert({
        bc_proveedor_no: proveedor.No,
        nombre: proveedor.Name,
      });

      if (error) errores.push(`${proveedor.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/proveedores');

  return { success: true, creados, actualizados, totalBC: proveedores.length, errores };
}

// Mapa del Status del pedido de compra en Business Central al nombre exacto
// del estado configurado en /admin/estados. Solo cubre los 3 estados que
// vienen de BC; "Solicitud enviada/aprobada", "Recibido parcial/completo"
// se siguen gestionando desde la app, no desde aquí.
const MAPA_ESTADO_BC: Record<string, string> = {
  Open: 'Pedido abierto',
  'Pending Approval': 'Pedido pendiente de aprobación',
  Released: 'Pedido lanzado',
};

export async function sincronizarPedidoConBC(pedidoId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { data: pedido } = await supabase.from('pedidos').select('id, numero_app').eq('id', pedidoId).single();

  if (!pedido) return { error: 'Pedido no encontrado.' };

  let pedidoBC;
  try {
    pedidoBC = await obtenerPedidoCompraBC(pedido.numero_app);
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  if (!pedidoBC) {
    return {
      error: `No se encontró en Business Central ningún pedido de compra con "Su Referencia" = ${pedido.numero_app}.`,
    };
  }

  const { data: estados } = await supabase.from('estados_pedido').select('id, nombre, orden');
  const nombreEstadoNuevo = MAPA_ESTADO_BC[pedidoBC.Status];
  const estadoNuevo = nombreEstadoNuevo ? estados?.find((e) => e.nombre === nombreEstadoNuevo) : null;

  let proveedorId: string | null = null;
  if (pedidoBC.Buy_from_Vendor_No) {
    const { data: proveedor } = await supabase
      .from('proveedores')
      .select('id')
      .eq('bc_proveedor_no', pedidoBC.Buy_from_Vendor_No)
      .maybeSingle();
    proveedorId = proveedor?.id || null;
  }

  const { data: items } = await supabase.from('pedido_items').select('id, estado_id').eq('pedido_id', pedidoId);

  let actualizados = 0;
  const avisos: string[] = [];

  for (const item of items || []) {
    const cambios: Record<string, any> = { numero_tecmelec: pedidoBC.No };
    if (proveedorId) cambios.proveedor_id = proveedorId;

    if (estadoNuevo) {
      const ordenActual = estados?.find((e) => e.id === item.estado_id)?.orden ?? 0;
      // Nunca retrocede: si en BC el pedido "vuelve" a un estado anterior, se ignora.
      if (estadoNuevo.orden > ordenActual) {
        cambios.estado_id = estadoNuevo.id;
      }
    }

    const { error } = await supabase.from('pedido_items').update(cambios).eq('id', item.id);
    if (error) avisos.push(error.message);
    else actualizados++;
  }

  if (!proveedorId && pedidoBC.Buy_from_Vendor_No) {
    avisos.push(
      `El proveedor "${pedidoBC.Buy_from_Vendor_No}" de Business Central no está sincronizado en /admin/proveedores.`
    );
  }
  if (!nombreEstadoNuevo) {
    avisos.push(
      `Estado "${pedidoBC.Status}" de Business Central no reconocido (se esperaba Open, Pending Approval o Released).`
    );
  }

  revalidatePath(`/comprador/${pedidoId}`);
  revalidatePath(`/admin/pedidos/${pedidoId}`);

  return {
    success: true,
    numeroTecmelec: pedidoBC.No,
    actualizados,
    avisos,
  };
}
