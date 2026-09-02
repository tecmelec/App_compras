'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarPedido } from '@/app/actions/pedidos';

type Estado = { id: number; nombre: string };

export default function FormularioComprador({
  pedidoId,
  numeroTecmelec,
  estadoId,
  fechaEstimada,
  estados,
}: {
  pedidoId: string;
  numeroTecmelec: string;
  estadoId: number;
  fechaEstimada: string;
  estados: Estado[];
}) {
  const [numero, setNumero] = useState(numeroTecmelec);
  const [estado, setEstado] = useState(estadoId);
  const [fecha, setFecha] = useState(fechaEstimada);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const router = useRouter();

  async function handleGuardar() {
    setGuardando(true);
    setGuardado(false);
    const resultado = await actualizarPedido(pedidoId, {
      numero_tecmelec: numero,
      estado_id: estado,
      fecha_estimada_entrega: fecha || null,
    });
    setGuardando(false);
    if (!resultado.error) {
      setGuardado(true);
      router.refresh();
    }
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-5 space-y-4">
      <h2 className="font-medium text-grafito">Gestión del pedido</h2>

      <div>
        <label className="block text-sm font-medium text-grafito mb-1">Nº pedido Tecmelec</label>
        <input
          className="input font-mono"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Ej: TM-2026-0451"
        />
      </div>

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

      <button onClick={handleGuardar} disabled={guardando} className="btn-primary">
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
      </button>
    </div>
  );
}
