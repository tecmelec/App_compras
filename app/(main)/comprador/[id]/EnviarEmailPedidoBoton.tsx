'use client';

import { useEffect, useRef, useState } from 'react';
import { enviarPedidoPorEmail } from '@/app/actions/email-pedido';

export default function EnviarEmailPedidoBoton({
  numeroTecmelec,
  conFotos,
}: {
  numeroTecmelec: string;
  conFotos: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ destinatarios: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function abrir() {
    setResultado(null);
    setError(null);
    setAbierto(true);
  }

  async function handleEnviar() {
    setEnviando(true);
    setError(null);

    const r = await enviarPedidoPorEmail(numeroTecmelec, conFotos);

    setEnviando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado({ destinatarios: r.destinatarios || [] });
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
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-borde bg-white shadow-lg p-4 text-sm">
          {!resultado && (
            <>
              <p className="text-grafito mb-1">
                Enviar el pedido <span className="font-mono">{numeroTecmelec}</span>
                {conFotos ? ' (con fotos)' : ''} por email al proveedor.
              </p>
              <p className="text-xs text-slate mb-3">
                Asunto: PEDIDO DE COMPRA {numeroTecmelec}. El destinatario se toma del email registrado en la ficha
                del proveedor en Business Central.
              </p>
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
          {resultado && (
            <>
              <p className="text-grafito mb-1">Email enviado a:</p>
              <p className="text-xs text-slate mb-3">{resultado.destinatarios.join(', ')}</p>
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
