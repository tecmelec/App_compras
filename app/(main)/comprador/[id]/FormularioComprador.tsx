'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarPedido, actualizarLineasTecmelec } from '@/app/actions/pedidos';

type Estado = { id: number; nombre: string };
type ItemForm = {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  numeroTecmelec: string;
};

export default function FormularioComprador({
  pedidoId,
  items,
  totalEstimado,
  estadoId,
  fechaEstimada,
  estados,
}: {
  pedidoId: string;
  items: ItemForm[];
  totalEstimado: number;
  estadoId: number;
  fechaEstimada: string;
  estados: Estado[];
}) {
  const [numerosTecmelec, setNumerosTecmelec] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.numeroTecmelec]))
  );
  const [estado, setEstado] = useState(estadoId);
  const [fecha, setFecha] = useState(fechaEstimada);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleGuardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);

    const resultadoLineas = await actualizarLineasTecmelec(
      items.map((i) => ({ id: i.id, numero_tecmelec: numerosTecmelec[i.id] || '' }))
    );

    if (resultadoLineas.error) {
      setGuardando(false);
      setError(resultadoLineas.error);
      return;
    }

    const resultadoPedido = await actualizarPedido(pedidoId, {
      estado_id: estado,
      fecha_estimada_entrega: fecha || null,
    });

    setGuardando(false);

    if (resultadoPedido.error) {
      setError(resultadoPedido.error);
      return;
    }

    setGuardado(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
        <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 p-4 text-sm">
              <div className="flex-1">
                <p className="text-grafito">{item.nombre}</p>
                <p className="font-mono text-slate text-xs">
                  {item.precio?.toFixed(2)} € c/u — x{item.cantidad}
                </p>
              </div>
              <div className="w-48 shrink-0">
                <label className="block text-xs text-slate mb-1">Nº pedido Tecmelec</label>
                <input
                  className="input font-mono"
                  value={numerosTecmelec[item.id]}
                  onChange={(e) =>
                    setNumerosTecmelec((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Ej: TM-2026-0451"
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-right font-mono text-grafito mt-2">
          Total: <strong>{totalEstimado?.toFixed(2)} €</strong>
        </p>
      </div>

      <div className="bg-white border border-borde rounded-lg p-5 space-y-4">
        <h2 className="font-medium text-grafito">Gestión del pedido</h2>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Estado</label>
          <select
            className="input"
            value={estado}
            onChange={(e) => setEstado(Number(e.target.value))}
          >
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">
            Fecha estimada de entrega
          </label>
          <input
            type="date"
            className="input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button onClick={handleGuardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
