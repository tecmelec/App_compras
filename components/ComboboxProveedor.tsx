'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

  function etiqueta(p: Proveedor) {
    return `${p.bc_proveedor_no} — ${p.nombre || ''}`;
  }

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto('');
      }
    }
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

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

      {abierto && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[16rem] bg-white border border-borde rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto">
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
        </div>
      )}
    </div>
  );
}
