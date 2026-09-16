'use client';

import { useState } from 'react';
import { depurarAPIEstandarBC } from '@/app/actions/business-central';

export default function DepurarAPIEstandarBoton() {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDepurar() {
    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await depurarAPIEstandarBC();

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(r);
  }

  return (
    <div className="mb-6 max-w-2xl">
      <button onClick={handleDepurar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
        {cargando ? 'Consultando API estándar…' : '🔍 Probar API estándar (jobPlanningLines)'}
      </button>

      {resultado && (
        <div className="mt-2">
          <p className="text-xs text-slate mb-1">
            Compañía: {resultado.compania?.displayName || resultado.compania?.name} ({resultado.compania?.id}) — Total
            líneas: {resultado.total}
          </p>
          <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(resultado.primeraLinea, null, 2)}
          </pre>
        </div>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
