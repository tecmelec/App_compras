'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subirDocumento } from '@/lib/subir-documento';
import { eliminarDocumentoSolicitud, registrarDocumentoEnSolicitud } from '@/app/actions/documentos-solicitud';
import { EXTENSIONES_DOCUMENTO } from '@/lib/documentos-solicitud';

// Botón "Adjuntar documentos" del detalle de la solicitud (comprador y admin).
export function AdjuntarDocumentoSolicitud({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adjuntar(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);
    const errores: string[] = [];
    for (const archivo of Array.from(archivos)) {
      setSubiendo(archivo.name);
      const subida = await subirDocumento(archivo);
      if ('error' in subida) {
        errores.push(subida.error);
        continue;
      }
      const reg = await registrarDocumentoEnSolicitud(pedidoId, {
        ruta: subida.ruta,
        nombre: archivo.name,
        tipo: archivo.type,
        tamano: archivo.size,
      });
      if ('error' in reg && reg.error) errores.push(reg.error);
    }
    setSubiendo(null);
    if (input.current) input.current.value = '';
    if (errores.length) setError(errores.join(' '));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!subiendo}
        className="btn-secondary inline-flex items-center gap-2 text-sm py-1.5 disabled:opacity-60"
        title="Ofertas de proveedores, comparativos… Máx. 25 MB por archivo"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {subiendo ? `Subiendo "${subiendo}"…` : 'Adjuntar documentos'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={EXTENSIONES_DOCUMENTO.map((e) => '.' + e).join(',')}
        className="hidden"
        onChange={(e) => adjuntar(e.target.files)}
      />
      {error && <p className="text-xs text-rojo max-w-md text-right">{error}</p>}
    </div>
  );
}

// "Quitar" en los documentos que adjuntó quien está mirando (comprador o admin).
export function QuitarDocumentoSolicitud({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    setQuitando(true);
    const r = await eliminarDocumentoSolicitud(id);
    if ('error' in r && r.error) {
      setError(r.error);
      setQuitando(false);
      return;
    }
    router.refresh();
  }

  if (error) return <span className="text-xs text-rojo">{error}</span>;
  if (!confirmar) {
    return (
      <button onClick={() => setConfirmar(true)} className="text-xs text-rojo hover:underline ml-auto" title={`Quitar "${nombre}"`}>
        Quitar
      </button>
    );
  }
  return (
    <span className="text-xs ml-auto">
      <span className="text-grafito">¿Quitar?</span>{' '}
      <button onClick={quitar} disabled={quitando} className="text-rojo font-medium hover:underline">
        {quitando ? 'Quitando…' : 'Sí'}
      </button>{' '}
      <button onClick={() => setConfirmar(false)} disabled={quitando} className="text-slate hover:underline">
        No
      </button>
    </span>
  );
}
