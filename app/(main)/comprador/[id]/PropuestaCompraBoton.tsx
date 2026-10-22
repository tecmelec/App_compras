'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ComboboxProveedor from '@/components/ComboboxProveedor';
import { aplicarPropuestaCompra, proponerCompra } from '@/app/actions/propuesta-compra';
import type { LineaPropuesta, Confianza } from '@/lib/propuesta-compra';
import { formatoCantidad } from '@/lib/cantidad';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

const ESTILO_CONFIANZA: Record<Confianza, string> = {
  alta: 'bg-[#D1FAE5] text-[#047857]',
  media: 'bg-[#FEF3C7] text-[#92400E]',
  baja: 'bg-[#F3F4F6] text-[#4B5563]',
};

// "Proponer compra" (Comprador IA — Fase 1, paso 1, sin IA): propone proveedor y precio
// por línea con reglas fijas; el comprador elige, ajusta y aplica.
export default function PropuestaCompraBoton({ pedidoId, proveedores }: { pedidoId: string; proveedores: Proveedor[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary inline-flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
        </svg>
        Proponer compra
      </button>
      {abierto && <Panel pedidoId={pedidoId} proveedores={proveedores} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

type Fila = { sel: boolean; proveedorId: string; precio: string };

function Panel({ pedidoId, proveedores, onCerrar }: { pedidoId: string; proveedores: Proveedor[]; onCerrar: () => void }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [propuestaId, setPropuestaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaPropuesta[]>([]);
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let vigente = true;
    proponerCompra(pedidoId).then((r) => {
      if (!vigente) return;
      setCargando(false);
      if ('error' in r && r.error) {
        setError(r.error);
        return;
      }
      const d = r as { propuestaId: string; lineas: LineaPropuesta[]; avisos: string[] };
      setPropuestaId(d.propuestaId);
      setLineas(d.lineas);
      setAvisos(d.avisos || []);
      setFilas(
        Object.fromEntries(
          d.lineas.map((l) => [
            l.itemId,
            {
              // Marcadas por defecto solo las de confianza alta con proveedor aplicable.
              sel: l.propuesta.confianza === 'alta' && !!l.propuesta.proveedorId && l.propuesta.precio != null,
              proveedorId: l.propuesta.proveedorId || l.actual.proveedorId || '',
              precio: l.propuesta.precio != null ? String(l.propuesta.precio) : l.actual.precio != null ? String(l.actual.precio) : '',
            },
          ])
        )
      );
    });
    return () => {
      vigente = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !aplicando && onCerrar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [aplicando, onCerrar]);

  const seleccionadas = useMemo(() => lineas.filter((l) => filas[l.itemId]?.sel), [lineas, filas]);
  const totalSel = seleccionadas.reduce((s, l) => s + (Number((filas[l.itemId]?.precio || '').replace(',', '.')) || 0) * l.cantidad, 0);
  const errorFila = (l: LineaPropuesta) => {
    const f = filas[l.itemId];
    if (!f?.sel) return null;
    const n = Number(f.precio.replace(',', '.'));
    if (f.precio === '' || !Number.isFinite(n) || n < 0) return 'Precio no válido';
    if (!f.proveedorId) return 'Elige proveedor';
    return null;
  };
  const hayErrores = seleccionadas.some((l) => errorFila(l));

  function cambiar(itemId: string, cambios: Partial<Fila>) {
    setFilas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...cambios } }));
  }

  async function aplicar() {
    if (!propuestaId || hayErrores || seleccionadas.length === 0) return;
    setAplicando(true);
    setError(null);
    const r = await aplicarPropuestaCompra(
      propuestaId,
      seleccionadas.map((l) => ({
        itemId: l.itemId,
        proveedorId: filas[l.itemId].proveedorId || null,
        precio: Number(filas[l.itemId].precio.replace(',', '.')),
      }))
    );
    setAplicando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
    onCerrar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => !aplicando && onCerrar()}>
      <div className="bg-white rounded-xl w-full max-w-6xl my-6 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-grafito">Propuesta de compra</h2>
            <p className="text-xs text-slate">
              Proveedor y precio propuestos para las líneas sin pedido de compra, a partir de presupuestos, compras anteriores en BC y el
              catálogo. Revisa, ajusta y aplica las que quieras: después sigue el flujo de siempre.
            </p>
          </div>
          <button onClick={onCerrar} disabled={aplicando} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
            ×
          </button>
        </div>

        {cargando && <p className="text-sm text-slate py-6 text-center">Calculando la propuesta (consultando compras en Business Central)…</p>}
        {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">{error}</p>}
        {avisos.map((a, i) => (
          <p key={i} className="text-xs text-slate bg-fondo border border-borde rounded-md px-3 py-2 mb-2">
            ⚠ {a}
          </p>
        ))}

        {!cargando && lineas.length > 0 && (
          <div className="overflow-x-auto border border-borde rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-fondo text-xs text-slate">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas"
                      checked={lineas.every((l) => l.propuesta.origen === 'pedir_oferta' || filas[l.itemId]?.sel)}
                      onChange={(e) =>
                        setFilas((prev) =>
                          Object.fromEntries(
                            Object.entries(prev).map(([k, f]) => {
                              const l = lineas.find((x) => x.itemId === k);
                              return [k, { ...f, sel: e.target.checked && l?.propuesta.origen !== 'pedir_oferta' }];
                            })
                          )
                        )
                      }
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-medium">Artículo</th>
                  <th className="px-2 py-2 text-left font-medium">Ahora</th>
                  <th className="px-2 py-2 text-left font-medium">Proveedor propuesto</th>
                  <th className="px-2 py-2 text-right font-medium">Precio ud.</th>
                  <th className="px-2 py-2 text-left font-medium">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {lineas.map((l) => {
                  const f = filas[l.itemId];
                  const pedirOferta = l.propuesta.origen === 'pedir_oferta';
                  const err = errorFila(l);
                  return (
                    <tr key={l.itemId} className={`align-top ${f?.sel ? 'bg-[#F7FBF8]' : ''}`}>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={!!f?.sel}
                          disabled={pedirOferta && !f?.proveedorId}
                          onChange={(e) => cambiar(l.itemId, { sel: e.target.checked })}
                          aria-label={`Aplicar ${l.articulo}`}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[200px]">
                        <p className="text-grafito">{l.articulo}</p>
                        <p className="text-xs text-slate">
                          <span className="font-mono">{l.bcItemNo || 'sin código BC'}</span> · {formatoCantidad(l.cantidad)} {l.unidad}
                        </p>
                        {l.notas.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {l.notas.map((n, i) => (
                              <li key={i} className="text-xs text-[#92400E]">
                                • {n}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate whitespace-nowrap">
                        <p>{l.actual.proveedorNombre || 'Sin proveedor'}</p>
                        <p className="font-mono">{fmt(l.actual.precio)} €</p>
                      </td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <ComboboxProveedor
                          proveedores={proveedores}
                          value={f?.proveedorId || ''}
                          onChange={(id) => cambiar(l.itemId, { proveedorId: id, sel: true })}
                          className="w-full"
                        />
                        {l.propuesta.proveedorNo && !l.propuesta.proveedorId && (
                          <p className="text-xs text-slate mt-0.5">
                            Propuesto: {l.propuesta.proveedorNo} {l.propuesta.proveedorNombre || ''}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={f?.precio ?? ''}
                          onChange={(e) => cambiar(l.itemId, { precio: e.target.value, sel: true })}
                          className={`input w-28 text-right font-mono ${err ? 'border-rojo' : ''}`}
                        />
                        {err && <p className="text-xs text-rojo mt-0.5">{err}</p>}
                      </td>
                      <td className="px-2 py-2 min-w-[200px]">
                        {pedirOferta ? (
                          <span className="inline-block text-xs font-medium rounded px-1.5 py-0.5 bg-[#DBEAFE] text-[#1D4ED8]">Pedir oferta</span>
                        ) : (
                          l.propuesta.confianza && (
                            <span className={`inline-block text-xs font-medium rounded px-1.5 py-0.5 ${ESTILO_CONFIANZA[l.propuesta.confianza]}`}>
                              Confianza {l.propuesta.confianza}
                            </span>
                          )
                        )}
                        <p className="text-xs text-slate mt-1">{l.propuesta.origenTexto}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!cargando && lineas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-sm text-slate">
              {seleccionadas.length} de {lineas.length} líneas seleccionadas · {fmt(Number(totalSel.toFixed(2)))} €
            </p>
            <div className="flex gap-2">
              <button onClick={onCerrar} disabled={aplicando} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={aplicar}
                disabled={aplicando || hayErrores || seleccionadas.length === 0}
                className="btn-primary disabled:opacity-60"
              >
                {aplicando ? 'Aplicando…' : `Aplicar seleccionadas (${seleccionadas.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
