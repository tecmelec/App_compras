'use client';

import { useMemo, useState } from 'react';
import { asignarProyecto, desasignarProyecto } from '@/app/actions/proyectos';

type Usuario = { id: string; nombre_completo: string; email: string };
type Proyecto = { id: string; bc_job_no: string; descripcion: string | null };
type Asignacion = { usuario_id: string; proyecto_id: string };

export default function ProyectosEquipoClient({
  usuarios,
  proyectos,
  asignaciones,
}: {
  usuarios: Usuario[];
  proyectos: Proyecto[];
  asignaciones: Asignacion[];
}) {
  const [usuarioId, setUsuarioId] = useState(usuarios[0]?.id || '');
  const [busqueda, setBusqueda] = useState('');
  const [asignados, setAsignados] = useState<Set<string>>(
    new Set(asignaciones.filter((a) => a.usuario_id === usuarios[0]?.id).map((a) => a.proyecto_id))
  );
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  function cambiarUsuario(id: string) {
    setUsuarioId(id);
    setAsignados(new Set(asignaciones.filter((a) => a.usuario_id === id).map((a) => a.proyecto_id)));
  }

  async function alternar(proyectoId: string) {
    setGuardandoId(proyectoId);
    const yaAsignado = asignados.has(proyectoId);

    const resultado = yaAsignado
      ? await desasignarProyecto(usuarioId, proyectoId)
      : await asignarProyecto(usuarioId, proyectoId);

    setGuardandoId(null);

    if (resultado.error) {
      alert(resultado.error);
      return;
    }

    setAsignados((prev) => {
      const nuevo = new Set(prev);
      if (yaAsignado) nuevo.delete(proyectoId);
      else nuevo.add(proyectoId);
      return nuevo;
    });
  }

  const proyectosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return proyectos;
    return proyectos.filter(
      (p) => p.bc_job_no.toLowerCase().includes(texto) || (p.descripcion || '').toLowerCase().includes(texto)
    );
  }, [proyectos, busqueda]);

  if (usuarios.length === 0) {
    return <p className="text-slate text-sm">No tienes usuarios a cargo todavía.</p>;
  }

  return (
    <div className="max-w-xl">
      <label className="block text-sm font-medium text-grafito mb-1">Usuario</label>
      <select className="input mb-4" value={usuarioId} onChange={(e) => cambiarUsuario(e.target.value)}>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre_completo} — {u.email}
          </option>
        ))}
      </select>

      <input
        className="input mb-3"
        placeholder="Buscar proyecto por número o descripción..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div className="bg-white border border-borde rounded-lg divide-y divide-borde max-h-96 overflow-y-auto">
        {proyectosFiltrados.length === 0 ? (
          <p className="p-4 text-sm text-slate">No hay proyectos que coincidan.</p>
        ) : (
          proyectosFiltrados.map((p) => (
            <label key={p.id} className="flex items-center gap-3 p-3 text-sm cursor-pointer hover:bg-fondo">
              <input
                type="checkbox"
                checked={asignados.has(p.id)}
                disabled={guardandoId === p.id}
                onChange={() => alternar(p.id)}
              />
              <span className="font-mono text-grafito">{p.bc_job_no}</span>
              <span className="text-slate">{p.descripcion}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
