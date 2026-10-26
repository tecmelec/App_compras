'use client';

import { useEffect, useState } from 'react';
import { tareasRegistroProyecto } from '@/app/actions/tareas-proyecto';
import { formatoCantidad } from '@/lib/cantidad';
import ComboboxBuscable from '@/components/ComboboxBuscable';

type Item = { producto_id: string; nombre: string; cantidad: number; unidad_medida?: string | null };
type Tarea = { no: string; descripcion: string };

// "Asignar líneas de planificación manualmente": tarea de proyecto (tipo Registro) para
// cada artículo de la solicitud. Vacío = la tarea por defecto (95.01).
export default function TareasPlanificacionModal({
  proyectoId,
  proyectoNo,
  items,
  inicial,
  onAceptar,
  onCancelar,
}: {
  proyectoId: string;
  proyectoNo: string;
  items: Item[];
  inicial: Record<string, string>;
  onAceptar: (tareas: Record<string, string>) => void;
  onCancelar: () => void;
}) {
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asignadas, setAsignadas] = useState<Record<string, string>>(inicial);

  useEffect(() => {
    let vigente = true;
    tareasRegistroProyecto(proyectoId).then((r) => {
      if (!vigente) return;
      if ('error' in r && r.error) setError(r.error);
      else setTareas((r as any).tareas || []);
    });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onCancelar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCancelar]);

  const opciones = [
    { value: '', label: '95.01 (por defecto)' },
    ...(tareas || []).map((t) => ({ value: t.no, label: `${t.no} — ${t.descripcion}` })),
  ];
  const [todos, setTodos] = useState('__nada__');

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl my-6 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-grafito">Líneas de planificación · {proyectoNo}</h2>
            <p className="text-xs text-slate">
              Elige la tarea del proyecto (tipo Registro) para cada artículo. Las que dejes en &quot;95.01 (por defecto)&quot; se asignan a la
              tarea 95.01 al crear el pedido de compra en BC.
            </p>
          </div>
          <button onClick={onCancelar} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && <p className="text-sm text-rojo mb-3">{error}</p>}
        {!tareas && !error && <p className="text-sm text-slate py-4">Cargando las tareas del proyecto desde Business Central…</p>}
        {tareas && tareas.length === 0 && <p className="text-sm text-slate mb-3">Este proyecto no tiene tareas de tipo Registro en BC.</p>}

        {tareas && tareas.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 bg-fondo border border-borde rounded-md p-2 mb-3">
              <span className="text-sm text-grafito">Asignar a todos:</span>
              <ComboboxBuscable
                className="flex-1 min-w-[14rem]"
                opciones={opciones}
                value={todos}
                placeholder="Busca y elige una tarea…"
                onChange={(v) => {
                  setTodos(v);
                  setAsignadas(Object.fromEntries(items.map((i) => [i.producto_id, v])));
                }}
              />
            </div>
            <ul className="border border-borde rounded-md divide-y divide-borde max-h-[55vh] overflow-y-auto">
              {items.map((i) => (
                <li key={i.producto_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-[12rem] text-sm text-grafito">
                    {i.nombre}{' '}
                    <span className="text-xs text-slate">
                      · {formatoCantidad(i.cantidad)} {i.unidad_medida || 'ud.'}
                    </span>
                  </span>
                  <ComboboxBuscable
                    className="w-full sm:w-80"
                    opciones={opciones}
                    value={asignadas[i.producto_id] || ''}
                    onChange={(v) => setAsignadas((prev) => ({ ...prev, [i.producto_id]: v }))}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancelar} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={() => onAceptar(Object.fromEntries(Object.entries(asignadas).filter(([, v]) => v)))}
            disabled={!tareas}
            className="btn-primary disabled:opacity-60"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
