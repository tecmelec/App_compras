import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FormularioComprador from './FormularioComprador';

export default async function DetalleCompradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, estado_id, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, direcciones(alias, direccion, codigo_postal, ciudad), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(id, cantidad, numero_tecmelec, productos(nombre, precio))'
    )
    .eq('id', params.id)
    .single();

  const { data: estados } = await supabase
    .from('estados_pedido')
    .select('id, nombre')
    .order('orden');

  if (!pedido) notFound();

  const p = pedido as any;

  return (
    <div className="p-8 max-w-2xl">
      <p className="font-mono text-sm text-acero">{p.numero_app}</p>
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitud de {p.profiles?.nombre_completo}</h1>

      <div className="bg-white border border-borde rounded-lg p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate mb-0.5">Contacto</p>
          <p className="text-grafito">
            {p.nombre_contacto} — {p.telefono_contacto}
          </p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Fecha requerida</p>
          <p className="text-grafito">
            {p.fecha_requerida ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-0.5">Dirección de entrega</p>
          <p className="text-grafito">
            {p.direcciones
              ? `${p.direcciones.alias} — ${p.direcciones.direccion}${p.direcciones.codigo_postal ? ` — CP ${p.direcciones.codigo_postal}` : ''}, ${p.direcciones.ciudad || ''}`
              : '—'}
          </p>
        </div>
        {p.requiere_aprobacion && (
          <div className="col-span-2">
            <p className="text-slate mb-0.5">Aprobación del responsable</p>
            <p className="text-grafito">
              {p.aprobado === null ? 'Pendiente' : p.aprobado ? 'Aprobada' : 'Rechazada'}
            </p>
          </div>
        )}
      </div>

      <FormularioComprador
        pedidoId={p.id}
        items={p.pedido_items.map((item: any) => ({
          id: item.id,
          nombre: item.productos.nombre,
          precio: item.productos.precio,
          cantidad: item.cantidad,
          numeroTecmelec: item.numero_tecmelec || '',
        }))}
        totalEstimado={p.total_estimado}
        estadoId={p.estado_id}
        fechaEstimada={p.fecha_estimada_entrega || ''}
        estados={estados || []}
      />
    </div>
  );
}
