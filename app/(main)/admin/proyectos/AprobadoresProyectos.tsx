'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { agregarAprobadorProyecto, quitarAprobadorProyecto } from '@/app/actions/aprobadores-proyecto';

type Proyecto = { id: string; bc_job_no: string; descripcion: string | null };
type Persona = { id: string; nombre: string; rol: string };
type Asignacion = { id: string; proyecto_id: string; usuario_id: string };

// Aprobadores por proyecto: para obras con más de un responsable (en BC solo hay un
// jefe de obra). Si un proyecto tiene aprobadores aquí, al pedir material el
// solicitante elige quién aprueba la solicitud (y se ofrece también el jefe de obra de BC).
export default function AprobadoresProyectos({
  proyectos,
  personas,
  asignaciones,
}: {
  proyectos: Proyecto[];
  personas: Persona[];
  asignaciones: Asignacion[];
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const proyectoPorId = useMemo(() => new Map(proyectos.map((p) => [p.id, p])), [proyectos]);
  const personaPorId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);

  const coincidencias = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (t.length < 2) return [];
    return proyectos
      .filter((p) => p.bc_job_no.toLowerCase().includes(t) || (p.descripcion || '').toLowerCase().includes(t))
      .slice(0, 30);
  }, [busqueda, proyectos]);

  // Agrupadas por proyecto
  const porProyecto = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of asignaciones) m.set(a.proyecto_id, [...(m.get(a.proyecto_id) || []), a]);
    return Array.from(m.entries()).sort((a, b) =>
      (proyectoPorId.get(a[0])?.bc_job_no || '').localeCompare(proyectoPorId.get(b[0])?.bc_job_no || '')
    );
  }, [asignaciones, proyectoPorId]);

  async function agregar() {
    if (!proyectoId || !personaId) return;
    setOcupado(true);
    setError(null);
    const r = await agregarAprobadorProyecto(proyectoId, personaId);
    setOcupado(false);
    if (r.error) return setError(r.error);
    setPersonaId('');
    router.refresh();
  }

  async function quitar(id: string) {
    setOcupado(true);
    const r = await quitarAprobadorProyecto(id);
    setOcupado(false);
    if (r.error) return setError(r.error);
    router.refresh();
  }

  const elegido = proyectoPorId.get(proyectoId);

  return (
    <section className="bg-white border border-borde rounded-lg p-4 mb-6 max-w-3xl">
      <h2 className="text-base font-semibold text-grafito">Aprobadores por proyecto</h2>
      <p className="text-xs text-slate mb-3">
        Para obras con más de un responsable. Si un proyecto tiene aprobadores aquí, al pedir material para él el
        solicitante elige quién aprueba la solicitud (también se ofrece el jefe de obra de BC, si está en la app).
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <div className="relative flex-1">
          <input
            className="input w-full"
            placeholder="Buscar proyecto (nº o descripción)…"
            value={elegido ? `${elegido.bc_job_no} — ${elegido.descripcion || ''}` : busqueda}
            onChange={(e) => {
              setProyectoId('');
              setBusqueda(e.target.value);
            }}
          />
          {!elegido && coincidencias.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-borde rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {coincidencias.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProyectoId(p.id);
                    setBusqueda('');
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-fondo"
                >
                  <span className="font-mono">{p.bc_job_no}</span> <span className="text-slate">{p.descripcion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select className="input sm:w-64" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          <option value="">Aprobador…</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.rol})
            </option>
          ))}
        </select>
        <button type="button" onClick={agregar} disabled={!proyectoId || !personaId || ocupado} className="btn-primary">
          Añadir
        </button>
      </div>
      {error && <p className="text-sm text-rojo mb-2">{error}</p>}

      {porProyecto.length === 0 ? (
        <p className="text-sm text-slate">Ningún proyecto tiene aprobadores asignados.</p>
      ) : (
        <div className="divide-y divide-borde border border-borde rounded-lg">
          {porProyecto.map(([pid, lista]) => (
            <div key={pid} className="px-3 py-2 text-sm flex flex-wrap items-center gap-2">
              <span className="font-mono text-grafito">{proyectoPorId.get(pid)?.bc_job_no || '—'}</span>
              <span className="text-slate mr-2">{proyectoPorId.get(pid)?.descripcion}</span>
              {lista.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 bg-marcaClaro text-marca rounded-full px-2 py-0.5 text-xs">
                  {personaPorId.get(a.usuario_id)?.nombre || 'Usuario'}
                  <button
                    type="button"
                    onClick={() => quitar(a.id)}
                    disabled={ocupado}
                    className="text-rojo leading-none ml-0.5"
                    aria-label="Quitar aprobador"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
