'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ComboboxProveedor from '@/components/ComboboxProveedor';
import { borrarCondicionProveedor, guardarCondicionProveedor } from '@/app/actions/condiciones-proveedor';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };
type Condicion = { proveedorId: string; proveedorNo: string; proveedorNombre: string; prontoPago: number; rappel: number; notas: string };

export default function CondicionesClient({ proveedores, condiciones }: { proveedores: Proveedor[]; condiciones: Condicion[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState({ proveedorId: '', prontoPago: '', rappel: '', notas: '' });
  const [edicion, setEdicion] = useState<Record<string, { prontoPago: string; rappel: string; notas: string }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const num = (v: string) => Number((v || '0').replace(',', '.'));
  const ordenadas = [...condiciones]
    .sort((a, b) => a.proveedorNo.localeCompare(b.proveedorNo))
    .filter((c) => !filtro || `${c.proveedorNo} ${c.proveedorNombre}`.toLowerCase().includes(filtro.toLowerCase()));

  async function guardar(proveedorId: string, v: { prontoPago: string; rappel: string; notas: string }) {
    setOcupado(proveedorId);
    setError(null);
    const r = await guardarCondicionProveedor({ proveedorId, prontoPago: num(v.prontoPago), rappel: num(v.rappel), notas: v.notas });
    setOcupado(null);
    if (r.error) {
      setError(r.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function anadir() {
    if (!nuevo.proveedorId) return;
    if (await guardar(nuevo.proveedorId, nuevo)) setNuevo({ proveedorId: '', prontoPago: '', rappel: '', notas: '' });
  }

  async function borrar(proveedorId: string) {
    setOcupado(proveedorId);
    const r = await borrarCondicionProveedor(proveedorId);
    setOcupado(null);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  const yaEsta = new Set(condiciones.map((c) => c.proveedorId));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-borde rounded-lg p-4">
        <p className="text-sm font-medium text-grafito mb-2">Añadir proveedor</p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-xs text-slate mb-1">Proveedor</p>
            <ComboboxProveedor
              proveedores={proveedores.filter((p) => !yaEsta.has(p.id))}
              value={nuevo.proveedorId}
              onChange={(id) => setNuevo((v) => ({ ...v, proveedorId: id }))}
              className="w-80"
            />
          </div>
          <label className="text-xs text-slate">
            Pronto pago %
            <input className="input w-24 block mt-1 text-right font-mono" type="number" step="any" min="0" value={nuevo.prontoPago} onChange={(e) => setNuevo((v) => ({ ...v, prontoPago: e.target.value }))} />
          </label>
          <label className="text-xs text-slate">
            Rappel %
            <input className="input w-24 block mt-1 text-right font-mono" type="number" step="any" min="0" value={nuevo.rappel} onChange={(e) => setNuevo((v) => ({ ...v, rappel: e.target.value }))} />
          </label>
          <label className="text-xs text-slate flex-1 min-w-[12rem]">
            Notas
            <input className="input w-full block mt-1" value={nuevo.notas} onChange={(e) => setNuevo((v) => ({ ...v, notas: e.target.value }))} placeholder="Opcional" />
          </label>
          <button onClick={anadir} disabled={!nuevo.proveedorId || !!ocupado} className="btn-primary disabled:opacity-60">
            Añadir
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rojo">{error}</p>}

      <div className="bg-white border border-borde rounded-lg overflow-x-auto">
        <div className="p-3 border-b border-borde">
          <input className="input w-full max-w-xs" placeholder="Buscar proveedor…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        {ordenadas.length === 0 ? (
          <p className="text-sm text-slate p-4">{condiciones.length === 0 ? 'Aún no hay condiciones. Añade el primer proveedor arriba.' : 'Sin resultados.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-fondo text-xs text-slate">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Proveedor</th>
                <th className="px-3 py-2 text-right font-medium">Pronto pago %</th>
                <th className="px-3 py-2 text-right font-medium">Rappel %</th>
                <th className="px-3 py-2 text-left font-medium">Notas</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {ordenadas.map((c) => {
                const e = edicion[c.proveedorId];
                return (
                  <tr key={c.proveedorId}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-slate mr-2">{c.proveedorNo}</span>
                      {c.proveedorNombre}
                    </td>
                    {e ? (
                      <>
                        <td className="px-3 py-2 text-right">
                          <input className="input w-20 text-right font-mono" type="number" step="any" value={e.prontoPago} onChange={(ev) => setEdicion((p) => ({ ...p, [c.proveedorId]: { ...e, prontoPago: ev.target.value } }))} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input className="input w-20 text-right font-mono" type="number" step="any" value={e.rappel} onChange={(ev) => setEdicion((p) => ({ ...p, [c.proveedorId]: { ...e, rappel: ev.target.value } }))} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input w-full" value={e.notas} onChange={(ev) => setEdicion((p) => ({ ...p, [c.proveedorId]: { ...e, notas: ev.target.value } }))} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={async () => {
                              if (await guardar(c.proveedorId, e)) setEdicion((p) => { const n = { ...p }; delete n[c.proveedorId]; return n; });
                            }}
                            disabled={ocupado === c.proveedorId}
                            className="text-marca hover:underline text-sm mr-3"
                          >
                            Guardar
                          </button>
                          <button onClick={() => setEdicion((p) => { const n = { ...p }; delete n[c.proveedorId]; return n; })} className="text-slate hover:underline text-sm">
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right font-mono">{c.prontoPago.toLocaleString('es-ES')} %</td>
                        <td className="px-3 py-2 text-right font-mono">{c.rappel.toLocaleString('es-ES')} %</td>
                        <td className="px-3 py-2 text-slate">{c.notas}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEdicion((p) => ({ ...p, [c.proveedorId]: { prontoPago: String(c.prontoPago), rappel: String(c.rappel), notas: c.notas } }))}
                            className="text-marca hover:underline text-sm mr-3"
                          >
                            Editar
                          </button>
                          <button onClick={() => borrar(c.proveedorId)} disabled={ocupado === c.proveedorId} className="text-rojo hover:underline text-sm">
                            Quitar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
