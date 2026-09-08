'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ETIQUETAS_ROL: Record<string, string> = {
  admin: 'Administrador',
  usuario: 'Usuario',
  comprador: 'Comprador',
  responsable: 'Responsable',
};

export default function CuentaMenu({ nombre, rol }: { nombre: string; rol: string }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-fondo text-sm text-grafito"
      >
        <span className="w-7 h-7 rounded-full bg-marcaClaro text-marca flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span className="hidden sm:inline font-medium max-w-[10rem] truncate">{nombre}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-borde rounded-lg shadow-lg z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-borde">
              <p className="text-sm font-medium text-grafito truncate">{nombre}</p>
              <p className="text-xs text-slate">{ETIQUETAS_ROL[rol] || rol}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2.5 text-sm text-rojo hover:bg-fondo"
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
