'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sincronizarMisSolicitudesConBC } from '@/app/actions/business-central';

export default function SincronizarTodasBCBoton() {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSincronizar() {
    setSincronizando(true);
    setResultado(null);
    setError(null);

    const r = await sincronizarMisSolicitudesConBC();

    setSincronizando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(
      `${r.revisados} solicitud(es) revisada(s), ${r.actualizados} actualizada(s)` +
        (r.conError ? ` — ${r.conError} con error.` : '.')
    );
    router.refresh();
  }

  return (
    <div className="mb-4">
      <button onClick={handleSincronizar} disabled={sincronizando} className="btn-secondary">
        {sincronizando ? 'Sincronizando…' : '↻ Sincronizar todas con Business Central'}
      </button>

      {resultado && <p className="text-sm text-verde mt-2">{resultado}</p>}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2 max-w-xl">
          {error}
        </p>
      )}
    </div>
  );
}
