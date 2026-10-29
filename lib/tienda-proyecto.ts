import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerJefeObraProyectoBC } from '@/lib/business-central';
import { redondearCantidad } from '@/lib/cantidad';

// "Tienda por proyecto" (migración 20261030120000_tienda_proyecto.sql).
// Cada obra tiene sus materiales autorizados con una cantidad máxima. El consumo de un
// artículo = cantidad inicial (lo gastado antes de la app) + lo solicitado en la app para
// ese proyecto, venga de donde venga (tienda, carrito, lista…). No cuentan las solicitudes
// rechazadas, las líneas rechazadas por el aprobador ni las anuladas.

// Perfiles que ven la pestaña "Tienda por proyecto" (de momento solo admin).
export const ROLES_TIENDA_PROYECTO = ['admin'];

export const UMBRAL_ALERTA = 0.8;

export type EstadoConsumo = 'ok' | 'alerta' | 'agotado' | 'excedido';

export type ProductoTienda = {
  id: string;
  nombre: string;
  bc_item_no: string | null;
  unidad_medida: string | null;
  multiplo_compra: number;
  imagen_url: string | null;
  visible: boolean;
};

export type ConsumoArticulo = {
  articulo_id: string;
  producto: ProductoTienda;
  cantidad_maxima: number;
  cantidad_ampliada: number;
  limite: number; // máxima + ampliaciones
  cantidad_inicial: number;
  solicitado: number; // en la app (sin anuladas ni rechazadas)
  recibido: number;
  pendiente_recibir: number;
  consumido: number; // inicial + solicitado
  disponible: number; // pendiente de solicitar (0 si se ha superado)
  excedido: number; // cuánto se ha pasado del límite
  ampliacion_pendiente: number; // exceso en solicitudes pendientes de aprobar
  porcentaje: number; // consumido / límite (0..)
  estado: EstadoConsumo;
  num_solicitudes: number;
  actualizado_en: string;
};

export type FueraPresupuesto = {
  producto: ProductoTienda;
  solicitado: number;
  recibido: number;
  pendiente_recibir: number;
  solicitudes: string[]; // números APP
};

type LineaConsumo = {
  pedido_id: string;
  numero_app: string;
  producto_id: string;
  cantidad: number;
  recibido: number;
  pendiente_aprobacion: boolean;
  ampliacion_pendiente: number;
  producto: ProductoTienda | null;
};

const COLUMNAS_PRODUCTO = 'id, nombre, bc_item_no, unidad_medida, multiplo_compra, imagen_url, visible';

function aProducto(p: any): ProductoTienda | null {
  if (!p) return null;
  return {
    id: p.id,
    nombre: p.nombre,
    bc_item_no: p.bc_item_no,
    unidad_medida: p.unidad_medida,
    multiplo_compra: p.multiplo_compra || 1,
    imagen_url: p.imagen_url,
    visible: !!p.visible,
  };
}

// Cantidad recibida de una línea: la de BC si se conoce; si no, toda si está "Recibido".
function recibidoDeLinea(l: any): number {
  const cantidad = Number(l.cantidad) || 0;
  if (l.cantidad_recibida != null) return Math.max(0, Number(l.cantidad_recibida) || 0);
  return l.estado_recepcion === 'Recibido' ? cantidad : 0;
}

