'use client';

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { subirDocumento } from '@/lib/subir-documento';
import {
  documentosCarrito,
  registrarDocumento,
  type DocumentoCarrito,
} from '@/app/actions/documentos-solicitud';
import { EXTENSIONES_DOCUMENTO, tamanoLegible } from '@/lib/documentos-solicitud';

// Documentos que acompañan a la solicitud (planos, presupuestos, fichas técnicas...).
// Solo para los perfiles distintos de "usuario". Se suben al momento y se vinculan a la
// solicitud al enviarla.
export default function DocumentosCarrito() {
  const { documentos: ids, addDocumento, removeDocumento } = useCart();
  const [documentos, setDocumentos] = useState<DocumentoCarrito[]>([]);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const clave = ids.join(',');

  useEffect(() => {
    let vigente = true;
    if (ids.length === 0) {
      setDocumentos([]);
      return;
    }
    documentosCarrito(ids).then((r) => {
      if (!vigente) return;
      setDocumentos(r.documentos);
      // Ids que ya no existen (borrados o ya enviados): se quitan del carrito.
      const encontrados = new Set(r.documentos.map((d) => d.id));
      ids.filter((id) => !encontrados.has(id)).forEach(removeDocumento);
    });
    return () => {
      vigente = false;
    };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { ruta } = subida;
      const reg = await registrarDocumento({ ruta, nombre: archivo.name, tipo: archivo.type, tamano: archivo.size });
      if ('error' in reg && reg.error) {
        errores.push(reg.error);
        continue;
      }
      addDocumento((reg as { id: string }).id);
    }
    setSubiendo(null);
    if (input.current) input.current.value = '';
    if (errores.length) setError(errores.join(' '));
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-3 mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-grafito">Documentos adjuntos</p>
          <p className="text-xs text-slate">
            Comparativos, presupuestos, fichas técnicas… Acompañan a la solicitud para facilitar la compra. Máx. 25 MB por archivo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!!subiendo}
          className="btn-secondary inline-flex items-center gap-2 disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          {subiendo ? 'Subiendo…' : 'Adjuntar documentos'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={EXTENSIONES_DOCUMENTO.map((e) => '.' + e).join(',')}
          className="hidden"
          onChange={(e) => adjuntar(e.target.files)}
        />
      </div>
      {subiendo && <p className="text-xs text-slate">Subiendo "{subiendo}"…</p>}
      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">{error}</p>
      )}
      {documentos.length > 0 && (
        <ul className="divide-y divide-borde border-t border-borde">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="shrink-0" aria-hidden>
                📄
              </span>
              <span className="flex-1 min-w-0 truncate text-grafito" title={d.nombre}>
                {d.nombre}
                <span className="text-xs text-slate ml-2">{tamanoLegible(d.tamano)}</span>
              </span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-marca hover:underline shrink-0">
                  Ver
                </a>
              )}
              {confirmar === d.id ? (
                <span className="shrink-0">
                  <span className="text-grafito">¿Quitar?</span>{' '}
                  <button
                    onClick={() => {
                      setConfirmar(null);
                      removeDocumento(d.id);
                    }}
                    className="text-rojo font-medium hover:underline"
                  >
                    Sí
                  </button>{' '}
                  <button onClick={() => setConfirmar(null)} className="text-slate hover:underline">
                    No
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmar(d.id)} className="text-rojo hover:underline shrink-0">
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
