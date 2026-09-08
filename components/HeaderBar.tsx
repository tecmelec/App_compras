'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CartIcon from '@/components/CartIcon';
import CuentaMenu from '@/components/CuentaMenu';

export default function HeaderBar({
  nombre,
  rol,
  mostrarBuscador,
  mostrarCarrito,
}: {
  nombre: string;
  rol: string;
  mostrarBuscador: boolean;
  mostrarCarrito: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const router = useRouter();

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/tienda${busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : ''}`);
  }

  return (
    <div className="sticky top-0 z-30 flex items-center gap-4 px-6 py-3 border-b border-borde bg-white">
      <div className="flex-1 max-w-md">
        {mostrarBuscador && (
          <form onSubmit={buscar}>
            <div className="relative">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="input pl-9"
                placeholder="Buscar por referencia, descripción o categoría..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </form>
        )}
      </div>

      <div className="flex items-center gap-3">
        {mostrarCarrito && <CartIcon />}
        <CuentaMenu nombre={nombre} rol={rol} />
      </div>
    </div>
  );
}
