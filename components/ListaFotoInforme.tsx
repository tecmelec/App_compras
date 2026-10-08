import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_LISTAS_FOTO } from '@/lib/lista-foto';
import type { LineaLista } from '@/lib/lista-foto-tipos';

// Foto de la lista de materiales y el informe de lo escrito frente a lo que lleva la
// solicitud AHORA (enviado tal cual, modificado o pendiente). Se calcula con las líneas
// actuales del pedido, así que refleja también los cambios del aprobador o de Compras.
// Solo se monta en páginas que ya han comprobado (con RLS) el acceso a la solicitud.

type Estado = { tipo: 'enviado' | 'modificado' | 'pendiente'; detalle: string };

function fmt(n: number | null | undefined) {
  return n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

export default async function ListaFotoInforme({ pedidoId }: { pedidoId: string }) {
  const admin = createAdminClient();
  const { data: listas } = await admin
    .from('listas_foto')
    .select('id, imagen_path, lineas, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at');
  if (!listas || listas.length === 0) return null;

  const { data: items } = await admin
    .from('pedido_items')
    .select('producto_id, cantidad, rechazada_por_aprobador, productos(nombre, unidad_medida, multiplo_compra)')
    .eq('pedido_id', pedidoId);

  // Cantidad actual por producto (sin líneas rechazadas) y productos rechazados.
  const cantidadPorProducto = new Map<string, number>();
  const rechazados = new Set<string>();
  const infoProducto = new Map<string, { nombre: string; unidad: string; multiplo: number }>();
  for (const it of (items || []) as any[]) {
    infoProducto.set(it.producto_id, {
      nombre: it.productos?.nombre || 'Producto',
      unidad: it.productos?.unidad_medida || 'ud.',
      multiplo: it.productos?.multiplo_compra || 1,
    });
    if (it.rechazada_por_aprobador) {
      rechazados.add(it.producto_id);
    } else {
      cantidadPorProducto.set(it.producto_id, (cantidadPorProducto.get(it.producto_id) || 0) + Number(it.cantidad));
    }
  }

  const productosDeListas = new Set<string>();
  const bloques = await Promise.all(
    listas.map(async (lista) => {
      const { data: firmada } = await admin.storage
        .from(BUCKET_LISTAS_FOTO)
        .createSignedUrl(lista.imagen_path, 60 * 60);
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
        if (!productoId) {
          estado = {
            tipo: 'pendiente',
            detalle: l.producto_propuesto_id
              ? 'Descartada al revisar la lista.'
              : l.candidatos?.length
                ? 'No se encontró el artículo en la tienda.'
                : 'No hay nada parecido en la tienda.',
          };
        } else if (actual === 0) {
          estado = {
            tipo: 'pendiente',
            detalle: rechazados.has(productoId) ? 'Rechazada por el aprobador.' : 'Se quitó del carrito antes de enviar.',
          };
        } else if (escrita != null && actual === escrita && productoId === l.producto_propuesto_id) {
          estado = { tipo: 'enviado', detalle: '' };
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
          estado = { tipo: escrita == null && productoId === l.producto_propuesto_id ? 'enviado' : 'modificado', detalle: motivos.join(' · ') };
        }
        return { l, nombre, unidad, actual, estado };
      });
      return { id: lista.id, url: firmada?.signedUrl || null, filas };
    })
  );

  // Artículos de la solicitud que no vienen de ninguna línea de la foto.
  const aparte = Array.from(cantidadPorProducto.entries()).filter(([id]) => !productosDeListas.has(id));

  const todas = bloques.flatMap((b) => b.filas);
  const resumen = {
    enviado: todas.filter((f) => f.estado.tipo === 'enviado').length,
    modificado: todas.filter((f) => f.estado.tipo === 'modificado').length,
    pendiente: todas.filter((f) => f.estado.tipo === 'pendiente').length,
  };
  const badge = { enviado: 'badge-entregado', modificado: 'badge-proceso', pendiente: 'badge-pendiente' } as const;
  const texto = { enviado: 'Enviado', modificado: 'Modificado', pendiente: 'Pendiente' } as const;

  return (
    <section className="bg-white border border-borde rounded-lg p-4 sm:p-5 mt-6">
      <h2 className="text-base font-semibold text-grafito">Lista en foto</h2>
      <p className="text-xs text-slate mb-4">
        Solicitud creada a partir de una foto de la lista de materiales. {resumen.enviado} enviadas tal cual,{' '}
        {resumen.modificado} modificadas, {resumen.pendiente} pendientes.
      </p>

      {bloques.map((b) => (
        <div key={b.id} className="flex flex-col md:flex-row gap-5 items-start mb-4 last:mb-0">
          {b.url ? (
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
