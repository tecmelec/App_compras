import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FormularioComprador from './FormularioComprador';

export default async function DetalleCompradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, numero_tecmelec, estado_id, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, direcciones(alias, direccion, codigo_postal, ciudad), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(cantidad, productos(nombre, precio))'
    )
    .eq('id', params.id)
    .single();

  const { data: estados } = await supabase
    .from('estados_pedido')
    .select('id, nombre')
    .order('orden');

  if (!pedido) notFound();

  return (
    <div className="p-8 max-w-2xl">
      <p className="font-mono text-sm text-acero">{pedido.numero_app}</p>
      <h1 className="text-2xl font-semibold text-grafito mb-1">
        Solicitud de {(pedido as any).profiles?.nombre_completo}
      </h1>

      <div className="bg-white border border-borde rounded-lg p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate mb-0.5">Contacto</p>
          <p className="text-grafito">
            {(pedido as any).nombre_contacto} — {(pedido as any).telefono_contacto}
          </p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Fecha requerida</p>
          <p className="text-grafito">
            {(pedido as any).fecha_requerida
              ? new Date((pedido as any).fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES')
              : '—'}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-0.5">Dirección de entrega</p>
          <p className="text-grafito">
            {(pedido as any).direcciones
              ? `${(pedido as any).direcciones.alias} — ${(pedido as any).direcciones.direccion}${(pedido as any).direcciones.codigo_postal ? ` — CP ${(pedido as any).direcciones.codigo_postal}` : ''}, ${(pedido as any).direcciones.ciudad || ''}`
              : '—'}
          </p>
        </div>
        {(pedido as any).requiere_aprobacion && (
          <div className="col-span-2">
            <p className="text-slate mb-0.5">Aprobación del responsable</p>
            <p className="text-grafito">
              {(pedido as any).aprobado === null
                ? 'Pendiente'
                : (pedido as any).aprobado
                ? 'Aprobada'
                : 'Rechazada'}
            </p>
          </div>
        )}
      </div>

      <h2 className="font-medium text-grafito mt-6 mb-3">Artículos solicitados</h2>
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-2">
        {(pedido as any).pedido_items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-4 text-sm">
            <p className="text-grafito">{item.productos.nombre}</p>
            <p className="font-mono text-slate">{item.productos.precio?.toFixed(2)} € c/u</p>
            <p className="font-mono text-grafito">x{item.cantidad}</p>
          </div>
        ))}
      </div>
      <p className="text-right font-mono text-grafito mb-6">
        Total: <strong>{(pedido as any).total_estimado?.toFixed(2)} €</strong>
      </p>

      <FormularioComprador
        pedidoId={pedido.id}
        numeroTecmelec={pedido.numero_tecmelec || ''}
        estadoId={pedido.estado_id}
        fechaEstimada={pedido.fecha_estimada_entrega || ''}
        estados={estados || []}
      />
    </div>
  );
}
