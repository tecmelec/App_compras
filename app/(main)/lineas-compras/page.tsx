import { createClient } from '@/lib/supabase/server';
import LineasComprasClient, { type LineaFila } from './LineasComprasClient';

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
      'numero_app, fecha_requerida, fecha_estimada_entrega, created_at, pedido_items(cantidad, numero_tecmelec, productos(nombre))'
    )
    .order('created_at', { ascending: false });

  if (perfil?.rol === 'usuario') {
    query = query.eq('usuario_id', user!.id);
  } else if (perfil?.rol === 'comprador') {
    query = query.eq('comprador_id', user!.id);
  } else if (perfil?.rol === 'responsable') {
    query = query.or(`responsable_id.eq.${user!.id},usuario_id.eq.${user!.id}`);
  }
  // admin: sin filtro, ve todo

  const { data: pedidos } = await query;

  const filas: LineaFila[] = (pedidos || []).flatMap((p: any) =>
    (p.pedido_items || []).map((item: any) => ({
      numero_app: p.numero_app,
      numero_tecmelec: item.numero_tecmelec,
      articulo: item.productos?.nombre || '—',
      cantidad: item.cantidad,
      fecha_requerida: p.fecha_requerida,
      fecha_estimada_entrega: p.fecha_estimada_entrega,
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
