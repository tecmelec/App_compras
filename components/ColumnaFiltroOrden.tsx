'use client';

import { useEffect, useState } from 'react';

export default function ColumnaFiltroOrden<T extends string>({
  titulo,
  campoOrden,
  ordenActual,
  onOrdenar,
  columnaId,
  columnaAbierta,
  setColumnaAbierta,
  activoFiltro,
  children,
}: {
  titulo: string;
  campoOrden: T;
  ordenActual: { campo: T; asc: boolean } | null;
  onOrdenar: (campo: T, asc: boolean) => void;
  columnaId: string;
  columnaAbierta: string | null;
  setColumnaAbierta: (v: string | null) => void;
  activoFiltro: boolean;
  children: React.ReactNode;
}) {
  const abierta = columnaAbierta === columnaId;
  const ordenActivo = ordenActual?.campo === campoOrden;
  const [mostrarFiltro, setMostrarFiltro] = useState(false);

  useEffect(() => {
    if (!abierta) setMostrarFiltro(false);
  }, [abierta]);

  return (
    <th className="px-4 py-3 font-medium relative whitespace-nowrap">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setColumnaAbierta(abierta ? null : columnaId);
        }}
        className={`flex items-center gap-1.5 ${ordenActivo || activoFiltro ? 'text-marca' : ''}`}
      >
        {titulo}
        {ordenActivo && <span className="text-xs">{ordenActual!.asc ? '↑' : '↓'}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {activoFiltro && <span className="w-1.5 h-1.5 rounded-full bg-marca inline-block" />}
      </button>

      {abierta && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 top-full left-0 mt-1 bg-white border border-borde rounded-lg shadow-lg font-normal normal-case w-64 overflow-hidden"
        >
          {!mostrarFiltro ? (
            <div className="py-1">
              <button
                onClick={() => {
                  onOrdenar(campoOrden, true);
                  setColumnaAbierta(null);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-fondo flex items-center gap-2.5 text-grafito"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="14" y2="6" />
                  <line x1="4" y1="12" x2="11" y2="12" />
                  <line x1="4" y1="18" x2="8" y2="18" />
                  <polyline points="17 14 20 11 23 14" />
                  <line x1="20" y1="11" x2="20" y2="21" />
                </svg>
                Ascendente
              </button>
              <button
                onClick={() => {
                  onOrdenar(campoOrden, false);
                  setColumnaAbierta(null);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-fondo flex items-center gap-2.5 text-grafito"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="8" y2="6" />
                  <line x1="4" y1="12" x2="11" y2="12" />
                  <line x1="4" y1="18" x2="14" y2="18" />
                  <polyline points="17 14 20 17 23 14" />
                  <line x1="20" y1="7" x2="20" y2="17" />
                </svg>
                Descendente
              </button>
              <div className="border-t border-borde my-1" />
              <button
                onClick={() => setMostrarFiltro(true)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-fondo flex items-center gap-2.5 text-grafito"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filtrar…
              </button>
            </div>
          ) : (
            <div className="p-3">
              <button
                onClick={() => setMostrarFiltro(false)}
                className="text-xs text-slate hover:text-grafito mb-2 flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Volver
              </button>
              <p className="text-xs text-slate mb-2">Filtrar lista por:</p>
              {children}
            </div>
          )}
        </div>
      )}
    </th>
  );
}
