'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarSolicitudConCambios, responderAprobacion } from '@/app/actions/pedidos';
import { formatoPrecioUnitario, formatoImporte } from '@/lib/formato';

export type LineaRevision = {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  multiplo: number;
  unidad: string;
  numeroTecmelec: string | null;
  fechaEstimada: string | null;
};

type Cambio = { cantidad: string; rechazada: boolean };

// Revisión del responsable: puede aprobar la solicitud tal cual, cambiar
// cantidades o rechazar líneas sueltas antes de aprobar, o rechazarla entera.
export default function RevisionAprobacion({
  pedidoId,
  lineas,
  lineasListaSinResolver = 0,
}: {
  pedidoId: string;
  lineas: LineaRevision[];
  // Lista en foto: líneas sin artículo ni rechazar (bloquean la aprobación, no el rechazo)
  lineasListaSinResolver?: number;
}) {
  const router = useRouter();
  const [cambios, setCambios] = useState<Record<string, Cambio>>(() =>
    Object.fromEntries(lineas.map((l) => [l.id, { cantidad: String(l.cantidad), rechazada: false }]))
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarRechazoTotal, setConfirmarRechazoTotal] = useState(false);

  function errorCantidad(l: LineaRevision): string | null {
    const c = cambios[l.id];
    if (c.rechazada) return null;
    const n = Number(c.cantidad);
    if (!c.cantidad || !Number.isInteger(n) || n <= 0) return 'Cantidad no válida (para quitarla, recházala).';
    if (l.multiplo > 1 && n % l.multiplo !== 0) return `Debe ser múltiplo de ${l.multiplo}.`;
    return null;
  }

  const hayErrores = lineas.some((l) => errorCantidad(l));
  const numRechazadas = lineas.filter((l) => cambios[l.id].rechazada).length;
  const numModificadas = lineas.filter(
    (l) => !cambios[l.id].rechazada && Number(cambios[l.id].cantidad) !== l.cantidad
  ).length;
  const hayCambios = numRechazadas > 0 || numModificadas > 0;
  const todasRechazadas = numRechazadas === lineas.length;

  const total = useMemo(
    () =>
      lineas.reduce((suma, l) => {
        const c = cambios[l.id];
        if (c.rechazada) return suma;
        const n = Number(c.cantidad);
        return suma + (Number.isFinite(n) ? n : 0) * l.precio;
      }, 0),
    [cambios, lineas]
  );

  function actualizar(id: string, parcial: Partial<Cambio>) {
    setCambios((prev) => ({ ...prev, [id]: { ...prev[id], ...parcial } }));
  }

  function paso(l: LineaRevision, signo: 1 | -1) {
    const actual = Number(cambios[l.id].cantidad) || 0;
    const paso = Math.max(l.multiplo, 1);
    const nuevo = Math.max(paso, actual + signo * paso);
    actualizar(l.id, { cantidad: String(nuevo) });
  }

  async function aprobar() {
    setEnviando(true);
    setError(null);
    const payload = lineas
      .map((l) => {
        const c = cambios[l.id];
        if (c.rechazada) return { id: l.id, rechazada: true };
        const n = Number(c.cantidad);
        return n !== l.cantidad ? { id: l.id, cantidad: n } : null;
      })
      .filter(Boolean) as { id: string; cantidad?: number; rechazada?: boolean }[];

    const r = await aprobarSolicitudConCambios(pedidoId, payload);
    setEnviando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  async function rechazarTodo() {
    setEnviando(true);
    setError(null);
    const r = await responderAprobacion(pedidoId, false);
    setEnviando(false);
    if (r?.error) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <h2 className="font-medium text-grafito mb-1">Artículos solicitados</h2>
      <p className="text-xs text-slate mb-3">
        Puedes aprobar tal cual, o antes de aprobar cambiar cantidades o rechazar líneas concretas.
      </p>

      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-4">
        {lineas.map((l) => {
          const c = cambios[l.id];
          const err = errorCantidad(l);
          const modificada = !c.rechazada && Number(c.cantidad) !== l.cantidad;
          return (
            <div key={l.id} className={`p-4 text-sm ${c.rechazada ? 'bg-[#FBF3F3]' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[12rem]">
                  <p className={`text-grafito ${c.rechazada ? 'line-through text-slate' : ''}`}>{l.nombre}</p>
                  <p className="text-xs text-slate font-mono">
                    {formatoPrecioUnitario(l.precio)} € c/u
                    {l.multiplo > 1 && <span className="font-sans"> · múltiplo de {l.multiplo}</span>}
                  </p>
                </div>

                {c.rechazada ? (
                  <span className="badge badge-cancelado">Línea rechazada</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => paso(l, -1)}
                      disabled={enviando}
                      className="w-7 h-7 rounded border border-borde text-grafito hover:bg-fondo"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={l.multiplo}
                      step={l.multiplo}
                      value={c.cantidad}
                      onChange={(e) => actualizar(l.id, { cantidad: e.target.value })}
                      disabled={enviando}
                      className={`input w-20 text-center font-mono py-1 ${err ? 'border-rojo' : ''} ${
                        modificada ? 'bg-[#FDF2E3]' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => paso(l, 1)}
                      disabled={enviando}
                      className="w-7 h-7 rounded border border-borde text-grafito hover:bg-fondo"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate ml-1 w-8">{l.unidad}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    actualizar(l.id, c.rechazada ? { rechazada: false } : { rechazada: true })
                  }
                  disabled={enviando}
                  className={`text-xs px-2.5 py-1 rounded-md border ${
                    c.rechazada
                      ? 'border-borde text-grafito hover:bg-fondo'
                      : 'border-[#E7C7C7] text-rojo hover:bg-[#F6E9E9]'
                  }`}
                >
                  {c.rechazada ? 'Deshacer' : 'Rechazar línea'}
                </button>
              </div>

              {modificada && !err && (
                <p className="text-xs text-[#8A5A15] mt-1.5">
                  Solicitado: {l.cantidad} {l.unidad} → aprobarás {c.cantidad} {l.unidad}
                  <button
                    type="button"
                    onClick={() => actualizar(l.id, { cantidad: String(l.cantidad) })}
                    className="ml-2 text-marca hover:underline"
                  >
                    Restaurar
                  </button>
                </p>
              )}
              {err && <p className="text-xs text-rojo mt-1.5">{err}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end text-sm mb-6">
        <span className="text-slate mr-2">Total {hayCambios ? 'tras tus cambios' : 'estimado'}:</span>
        <span className="font-mono text-grafito">{formatoImporte(total)} €</span>
      </div>

      <div className="bg-white border border-borde rounded-lg p-5">
        <h2 className="font-medium text-grafito mb-1">Esta solicitud requiere tu aprobación</h2>
        <p className="text-sm text-slate mb-4">
          El monto supera el límite de aprobación automática configurado por el administrador.
        </p>

        {hayCambios && !todasRechazadas && (
          <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-3">
            Vas a aprobar con cambios:{' '}
            {[
              numModificadas > 0 && `${numModificadas} ${numModificadas === 1 ? 'cantidad modificada' : 'cantidades modificadas'}`,
              numRechazadas > 0 && `${numRechazadas} ${numRechazadas === 1 ? 'línea rechazada' : 'líneas rechazadas'}`,
            ]
              .filter(Boolean)
              .join(' y ')}
            . El solicitante lo verá en el detalle de su solicitud.
          </p>
        )}
        {todasRechazadas && (
          <p className="text-xs text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">
            Has rechazado todas las líneas: equivale a rechazar la solicitud completa.
          </p>
        )}

        {error && (
          <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">{error}</p>
        )}

        {confirmarRechazoTotal ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-grafito">¿Rechazar la solicitud completa?</span>
            <button onClick={rechazarTodo} disabled={enviando} className="btn-rechazar">
              Sí, rechazar todo
            </button>
            <button onClick={() => setConfirmarRechazoTotal(false)} disabled={enviando} className="btn-secondary">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {lineasListaSinResolver > 0 && !todasRechazadas && (
              <p className="w-full text-sm text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2">
                Esta solicitud viene de una lista de materiales y tiene {lineasListaSinResolver}{' '}
                {lineasListaSinResolver === 1 ? 'línea pendiente' : 'líneas pendientes'}. Asígnales un artículo o recházalas
                en la sección de la lista (más abajo) para poder aprobarla.
              </p>
            )}
            <button
              onClick={aprobar}
              disabled={enviando || hayErrores || (lineasListaSinResolver > 0 && !todasRechazadas)}
              className="btn-aprobar"
            >
              {enviando
                ? 'Guardando…'
                : todasRechazadas
                  ? 'Confirmar rechazo'
                  : hayCambios
                    ? 'Aprobar con cambios'
                    : 'Aprobar'}
            </button>
            <button onClick={() => setConfirmarRechazoTotal(true)} disabled={enviando} className="btn-rechazar">
              Rechazar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