// Líneas que cuentan como consumo de un proyecto (opcionalmente solo de unos productos y
// sin una solicitud concreta, p. ej. la que se está aprobando).
export async function lineasConsumoProyecto(
  proyectoId: string,
  opciones: { productoIds?: string[]; excluirPedidoId?: string | null } = {}
): Promise<LineaConsumo[]> {
  const admin = createAdminClient();
  if (opciones.productoIds && opciones.productoIds.length === 0) return [];
  const resultado: LineaConsumo[] = [];
  const TAM = 1000;
  for (let desde = 0; ; desde += TAM) {
    let q = admin
      .from('pedido_items')
      .select(`*, pedidos!inner(id, numero_app, proyecto_id, aprobado, requiere_aprobacion), productos(${COLUMNAS_PRODUCTO})`)
      .eq('pedidos.proyecto_id', proyectoId)
      .order('id')
      .range(desde, desde + TAM - 1);
    if (opciones.productoIds) q = q.in('producto_id', opciones.productoIds);
    const { data, error } = await q;
    if (error) throw new Error(`No se pudo leer el consumo del proyecto: ${error.message}`);
    for (const l of (data || []) as any[]) {
      const pedido = l.pedidos;
      if (!pedido || pedido.aprobado === false) continue;
      if (opciones.excluirPedidoId && pedido.id === opciones.excluirPedidoId) continue;
      if (l.rechazada_por_aprobador || l.estado_recepcion === 'Anulado') continue;
      const cantidad = Number(l.cantidad) || 0;
      if (cantidad <= 0) continue;
      resultado.push({
        pedido_id: pedido.id,
        numero_app: pedido.numero_app,
        producto_id: l.producto_id,
        cantidad,
        recibido: recibidoDeLinea(l),
        pendiente_aprobacion: !!pedido.requiere_aprobacion && pedido.aprobado == null,
        ampliacion_pendiente: Number(l.ampliacion_tienda_pendiente) || 0,
        producto: aProducto(l.productos),
      });
    }
    if (!data || data.length < TAM) break;
  }
  return resultado;
}

function estadoDe(limite: number, consumido: number): EstadoConsumo {
  if (consumido > limite + 1e-9) return 'excedido';
  if (consumido >= limite - 1e-9) return 'agotado';
  if (limite > 0 && consumido / limite >= UMBRAL_ALERTA) return 'alerta';
  return 'ok';
}

export async function consumosProyecto(proyectoId: string): Promise<{
  articulos: ConsumoArticulo[];
  fuera: FueraPresupuesto[];
}> {
  const admin = createAdminClient();
  const [{ data: arts, error }, lineas] = await Promise.all([
    admin
      .from('tienda_proyecto_articulos')
      .select(`*, productos(${COLUMNAS_PRODUCTO})`)
      .eq('proyecto_id', proyectoId),
    lineasConsumoProyecto(proyectoId),
  ]);
  if (error) throw new Error(`No se pudo leer la tienda del proyecto: ${error.message}`);

  const porProducto = new Map<string, LineaConsumo[]>();
  for (const l of lineas) {
    const lista = porProducto.get(l.producto_id) || [];
    lista.push(l);
    porProducto.set(l.producto_id, lista);
  }

  const articulos: ConsumoArticulo[] = (arts || [])
    .filter((a: any) => a.productos)
    .map((a: any) => {
      const ls = porProducto.get(a.producto_id) || [];
      const solicitado = redondearCantidad(ls.reduce((s, l) => s + l.cantidad, 0));
      const recibido = redondearCantidad(ls.reduce((s, l) => s + Math.min(l.recibido, l.cantidad), 0));
      const maxima = Number(a.cantidad_maxima) || 0;
      const ampliada = Number(a.cantidad_ampliada) || 0;
      const inicial = Number(a.cantidad_inicial) || 0;
      const limite = redondearCantidad(maxima + ampliada);
      const consumido = redondearCantidad(inicial + solicitado);
      const resto = redondearCantidad(limite - consumido);
      return {
        articulo_id: a.id,
        producto: aProducto(a.productos)!,
        cantidad_maxima: maxima,
        cantidad_ampliada: ampliada,
        limite,
        cantidad_inicial: inicial,
        solicitado,
        recibido,
        pendiente_recibir: redondearCantidad(Math.max(0, solicitado - recibido)),
        consumido,
        disponible: Math.max(0, resto),
        excedido: Math.max(0, -resto),
        ampliacion_pendiente: redondearCantidad(
          ls.filter((l) => l.pendiente_aprobacion).reduce((s, l) => s + l.ampliacion_pendiente, 0)
        ),
        porcentaje: limite > 0 ? consumido / limite : 1,
        estado: estadoDe(limite, consumido),
        num_solicitudes: new Set(ls.map((l) => l.pedido_id)).size,
        actualizado_en: a.updated_at,
      };
    })
    .sort((x: ConsumoArticulo, y: ConsumoArticulo) => x.producto.nombre.localeCompare(y.producto.nombre));

  const enTienda = new Set((arts || []).map((a: any) => a.producto_id));
  const fueraMap = new Map<string, FueraPresupuesto>();
  for (const l of lineas) {
    if (enTienda.has(l.producto_id) || !l.producto) continue;
    const f = fueraMap.get(l.producto_id) || {
      producto: l.producto,
      solicitado: 0,
      recibido: 0,
      pendiente_recibir: 0,
      solicitudes: [],
    };
    f.solicitado = redondearCantidad(f.solicitado + l.cantidad);
    f.recibido = redondearCantidad(f.recibido + Math.min(l.recibido, l.cantidad));
    f.pendiente_recibir = redondearCantidad(Math.max(0, f.solicitado - f.recibido));
    if (!f.solicitudes.includes(l.numero_app)) f.solicitudes.push(l.numero_app);
    fueraMap.set(l.producto_id, f);
  }
  const fuera = Array.from(fueraMap.values()).sort((x, y) => x.producto.nombre.localeCompare(y.producto.nombre));
  return { articulos, fuera };
}

