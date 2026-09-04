import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import EstadoBadge from '@/components/EstadoBadge';
import { numerosTecmelecTexto } from '@/lib/pedidos-utils';

export default async function CompradorPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, created_at, total_estimado, requiere_aprobacion, aprobado, estados_pedido(nombre), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(numero_tecmelec)'
    )
    .eq('comprador_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitudes por comprar</h1>
      <p className="text-slate text-sm mb-6">Pedidos de los usuarios que tienes asignados.</p>

      {!pedidos || pedidos.length === 0 ? (
        <p className="text-slate text-sm">No tienes solicitudes pendientes.</p>
      ) : (
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº pedido APP</th>
                <th className="px-4 py-3 font-medium">Solicitante</th>
                <th className="px-4 py-3 font-medium">Nº pedido Tecmelec</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Aprobación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {pedidos.map((p: any) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3">
                    <Link href={`/comprador/${p.id}`} className="font-mono text-acero">
                      {p.numero_app}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-grafito">{p.profiles?.nombre_completo}</td>
                  <td className="px-4 py-3 font-mono text-grafito">
                    {numerosTecmelecTexto(p.pedido_items)}
                  </td>
                  <td className="px-4 py-3 font-mono text-grafito">
                    {p.total_estimado?.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3">
                    {!p.requiere_aprobacion ? (
                      <span className="badge badge-entregado">Automática</span>
                    ) : p.aprobado === null ? (
                      <span className="badge badge-pendiente">Pendiente</span>
                    ) : p.aprobado ? (
                      <span className="badge badge-entregado">Aprobada</span>
                    ) : (
                      <span className="badge badge-cancelado">Rechazada</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={p.estados_pedido?.nombre} />
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {new Date(p.created_at).toLocaleDateString('es-CL')}
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
