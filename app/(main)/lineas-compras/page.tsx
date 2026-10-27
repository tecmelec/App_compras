import { textoUltimaSincronizacionBC } from '@/lib/ultima-sincronizacion';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import LineasComprasClient, { type LineaFila } from './LineasComprasClient';
import { estadoLineaParaMostrar } from '@/lib/pedidos-utils';
import { visibilidadLineas } from '@/lib/visibilidad-lineas';
import { obtenerFotosAlbaranes } from '@/lib/fotos-albaranes';

export default async function LineasCompraPage() {
  const supabase = createClient();
  const ultimaSincronizacion = await textoUltimaSincronizacionBC(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user?.id)
    .single();

  // Filtro según el rol (admin y comprador ven todo). Usuario: sus líneas y las de los
  // proyectos que tiene habilitados; responsable: las de las solicitudes que aprueba (o
  // de quien sustituye) y las suyas. A ambos el admin puede ampliarles la visibilidad a
  // proyectos concretos o a todos (Administración → Usuarios; lib/visibilidad-lineas.ts).
  // La RLS no les deja leer esas solicitudes, así que la consulta se hace con el cliente
  // admin y el filtro se aplica aquí.
  const rol = perfil?.rol;
  const restringido = rol === 'usuario' || rol === 'responsable' || rol === 'integral';
  const visibilidad = restringido ? await visibilidadLineas(user!.id, rol) : null;
  const db = restringido ? createAdminClient() : supabase;

  function consulta() {
    let q = db
      .from('pedidos')
      .select(
        'id, numero_app, usuario_id, fecha_requerida, created_at, estado_general, aprobado, proyectos(bc_job_no, descripcion), pedido_items(id, cantidad, precio_unitario, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, estado_id, rechazada_por_aprobador, productos(nombre, precio), proveedores(bc_proveedor_no, nombre))'
      )
      .order('created_at', { ascending: false });
    if (visibilidad && !visibilidad.todos) {
      const condiciones = [`usuario_id.eq.${user!.id}`];
      if (visibilidad.proyectos.length) condiciones.push(`proyecto_id.in.(${visibilidad.proyectos.join(',')})`);
      if (visibilidad.responsableIds.length) condiciones.push(`responsable_id.in.(${visibilidad.responsableIds.join(',')})`);
      q = q.or(condiciones.join(','));
    }
    return q;
  }

  // Supabase devuelve como máximo 1.000 filas por consulta: se pide por tramos.
  const pedidos: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await consulta().range(desde, desde + 999);
    pedidos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const { data: estadoAnulado } = await supabase.from('estados_pedido').select('id').ilike('nombre', 'anulado').maybeSingle();
  const idEstadoAnulado: number | null = estadoAnulado?.id ?? null;

  // Según el rol, la página de detalle del pedido vive en una ruta distinta.
  const rutaDetalle: Record<string, string> = {
    usuario: '/lineas-compras', // solicitudes de otros en sus proyectos: detalle de consulta
    comprador: '/lineas-compras', // detalle de consulta con el seguimiento de cada Pedido Tecmelec
    responsable: '/lineas-compras', // detalle de consulta con el seguimiento de cada Pedido Tecmelec
    admin: '/lineas-compras', // detalle de consulta con el seguimiento de cada Pedido Tecmelec
  };
  const base = rutaDetalle[perfil?.rol || 'usuario'] || '/mis-pedidos';

  // Comentarios del PDF (encabezado por pedido Tecmelec y por artículo): punto naranja en
  // la tabla. Se leen aparte con el cliente admin; si la migración 20261022130000 no
  // está aplicada, simplemente no hay comentarios.
  const comentariosCabecera = new Map<string, string>();
  const comentariosLinea = new Map<string, string>();
  {
    const adminCom = createAdminClient();
    const [{ data: cabs }, { data: lins }] = await Promise.all([
      adminCom.from('pedido_tecmelec_comentarios').select('numero_tecmelec, comentario'),
      adminCom.from('pedido_items').select('id, comentario_pdf').not('comentario_pdf', 'is', null).limit(5000),
    ]);
    for (const c of cabs || []) if ((c.comentario || '').trim()) comentariosCabecera.set(c.numero_tecmelec, c.comentario.trim());
    for (const l of lins || []) if (((l as any).comentario_pdf || '').trim()) comentariosLinea.set((l as any).id, (l as any).comentario_pdf.trim());
  }

  const filas: LineaFila[] = (pedidos || []).flatMap((p: any) =>
    (p.pedido_items || []).map((item: any) => ({
      numero_app: p.numero_app,
      // Las solicitudes propias se abren en "Mis solicitudes" (vista completa del solicitante).
      pedido_href: p.usuario_id === user!.id ? `/mis-pedidos/${p.id}` : `${base}/${p.id}`,
      numero_tecmelec: item.numero_tecmelec,
      comentario_cabecera: (item.numero_tecmelec && comentariosCabecera.get(item.numero_tecmelec)) || null,
      comentario_linea: comentariosLinea.get(item.id) || null,
      nro_proveedor: item.proveedores?.bc_proveedor_no || '',
      nombre_proveedor: item.proveedores?.nombre || '',
      articulo: item.productos?.nombre || '—',
      cantidad: item.cantidad,
      ...(() => {
        const precio = item.precio_unitario ?? item.productos?.precio ?? null;
        return {
          precio_unitario: precio != null ? Number(precio) : null,
          importe: precio != null ? Math.round(Number(precio) * item.cantidad * 100) / 100 : null,
        };
      })(),
      nro_obra: p.proyectos?.bc_job_no || '',
      nombre_obra: p.proyectos?.descripcion || '',
      fecha_requerida: p.fecha_requerida,
      fecha_estimada_entrega: item.fecha_estimada_entrega,
      fecha_confirmada_en: item.fecha_estimada_entrega_confirmada_en || null,
      // "Anulado" si la línea la rechazó el aprobador, la anuló el comprador o se anuló/rechazó la solicitud.
      estado_recepcion: estadoLineaParaMostrar(item, {
        idEstadoAnulado,
        pedidoAnulado: p.estado_general === 'Anulado' || p.aprobado === false,
      }),
    }))
  );

  // Fotos de albaranes (Alb. Tecmelec) de los Pedidos Tecmelec que aparecen en la tabla.
  const fotosPorPedido = await obtenerFotosAlbaranes(filas.map((f) => f.numero_tecmelec || ''));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Líns. compras</h1>
      <p className="text-slate text-sm">Detalle de artículos solicitados en cada pedido.</p>
      {ultimaSincronizacion ? (
        <p className="text-xs text-slate/70 mt-1 mb-6">{ultimaSincronizacion}</p>
      ) : (
        <div className="mb-6" />
      )}

      {filas.length === 0 ? (
        <p className="text-slate text-sm">No hay líneas de compra para mostrar.</p>
      ) : (
        <LineasComprasClient
          filas={filas}
          fotosPorPedido={fotosPorPedido}
          mostrarPrecios={['comprador', 'responsable', 'admin', 'integral'].includes(perfil?.rol || '')}
        />
      )}
    </div>
  );
}