// --- Comprobación de límites al pedir --------------------------------------------------


export type DisponibilidadTienda = {
  producto_id: string;
  articulo_id: string;
  nombre: string;
  unidad: string;
  limite: number;
  consumido_otros: number; // inicial + otras solicitudes
  disponible: number;
};

// Lo que queda por solicitar de cada artículo de la tienda del proyecto (sin contar una
// solicitud concreta, p. ej. la que se está aprobando). Solo los productos que estén en
// la tienda del proyecto.
export async function disponibilidadTienda(
  proyectoId: string,
  productoIds: string[],
  excluirPedidoId?: string | null
): Promise<Map<string, DisponibilidadTienda>> {
  const mapa = new Map<string, DisponibilidadTienda>();
  const ids = Array.from(new Set(productoIds.filter(Boolean)));
  if (!proyectoId || ids.length === 0) return mapa;
  const admin = createAdminClient();
  const { data: arts, error } = await admin
    .from('tienda_proyecto_articulos')
    .select('id, producto_id, cantidad_maxima, cantidad_ampliada, cantidad_inicial, productos(nombre, unidad_medida)')
    .eq('proyecto_id', proyectoId)
    .in('producto_id', ids);
  if (error) {
    // Migración sin aplicar: no se bloquea nada.
    if (/tienda_proyecto/.test(error.message || '')) return mapa;
    throw new Error(`No se pudo comprobar la tienda del proyecto: ${error.message}`);
  }
  if (!arts || arts.length === 0) return mapa;
  const lineas = await lineasConsumoProyecto(proyectoId, {
    productoIds: arts.map((a: any) => a.producto_id),
    excluirPedidoId,
  });
  for (const a of arts as any[]) {
    const limite = redondearCantidad((Number(a.cantidad_maxima) || 0) + (Number(a.cantidad_ampliada) || 0));
    const otros = redondearCantidad(
      (Number(a.cantidad_inicial) || 0) +
        lineas.filter((l) => l.producto_id === a.producto_id).reduce((s, l) => s + l.cantidad, 0)
    );
    mapa.set(a.producto_id, {
      producto_id: a.producto_id,
      articulo_id: a.id,
      nombre: a.productos?.nombre || 'Artículo',
      unidad: a.productos?.unidad_medida || 'ud.',
      limite,
      consumido_otros: otros,
      disponible: Math.max(0, redondearCantidad(limite - otros)),
    });
  }
  return mapa;
}

export type ExcesoTienda = DisponibilidadTienda & {
  pedido: number; // lo que se pide ahora (suma de las líneas de ese artículo)
  exceso: number;
};

