import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EstadoBadge from '@/components/EstadoBadge';

export default async function DetallePedidoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'numero_app, numero_tecmelec, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, requiere_aprobacion, aprobado, created_at, estados_pedido(nombre), direcciones(alias, direccion, codigo_postal, ciudad), pedido_items(cantidad, productos(nombre, descripcion, imagen_url))'
    )
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-sm text-acero">{pedido.numero_app}</p>
          <h1 className="text-2xl font-semibold text-grafito">Detalle del pedido</h1>
        </div>
        <EstadoBadge estado={(pedido as any).estados_pedido?.nombre} />
      </div>

      <div className="bg-white border border-borde rounded-lg p-5 grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <p className="text-slate mb-1">Nº pedido Tecmelec</p>
          <p className="font-mono text-grafito">{pedido.numero_tecmelec || 'Pendiente de asignar'}</p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha estimada de entrega</p>
          <p className="text-grafito">
            {pedido.fecha_estimada_entrega
              ? new Date(pedido.fecha_estimada_entrega).toLocaleDateString('es-CL')
              : 'Por definir'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha requerida</p>
          <p className="text-grafito">
            {(pedido as any).fecha_requerida
              ? new Date((pedido as any).fecha_requerida + 'T00:00:00').toLocaleDateString('es-CL')
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha de solicitud</p>
          <p className="text-grafito">{new Date(pedido.created_at).toLocaleDateString('es-CL')}</p>
        </div>
        <div>
          <p className="text-slate mb-1">Contacto</p>
          <p className="text-grafito">
            {(pedido as any).nombre_contacto} — {(pedido as any).telefono_contacto}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-1">Dirección de entrega</p>
          <p className="text-grafito">
            {(pedido as any).direcciones
              ? `${(pedido as any).direcciones.alias} — ${(pedido as any).direcciones.direccion}${(pedido as any).direcciones.codigo_postal ? ` — CP ${(pedido as any).direcciones.codigo_postal}` : ''}, ${(pedido as any).direcciones.ciudad || ''}`
              : '—'}
          </p>
        </div>
        {(pedido as any).requiere_aprobacion && (
          <div className="col-span-2">
            <p className="text-slate mb-1">Aprobación del responsable</p>
            <p className="text-grafito">
              {(pedido as any).aprobado === null
                ? 'Pendiente de aprobación'
                : (pedido as any).aprobado
                ? 'Aprobada'
                : 'Rechazada'}
            </p>
          </div>
        )}
      </div>

      <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
        {(pedido as any).pedido_items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-grafito">{item.productos.nombre}</p>
              {item.productos.descripcion && (
                <p className="text-xs text-slate mt-0.5">{item.productos.descripcion}</p>
              )}
            </div>
            <p className="text-sm font-mono text-grafito">x{item.cantidad}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
