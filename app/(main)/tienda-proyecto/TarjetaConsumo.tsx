'use client';

import type { ConsumoArticulo } from '@/lib/tienda-proyecto';
import { formatoCantidad } from '@/lib/cantidad';

// Colores de los tramos de la barra (paleta de la app).
export const COLOR_TRAMO = {
  inicial: '#2F6690', // acero: gastado antes de la app
  recibido: '#178A4C', // marca
  pendiente: '#E8A33D', // ámbar
  libre: '#E6E9E8',
  excedido: '#B54A4A', // rojo
};

export function unidadDe(a: { producto: { unidad_medida: string | null } }) {
  return a.producto.unidad_medida || 'ud.';
}

export function EstadoConsumoBadge({ a }: { a: ConsumoArticulo }) {
  if (a.estado === 'excedido')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F6E9E9] text-rojo border border-[#E7C7C7] px-2 py-0.5 text-[11px] font-medium">
        <IconoAlerta /> Excedido en {formatoCantidad(a.excedido)} {unidadDe(a)}
      </span>
    );
  if (a.estado === 'agotado')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F6E9E9] text-rojo border border-[#E7C7C7] px-2 py-0.5 text-[11px] font-medium">
        <IconoAlerta /> Agotado
      </span>
    );
  if (a.estado === 'alerta')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF2E3] text-[#8A5A15] border border-[#F2D9AE] px-2 py-0.5 text-[11px] font-medium">
        <IconoAlerta /> {Math.floor(a.porcentaje * 100)} % consumido
      </span>
    );
  return null;
}

function IconoAlerta() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function BotonInfo({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Historial de modificaciones"
      aria-label="Historial de modificaciones"
      className="w-6 h-6 rounded-full border border-borde text-slate hover:text-marca hover:border-marca inline-flex items-center justify-center shrink-0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="12" y1="7" x2="12.01" y2="7" />
      </svg>
    </button>
  );
}

// Barra de consumo: inicial | recibido | pendiente de recibir | libre (o excedido).
export function BarraConsumo({ a, alta = 'h-3' }: { a: ConsumoArticulo; alta?: string }) {
  const escala = Math.max(a.limite, a.consumido) || 1;
  const pct = (n: number) => `${Math.max(0, (n / escala) * 100)}%`;
  // Lo que pasa del límite se pinta en rojo, quitándolo del último tramo con cantidad.
  let inicial = a.cantidad_inicial;
  let recibido = a.recibido;
  let pendiente = a.pendiente_recibir;
  let exceso = a.excedido;
  const quitar = (n: number) => {
    const q = Math.min(n, exceso);
    exceso -= q;
    return n - q;
  };
  pendiente = quitar(pendiente);
  recibido = quitar(recibido);
  inicial = quitar(inicial);
  const tramos = [
    { n: inicial, color: COLOR_TRAMO.inicial, t: 'Inicial' },
    { n: recibido, color: COLOR_TRAMO.recibido, t: 'Recibido' },
    { n: pendiente, color: COLOR_TRAMO.pendiente, t: 'Pendiente de recibir' },
    { n: a.excedido, color: COLOR_TRAMO.excedido, t: 'Excedido' },
  ].filter((t) => t.n > 0);
  return (
    <div className={`relative w-full ${alta} rounded-full overflow-hidden flex`} style={{ background: COLOR_TRAMO.libre }}>
      {tramos.map((t, i) => (
        <div
          key={t.t}
          title={`${t.t}: ${formatoCantidad(t.n)}`}
          style={{ width: pct(t.n), background: t.color }}
          className={i > 0 ? 'border-l-2 border-white' : ''}
        />
      ))}
      {a.excedido > 0 && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-grafito" style={{ left: pct(a.limite) }} title="Límite autorizado" />
      )}
    </div>
  );
}

