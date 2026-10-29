'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aprobarSolicitudConCambios, responderAprobacion } from '@/app/actions/pedidos';
import { anadirArticuloAprobador, guardarComentarioAprobador } from '@/app/actions/aprobacion-extras';
import { buscarArticulosParaAlta } from '@/app/actions/alta-articulos';
import { datosArticuloParaAsignar } from '@/app/actions/lista-foto';
import { formatoPrecioUnitario, formatoImporte } from '@/lib/formato';
import { esCantidadValida, esMultiploDe, formatoCantidad, leerCantidad, pasoCantidad } from '@/lib/cantidad';

export type LineaRevision = {
  id: string;
  productoId?: string;
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
  tienda = {},
}: {
  pedidoId: string;
  lineas: LineaRevision[];
  // Lista en foto: líneas sin artículo ni rechazar (bloquean la aprobación, no el rechazo)
  lineasListaSinResolver?: number;
  comentarioInicial?: string;
  anadidas?: string[];
  // Tienda por proyecto: lo que queda de cada artículo (producto_id) sin esta solicitud.
  tienda?: Record<string, { disponible: number; limite: number; unidad: string }>;
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

  // Tienda por proyecto: artículos que, con las cantidades a aprobar, superan lo que queda.
  const [ampliacionesOk, setAmpliacionesOk] = useState<Record<string, boolean>>({});
  const excesosTienda = useMemo(() => {
    const porProducto = new Map<string, { nombre: string; cantidad: number }>();
    for (const l of lineas) {
      const c = cambioDe(l);
      if (!l.productoId || c.rechazada || !tienda[l.productoId]) continue;
      const n = Number(c.cantidad);
      const prev = porProducto.get(l.productoId) || { nombre: l.nombre, cantidad: 0 };
      porProducto.set(l.productoId, { nombre: prev.nombre, cantidad: prev.cantidad + (Number.isFinite(n) ? n : 0) });
    }
    const lista: { productoId: string; nombre: string; pedido: number; disponible: number; limite: number; unidad: string; exceso: number }[] = [];
    porProducto.forEach((v, productoId) => {
      const t = tienda[productoId];
      if (v.cantidad > t.disponible + 1e-9) {
        lista.push({ productoId, nombre: v.nombre, pedido: v.cantidad, ...t, exceso: Math.round((v.cantidad - t.disponible) * 1000) / 1000 });
      }
    });
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cambios, lineas, tienda]);
  const faltanAmpliaciones = excesosTienda.some((x) => !ampliacionesOk[x.productoId]);

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

    const r = await aprobarSolicitudConCambios(
      pedidoId,
      payload,
      excesosTienda.filter((x) => ampliacionesOk[x.productoId]).map((x) => x.productoId)
    );
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
              {!c.rechazada && l.productoId && excesosTienda.some((x) => x.productoId === l.productoId) && (
                <p className="text-xs text-rojo mt-1.5">
                  Supera la tienda del proyecto: quedan {formatoCantidad(tienda[l.productoId]?.disponible)} {tienda[l.productoId]?.unidad}{' '}
                  de {formatoCantidad(tienda[l.productoId]?.limite)}. Reduce la cantidad o aprueba la ampliación (abajo).
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end text-sm mb-6">
        <span className="text-slate mr-2">Total {hayCambios ? 'tras tus cambios' : 'estimado'}:</span>
        <span className="font-mono text-grafito">{formatoImporte(total)} €</span>
      </div>

      {excesosTienda.length > 0 && !todasRechazadas && (
        <div className="bg-[#FBF3F3] border border-[#E7C7C7] rounded-lg p-4 mb-4">
          <h2 className="font-medium text-rojo mb-1">Supera lo autorizado en la tienda del proyecto</h2>
          <p className="text-xs text-slate mb-3">Reduce la cantidad de estas líneas o aprueba la ampliación para poder aprobar la solicitud.</p>
          <div className="space-y-2">
            {excesosTienda.map((x) => (
              <label key={x.productoId} className="flex items-start gap-2 bg-white border border-borde rounded-md p-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!ampliacionesOk[x.productoId]}
                  onChange={(e) => setAmpliacionesOk((prev) => ({ ...prev, [x.productoId]: e.target.checked }))}
                />
                <span>
                  <span className="text-grafito">{x.nombre}</span>
                  <span className="block text-xs text-slate">
                    Se piden {formatoCantidad(x.pedido)} {x.unidad} · quedan {formatoCantidad(x.disponible)} de {formatoCantidad(x.limite)} {x.unidad} ·{' '}
                    <b className="text-grafito">Aprobar ampliación de {formatoCantidad(x.exceso)} {x.unidad}</b>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

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
              disabled={
                enviando ||
                hayErrores ||
                sinArticulos ||
                (lineasListaSinResolver > 0 && !todasRechazadas) ||
                (faltanAmpliaciones && !todasRechazadas)
              }
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


// Añadir artículos de BC a la solicitud (solo el aprobador, pendiente). Mismo buscador
// que "Asignar artículo" de las listas: por código o por descripción en el catálogo de BC.
type ArticuloBC = { No: string; Description: string };
type DatosArticulo = { bc_item_no: string; descripcion: string; unidad: string; multiplo: number; en_tienda: boolean };

function AnadirArticulo({ pedidoId, onCerrar }: { pedidoId: string; onCerrar: () => void }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [campoActivo, setCampoActivo] = useState<'codigo' | 'descripcion' | null>(null);
  const [resultados, setResultados] = useState<ArticuloBC[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [datos, setDatos] = useState<DatosArticulo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const contador = useRef(0);

  useEffect(() => {
    if (datos || !campoActivo) return;
    const t0 = campoActivo === 'codigo' ? codigo : descripcion;
    if (t0.trim().length < 2) {
      setResultados([]);
      return;
    }
    const id = ++contador.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarArticulosParaAlta(t0, campoActivo);
      if (id !== contador.current) return;
      setBuscando(false);
      if (r.error) setMensaje({ ok: false, texto: r.error });
      setResultados((r.articulos as ArticuloBC[]) || []);
    }, 350);
    return () => clearTimeout(t);
  }, [codigo, descripcion, campoActivo, datos]);

  async function elegir(a: ArticuloBC) {
    setCodigo(a.No);
    setDescripcion(a.Description);
    setResultados([]);
    setMensaje(null);
    setCargando(true);
    const r = await datosArticuloParaAsignar(a.No);
    setCargando(false);
    if (r.error || !r.articulo) {
      setMensaje({ ok: false, texto: r.error || 'No se pudo leer el artículo.' });
      return;
    }
    setDatos(r.articulo as DatosArticulo);
    setCantidad(String(r.articulo.multiplo || 1));
  }

  function limpiar() {
    setDatos(null);
    setCodigo('');
    setDescripcion('');
    setCantidad('');
    setResultados([]);
    setCampoActivo(null);
  }

  const n = Number(cantidad.replace(',', '.'));
  const errorCantidad = !datos
    ? null
    : !(n > 0)
      ? 'Indica una cantidad.'
      : datos.multiplo > 1 && Math.abs(n / datos.multiplo - Math.round(n / datos.multiplo)) > 1e-9
        ? `Debe ser múltiplo de ${datos.multiplo}.`
        : null;

  async function anadir() {
    if (!datos || errorCantidad) return;
    setGuardando(true);
    setMensaje(null);
    const r = await anadirArticuloAprobador(pedidoId, datos.bc_item_no, n);
    setGuardando(false);
    if (r.error) {
      setMensaje({ ok: false, texto: r.error });
      return;
    }
    setMensaje({ ok: true, texto: `Añadido: ${cantidad} ${datos.unidad} de ${datos.descripcion}` });
    limpiar();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-2xl my-8 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-grafito">Añadir artículo a la solicitud</h3>
            <p className="text-xs text-slate">Busca en el catálogo de Business Central por código o por descripción.</p>
          </div>
          <button onClick={onCerrar} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <input
            className="input font-mono"
            placeholder="Código BC"
            value={codigo}
            disabled={!!datos}
            onFocus={() => setCampoActivo('codigo')}
            onChange={(e) => {
              setCodigo(e.target.value);
              setCampoActivo('codigo');
            }}
          />
          <input
            className="input"
            placeholder="Descripción (p. ej. cinta aislante azul)"
            value={descripcion}
            disabled={!!datos}
            onFocus={() => setCampoActivo('descripcion')}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setCampoActivo('descripcion');
            }}
            onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
          />
        </div>
        {buscando && !datos && <p className="text-xs text-slate mt-2">Buscando en Business Central…</p>}
        {!datos && resultados.length > 0 && (
          <ul className="mt-2 border border-borde rounded-md divide-y divide-borde max-h-64 overflow-y-auto">
            {resultados.map((a) => (
              <li key={a.No}>
                <button type="button" onClick={() => elegir(a)} className="w-full text-left px-3 py-2 text-sm hover:bg-fondo">
                  <span className="font-mono text-xs text-slate mr-2">{a.No}</span>
                  {a.Description}
                </button>
              </li>
            ))}
          </ul>
        )}
        {cargando && <p className="text-xs text-slate mt-2">Leyendo el artículo…</p>}

        {datos && (
          <div className="mt-3 border border-borde rounded-md p-3">
            <p className="text-sm text-grafito">
              <span className="font-mono text-xs text-slate mr-2">{datos.bc_item_no}</span>
              {datos.descripcion}
            </p>
            {!datos.en_tienda && <p className="text-xs text-slate mt-0.5">No está en la tienda: se dará de alta en la app al añadirlo.</p>}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-sm text-slate">Cantidad</span>
              <input
                type="number"
                min={0}
                step={datos.multiplo > 1 ? datos.multiplo : 'any'}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                style={{ width: '7rem' }}
                className="border border-borde rounded-md px-2 py-1.5 text-sm text-right font-mono"
              />
              <span className="text-sm text-slate">
                {datos.unidad}
                {datos.multiplo > 1 ? ` · múltiplo de ${datos.multiplo}` : ''}
              </span>
              <button onClick={anadir} disabled={guardando || !!errorCantidad} className="btn-primary text-sm py-1.5 ml-auto disabled:opacity-60">
                {guardando ? 'Añadiendo…' : 'Añadir a la solicitud'}
              </button>
              <button onClick={limpiar} disabled={guardando} className="btn-secondary text-sm py-1.5">
                Otro artículo
              </button>
            </div>
            {errorCantidad && <p className="text-xs text-rojo mt-1">{errorCantidad}</p>}
          </div>
        )}

        {mensaje && <p className={`text-sm mt-3 ${mensaje.ok ? 'text-[#047857]' : 'text-rojo'}`}>{mensaje.ok ? '✓ ' : ''}{mensaje.texto}</p>}

        <div className="flex justify-end mt-4">
          <button onClick={onCerrar} className="btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
