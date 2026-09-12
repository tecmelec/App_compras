import { createClient } from '@/lib/supabase/server';
import LineasComprasClient, { type LineaFila } from './LineasComprasClient';
import { idsEfectivos } from '@/lib/pedidos-utils';

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

  let query = supabase
    .from('pedidos')
    .select(
      'id, numero_app, fecha_requerida, created_at, pedido_items(cantidad, numero_tecmelec, fecha_estimada_entrega, estado_recepcion, productos(nombre))'
    )
    .order('created_at', { ascending: false });

  if (perfil?.rol === 'usuario') {
    query = query.eq('usuario_id', user!.id);
  } else if (perfil?.rol === 'comprador') {
    const ids = await idsEfectivos(supabase, user!.id);
    query = query.in('comprador_id', ids);
  } else if (perfil?.rol === 'responsable') {
    const ids = await idsEfectivos(supabase, user!.id);
    query = query.or(`responsable_id.in.(${ids.join(',')}),usuario_id.eq.${user!.id}`);
  }
  // admin: sin filtro, ve todo

  const { data: pedidos } = await query;

  // Según el rol, la página de detalle del pedido vive en una ruta distinta.
  const rutaDetalle: Record<string, string> = {
    usuario: '/mis-pedidos',
    comprador: '/comprador',
    responsable: '/responsable',
    admin: '/admin/pedidos',
  };
  const base = rutaDetalle[perfil?.rol || 'usuario'] || '/mis-pedidos';

  const filas: LineaFila[] = (pedidos || []).flatMap((p: any) =>
    (p.pedido_items || []).map((item: any) => ({
      numero_app: p.numero_app,
      pedido_href: `${base}/${p.id}`,
      numero_tecmelec: item.numero_tecmelec,
      articulo: item.productos?.nombre || '—',
      cantidad: item.cantidad,
      fecha_requerida: p.fecha_requerida,
      fecha_estimada_entrega: item.fecha_estimada_entrega,
      estado_recepcion: item.estado_recepcion,
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
