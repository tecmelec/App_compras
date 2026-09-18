'use client';

import { useState } from 'react';
import { depurarLineasSolicitudBC } from '@/app/actions/business-central';

export default function DepurarLineasSolicitudBoton() {
  const [numeroApp, setNumeroApp] = useState('APP-2600008');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDepurar() {
    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await depurarLineasSolicitudBC(numeroApp);

    setCargando(false);

    if ((r as any).error) {
      setError((r as any).error);
      return;
    }

    setResultado(r);
  }

  return (
    <div className="mb-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <input
          className="input py-1 w-40"
          value={numeroApp}
          onChange={(e) => setNumeroApp(e.target.value)}
          placeholder="APP-2600008"
        />
        <button onClick={handleDepurar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
          {cargando ? 'Consultando BC…' : '🔍 Ver pedidos de compra + líneas crudas de una solicitud'}
        </button>
      </div>

      {resultado && (
        <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify(resultado, null, 2)}
        </pre>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
