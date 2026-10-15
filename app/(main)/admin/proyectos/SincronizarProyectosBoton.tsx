'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sincronizarProyectosBC } from '@/app/actions/business-central';

export default function SincronizarProyectosBoton({ ultima }: { ultima?: string | null }) {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSincronizar() {
    setSincronizando(true);
    setResultado(null);
    setError(null);

    const r = await sincronizarProyectosBC();

    setSincronizando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(
      `${r.creados} proyecto(s) nuevo(s), ${r.actualizados} actualizado(s) de ${r.totalBC} en Business Central.` +
        (r.errores && r.errores.length > 0 ? ` (${r.errores.length} con error)` : '')
    );
    router.refresh();
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button onClick={handleSincronizar} disabled={sincronizando} className="btn-secondary">
          {sincronizando ? 'Sincronizando…' : '↻ Sincronizar con Business Central'}
        </button>
        {ultima && <span className="text-xs text-slate/70">{ultima}</span>}
      </div>

      {resultado && <p className="text-sm text-verde mt-2">{resultado}</p>}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2 max-w-xl">
          {error}
        </p>
      )}
    </div>
  );
}
