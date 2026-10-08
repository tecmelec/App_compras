import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_LISTAS_FOTO } from '@/lib/lista-foto';
import type { LineaLista } from '@/lib/lista-foto-tipos';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';
import AsignarArticuloLista from '@/components/AsignarArticuloLista';
import RechazarLineaLista from '@/components/RechazarLineaLista';

// Foto de la lista de materiales y el informe de lo escrito frente a lo que lleva la
// solicitud AHORA (enviado tal cual, modificado o pendiente). Se calcula con las líneas
// actuales del pedido, así que refleja también los cambios del aprobador o de Compras.
// Solo se monta en páginas que ya han comprobado (con RLS) el acceso a la solicitud.

type Estado = {
  tipo: 'enviado' | 'modificado' | 'pendiente' | 'asignado' | 'rechazada';
  detalle: string;
  asignable?: boolean;
  reasignable?: boolean;
  rechazable?: boolean;
};

function fmt(n: number | null | undefined) {
  return n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

// asignar: quién puede asignar un artículo de BC a las líneas pendientes desde esta
// vista ('responsable': artículo y cantidad; 'compras': además precio y proveedor).
export default async function ListaFotoInforme({
  pedidoId,
  asignar,
}: {
  pedidoId: string;
  asignar?: 'responsable' | 'compras';
}) {
  const admin = createAdminClient();
  const { data: listas } = await admin
    .from('listas_foto')
    .select('id, imagen_path, texto, lineas, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at');
  if (!listas || listas.length === 0) return null;

  const { data: pedido } = await admin.from('pedidos').select('estado_general, aprobado').eq('id', pedidoId).single();
  const pedidoAbierto = !!pedido && pedido.estado_general !== 'Anulado' && pedido.aprobado !== false;
  const proveedores =
    asignar === 'compras' ? ((await obtenerTodosLosProveedores(admin)).data as any[]) || [] : [];

  const { data: items } = await admin
    .from('pedido_items')
    .select('producto_id, cantidad, rechazada_por_aprobador, numero_tecmelec, anadida_en_bc, eliminada_en_bc, cantidad_antes_bc, productos(nombre, unidad_medida, multiplo_compra)')
    .eq('pedido_id', pedidoId);

  // Cantidad actual por producto (sin líneas rechazadas) y productos rechazados.
  const cantidadPorProducto = new Map<string, number>();
  const rechazados = new Set<string>();
  const enPedidoCompra = new Set<string>();
  const anadidosEnBC = new Set<string>();
  const eliminadosEnBC = new Map<string, number | null>();
  const infoProducto = new Map<string, { nombre: string; unidad: string; multiplo: number }>();
  for (const it of (items || []) as any[]) {
    infoProducto.set(it.producto_id, {
      nombre: it.productos?.nombre || 'Producto',
      unidad: it.productos?.unidad_medida || 'ud.',
      multiplo: it.productos?.multiplo_compra || 1,
    });
    if (it.numero_tecmelec) enPedidoCompra.add(it.producto_id);
    if (it.anadida_en_bc) anadidosEnBC.add(it.producto_id);
    if (it.eliminada_en_bc) eliminadosEnBC.set(it.producto_id, it.cantidad_antes_bc ?? null);
    if (it.rechazada_por_aprobador) {
      rechazados.add(it.producto_id);
    } else {
      cantidadPorProducto.set(it.producto_id, (cantidadPorProducto.get(it.producto_id) || 0) + Number(it.cantidad));
    }
  }

  const productosDeListas = new Set<string>();
  const bloques = await Promise.all(
    listas.map(async (lista) => {
      const firmada = lista.imagen_path
        ? (await admin.storage.from(BUCKET_LISTAS_FOTO).createSignedUrl(lista.imagen_path, 60 * 60)).data
        : null;
      const lineas = (lista.lineas || []) as LineaLista[];
      const filas = lineas.map((l) => {
        const productoId = l.producto_id ?? null;
        if (productoId) productosDeListas.add(productoId);
        const cand = l.candidatos?.find((c) => c.id === productoId);
        const info = productoId ? infoProducto.get(productoId) : undefined;
        const nombre = info?.nombre || cand?.nombre || null;
        const unidad = info?.unidad || cand?.unidad_medida || 'ud.';
        const actual = productoId ? cantidadPorProducto.get(productoId) || 0 : 0;
        const escrita = productoId === l.producto_propuesto_id ? l.cantidad_producto : l.cantidad_escrita;

        let estado: Estado;
        const libre = !productoId || !enPedidoCompra.has(productoId); // aún no está en un pedido de compra
        if (l.rechazada) {
          estado = {
            tipo: 'rechazada',
            detalle: `Por ${l.rechazada.por_nombre} el ${new Date(l.rechazada.en).toLocaleDateString('es-ES')}`,
          };
        } else if (productoId && actual === 0 && eliminadosEnBC.has(productoId)) {
          const antes = eliminadosEnBC.get(productoId);
          estado = {
            tipo: 'rechazada',
            detalle: `Borrado del pedido de compra en BC${antes != null ? ` (se habían solicitado ${fmt(antes)} ${unidad})` : ''}.`,
          };
        } else if (productoId && actual === 0 && rechazados.has(productoId)) {
          estado = { tipo: 'rechazada', detalle: 'Rechazada por el aprobador.' };
        } else if (l.asignado && productoId && actual > 0) {
          const fecha = new Date(l.asignado.en).toLocaleDateString('es-ES');
          estado = {
            tipo: 'asignado',
            reasignable: libre,
            rechazable: libre,
            detalle: `Por ${l.asignado.por_nombre} el ${fecha} · ${l.asignado.bc_item_no}${
              l.cantidad_carrito != null && actual !== l.cantidad_carrito ? ` · ${fmt(l.cantidad_carrito)} → ${fmt(actual)} ${unidad}` : ''
            }`,
          };
        } else if (!productoId) {
          estado = {
            tipo: 'pendiente',
            asignable: true,
            rechazable: true,
            detalle: l.producto_propuesto_id
              ? 'Descartada al revisar la lista.'
              : l.candidatos?.length
                ? 'No se encontró el artículo en la tienda.'
                : 'No hay nada parecido en la tienda.',
          };
        } else if (actual === 0) {
          estado = { tipo: 'pendiente', asignable: true, rechazable: true, detalle: 'Se quitó del carrito antes de enviar.' };
        } else if (escrita != null && actual === escrita && productoId === l.producto_propuesto_id) {
          estado = { tipo: 'enviado', detalle: '', rechazable: libre };
        } else {
          const motivos: string[] = [];
          if (productoId !== l.producto_propuesto_id) motivos.push('artículo elegido al revisar');
          if (escrita != null && actual !== escrita) {
            const m = info?.multiplo || cand?.multiplo_compra || 1;
            const porMultiplo = m > 1 && actual === Math.ceil(escrita / m) * m;
            motivos.push(
              `${fmt(escrita)} → ${fmt(actual)} ${unidad}${porMultiplo ? ` (múltiplo de ${m})` : ''}`
            );
          } else if (escrita == null) {
            motivos.push('sin cantidad en la lista');
          }
          estado = {
            tipo: escrita == null && productoId === l.producto_propuesto_id ? 'enviado' : 'modificado',
            detalle: motivos.join(' · '),
            rechazable: libre,
          };
        }
        return { l, nombre, unidad, actual, estado };
      });
      return {
        id: lista.id,
        esFoto: !!lista.imagen_path,
        url: firmada?.signedUrl || null,
        texto: (lista.texto as string | null) || null,
        filas,
      };
    })
  );

  // Artículos de la solicitud que no vienen de ninguna línea de la foto.
  const aparte = Array.from(cantidadPorProducto.entries()).filter(([id]) => !productosDeListas.has(id));

  const todas = bloques.flatMap((b) => b.filas);
  const resumen = {
    asignado: todas.filter((f) => f.estado.tipo === 'asignado').length,
    enviado: todas.filter((f) => f.estado.tipo === 'enviado').length,
    modificado: todas.filter((f) => f.estado.tipo === 'modificado').length,
    pendiente: todas.filter((f) => f.estado.tipo === 'pendiente').length,
    rechazada: todas.filter((f) => f.estado.tipo === 'rechazada').length,
  };
  const badge = {
    enviado: 'badge-entregado',
    modificado: 'badge-proceso',
    pendiente: 'badge-pendiente',
    asignado: 'badge-proceso',
    rechazada: 'badge-cancelado',
  } as const;
  const texto = {
    enviado: 'Enviado',
    modificado: 'Modificado',
    pendiente: 'Pendiente',
    asignado: 'Asignado',
    rechazada: 'Rechazada',
  } as const;

  return (
    <section className="bg-white border border-borde rounded-lg p-4 sm:p-5 mt-6">
      <h2 className="text-base font-semibold text-grafito">
        {bloques.every((b) => b.esFoto) ? 'Lista en foto' : bloques.every((b) => !b.esFoto) ? 'Lista escrita' : 'Listas de materiales'}
      </h2>
      <p className="text-xs text-slate mb-4">
        {bloques.every((b) => b.esFoto)
          ? 'Solicitud creada a partir de una foto de la lista de materiales.'
          : 'Solicitud creada a partir de una lista de materiales escrita.'} {resumen.enviado} enviadas tal cual,{' '}
        {resumen.modificado} modificadas,{' '}
        {resumen.asignado > 0 ? `${resumen.asignado} asignadas después, ` : ''}
        {resumen.rechazada > 0 ? `${resumen.rechazada} rechazadas, ` : ''}
        {resumen.pendiente} pendientes.
      </p>
      {resumen.pendiente > 0 && asignar && pedidoAbierto && (
        <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-4">
          Para poder aprobar la solicitud y crear su pedido en BC, todas las líneas deben tener un artículo asignado o estar rechazadas.
        </p>
      )}

      {bloques.map((b) => (
        <div key={b.id} className="flex flex-col md:flex-row gap-5 items-start mb-4 last:mb-0">
          {!b.esFoto ? (
            <pre className="shrink-0 w-full md:w-56 bg-fondo border border-borde rounded-md p-3 text-xs text-grafito whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
              {b.texto || '—'}
            </pre>
          ) : b.url ? (
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img src={b.url} alt="Lista de materiales" className="w-full md:w-56 rounded-md border border-borde" />
              <span className="text-xs text-slate">Ver foto ampliada</span>
            </a>
          ) : (
            <p className="text-xs text-slate md:w-56">No se pudo cargar la foto.</p>
          )}

          <div className="flex-1 min-w-0 w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate border-b border-borde">
                  <th className="py-2 pr-3 font-medium">Escrito en la lista</th>
                  <th className="py-2 pr-3 font-medium">En la solicitud</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {b.filas.map(({ l, nombre, unidad, actual, estado }) => (
                  <tr key={l.n} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="italic text-grafito">“{l.texto}”</p>
                      <p className="text-xs text-slate">
                        {l.cantidad_escrita != null ? `${fmt(l.cantidad_escrita)} ${l.unidad_escrita || ''}` : 'sin cantidad'}
                      </p>
                    </td>
                    <td className="py-2 pr-3">
                      {nombre ? (
                        <>
                          <p className="text-grafito">{nombre}</p>
                          {actual > 0 && (
                            <p className="text-xs text-slate font-mono">
                              x{fmt(actual)} {unidad}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-slate">—</p>
                      )}
                    </td>
                    <td className="py-2">
                      <span className={`badge ${badge[estado.tipo]}`}>{texto[estado.tipo]}</span>
                      {estado.detalle && <p className="text-xs text-slate mt-1">{estado.detalle}</p>}
                      {asignar && pedidoAbierto && (estado.asignable || estado.reasignable) && (
                        <AsignarArticuloLista
                          cambiar={!!estado.reasignable}
                          listaId={b.id}
                          n={l.n}
                          texto={l.texto}
                          cantidadEscrita={l.cantidad_escrita}
                          conPrecio={asignar === 'compras'}
                          proveedores={proveedores}
                        />
                      )}
                      {asignar && pedidoAbierto && estado.rechazable && <RechazarLineaLista listaId={b.id} n={l.n} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {aparte.length > 0 && (
        <div className="mt-4 pt-3 border-t border-borde">
          <p className="text-xs font-medium text-slate mb-1">Añadidos aparte (no están en la foto)</p>
          <ul className="text-sm text-grafito space-y-0.5">
            {aparte.map(([id, cantidad]) => (
              <li key={id}>
                {infoProducto.get(id)?.nombre || 'Producto'}{' '}
                <span className="text-xs text-slate font-mono">
                  x{fmt(cantidad)} {infoProducto.get(id)?.unidad}
                </span>
                {anadidosEnBC.has(id) && <span className="text-xs text-[#2F6690] ml-1.5">· añadida en BC</span>}
                {eliminadosEnBC.has(id) && <span className="text-xs text-rojo ml-1.5">· borrado del pedido en BC</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
