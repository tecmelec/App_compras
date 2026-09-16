'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';
import {
  obtenerItemsComunesBC,
  obtenerProyectosBC,
  obtenerProveedoresBC,
  obtenerPedidoCompraBC,
  obtenerLineasPedidoCompraBC,
  obtenerCrudoBC,
  obtenerCrudoBCFiltrado,
  crearPedidoCompraBC,
  crearLineaPedidoCompraBC,
  existeTareaProyectoBC,
  obtenerMaxLineaPlanificacionBC,
  crearLineaPlanificacionBC,
} from '@/lib/business-central';
import { revalidatePath } from 'next/cache';
import { idsEfectivos, recalcularEstadoGeneral } from '@/lib/pedidos-utils';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';

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

  const { data: proveedoresDb } = await obtenerTodosLosProveedores(supabase, 'id, bc_proveedor_no', 'bc_proveedor_no');
  const proveedoresPorNo = new Map((proveedoresDb || []).map((p) => [p.bc_proveedor_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];
  const proveedoresSinSincronizar = new Set<string>();

  for (const item of items) {
    const idExistente = existentesPorNo.get(item.No);
    const proveedorPredetId = item.Vendor_No ? proveedoresPorNo.get(item.Vendor_No) || null : null;
    if (item.Vendor_No && !proveedorPredetId) proveedoresSinSincronizar.add(item.Vendor_No);

    // Solo tocamos el proveedor predeterminado cuando BC realmente lo resuelve a uno ya
    // sincronizado; si no, dejamos lo que ya hubiera (manual o de un sync anterior) intacto.
    const cambiosComunes: Record<string, any> = {
      nombre: item.Description,
      unidad_medida: item.Base_Unit_of_Measure,
      precio: item.Unit_Price,
    };
    if (proveedorPredetId) cambiosComunes.proveedor_predeterminado_id = proveedorPredetId;

    if (idExistente) {
      const { error } = await supabase.from('productos').update(cambiosComunes).eq('id', idExistente);

      if (error) errores.push(`${item.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('productos').insert({
        bc_item_no: item.No,
        visible: false, // el admin decide cuáles mostrar y sube la imagen antes de publicarlos
        ...cambiosComunes,
      });

      if (error) errores.push(`${item.No}: ${error.message}`);
      else creados++;
    }
  }

  if (proveedoresSinSincronizar.size > 0) {
    errores.push(
      `Proveedores sin sincronizar en /admin/proveedores (no se pudo asignar como predeterminado): ${Array.from(proveedoresSinSincronizar).join(', ')}`
    );
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

  const { data: existentes } = await obtenerTodosLosProveedores(supabase, 'id, bc_proveedor_no', 'bc_proveedor_no');
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

// El estado de recepción es un texto fijo (no usa la tabla estados_pedido),
// así que su "orden" para la regla de no-retroceso se define aquí.
const ORDEN_RECEPCION: Record<string, number> = {
  'Pendiente de recibir': 0,
  'Recibido parcial': 1,
  Recibido: 2,
};

function calcularEstadoRecepcion(cantidadPedida: number, cantidadRecibida: number): string {
  if (cantidadRecibida <= 0) return 'Pendiente de recibir';
  if (cantidadRecibida < cantidadPedida) return 'Recibido parcial';
  return 'Recibido';
}

// Núcleo de la sincronización de un pedido, independiente de quién lo invoque
// (botón manual con el cliente de sesión del comprador, o el cron con el
// cliente admin). No hace comprobaciones de autenticación: eso lo decide
// quien llama a esta función.
async function sincronizarPedidoConBCInterno(supabase: any, pedidoId: string, numeroApp: string) {
  let pedidoBC;
  try {
    pedidoBC = await obtenerPedidoCompraBC(numeroApp);
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  if (!pedidoBC) {
    return {
      error: `No se encontró en Business Central ningún pedido de compra con "Su Referencia" = ${numeroApp}.`,
      sinCambios: true,
    };
  }

  const { data: estados } = await supabase.from('estados_pedido').select('id, nombre, orden');
  const nombreEstadoNuevo = MAPA_ESTADO_BC[pedidoBC.Status];
  const estadoNuevo = nombreEstadoNuevo ? estados?.find((e: any) => e.nombre === nombreEstadoNuevo) : null;

  let proveedorId: string | null = null;
  if (pedidoBC.Buy_from_Vendor_No) {
    const { data: proveedor } = await supabase
      .from('proveedores')
      .select('id')
      .eq('bc_proveedor_no', pedidoBC.Buy_from_Vendor_No)
      .maybeSingle();
    proveedorId = proveedor?.id || null;
  }

  let lineasBC: {
    No: string;
    Quantity: number;
    Quantity_Received: number;
    Expected_Receipt_Date: string | null;
    Line_Amount: number;
  }[] = [];
  let errorLineas: string | null = null;
  try {
    lineasBC = await obtenerLineasPedidoCompraBC(pedidoBC.No);
  } catch (e: any) {
    errorLineas = e.message || 'No se pudieron obtener las líneas del pedido de compra.';
  }

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, estado_id, estado_recepcion, cantidad, productos(bc_item_no)')
    .eq('pedido_id', pedidoId);

  let actualizados = 0;
  const avisos: string[] = [];

  for (const item of items || []) {
    const cambios: Record<string, any> = { numero_tecmelec: pedidoBC.No };
    if (proveedorId) cambios.proveedor_id = proveedorId;

    if (estadoNuevo) {
      const ordenActual = estados?.find((e: any) => e.id === item.estado_id)?.orden ?? 0;
      // Nunca retrocede: si en BC el pedido "vuelve" a un estado anterior, se ignora.
      if (estadoNuevo.orden > ordenActual) {
        cambios.estado_id = estadoNuevo.id;
      }
    }

    // Estado de recepción: se cruza por artículo BC (bc_item_no) + cantidad exacta,
    // ya que Document_No por sí solo no identifica una línea concreta.
    if (item.estado_recepcion !== 'Anulado') {
      const bcItemNo = item.productos?.bc_item_no;
      const lineaBC = bcItemNo
        ? lineasBC.find((l) => l.No === bcItemNo && l.Quantity === item.cantidad)
        : undefined;

      if (lineaBC) {
        const recepcionNueva = calcularEstadoRecepcion(lineaBC.Quantity, lineaBC.Quantity_Received);
        const ordenActual = ORDEN_RECEPCION[item.estado_recepcion || ''] ?? -1;
        const ordenNuevo = ORDEN_RECEPCION[recepcionNueva];
        // Misma regla de no-retroceso que el estado general.
        if (ordenNuevo > ordenActual) {
          cambios.estado_recepcion = recepcionNueva;
        }

        // BC es la fuente de verdad para la fecha estimada una vez existe la línea;
        // si BC no trae fecha (vacía), se deja la que ya hubiera en la app.
        if (lineaBC.Expected_Receipt_Date) {
          cambios.fecha_estimada_entrega = lineaBC.Expected_Receipt_Date.slice(0, 10);
        }

        // Precio real de esa línea de compra, con descuentos ya aplicados (Line_Amount
        // ya viene neto de descuento de línea). BC manda en cuanto hay una línea vinculada.
        if (lineaBC.Quantity > 0) {
          cambios.precio_unitario = Number((lineaBC.Line_Amount / lineaBC.Quantity).toFixed(5));
        }
      } else if (!errorLineas) {
        avisos.push(
          `No se encontró en BC una línea de "${bcItemNo || 'artículo sin código BC'}" con cantidad ${item.cantidad} dentro del pedido ${pedidoBC.No}.`
        );
      }
    }

    const { error } = await supabase.from('pedido_items').update(cambios).eq('id', item.id);
    if (error) avisos.push(error.message);
    else actualizados++;
  }

  // Recalcula el total del pedido con los precios ya actualizados (o el del
  // catálogo, para las líneas que aún no tengan precio propio de BC).
  const { data: itemsFinal } = await supabase
    .from('pedido_items')
    .select('cantidad, precio_unitario, productos(precio)')
    .eq('pedido_id', pedidoId);

  if (itemsFinal) {
    const totalNuevo = itemsFinal.reduce(
      (suma: number, it: any) => suma + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad,
      0
    );
    await supabase
      .from('pedidos')
      .update({ total_estimado: Number(totalNuevo.toFixed(2)) })
      .eq('id', pedidoId);
  }

  // El estado_id de las líneas puede haber cambiado arriba (p.ej. a "Pedido
  // lanzado"): recalculamos el Estado general del pedido con esos datos.
  await recalcularEstadoGeneral(supabase, pedidoId);

  if (errorLineas) avisos.push(errorLineas);
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

  return { success: true, numeroTecmelec: pedidoBC.No, actualizados, avisos };
}

// Botón manual desde /comprador/[id]: usa el cliente con la sesión del
// comprador (RLS aplica con normalidad).
export async function sincronizarPedidoConBC(pedidoId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { data: pedido } = await supabase.from('pedidos').select('id, numero_app').eq('id', pedidoId).single();

  if (!pedido) return { error: 'Pedido no encontrado.' };

  const resultado = await sincronizarPedidoConBCInterno(supabase, pedidoId, pedido.numero_app);

  revalidatePath(`/comprador/${pedidoId}`);
  revalidatePath(`/admin/pedidos/${pedidoId}`);

  return resultado;
}

// Cron horario (ver /app/api/cron/sincronizar-pedidos-bc): carga incremental,
// solo repasa pedidos que aún no están cerrados en la app (evita golpear la
// API de BC por cada pedido histórico ya tramitado o anulado).
export async function sincronizarPedidosAbiertosConBC() {
  const supabase = createAdminClient();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_app')
    .in('estado_general', ['Pendiente de tramitar', 'Tramitado parcial']);

  const resumen: { numeroApp: string; resultado: any }[] = [];

  for (const pedido of pedidos || []) {
    const resultado = await sincronizarPedidoConBCInterno(supabase, pedido.id, pedido.numero_app);
    resumen.push({ numeroApp: pedido.numero_app, resultado });
  }

  revalidatePath('/comprador');
  revalidatePath('/admin/pedidos');
  revalidatePath('/responsable');

  return { revisados: pedidos?.length || 0, resumen };
}

// Botón "Sincronizar todas" en /comprador: repasa, con la sesión del propio
// comprador (o admin, que las ve todas), únicamente sus solicitudes que
// siguen abiertas — misma carga incremental que el cron, pero a demanda.
export async function sincronizarMisSolicitudesConBC() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();

  let query = supabase
    .from('pedidos')
    .select('id, numero_app')
    .in('estado_general', ['Pendiente de tramitar', 'Tramitado parcial']);

  if (perfil?.rol !== 'admin') {
    const ids = await idsEfectivos(supabase, user.id);
    query = query.in('comprador_id', ids);
  }

  const { data: pedidos } = await query;

  let actualizados = 0;
  let conError = 0;
  const avisos: string[] = [];

  for (const pedido of pedidos || []) {
    const resultado = await sincronizarPedidoConBCInterno(supabase, pedido.id, pedido.numero_app);
    if (resultado.error) {
      // "No encontrado en BC" es normal para pedidos aún no lanzados: no cuenta como error.
      if (!resultado.sinCambios) conError++;
    } else {
      actualizados++;
    }
  }

  revalidatePath('/comprador');

  return { revisados: pedidos?.length || 0, actualizados, conError };
}

// Diagnóstico temporal: muestra el primer registro tal cual lo envía BC para
// el feed de productos, sin tipar ni filtrar campos — útil para ver qué
// nombre exacto usa un campo (p.ej. Vendor_No) en una página OData concreta.
export async function depurarCamposProductoBC() {
  await requireAdmin();

  try {
    const valores = await obtenerCrudoBC(process.env.BC_ODATA_SERVICE!);
    return { success: true, primerItem: valores?.[0] || null, total: valores?.length || 0 };
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }
}

// Diagnóstico temporal: muestra tal cual las líneas de planificación de
// proyecto existentes para una obra/tarea concreta, para ver los nombres de
// campo exactos antes de intentar crear una nueva por OData.
export async function depurarLineasPlanificacionBC(jobNo: string, jobTaskNo: string) {
  await requireAdmin();

  try {
    const filtro = `Job_No eq '${jobNo.replace(/'/g, "''")}' and Job_Task_No eq '${jobTaskNo.replace(/'/g, "''")}'`;
    const valores = await obtenerCrudoBCFiltrado(process.env.BC_ODATA_SERVICE_LINEAS_PLANIFICACION!, filtro);
    return { success: true, lineas: valores || [], total: valores?.length || 0 };
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }
}

// Agrupa las líneas de una solicitud por proveedor (BC exige un proveedor
// por cabecera de pedido de compra, así que si hay varios, se crean varios
// pedidos de compra — uno por proveedor).
async function agruparPorProveedorParaBC(supabase: any, pedidoId: string) {
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('numero_app, nombre_contacto, telefono_contacto, proyectos(bc_job_no), direcciones(direccion, ciudad, provincia, codigo_postal)')
    .eq('id', pedidoId)
    .single();

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, cantidad, numero_tecmelec, precio_unitario, proveedor_id, productos(nombre, bc_item_no, precio)')
    .eq('pedido_id', pedidoId);

  const sinProveedor: any[] = [];
  const sinCodigoBC: any[] = [];
  const yaVinculadas: any[] = [];
  const grupos = new Map<string, any[]>();

  for (const item of items || []) {
    if (item.numero_tecmelec) {
      yaVinculadas.push(item);
      continue;
    }
    if (!item.proveedor_id) {
      sinProveedor.push(item);
      continue;
    }
    if (!item.productos?.bc_item_no) {
      sinCodigoBC.push(item);
      continue;
    }
    if (!grupos.has(item.proveedor_id)) grupos.set(item.proveedor_id, []);
    grupos.get(item.proveedor_id)!.push(item);
  }

  const proveedorIds = Array.from(grupos.keys());
  let proveedoresDb: any[] = [];
  if (proveedorIds.length > 0) {
    const resultado = await supabase.from('proveedores').select('id, bc_proveedor_no, nombre').in('id', proveedorIds);
    proveedoresDb = resultado.data || [];
  }
  const proveedoresPorId = new Map<string, any>(proveedoresDb.map((p: any) => [p.id, p]));

  const gruposFinal = proveedorIds.map((proveedorId) => {
    const proveedor = proveedoresPorId.get(proveedorId);
    const itemsGrupo = grupos.get(proveedorId)!;
    return {
      proveedorId,
      proveedorNombre: proveedor ? `${proveedor.bc_proveedor_no} — ${proveedor.nombre}` : proveedorId,
      proveedorBcNo: proveedor?.bc_proveedor_no,
      items: itemsGrupo.map((it) => ({
        id: it.id,
        nombre: it.productos?.nombre,
        bcItemNo: it.productos?.bc_item_no,
        cantidad: it.cantidad,
        precio: it.precio_unitario ?? it.productos?.precio ?? 0,
      })),
      subtotal: itemsGrupo.reduce(
        (s: number, it: any) => s + (it.precio_unitario ?? it.productos?.precio ?? 0) * it.cantidad,
        0
      ),
    };
  });

  return {
    numeroApp: pedido?.numero_app,
    jobNo: pedido?.proyectos?.bc_job_no || null,
    contacto: pedido?.nombre_contacto
      ? `${pedido.nombre_contacto}${pedido.telefono_contacto ? ` ${pedido.telefono_contacto}` : ''}`
      : null,
    direccion: pedido?.direcciones
      ? {
          direccion: pedido.direcciones.direccion || '',
          ciudad: pedido.direcciones.ciudad || '',
          provincia: pedido.direcciones.provincia || '',
          codigoPostal: pedido.direcciones.codigo_postal || '',
        }
      : null,
    grupos: gruposFinal,
    sinProveedor: sinProveedor.map((i) => i.productos?.nombre),
    sinCodigoBC: sinCodigoBC.map((i) => i.productos?.nombre),
    yaVinculadas: yaVinculadas.map((i) => i.productos?.nombre),
  };
}

export async function previsualizarPedidoCompraBC(pedidoId: string) {
  const supabase = createClient();
  return agruparPorProveedorParaBC(supabase, pedidoId);
}

// Nº de tarea de proyecto que se asigna a las líneas de compra cuando la obra
// la tiene definida. Si la obra no tiene esta tarea, se deja en blanco (Job_No
// igual se manda, solo Job_Task_No queda sin asignar).
const JOB_TASK_NO_FIJA = '95.01';

export async function crearPedidosCompraBC(pedidoId: string) {
  const supabase = createClient();
  const previa = await agruparPorProveedorParaBC(supabase, pedidoId);

  if (previa.grupos.length === 0) {
    return { error: 'No hay artículos listos para crear un pedido de compra (revisa proveedor y código BC).' };
  }

  const creados: { proveedor: string; documentNo: string }[] = [];
  const errores: string[] = [];

  // La obra es la misma para todo el pedido, así que la tarea solo hace falta
  // comprobarla una vez, no por cada línea.
  let jobTaskNo: string | undefined;
  if (previa.jobNo) {
    try {
      const existe = await existeTareaProyectoBC(previa.jobNo, JOB_TASK_NO_FIJA);
      if (existe) {
        jobTaskNo = JOB_TASK_NO_FIJA;
      } else {
        errores.push(
          `ℹ La obra ${previa.jobNo} no tiene la tarea ${JOB_TASK_NO_FIJA} — las líneas se crean sin Nº de tarea.`
        );
      }
    } catch (e: any) {
      errores.push(
        `⚠ No se pudo comprobar la tarea ${JOB_TASK_NO_FIJA} de la obra ${previa.jobNo} (se deja en blanco) — ${e.message}`
      );
    }
  }

  // Nº de línea de planificación disponible; se calcula una vez y se va
  // incrementando en memoria (de 10000 en 10000, como BC) para no repetir
  // la consulta ni arriesgar colisiones entre líneas creadas en el mismo lote.
  let proximoLineNo: number | null = null;
  if (previa.jobNo && jobTaskNo) {
    try {
      const maxActual = await obtenerMaxLineaPlanificacionBC(previa.jobNo, jobTaskNo);
      proximoLineNo = maxActual + 10000;
    } catch (e: any) {
      errores.push(
        `⚠ No se pudo consultar las líneas de planificación de la obra ${previa.jobNo} — no se vincularán líneas de planificación (${e.message}).`
      );
    }
  }

  for (const grupo of previa.grupos) {
    if (!grupo.proveedorBcNo) {
      errores.push(`${grupo.proveedorNombre}: falta el código de proveedor de Business Central.`);
      continue;
    }

    let cabecera;
    try {
      cabecera = await crearPedidoCompraBC({
        Buy_from_Vendor_No: grupo.proveedorBcNo,
        Your_Reference: previa.numeroApp,
        ...(previa.contacto ? { Ship_to_Name: previa.contacto } : {}),
        ...(previa.direccion
          ? {
              Ship_to_Address: previa.direccion.direccion,
              Ship_to_City: previa.direccion.ciudad,
              Ship_to_County: previa.direccion.provincia,
              Ship_to_Post_Code: previa.direccion.codigoPostal,
            }
          : {}),
      });
    } catch (e: any) {
      errores.push(`${grupo.proveedorNombre}: no se pudo crear la cabecera del pedido — ${e.message}`);
      continue;
    }

    const documentNo = cabecera.No;
    let algunaLineaFallo = false;

    for (const item of grupo.items) {
      let jobPlanningLineNo: number | undefined;

      if (previa.jobNo && jobTaskNo && proximoLineNo !== null) {
        try {
          await crearLineaPlanificacionBC({
            Job_No: previa.jobNo,
            Job_Task_No: jobTaskNo,
            Line_No: proximoLineNo,
            Line_Type: 'Budget',
            Type: 'Item',
            No: item.bcItemNo,
            Quantity: item.cantidad,
            Unit_Cost: item.precio,
            Planning_Date: new Date().toISOString().slice(0, 10),
          });
          jobPlanningLineNo = proximoLineNo;
          proximoLineNo += 10000;
        } catch (e: any) {
          errores.push(
            `${grupo.proveedorNombre}: no se pudo crear la línea de planificación para "${item.nombre}" (se crea la línea de compra sin vincular) — ${e.message}`
          );
        }
      }

      try {
        await crearLineaPedidoCompraBC({
          Document_Type: 'Order',
          Document_No: documentNo,
          Type: 'Item',
          No: item.bcItemNo,
          Quantity: item.cantidad,
          Direct_Unit_Cost: item.precio,
          ...(previa.jobNo ? { Job_No: previa.jobNo } : {}),
          ...(jobTaskNo ? { Job_Task_No: jobTaskNo } : {}),
          ...(jobPlanningLineNo ? { Job_Planning_Line_No: jobPlanningLineNo } : {}),
        });
      } catch (e: any) {
        algunaLineaFallo = true;
        errores.push(`${grupo.proveedorNombre} (pedido ${documentNo}): línea "${item.nombre}" falló — ${e.message}`);
      }
    }

    // Vinculamos en la app las líneas de este proveedor con el pedido recién creado en BC,
    // aunque alguna línea individual haya fallado (las que sí se crearon quedan trazables).
    const idsGrupo = grupo.items.map((i) => i.id);
    await supabase.from('pedido_items').update({ numero_tecmelec: documentNo }).in('id', idsGrupo);

    creados.push({ proveedor: grupo.proveedorNombre, documentNo });
    if (algunaLineaFallo) {
      errores.push(
        `⚠ El pedido ${documentNo} se creó en BC pero con líneas incompletas — revísalo directamente en Business Central.`
      );
    }
  }

  revalidatePath(`/comprador/${pedidoId}`);

  return { success: true, creados, errores };
}
