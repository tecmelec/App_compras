'use client';

import { useEffect, useRef, useState } from 'react';

export type HistorialCantidad = {
  cantidad: number; // vigente
  cantidadOriginal: number | null; // lo que pidió el usuario (solo si alguien la cambió)
  cantidadAprobador: number | null; // lo que dejó el aprobador, si la cambió
  modificadaPorComprador: boolean; // el comprador la cambió después
};

// ¿Hay algo que contar? (alguien cambió la cantidad pedida)
export function cantidadFueModificada(h: HistorialCantidad): boolean {
  if (h.cantidadOriginal == null) return false;
  return h.cantidadOriginal !== h.cantidad || h.cantidadAprobador != null || h.modificadaPorComprador;
}

// "!" junto a la cantidad de una línea cuya cantidad cambió el aprobador y/o el
// comprador. Al pulsarlo muestra quién la cambió y a cuánto.
export default function CantidadModificadaAviso({
  historial,
  unidad,
  perspectiva = 'solicitante',
  alinear = 'derecha',
}: {
  historial: HistorialCantidad;
  unidad: string;
  perspectiva?: 'solicitante' | 'comprador';
  alinear?: 'derecha' | 'izquierda';
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [abierto]);

  if (!cantidadFueModificada(historial)) return null;

  const { cantidad, cantidadOriginal, cantidadAprobador, modificadaPorComprador } = historial;
  const cambioAprobador = cantidadAprobador != null;
  const quien =
    cambioAprobador && modificadaPorComprador
      ? 'el aprobador y Compras'
      : modificadaPorComprador
        ? 'Compras'
        : 'el aprobador';

  const lineas: string[] = [
    perspectiva === 'solicitante'
      ? `Solicitaste ${cantidadOriginal} ${unidad}.`
      : `El solicitante pidió ${cantidadOriginal} ${unidad}.`,
  ];
  if (cambioAprobador) lineas.push(`El aprobador la cambió a ${cantidadAprobador} ${unidad}.`);
  if (modificadaPorComprador) lineas.push(`Compras la cambió a ${cantidad} ${unidad}.`);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Cantidad modificada por ${quien}`}
        className="font-sans font-bold text-[#D98A1B] hover:text-[#8A5A15] text-base leading-none px-1"
      >
        !
      </button>
      {abierto && (
        <span
          className={`absolute ${alinear === 'derecha' ? 'right-0' : 'left-0'} top-full mt-1.5 z-20 w-64 rounded-md bg-white border border-[#F2D9AE] shadow-lg px-3 py-2 text-xs font-sans text-grafito text-left whitespace-normal`}
        >
          <span className="block font-medium text-[#8A5A15] mb-0.5">Cantidad modificada por {quien}</span>
          {lineas.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
