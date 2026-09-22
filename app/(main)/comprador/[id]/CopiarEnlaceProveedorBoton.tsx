'use client';

import { useState } from 'react';
import { generarEnlaceProveedor } from '@/app/actions/enlace-proveedor';

export default function CopiarEnlaceProveedorBoton({ numeroTecmelec }: { numeroTecmelec: string }) {
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setCargando(true);
    setError(null);
    setCopiado(false);

    const r = await generarEnlaceProveedor(numeroTecmelec);

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    try {
      await navigator.clipboard.writeText(r.url!);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Si el navegador bloquea el portapapeles, al menos mostramos el enlace.
      window.prompt('Copia el enlace:', r.url);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={cargando}
        title="Copiar enlace para que el proveedor indique la fecha de entrega"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/20 text-slate hover:bg-slate/30 hover:text-grafito disabled:opacity-60"
      >
        {copiado ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {copiado && (
        <div className="absolute right-0 z-20 mt-1 w-max rounded-md bg-grafito text-white text-[11px] px-2 py-1 shadow-lg">
          Enlace copiado
        </div>
      )}

      {error && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md bg-white border border-[#E7C7C7] text-rojo text-[11px] px-2 py-1.5 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
