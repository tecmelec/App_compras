'use client';

import { useEffect, useRef, useState } from 'react';

export default function ObraCelda({ numero, nombre }: { numero: string; nombre?: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  if (!numero) return <span className="text-slate">—</span>;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="font-mono text-marca hover:underline underline-offset-2"
        onClick={() => setAbierto((v) => !v)}
      >
        {numero}
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 left-0 whitespace-nowrap rounded-md border border-borde bg-white px-3 py-2 shadow-lg text-sm">
          <p className="font-medium text-grafito">{nombre || 'Sin nombre de obra'}</p>
        </div>
      )}
    </div>
  );
}
