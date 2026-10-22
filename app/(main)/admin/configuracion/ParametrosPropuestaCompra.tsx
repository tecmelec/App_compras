'use client';

import { useState } from 'react';
import { actualizarParametrosPropuesta } from '@/app/actions/catalogo';

type Params = { diasPresupuesto: number; mesesCompras: number; pctAgrupar: number; pctVariacion: number };

// Parámetros de "Proponer compra" (vista del comprador).
export default function ParametrosPropuestaCompra({ inicial }: { inicial: Params }) {
  const [v, setV] = useState({
    diasPresupuesto: String(inicial.diasPresupuesto),
    mesesCompras: String(inicial.mesesCompras),
    pctAgrupar: String(inicial.pctAgrupar),
    pctVariacion: String(inicial.pctVariacion),
  });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campos: { k: keyof typeof v; etiqueta: string; ayuda: string; sufijo: string }[] = [
    { k: 'diasPresupuesto', etiqueta: 'Presupuestos de otras solicitudes', ayuda: 'Antigüedad máxima para usarlos.', sufijo: 'días' },
    { k: 'mesesCompras', etiqueta: 'Compras recientes en BC', ayuda: 'Más antiguas bajan la confianza a media.', sufijo: 'meses' },
    { k: 'pctAgrupar', etiqueta: 'Agrupar en un proveedor', ayuda: 'Si sale como mucho este % más caro.', sufijo: '%' },
    { k: 'pctVariacion', etiqueta: 'Avisar de variación de precio', ayuda: 'Entre compras recientes.', sufijo: '%' },
  ];

  async function guardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);
    const r = await actualizarParametrosPropuesta({
      diasPresupuesto: Number(v.diasPresupuesto),
      mesesCompras: Number(v.mesesCompras),
      pctAgrupar: Number(v.pctAgrupar.replace(',', '.')),
      pctVariacion: Number(v.pctVariacion.replace(',', '.')),
    });
    setGuardando(false);
    if (r.error) setError(r.error);
    else setGuardado(true);
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-5 max-w-md mt-6">
      <h2 className="font-medium text-grafito mb-1">Propuesta de compra</h2>
      <p className="text-sm text-slate mb-4">Reglas del botón &quot;Proponer compra&quot; de la vista del comprador.</p>
      <div className="space-y-3">
        {campos.map((c) => (
          <div key={c.k}>
            <label className="block text-sm font-medium text-grafito">{c.etiqueta}</label>
            <p className="text-xs text-slate mb-1">{c.ayuda}</p>
            <div className="flex items-center gap-2">
              <input
                className="input font-mono w-28"
                type="number"
                step="any"
                min="0"
                value={v[c.k]}
                onChange={(e) => {
                  setGuardado(false);
                  setV((prev) => ({ ...prev, [c.k]: e.target.value }));
                }}
              />
              <span className="text-sm text-slate">{c.sufijo}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={guardar} disabled={guardando} className="btn-primary mt-4">
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar'}
      </button>
      {error && <p className="text-sm text-rojo mt-3">{error}</p>}
    </div>
  );
}
