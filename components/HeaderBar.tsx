'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CartIcon from '@/components/CartIcon';
import CuentaMenu from '@/components/CuentaMenu';

export default function HeaderBar({
  nombre,
  rol,
  mostrarCarrito,
}: {
  nombre: string;
  rol: string;
  mostrarCarrito: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get('q') || '');

  function actualizar(v: string) {
    setValor(v);
    if (pathname === '/tienda') {
      const params = new URLSearchParams(searchParams.toString());
      if (v) params.set('q', v);
      else params.delete('q');
      router.replace(`/tienda${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
    }
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (pathname !== '/tienda') {
      router.push(`/tienda${valor.trim() ? `?q=${encodeURIComponent(valor.trim())}` : ''}`);
    }
  }

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-6 py-3 border-b border-borde bg-white">
      {mostrarCarrito ? (
        <form onSubmit={buscar} className="flex-1 max-w-md">
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
              className="input input-icon-left"
              placeholder="Buscar por referencia, nombre, descripción o categoría..."
              value={valor}
              onChange={(e) => actualizar(e.target.value)}
            />
          </div>
        </form>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-3 shrink-0">
        {mostrarCarrito && <CartIcon />}
        <CuentaMenu nombre={nombre} rol={rol} />
      </div>
    </div>
  );
}
