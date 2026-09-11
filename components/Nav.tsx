'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

type Props = {
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  pendientesAprobacion?: number;
  comprador?: { nombre_completo: string; email: string; telefono: string | null } | null;
};

export default function Nav({ rol, pendientesAprobacion = 0, comprador = null }: Props) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [contactoAbierto, setContactoAbierto] = useState(false);
  const contactoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contactoRef.current && !contactoRef.current.contains(e.target as Node)) {
        setContactoAbierto(false);
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

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

  return (
    <>
      {/* Botón hamburguesa: solo en móvil */}
      <button
        onClick={() => setAbierto(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-marcaOscuro text-white flex items-center justify-center shadow-lg"
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
          'fixed md:sticky md:top-0 inset-y-0 left-0 z-50 w-64 shrink-0 bg-gradient-to-b from-marcaOscuro to-marcaOscuro2 text-white flex flex-col h-screen transform transition-transform duration-200 md:translate-x-0',
          abierto ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="px-5 py-6 border-b border-white/10 flex items-center justify-between">
          <p className="logo-tecmelec text-xl">TECMELEC</p>
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
                pathname.startsWith(l.href) ? 'bg-marca text-white' : 'text-white/80 hover:bg-white/10'
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

        <div className="p-4">
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-9 h-9 rounded-full bg-marca/20 text-marca flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-white">¿Necesitas ayuda?</p>
                <p className="text-xs text-white/60">
                  {comprador
                    ? `Contacta con ${comprador.nombre_completo}, tu comprador asignado.`
                    : 'Contacta con nuestro equipo de compras.'}
                </p>
              </div>
            </div>

            {comprador ? (
              <div className="relative" ref={contactoRef}>
                <button
                  type="button"
                  onClick={() => setContactoAbierto((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-marca text-white rounded-full py-2 hover:bg-[#12703D] transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 6 12 13 2 6" />
                  </svg>
                  Contactar
                </button>

                {contactoAbierto && (
                  <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-borde bg-white shadow-lg overflow-hidden text-sm z-30">
                    <a
                      href={`mailto:${comprador.email}`}
                      className="flex items-center gap-2 px-4 py-3 text-grafito hover:bg-marcaClaro"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M22 6 12 13 2 6" />
                      </svg>
                      Email
                    </a>
                    {comprador.telefono && (
                      <a
                        href={`tel:${comprador.telefono}`}
                        className="flex items-center gap-2 px-4 py-3 text-grafito hover:bg-marcaClaro border-t border-borde"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        Llamar · {comprador.telefono}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <a
                href="mailto:compras@tecmelec.es"
                className="block text-center text-sm font-medium bg-marca text-white rounded-full py-2 hover:bg-[#12703D] transition-colors"
              >
                Contactar
              </a>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
