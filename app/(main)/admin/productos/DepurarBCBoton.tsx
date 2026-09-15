'use client';

import { useState } from 'react';
import { depurarCamposProductoBC } from '@/app/actions/business-central';

export default function DepurarBCBoton() {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDepurar() {
    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await depurarCamposProductoBC();

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(r);
  }

  return (
    <div className="mb-6">
      <button onClick={handleDepurar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
        {cargando ? 'Consultando BC…' : '🔍 Ver campos crudos de BC (diagnóstico temporal)'}
      </button>

      {resultado && (
        <div className="mt-2 max-w-2xl">
          <p className="text-xs text-slate mb-1">
            Total de artículos en el feed: {resultado.total}. Primer registro tal cual lo envía BC:
          </p>
          <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto">
            {JSON.stringify(resultado.primerItem, null, 2)}
          </pre>
        </div>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2 max-w-xl">
          {error}
        </p>
      )}
    </div>
  );
}
