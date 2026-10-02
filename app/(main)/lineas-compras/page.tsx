import { createClient } from '@/lib/supabase/server';
import LineasComprasClient, { type LineaFila } from './LineasComprasClient';
import { idsEfectivos, estadoLineaParaMostrar } from '@/lib/pedidos-utils';

export default async function LineasCompraPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user?.id)
    .single();

  // Filtro según el rol (admin y comprador ven todo).
  let idsResponsable: string[] = [];
  if (perfil?.rol === 'responsable') idsResponsable = await idsEfectivos(supabase, user!.id);

  function consulta() {
    let q = supabase
      .from('pedidos')
      .select(
        'id, numero_app, usuario_id, fecha_requerida, created_at, estado_general, aprobado, proyectos(bc_job_no, descripcion), pedido_items(cantidad, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_recepcion, estado_id, rechazada_por_aprobador, productos(nombre), proveedores(bc_proveedor_no, nombre))'
      )
      .order('created_at', { ascending: false });
    if (perfil?.rol === 'usuario') {
      q = q.eq('usuario_id', user!.id);
    } else if (perfil?.rol === 'responsable') {
      q = q.or(`responsable_id.in.(${idsResponsable.join(',')}),usuario_id.eq.${user!.id}`);
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
    usuario: '/mis-pedidos',
    comprador: '/lineas-compras', // detalle de consulta con el seguimiento de cada Pedido Tecmelec
    responsable: '/lineas-compras', // detalle de consulta con el seguimiento de cada Pedido Tecmelec
    admin: '/admin/pedidos',
  };
  const base = rutaDetalle[perfil?.rol || 'usuario'] || '/mis-pedidos';

  const filas: LineaFila[] = (pedidos || []).flatMap((p: any) =>
    (p.pedido_items || []).map((item: any) => ({
      numero_app: p.numero_app,
      // Las solicitudes propias se abren en "Mis solicitudes" (vista completa del solicitante).
      pedido_href: p.usuario_id === user!.id && perfil?.rol !== 'admin' ? `/mis-pedidos/${p.id}` : `${base}/${p.id}`,
      numero_tecmelec: item.numero_tecmelec,
      nro_proveedor: item.proveedores?.bc_proveedor_no || '',
      nombre_proveedor: item.proveedores?.nombre || '',
      articulo: item.productos?.nombre || '—',
      cantidad: item.cantidad,
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Líns. compras</h1>
      <p className="text-slate text-sm mb-6">Detalle de artículos solicitados en cada pedido.</p>

      {filas.length === 0 ? (
        <p className="text-slate text-sm">No hay líneas de compra para mostrar.</p>
      ) : (
        <LineasComprasClient filas={filas} />
      )}
    </div>
  );
}
