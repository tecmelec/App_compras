'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };

const OPCION_SIN_ASIGNAR = '— Sin asignar —';

// Selector de proveedor con buscador: en vez de un <select> nativo (que con un
// maestro de proveedores grande de Business Central obliga a hacer scroll por
// una lista larga), muestra un campo de texto que filtra en vivo por número de
// proveedor (bc_proveedor_no) o por nombre/descripción a medida que se escribe.
export default function ComboboxProveedor({
  proveedores,
  value,
  onChange,
  className = '',
}: {
  proveedores: Proveedor[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const seleccionado = proveedores.find((p) => p.id === value) || null;

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  // La lista se pinta en el <body> con posición fija, para que no la recorte ninguna
  // tarjeta con overflow (p. ej. en el móvil, dentro de las líneas de la solicitud).
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);

  function etiqueta(p: Proveedor) {
    return `${p.bc_proveedor_no} — ${p.nombre || ''}`;
  }

  useEffect(() => {
    function handleClickFuera(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(t) && !(listaRef.current && listaRef.current.contains(t))) {
        setAbierto(false);
        setTexto('');
      }
    }
    document.addEventListener('mousedown', handleClickFuera);
    document.addEventListener('touchstart', handleClickFuera);
    return () => {
      document.removeEventListener('mousedown', handleClickFuera);
      document.removeEventListener('touchstart', handleClickFuera);
    };
  }, []);

  // Posición de la lista: debajo del campo o, si no cabe, encima.
  useLayoutEffect(() => {
    if (!abierto) return;
    function calcular() {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ancho = Math.min(Math.max(r.width, 256), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
      const abajo = window.innerHeight - r.bottom - 8;
      const arriba = r.top - 8;
      if (abajo >= 200 || abajo >= arriba) setPos({ left, top: r.bottom + 4, width: ancho, maxHeight: Math.min(256, abajo - 4) });
      else setPos({ left, bottom: window.innerHeight - r.top + 4, width: ancho, maxHeight: Math.min(256, arriba - 4) });
    }
    calcular();
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    return () => {
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', calcular, true);
    };
  }, [abierto]);

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter(
      (p) => p.bc_proveedor_no.toLowerCase().includes(q) || (p.nombre || '').toLowerCase().includes(q)
    );
  }, [proveedores, texto]);

  // Índice 0 = "Sin asignar", 1..n = filtrados[0..n-1]
  const totalOpciones = filtrados.length + 1;

  useEffect(() => {
    setResaltado(0);
  }, [texto, abierto]);

  function abrir() {
    setAbierto(true);
    setTexto('');
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function elegir(id: string) {
    onChange(id);
    setAbierto(false);
    setTexto('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!abierto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        abrir();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, totalOpciones - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (resaltado === 0) elegir('');
      else elegir(filtrados[resaltado - 1]?.id ?? '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
      setTexto('');
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {abierto ? (
        <input
          ref={inputRef}
          type="text"
          className="input py-1 w-full"
          value={texto}
          placeholder="Buscar por nº o nombre…"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          type="button"
          onClick={abrir}
          onKeyDown={handleKeyDown}
          className={`input py-1 w-full text-left flex items-center justify-between gap-1 ${
            seleccionado ? 'text-grafito' : 'text-slate'
          }`}
        >
          <span className="truncate">{seleccionado ? etiqueta(seleccionado) : OPCION_SIN_ASIGNAR}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 opacity-50"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {abierto &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
        <div
          ref={listaRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: Math.max(120, pos.maxHeight) }}
          className="bg-white border border-borde rounded-lg shadow-lg z-[100] overflow-y-auto"
        >
          <button
            type="button"
            onClick={() => elegir('')}
            onMouseEnter={() => setResaltado(0)}
            className={`w-full text-left px-3 py-2 text-sm ${
              resaltado === 0 ? 'bg-marcaClaro text-marca' : 'text-slate hover:bg-fondo'
            }`}
          >
            {OPCION_SIN_ASIGNAR}
          </button>

          {filtrados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate">Sin resultados para &quot;{texto}&quot;.</p>
          ) : (
            filtrados.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p.id)}
                onMouseEnter={() => setResaltado(i + 1)}
                className={`w-full text-left px-3 py-2 text-sm truncate ${
                  resaltado === i + 1 ? 'bg-marcaClaro text-marca' : 'text-grafito hover:bg-fondo'
                }`}
              >
                {etiqueta(p)}
              </button>
            ))
          )}
        </div>,
          document.body
        )}
    </div>
  );
}
