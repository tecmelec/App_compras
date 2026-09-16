'use client';

import { useState } from 'react';
import { depurarProveedorBC } from '@/app/actions/business-central';

export default function DepurarProveedorBoton() {
  const [bcProveedorNo, setBcProveedorNo] = useState('P0010');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDepurar() {
    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await depurarProveedorBC(bcProveedorNo);

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado(r);
  }

  return (
    <div className="mb-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-2">
        <input
          className="input py-1 w-32"
          value={bcProveedorNo}
          onChange={(e) => setBcProveedorNo(e.target.value)}
          placeholder="Nº proveedor"
        />
        <button onClick={handleDepurar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
          {cargando ? 'Consultando BC…' : '🔍 Ver campos crudos del proveedor'}
        </button>
      </div>

      {resultado && (
        <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify(resultado.proveedor, null, 2)}
        </pre>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
