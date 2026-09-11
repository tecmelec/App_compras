'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContactoComprador } from '@/lib/pedidos-utils';

export default function ContactarComprasBoton({ comprador }: { comprador: ContactoComprador | null }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  const email = comprador?.email || 'compras@tecmelec.es';
  const telefono = comprador?.telefono;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="btn-secondary flex items-center gap-2 whitespace-nowrap"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6 12 13 2 6" />
        </svg>
        Contactar con Compras
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-borde bg-white shadow-lg overflow-hidden text-sm">
          {comprador && (
            <p className="px-4 pt-3 pb-1 text-xs text-slate">{comprador.nombre_completo}</p>
          )}
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 px-4 py-3 text-grafito hover:bg-marcaClaro"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 6 12 13 2 6" />
            </svg>
            Enviar email
          </a>
          {telefono && (
            <a
              href={`tel:${telefono}`}
              className="flex items-center gap-2 px-4 py-3 text-grafito hover:bg-marcaClaro border-t border-borde"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Llamar · {telefono}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
