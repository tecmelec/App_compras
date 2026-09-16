'use client';

import { useState } from 'react';
import { obtenerDatosEmailPedido } from '@/app/actions/email-pedido';

export default function EnviarEmailPedidoBoton({
  numeroTecmelec,
  conFotos,
}: {
  numeroTecmelec: string;
  conFotos: boolean;
}) {
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function handleClick() {
    setCargando(true);
    setAviso(null);

    // Se abre ya el PDF (misma pestaña nueva que "Ver PDF"/"PDF con fotos")
    // para que quede a mano y se pueda adjuntar al correo.
    const urlPdf = `/api/pedidos/${encodeURIComponent(numeroTecmelec)}/pdf${conFotos ? '?fotos=1' : ''}`;
    window.open(urlPdf, '_blank', 'noopener,noreferrer');

    const r = await obtenerDatosEmailPedido(numeroTecmelec);

    setCargando(false);

    if (r.error) {
      setAviso(r.error);
      return;
    }

    const para = (r.emails || []).join(',');
    const asunto = `PEDIDO DE COMPRA ${numeroTecmelec}`;
    const cuerpo = `Buenas,\nAdjuntamos el pedido de compra ${numeroTecmelec}${
      r.proveedorNombre ? ` para ${r.proveedorNombre}` : ''
    }.\n\nUn saludo,\nTecmelec Electricidad S.L.`;

    const mailto = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

    if (!para) {
      setAviso('El proveedor no tiene email registrado en BC — se abre el correo sin destinatario.');
    }

    window.location.href = mailto;
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={cargando}
        title={conFotos ? 'Abrir email (con fotos)' : 'Abrir email'}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/20 text-slate hover:bg-slate/30 hover:text-grafito disabled:opacity-60"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6 12 13 2 6" />
        </svg>
      </button>

      {aviso && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-borde bg-white shadow-lg p-3 text-xs text-slate">
          {aviso}
          <div className="flex justify-end mt-2">
            <button type="button" onClick={() => setAviso(null)} className="text-marca hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
