'use client';

import { useEffect, useRef, useState } from 'react';
import { enviarPedidoPorEmail, obtenerDatosEmailPedido } from '@/app/actions/email-pedido';

const MENSAJE_POR_DEFECTO = (numeroTecmelec: string) => `Buenas,\nAdjuntamos el pedido de compra ${numeroTecmelec}.`;

export default function EnviarEmailPedidoBoton({
  numeroTecmelec,
  conFotos,
}: {
  numeroTecmelec: string;
  conFotos: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviado, setEnviado] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  async function abrir() {
    setEnviado(null);
    setError(null);
    setAbierto(true);
    setCargando(true);

    const r = await obtenerDatosEmailPedido(numeroTecmelec);

    setCargando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setPara((r.emails || []).join(', '));
    setMensaje(MENSAJE_POR_DEFECTO(numeroTecmelec));
  }

  async function handleEnviar() {
    const destinatarios = para
      .split(/[;,]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (destinatarios.length === 0) {
      setError('Añade al menos un destinatario.');
      return;
    }

    setEnviando(true);
    setError(null);

    const r = await enviarPedidoPorEmail(numeroTecmelec, conFotos, destinatarios, mensaje);

    setEnviando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setEnviado(r.destinatarios || destinatarios);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={abrir}
        title={conFotos ? 'Enviar por email (con fotos)' : 'Enviar por email'}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/20 text-slate hover:bg-slate/30 hover:text-grafito"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6 12 13 2 6" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-borde bg-white shadow-lg p-4 text-sm">
          {cargando && <p className="text-xs text-slate">Cargando datos del proveedor…</p>}

          {!cargando && !enviado && (
            <>
              <p className="text-xs font-semibold text-grafito mb-2">
                Pedido {numeroTecmelec}
                {conFotos ? ' (con fotos)' : ''}
              </p>

              <label className="block text-xs text-slate mb-1">Para</label>
              <input
                type="text"
                value={para}
                onChange={(e) => setPara(e.target.value)}
                placeholder="email@proveedor.com, otro@proveedor.com"
                className="input w-full text-xs mb-3"
              />

              <label className="block text-xs text-slate mb-1">Mensaje</label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={4}
                className="input w-full text-xs mb-1 resize-none"
              />
              <p className="text-[11px] text-slate mb-3">Asunto: PEDIDO DE COMPRA {numeroTecmelec}</p>

              {error && <p className="text-xs text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbierto(false)} className="text-xs text-slate hover:text-grafito px-2 py-1">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleEnviar}
                  disabled={enviando}
                  className="text-xs bg-marca text-white rounded-md px-3 py-1.5 disabled:opacity-60"
                >
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          )}

          {enviado && (
            <>
              <p className="text-grafito mb-1">Email enviado a:</p>
              <p className="text-xs text-slate mb-3">{enviado.join(', ')}</p>
              <div className="flex justify-end">
                <button type="button" onClick={() => setAbierto(false)} className="text-xs text-marca hover:underline px-2 py-1">
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
