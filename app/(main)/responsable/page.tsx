import { createClient } from '@/lib/supabase/server';
import SolicitudesFiltrables, { type PedidoFila } from '@/components/SolicitudesFiltrables';
import { numerosTecmelecTexto } from '@/lib/pedidos-utils';

export default async function ResponsablePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, created_at, total_estimado, requiere_aprobacion, aprobado, estados_pedido(nombre), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(numero_tecmelec)'
    )
    .eq('responsable_id', user?.id)
    .order('created_at', { ascending: false });

  const filas: PedidoFila[] = (pedidos || []).map((p: any) => ({
    id: p.id,
    numero_app: p.numero_app,
    numero_tecmelec: numerosTecmelecTexto(p.pedido_items),
    solicitante: p.profiles?.nombre_completo || '—',
    total_estimado: p.total_estimado || 0,
    requiere_aprobacion: p.requiere_aprobacion,
    aprobado: p.aprobado,
    estado: p.estados_pedido?.nombre || null,
    created_at: p.created_at,
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitudes de mi equipo</h1>
      <p className="text-slate text-sm mb-6">
        Las solicitudes que superan el monto de aprobación automática requieren tu aprobación.
      </p>

      {filas.length === 0 ? (
        <p className="text-slate text-sm">Tu equipo no tiene solicitudes registradas.</p>
      ) : (
        <SolicitudesFiltrables pedidos={filas} linkBase="/responsable" />
      )}
    </div>
  );
}
