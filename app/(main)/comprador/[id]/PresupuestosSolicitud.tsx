import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_LISTAS_FOTO } from '@/lib/lista-foto';
import type { LineaPresupuesto, ProveedorPresupuesto } from '@/lib/presupuesto';
import EliminarPresupuestoBoton from './EliminarPresupuestoBoton';

function fmt(n: number | null) {
  return n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// Presupuestos adjuntados a la solicitud (vista del comprador): archivos, proveedor
// y líneas leídas, indicando a qué línea de la solicitud se aplicó cada precio.
export default async function PresupuestosSolicitud({
  pedidoId,
  nombresItems,
}: {
  pedidoId: string;
  nombresItems: Record<string, string>;
}) {
  const admin = createAdminClient();
  const { data: presupuestos } = await admin
    .from('presupuestos')
    .select('id, archivos, nombres_archivo, proveedor, lineas, asignaciones, aplicado_en, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });
  if (!presupuestos || presupuestos.length === 0) return null;

  const conUrls = await Promise.all(
    presupuestos.map(async (p) => {
      const urls = await Promise.all(
        ((p.archivos as string[]) || []).map(async (r) => (await admin.storage.from(BUCKET_LISTAS_FOTO).createSignedUrl(r, 60 * 60)).data?.signedUrl || null)
      );
      return { ...p, urls };
    })
  );

  return (
    <section className="mb-6 space-y-3">
      {conUrls.map((p) => {
        const prov = (p.proveedor || {}) as ProveedorPresupuesto;
        const lineas = (p.lineas || []) as LineaPresupuesto[];
        const asign = (p.asignaciones || []) as { item_id: string; linea_idx: number }[];
        const itemDeLinea = new Map(asign.map((a) => [a.linea_idx, a.item_id]));
        return (
          <details key={p.id} className="bg-white border border-borde rounded-lg">
            <summary className="cursor-pointer px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-grafito">Presupuesto</span>
              <span className="text-slate">
                {prov.bc_no ? `${prov.bc_no} — ${prov.bc_nombre}` : prov.nombre || 'proveedor no identificado'}
              </span>
              <span className="text-xs text-slate">
                {new Date(p.created_at).toLocaleDateString('es-ES')} · {lineas.length} líneas
                {p.aplicado_en ? ` · ${asign.length} precios aplicados` : ' · sin aplicar'}
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {p.urls.map((u, i) =>
                  u ? (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-marca hover:underline">
                      📄 {((p.nombres_archivo as string[]) || [])[i] || `Archivo ${i + 1}`}
                    </a>
                  ) : null
                )}
                <EliminarPresupuestoBoton presupuestoId={p.id} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate border-b border-borde">
                      <th className="py-1.5 pr-2 font-medium">Referencia</th>
                      <th className="py-1.5 pr-2 font-medium">Descripción</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Cant.</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Precio ud.</th>
                      <th className="py-1.5 font-medium">Aplicado a</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {lineas.map((l) => {
                      const itemId = itemDeLinea.get(l.idx);
                      return (
                        <tr key={l.idx}>
                          <td className="py-1.5 pr-2 font-mono">{l.referencia || '—'}</td>
                          <td className="py-1.5 pr-2 text-grafito">{l.descripcion}</td>
                          <td className="py-1.5 pr-2 font-mono text-right">{l.cantidad ?? '—'}</td>
                          <td className="py-1.5 pr-2 font-mono text-right">{fmt(l.precio_unitario)} €</td>
                          <td className="py-1.5 text-slate">{itemId ? nombresItems[itemId] || 'línea de la solicitud' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
