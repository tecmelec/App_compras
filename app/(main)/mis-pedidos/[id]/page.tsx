import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import EstadoBadge from '@/components/EstadoBadge';
import ProgresoEstado from '@/components/ProgresoEstado';
import { rangoFechasEstimadas } from '@/lib/pedidos-utils';

function IconoDato({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-9 h-9 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
      {children}
    </span>
  );
}

export default async function DetallePedidoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'numero_app, estado_id, fecha_requerida, nombre_contacto, telefono_contacto, requiere_aprobacion, aprobado, created_at, estados_pedido(nombre), direcciones(alias, direccion, codigo_postal, ciudad), proyectos(bc_job_no, descripcion), pedido_items(cantidad, numero_tecmelec, fecha_estimada_entrega, productos(nombre, descripcion, imagen_url, unidad_medida))'
    )
    .eq('id', params.id)
    .single();

  if (!pedido) notFound();

  const { data: estados } = await supabase.from('estados_pedido').select('id, nombre, orden').order('orden');

  const p = pedido as any;

  const numerosTecmelec = Array.from(
    new Set((p.pedido_items || []).map((i: any) => i.numero_tecmelec).filter(Boolean))
  ) as string[];

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/mis-pedidos" className="text-sm text-marca hover:underline flex items-center gap-1 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Volver a mis solicitudes
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-grafito">Detalle de la solicitud</h1>
          <p className="font-mono text-marca text-sm mt-1">{p.numero_app}</p>
          <p className="text-slate text-sm">
            Proyecto: {p.proyectos ? `${p.proyectos.bc_job_no} — ${p.proyectos.descripcion || ''}` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EstadoBadge estado={p.estados_pedido?.nombre} />
          <a href="mailto:compras@tecmelec.es" className="btn-secondary flex items-center gap-2 whitespace-nowrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 6 12 13 2 6" />
            </svg>
            Contactar con Compras
          </a>
        </div>
      </div>

      <div className="bg-white border border-borde rounded-xl p-6 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Proyecto</p>
            <p className="text-sm text-grafito">
              {p.proyectos ? `${p.proyectos.bc_job_no} — ${p.proyectos.descripcion || ''}` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Nº pedido Tecmelec</p>
            <p className="text-sm font-mono text-grafito">
              {numerosTecmelec.length > 0 ? numerosTecmelec.join(' · ') : 'Pendiente de asignar'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Fecha de solicitud</p>
            <p className="text-sm text-grafito">{new Date(p.created_at).toLocaleDateString('es-ES')}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Fecha requerida</p>
            <p className="text-sm text-grafito">
              {p.fecha_requerida
                ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES')
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Contacto</p>
            <p className="text-sm text-grafito">
              {p.nombre_contacto} — {p.telefono_contacto}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Dirección de entrega</p>
            <p className="text-sm text-grafito">
              {p.direcciones
                ? `${p.direcciones.alias} — ${p.direcciones.direccion}${p.direcciones.codigo_postal ? ` — CP ${p.direcciones.codigo_postal}` : ''}, ${p.direcciones.ciudad || ''}`
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </IconoDato>
          <div>
            <p className="text-xs text-slate mb-0.5">Fecha estimada de entrega</p>
            <p className="text-sm text-grafito">{rangoFechasEstimadas(p.pedido_items)}</p>
          </div>
        </div>

        {p.requiere_aprobacion && (
          <div className="flex items-start gap-3">
            <IconoDato>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </IconoDato>
            <div>
              <p className="text-xs text-slate mb-0.5">Aprobación del responsable</p>
              <p className="text-sm text-grafito">
                {p.aprobado === null ? 'Pendiente de aprobación' : p.aprobado ? 'Aprobada' : 'Rechazada'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-borde rounded-xl p-6 mb-6">
        <div className="flex items-start gap-3 mb-6">
          <IconoDato>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </IconoDato>
          <div>
            <p className="font-medium text-grafito">Estado de la solicitud</p>
            <p className="text-sm text-slate">Puedes seguir el estado de tu solicitud aquí.</p>
          </div>
        </div>

        <ProgresoEstado estados={estados || []} estadoActualId={p.estado_id} />
      </div>

      <div>
        <h2 className="font-medium text-grafito mb-3 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-marca">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Artículos solicitados
          <span className="bg-marcaClaro text-marca text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
            {p.pedido_items.length}
          </span>
        </h2>

        <div className="bg-white border border-borde rounded-xl divide-y divide-borde">
          {p.pedido_items.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center gap-4 p-4 flex-wrap">
              <div className="w-12 h-12 bg-fondo rounded relative shrink-0 overflow-hidden">
                {item.productos?.imagen_url && (
                  <Image src={item.productos.imagen_url} alt="" fill className="object-contain" />
                )}
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium text-grafito">
                  {item.productos?.nombre || 'Producto no disponible'}
                </p>
                {item.productos?.descripcion && (
                  <p className="text-xs text-slate mt-0.5">{item.productos.descripcion}</p>
                )}
              </div>
              <div className="text-xs text-slate w-28">
                <p className="text-slate/70 mb-0.5">Código Tecmelec</p>
                <p className="font-mono text-grafito">{item.numero_tecmelec || '—'}</p>
              </div>
              <div className="text-xs text-slate w-28">
                <p className="text-slate/70 mb-0.5">Fecha entrega</p>
                <p className="text-grafito">
                  {item.fecha_estimada_entrega
                    ? new Date(item.fecha_estimada_entrega + 'T00:00:00').toLocaleDateString('es-ES')
                    : 'Por definir'}
                </p>
              </div>
              <div className="text-sm font-mono text-grafito w-16 text-right">
                {item.cantidad} {item.productos?.unidad_medida || 'ud.'}
              </div>
              <EstadoBadge estado={p.estados_pedido?.nombre} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
