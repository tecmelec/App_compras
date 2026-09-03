import { createClient } from '@/lib/supabase/server';

type Fila = {
  numero_app: string;
  numero_tecmelec: string | null;
  articulo: string;
  cantidad: number;
  fecha_requerida: string | null;
  fecha_estimada_entrega: string | null;
};

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
      'numero_app, numero_tecmelec, fecha_requerida, fecha_estimada_entrega, created_at, pedido_items(cantidad, productos(nombre))'
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

  const filas: Fila[] = (pedidos || []).flatMap((p: any) =>
    (p.pedido_items || []).map((item: any) => ({
      numero_app: p.numero_app,
      numero_tecmelec: p.numero_tecmelec,
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
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº pedido APP</th>
                <th className="px-4 py-3 font-medium">Nº pedido Tecmelec</th>
                <th className="px-4 py-3 font-medium">Artículo solicitado</th>
                <th className="px-4 py-3 font-medium">Cantidad</th>
                <th className="px-4 py-3 font-medium">Fecha requerida</th>
                <th className="px-4 py-3 font-medium">Fecha estimada de entrega</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((f, idx) => (
                <tr key={idx} className="hover:bg-fondo">
                  <td className="px-4 py-3 font-mono text-acero">{f.numero_app}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.numero_tecmelec || '—'}</td>
                  <td className="px-4 py-3 text-grafito">{f.articulo}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.cantidad}</td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_requerida
                      ? new Date(f.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_estimada_entrega
                      ? new Date(f.fecha_estimada_entrega).toLocaleDateString('es-ES')
                      : 'Por definir'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
