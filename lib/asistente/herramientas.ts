import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { visibilidadLineas, puedeVerSolicitud } from '@/lib/visibilidad-lineas';
import { esMultiploDe } from '@/lib/cantidad';
import { obtenerProveedorPedidosCompraBC, obtenerUltimasComprasArticuloBC } from '@/lib/business-central';
import { buscarCatalogoBC } from '@/lib/catalogo-bc';
import { productoOcultoPorCodigo } from '@/lib/lista-foto';

// Asistente, fase 3: herramientas que el modelo puede usar. Todas consultan con los
// permisos de quien pregunta y NINGUNA modifica datos: añadir al carrito solo se propone
// y lo confirma el usuario en el chat (el carrito vive en su navegador).

export type ArticuloPropuesto = {
  producto_id: string;
  nombre: string;
  ref: string | null;
  imagen_url: string | null;
  unidad_medida: string | null;
  multiplo_compra: number;
  precio: number | null;
  cantidad: number;
  // Artículo del catálogo completo de BC (no publicado en la tienda): la solicitud
  // requiere aprobación siempre, igual que con "Crear desde artículos de BC".
  desde_bc?: boolean;
};
export type AccionAsistente = { tipo: 'carrito'; items: ArticuloPropuesto[] };

export const HERRAMIENTAS = [
  {
    name: 'buscar_articulos',
    description:
      'Busca artículos en la tienda de la app (catálogo visible) por nombre, referencia, código de BC o categoría. Devuelve hasta 10 con su id, nombre, referencia, unidad, múltiplo de compra y precio. Úsala antes de proponer nada para el carrito.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'Palabras de búsqueda, p. ej. "hilo 1,5 azul" o "GCAB0019".' } },
      required: ['texto'],
    },
  },
  {
    name: 'buscar_articulos_bc',
    description:
      'Busca en el catálogo COMPLETO de artículos de Business Central (incluye los que no están publicados en la tienda), como "Crear desde artículos de BC". Cada palabra debe aparecer en el código, la descripción, la categoría o el fabricante. Devuelve hasta 15 con código de BC, descripción, categoría, fabricante, unidad y si ya está en la tienda. Úsala cuando buscar_articulos no encuentre lo que se pide.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'Palabras de búsqueda, p. ej. "5G10", "manguera 5x10" o "RZ1 5G10".' } },
      required: ['texto'],
    },
  },
  {
    name: 'proponer_carrito',
    description:
      'Propone al usuario añadir artículos al carrito. Se le muestra una tarjeta para que revise cantidades y confirme; tú NO añades nada. Para artículos de la tienda usa producto_id (de buscar_articulos); para artículos del catálogo de BC usa codigo_bc (de buscar_articulos_bc). Respeta el múltiplo de compra.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              producto_id: { type: 'string', description: 'Id de buscar_articulos (tienda).' },
              codigo_bc: { type: 'string', description: 'Código de BC de buscar_articulos_bc (catálogo de BC).' },
              cantidad: { type: 'number' },
            },
            required: ['cantidad'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'mis_solicitudes',
    description: 'Lista las últimas solicitudes de material de quien pregunta (número APP-…, fecha, proyecto, estado y aprobación).',
    input_schema: { type: 'object', properties: { limite: { type: 'number', description: 'Máximo de solicitudes (por defecto 8).' } } },
  },
  {
    name: 'buscar_lineas_compra',
    description:
      'Busca en las líneas de compra (todas las solicitudes que quien pregunta puede ver, como en "Líns. compras") por artículo y/o proyecto (obra). Úsala para preguntas como "¿se ha pedido arena para Robledo?" o "¿cuánto se ha gastado en cinta aislante en la obra X?". Devuelve solicitud, fecha, proyecto, artículo, cantidad, pedido de compra, proveedor, fecha estimada y recepción y, si el perfil puede ver precios, precio unitario, importe y totales de todas las líneas encontradas.',
    input_schema: {
      type: 'object',
      properties: {
        articulo: { type: 'string', description: 'Palabras del artículo, p. ej. "arena" o "hilo 1,5 azul".' },
        proyecto: { type: 'string', description: 'Nº o nombre del proyecto/obra, p. ej. "robledo" o "M260123".' },
      },
    },
  },
  {
    name: 'ultimas_compras_bc',
    description:
      'Últimas compras de un artículo en Business Central (precio pagado, proveedor, fecha, pedido y proyecto). Solo para perfiles que ven precios. Necesita el código de BC del artículo (búscalo antes con buscar_articulos si hace falta).',
    input_schema: { type: 'object', properties: { codigo_bc: { type: 'string', description: 'Código de BC del artículo, p. ej. GPQM0023' } }, required: ['codigo_bc'] },
  },
  {
    name: 'detalle_solicitud',
    description:
      'Detalle de una solicitud por su número (APP-…): artículos, cantidades, pedido de compra (PC…), proveedor, fecha estimada de entrega (y si la confirmó el proveedor) y estado de recepción. Solo si quien pregunta puede verla.',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número de solicitud, p. ej. APP-2600054' } }, required: ['numero'] },
  },
];

