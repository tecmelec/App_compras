'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FotoAlbaran } from '@/lib/fotos-albaranes';

// Botón "Ver albarán" de un Pedido Tecmelec: abre un visor con las fotos
// subidas desde Alb. Tecmelec para ese pedido (una o varias).
export default function VerAlbaranBoton({ numeroTecmelec, fotos }: { numeroTecmelec: string; fotos: FotoAlbaran[] }) {
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);

  const total = fotos.length;
  const anterior = useCallback(() => setIndice((i) => (i - 1 + total) % total), [total]);
  const siguiente = useCallback(() => setIndice((i) => (i + 1) % total), [total]);

  useEffect(() => {
    if (!abierto) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
      if (e.key === 'ArrowLeft') anterior();
      if (e.key === 'ArrowRight') siguiente();
    }
    window.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
    };
  }, [abierto, anterior, siguiente]);

  if (!total) return null;
  const foto = fotos[Math.min(indice, total - 1)];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndice(0);
          setAbierto(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#C7DBE7] bg-aceroClaro px-3 py-1.5 text-sm font-medium text-acero hover:border-acero"
        title={`Ver ${total === 1 ? 'la foto del albarán' : `las ${total} fotos del albarán`}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Ver albarán
        {total > 1 && (
          <span className="ml-0.5 rounded-full bg-acero px-1.5 text-[11px] font-semibold leading-[18px] text-white">{total}</span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={() => setAbierto(false)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="font-medium">Albarán · Pedido Tecmelec {numeroTecmelec}</p>
              <p className="text-xs text-white/70">
                Foto {indice + 1} de {total} · {new Date(foto.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={foto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                Abrir original
              </a>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-md p-1.5 hover:bg-white/10"
                aria-label="Cerrar"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 min-h-0 items-center justify-center px-2 sm:px-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={foto.url}
              src={foto.url}
              alt={`Albarán ${numeroTecmelec} (${indice + 1})`}
              className="max-h-full max-w-full object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    anterior();
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Foto anterior"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    siguiente();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Foto siguiente"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3" onClick={(e) => e.stopPropagation()}>
              {fotos.map((f, i) => (
                <button
                  key={f.nombre}
                  type="button"
                  onClick={() => setIndice(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 ${i === indice ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  aria-label={`Ver foto ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.miniatura}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      if (e.currentTarget.src !== f.url) e.currentTarget.src = f.url;
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
