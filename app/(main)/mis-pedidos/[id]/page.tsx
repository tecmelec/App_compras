import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EstadoBadge from '@/components/EstadoBadge';
import { numerosTecmelecTexto } from '@/lib/pedidos-utils';

export default async function DetallePedidoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'numero_app, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, requiere_aprobacion, aprobado, created_at, estados_pedido(nombre), direcciones(alias, direccion, codigo_postal, ciudad), pedido_items(cantidad, numero_tecmelec, productos(nombre, descripcion, imagen_url))'
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
          <h1 className="text-2xl font-semibold text-grafito">Detalle del pedido</h1>
        </div>
        <EstadoBadge estado={p.estados_pedido?.nombre} />
      </div>

      <div className="bg-white border border-borde rounded-lg p-5 grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <p className="text-slate mb-1">Nº pedido Tecmelec</p>
          <p className="font-mono text-grafito">{numerosTecmelecTexto(p.pedido_items)}</p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha estimada de entrega</p>
          <p className="text-grafito">
            {p.fecha_estimada_entrega
              ? new Date(p.fecha_estimada_entrega).toLocaleDateString('es-CL')
              : 'Por definir'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha requerida</p>
          <p className="text-grafito">
            {p.fecha_requerida
              ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-CL')
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-1">Fecha de solicitud</p>
          <p className="text-grafito">{new Date(p.created_at).toLocaleDateString('es-CL')}</p>
        </div>
        <div>
          <p className="text-slate mb-1">Contacto</p>
          <p className="text-grafito">
            {p.nombre_contacto} — {p.telefono_contacto}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-1">Dirección de entrega</p>
          <p className="text-grafito">
            {p.direcciones
              ? `${p.direcciones.alias} — ${p.direcciones.direccion}${p.direcciones.codigo_postal ? ` — CP ${p.direcciones.codigo_postal}` : ''}, ${p.direcciones.ciudad || ''}`
              : '—'}
          </p>
        </div>
        {p.requiere_aprobacion && (
          <div className="col-span-2">
            <p className="text-slate mb-1">Aprobación del responsable</p>
            <p className="text-grafito">
              {p.aprobado === null ? 'Pendiente de aprobación' : p.aprobado ? 'Aprobada' : 'Rechazada'}
            </p>
          </div>
        )}
      </div>

      <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
      <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
        {p.pedido_items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-grafito">{item.productos.nombre}</p>
              {item.productos.descripcion && (
                <p className="text-xs text-slate mt-0.5">{item.productos.descripcion}</p>
              )}
            </div>
            <p className="text-xs font-mono text-slate">{item.numero_tecmelec || '—'}</p>
            <p className="text-sm font-mono text-grafito">x{item.cantidad}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
