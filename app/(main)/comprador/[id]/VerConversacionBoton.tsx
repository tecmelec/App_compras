'use client';

import { useState } from 'react';
import { obtenerConversacionPedido } from '@/app/actions/email-pedido';
import type { MensajeConversacionGraph } from '@/lib/microsoft-graph';

export default function VerConversacionBoton({ numeroTecmelec }: { numeroTecmelec: string }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeConversacionGraph[] | null>(null);
  const [enviado, setEnviado] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    setMensajes(null);

    const r = await obtenerConversacionPedido(numeroTecmelec);

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setMensajes(r.mensajes || []);
    setEnviado(r.enviado ?? true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Ver conversación por email"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/20 text-slate hover:bg-slate/30 hover:text-grafito"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setAbierto(false)}>
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-grafito">Conversación — pedido {numeroTecmelec}</h3>
              <button type="button" onClick={() => setAbierto(false)} className="text-slate hover:text-grafito text-sm">
                Cerrar
              </button>
            </div>

            {cargando && <p className="text-xs text-slate">Cargando…</p>}

            {error && (
              <p className="text-xs text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">{error}</p>
            )}

            {!cargando && !error && !enviado && (
              <p className="text-xs text-slate">Todavía no se ha enviado ningún email para este pedido desde la app.</p>
            )}

            {!cargando && !error && enviado && mensajes && mensajes.length === 0 && (
              <p className="text-xs text-slate">Se envió el email pero aún no hay mensajes que mostrar.</p>
            )}

            {!cargando && !error && mensajes && mensajes.length > 0 && (
              <div className="space-y-3">
                {mensajes.map((m) => (
                  <div key={m.id} className="border border-borde rounded-lg p-3">
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-xs font-semibold text-grafito">{m.deNombre}</p>
                      <p className="text-[11px] text-slate">
                        {new Date(m.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <p className="text-xs text-slate whitespace-pre-line">{m.resumen}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
