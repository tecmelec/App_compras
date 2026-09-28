'use client';

import { useEffect, useRef, useState } from 'react';

// "!" junto a la cantidad de una línea cuya cantidad cambió el aprobador.
// Al pulsarlo muestra el mensaje con la cantidad que se había solicitado.
export default function CantidadModificadaAviso({
  cantidadOriginal,
  cantidadAprobada,
  unidad,
  perspectiva = 'solicitante',
  alinear = 'derecha',
}: {
  cantidadOriginal: number;
  cantidadAprobada: number;
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

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Cantidad modificada por el aprobador"
        className="font-sans font-bold text-[#D98A1B] hover:text-[#8A5A15] text-base leading-none px-1"
      >
        !
      </button>
      {abierto && (
        <span className={`absolute ${alinear === 'derecha' ? 'right-0' : 'left-0'} top-full mt-1.5 z-20 w-64 rounded-md bg-white border border-[#F2D9AE] shadow-lg px-3 py-2 text-xs font-sans text-grafito text-left whitespace-normal`}>
          <span className="block font-medium text-[#8A5A15] mb-0.5">Cantidad modificada por el aprobador</span>
          {perspectiva === 'solicitante'
            ? `Solicitaste ${cantidadOriginal} ${unidad} y se han aprobado ${cantidadAprobada} ${unidad}.`
            : `El solicitante pidió ${cantidadOriginal} ${unidad} y el aprobador aprobó ${cantidadAprobada} ${unidad}.`}
        </span>
      )}
    </span>
  );
}
