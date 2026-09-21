'use client';

import { useState } from 'react';
import { depurarLineasPedidoCompraBC } from '@/app/actions/business-central';

export default function DepurarLineasPedidoCompraBoton() {
  const [documentNo, setDocumentNo] = useState('PC2608166');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDepurar() {
    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await depurarLineasPedidoCompraBC(documentNo);

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
          className="input py-1 w-40"
          value={documentNo}
          onChange={(e) => setDocumentNo(e.target.value)}
          placeholder="Nº pedido Tecmelec"
        />
        <button onClick={handleDepurar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
          {cargando ? 'Consultando BC…' : '🔍 Ver líneas del pedido de compra crudas'}
        </button>
      </div>

      {resultado && (
        <div className="mt-2">
          <p className="text-xs text-slate mb-1">Total encontradas: {resultado.total}</p>
          <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(resultado.lineas, null, 2)}
          </pre>
        </div>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