// Artículos de la tienda del proyecto que superarían su límite con estas cantidades.
export async function comprobarExcesosTienda(
  proyectoId: string,
  items: { producto_id: string; cantidad: number }[],
  excluirPedidoId?: string | null
): Promise<ExcesoTienda[]> {
  const pedidoPorProducto = new Map<string, number>();
  for (const i of items) {
    const c = Number(i.cantidad) || 0;
    if (!i.producto_id || c <= 0) continue;
    pedidoPorProducto.set(i.producto_id, (pedidoPorProducto.get(i.producto_id) || 0) + c);
  }
  const disp = await disponibilidadTienda(proyectoId, Array.from(pedidoPorProducto.keys()), excluirPedidoId);
  const excesos: ExcesoTienda[] = [];
  disp.forEach((d) => {
    const pedido = redondearCantidad(pedidoPorProducto.get(d.producto_id) || 0);
    if (pedido > d.disponible + 1e-9) excesos.push({ ...d, pedido, exceso: redondearCantidad(pedido - d.disponible) });
  });
  return excesos;
}

// ¿Puede autorizar ampliaciones de la tienda de este proyecto? Admin, o el responsable
// (o integral) que aprueba las solicitudes del proyecto: asignado como aprobador en la
// app o jefe de obra del proyecto en BC.
export async function puedeAutorizarAmpliacion(userId: string, rol: string | null | undefined, proyectoId: string): Promise<boolean> {
  if (rol === 'admin') return true;
  if (rol !== 'responsable' && rol !== 'integral') return false;
  const admin = createAdminClient();
  const { data: asignado } = await admin
    .from('proyecto_aprobadores')
    .select('usuario_id')
    .eq('proyecto_id', proyectoId)
    .eq('usuario_id', userId)
    .limit(1);
  if (asignado && asignado.length > 0) return true;
  try {
    const [{ data: proyecto }, { data: perfil }] = await Promise.all([
      admin.from('proyectos').select('bc_job_no').eq('id', proyectoId).maybeSingle(),
      admin.from('profiles').select('bc_user_id').eq('id', userId).maybeSingle(),
    ]);
    if (!proyecto?.bc_job_no || !(perfil as any)?.bc_user_id) return false;
    const jefe = await obtenerJefeObraProyectoBC(proyecto.bc_job_no);
    return !!jefe.userSecurityId && jefe.userSecurityId === (perfil as any).bc_user_id;
  } catch (e) {
    console.error('[tienda-proyecto] No se pudo comprobar el jefe de obra en BC', e);
    return false;
  }
}

// Registra una ampliación: sube el límite del artículo y lo anota en el historial.
export async function registrarAmpliacion(datos: {
  articuloId: string;
  cantidad: number;
  usuarioId: string;
  usuarioNombre: string;
  comentario?: string | null;
  pedidoId?: string | null;
  numeroApp?: string | null;
}): Promise<{ error?: string }> {
  const cantidad = redondearCantidad(Number(datos.cantidad) || 0);
  if (!(cantidad > 0)) return { error: 'La ampliación debe ser mayor que 0.' };
  const admin = createAdminClient();
  const { data: art, error: e1 } = await admin
    .from('tienda_proyecto_articulos')
    .select('cantidad_maxima, cantidad_ampliada')
    .eq('id', datos.articuloId)
    .single();
  if (e1 || !art) return { error: 'No se encontró el artículo en la tienda del proyecto.' };
  const anterior = redondearCantidad((Number(art.cantidad_maxima) || 0) + (Number(art.cantidad_ampliada) || 0));
  const { error: e2 } = await admin
    .from('tienda_proyecto_articulos')
    .update({
      cantidad_ampliada: redondearCantidad((Number(art.cantidad_ampliada) || 0) + cantidad),
      updated_at: new Date().toISOString(),
    })
    .eq('id', datos.articuloId);
  if (e2) return { error: `No se pudo guardar la ampliación: ${e2.message}` };
  const { error: e3 } = await admin.from('tienda_proyecto_historial').insert({
    articulo_id: datos.articuloId,
    tipo: 'ampliacion',
    valor_anterior: anterior,
    valor_nuevo: redondearCantidad(anterior + cantidad),
    cantidad,
    pedido_id: datos.pedidoId || null,
    numero_app: datos.numeroApp || null,
    comentario: (datos.comentario || '').trim().slice(0, 1000) || null,
    usuario_id: datos.usuarioId,
    usuario_nombre: datos.usuarioNombre,
  });
  if (e3) console.error('[tienda-proyecto] No se pudo anotar la ampliación en el historial', e3);
  return {};
}