export default function TarjetaConsumo({
  a,
  onInfo,
  onModificar,
  onAmpliar,
}: {
  a: ConsumoArticulo;
  onInfo: () => void;
  onModificar?: () => void;
  onAmpliar?: () => void;
}) {
  const u = unidadDe(a);
  const colorDisponible =
    a.estado === 'ok' ? 'text-marca' : a.estado === 'alerta' ? 'text-[#B7791F]' : 'text-rojo';
  const marco =
    a.estado === 'excedido' || a.estado === 'agotado'
      ? 'border-[#E7C7C7]'
      : a.estado === 'alerta'
        ? 'border-[#F2D9AE]'
        : 'border-borde';
  return (
    <div className={`bg-white border ${marco} rounded-lg p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-grafito text-base sm:text-lg leading-tight">{a.producto.nombre}</h3>
            <BotonInfo onClick={onInfo} />
          </div>
          <p className="text-xs text-slate mt-0.5">
            <span className="font-mono">{a.producto.bc_item_no || 'Sin código'}</span>
            {!a.producto.visible && <span> · no publicado en la tienda</span>}
            {a.num_solicitudes > 0 && (
              <span>
                {' '}
                · {a.num_solicitudes} {a.num_solicitudes === 1 ? 'solicitud' : 'solicitudes'}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <EstadoConsumoBadge a={a} />
            {a.cantidad_ampliada > 0 && (
              <span className="rounded-full bg-[#EEE8F7] text-[#5B3E8C] border border-[#DCD0EE] px-2 py-0.5 text-[11px] font-medium">
                Ampliación +{formatoCantidad(a.cantidad_ampliada)} {u}
              </span>
            )}
            {a.ampliacion_pendiente > 0 && (
              <span className="rounded-full bg-[#FDF2E3] text-[#8A5A15] border border-[#F2D9AE] px-2 py-0.5 text-[11px] font-medium">
                {formatoCantidad(a.ampliacion_pendiente)} {u} pendientes de aprobar ampliación
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-3xl sm:text-4xl font-semibold leading-none ${colorDisponible}`}>{formatoCantidad(a.disponible)}</p>
          <p className="text-xs text-slate mt-1">{u} disponibles</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 text-sm text-slate mt-4 mb-1.5">
        <span>
          {formatoCantidad(a.consumido)} {u} consumidos de {formatoCantidad(a.limite)} {u}
        </span>
        <span className="text-right">
          {formatoCantidad(a.limite)} {u} autorizados
          {a.cantidad_ampliada > 0 && (
            <span className="block text-[11px]">
              {formatoCantidad(a.cantidad_maxima)} + {formatoCantidad(a.cantidad_ampliada)} ampliación
            </span>
          )}
        </span>
      </div>
      <BarraConsumo a={a} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-sm">
        <Leyenda color={COLOR_TRAMO.inicial} valor={a.cantidad_inicial} u={u} texto="inicial" />
        <Leyenda color={COLOR_TRAMO.recibido} valor={a.recibido} u={u} texto="recibidos" />
        <Leyenda color={COLOR_TRAMO.pendiente} valor={a.pendiente_recibir} u={u} texto="pendientes de recibir" />
        <Leyenda color="#9AA1A9" valor={a.disponible} u={u} texto="pendientes de solicitar" />
      </div>

      {(onModificar || onAmpliar) && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-borde">
          {onModificar && (
            <button type="button" onClick={onModificar} className="btn-secondary text-sm py-1.5">
              Modificar cantidades
            </button>
          )}
          {onAmpliar && (
            <button
              type="button"
              onClick={onAmpliar}
              className={`text-sm py-1.5 ${a.estado === 'ok' ? 'btn-secondary' : 'btn-primary'}`}
            >
              Ampliación
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Leyenda({ color, valor, u, texto }: { color: string; valor: number; u: string; texto: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0 translate-y-0.5" style={{ background: color }} />
      <span className="font-semibold text-grafito">
        {formatoCantidad(valor)} {u}
      </span>
      <span className="text-slate text-xs truncate">{texto}</span>
    </div>
  );
}
