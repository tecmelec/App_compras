'use client';

import { useState, useTransition } from 'react';
import { actualizarSeguirPedido } from '@/app/actions/notificaciones';

export default function SeguirPedidoToggle({
  pedidoId,
  valorInicial,
}: {
  pedidoId: string;
  valorInicial: boolean;
}) {
  const [activo, setActivo] = useState(valorInicial);
  const [pendiente, startTransition] = useTransition();

  function cambiar(checked: boolean) {
    const anterior = activo;
    setActivo(checked);
    startTransition(async () => {
      const resultado = await actualizarSeguirPedido(pedidoId, checked);
      if (resultado.error) setActivo(anterior);
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-grafito cursor-pointer select-none shrink-0">
      <input
        type="checkbox"
        checked={activo}
        disabled={pendiente}
        onChange={(e) => cambiar(e.target.checked)}
        className="w-4 h-4 rounded border-borde text-marca focus:ring-marca"
      />
      Seguir pedido
    </label>
  );
}
