import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { visibilidadLineas, puedeVerSolicitud } from '@/lib/visibilidad-lineas';
import { esMultiploDe } from '@/lib/cantidad';

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
    name: 'proponer_carrito',
    description:
      'Propone al usuario añadir artículos al carrito. Se le muestra una tarjeta para que revise cantidades y confirme; tú NO añades nada. Usa solo ids devueltos por buscar_articulos y respeta el múltiplo de compra.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { producto_id: { type: 'string' }, cantidad: { type: 'number' } },
            required: ['producto_id', 'cantidad'],
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
      'Busca en las líneas de compra (todas las solicitudes que quien pregunta puede ver, como en "Líns. compras") por artículo y/o proyecto (obra). Úsala para preguntas como "¿se ha pedido arena para Robledo?". Devuelve solicitud, fecha, proyecto, artículo, cantidad, pedido de compra, proveedor, fecha estimada y recepción.',
    input_schema: {
      type: 'object',
      properties: {
        articulo: { type: 'string', description: 'Palabras del artículo, p. ej. "arena" o "hilo 1,5 azul".' },
        proyecto: { type: 'string', description: 'Nº o nombre del proyecto/obra, p. ej. "robledo" o "M260123".' },
      },
    },
  },
  {
    name: 'detalle_solicitud',
    description:
      'Detalle de una solicitud por su número (APP-…): artículos, cantidades, pedido de compra (PC…), proveedor, fecha estimada de entrega (y si la confirmó el proveedor) y estado de recepción. Solo si quien pregunta puede verla.',
    input_schema: { type: 'object', properties: { numero: { type: 'string', description: 'Número de solicitud, p. ej. APP-2600054' } }, required: ['numero'] },
  },
];

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
      nota: (data || []).length === 0 ? 'Sin resultados. Prueba otras palabras o sugiere "Crear carrito desde foto/lista/REF.".' : undefined,
    };
  }

  if (nombre === 'proponer_carrito') {
    const pedidos = (Array.isArray(entrada?.items) ? entrada.items : []).slice(0, 20);
    if (pedidos.length === 0) return { error: 'No hay artículos.' };
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, bc_item_no, imagen_url, unidad_medida, multiplo_compra, precio')
      .eq('visible', true)
      .in(
        'id',
        pedidos.map((i: any) => String(i.producto_id))
      );
    const porId = new Map((data || []).map((p: any) => [p.id, p]));
    const items: ArticuloPropuesto[] = [];
    const avisos: string[] = [];
    for (const i of pedidos) {
      const p: any = porId.get(String(i.producto_id));
      if (!p) {
        avisos.push(`Artículo ${i.producto_id} no encontrado en la tienda.`);
        continue;
      }
      const m = p.multiplo_compra || 1;
      let cantidad = Number(i.cantidad) > 0 ? Number(i.cantidad) : m;
      if (!esMultiploDe(cantidad, m)) {
        cantidad = Math.ceil(cantidad / m) * m;
        avisos.push(`${p.nombre}: se ajusta a ${cantidad} (múltiplo de ${m}).`);
      }
      items.push({ producto_id: p.id, nombre: p.nombre, ref: p.bc_item_no, imagen_url: p.imagen_url, unidad_medida: p.unidad_medida, multiplo_compra: m, precio: p.precio, cantidad });
    }
    if (items.length) ctx.acciones.push({ tipo: 'carrito', items });
    return { propuesto: items.length, avisos, nota: 'Se ha mostrado una tarjeta al usuario para que confirme. No digas que ya está en el carrito.' };
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
        'cantidad, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, rechazada_por_aprobador, productos!inner(nombre, unidad_medida), proveedores(nombre), pedidos!inner(id, numero_app, created_at, usuario_id, proyecto_id, responsable_id, proyectos(bc_job_no, descripcion))'
      )
      .limit(300);
    for (const pal of articulo.split(/\s+/).filter((x) => x.length >= 2).slice(0, 4)) q = q.ilike('productos.nombre', `%${pal}%`);
    if (idsProyecto) q = q.in('pedidos.proyecto_id', idsProyecto);
    const { data, error } = await q;
    if (error) return { error: error.message };
    let filas = (data || []) as any[];
    if (ctx.rol === 'usuario' || ctx.rol === 'responsable') {
      const v = await visibilidadLineas(ctx.userId, ctx.rol);
      filas = filas.filter((f) => puedeVerSolicitud(v, ctx.userId, f.pedidos));
    }
    filas.sort((a, b) => String(b.pedidos?.created_at).localeCompare(String(a.pedidos?.created_at)));
    return {
      total: filas.length,
      resultados: filas.slice(0, 25).map((f) => ({
        solicitud: f.pedidos?.numero_app,
        fecha_solicitud: fecha(f.pedidos?.created_at),
        proyecto: f.pedidos?.proyectos ? `${f.pedidos.proyectos.bc_job_no} ${f.pedidos.proyectos.descripcion || ''}`.trim() : null,
        articulo: f.productos?.nombre,
        cantidad: Number(f.cantidad),
        unidad: f.productos?.unidad_medida || null,
        pedido_compra: f.numero_tecmelec || 'aún sin pedido de compra',
        proveedor: f.proveedores?.nombre || null,
        fecha_estimada_entrega: fecha(f.fecha_estimada_entrega) || 'por definir',
        confirmada_por_proveedor: !!f.fecha_estimada_entrega_confirmada_en,
        recepcion: f.rechazada_por_aprobador ? 'rechazada por el aprobador' : f.estado_recepcion || 'Pendiente de recibir',
        enlace: `/lineas-compras/${f.pedidos?.id}`,
      })),
      nota: filas.length > 25 ? `Hay ${filas.length} líneas; se muestran las 25 más recientes.` : undefined,
    };
  }

  if (nombre === 'detalle_solicitud') {
    const numero = String(entrada?.numero || '').trim().toUpperCase();
    if (!numero) return { error: 'Falta el número de solicitud.' };
    const admin = createAdminClient();
    const { data: p } = await admin
      .from('pedidos')
      .select(
        'id, usuario_id, proyecto_id, responsable_id, numero_app, estado_general, requiere_aprobacion, aprobado, fecha_requerida, proyectos(bc_job_no, descripcion), pedido_items(cantidad, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, rechazada_por_aprobador, productos(nombre, unidad_medida), proveedores(nombre))'
      )
      .eq('numero_app', numero)
      .maybeSingle();
    if (!p) return { error: `No encuentro la solicitud ${numero}.` };
    if (ctx.rol === 'usuario' || ctx.rol === 'responsable') {
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
        fecha_estimada_entrega: fecha(i.fecha_estimada_entrega) || 'por definir',
        confirmada_por_proveedor: !!i.fecha_estimada_entrega_confirmada_en,
        recepcion: i.rechazada_por_aprobador ? 'rechazada por el aprobador' : i.estado_recepcion || 'Pendiente de recibir',
      })),
      enlace: `/lineas-compras/${q.id}`,
    };
  }

  return { error: `Herramienta desconocida: ${nombre}` };
}
