import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FormularioComprador from './FormularioComprador';

export default async function DetalleCompradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, numero_tecmelec, estado_id, fecha_estimada_entrega, profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(cantidad, productos(nombre))'
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

      <h2 className="font-medium text-grafito mt-6 mb-3">Artículos solicitados</h2>
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-6">
        {(pedido as any).pedido_items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-4 text-sm">
            <p className="text-grafito">{item.productos.nombre}</p>
            <p className="font-mono text-grafito">x{item.cantidad}</p>
          </div>
        ))}
      </div>

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
