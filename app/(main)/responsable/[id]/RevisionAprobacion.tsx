'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarSolicitudConCambios, responderAprobacion } from '@/app/actions/pedidos';
import { anadirArticuloAprobador, buscarArticulosParaAnadir, guardarComentarioAprobador } from '@/app/actions/aprobacion-extras';
import { formatoPrecioUnitario, formatoImporte } from '@/lib/formato';
import { esCantidadValida, esMultiploDe, leerCantidad, pasoCantidad } from '@/lib/cantidad';

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
  comentarioInicial = '',
  anadidas = [],
}: {
  pedidoId: string;
  lineas: LineaRevision[];
  // Lista en foto: líneas sin artículo ni rechazar (bloquean la aprobación, no el rechazo)
  lineasListaSinResolver?: number;
  comentarioInicial?: string;
  anadidas?: string[];
}) {
  const router = useRouter();
  const [cambios, setCambios] = useState<Record<string, Cambio>>(() =>
    Object.fromEntries(lineas.map((l) => [l.id, { cantidad: String(l.cantidad), rechazada: false }]))
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Las líneas añadidas después (p. ej. por el aprobador) aún no tienen entrada en "cambios".
  const cambioDe = (l: LineaRevision): Cambio => cambios[l.id] ?? { cantidad: String(l.cantidad), rechazada: false };
  const [confirmarRechazoTotal, setConfirmarRechazoTotal] = useState(false);
  const [comentario, setComentario] = useState(comentarioInicial);
  const [anadiendo, setAnadiendo] = useState(false);

  // Guarda el comentario al comprador si ha cambiado (antes de aprobar o rechazar).
  async function guardarComentarioSiCambia() {
    if (comentario.trim() === comentarioInicial.trim()) return true;
    const r = await guardarComentarioAprobador(pedidoId, comentario);
    if (r.error) {
      setError(r.error);
      return false;
    }
    return true;
  }

  function errorCantidad(l: LineaRevision): string | null {
    const c = cambioDe(l);
    if (c.rechazada) return null;
    const n = leerCantidad(c.cantidad);
    if (!c.cantidad || !esCantidadValida(n)) return 'Cantidad no válida (máx. 3 decimales; para quitarla, recházala).';
    if (!esMultiploDe(n, l.multiplo)) return `Debe ser múltiplo de ${l.multiplo}.`;
    return null;
  }

  const hayErrores = lineas.some((l) => errorCantidad(l));
  const numRechazadas = lineas.filter((l) => cambioDe(l).rechazada).length;
  const numModificadas = lineas.filter(
    (l) => !cambioDe(l).rechazada && Number(cambioDe(l).cantidad) !== l.cantidad
  ).length;
  const hayCambios = numRechazadas > 0 || numModificadas > 0;
  const todasRechazadas = lineas.length > 0 && numRechazadas === lineas.length;
  // Solicitud de lista de materiales sin ningún artículo (todo pendiente o rechazado)
  const sinArticulos = lineas.length === 0;

  const total = useMemo(
    () =>
      lineas.reduce((suma, l) => {
        const c = cambioDe(l);
        if (c.rechazada) return suma;
        const n = Number(c.cantidad);
        return suma + (Number.isFinite(n) ? n : 0) * l.precio;
      }, 0),
    [cambios, lineas]
  );

  function actualizar(id: string, parcial: Partial<Cambio>) {
    setCambios((prev) => {
      const base = prev[id] ?? { cantidad: String(lineas.find((x) => x.id === id)?.cantidad ?? ''), rechazada: false };
      return { ...prev, [id]: { ...base, ...parcial } };
    });
  }

  function paso(l: LineaRevision, signo: 1 | -1) {
    const actual = Number(cambioDe(l).cantidad) || 0;
    const paso = Math.max(l.multiplo, 1);
    const nuevo = Math.max(paso, actual + signo * paso);
    actualizar(l.id, { cantidad: String(nuevo) });
  }

  async function aprobar() {
    setEnviando(true);
    setError(null);
    if (!(await guardarComentarioSiCambia())) {
      setEnviando(false);
      return;
    }
    const payload = lineas
      .map((l) => {
        const c = cambioDe(l);
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
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="font-medium text-grafito mb-1">Artículos solicitados</h2>
          <p className="text-xs text-slate">
            Puedes aprobar tal cual, o antes de aprobar cambiar cantidades, rechazar líneas concretas o añadir artículos.
          </p>
        </div>
        <button type="button" onClick={() => setAnadiendo(true)} className="btn-secondary text-sm py-1.5">
          + Añadir artículo
        </button>
      </div>
      {anadiendo && <AnadirArticulo pedidoId={pedidoId} onCerrar={() => setAnadiendo(false)} />}

      <div className="bg-white border border-borde rounded-lg divide-y divide-borde mb-4">
        {lineas.map((l) => {
          const c = cambioDe(l);
          const err = errorCantidad(l);
          const modificada = !c.rechazada && Number(c.cantidad) !== l.cantidad;
          return (
            <div key={l.id} className={`p-4 text-sm ${c.rechazada ? 'bg-[#FBF3F3]' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[12rem]">
                  <p className={`text-grafito ${c.rechazada ? 'line-through text-slate' : ''}`}>
                    {l.nombre}
                    {anadidas.includes(l.id) && (
                      <span className="ml-2 align-middle text-[11px] font-medium text-[#1D4ED8] bg-[#DBEAFE] rounded px-1.5 py-0.5">Añadido por ti</span>
                    )}
                  </p>
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
                      step={pasoCantidad(l.multiplo)}
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

        <label className="block text-sm font-medium text-grafito mb-1" htmlFor="comentario-aprobador">
          Comentarios al comprador <span className="text-xs text-slate font-normal">(opcional)</span>
        </label>
        <textarea
          id="comentario-aprobador"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          maxLength={2000}
          rows={3}
          className="input w-full resize-y mb-1"
          placeholder="Observaciones para compras: proveedor o marca preferidos, urgencia, entrega…"
        />
        <p className="text-[11px] text-slate mb-4">Se guarda al aprobar. Los documentos se adjuntan en &quot;Documentos adjuntos&quot;, más arriba.</p>

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
            {sinArticulos && lineasListaSinResolver === 0 && (
              <p className="w-full text-sm text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2">
                Todas las líneas de la lista están rechazadas y la solicitud no tiene ningún artículo: recházala.
              </p>
            )}
            {lineasListaSinResolver > 0 && !todasRechazadas && (
              <p className="w-full text-sm text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2">
                Esta solicitud viene de una lista de materiales y tiene {lineasListaSinResolver}{' '}
                {lineasListaSinResolver === 1 ? 'línea pendiente' : 'líneas pendientes'}. Asígnales un artículo o recházalas
                en la sección de la lista (más abajo) para poder aprobarla.
              </p>
            )}
            <button
              onClick={aprobar}
              disabled={enviando || hayErrores || sinArticulos || (lineasListaSinResolver > 0 && !todasRechazadas)}
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


// Buscar en la tienda y añadir artículos a la solicitud (solo el aprobador, pendiente).
function AnadirArticulo({ pedidoId, onCerrar }: { pedidoId: string; onCerrar: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function buscar() {
    if (texto.trim().length < 2) return;
    setBuscando(true);
    setMensaje(null);
    const r = await buscarArticulosParaAnadir(texto);
    setBuscando(false);
    setResultados(r.articulos || []);
    if ('error' in r && r.error) setMensaje({ ok: false, texto: r.error });
  }

  async function anadir(a: any) {
    const m = a.multiplo_compra || 1;
    const n = Number((cantidades[a.id] ?? String(m)).replace(',', '.'));
    setOcupado(a.id);
    setMensaje(null);
    const r = await anadirArticuloAprobador(pedidoId, a.id, n);
    setOcupado(null);
    if (r.error) {
      setMensaje({ ok: false, texto: r.error });
      return;
    }
    setMensaje({ ok: true, texto: `Añadido: ${n} ${a.unidad_medida || 'ud.'} de ${a.nombre}` });
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-2xl my-8 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-grafito">Añadir artículo a la solicitud</h3>
            <p className="text-xs text-slate">Busca en la tienda por nombre, referencia o categoría.</p>
          </div>
          <button onClick={onCerrar} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            className="input flex-1"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') buscar();
              if (e.key === 'Escape') onCerrar();
            }}
            placeholder="Ej.: cinta aislante azul, GPQM0061…"
          />
          <button onClick={buscar} disabled={buscando || texto.trim().length < 2} className="btn-primary disabled:opacity-60">
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {mensaje && (
          <p className={`text-sm mb-2 ${mensaje.ok ? 'text-[#047857]' : 'text-rojo'}`}>{mensaje.ok ? '✓ ' : ''}{mensaje.texto}</p>
        )}
        <ul className="divide-y divide-borde border border-borde rounded-md max-h-[55vh] overflow-y-auto">
          {resultados.length === 0 && !buscando && <li className="p-3 text-sm text-slate">Escribe y pulsa Buscar.</li>}
          {resultados.map((a) => {
            const m = a.multiplo_compra || 1;
            return (
              <li key={a.id} className="p-2.5 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[12rem] text-sm">
                  <span className="text-grafito">{a.nombre}</span>
                  <span className="block text-xs text-slate font-mono">
                    {a.bc_item_no}
                    {m > 1 ? ` · múltiplo de ${m}` : ''}
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  step={m > 1 ? m : 'any'}
                  value={cantidades[a.id] ?? String(m)}
                  onChange={(e) => setCantidades((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  style={{ width: '6rem' }}
                  className="border border-borde rounded-md px-2 py-1.5 text-sm text-right font-mono"
                />
                <span className="text-xs text-slate w-8">{a.unidad_medida || 'ud'}</span>
                <button onClick={() => anadir(a)} disabled={ocupado === a.id} className="btn-primary text-sm py-1.5 disabled:opacity-60">
                  {ocupado === a.id ? 'Añadiendo…' : 'Añadir'}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end mt-3">
          <button onClick={onCerrar} className="btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
