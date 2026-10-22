'use client';

import { useState } from 'react';
import { guardarComentariosPdf, obtenerComentariosPdf, type LineaComentarioPdf } from '@/app/actions/comentarios-pdf';
import { formatoCantidad } from '@/lib/cantidad';

// "Comentarios PDF" en Gestión de pedidos: comentario de encabezado del pedido de
// compra y comentarios por artículo, que se imprimen en el PDF.
export default function ComentariosPdfBoton({ numeroTecmelec, tieneComentarios }: { numeroTecmelec: string; tieneComentarios?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [encabezado, setEncabezado] = useState('');
  const [lineas, setLineas] = useState<LineaComentarioPdf[]>([]);
  const [hay, setHay] = useState(!!tieneComentarios);

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    setOk(false);
    const r = await obtenerComentariosPdf(numeroTecmelec);
    setCargando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    const d = r as { encabezado: string; lineas: LineaComentarioPdf[] };
    setEncabezado(d.encabezado);
    setLineas(d.lineas);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await guardarComentariosPdf(
      numeroTecmelec,
      encabezado,
      lineas.map((l) => ({ id: l.id, comentario: l.comentario }))
    );
    setGuardando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    setHay(!!encabezado.trim() || lineas.some((l) => l.comentario.trim()));
    setOk(true);
    setTimeout(() => setAbierto(false), 700);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="text-sm text-marca hover:underline inline-flex items-center gap-1"
        title="Comentarios que se imprimen en el PDF del pedido"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Comentarios PDF
        {hay && <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" aria-label="tiene comentarios" />}
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold text-grafito">Comentarios del PDF · {numeroTecmelec}</h2>
                <p className="text-xs text-slate">Se imprimen en cursiva en el pedido de compra (con y sin fotos, y en el envío por email).</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
                ×
              </button>
            </div>

            {cargando ? (
              <p className="text-sm text-slate">Cargando…</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-grafito">Comentario de encabezado</label>
                  <p className="text-xs text-slate mb-1">Aparece debajo de los datos del proveedor y la dirección de envío.</p>
                  <textarea
                    value={encabezado}
                    onChange={(e) => setEncabezado(e.target.value)}
                    maxLength={1500}
                    rows={3}
                    className="input w-full resize-y"
                    placeholder="Ej.: Entregar en horario de 8 a 14 h, preguntar por el encargado de obra."
                  />
                </div>
                {lineas.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-grafito">Comentarios por artículo</p>
                    <p className="text-xs text-slate mb-2">Aparecen debajo de la descripción del artículo.</p>
                    <ul className="divide-y divide-borde border border-borde rounded-md">
                      {lineas.map((l, i) => (
                        <li key={l.id} className={`p-2.5 ${l.enPdf ? '' : 'opacity-60'}`}>
                          <p className="text-sm text-grafito">
                            <span className="font-mono text-xs text-slate mr-2">{l.bcItemNo}</span>
                            {l.nombre}
                            <span className="text-xs text-slate ml-2">
                              {formatoCantidad(l.cantidad)} {l.unidad}
                            </span>
                            {!l.enPdf && <span className="text-xs text-slate ml-2">(no sale en el PDF: cantidad 0 o anulada)</span>}
                          </p>
                          <textarea
                            value={l.comentario}
                            onChange={(e) =>
                              setLineas((prev) => prev.map((x, k) => (k === i ? { ...x, comentario: e.target.value } : x)))
                            }
                            maxLength={500}
                            rows={Math.min(6, Math.max(2, l.comentario.split('\n').length))}
                            className="input w-full mt-1 text-sm resize-y"
                            placeholder="Comentario para este artículo (opcional; Intro para una nueva línea)"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-rojo mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAbierto(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={guardar} disabled={cargando || guardando || (!!error && lineas.length === 0)} className="btn-primary disabled:opacity-60">
                {guardando ? 'Guardando…' : ok ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
