import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EstadoBadge from '@/components/EstadoBadge';
import { numerosTecmelecTexto } from '@/lib/pedidos-utils';

export default async function DetalleAdminPedidoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      `id, numero_app, fecha_estimada_entrega, fecha_requerida, nombre_contacto,
       telefono_contacto, total_estimado, requiere_aprobacion, aprobado, created_at,
       estados_pedido(nombre),
       direcciones(alias, direccion, codigo_postal, ciudad, provincia),
       solicitante:profiles!pedidos_usuario_id_fkey(nombre_completo, email),
       comprador:profiles!pedidos_comprador_id_fkey(nombre_completo, email),
       responsable:profiles!pedidos_responsable_id_fkey(nombre_completo, email),
       pedido_items(cantidad, numero_tecmelec, productos(nombre, precio))`
    )
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  const p = pedido as any;

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-sm text-acero">{p.numero_app}</p>
          <h1 className="text-2xl font-semibold text-grafito">Solicitud de {p.solicitante?.nombre_completo}</h1>
        </div>
        <EstadoBadge estado={p.estados_pedido?.nombre} />
      </div>

      <div className="bg-white border border-borde rounded-lg p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate mb-0.5">Comprador asignado</p>
          <p className="text-grafito">{p.comprador?.nombre_completo || '—'}</p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Responsable asignado</p>
          <p className="text-grafito">{p.responsable?.nombre_completo || '—'}</p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Nº pedido Tecmelec</p>
          <p className="font-mono text-grafito">{numerosTecmelecTexto(p.pedido_items)}</p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Fecha estimada de entrega</p>
          <p className="text-grafito">
            {p.fecha_estimada_entrega
              ? new Date(p.fecha_estimada_entrega).toLocaleDateString('es-ES')
              : 'Por definir'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Contacto</p>
          <p className="text-grafito">{p.nombre_contacto} — {p.telefono_contacto}</p>
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
              ? `${p.direcciones.alias} — ${p.direcciones.direccion}${p.direcciones.codigo_postal ? ` — CP ${p.direcciones.codigo_postal}` : ''}, ${p.direcciones.ciudad || ''} ${p.direcciones.provincia ? `(${p.direcciones.provincia})` : ''}`
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

      <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-2">
        {p.pedido_items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-4 text-sm">
            <p className="text-grafito">{item.productos.nombre}</p>
            <p className="font-mono text-slate">{item.numero_tecmelec || '—'}</p>
            <p className="font-mono text-slate">{item.productos.precio?.toFixed(2)} € c/u</p>
            <p className="font-mono text-grafito">x{item.cantidad}</p>
          </div>
        ))}
      </div>
      <p className="text-right font-mono text-grafito">
        Total: <strong>{p.total_estimado?.toFixed(2)} €</strong>
      </p>
    </div>
  );
}
