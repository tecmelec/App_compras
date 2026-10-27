'use client';

import { useEffect, useState } from 'react';
import {
  anadirProyectoConsulta,
  buscarProyectosVisibilidad,
  cambiarVerTodosLineas,
  obtenerVisibilidadLineas,
  quitarProyectoConsulta,
  type ProyectoVisibilidad,
} from '@/app/actions/visibilidad-lineas';

// Administración → Usuarios (perfiles usuario y responsable): qué ve en "Líns. compras"
// además de lo suyo. Los cambios se guardan al momento. Solo consulta: no habilita los
// proyectos para solicitar materiales.
export default function VisibilidadLineasCompras({ usuarioId, rol }: { usuarioId: string; rol: 'usuario' | 'responsable' | 'integral' }) {
  const [cargando, setCargando] = useState(true);
  const [todos, setTodos] = useState(false);
  const [proyectos, setProyectos] = useState<ProyectoVisibilidad[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ProyectoVisibilidad[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerVisibilidadLineas(usuarioId)
      .then((v) => {
        setTodos(v.todos);
        setProyectos(v.proyectos);
      })
      .catch(() => setError('No se pudo cargar la visibilidad.'))
      .finally(() => setCargando(false));
  }, [usuarioId]);

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      buscarProyectosVisibilidad(busqueda).then((r) => vigente && setResultados(r));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [busqueda]);

  async function cambiarTodos(valor: boolean) {
    setGuardando(true);
    setError(null);
    const r = await cambiarVerTodosLineas(usuarioId, valor);
    if ('error' in r && r.error) setError(r.error);
    else setTodos(valor);
    setGuardando(false);
  }

  async function anadir(p: ProyectoVisibilidad) {
    setGuardando(true);
    setError(null);
    const r = await anadirProyectoConsulta(usuarioId, p.id);
    if ('error' in r && r.error) setError(r.error);
    else setProyectos((prev) => [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.bc_job_no.localeCompare(b.bc_job_no)));
    setGuardando(false);
  }

  async function quitar(p: ProyectoVisibilidad) {
    setGuardando(true);
    setError(null);
    const r = await quitarProyectoConsulta(usuarioId, p.id);
    if ('error' in r && r.error) setError(r.error);
    else setProyectos((prev) => prev.filter((x) => x.id !== p.id));
    setGuardando(false);
  }

  const base =
    rol === 'usuario'
      ? 'Por defecto ve las líneas de sus solicitudes y de los proyectos que tiene habilitados para solicitar.'
      : 'Por defecto ve las líneas de sus solicitudes y de las que aprueba (o de quien sustituye).';
  const yaAnadidos = new Set(proyectos.map((p) => p.id));

  return (
    <div className="bg-white border border-borde rounded-lg p-4 mt-4">
      <h3 className="text-sm font-semibold text-grafito">Visibilidad en Líns. compras</h3>
      <p className="text-xs text-slate mb-3">
        {base} Aquí puedes ampliarla. Solo es para consultar: no habilita los proyectos para solicitar materiales. Se guarda al momento.
      </p>

      {cargando ? (
        <p className="text-sm text-slate">Cargando…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!todos} disabled={guardando} onChange={() => cambiarTodos(false)} />
              Lo suyo y los proyectos adicionales de la lista
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={todos} disabled={guardando} onChange={() => cambiarTodos(true)} />
              Las líneas de <strong>todos los proyectos</strong>
            </label>
          </div>

          {!todos && (
            <div>
              <p className="text-xs font-medium text-slate mb-1">Proyectos adicionales ({proyectos.length})</p>
              {proyectos.length === 0 ? (
                <p className="text-xs text-slate/80 mb-2">Ninguno.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 mb-2">
                  {proyectos.map((p) => (
                    <li
                      key={p.id}
                      className="inline-flex items-center gap-1.5 bg-fondo border border-borde rounded-full pl-2.5 pr-1 py-0.5 text-xs text-grafito"
                    >
                      <span>
                        <span className="font-mono">{p.bc_job_no}</span>
                        {p.descripcion ? ` — ${p.descripcion}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitar(p)}
                        disabled={guardando}
                        className="text-slate hover:text-rojo px-1"
                        title="Quitar"
                        aria-label={`Quitar ${p.bc_job_no}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar proyecto por nº o descripción para añadirlo…"
                className="input w-full max-w-md"
              />
              {busqueda.trim() && (
                <ul className="mt-1 max-w-md max-h-60 overflow-y-auto border border-borde rounded-md divide-y divide-borde bg-white">
                  {resultados.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate">Sin resultados.</li>
                  ) : (
                    resultados.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-mono">{p.bc_job_no}</span>
                          {p.descripcion ? ` — ${p.descripcion}` : ''}
                        </span>
                        {yaAnadidos.has(p.id) ? (
                          <span className="text-xs text-slate">Añadido</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => anadir(p)}
                            disabled={guardando}
                            className="text-marca text-xs hover:underline shrink-0"
                          >
                            + Añadir
                          </button>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-rojo">{error}</p>}
        </div>
      )}
    </div>
  );
}
