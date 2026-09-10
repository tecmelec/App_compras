import { createClient } from '@/lib/supabase/server';
import { numerosTecmelecTexto } from '@/lib/pedidos-utils';
import MisPedidosClient, { type MiPedidoFila } from './MisPedidosClient';

export default async function MisPedidosPage({
  searchParams,
}: {
  searchParams: { creado?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, created_at, fecha_requerida, estado_general, requiere_aprobacion, aprobado, proyectos(bc_job_no), pedido_items(numero_tecmelec)'
    )
    .eq('usuario_id', user?.id)
    .order('created_at', { ascending: false });

  const filas: MiPedidoFila[] = (pedidos || []).map((p: any) => ({
    id: p.id,
    numero_app: p.numero_app,
    numero_tecmelec: numerosTecmelecTexto(p.pedido_items),
    nro_obra: p.proyectos?.bc_job_no || '',
    requiere_aprobacion: p.requiere_aprobacion,
    aprobado: p.aprobado,
    estado: p.estado_general || null,
    fecha_solicitud: p.created_at,
    fecha_requerida: p.fecha_requerida,
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Mis pedidos</h1>
      <p className="text-slate text-sm mb-6">Historial de tus solicitudes de materiales.</p>

      {searchParams.creado && (
        <p className="text-sm text-verde bg-[#E8F1EC] border border-[#C4DECD] rounded-md px-3 py-2 mb-4">
          Solicitud {searchParams.creado} enviada correctamente.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="text-slate text-sm">Todavía no has realizado ninguna solicitud.</p>
      ) : (
        <MisPedidosClient pedidos={filas} />
      )}
    </div>
  );
}