// Catálogo completo de BC: los mismos perfiles que "Crear desde artículos de BC".
export const ROLES_CATALOGO_BC = ['admin', 'comprador', 'responsable', 'integral'];

// Herramientas que se ofrecen al modelo según el perfil.
export function herramientasParaRol(rol: string) {
  return HERRAMIENTAS.filter((h) => h.name !== 'buscar_articulos_bc' || ROLES_CATALOGO_BC.includes(rol));
}

// Precios e importes: solo para quien los ve en Líns. compras (no el perfil usuario).
const VE_PRECIOS = ['comprador', 'responsable', 'admin', 'integral'];
const redondear = (n: number) => Math.round(n * 100) / 100;

const fecha = (f: string | null | undefined) => (f ? new Date(f.length <= 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-ES') : null);

export async function ejecutarHerramienta(
  nombre: string,
  entrada: any,
  ctx: { userId: string; rol: string; acciones: AccionAsistente[] }
): Promise<any> {
  const supabase = createClient();

  if (nombre === 'buscar_articulos') {
    const texto = String(entrada?.texto || '').trim().slice(0, 100);
    if (!texto) return { error: 'Falta el texto de búsqueda.' };
    const palabras = texto
      .replace(/[%,()]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 2)
      .slice(0, 5);
    let q = supabase
      .from('productos')
      .select('id, nombre, bc_item_no, categoria, unidad_medida, multiplo_compra, precio')
      .eq('visible', true)
      .limit(10);
    for (const p of palabras) q = q.or(`nombre.ilike.%${p}%,bc_item_no.ilike.%${p}%,categoria.ilike.%${p}%,descripcion.ilike.%${p}%`);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      resultados: (data || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        ref: p.bc_item_no,
        categoria: p.categoria,
        unidad: p.unidad_medida,
        multiplo_compra: p.multiplo_compra || 1,
        precio: p.precio,
      })),
      nota:
        (data || []).length === 0
          ? ROLES_CATALOGO_BC.includes(ctx.rol)
            ? 'Sin resultados en la tienda. Busca ahora en el catálogo completo de BC con buscar_articulos_bc.'
            : 'Sin resultados. Prueba otras palabras o sugiere "Crear carrito desde foto/lista/REF.".'
          : undefined,
    };
  }

  if (nombre === 'buscar_articulos_bc') {
    if (!ROLES_CATALOGO_BC.includes(ctx.rol)) return { error: 'Tu perfil no tiene acceso al catálogo completo de BC.' };
    const texto = String(entrada?.texto || '').trim().slice(0, 100);
    if (!texto) return { error: 'Falta el texto de búsqueda.' };
    const articulos = await buscarCatalogoBC(texto, 0, 15);
    const nos = articulos.map((a) => a.no);
    const { data: enTienda } = nos.length
      ? await createAdminClient().from('productos').select('id, bc_item_no').in('bc_item_no', nos).eq('visible', true)
      : { data: [] as any[] };
    const idTienda = new Map((enTienda || []).map((p: any) => [p.bc_item_no, p.id]));
    return {
      resultados: articulos.map((a) => ({
        codigo_bc: a.no,
        descripcion: a.descripcion,
        categoria: a.categoria,
        fabricante: a.fabricante,
        unidad: a.unidad,
        en_tienda: idTienda.has(a.no),
        ...(idTienda.has(a.no) ? { producto_id: idTienda.get(a.no) } : {}),
      })),
      nota:
        articulos.length === 0
          ? 'Tampoco está en el catálogo de BC. Prueba otras palabras (p. ej. solo la sección "5G10" o el tipo de cable) o sugiere "Crear carrito desde lista/REF." o "Solicitar alta de artículos".'
          : 'Los artículos de BC que no están en la tienda hacen que la solicitud pase siempre por el aprobador. Confirma con el usuario el artículo exacto antes de proponerlo.',
    };
  }

  if (nombre === 'proponer_carrito') {
    const pedidos = (Array.isArray(entrada?.items) ? entrada.items : []).slice(0, 60);
    if (pedidos.length === 0) return { error: 'No hay artículos.' };
    const ids = pedidos.map((i: any) => String(i.producto_id || '')).filter(Boolean);
    const codigos = pedidos.map((i: any) => String(i.codigo_bc || '').trim().toUpperCase()).filter(Boolean);
    const columnas = 'id, nombre, bc_item_no, imagen_url, unidad_medida, multiplo_compra, precio';
    const { data } = ids.length ? await supabase.from('productos').select(columnas).eq('visible', true).in('id', ids) : { data: [] as any[] };
    const { data: publicadosBC } = codigos.length
      ? await supabase.from('productos').select(columnas).eq('visible', true).in('bc_item_no', codigos)
      : { data: [] as any[] };
    const porId = new Map((data || []).map((p: any) => [p.id, p]));
    const porCodigo = new Map((publicadosBC || []).map((p: any) => [p.bc_item_no, p]));
    const items: ArticuloPropuesto[] = [];
    const avisos: string[] = [];
    for (const i of pedidos) {
      let p: any = null;
      let desdeBC = false;
      const codigo = String(i.codigo_bc || '').trim().toUpperCase();
      if (i.producto_id) p = porId.get(String(i.producto_id));
      else if (codigo) {
        if (!ROLES_CATALOGO_BC.includes(ctx.rol)) {
          avisos.push(`${codigo}: tu perfil no puede pedir artículos del catálogo de BC.`);
          continue;
        }
        p = porCodigo.get(codigo);
        if (!p) {
          // No publicado en la tienda: producto oculto con los datos de su ficha de BC
          // (lo mismo que hace "Crear desde artículos de BC").
          try {
            const o = await productoOcultoPorCodigo(codigo);
            if (o) p = { id: o.id, nombre: o.nombre, bc_item_no: o.bc_item_no, imagen_url: o.imagen_url, unidad_medida: o.unidad_medida, multiplo_compra: o.multiplo_compra, precio: null };
          } catch (e: any) {
            avisos.push(`${codigo}: ${e?.message || 'no se pudo preparar'}.`);
            continue;
          }
          desdeBC = true;
        }
      }
      if (!p) {
        avisos.push(`Artículo ${i.producto_id || codigo || '?'} no encontrado.`);
        continue;
      }
      const m = p.multiplo_compra || 1;
      let cantidad = Number(i.cantidad) > 0 ? Number(i.cantidad) : m;
      if (!esMultiploDe(cantidad, m)) {
        cantidad = Math.ceil(cantidad / m) * m;
        avisos.push(`${p.nombre}: se ajusta a ${cantidad} (múltiplo de ${m}).`);
      }
      items.push({
        producto_id: p.id,
        nombre: p.nombre,
        ref: p.bc_item_no,
        imagen_url: p.imagen_url,
        unidad_medida: p.unidad_medida,
        multiplo_compra: m,
        precio: p.precio,
        cantidad,
        ...(desdeBC ? { desde_bc: true } : {}),
      });
    }
    if (items.length) ctx.acciones.push({ tipo: 'carrito', items });
    return {
      propuesto: items.length,
      avisos,
      nota:
        'Se ha mostrado una tarjeta al usuario para que confirme. No digas que ya está en el carrito.' +
        (items.some((x) => x.desde_bc) ? ' Avísale de que, al llevar artículos del catálogo de BC, la solicitud pasará por el aprobador.' : ''),
    };
  }

  if (nombre === 'mis_solicitudes') {
    const limite = Math.min(Math.max(Number(entrada?.limite) || 8, 1), 20);
    const { data, error } = await supabase
      .from('pedidos')
      .select('numero_app, created_at, fecha_requerida, estado_general, requiere_aprobacion, aprobado, proyectos(bc_job_no, descripcion), pedido_items(id)')
      .eq('usuario_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) return { error: error.message };
    return {
      solicitudes: (data || []).map((p: any) => ({
        numero: p.numero_app,
        fecha: fecha(p.created_at),
        fecha_requerida: fecha(p.fecha_requerida),
        proyecto: p.proyectos ? `${p.proyectos.bc_job_no} ${p.proyectos.descripcion || ''}`.trim() : null,
        estado: p.estado_general,
        aprobacion: !p.requiere_aprobacion ? 'automática' : p.aprobado === true ? 'aprobada' : p.aprobado === false ? 'rechazada' : 'pendiente',
        lineas: (p.pedido_items || []).length,
      })),
    };
  }

  if (nombre === 'buscar_lineas_compra') {
    const limpiar = (t: any) => String(t || '').replace(/[%,()]/g, ' ').trim().slice(0, 80);
    const articulo = limpiar(entrada?.articulo);
    const proyecto = limpiar(entrada?.proyecto);
    if (!articulo && !proyecto) return { error: 'Indica un artículo o un proyecto.' };
    const admin = createAdminClient();
    let idsProyecto: string[] | null = null;
    if (proyecto) {
      const { data: proys } = await admin
        .from('proyectos')
        .select('id')
        .or(`bc_job_no.ilike.%${proyecto}%,descripcion.ilike.%${proyecto}%`)
        .limit(50);
      idsProyecto = (proys || []).map((x: any) => x.id);
      if (idsProyecto.length === 0) return { resultados: [], nota: `No hay ningún proyecto que coincida con "${proyecto}".` };
    }
    let q = admin
      .from('pedido_items')
      .select(
        'cantidad, precio_unitario, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, rechazada_por_aprobador, productos!inner(nombre, unidad_medida, precio), proveedores(nombre), pedidos!inner(id, numero_app, created_at, usuario_id, proyecto_id, responsable_id, proyectos(bc_job_no, descripcion))'
      )
      .limit(1000);
    for (const pal of articulo.split(/\s+/).filter((x) => x.length >= 2).slice(0, 4)) q = q.ilike('productos.nombre', `%${pal}%`);
    if (idsProyecto) q = q.in('pedidos.proyecto_id', idsProyecto);
    const { data, error } = await q;
    if (error) return { error: error.message };
    let filas = (data || []) as any[];
    if (ctx.rol === 'usuario' || ctx.rol === 'responsable' || ctx.rol === 'integral') {
      const v = await visibilidadLineas(ctx.userId, ctx.rol);
      filas = filas.filter((f) => puedeVerSolicitud(v, ctx.userId, f.pedidos));
    }
    filas.sort((a, b) => String(b.pedidos?.created_at).localeCompare(String(a.pedidos?.created_at)));
    const verPrecios = VE_PRECIOS.includes(ctx.rol);
    const precioDe = (f: any) => Number(f.precio_unitario ?? f.productos?.precio ?? 0);
    const anulada = (f: any) => f.rechazada_por_aprobador || f.estado_recepcion === 'Anulado';
    let totales: any;
    if (verPrecios) {
      const validas = filas.filter((f) => !anulada(f));
      const conPedido = validas.filter((f) => f.numero_tecmelec);
      const sinPedido = validas.filter((f) => !f.numero_tecmelec);
      const suma = (xs: any[]) => redondear(xs.reduce((t, f) => t + precioDe(f) * Number(f.cantidad), 0));
      totales = {
        importe_con_pedido_de_compra_eur: suma(conPedido),
        lineas_con_pedido: conPedido.length,
        importe_sin_pedido_aun_eur: suma(sinPedido),
        lineas_sin_pedido: sinPedido.length,
        lineas_anuladas_excluidas: filas.length - validas.length,
        nota: 'Importes sin IVA = precio unitario × cantidad de todas las líneas encontradas (no solo las mostradas). "Con pedido de compra" es lo comprado; "sin pedido" es lo solicitado pendiente de comprar. Precio 0 = sin precio asignado.',
      };
    }
    return {
      total: filas.length,
      ...(totales ? { totales } : {}),
      resultados: filas.slice(0, 25).map((f) => ({
        solicitud: f.pedidos?.numero_app,
        fecha_solicitud: fecha(f.pedidos?.created_at),
        proyecto: f.pedidos?.proyectos ? `${f.pedidos.proyectos.bc_job_no} ${f.pedidos.proyectos.descripcion || ''}`.trim() : null,
        articulo: f.productos?.nombre,
        cantidad: Number(f.cantidad),
        unidad: f.productos?.unidad_medida || null,
        pedido_compra: f.numero_tecmelec || 'aún sin pedido de compra',
        proveedor: f.proveedores?.nombre || null,
        ...(verPrecios ? { precio_unitario_eur: precioDe(f), importe_eur: redondear(precioDe(f) * Number(f.cantidad)) } : {}),
        fecha_estimada_entrega: fecha(f.fecha_estimada_entrega) || 'por definir',
        confirmada_por_proveedor: !!f.fecha_estimada_entrega_confirmada_en,
        recepcion: f.rechazada_por_aprobador ? 'rechazada por el aprobador' : f.estado_recepcion || 'Pendiente de recibir',
        enlace: `/lineas-compras/${f.pedidos?.id}`,
      })),
      nota: filas.length > 25 ? `Hay ${filas.length} líneas; se muestran las 25 más recientes.` : undefined,
    };
  }

  if (nombre === 'ultimas_compras_bc') {
    if (!VE_PRECIOS.includes(ctx.rol)) return { error: 'Tu perfil no tiene acceso a los precios de compra.' };
    const codigo = String(entrada?.codigo_bc || '').trim().toUpperCase();
    if (!codigo) return { error: 'Falta el código de BC.' };
    const lineas = await obtenerUltimasComprasArticuloBC(codigo, 8);
    const cab = await obtenerProveedorPedidosCompraBC(Array.from(new Set(lineas.map((l) => l.Document_No)))).catch(() => new Map());
    return {
      compras: lineas.map((l) => {
        const c: any = (cab as Map<string, any>).get(l.Document_No);
        return {
          pedido: l.Document_No,
          fecha: fecha(c?.orderDate),
          proveedor: c?.vendorName || l.Buy_from_Vendor_Name || c?.vendorNo || null,
          cantidad: l.Quantity,
          precio_unitario_eur: l.Quantity ? redondear((l.Line_Amount / l.Quantity) * 1000) / 1000 : null,
          proyecto: l.Job_No || null,
        };
      }),
      nota: 'Precio unitario = importe de la línea sin IVA / cantidad.',
    };
  }

  if (nombre === 'detalle_solicitud') {
    const numero = String(entrada?.numero || '').trim().toUpperCase();
    if (!numero) return { error: 'Falta el número de solicitud.' };
    const admin = createAdminClient();
    const { data: p } = await admin
      .from('pedidos')
      .select(
        'id, usuario_id, proyecto_id, responsable_id, numero_app, estado_general, requiere_aprobacion, aprobado, fecha_requerida, proyectos(bc_job_no, descripcion), pedido_items(cantidad, precio_unitario, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, rechazada_por_aprobador, productos(nombre, unidad_medida, precio), proveedores(nombre))'
      )
      .eq('numero_app', numero)
      .maybeSingle();
    if (!p) return { error: `No encuentro la solicitud ${numero}.` };
    if (ctx.rol === 'usuario' || ctx.rol === 'responsable' || ctx.rol === 'integral') {
      const v = await visibilidadLineas(ctx.userId, ctx.rol);
      if (!puedeVerSolicitud(v, ctx.userId, p as any)) return { error: `No tienes acceso a la solicitud ${numero}.` };
    }
    const q: any = p;
    return {
      numero: q.numero_app,
      proyecto: q.proyectos ? `${q.proyectos.bc_job_no} ${q.proyectos.descripcion || ''}`.trim() : null,
      estado: q.estado_general,
      aprobacion: !q.requiere_aprobacion ? 'automática' : q.aprobado === true ? 'aprobada' : q.aprobado === false ? 'rechazada' : 'pendiente',
      fecha_requerida: fecha(q.fecha_requerida),
      lineas: (q.pedido_items || []).map((i: any) => ({
        articulo: i.productos?.nombre || null,
        cantidad: Number(i.cantidad),
        unidad: i.productos?.unidad_medida || null,
        pedido_compra: i.numero_tecmelec || 'aún sin pedido de compra',
        proveedor: i.proveedores?.nombre || null,
        ...(VE_PRECIOS.includes(ctx.rol)
          ? {
              precio_unitario_eur: Number(i.precio_unitario ?? i.productos?.precio ?? 0),
              importe_eur: redondear(Number(i.precio_unitario ?? i.productos?.precio ?? 0) * Number(i.cantidad)),
            }
          : {}),
        fecha_estimada_entrega: fecha(i.fecha_estimada_entrega) || 'por definir',
        confirmada_por_proveedor: !!i.fecha_estimada_entrega_confirmada_en,
        recepcion: i.rechazada_por_aprobador ? 'rechazada por el aprobador' : i.estado_recepcion || 'Pendiente de recibir',
      })),
      enlace: `/lineas-compras/${q.id}`,
    };
  }

  return { error: `Herramienta desconocida: ${nombre}` };
}
