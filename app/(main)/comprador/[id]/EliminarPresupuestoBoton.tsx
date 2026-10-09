'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { eliminarPresupuesto } from '@/app/actions/presupuesto';

export default function EliminarPresupuestoBoton({ presupuestoId }: { presupuestoId: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  if (!confirmar) {
    return (
      <button type="button" onClick={() => setConfirmar(true)} className="text-xs text-rojo hover:underline ml-auto">
        Eliminar presupuesto
      </button>
    );
  }
  return (
    <span className="text-xs ml-auto">
      ¿Eliminar? (los precios aplicados se mantienen){' '}
      <button
        type="button"
        disabled={borrando}
        onClick={async () => {
          setBorrando(true);
          await eliminarPresupuesto(presupuestoId);
          router.refresh();
        }}
        className="text-rojo font-medium hover:underline"
      >
        Sí
      </button>{' '}
      <button type="button" onClick={() => setConfirmar(false)} className="text-slate hover:underline">
        No
      </button>
    </span>
  );
}
