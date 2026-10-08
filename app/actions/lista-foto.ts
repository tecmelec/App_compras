'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { obtenerItemBC } from '@/lib/business-central';
import { recalcularEstadoGeneral } from '@/lib/pedidos-utils';

// Guarda lo que el usuario decidió al revisar la lista (producto y cantidad que
// añade al carrito por cada línea), para el informe de la solicitud.
export async function confirmarListaFoto(
  listaId: string,
  decisiones: { n: number; producto_id: string | null; cantidad: number | null }[]
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const admin = createAdminClient();
  const { data: lista } = await admin
    .from('listas_foto')
    .select('id, lineas, pedido_id')
    .eq('id', listaId)
    .eq('usuario_id', user.id)
    .single();
  if (!lista) return { error: 'No se encontró la lista.' };
  if (lista.pedido_id) return { error: 'Esta lista ya se envió en una solicitud.' };

  const porLinea = new Map(decisiones.map((d) => [d.n, d]));
  const lineas = (lista.lineas as any[]).map((l) => {
    const d = porLinea.get(l.n);
    return {
      ...l,
      producto_id: d?.producto_id || null,
      cantidad_carrito: d?.producto_id ? d.cantidad : null,
    };
  });

  const { error } = await admin.from('listas_foto').update({ lineas }).eq('id', listaId);
  if (error) return { error: 'No se pudo guardar la revisión de la lista.' };
  return { success: true };
}

// --- Asignar un artículo de BC a una línea pendiente de la lista en foto ------------
// Para las líneas que no llegaron a la solicitud (no estaban en la tienda, se
// descartaron o se quitaron del carrito): el responsable o el comprador eligen el
// artículo en BC y se añade como línea nueva de la solicitud. El comprador puede
// fijar además precio y proveedor. Si el artículo no existe en la tabla de
// productos, se crea oculto (visible = false): no aparece en la tienda.

const ROLES_ASIGNAR = ['responsable', 'comprador', 'admin'];

async function perfilActual() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, perfil: null };
  const { data: perfil } = await supabase
    .from('profiles')
    .select('rol, nombre_completo, activo')
    .eq('id', user.id)
    .single();
  return { supabase, user, perfil };
}

// Datos de BC del artículo elegido, para proponer cantidad, precio y proveedor.
export async function datosArticuloParaAsignar(bcItemNo: string) {
  const { user, perfil } = await perfilActual();
  if (!user || !perfil?.activo || !ROLES_ASIGNAR.includes(perfil.rol)) return { error: 'No autorizado.' };
  try {
    const item = await obtenerItemBC(bcItemNo);
    if (!item) return { error: `El artículo ${bcItemNo} no existe en Business Central.` };
    const admin = createAdminClient();
    const [{ data: producto }, { data: proveedor }] = await Promise.all([
      admin.from('productos').select('id, visible, precio, multiplo_compra, proveedor_predeterminado_id').eq('bc_item_no', item.No).maybeSingle(),
      item.Vendor_No
        ? admin.from('proveedores').select('id').eq('bc_proveedor_no', item.Vendor_No).maybeSingle()
        : Promise.resolve({ data: null as { id: string } | null }),
    ]);
    return {
      success: true,
      articulo: {
        bc_item_no: item.No,
        descripcion: item.Description,
        unidad: item.Base_Unit_of_Measure || 'ud.',
        multiplo: producto?.multiplo_compra || (item.Multiplo_de && item.Multiplo_de > 1 ? Math.round(item.Multiplo_de) : 1),
        precio: Number(producto?.precio ?? item.Unit_Price ?? 0),
        proveedor_id: producto?.proveedor_predeterminado_id || proveedor?.id || null,
        en_tienda: !!producto?.visible,
      },
    };
  } catch (e: any) {
    return { error: 'No se pudo consultar Business Central: ' + (e.message || '') };
  }
}

