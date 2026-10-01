'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Indicadores junto a la "Fecha estimada de entrega" de una línea:
//  - Check verde: el proveedor confirmó la fecha (al pulsar, fecha de la última actualización).
//  - "!" rojo: la línea sigue "Pendiente de recibir" y la fecha ya pasó (al pulsar, días de retraso).

function fechaLocal(valor: string): Date {
  // Solo la parte AAAA-MM-DD, a medianoche local, para contar días naturales.
  const [a, m, d] = valor.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

// Días de retraso (0 si no hay retraso o no aplica).
export function diasRetraso(fechaEstimada: string | null, estado: string | null): number {
  if (!fechaEstimada || (estado || 'Pendiente de recibir') !== 'Pendiente de recibir') return 0;
  const hoy = new Date();
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((hoyLocal.getTime() - fechaLocal(fechaEstimada).getTime()) / 86400000);
  return dias > 0 ? dias : 0;
}

export function formatearConfirmacion(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function Popover({
  boton,
  children,
  alinear,
  claseBorde,
}: {
  boton: (abrir: () => void) => ReactNode;
  children: ReactNode;
  alinear: 'derecha' | 'izquierda';
  claseBorde: string;
}) {
  // Posición fija en pantalla (calculada desde el botón) para que la tabla con
  // scroll horizontal no recorte el aviso en las últimas filas.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const ANCHO = 224;

  useEffect(() => {
    if (!pos) return;
    function cerrar() {
      setPos(null);
    }
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    }
    document.addEventListener('mousedown', onClickFuera);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', onClickFuera);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [pos]);

  function alternar() {
    if (pos) return setPos(null);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let left = alinear === 'derecha' ? r.right - ANCHO : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - ANCHO - 8));
    // Si no cabe debajo, se abre hacia arriba.
    const top = r.bottom + 90 > window.innerHeight ? r.top - 6 - 70 : r.bottom + 6;
    setPos({ top, left });
  }

  return (
    <span ref={ref} className="relative inline-flex">
      {boton(alternar)}
      {pos && (
        <span
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: ANCHO }}
          className={`z-50 rounded-md bg-white border ${claseBorde} shadow-lg px-3 py-2 text-xs font-sans text-grafito text-left whitespace-normal`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function ConfirmacionProveedorCheck({ confirmadaEn }: { confirmadaEn: string | null }) {
  if (!confirmadaEn) return null;
  return (
    <Popover
      alinear="derecha"
      claseBorde="border-marcaClaro"
      boton={(abrir) => (
        <button
          type="button"
          onClick={abrir}
          aria-label="Fecha confirmada por el proveedor"
          title="Fecha confirmada por el proveedor"
          className="w-5 h-5 rounded-full bg-marca text-white flex items-center justify-center shrink-0 hover:opacity-80"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      )}
    >
      <span className="block font-medium text-marca mb-0.5">Fecha confirmada por el proveedor</span>
      <span className="block">Últ. actualización: {formatearConfirmacion(confirmadaEn)}</span>
    </Popover>
  );
}

export function RetrasoAviso({ dias }: { dias: number }) {
  if (dias <= 0) return null;
  return (
    <Popover
      alinear="izquierda"
      claseBorde="border-[#E7C7C7]"
      boton={(abrir) => (
        <button
          type="button"
          onClick={abrir}
          aria-label={`Entrega con ${dias} días de retraso`}
          title="Entrega con retraso"
          className="font-sans font-bold text-[#D92D20] hover:text-[#8F1D15] text-base leading-none px-1"
        >
          !
        </button>
      )}
    >
      <span className="block font-medium text-[#B42318] mb-0.5">Entrega con retraso</span>
      <span className="block">
        {dias === 1 ? '1 día' : `${dias} días`} de retraso sobre la fecha estimada de entrega.
      </span>
    </Popover>
  );
}
