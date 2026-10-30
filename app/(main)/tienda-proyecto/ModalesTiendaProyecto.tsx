'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ampliarArticuloTiendaProyecto,
  historialArticuloTiendaProyecto,
  modificarArticuloTiendaProyecto,
  type EntradaHistorialTienda,
} from '@/app/actions/tienda-proyecto';
import type { ConsumoArticulo } from '@/lib/tienda-proyecto';
import { formatoCantidad, leerCantidad } from '@/lib/cantidad';

export function Modal({ titulo, subtitulo, onCerrar, children }: { titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCerrar}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-grafito leading-tight">{titulo}</h2>
            {subtitulo && <p className="text-sm text-slate mt-0.5">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} className="text-slate hover:text-grafito text-xl leading-none" aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HistorialModal({ a, onCerrar }: { a: ConsumoArticulo; onCerrar: () => void }) {
  const [historial, setHistorial] = useState<EntradaHistorialTienda[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const u = a.producto.unidad_medida || 'ud.';
  useEffect(() => {
    historialArticuloTiendaProyecto(a.articulo_id).then((r) => {
      if (r.error) setError(r.error);
      else setHistorial(r.historial || []);
    });
  }, [a.articulo_id]);

  function texto(h: EntradaHistorialTienda) {
    const c = (n: number | null) => `${formatoCantidad(n)} ${u}`;
    switch (h.tipo) {
      case 'alta':
        return `Alta en la tienda del proyecto: cantidad máxima ${c(h.valor_nuevo)}, cantidad inicial ${c(h.cantidad ?? 0)}`;
      case 'cantidad_maxima':
        return `Cantidad máxima: ${c(h.valor_anterior)} → ${c(h.valor_nuevo)}`;
      case 'cantidad_inicial':
        return `Cantidad inicial: ${c(h.valor_anterior)} → ${c(h.valor_nuevo)}`;
      case 'ampliacion':
        return (h.cantidad ?? 0) < 0
          ? `Reducción de ${c(Math.abs(h.cantidad ?? 0))} (autorizado: ${c(h.valor_anterior)} → ${c(h.valor_nuevo)})`
          : `Ampliación de ${c(h.cantidad)} (autorizado: ${c(h.valor_anterior)} → ${c(h.valor_nuevo)})`;
    }
  }

  return (
    <Modal titulo="Historial de modificaciones" subtitulo={a.producto.nombre} onCerrar={onCerrar}>
      {error && <p className="text-sm text-rojo">{error}</p>}
      {!historial && !error && <p className="text-sm text-slate">Cargando…</p>}
      {historial && historial.length === 0 && <p className="text-sm text-slate">Sin modificaciones registradas.</p>}
      {historial && historial.length > 0 && (
        <ol className="relative border-l-2 border-borde ml-1.5 space-y-4">
          {historial.map((h) => (
            <li key={h.id} className="pl-4 relative">
              <span
                className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                  h.tipo === 'ampliacion' ? 'bg-[#5B3E8C]' : h.tipo === 'alta' ? 'bg-marca' : 'bg-acero'
                }`}
              />
              <p className="text-sm text-grafito">
                {h.tipo === 'ampliacion' && (
                  <span className="mr-1.5 rounded bg-[#EEE8F7] text-[#5B3E8C] px-1.5 py-0.5 text-[11px] font-semibold align-middle">Ampliación</span>
                )}
                {texto(h)}
              </p>
              <p className="text-xs text-slate mt-0.5">
                {h.usuario_nombre || 'Usuario'} · {fechaHora(h.created_at)}
                {h.numero_app && h.pedido_id && (
                  <>
                    {' '}
                    · solicitud{' '}
                    <Link href={`/lineas-compras/${h.pedido_id}`} className="text-marca hover:underline font-mono">
                      {h.numero_app}
                    </Link>
                  </>
                )}
              </p>
              {h.comentario && (
                <p className="text-sm text-grafito bg-fondo border border-borde rounded-md px-2.5 py-1.5 mt-1.5 whitespace-pre-wrap">{h.comentario}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export function ModificarModal({
  a,
  modo,
  onCerrar,
  onGuardado,
}: {
  a: ConsumoArticulo;
  modo: 'cantidades' | 'ampliacion';
  onCerrar: () => void;
  onGuardado: (aviso?: string) => void;
}) {
  const u = a.producto.unidad_medida || 'ud.';
  const [maxima, setMaxima] = useState(String(a.cantidad_maxima));
  const [inicial, setInicial] = useState(String(a.cantidad_inicial));
  const [ampliacion, setAmpliacion] = useState(a.excedido > 0 ? String(a.excedido) : '');
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setGuardando(true);
    const r =
      modo === 'cantidades'
        ? await modificarArticuloTiendaProyecto(a.articulo_id, {
            cantidad_maxima: leerCantidad(maxima),
            cantidad_inicial: leerCantidad(inicial || '0'),
            comentario,
          })
        : await ampliarArticuloTiendaProyecto(a.articulo_id, leerCantidad(ampliacion), comentario);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    onGuardado(
      excesoTras > 0
        ? `Atención: "${a.producto.nombre}" queda excedido en ${formatoCantidad(excesoTras)} ${u} (consumido ${formatoCantidad(
            a.consumido
          )} ${u} de ${formatoCantidad(limiteTras)} ${u} autorizados).`
        : undefined
    );
  }

  const nuevaAmpliacion = leerCantidad(ampliacion) || 0;
  // Límite y consumo tras el cambio, para avisar si el artículo queda excedido.
  const limiteTras =
    modo === 'cantidades'
      ? (leerCantidad(maxima) || 0) + a.cantidad_ampliada
      : a.limite + nuevaAmpliacion;
  const consumidoTras = modo === 'cantidades' ? a.solicitado + (leerCantidad(inicial || '0') || 0) : a.consumido;
  const excesoTras = Math.round((consumidoTras - limiteTras) * 1000) / 1000;
  return (
    <Modal titulo={modo === 'cantidades' ? 'Modificar cantidades' : 'Ampliación'} subtitulo={a.producto.nombre} onCerrar={onCerrar}>
      {modo === 'cantidades' ? (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-sm text-grafito">
            Cantidad máxima ({u})
            <input type="number" min={0} step="any" value={maxima} onChange={(e) => setMaxima(e.target.value)} className="input mt-1 font-mono" />
            {a.cantidad_ampliada !== 0 && (
              <span className="text-[11px] text-slate">
                Sin contar las ampliaciones ({a.cantidad_ampliada > 0 ? '+' : '−'}
                {formatoCantidad(Math.abs(a.cantidad_ampliada))} {u}).
              </span>
            )}
          </label>
          <label className="text-sm text-grafito">
            Cantidad inicial ({u})
            <input type="number" min={0} step="any" value={inicial} onChange={(e) => setInicial(e.target.value)} className="input mt-1 font-mono" />
            <span className="text-[11px] text-slate">Consumo anterior que no está en la app.</span>
          </label>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-sm text-slate mb-2">
            Autorizado ahora: <b className="text-grafito">{formatoCantidad(a.limite)} {u}</b> · consumido {formatoCantidad(a.consumido)} {u}
            {a.excedido > 0 && <span className="text-rojo"> · excedido en {formatoCantidad(a.excedido)} {u}</span>}
          </p>
          <label className="text-sm text-grafito">
            Ampliar en ({u}) <span className="text-xs text-slate">· en negativo para reducir lo autorizado</span>
            <input type="number" step="any" value={ampliacion} onChange={(e) => setAmpliacion(e.target.value)} className="input mt-1 font-mono" autoFocus />
          </label>
          {nuevaAmpliacion !== 0 && (
            <p className="text-xs text-slate mt-1">
              Quedará autorizado: {formatoCantidad(a.limite + nuevaAmpliacion)} {u} ({formatoCantidad(a.cantidad_maxima)} de cantidad máxima{' '}
              {a.cantidad_ampliada + nuevaAmpliacion >= 0 ? '+' : '−'} {formatoCantidad(Math.abs(a.cantidad_ampliada + nuevaAmpliacion))} de
              ampliaciones).
            </p>
          )}
        </div>
      )}
      <label className="block text-sm text-grafito mb-1" htmlFor="comentario-tienda">
        Comentario <span className="text-xs text-slate">(opcional, queda en el historial)</span>
      </label>
      <textarea
        id="comentario-tienda"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={1000}
        rows={3}
        className="input resize-y mb-3"
        placeholder={modo === 'ampliacion' ? 'Motivo de la ampliación…' : 'Motivo del cambio…'}
      />
      {excesoTras > 0 && limiteTras > 0 && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">
          Con este cambio el artículo quedará <b>excedido en {formatoCantidad(excesoTras)} {u}</b>: consumido{' '}
          {formatoCantidad(consumidoTras)} {u} de {formatoCantidad(limiteTras)} {u} autorizados.
        </p>
      )}
      {error && <p className="text-sm text-rojo mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="btn-secondary" disabled={guardando}>
          Cancelar
        </button>
        <button type="button" onClick={guardar} className="btn-primary" disabled={guardando}>
          {guardando
            ? 'Guardando…'
            : excesoTras > 0
              ? 'Guardar igualmente'
              : modo === 'ampliacion'
                ? nuevaAmpliacion < 0
                  ? 'Reducir lo autorizado'
                  : 'Autorizar ampliación'
                : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}
