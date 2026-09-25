import { createClient } from '@/lib/supabase/server';
import SolicitudesFiltrables, { type PedidoFila } from '@/components/SolicitudesFiltrables';
import { numerosTecmelecTexto, idsEfectivos } from '@/lib/pedidos-utils';
import SincronizarTodasBCBoton from './SincronizarTodasBCBoton';

export default async function CompradorPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ids = await idsEfectivos(supabase, user!.id);

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, created_at, total_estimado, requiere_aprobacion, aprobado, estado_general, proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(numero_tecmelec)'
    )
    .in('comprador_id', ids)
    .order('created_at', { ascending: false });

  // "PDF enviado" por solicitud: Sí solo si TODOS sus Pedidos Tecmelec tienen
  // el check marcado en "Gestión de pedidos"; null si aún no tiene ninguno.
  const numerosTecmelecPorPedido = new Map<string, string[]>(
    (pedidos || []).map((p: any) => [
      p.id,
      Array.from(new Set((p.pedido_items || []).map((i: any) => i.numero_tecmelec).filter(Boolean))) as string[],
    ])
  );
  const todosLosNumeros = Array.from(new Set(Array.from(numerosTecmelecPorPedido.values()).flat()));
  const { data: marcasPdf } = todosLosNumeros.length
    ? await supabase
        .from('pedido_compra_pdf_enviado')
        .select('numero_tecmelec, pdf_enviado')
        .in('numero_tecmelec', todosLosNumeros)
    : { data: [] as { numero_tecmelec: string; pdf_enviado: boolean }[] };
  const numerosConPdfEnviado = new Set(
    (marcasPdf || []).filter((m: any) => m.pdf_enviado).map((m: any) => m.numero_tecmelec as string)
  );

  const filas: PedidoFila[] = (pedidos || []).map((p: any) => ({
    id: p.id,
    numero_app: p.numero_app,
    numero_tecmelec: numerosTecmelecTexto(p.pedido_items),
    nro_obra: p.proyectos?.bc_job_no || '',
    nombre_obra: p.proyectos?.descripcion || '',
    solicitante: p.profiles?.nombre_completo || '—',
    total_estimado: p.total_estimado || 0,
    requiere_aprobacion: p.requiere_aprobacion,
    aprobado: p.aprobado,
    estado: p.estado_general || null,
    pdf_enviado: (() => {
      const numeros = numerosTecmelecPorPedido.get(p.id) || [];
      if (numeros.length === 0) return null;
      return numeros.every((n) => numerosConPdfEnviado.has(n));
    })(),
    created_at: p.created_at,
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitudes por comprar</h1>
      <p className="text-slate text-sm mb-6">Pedidos de los usuarios que tienes asignados.</p>

      <SincronizarTodasBCBoton />

      {filas.length === 0 ? (
        <p className="text-slate text-sm">No tienes solicitudes pendientes.</p>
      ) : (
        <SolicitudesFiltrables pedidos={filas} linkBase="/comprador" mostrarPdfEnviado />
      )}
    </div>
  );
}
