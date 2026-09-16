'use client';

import { useState } from 'react';
import { guardarFechaEntregaProveedor, type ItemFechaEntrega } from '@/app/actions/proveedor-fecha-entrega';

export default function FechaEntregaForm({ token, items }: { token: string; items: ItemFechaEntrega[] }) {
  const [modo, setModo] = useState<'unica' | 'porArticulo'>('unica');
  const [fechaUnica, setFechaUnica] = useState('');
  const [fechasPorItem, setFechasPorItem] = useState<Record<string, string>>(
    Object.fromEntries(items.map((it) => [it.id, it.fechaActual || '']))
  );
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setError(null);

    const payload =
      modo === 'unica'
        ? ({ modo: 'unica', fecha: fechaUnica } as const)
        : ({
            modo: 'porArticulo',
            fechas: items.map((it) => ({ itemId: it.id, fecha: fechasPorItem[it.id] || '' })),
          } as const);

    setGuardando(true);
    const r = await guardarFechaEntregaProveedor(token, payload);
    setGuardando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setGuardado(true);
  }

  if (guardado) {
    return (
      <div className="text-center py-8">
        <p className="text-marca text-2xl mb-2">✓</p>
        <p className="text-sm text-grafito">Fecha de entrega registrada. ¡Gracias!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-4 mb-5 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={modo === 'unica'} onChange={() => setModo('unica')} />
          Misma fecha para todo el pedido
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={modo === 'porArticulo'} onChange={() => setModo('porArticulo')} />
          Fecha distinta por artículo
        </label>
      </div>

      {modo === 'unica' && (
        <div className="mb-6">
          <label className="block text-xs text-slate mb-1">Fecha estimada de entrega</label>
          <input
            type="date"
            value={fechaUnica}
            onChange={(e) => setFechaUnica(e.target.value)}
            className="input w-full max-w-xs"
          />
        </div>
      )}

      <div className="space-y-3 mb-6">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-4 border-b border-borde pb-3 last:border-0">
            <div>
              <p className="text-sm text-grafito">{it.nombre}</p>
              <p className="text-xs text-slate">
                {it.cantidad} {it.unidadMedida}
              </p>
            </div>
            {modo === 'porArticulo' && (
              <input
                type="date"
                value={fechasPorItem[it.id] || ''}
                onChange={(e) => setFechasPorItem((prev) => ({ ...prev, [it.id]: e.target.value }))}
                className="input w-40 shrink-0"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-4 py-2 mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleGuardar}
        disabled={guardando}
        className="btn-primary w-full disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar fecha de entrega'}
      </button>
    </div>
  );
}
