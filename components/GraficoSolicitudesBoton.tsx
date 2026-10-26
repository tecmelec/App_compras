'use client';

import { useEffect, useMemo, useState } from 'react';

// "Ver gráfico" en las listas de solicitudes: agrupa las solicitudes visibles (con los
// filtros aplicados) por solicitante, comprador u obra y muestra cuántas hay en cada
// estado, como barras apiladas.
export type FilaGrafico = {
  solicitante: string;
  comprador?: string | null;
  nro_obra?: string;
  nombre_obra?: string;
  estado: string | null;
};
type Agrupacion = 'solicitante' | 'comprador' | 'obra';

const PALETA_EXTRA = ['#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#64748B'];

function colorEstado(estado: string, i: number): string {
  const e = estado.toLowerCase();
  if (e.includes('anulad') || e.includes('rechaz') || e.includes('cancel')) return '#DC2626';
  if (e.includes('parcial')) return '#2563EB';
  if (e.includes('pendiente')) return '#F59E0B';
  if (e.includes('tramitad') || e.includes('recibid') || e.includes('complet')) return '#059669';
  return PALETA_EXTRA[i % PALETA_EXTRA.length];
}

export default function GraficoSolicitudesBoton({
  filas,
  conComprador,
}: {
  filas: FilaGrafico[];
  conComprador: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [agrupacion, setAgrupacion] = useState<Agrupacion | null>(null);

  useEffect(() => {
    if (!agrupacion) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setAgrupacion(null);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [agrupacion]);

  const datos = useMemo(() => {
    if (!agrupacion) return null;
    const clave = (f: FilaGrafico) =>
      agrupacion === 'solicitante'
        ? f.solicitante || 'Sin solicitante'
        : agrupacion === 'comprador'
          ? f.comprador || 'Sin comprador'
          : f.nro_obra
            ? `${f.nro_obra}${f.nombre_obra ? ' — ' + f.nombre_obra : ''}`
            : 'Sin obra';
    const conteoEstados = new Map<string, number>();
    const grupos = new Map<string, Map<string, number>>();
    for (const f of filas) {
      const estado = f.estado || 'Sin estado';
      conteoEstados.set(estado, (conteoEstados.get(estado) || 0) + 1);
      const k = clave(f);
      if (!grupos.has(k)) grupos.set(k, new Map());
      const g = grupos.get(k)!;
      g.set(estado, (g.get(estado) || 0) + 1);
    }
    // Estados ordenados por número total de solicitudes (los más frecuentes primero).
    const estados = Array.from(conteoEstados.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([e], i) => ({ nombre: e, color: colorEstado(e, i), total: conteoEstados.get(e)! }));
    const filasGrafico = Array.from(grupos.entries())
      .map(([nombre, porEstado]) => ({
        nombre,
        porEstado,
        total: Array.from(porEstado.values()).reduce((s, n) => s + n, 0),
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
    const maximo = Math.max(1, ...filasGrafico.map((g) => g.total));
    return { estados, filasGrafico, maximo };
  }, [agrupacion, filas]);

  const opciones: { valor: Agrupacion; texto: string }[] = [
    { valor: 'solicitante', texto: 'Solicitante' },
    ...(conComprador ? [{ valor: 'comprador' as const, texto: 'Comprador' }] : []),
    { valor: 'obra', texto: 'Obra' },
  ];
  const titulo = { solicitante: 'solicitante', comprador: 'comprador', obra: 'obra' };

  return (
    <div data-tour="ver-grafico" className="relative ml-auto">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        className="btn-secondary inline-flex items-center gap-2 text-sm"
        disabled={filas.length === 0}
        title={filas.length === 0 ? 'No hay solicitudes visibles' : 'Gráfico de las solicitudes visibles por estado'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
        Ver gráfico
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-0 mt-1 z-40 bg-white border border-borde rounded-md shadow-lg py-1 min-w-[180px]">
            <p className="px-3 py-1 text-xs text-slate">Agrupar por</p>
            {opciones.map((o) => (
              <button
                key={o.valor}
                onClick={() => {
                  setMenu(false);
                  setAgrupacion(o.valor);
                }}
                className="block w-full text-left px-3 py-1.5 text-sm text-grafito hover:bg-fondo"
              >
                {o.texto}
              </button>
            ))}
          </div>
        </>
      )}

      {agrupacion && datos && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setAgrupacion(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-borde">
              <div>
                <h2 className="text-lg font-semibold text-grafito">Solicitudes por {titulo[agrupacion]} y estado</h2>
                <p className="text-xs text-slate">
                  {filas.length} solicitud{filas.length === 1 ? '' : 'es'} visibles con los filtros actuales · {datos.filasGrafico.length}{' '}
                  {agrupacion === 'obra' ? 'obras' : agrupacion === 'comprador' ? 'compradores' : 'solicitantes'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input text-sm py-1"
                  value={agrupacion}
                  onChange={(e) => setAgrupacion(e.target.value as Agrupacion)}
                >
                  {opciones.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      Por {o.texto.toLowerCase()}
                    </option>
                  ))}
                </select>
                <button onClick={() => setAgrupacion(null)} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
                  ×
                </button>
              </div>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-4 text-xs">
              {datos.estados.map((e) => (
                <span key={e.nombre} className="inline-flex items-center gap-1.5 text-grafito">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: e.color }} />
                  {e.nombre} <span className="text-slate">({e.total})</span>
                </span>
              ))}
            </div>

            {/* Barras apiladas */}
            <div className="px-5 py-4 space-y-2 max-h-[65vh] overflow-y-auto">
              {datos.filasGrafico.map((g) => (
                <div key={g.nombre} className="grid grid-cols-[minmax(0,240px)_1fr_40px] items-center gap-3">
                  <span className="text-sm text-grafito truncate" title={g.nombre}>
                    {g.nombre}
                  </span>
                  <div className="flex h-6 rounded overflow-hidden bg-fondo" style={{ width: `${(g.total / datos.maximo) * 100}%`, minWidth: '1.5rem' }}>
                    {datos.estados
                      .filter((e) => g.porEstado.get(e.nombre))
                      .map((e) => {
                        const n = g.porEstado.get(e.nombre)!;
                        return (
                          <div
                            key={e.nombre}
                            className="h-full flex items-center justify-center text-[11px] font-medium text-white"
                            style={{ width: `${(n / g.total) * 100}%`, backgroundColor: e.color }}
                            title={`${g.nombre} · ${e.nombre}: ${n}`}
                          >
                            {n}
                          </div>
                        );
                      })}
                  </div>
                  <span className="text-sm font-semibold text-grafito text-right">{g.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
