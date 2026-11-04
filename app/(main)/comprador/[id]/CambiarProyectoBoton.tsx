'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ComboboxBuscable from '@/components/ComboboxBuscable';
import {
  aprobadoresCambioProyecto,
  cambiarProyectoSolicitud,
  opcionesCambioProyecto,
  type ProyectoOpcion,
} from '@/app/actions/cambio-proyecto';
import type { AprobadorOpcion } from '@/app/actions/aprobadores-proyecto';

// "Editar" del proyecto de la solicitud (vista del comprador; solo admin y comprador).
export default function CambiarProyectoBoton({ pedidoId, proyectoActualId }: { pedidoId: string; proyectoActualId: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-marca font-medium hover:underline">
        Editar
      </button>
      {abierto && <Modal pedidoId={pedidoId} proyectoActualId={proyectoActualId} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Modal({ pedidoId, proyectoActualId, onCerrar }: { pedidoId: string; proyectoActualId: string | null; onCerrar: () => void }) {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<ProyectoOpcion[] | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [lineasConTarea, setLineasConTarea] = useState(0);
  const [pedidosBC, setPedidosBC] = useState<string[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [comentario, setComentario] = useState('');
  const [elegibles, setElegibles] = useState<AprobadorOpcion[]>([]);
  const [jefe, setJefe] = useState<{ id: string; nombre: string } | null>(null);
  const [aprobadorId, setAprobadorId] = useState('');
  const [cargandoAprobadores, setCargandoAprobadores] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    opcionesCambioProyecto(pedidoId).then((r) => {
      if (r.error) return setError(r.error);
      setProyectos((r.proyectos || []).filter((p) => p.id !== proyectoActualId));
      setPendiente(!!r.pendienteAprobacion);
      setLineasConTarea(r.lineasConTarea || 0);
      setPedidosBC(r.pedidosBC || []);
    });
  }, [pedidoId, proyectoActualId]);

  useEffect(() => {
    setElegibles([]);
    setJefe(null);
    setAprobadorId('');
    if (!pendiente || !proyectoId) return;
    let vigente = true;
    setCargandoAprobadores(true);
    aprobadoresCambioProyecto(proyectoId).then((r) => {
      if (!vigente) return;
      setCargandoAprobadores(false);
      setElegibles(r.elegibles);
      setJefe(r.jefe);
    });
    return () => {
      vigente = false;
    };
  }, [pendiente, proyectoId]);

  async function guardar() {
    setError(null);
    setGuardando(true);
    const r = await cambiarProyectoSolicitud(pedidoId, proyectoId, comentario, aprobadorId || null);
    setGuardando(false);
    if (r.error) return setError(r.error);
    router.refresh();
    if (r.aviso) setAviso(r.aviso);
    else onCerrar();
  }

  const faltaAprobador = pendiente && elegibles.length > 0 && !aprobadorId;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onCerrar}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-grafito mb-1">Cambiar el proyecto</h2>
        <p className="text-sm text-slate mb-4">El cambio queda registrado con tu nombre, la fecha y el comentario.</p>

        {aviso ? (
          <>
            <p className="text-sm text-grafito bg-marcaClaro border border-[#C4DECD] rounded-md px-3 py-2 mb-3">Proyecto cambiado.</p>
            <p className="text-sm text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-4">{aviso}</p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-grafito mb-1">Proyecto nuevo</label>
            {proyectos === null && !error ? (
              <p className="text-sm text-slate mb-3">Cargando proyectos…</p>
            ) : (
              <ComboboxBuscable
                opciones={(proyectos || []).map((p) => ({ value: p.id, label: `${p.bc_job_no} — ${p.descripcion || ''}` }))}
                value={proyectoId}
                onChange={setProyectoId}
                placeholder="Buscar por número o descripción…"
                className="mb-3"
              />
            )}

            {pendiente && proyectoId && (
              <div className="mb-3">
                <p className="block text-sm font-medium text-grafito mb-1">Aprobador</p>
                {cargandoAprobadores ? (
                  <p className="text-xs text-slate">Comprobando los aprobadores del proyecto…</p>
                ) : elegibles.length > 0 ? (
                  <select className="input" value={aprobadorId} onChange={(e) => setAprobadorId(e.target.value)}>
                    <option value="">Elige quién aprueba…</option>
                    {elegibles.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                        {a.jefeObraBC ? ' (jefe de obra en BC)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate">
                    {jefe
                      ? `La solicitud está pendiente de aprobación: pasará a aprobarla ${jefe.nombre} (jefe de obra en BC).`
                      : 'La solicitud está pendiente de aprobación: el proyecto nuevo no tiene aprobador en la app, se mantiene el actual.'}
                  </p>
                )}
              </div>
            )}

            {pedidosBC.length > 0 && (
              <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-2">
                Ya hay pedido de compra en BC ({pedidosBC.join(', ')}). La app no cambia el proyecto en BC: cámbialo también en las líneas del
                pedido allí. Al sincronizar, si las líneas de BC tienen otro proyecto, la app se pone al día sola.
              </p>
            )}
            {lineasConTarea > 0 && (
              <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-2">
                {lineasConTarea} {lineasConTarea === 1 ? 'línea tiene' : 'líneas tienen'} tarea de planificación del proyecto anterior: revisa en BC
                las líneas de planificación.
              </p>
            )}

            <label className="block text-sm font-medium text-grafito mb-1 mt-3" htmlFor="comentario-proyecto">
              Comentario <span className="text-xs text-slate font-normal">(opcional)</span>
            </label>
            <textarea
              id="comentario-proyecto"
              className="input resize-y mb-3"
              rows={2}
              maxLength={1000}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Motivo del cambio…"
            />

            {error && <p className="text-sm text-rojo mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={guardar} disabled={guardando || !proyectoId || faltaAprobador || cargandoAprobadores}>
                {guardando ? 'Guardando…' : 'Cambiar proyecto'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
