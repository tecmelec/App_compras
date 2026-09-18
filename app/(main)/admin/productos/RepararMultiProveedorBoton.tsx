'use client';

import { useState } from 'react';
import { repararSolicitudesMultiProveedorBC } from '@/app/actions/business-central';

export default function RepararMultiProveedorBoton() {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReparar() {
    if (
      !confirm(
        'Esto revisa todas las solicitudes con líneas ya vinculadas a Business Central y corrige las que ' +
          'quedaron mezcladas entre distintos pedidos de compra/proveedores. Puede tardar si hay muchas ' +
          'solicitudes abiertas. ¿Continuar?'
      )
    ) {
      return;
    }

    setCargando(true);
    setResultado(null);
    setError(null);

    const r = await repararSolicitudesMultiProveedorBC();

    setCargando(false);

    if ((r as any).error) {
      setError((r as any).error);
      return;
    }

    setResultado(r);
  }

  return (
    <div className="mb-6 max-w-2xl">
      <button onClick={handleReparar} disabled={cargando} className="text-xs text-slate hover:text-grafito underline">
        {cargando ? 'Reparando…' : '🩹 Reparar solicitudes con líneas mezcladas entre proveedores (bug de sincronización)'}
      </button>

      {resultado && (
        <div className="mt-2">
          <p className="text-xs text-slate mb-1">
            {resultado.revisadas} solicitud(es) revisada(s) · {resultado.resumen.length} con cambios o avisos.
          </p>
          <pre className="bg-grafito text-white text-xs p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(resultado.resumen, null, 2)}
          </pre>
        </div>
      )}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>
      )}
    </div>
  );
}
