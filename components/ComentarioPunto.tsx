'use client';

import { useEffect, useState } from 'react';

// Punto naranja que indica que hay un comentario; al pulsarlo se muestra el texto.
export default function ComentarioPunto({ titulo, texto }: { titulo: string; texto: string }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
        className="inline-flex items-center justify-center w-4 h-4 -ml-1 mr-1 align-middle shrink-0 rounded-full hover:bg-[#FFF4E5]"
        title={`${titulo} (pulsa para verlo)`}
        aria-label={titulo}
      >
        <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 border-l-4 border-[#F59E0B]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-grafito">{titulo}</p>
              <button onClick={() => setAbierto(false)} className="text-slate hover:text-grafito text-lg leading-none" aria-label="Cerrar">
                ×
              </button>
            </div>
            <p className="text-sm text-grafito whitespace-pre-line break-words font-sans">{texto}</p>
          </div>
        </div>
      )}
    </>
  );
}
