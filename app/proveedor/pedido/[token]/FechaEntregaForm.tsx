'use client';

import { useState } from 'react';
import { guardarFechaEntregaProveedor, type ItemFechaEntrega } from '@/app/actions/proveedor-fecha-entrega';

function IconoCalendario() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconoPaquete() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CampoFecha({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate">
        <IconoCalendario />
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
        style={{ paddingLeft: '2.25rem' }}
      />
    </div>
  );
}

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
        <span className="inline-flex w-12 h-12 rounded-full bg-marcaClaro text-marca items-center justify-center mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <p className="text-sm text-grafito font-medium">Fecha de entrega registrada. ¡Gracias!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5 text-sm">
        <label className="flex items-center gap-2 cursor-pointer text-grafito">
          <input
            type="radio"
            checked={modo === 'unica'}
            onChange={() => setModo('unica')}
            className="accent-marca w-4 h-4"
          />
          Misma fecha para todo el pedido
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-grafito">
          <input
            type="radio"
            checked={modo === 'porArticulo'}
            onChange={() => setModo('porArticulo')}
            className="accent-marca w-4 h-4"
          />
          Fecha distinta por artículo
        </label>
      </div>

      {modo === 'unica' && (
        <div className="mb-6">
          <label className="block text-xs text-slate mb-1.5">Fecha estimada de entrega</label>
          <div className="max-w-xs">
            <CampoFecha value={fechaUnica} onChange={setFechaUnica} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-borde bg-fondo/60 divide-y divide-borde mb-6 overflow-hidden">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 p-3.5 border-l-4 border-marca bg-white">
            <span className="w-8 h-8 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
              <IconoPaquete />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-grafito break-words">{it.nombre}</p>
              <p className="text-xs text-slate">
                {it.cantidad} {it.unidadMedida}
              </p>
            </div>
            {modo === 'porArticulo' && (
              <div className="w-36 shrink-0">
                <CampoFecha
                  value={fechasPorItem[it.id] || ''}
                  onChange={(v) => setFechasPorItem((prev) => ({ ...prev, [it.id]: v }))}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-4 py-2 mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleGuardar}
        disabled={guardando}
        className="btn-primary w-full disabled:opacity-60 flex items-center justify-center gap-2"
      >
        <IconoCalendario />
        {guardando ? 'Guardando…' : 'Guardar fecha de entrega'}
        {!guardando && <IconoFlecha />}
      </button>
    </div>
  );
}
