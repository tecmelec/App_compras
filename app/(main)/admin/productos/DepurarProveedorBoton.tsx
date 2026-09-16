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
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate mb-1">Prov (ya usada):</p>
            <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(resultado.prov, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs text-slate mb-1">Ficha_proveedor_Excel:</p>
            <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(resultado.fichaProveedor, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs text-slate mb-1">Ficha_banco_proveedor_Excel:</p>
            <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(resultado.bancoProveedor, null, 2)}
            </pre>
          </div>
        </div>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
