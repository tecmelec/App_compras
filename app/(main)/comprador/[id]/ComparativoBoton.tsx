'use client';

import { useState } from 'react';

// "Generar comparativo": descarga el Excel con las ofertas analizadas de la solicitud y
// las condiciones comerciales de cada proveedor.
export default function ComparativoBoton({ pedidoId }: { pedidoId: string }) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setError(null);
    try {
      const r = await fetch(`/api/comparativo/${pedidoId}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Error ${r.status} generando el comparativo.`);
      }
      const nombre = decodeURIComponent((r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Comparativo.xlsx');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      setError(e.message || 'No se pudo generar el comparativo.');
    }
    setGenerando(false);
  }

  return (
    <div>
      <button type="button" onClick={generar} disabled={generando} className="btn-secondary disabled:opacity-60" title="Excel con las ofertas de esta solicitud y las condiciones comerciales de cada proveedor">
        {generando ? 'Generando…' : 'Generar comparativo'}
      </button>
      {error && <p className="text-xs text-rojo mt-1 max-w-xs">{error}</p>}
    </div>
  );
}
