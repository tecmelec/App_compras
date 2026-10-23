'use client';

import { useCallback, useEffect, useState } from 'react';
import { descargarAdjuntoOferta, obtenerRespuestasOferta, type RespuestaOferta } from '@/app/actions/peticion-oferta';
import { PresupuestoModal } from './PresupuestoBoton';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };
type Peticion = {
  id: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  destinatarios: string[];
  lineas: { articulo: string }[];
  sugerido: boolean;
  enviado_en: string;
  enviadoPor: string | null;
};

const fecha = (f: string) =>
  new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function base64AFile(base64: string, nombre: string, tipo: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nombre, { type: tipo });
}

// "Peticiones de oferta enviadas" con las respuestas de los proveedores (leídas del hilo
// en el buzón) y sus adjuntos: "Ver" y "Usar como presupuesto".
export default function PeticionesOfertaCliente({
  pedidoId,
  peticiones,
  proveedores,
  preciosActuales,
}: {
  pedidoId: string;
  peticiones: Peticion[];
  proveedores: Proveedor[];
  preciosActuales: { id: string; precio: number }[];
}) {
  const [respuestas, setRespuestas] = useState<Record<string, { respuestas: RespuestaOferta[]; error?: string }> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [presupuesto, setPresupuesto] = useState<{ archivo: File; proveedorId: string | null } | null>(null);

  const comprobar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const r = await obtenerRespuestasOferta(pedidoId);
    setCargando(false);
    if ('error' in r && r.error) setError(r.error);
    else setRespuestas((r as any).respuestas);
  }, [pedidoId]);

  useEffect(() => {
    comprobar();
  }, [comprobar]);

  async function descargar(peticionId: string, messageId: string, adjuntoId: string) {
    setOcupado(adjuntoId);
    const r = await descargarAdjuntoOferta(peticionId, messageId, adjuntoId);
    setOcupado(null);
    if ('error' in r && r.error) {
      setError(r.error);
      return null;
    }
    const a = r as { nombre: string; tipo: string; base64: string };
    return base64AFile(a.base64, a.nombre, a.tipo);
  }

  async function ver(peticionId: string, messageId: string, adjuntoId: string) {
    const f = await descargar(peticionId, messageId, adjuntoId);
    if (f) window.open(URL.createObjectURL(f), '_blank');
  }

  async function usar(p: Peticion, messageId: string, adjuntoId: string) {
    const f = await descargar(p.id, messageId, adjuntoId);
    if (f) setPresupuesto({ archivo: f, proveedorId: p.proveedor_id });
  }

  const respondidas = respuestas ? peticiones.filter((p) => (respuestas[p.id]?.respuestas || []).length > 0).length : 0;

  return (
    <section className="bg-white border border-borde rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-grafito">
          Peticiones de oferta enviadas <span className="text-slate font-normal">({peticiones.length})</span>
          {respuestas && (
            <span className="ml-2 text-xs font-normal text-slate">
              · {respondidas} con respuesta
            </span>
          )}
        </h2>
        <button onClick={comprobar} disabled={cargando} className="text-xs text-marca hover:underline disabled:opacity-60">
          {cargando ? 'Comprobando respuestas…' : '↻ Comprobar respuestas'}
        </button>
      </div>
      {error && <p className="text-xs text-rojo mb-2">{error}</p>}
      <ul className="divide-y divide-borde">
        {peticiones.map((p) => {
          const r = respuestas?.[p.id];
          return (
            <li key={p.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-grafito">{p.proveedor_nombre}</span>
                {!p.sugerido && <span className="text-xs text-slate">(añadido a mano)</span>}
                <span className="text-xs text-slate">
                  {fecha(p.enviado_en)}
                  {p.enviadoPor ? ` · ${p.enviadoPor}` : ''} · {(p.destinatarios || []).join(', ')}
                </span>
                {r && r.respuestas.length === 0 && !r.error && <span className="text-xs text-slate">· Sin respuesta</span>}
              </div>
              <p className="text-xs text-slate mt-0.5">{(p.lineas || []).map((l) => l.articulo).join(' · ')}</p>
              {r?.error && <p className="text-xs text-rojo mt-1">No se pudo comprobar: {r.error}</p>}
              {r?.respuestas.map((m) => (
                <div key={m.messageId} className="mt-2 ml-3 pl-3 border-l-2 border-[#A7E3C4]">
                  <p className="text-xs text-[#047857] font-medium">
                    Respondió {m.deNombre} · {fecha(m.fecha)}
                  </p>
                  {m.resumen && <p className="text-xs text-grafito mt-0.5 line-clamp-3">{m.resumen}</p>}
                  {m.adjuntos.length === 0 ? (
                    <p className="text-xs text-slate mt-0.5">Sin adjuntos.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {m.adjuntos.map((a) => {
                        const analizable = a.tipo === 'application/pdf' || a.tipo.startsWith('image/');
                        return (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            <span className="text-grafito">📎 {a.nombre}</span>
                            <span className="text-slate">{kb(a.tamano)}</span>
                            <button onClick={() => ver(p.id, m.messageId, a.id)} disabled={!!ocupado} className="text-marca hover:underline">
                              {ocupado === a.id ? 'Descargando…' : 'Ver'}
                            </button>
                            {analizable && (
                              <button
                                onClick={() => usar(p, m.messageId, a.id)}
                                disabled={!!ocupado}
                                className="text-marca font-medium hover:underline"
                              >
                                Usar como presupuesto
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {presupuesto && (
        <PresupuestoModal
          pedidoId={pedidoId}
          proveedores={proveedores}
          preciosActuales={preciosActuales}
          archivosIniciales={[presupuesto.archivo]}
          proveedorIdInicial={presupuesto.proveedorId}
          onCerrar={() => setPresupuesto(null)}
        />
      )}
    </section>
  );
}
