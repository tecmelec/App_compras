import { createAdminClient } from '@/lib/supabase/admin';
import ComentariosSolicitud from '@/components/ComentariosSolicitud';
import DocumentosSolicitud from '@/components/DocumentosSolicitud';
import { quienRechazo } from '@/lib/rechazo';
import EliminadaEnBCBadge from '@/components/EliminadaEnBCBadge';
import AnadidaEnBCBadge from '@/components/AnadidaEnBCBadge';
import AmpliacionTiendaBadge from '@/components/AmpliacionTiendaBadge';
import { lineasListaFotoSinResolver } from '@/lib/lista-foto';
import ListaFotoInforme from '@/components/ListaFotoInforme';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EstadoBadge from '@/components/EstadoBadge';
import AprobacionBotones from './AprobacionBotones';
import RevisionAprobacion from './RevisionAprobacion';
import { numerosTecmelecTexto, fechasEstimadasTexto } from '@/lib/pedidos-utils';
import { formatoPrecioUnitario, formatoImporte } from '@/lib/formato';
import { formatoCantidad } from '@/lib/cantidad';
import { disponibilidadTienda } from '@/lib/tienda-proyecto';

export default async function DetalleResponsablePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, proyecto_id, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, estado_general, direcciones(alias, direccion, codigo_postal, ciudad), proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(id, producto_id, cantidad, cantidad_original, anadida_en_bc, eliminada_en_bc, cantidad_antes_bc, rechazada_por_aprobador, rechazada_por_nombre, rechazada_por_rol, numero_tecmelec, fecha_estimada_entrega, precio_unitario, productos(nombre, precio, unidad_medida, multiplo_compra))'
    )
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  const p = pedido as any;
  const pendiente = p.requiere_aprobacion && p.aprobado === null;
  // Lista en foto: no se puede aprobar mientras queden líneas sin artículo ni rechazar.
  const sinResolver = pendiente ? await lineasListaFotoSinResolver(p.id) : [];

  // Datos para comentarios y artículos añadidos por el aprobador (con '*' para no fallar si
  // la migración 20261028120000 aún no está aplicada).
  const adminExtras = createAdminClient();
  const [{ data: extras }, { data: itemsExtras }] = await Promise.all([
    adminExtras.from('pedidos').select('*').eq('id', params.id).maybeSingle(),
    adminExtras.from('pedido_items').select('*').eq('pedido_id', params.id),
  ]);

  // Tienda por proyecto: lo que queda de cada artículo sin contar esta solicitud, para
  // que el aprobador vea si se supera y pueda reducir la cantidad o aprobar la ampliación.
  let tienda: Record<string, { disponible: number; limite: number; unidad: string }> = {};
  if (pendiente && p.proyecto_id) {
    try {
      const disp = await disponibilidadTienda(
        p.proyecto_id,
        (p.pedido_items || []).map((i: any) => i.producto_id),
        p.id
      );
      disp.forEach((d, productoId) => {
        tienda[productoId] = { disponible: d.disponible, limite: d.limite, unidad: d.unidad };
      });
    } catch (e) {
      console.error('[responsable] No se pudo leer la tienda del proyecto', e);
    }
  }

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
          <p className="text-grafito font-mono text-base">{formatoImporte(p.total_estimado)} €</p>
        </div>
      </div>

      <ComentariosSolicitud pedidoId={params.id} />
      <DocumentosSolicitud pedidoId={params.id} aprobador={pendiente} />

      {pendiente ? (
        <RevisionAprobacion
          pedidoId={p.id}
          lineasListaSinResolver={sinResolver.length}
          comentarioInicial={(extras as any)?.comentarios_aprobador || ''}
          anadidas={(itemsExtras || []).filter((x: any) => x.anadida_por_aprobador).map((x: any) => x.id)}
          tienda={tienda}
          lineas={p.pedido_items.map((item: any) => ({
            id: item.id,
            productoId: item.producto_id,
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
                  <div>
                    <p className={item.rechazada_por_aprobador ? 'text-slate line-through' : 'text-grafito'}>
                      {item.productos?.nombre || 'Producto no disponible'}
                    </p>
                    {item.anadida_en_bc && <AnadidaEnBCBadge className="mt-0.5" />}
                    {(() => {
                      const x = (itemsExtras || []).find((e: any) => e.id === item.id) as any;
                      return x ? (
                        <AmpliacionTiendaBadge
                          className="mt-0.5"
                          ampliada={x.ampliacion_tienda != null ? Number(x.ampliacion_tienda) : null}
                          unidad={item.productos?.unidad_medida}
                        />
                      ) : null;
                    })()}
                    {item.rechazada_por_aprobador && (
                      <p className="text-xs text-rojo mt-0.5">
                        Rechazada por {quienRechazo(item.rechazada_por_rol, item.rechazada_por_nombre)}
                      </p>
                    )}
                    {item.eliminada_en_bc && (
                      <EliminadaEnBCBadge
                        className="mt-0.5"
                        cantidadSolicitada={item.cantidad_antes_bc}
                        unidad={item.productos?.unidad_medida}
                      />
                    )}
                  </div>
                  <p className="font-mono text-slate">{item.numero_tecmelec || '—'}</p>
                  <p className="text-xs text-slate">
                    {item.fecha_estimada_entrega
                      ? new Date(item.fecha_estimada_entrega + 'T00:00:00').toLocaleDateString('es-ES')
                      : 'Por definir'}
                  </p>
                  <p className="font-mono text-slate">{formatoPrecioUnitario(precio)} € c/u</p>
                  {item.rechazada_por_aprobador ? (
                    <span className="badge badge-cancelado">Rechazada</span>
                  ) : (
                    <p className="font-mono text-grafito" title={modificada ? `Solicitado: ${item.cantidad_original}` : undefined}>
                      {modificada && <span className="text-slate line-through mr-1.5">x{item.cantidad_original}</span>}
                      x{formatoCantidad(item.cantidad)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {p.requiere_aprobacion && <AprobacionBotones pedidoId={p.id} aprobado={p.aprobado} />}
        </>
      )}
      <ListaFotoInforme pedidoId={params.id} asignar="responsable" />
    </div>
  );
}
