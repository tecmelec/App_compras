'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sincronizarPedidoConBC } from '@/app/actions/business-central';

export default function SincronizarPedidoBCBoton({ pedidoId }: { pedidoId: string }) {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSincronizar() {
    setSincronizando(true);
    setResultado(null);
    setAvisos([]);
    setError(null);

    const r = await sincronizarPedidoConBC(pedidoId);

    setSincronizando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(`Pedido Tecmelec ${r.numeroTecmelec} — ${r.actualizados} línea(s) actualizada(s).`);
    setAvisos(r.avisos || []);
    router.refresh();
  }

  return (
    <div className="mb-4">
      <button onClick={handleSincronizar} disabled={sincronizando} className="btn-secondary">
        {sincronizando ? 'Sincronizando…' : '↻ Sincronizar con Business Central'}
      </button>

      {resultado && <p className="text-sm text-verde mt-2">{resultado}</p>}
      {avisos.map((a, i) => (
        <p key={i} className="text-sm text-slate mt-1">
          ⚠ {a}
        </p>
      ))}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2 max-w-xl">
          {error}
        </p>
      )}
    </div>
  );
}
