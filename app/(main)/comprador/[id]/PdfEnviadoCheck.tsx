'use client';

import { useEffect, useState } from 'react';
import { marcarPdfEnviado } from '@/app/actions/email-pedido';

// Check "PDF enviado" de un Pedido Tecmelec. Se marca solo al enviar el email
// desde la app, y también se puede marcar/desmarcar a mano (p. ej. si el PDF
// se mandó por otro medio).
export default function PdfEnviadoCheck({
  numeroTecmelec,
  pdfEnviado,
}: {
  numeroTecmelec: string;
  pdfEnviado: boolean;
}) {
  const [marcado, setMarcado] = useState(pdfEnviado);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el servidor cambia el valor (p. ej. tras enviar el email y refrescar), lo seguimos.
  useEffect(() => {
    setMarcado(pdfEnviado);
  }, [pdfEnviado]);

  async function handleChange(valor: boolean) {
    const anterior = marcado;
    setMarcado(valor);
    setGuardando(true);
    setError(null);

    const r = await marcarPdfEnviado(numeroTecmelec, valor);

    setGuardando(false);
    if (r.error) {
      setMarcado(anterior);
      setError(r.error);
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <div className="relative inline-block">
      <label
        className={`inline-flex items-center gap-1.5 text-sm cursor-pointer select-none ${
          marcado ? 'text-marca' : 'text-slate'
        } ${guardando ? 'opacity-60' : ''}`}
        title="Se marca automáticamente al enviar el email; también puedes marcarlo o desmarcarlo a mano"
      >
        <input
          type="checkbox"
          checked={marcado}
          disabled={guardando}
          onChange={(e) => handleChange(e.target.checked)}
          className="w-4 h-4 rounded border-borde accent-[#178A4C] cursor-pointer"
        />
        PDF enviado
      </label>

      {error && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md bg-white border border-[#E7C7C7] text-rojo text-[11px] px-2 py-1.5 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
