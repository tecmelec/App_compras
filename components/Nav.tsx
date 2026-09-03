'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCart } from '@/context/CartContext';
import clsx from 'clsx';

type Props = {
  nombre: string;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  pendientesAprobacion?: number;
};

export default function Nav({ nombre, rol, pendientesAprobacion = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems } = useCart();

  const links = [
    { href: '/tienda', label: 'Tienda Tecmelec', roles: ['admin', 'usuario', 'responsable'] },
    { href: '/carrito', label: `Carrito${totalItems ? ` (${totalItems})` : ''}`, roles: ['admin', 'usuario', 'responsable'] },
    { href: '/mis-pedidos', label: 'Mis pedidos', roles: ['admin', 'usuario', 'responsable'] },
    { href: '/comprador', label: 'Solicitudes por comprar', roles: ['admin', 'comprador'] },
    {
      href: '/responsable',
      label: 'Solicitudes de mi equipo',
      roles: ['admin', 'responsable'],
      badge: pendientesAprobacion,
    },
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
    <nav className="w-64 shrink-0 bg-grafito text-white min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-white/10">
        <p className="text-xs tracking-wide text-white/60">TECMELEC</p>
        <p className="font-semibold">Solicitud de materiales</p>
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
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
  );
}
