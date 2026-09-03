'use client';

import { useState } from 'react';
import { actualizarLimiteAprobacion } from '@/app/actions/catalogo';

export default function ConfiguracionClient({ limiteInicial }: { limiteInicial: number }) {
  const [limite, setLimite] = useState(limiteInicial.toString());
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);

    const resultado = await actualizarLimiteAprobacion(Number(limite) || 0);

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setGuardado(true);
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-5 max-w-md">
      <h2 className="font-medium text-grafito mb-1">Límite de aprobación automática</h2>
      <p className="text-sm text-slate mb-4">
        Las solicitudes hasta este monto quedan aprobadas automáticamente. Las que lo superen
        necesitan la aprobación del responsable asignado.
      </p>

      <label className="block text-sm font-medium text-grafito mb-1">Monto (€)</label>
      <div className="flex gap-2">
        <input
          className="input font-mono"
          type="number"
          step="1"
          min="0"
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
        />
        <button onClick={handleGuardar} disabled={guardando} className="btn-primary shrink-0">
          {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>

      {error && <p className="text-sm text-rojo mt-3">{error}</p>}
    </div>
  );
}
