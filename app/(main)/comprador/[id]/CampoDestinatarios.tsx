'use client';

import { useEffect, useRef, useState } from 'react';

export type ContactoSugerido = { email: string; veces: number; ultimoUso: string };

function colorAvatar(email: string): string {
  const colores = ['#178A4C', '#2563EB', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colores[Math.abs(hash) % colores.length];
}

function esEmailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export default function CampoDestinatarios({
  label,
  emails,
  onChange,
  sugerencias,
  placeholder,
}: {
  label: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  sugerencias: ContactoSugerido[];
  placeholder?: string;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function agregar(email: string) {
    const limpio = email.trim().toLowerCase();
    if (!limpio || emails.includes(limpio)) {
      setTexto('');
      return;
    }
    onChange([...emails, limpio]);
    setTexto('');
  }

  function quitar(email: string) {
    onChange(emails.filter((e) => e !== email));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      if (texto.trim()) {
        e.preventDefault();
        agregar(texto);
      }
    } else if (e.key === 'Backspace' && !texto && emails.length > 0) {
      quitar(emails[emails.length - 1]);
    }
  }

  const opciones = sugerencias
    .filter((s) => !emails.includes(s.email))
    .filter((s) => (texto.trim() ? s.email.includes(texto.trim().toLowerCase()) : true))
    .slice(0, 6);

  const puedeAgregarLibre = texto.trim() && esEmailValido(texto.trim()) && !opciones.some((o) => o.email === texto.trim().toLowerCase());

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs text-slate mb-1">{label}</label>
      <div
        className="input w-full text-xs mb-0 flex flex-wrap items-center gap-1.5 min-h-[2.25rem] cursor-text"
        onClick={() => setAbierto(true)}
      >
        {emails.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 bg-marcaClaro text-marca rounded-full pl-1 pr-1.5 py-0.5 text-[11px]"
          >
            <span
              className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-semibold shrink-0"
              style={{ backgroundColor: colorAvatar(email) }}
            >
              {email[0]?.toUpperCase()}
            </span>
            {email}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                quitar(email);
              }}
              className="text-marca/70 hover:text-marca ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (texto.trim() && esEmailValido(texto.trim())) agregar(texto);
          }}
          placeholder={emails.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[8rem] outline-none bg-transparent py-0.5"
        />
      </div>

      {abierto && (opciones.length > 0 || puedeAgregarLibre) && (
        <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-borde rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {opciones.map((s) => (
            <button
              key={s.email}
              type="button"
              onClick={() => agregar(s.email)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-marcaClaro/60 text-xs"
            >
              <span
                className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-semibold shrink-0"
                style={{ backgroundColor: colorAvatar(s.email) }}
              >
                {s.email[0]?.toUpperCase()}
              </span>
              <span className="text-grafito truncate">{s.email}</span>
            </button>
          ))}
          {puedeAgregarLibre && (
            <button
              type="button"
              onClick={() => agregar(texto)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-marcaClaro/60 text-xs border-t border-borde"
            >
              <span className="w-6 h-6 rounded-full bg-slate/20 text-slate flex items-center justify-center text-[10px] shrink-0">+</span>
              <span className="text-grafito">
                Añadir <span className="font-medium">{texto.trim()}</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
