import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FormularioComprador from './FormularioComprador';
import SincronizarPedidoBCBoton from './SincronizarPedidoBCBoton';
import CrearPedidoBCBoton from './CrearPedidoBCBoton';
import GestionPedidosBC from './GestionPedidosBC';
import { rangoFechasEstimadas } from '@/lib/pedidos-utils';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';

function IconoDato({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-9 h-9 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
      {children}
    </span>
  );
}

export default async function DetalleCompradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(
      'id, numero_app, created_at, estado_general, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, direcciones(alias, direccion, codigo_postal, ciudad), proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(id, cantidad, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_id, estado_recepcion, proveedor_id, precio_unitario, productos(nombre, precio, imagen_url, unidad_medida, proveedor_predeterminado_id))'
    )
    .eq('id', params.id)
    .single();

  const { data: estados } = await supabase
    .from('estados_pedido')
    .select('id, nombre, orden')
    .order('orden');

  const { data: proveedores } = await obtenerTodosLosProveedores(supabase);

  if (!pedido) notFound();

  const p = pedido as any;

  const proveedoresPorId = new Map<string, string>(
    (proveedores || []).map((pr: any) => [pr.id, `${pr.bc_proveedor_no} — ${pr.nombre}`])
  );

  // Orden mínimo que debe tener el estado de TODAS las líneas del grupo para
  // considerar que ese Pedido Tecmelec ya está "lanzado" en Business Central
  // (o más allá: recibido parcial/completo comparten estado_id en ese punto).
  // Antes de eso, no tiene sentido dejar enviarlo por email al proveedor.
  const ordenPorEstadoId = new Map<number, number>((estados || []).map((e: any) => [e.id, e.orden]));
  const estadoLanzado = (estados || []).find((e: any) => e.nombre?.trim().toLowerCase() === 'pedido lanzado');
  const ordenLanzado = estadoLanzado?.orden ?? null;

  const gruposPorTecmelec = new Map<
    string,
    { proveedorId: string; total: number; lineas: number; ordenMinimo: number | null }
  >();
  for (const item of p.pedido_items as any[]) {
    if (!item.numero_tecmelec) continue;
    const precio = item.precio_unitario ?? item.productos?.precio ?? 0;
    const ordenItem = ordenPorEstadoId.get(item.estado_id) ?? null;
    const existente = gruposPorTecmelec.get(item.numero_tecmelec);
    if (existente) {
      existente.total += precio * item.cantidad;
      existente.lineas += 1;
      if (ordenItem !== null && (existente.ordenMinimo === null || ordenItem < existente.ordenMinimo)) {
        existente.ordenMinimo = ordenItem;
      }
    } else {
      gruposPorTecmelec.set(item.numero_tecmelec, {
        proveedorId: item.proveedor_id,
        total: precio * item.cantidad,
        lineas: 1,
        ordenMinimo: ordenItem,
      });
    }
  }
  const numerosTecmelecLista = Array.from(gruposPorTecmelec.keys());
  const { data: emailsEnviados } = numerosTecmelecLista.length
    ? await supabase.from('pedido_emails').select('numero_tecmelec, con_fotos').in('numero_tecmelec', numerosTecmelecLista)
    : { data: [] as { numero_tecmelec: string; con_fotos: boolean }[] };
  const enviosPorGrupo = new Set((emailsEnviados || []).map((e: any) => `${e.numero_tecmelec}|${e.con_fotos}`));

  const { data: marcasPdfEnviado } = numerosTecmelecLista.length
    ? await supabase
        .from('pedido_compra_pdf_enviado')
        .select('numero_tecmelec, pdf_enviado')
        .in('numero_tecmelec', numerosTecmelecLista)
    : { data: [] as { numero_tecmelec: string; pdf_enviado: boolean }[] };
  const pdfEnviadoPorGrupo = new Set(
    (marcasPdfEnviado || []).filter((m: any) => m.pdf_enviado).map((m: any) => m.numero_tecmelec as string)
  );

  const pedidosBC = Array.from(gruposPorTecmelec.entries()).map(([numeroTecmelec, g]) => ({
    numeroTecmelec,
    proveedorNombre: proveedoresPorId.get(g.proveedorId) || '',
    total: g.total,
    lineas: g.lineas,
    enviadoSinFotos: enviosPorGrupo.has(`${numeroTecmelec}|false`),
    enviadoConFotos: enviosPorGrupo.has(`${numeroTecmelec}|true`),
    pdfEnviado: pdfEnviadoPorGrupo.has(numeroTecmelec),
    // Si no hay un estado "Pedido lanzado" configurado, no bloqueamos nada (fail-open).
    puedeEnviarEmail: ordenLanzado === null || (g.ordenMinimo !== null && g.ordenMinimo >= ordenLanzado),
  }));

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-sm text-marca">{p.numero_app}</p>
          <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitud de {p.profiles?.nombre_completo}</h1>
        </div>
        <CrearPedidoBCBoton pedidoId={p.id} />
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
              {p.fecha_requerida ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
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

      <SincronizarPedidoBCBoton pedidoId={p.id} />

      <GestionPedidosBC pedidos={pedidosBC} />

      <FormularioComprador
        pedidoId={p.id}
        items={p.pedido_items.map((item: any) => ({
          id: item.id,
          nombre: item.productos?.nombre || 'Producto no disponible',
          imagenUrl: item.productos?.imagen_url || null,
          precio: item.precio_unitario ?? item.productos?.precio ?? 0,
          cantidad: item.cantidad,
          numeroTecmelec: item.numero_tecmelec || '',
          fechaEstimada: item.fecha_estimada_entrega || '',
          fechaConfirmadaEn: item.fecha_estimada_entrega_confirmada_en || null,
          estadoId: item.estado_id,
          estadoRecepcion: item.estado_recepcion,
          proveedorId: item.proveedor_id || (!item.numero_tecmelec ? item.productos?.proveedor_predeterminado_id || '' : ''),
        }))}
        totalEstimado={p.total_estimado}
        estadoGeneral={p.estado_general}
        fechaEstimada={p.fecha_estimada_entrega || ''}
        estados={estados || []}
        proveedores={proveedores || []}
      />
    </div>
  );
}
