'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ComboboxBuscable from '@/components/ComboboxBuscable';
import { renumerarProyecto } from '@/app/actions/proyecto-renumerado';

type Proy = { id: string; bc_job_no: string; descripcion: string | null };
type Fuera = Proy & { solicitudes: number; sugerido: string | null };

// Proyectos de la app que ya no aparecen en BC (normalmente renumerados en BC, p. ej.
// E260308 → M260325): se unen al Nº nuevo con sus solicitudes, usuarios, aprobadores y
// tienda del proyecto.
export default function ProyectosFueraDeBC({ fuera, enBC }: { fuera: Fuera[]; enBC: Proy[] }) {
  if (fuera.length === 0) return null;
  return (
    <div className="bg-white border border-[#F2D9AE] rounded-lg p-5 mb-6">
      <h2 className="font-medium text-grafito mb-1">Proyectos que ya no están en Business Central</h2>
      <p className="text-sm text-slate mb-4">
        Suelen ser proyectos renumerados en BC. Indica el Nº nuevo y pulsa &quot;Unir&quot;: sus solicitudes, usuarios asignados, aprobadores,
        favoritos y tienda del proyecto pasan al nuevo y el antiguo se elimina. Cada solicitud queda con su cambio registrado.
      </p>
      <div className="divide-y divide-borde">
        {fuera.map((f) => (
          <Fila key={f.id} f={f} enBC={enBC} />
        ))}
      </div>
    </div>
  );
}

function Fila({ f, enBC }: { f: Fuera; enBC: Proy[] }) {
  const router = useRouter();
  const sugerido = enBC.find((p) => p.bc_job_no === f.sugerido);
  const [nuevo, setNuevo] = useState(sugerido?.bc_job_no || '');
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function unir() {
    setError(null);
    setGuardando(true);
    const r = await renumerarProyecto(f.bc_job_no, nuevo);
    setGuardando(false);
    setConfirmar(false);
    if (r.error) return setError(r.error);
    setMensaje(r.mensaje || 'Hecho.');
    router.refresh();
  }

  if (mensaje) return <p className="py-3 text-sm text-verde">{mensaje}</p>;
  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-grafito">
            <span className="font-mono">{f.bc_job_no}</span> — {f.descripcion}
          </p>
          <p className="text-xs text-slate">
            {f.solicitudes} {f.solicitudes === 1 ? 'solicitud' : 'solicitudes'}
            {sugerido && ' · sugerido por tener la misma descripción'}
          </p>
        </div>
        <div className="w-72">
          <ComboboxBuscable
            opciones={enBC.map((p) => ({ value: p.bc_job_no, label: `${p.bc_job_no} — ${p.descripcion || ''}` }))}
            value={nuevo}
            onChange={(v) => {
              setNuevo(v);
              setConfirmar(false);
            }}
            placeholder="Nº nuevo en BC…"
          />
        </div>
        {!confirmar ? (
          <button type="button" className="btn-secondary text-sm py-1.5" disabled={!nuevo} onClick={() => setConfirmar(true)}>
            Unir
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <button type="button" className="btn-primary text-sm py-1.5" disabled={guardando} onClick={unir}>
              {guardando ? 'Uniendo…' : `Confirmar ${f.bc_job_no} → ${nuevo}`}
            </button>
            <button type="button" className="text-xs text-slate hover:underline" onClick={() => setConfirmar(false)} disabled={guardando}>
              Cancelar
            </button>
          </span>
        )}
      </div>
      {error && <p className="text-xs text-rojo mt-1.5">{error}</p>}
    </div>
  );
}
