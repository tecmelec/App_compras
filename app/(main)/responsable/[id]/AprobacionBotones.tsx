'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { responderAprobacion } from '@/app/actions/pedidos';

export default function AprobacionBotones({
  pedidoId,
  aprobado,
}: {
  pedidoId: string;
  aprobado: boolean | null;
}) {
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function responder(valor: boolean) {
    setEnviando(true);
    await responderAprobacion(pedidoId, valor);
    setEnviando(false);
    router.refresh();
  }

  if (aprobado !== null) {
    return (
      <p className="text-sm text-grafito">
        Ya marcaste esta solicitud como{' '}
        <strong>{aprobado ? 'aprobada' : 'rechazada'}</strong>.
      </p>
    );
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-5">
      <h2 className="font-medium text-grafito mb-1">Esta solicitud requiere tu aprobación</h2>
      <p className="text-sm text-slate mb-4">
        El monto supera el límite de aprobación automática configurado por el administrador.
      </p>
      <div className="flex gap-2">
        <button onClick={() => responder(true)} disabled={enviando} className="btn-aprobar">
          Aprobar
        </button>
        <button onClick={() => responder(false)} disabled={enviando} className="btn-rechazar">
          Rechazar
        </button>
      </div>
    </div>
  );
}
