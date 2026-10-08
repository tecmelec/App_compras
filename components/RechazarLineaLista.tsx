'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rechazarLineaListaFoto } from '@/app/actions/lista-foto';

// Rechazar una línea de la lista en foto (pendiente o con artículo que aún no está
// en un pedido de compra), con confirmación en el mismo sitio.
export default function RechazarLineaLista({ listaId, n }: { listaId: string; n: number }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rechazar() {
    setEnviando(true);
    setError(null);
    const r = await rechazarLineaListaFoto(listaId, n);
    setEnviando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setConfirmar(false);
    router.refresh();
  }

  if (!confirmar) {
    return (
      <button type="button" onClick={() => setConfirmar(true)} className="text-xs text-rojo font-medium hover:underline mt-1 block">
        Rechazar
      </button>
    );
  }
  return (
    <div className="mt-1 text-xs">
      <span className="text-grafito">¿Rechazar esta línea?</span>{' '}
      <button type="button" onClick={rechazar} disabled={enviando} className="text-rojo font-medium hover:underline">
        {enviando ? 'Rechazando…' : 'Sí'}
      </button>{' '}
      <button type="button" onClick={() => setConfirmar(false)} disabled={enviando} className="text-slate hover:underline">
        No
      </button>
      {error && <p className="text-rojo mt-0.5">{error}</p>}
    </div>
  );
}
