'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Desplegable con buscador (genérico). La lista se pinta en el <body> con posición fija
// para que no la recorte ninguna ventana o tarjeta (igual que ComboboxProveedor).
export type OpcionBuscable = { value: string; label: string };

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ComboboxBuscable({
  opciones,
  value,
  onChange,
  placeholder = 'Buscar…',
  className = '',
}: {
  opciones: OpcionBuscable[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);

  const seleccionada = opciones.find((o) => o.value === value);
  const filtradas = useMemo(() => {
    const t = sinAcentos(texto.trim());
    if (!t) return opciones;
    const palabras = t.split(/\s+/);
    return opciones.filter((o) => palabras.every((p) => sinAcentos(o.label).includes(p)));
  }, [texto, opciones]);

  useEffect(() => {
    function fuera(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || listaRef.current?.contains(t)) return;
      setAbierto(false);
      setTexto('');
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
    };
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    function calcular() {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ancho = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
      const abajo = window.innerHeight - r.bottom - 8;
      const arriba = r.top - 8;
      if (abajo >= 200 || abajo >= arriba) setPos({ left, top: r.bottom + 4, width: ancho, maxHeight: Math.min(280, abajo - 4) });
      else setPos({ left, bottom: window.innerHeight - r.top + 4, width: ancho, maxHeight: Math.min(280, arriba - 4) });
    }
    calcular();
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    return () => {
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', calcular, true);
    };
  }, [abierto]);

  function elegir(v: string) {
    onChange(v);
    setAbierto(false);
    setTexto('');
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        className="input w-full text-sm pr-8"
        value={abierto ? texto : seleccionada?.label || ''}
        placeholder={abierto ? seleccionada?.label || placeholder : placeholder}
        onFocus={() => {
          setAbierto(true);
          setResaltado(0);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setResaltado(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setResaltado((i) => Math.min(i + 1, filtradas.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setResaltado((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtradas[resaltado]) elegir(filtradas[resaltado].value);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setAbierto(false);
            setTexto('');
          }
        }}
      />
      <svg
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate pointer-events-none"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      {abierto &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listaRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: Math.max(120, pos.maxHeight) }}
            className="bg-white border border-borde rounded-lg shadow-lg z-[100] overflow-y-auto"
          >
            {filtradas.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate">Sin resultados para &quot;{texto}&quot;.</p>
            ) : (
              filtradas.map((o, i) => (
                <button
                  key={o.value || '__vacio__'}
                  type="button"
                  onClick={() => elegir(o.value)}
                  onMouseEnter={() => setResaltado(i)}
                  className={`w-full text-left px-3 py-2 text-sm ${
                    resaltado === i ? 'bg-marcaClaro text-marca' : o.value === value ? 'bg-fondo text-grafito' : 'text-grafito hover:bg-fondo'
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
