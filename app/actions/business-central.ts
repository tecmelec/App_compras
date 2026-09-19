'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';
import {
  obtenerItemsComunesBC,
  obtenerProyectosBC,
  obtenerProveedoresBC,
  obtenerPedidosCompraBC,
  obtenerLineasPedidoCompraBC,
  obtenerCrudoBC,
  obtenerCrudoBCFiltrado,
  crearPedidoCompraBC,
  crearLineaPedidoCompraBC,
  existeTareaProyectoBC,
  obtenerMaxLineaPlanificacionBC,
  crearLineaPlanificacionBC,
  obtenerCompaniaEstandarBC,
  obtenerCrudoEstandarBC,
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
//
// Importante: una misma solicitud puede tener VARIOS pedidos de compra en BC
// (uno por proveedor, todos con la misma Your_Reference = numeroApp). Por eso
// se recorren TODOS con obtenerPedidosCompraBC (antes solo se cogía el primero
// con obtenerPedidoCompraBC, y se sobrescribía el numero_tecmelec de TODAS las
// líneas de la solicitud con ese único pedido, mezclando en un solo grupo lo
// que en realidad eran pedidos de compra distintos). Cada pedido de compra BC
// solo actualiza las líneas de pedido_items que YA tienen asignado ese mismo
// numero_tecmelec (asignado al crear el pedido de compra en BC, ver
// crearPedidosCompraBC más abajo) — nunca se reasigna el numero_tecmelec aquí.
async function sincronizarPedidoConBCInterno(supabase: any, pedidoId: string, numeroApp: string) {
  let pedidosBC;
  try {
    pedidosBC = await obtenerPedidosCompraBC(numeroApp);
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  if (!pedidosBC || pedidosBC.length === 0) {
    return {
      error: `No se encontró en Business Central ningún pedido de compra con "Su Referencia" = ${numeroApp}.`,
      sinCambios: true,
    };
  }

  const { data: estados } = await supabase.from('estados_pedido').select('id, nombre, orden');

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, numero_tecmelec, estado_id, estado_recepcion, cantidad, productos(bc_item_no)')
    .eq('pedido_id', pedidoId);

  let actualizados = 0;
  const avisos: string[] = [];
  const numerosTecmelec: string[] = [];

  for (const pedidoBC of pedidosBC) {
    numerosTecmelec.push(pedidoBC.No);

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

    // Solo las líneas de esta solicitud que ya pertenecen a ESTE pedido de
    // compra concreto — así, si hay varios (uno por proveedor), cada uno
    // actualiza únicamente lo suyo.
    const itemsDeEstePedido = (items || []).filter((item: any) => item.numero_tecmelec === pedidoBC.No);

    for (const item of itemsDeEstePedido) {
      const cambios: Record<string, any> = {};
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

      if (Object.keys(cambios).length > 0) {
        const { error } = await supabase.from('pedido_items').update(cambios).eq('id', item.id);
        if (error) avisos.push(error.message);
        else actualizados++;
      }
    }

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

  return { success: true, numeroTecmelec: numerosTecmelec.join(', '), actualizados, avisos };
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

// Un pedido sigue "abierto" para la sincronización incremental mientras le
// quede algo por tramitar (estado_general) O algo por recibir (estado_recepcion
// de alguna línea). Antes solo se miraba estado_general, así que en cuanto
// todas las líneas quedaban "lanzadas" (Tramitado) el pedido dejaba de
// repasarse — aunque la recepción de mercancía siguiera pendiente, y por eso
// solo se actualizaba entrando al detalle y sincronizando a mano.
async function pedidosAbiertosDe(supabase: any, filtro?: (q: any) => any) {
  let query = supabase
    .from('pedidos')
    .select('id, numero_app, pedido_items(estado_recepcion)')
    .neq('estado_general', 'Anulado');

  if (filtro) query = filtro(query);

  const { data: candidatos } = await query;

  return (candidatos || []).filter((p: any) =>
    (p.pedido_items || []).some(
      (it: any) => it.estado_recepcion !== 'Recibido' && it.estado_recepcion !== 'Anulado'
    )
  );
}

// Cron horario (ver /app/api/cron/sincronizar-pedidos-bc): carga incremental,
// solo repasa pedidos que aún no están cerrados en la app (evita golpear la
// API de BC por cada pedido histórico ya anulado o completamente recibido).
export async function sincronizarPedidosAbiertosConBC() {
  const supabase = createAdminClient();

  const pedidos = await pedidosAbiertosDe(supabase);

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

  const idsFiltro = perfil?.rol !== 'admin' ? await idsEfectivos(supabase, user.id) : null;

  const pedidos = await pedidosAbiertosDe(supabase, idsFiltro ? (q: any) => q.in('comprador_id', idsFiltro) : undefined);

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

// Diagnóstico temporal: campos crudos de un proveedor concreto, en sus tres
// fuentes (ficha "Prov" ya usada, ficha completa y cuenta bancaria), para ver
// cómo se llaman exactamente el IBAN y la forma de pago.
export async function depurarProveedorBC(bcProveedorNo: string) {
  await requireAdmin();

  try {
    const filtroNo = `No eq '${bcProveedorNo.replace(/'/g, "''")}'`;
    const filtroVendorNo = `Vendor_No eq '${bcProveedorNo.replace(/'/g, "''")}'`;

    const [prov, fichaProveedor, bancoProveedor] = await Promise.all([
      obtenerCrudoBCFiltrado(process.env.BC_ODATA_SERVICE_PROVEEDORES!, filtroNo),
      obtenerCrudoBCFiltrado(process.env.BC_ODATA_SERVICE_FICHA_PROVEEDOR!, filtroNo),
      obtenerCrudoBCFiltrado(process.env.BC_ODATA_SERVICE_BANCO_PROVEEDOR!, filtroVendorNo),
    ]);

    return {
      success: true,
      prov: prov?.[0] || null,
      fichaProveedor: fichaProveedor?.[0] || null,
      bancoProveedor: bancoProveedor || [],
    };
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }
}

// Diagnóstico temporal: comprueba acceso a la API estándar (api/v2.0) y
// muestra un registro real de jobPlanningLines, para ver sus nombres de
// campo exactos antes de intentar crear uno.
export async function depurarAPIEstandarBC() {
  await requireAdmin();

  try {
    const compania = await obtenerCompaniaEstandarBC(process.env.BC_COMPANY_NAME!);
    if (!compania) {
      return { error: 'La API estándar respondió pero no se encontró ninguna compañía.' };
    }

    const lineas = await obtenerCrudoEstandarBC(compania.id, 'jobPlanningLines');
    return {
      success: true,
      compania,
      total: lineas?.length || 0,
      primeraLinea: lineas?.[0] || null,
    };
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con la API estándar de Business Central.' };
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

// Reparación puntual del bug "mezcla de proveedores al sincronizar": antes,
// sincronizarPedidoConBCInterno cogía solo el PRIMER pedido de compra BC de la
// solicitud y sobrescribía el numero_tecmelec de TODAS sus líneas con ese único
// valor, aunque la solicitud tuviera varios pedidos de compra (uno por
// proveedor). Esta función revisa todas las solicitudes que ya tienen líneas
// vinculadas a BC, y para aquellas con más de un pedido de compra en BC,
// vuelve a repartir cada línea a su pedido de compra correcto cruzando por
// artículo BC (bc_item_no) + cantidad exacta. Si una línea coincide con más de
// un pedido de compra (o con ninguno), NO se toca — se reporta para revisión
// manual en vez de adivinar.
export async function repararSolicitudesMultiProveedorBC() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: itemsConPedidoBC } = await supabase
    .from('pedido_items')
    .select('pedido_id')
    .not('numero_tecmelec', 'is', null);

  const idsPedidos = Array.from(new Set((itemsConPedidoBC || []).map((i: any) => i.pedido_id)));
  if (idsPedidos.length === 0) return { revisadas: 0, resumen: [] };

  const { data: pedidos } = await supabase.from('pedidos').select('id, numero_app').in('id', idsPedidos);

  const resumen: {
    numeroApp: string;
    pedidosCompra: string[];
    lineasCorregidas: number;
    sinCoincidenciaClara: string[];
  }[] = [];

  for (const pedido of pedidos || []) {
    let pedidosBC;
    try {
      pedidosBC = await obtenerPedidosCompraBC(pedido.numero_app);
    } catch {
      continue; // fallo de conexión puntual: no se toca, se puede reintentar más tarde
    }

    if (!pedidosBC || pedidosBC.length < 2) continue; // nada que reparar

    const lineasPorPO = new Map<string, { No: string; Quantity: number }[]>();
    for (const po of pedidosBC) {
      try {
        lineasPorPO.set(po.No, await obtenerLineasPedidoCompraBC(po.No));
      } catch {
        lineasPorPO.set(po.No, []);
      }
    }

    const vendorNos = Array.from(new Set(pedidosBC.map((p) => p.Buy_from_Vendor_No).filter(Boolean)));
    const { data: proveedoresDb } =
      vendorNos.length > 0
        ? await supabase.from('proveedores').select('id, bc_proveedor_no').in('bc_proveedor_no', vendorNos)
        : { data: [] as any[] };
    const proveedorIdPorBcNo = new Map((proveedoresDb || []).map((p: any) => [p.bc_proveedor_no, p.id]));

    const { data: items } = await supabase
      .from('pedido_items')
      .select('id, cantidad, numero_tecmelec, proveedor_id, productos(bc_item_no)')
      .eq('pedido_id', pedido.id)
      .not('numero_tecmelec', 'is', null);

    let corregidas = 0;
    const sinCoincidenciaClara: string[] = [];

    for (const item of items || []) {
      const bcItemNo = (item as any).productos?.bc_item_no;
      if (!bcItemNo) continue;

      const coincidencias = pedidosBC.filter((po) =>
        (lineasPorPO.get(po.No) || []).some((l) => l.No === bcItemNo && l.Quantity === item.cantidad)
      );

      if (coincidencias.length !== 1) {
        sinCoincidenciaClara.push(`${bcItemNo} (cantidad ${item.cantidad})`);
        continue;
      }

      const poCorrecto = coincidencias[0];
      const proveedorIdCorrecto = poCorrecto.Buy_from_Vendor_No
        ? proveedorIdPorBcNo.get(poCorrecto.Buy_from_Vendor_No)
        : null;

      const necesitaNumero = item.numero_tecmelec !== poCorrecto.No;
      const necesitaProveedor = !!proveedorIdCorrecto && item.proveedor_id !== proveedorIdCorrecto;

      if (necesitaNumero || necesitaProveedor) {
        await supabase
          .from('pedido_items')
          .update({
            numero_tecmelec: poCorrecto.No,
            ...(proveedorIdCorrecto ? { proveedor_id: proveedorIdCorrecto } : {}),
          })
          .eq('id', item.id);
        corregidas++;
      }
    }

    if (corregidas > 0 || sinCoincidenciaClara.length > 0) {
      await recalcularEstadoGeneral(supabase, pedido.id);
      resumen.push({
        numeroApp: pedido.numero_app,
        pedidosCompra: pedidosBC.map((p) => p.No),
        lineasCorregidas: corregidas,
        sinCoincidenciaClara,
      });
    }
  }

  return { revisadas: pedidos?.length || 0, resumen };
}

// Diagnóstico temporal: para una solicitud dada, muestra TODOS sus pedidos de
// compra en BC (No, proveedor, estado) y las líneas crudas de cada uno — para
// investigar por qué repararSolicitudesMultiProveedorBC no encuentra una
// coincidencia clara (0 o más de 1 línea con el mismo artículo+cantidad).
export async function depurarLineasSolicitudBC(numeroApp: string) {
  await requireAdmin();

  const pedidosBC = await obtenerPedidosCompraBC(numeroApp);
  const detalle = [];
  for (const po of pedidosBC) {
    let lineas: any[] = [];
    let error: string | null = null;
    try {
      lineas = await obtenerLineasPedidoCompraBC(po.No);
    } catch (e: any) {
      error = e.message || 'Error obteniendo líneas.';
    }
    detalle.push({
      documentNo: po.No,
      vendor: po.Buy_from_Vendor_No,
      status: po.Status,
      lineas,
      error,
    });
  }

  return { pedidosBC, detalle };
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

    // Vinculamos las líneas de este proveedor al pedido de BC INMEDIATAMENTE
    // tras crear la cabecera, antes de crear las líneas una a una. Así, si el
    // proceso se interrumpe a mitad (tiempo de espera agotado, caída de red,
    // etc.), la app ya sabe que estos artículos pertenecen a este pedido de
    // compra concreto — y un reintento del comprador (al ver que "no pasó
    // nada") los encuentra como "ya vinculados" en vez de volver a crear un
    // pedido de compra duplicado en BC para los mismos artículos. Antes esto
    // se hacía al final del bucle de líneas, lo que dejaba una ventana en la
    // que un fallo a mitad de proceso generaba pedidos de compra huérfanos o
    // duplicados en BC (cabeceras vacías o con líneas repetidas).
    const idsGrupo = grupo.items.map((i) => i.id);
    await supabase.from('pedido_items').update({ numero_tecmelec: documentNo }).in('id', idsGrupo);

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
