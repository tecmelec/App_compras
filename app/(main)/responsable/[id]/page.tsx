import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EstadoBadge from '@/components/EstadoBadge';
import AprobacionBotones from './AprobacionBotones';
import RevisionAprobacion from './RevisionAprobacion';
import { numerosTecmelecTexto, fechasEstimadasTexto } from '@/lib/pedidos-utils';

export default async function DetalleResponsablePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, estado_general, direcciones(alias, direccion, codigo_postal, ciudad), proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(id, cantidad, cantidad_original, rechazada_por_aprobador, numero_tecmelec, fecha_estimada_entrega, precio_unitario, productos(nombre, precio, unidad_medida, multiplo_compra))'
    )
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  const p = pedido as any;
  const pendiente = p.requiere_aprobacion && p.aprobado === null;

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-sm text-marca">{p.numero_app}</p>
          <h1 className="text-2xl font-semibold text-grafito">Solicitud de {p.profiles?.nombre_completo}</h1>
        </div>
        <EstadoBadge estado={p.estado_general} />
      </div>

      <div className="bg-white border border-borde rounded-lg p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2">
          <p className="text-slate mb-0.5">Proyecto</p>
          <p className="text-grafito">
            {p.proyectos ? `${p.proyectos.bc_job_no} — ${p.proyectos.descripcion || ''}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Contacto</p>
          <p className="text-grafito">{p.nombre_contacto} — {p.telefono_contacto}</p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Nº pedido Tecmelec</p>
          <p className="font-mono text-grafito">{numerosTecmelecTexto(p.pedido_items)}</p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Fecha requerida</p>
          <p className="text-grafito">
            {p.fecha_requerida ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate mb-0.5">Fecha estimada de entrega</p>
          <p className="text-grafito">{fechasEstimadasTexto(p.pedido_items)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-0.5">Dirección de entrega</p>
          <p className="text-grafito">
            {p.direcciones
              ? `${p.direcciones.alias} — ${p.direcciones.direccion}${p.direcciones.codigo_postal ? ` — CP ${p.direcciones.codigo_postal}` : ''}, ${p.direcciones.ciudad || ''}`
              : '—'}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate mb-0.5">Total estimado</p>
          <p className="text-grafito font-mono text-base">{p.total_estimado?.toFixed(2)} €</p>
        </div>
      </div>

      {pendiente ? (
        <RevisionAprobacion
          pedidoId={p.id}
          lineas={p.pedido_items.map((item: any) => ({
            id: item.id,
            nombre: item.productos?.nombre || 'Producto no disponible',
            cantidad: item.cantidad,
            precio: Number(item.precio_unitario ?? item.productos?.precio ?? 0),
            multiplo: item.productos?.multiplo_compra || 1,
            unidad: item.productos?.unidad_medida || 'ud.',
            numeroTecmelec: item.numero_tecmelec,
            fechaEstimada: item.fecha_estimada_entrega,
          }))}
        />
      ) : (
        <>
          <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
          <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-6">
            {p.pedido_items.map((item: any) => {
              const precio = Number(item.precio_unitario ?? item.productos?.precio ?? 0);
              const modificada = item.cantidad_original != null && item.cantidad_original !== item.cantidad;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-4 text-sm ${
                    item.rechazada_por_aprobador ? 'bg-[#FBF3F3]' : ''
                  }`}
                >
                  <p className={item.rechazada_por_aprobador ? 'text-slate line-through' : 'text-grafito'}>
                    {item.productos?.nombre || 'Producto no disponible'}
                  </p>
                  <p className="font-mono text-slate">{item.numero_tecmelec || '—'}</p>
                  <p className="text-xs text-slate">
                    {item.fecha_estimada_entrega
                      ? new Date(item.fecha_estimada_entrega + 'T00:00:00').toLocaleDateString('es-ES')
                      : 'Por definir'}
                  </p>
                  <p className="font-mono text-slate">{precio.toFixed(2)} € c/u</p>
                  {item.rechazada_por_aprobador ? (
                    <span className="badge badge-cancelado">Rechazada</span>
                  ) : (
                    <p className="font-mono text-grafito" title={modificada ? `Solicitado: ${item.cantidad_original}` : undefined}>
                      {modificada && <span className="text-slate line-through mr-1.5">x{item.cantidad_original}</span>}
                      x{item.cantidad}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {p.requiere_aprobacion && <AprobacionBotones pedidoId={p.id} aprobado={p.aprobado} />}
        </>
      )}
    </div>
  );
}
