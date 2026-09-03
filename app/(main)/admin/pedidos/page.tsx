import { createClient } from '@/lib/supabase/server';
import SolicitudesFiltrables, { type PedidoFila } from '@/components/SolicitudesFiltrables';

export default async function TodasLasSolicitudesPage() {
  const supabase = createClient();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, numero_tecmelec, created_at, total_estimado, requiere_aprobacion, aprobado, estados_pedido(nombre), profiles!pedidos_usuario_id_fkey(nombre_completo), comprador:profiles!pedidos_comprador_id_fkey(nombre_completo)'
    )
    .order('created_at', { ascending: false });

  const filas: PedidoFila[] = (pedidos || []).map((p: any) => ({
    id: p.id,
    numero_app: p.numero_app,
    numero_tecmelec: p.numero_tecmelec,
    solicitante: p.profiles?.nombre_completo || '—',
    comprador: p.comprador?.nombre_completo || '—',
    total_estimado: p.total_estimado || 0,
    requiere_aprobacion: p.requiere_aprobacion,
    aprobado: p.aprobado,
    estado: p.estados_pedido?.nombre || null,
    created_at: p.created_at,
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Todas las solicitudes</h1>
      <p className="text-slate text-sm mb-6">Vista completa de todas las solicitudes del sistema.</p>

      {filas.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay solicitudes registradas.</p>
      ) : (
        <SolicitudesFiltrables pedidos={filas} linkBase="/admin/pedidos" mostrarComprador />
      )}
    </div>
  );
}
