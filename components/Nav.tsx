'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';

type Props = {
  nombre: string;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  pendientesAprobacion?: number;
};

export default function Nav({ nombre, rol, pendientesAprobacion = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  const links = [
    { href: '/tienda', label: 'Tienda Tecmelec', roles: ['admin', 'usuario', 'responsable'] },
    { href: '/mis-pedidos', label: 'Mis pedidos', roles: ['admin', 'usuario', 'responsable'] },
    { href: '/lineas-compras', label: 'Líns. compras', roles: ['admin', 'usuario', 'comprador', 'responsable'] },
    { href: '/comprador', label: 'Solicitudes por comprar', roles: ['admin', 'comprador'] },
    {
      href: '/responsable',
      label: 'Solicitudes de mi equipo',
      roles: ['admin', 'responsable'],
      badge: pendientesAprobacion,
    },
    { href: '/proyectos-equipo', label: 'Proyectos de equipo', roles: ['admin', 'responsable'] },
    { href: '/admin/pedidos', label: 'Todas las solicitudes', roles: ['admin'] },
    { href: '/admin', label: 'Administración', roles: ['admin'] },
  ].filter((l) => l.roles.includes(rol));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Botón hamburguesa: solo en móvil */}
      <button
        onClick={() => setAbierto(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-grafito text-white flex items-center justify-center shadow-lg"
        aria-label="Abrir menú"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Fondo oscuro al abrir el menú en móvil */}
      {abierto && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setAbierto(false)} />
      )}

      <nav
        className={clsx(
          'fixed md:sticky md:top-0 inset-y-0 left-0 z-50 w-64 shrink-0 bg-grafito text-white flex flex-col h-screen transform transition-transform duration-200 md:translate-x-0',
          abierto ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="px-5 py-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-wide text-white/60">TECMELEC</p>
            <p className="font-semibold">Solicitud de materiales</p>
          </div>
          <button onClick={() => setAbierto(false)} className="md:hidden text-white/60 hover:text-white text-xl">
            ✕
          </button>
        </div>

        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setAbierto(false)}
              className={clsx(
                'flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium',
                pathname.startsWith(l.href) ? 'bg-acero text-white' : 'text-white/80 hover:bg-white/10'
              )}
            >
              <span>{l.label}</span>
              {!!l.badge && (
                <span className="bg-rojo text-white text-xs font-semibold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
                  {l.badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-sm text-white/90 truncate">{nombre}</p>
          <button onClick={handleLogout} className="text-xs text-white/60 hover:text-white mt-1">
            Cerrar sesión
          </button>
        </div>
      </nav>
    </>
  );
}
