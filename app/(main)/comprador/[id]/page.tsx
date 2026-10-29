import ComentariosSolicitud from '@/components/ComentariosSolicitud';
import DocumentosSolicitud from '@/components/DocumentosSolicitud';
import { quienRechazo } from '@/lib/rechazo';
import { lineasListaFotoSinResolver } from '@/lib/lista-foto';
import ListaFotoInforme from '@/components/ListaFotoInforme';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import FormularioComprador from './FormularioComprador';
import SincronizarPedidoBCBoton from './SincronizarPedidoBCBoton';
import PresupuestoBoton from './PresupuestoBoton';
import PropuestaCompraBoton from './PropuestaCompraBoton';
import ComparativoBoton from './ComparativoBoton';
import PeticionesOfertaSolicitud from './PeticionesOfertaSolicitud';
import EditarEntregaBoton from './EditarEntregaBoton';
import PresupuestosSolicitud from './PresupuestosSolicitud';
import CrearPedidoBCBoton from './CrearPedidoBCBoton';
import GestionPedidosBC from './GestionPedidosBC';
import { obtenerFotosAlbaranes } from '@/lib/fotos-albaranes';
import { rangoFechasEstimadas, puedeCrearPedidoBC, MENSAJE_CREAR_PEDIDO_BC_BLOQUEADO } from '@/lib/pedidos-utils';
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
      'id, usuario_id, comprador_id, numero_app, created_at, estado_general, fecha_estimada_entrega, fecha_requerida, nombre_contacto, telefono_contacto, total_estimado, requiere_aprobacion, aprobado, responsable_id, direcciones(alias, direccion, codigo_postal, ciudad, provincia), proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), pedido_items(id, cantidad, cantidad_original, cantidad_aprobador, cantidad_modificada_por_comprador, cantidad_antes_bc, anadida_en_bc, eliminada_en_bc, rechazada_por_aprobador, rechazada_por_nombre, rechazada_por_rol, numero_tecmelec, fecha_estimada_entrega, fecha_estimada_entrega_confirmada_en, estado_id, estado_recepcion, proveedor_id, precio_unitario, precio_presupuesto_id, productos(nombre, precio, imagen_url, unidad_medida, multiplo_compra, proveedor_predeterminado_id, bc_item_no))'
    )
    .eq('id', params.id)
    .single();

  const { data: estados } = await supabase
    .from('estados_pedido')
    .select('id, nombre, orden')
    .order('orden');

  const { data: proveedores } = await obtenerTodosLosProveedores(supabase);

  if (!pedido) notFound();
  // Solo compras: comprador y admin ven todas; el perfil integral, solo las suyas.
  {
    const {
      data: { user: yo },
    } = await supabase.auth.getUser();
    const { data: miPerfil } = yo ? await supabase.from('profiles').select('rol').eq('id', yo.id).single() : { data: null };
    const rolYo = miPerfil?.rol || '';
    if (!['comprador', 'admin', 'integral', 'seguidor_ia'].includes(rolYo)) notFound();
    if (rolYo === 'integral' && (pedido as any).usuario_id !== yo!.id && (pedido as any).comprador_id !== yo!.id) notFound();
  }

  const p = pedido as any;
  // Líneas con proveedor/precio aplicados desde "Proponer compra" (si la migración
  // 20261022140000 no está aplicada, la consulta falla y no se marca nada).
  const { data: conPropuesta } = await createAdminClient()
    .from('pedido_items')
    .select('id, propuesta_compra_id')
    .eq('pedido_id', p.id)
    .not('propuesta_compra_id', 'is', null);
  const propuestaPorItem = new Map<string, string>((conPropuesta || []).map((x: any) => [x.id, x.propuesta_compra_id]));

  // El admin puede aprobar cualquier solicitud pendiente (desde la vista de aprobación).
  const {
    data: { user: quienMira },
  } = await supabase.auth.getUser();
  const { data: perfilQuienMira } = quienMira
    ? await supabase.from('profiles').select('rol').eq('id', quienMira.id).single()
    : { data: null };
  const adminPuedeAprobar = perfilQuienMira?.rol === 'admin' && p.requiere_aprobacion && p.aprobado == null;
  // Seguidor IA: vista de solo lectura salvo la "Fecha estimada de entrega".
  const soloFechas = perfilQuienMira?.rol === 'seguidor_ia';
  // Líneas cuya fecha confirmó el Seguidor IA (consulta aparte: si la migración
  // 20261029120000 no está aplicada, no se marca nada).
  const { data: conSeguidor } = await createAdminClient()
    .from('pedido_items')
    .select('id, fecha_estimada_entrega_seguidor_en')
    .eq('pedido_id', p.id)
    .not('fecha_estimada_entrega_seguidor_en', 'is', null);
  const seguidorPorItem = new Map<string, string>((conSeguidor || []).map((x: any) => [x.id, x.fecha_estimada_entrega_seguidor_en]));

  // Quién tiene que aprobar la solicitud (para el aviso del botón "Crear pedido en BC").
  let pendienteDeAprobar: string | null = null;
  if (p.requiere_aprobacion && p.aprobado == null) {
    const { data: aprobador } = p.responsable_id
      ? await createAdminClient().from('profiles').select('nombre_completo').eq('id', p.responsable_id).maybeSingle()
      : { data: null };
    pendienteDeAprobar = aprobador?.nombre_completo || 'el aprobador del proyecto';
  }
  const datosEntrega = {
    nombre: p.nombre_contacto || '',
    telefono: p.telefono_contacto || '',
    direccion: p.direcciones?.direccion || '',
    codigo_postal: p.direcciones?.codigo_postal || '',
    ciudad: p.direcciones?.ciudad || '',
    provincia: p.direcciones?.provincia || '',
  };
  // Lista en foto: no se crea el pedido en BC mientras queden líneas sin artículo ni rechazar.
  const listaSinResolver = await lineasListaFotoSinResolver(p.id);

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
    ? await supabase
        .from('pedido_emails')
        .select('numero_tecmelec, con_fotos, recordatorio_enviado_en')
        .in('numero_tecmelec', numerosTecmelecLista)
    : { data: [] as { numero_tecmelec: string; con_fotos: boolean; recordatorio_enviado_en: string | null }[] };
  const enviosPorGrupo = new Set((emailsEnviados || []).map((e: any) => `${e.numero_tecmelec}|${e.con_fotos}`));
  // Recordatorio automático de fecha de entrega enviado al proveedor (el más reciente).
  const recordatorioPorPedido = new Map<string, string>();
  for (const e of (emailsEnviados || []) as any[]) {
    if (!e.recordatorio_enviado_en) continue;
    const actual = recordatorioPorPedido.get(e.numero_tecmelec);
    if (!actual || e.recordatorio_enviado_en > actual) recordatorioPorPedido.set(e.numero_tecmelec, e.recordatorio_enviado_en);
  }

  const { data: marcasPdfEnviado } = numerosTecmelecLista.length
    ? await supabase
        .from('pedido_compra_pdf_enviado')
        .select('numero_tecmelec, pdf_enviado')
        .in('numero_tecmelec', numerosTecmelecLista)
    : { data: [] as { numero_tecmelec: string; pdf_enviado: boolean }[] };
  const pdfEnviadoPorGrupo = new Set(
    (marcasPdfEnviado || []).filter((m: any) => m.pdf_enviado).map((m: any) => m.numero_tecmelec as string)
  );

  // Fotos de albaranes (Alb. Tecmelec) de cada Pedido Tecmelec.
  const fotosPorPedido = await obtenerFotosAlbaranes(numerosTecmelecLista);

  // Pedidos Tecmelec con comentarios para el PDF (punto naranja en "Comentarios PDF").
  // Si la migración 20261022130000 no está aplicada, las consultas fallan y no se marca nada.
  const numerosTecmelec = Array.from(gruposPorTecmelec.keys());
  const conComentariosPdf = new Set<string>();
  if (numerosTecmelec.length > 0) {
    const adminCom = createAdminClient();
    const [{ data: cabs }, { data: lins }] = await Promise.all([
      adminCom.from('pedido_tecmelec_comentarios').select('numero_tecmelec').in('numero_tecmelec', numerosTecmelec),
      adminCom
        .from('pedido_items')
        .select('numero_tecmelec')
        .in('numero_tecmelec', numerosTecmelec)
        .not('comentario_pdf', 'is', null),
    ]);
    for (const c of [...(cabs || []), ...(lins || [])]) conComentariosPdf.add((c as any).numero_tecmelec);
  }

  const pedidosBC = Array.from(gruposPorTecmelec.entries()).map(([numeroTecmelec, g]) => ({
    numeroTecmelec,
    fotosAlbaran: fotosPorPedido[numeroTecmelec.trim().toUpperCase()] || [],
    proveedorNombre: proveedoresPorId.get(g.proveedorId) || '',
    total: g.total,
    lineas: g.lineas,
    enviadoSinFotos: enviosPorGrupo.has(`${numeroTecmelec}|false`),
    enviadoConFotos: enviosPorGrupo.has(`${numeroTecmelec}|true`),
    recordatorioEnviado: recordatorioPorPedido.get(numeroTecmelec) || null,
    pdfEnviado: pdfEnviadoPorGrupo.has(numeroTecmelec),
    tieneComentariosPdf: conComentariosPdf.has(numeroTecmelec),
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
        {!soloFechas && (
        <div className="flex flex-wrap items-start justify-end gap-2">
        {adminPuedeAprobar && (
          <a href={`/responsable/${p.id}`} className="btn-secondary whitespace-nowrap" title="Como administrador puedes aprobar esta solicitud">
            Revisar y aprobar
          </a>
        )}
        <CrearPedidoBCBoton
          pedidoId={p.id}
          puedeCrear={puedeCrearPedidoBC(p.pedido_items, estados || [], p) && listaSinResolver.length === 0}
          motivoBloqueo={
            listaSinResolver.length > 0
              ? `Antes de crear el pedido en BC, asigna un artículo o rechaza las líneas pendientes de la lista de materiales (${listaSinResolver.length}).`
              : pendienteDeAprobar
                ? `${MENSAJE_CREAR_PEDIDO_BC_BLOQUEADO} Está pendiente de aprobación por ${pendienteDeAprobar}.`
                : null
          }
        />
        </div>
        )}
      </div>
      {soloFechas && (
        <p className="text-xs text-slate mb-3">Perfil Seguidor IA: solo puedes modificar o confirmar la «Fecha estimada de entrega» de cada línea (no se puede confirmar una fecha ya confirmada por el proveedor).</p>
      )}

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
            <p className="text-xs text-slate mb-0.5 flex items-center gap-2">
              Contacto
              {!soloFechas && <EditarEntregaBoton pedidoId={p.id} actual={datosEntrega} />}
            </p>
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
            <p className="text-xs text-slate mb-0.5 flex items-center gap-2">
              Dirección de entrega
              {!soloFechas && <EditarEntregaBoton pedidoId={p.id} actual={datosEntrega} />}
            </p>
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

      {!soloFechas && (
      <div className="flex flex-wrap items-start gap-3">
        <SincronizarPedidoBCBoton pedidoId={p.id} />
        <div className="mb-4">
          <PropuestaCompraBoton pedidoId={p.id} proveedores={(proveedores as any[]) || []} />
        </div>
        <div className="mb-4">
          <ComparativoBoton pedidoId={p.id} />
        </div>
        <div className="mb-4">
          <PresupuestoBoton
            pedidoId={p.id}
            proveedores={(proveedores as any[]) || []}
            preciosActuales={(p.pedido_items as any[]).map((i) => ({
              id: i.id,
              precio: Number(i.precio_unitario ?? i.productos?.precio ?? 0),
            }))}
          />
        </div>
      </div>
      )}
      <ComentariosSolicitud pedidoId={p.id} />
      <DocumentosSolicitud pedidoId={p.id} />
      {!soloFechas && (
      <>
      <PeticionesOfertaSolicitud
        pedidoId={p.id}
        proveedores={(proveedores as any[]) || []}
        preciosActuales={(p.pedido_items as any[]).map((i) => ({
          id: i.id,
          precio: Number(i.precio_unitario ?? i.productos?.precio ?? 0),
        }))}
      />
      <PresupuestosSolicitud
        pedidoId={p.id}
        nombresItems={Object.fromEntries((p.pedido_items as any[]).map((i) => [i.id, i.productos?.nombre || 'Producto']))}
      />

      <GestionPedidosBC pedidos={pedidosBC} />
      </>
      )}

      <FormularioComprador
        soloFechas={soloFechas}
        // Si se añade una línea (p. ej. al asignar un artículo de la lista en foto), el
        // formulario se vuelve a montar para incluirla en su estado.
        key={(p.pedido_items as any[])
          .map((i) => `${i.id}:${i.precio_unitario ?? ''}:${i.proveedor_id ?? ''}:${i.precio_presupuesto_id ?? ''}:${propuestaPorItem.get(i.id) ?? ''}:${seguidorPorItem.get(i.id) ?? ''}`)
          .join(',')}
        pedidoId={p.id}
        proyectoSolicitud={p.proyectos?.bc_job_no ?? null}
        items={p.pedido_items.map((item: any) => ({
          id: item.id,
          nombre: item.productos?.nombre || 'Producto no disponible',
          imagenUrl: item.productos?.imagen_url || null,
          precio: item.precio_unitario ?? item.productos?.precio ?? 0,
          cantidad: item.cantidad,
          cantidadOriginal: item.cantidad_original ?? null,
          cantidadAprobador: item.cantidad_aprobador ?? null,
          modificadaPorComprador: !!item.cantidad_modificada_por_comprador,
          cantidadAntesBC: item.cantidad_antes_bc ?? null,
          anadidaEnBC: !!item.anadida_en_bc,
          eliminadaEnBC: !!item.eliminada_en_bc,
          bcItemNo: item.productos?.bc_item_no ?? null,
          precioDesdePresupuesto: !!item.precio_presupuesto_id,
          precioDesdePropuesta: !!propuestaPorItem.get(item.id),
          rechazadaPorAprobador: !!item.rechazada_por_aprobador,
          rechazadaPor: quienRechazo(item.rechazada_por_rol, item.rechazada_por_nombre),
          unidad: item.productos?.unidad_medida || 'ud.',
          multiplo: item.productos?.multiplo_compra || 1,
          // El comprador puede cambiar la cantidad mientras la línea no tenga pedido en
          // BC, también si la solicitud aún está pendiente de aprobación (no si se rechazó).
          cantidadEditable: !item.numero_tecmelec && !item.rechazada_por_aprobador && p.aprobado !== false,
          numeroTecmelec: item.numero_tecmelec || '',
          fechaEstimada: item.fecha_estimada_entrega || '',
          fechaConfirmadaEn: item.fecha_estimada_entrega_confirmada_en || null,
          fechaSeguidorEn: seguidorPorItem.get(item.id) || null,
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
      <ListaFotoInforme pedidoId={params.id} asignar="compras" />
    </div>
  );
}