export async function asignarArticuloLineaListaFoto(datos: {
  listaId: string;
  n: number;
  bcItemNo: string;
  cantidad: number;
  precio?: number | null;
  proveedorId?: string | null;
}) {
  const { supabase, user, perfil } = await perfilActual();
  if (!user || !perfil?.activo || !ROLES_ASIGNAR.includes(perfil.rol)) return { error: 'No autorizado.' };
  const esCompras = perfil.rol === 'comprador' || perfil.rol === 'admin';

  const admin = createAdminClient();
  const { data: lista } = await admin.from('listas_foto').select('id, pedido_id, lineas').eq('id', datos.listaId).single();
  if (!lista?.pedido_id) return { error: 'La lista no está vinculada a ninguna solicitud.' };

  // Acceso a la solicitud comprobado con RLS (el responsable solo ve las suyas).
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, estado_general, aprobado')
    .eq('id', lista.pedido_id)
    .single();
  if (!pedido) return { error: 'No tienes acceso a esta solicitud.' };
  if (pedido.estado_general === 'Anulado' || pedido.aprobado === false) {
    return { error: 'La solicitud está anulada o rechazada: no se pueden añadir artículos.' };
  }

  const lineas = (lista.lineas || []) as any[];
  const linea = lineas.find((l) => l.n === datos.n);
  if (!linea) return { error: 'No se encontró la línea de la lista.' };

  const { data: itemsPedido } = await admin
    .from('pedido_items')
    .select('producto_id, cantidad, precio_unitario, rechazada_por_aprobador, productos(precio)')
    .eq('pedido_id', pedido.id);
  if (linea.producto_id && (itemsPedido || []).some((it: any) => it.producto_id === linea.producto_id)) {
    return { error: 'Esta línea ya tiene un artículo en la solicitud.' };
  }

  // Artículo de BC → producto de la app (se crea oculto si no existe).
  let item;
  try {
    item = await obtenerItemBC(datos.bcItemNo);
  } catch (e: any) {
    return { error: 'No se pudo consultar Business Central: ' + (e.message || '') };
  }
  if (!item) return { error: `El artículo ${datos.bcItemNo} no existe en Business Central.` };

  let { data: producto } = await admin
    .from('productos')
    .select('id, nombre, precio, multiplo_compra, proveedor_predeterminado_id')
    .eq('bc_item_no', item.No)
    .maybeSingle();
  if (!producto) {
    const { data: proveedorBC } = item.Vendor_No
      ? await admin.from('proveedores').select('id').eq('bc_proveedor_no', item.Vendor_No).maybeSingle()
      : { data: null };
    const categoria = (item.Item_Category_Code || '').trim();
    const { data: nuevo, error } = await admin
      .from('productos')
      .insert({
        bc_item_no: item.No,
        nombre: item.Description,
        unidad_medida: item.Base_Unit_of_Measure,
        precio: item.Unit_Price || 0,
        multiplo_compra: item.Multiplo_de && item.Multiplo_de > 1 ? Math.round(item.Multiplo_de) : 1,
        visible: false,
        ...(categoria ? { categoria } : {}),
        ...(proveedorBC?.id ? { proveedor_predeterminado_id: proveedorBC.id } : {}),
      })
      .select('id, nombre, precio, multiplo_compra, proveedor_predeterminado_id')
      .single();
    if (error || !nuevo) return { error: 'No se pudo dar de alta el artículo en la app: ' + (error?.message || '') };
    producto = nuevo;
  }

  if ((itemsPedido || []).some((it: any) => it.producto_id === producto!.id && !it.rechazada_por_aprobador)) {
    return { error: 'Ese artículo ya está en la solicitud: modifica su cantidad en lugar de añadirlo otra vez.' };
  }

  const multiplo = producto.multiplo_compra > 1 ? producto.multiplo_compra : 1;
  const cantidad = Number(datos.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) return { error: 'Indica una cantidad entera mayor que cero.' };
  if (cantidad % multiplo !== 0) return { error: `La cantidad debe ser múltiplo de ${multiplo}.` };

  const precio = esCompras && datos.precio != null && Number.isFinite(Number(datos.precio)) ? Number(datos.precio) : null;
  if (precio != null && precio < 0) return { error: 'El precio no puede ser negativo.' };

  const { error: errorItem } = await admin.from('pedido_items').insert({
    pedido_id: pedido.id,
    producto_id: producto.id,
    cantidad,
    precio_unitario: precio,
    proveedor_id: esCompras ? datos.proveedorId || producto.proveedor_predeterminado_id || null : producto.proveedor_predeterminado_id || null,
  });
  if (errorItem) return { error: 'No se pudo añadir la línea a la solicitud: ' + errorItem.message };

  // Registro en la lista para el informe.
  const nuevasLineas = lineas.map((l) =>
    l.n === datos.n
      ? {
          ...l,
          producto_id: producto!.id,
          cantidad_carrito: cantidad,
          asignado: {
            por_id: user.id,
            por_nombre: perfil.nombre_completo,
            rol: perfil.rol,
            en: new Date().toISOString(),
            bc_item_no: item!.No,
            nombre: item!.Description,
          },
        }
      : l
  );
  await admin.from('listas_foto').update({ lineas: nuevasLineas }).eq('id', lista.id);

  // Total estimado con la línea nueva.
  const { data: itemsFinal } = await admin
    .from('pedido_items')
    .select('cantidad, precio_unitario, rechazada_por_aprobador, productos(precio)')
    .eq('pedido_id', pedido.id);
  const total = (itemsFinal || [])
    .filter((it: any) => !it.rechazada_por_aprobador)
    .reduce((s: number, it: any) => s + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad, 0);
  await admin.from('pedidos').update({ total_estimado: Number(total.toFixed(2)) }).eq('id', pedido.id);
  await recalcularEstadoGeneral(admin, pedido.id);

  for (const ruta of ['/comprador', '/responsable', '/admin/pedidos', '/mis-pedidos', '/lineas-compras']) {
    revalidatePath(`${ruta}/${pedido.id}`);
  }
  return { success: true };
}
