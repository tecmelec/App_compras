import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CartProvider } from '@/context/CartContext';
import Nav from '@/components/Nav';
import HeaderBar from '@/components/HeaderBar';
import { idsEfectivos } from '@/lib/pedidos-utils';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre_completo, rol')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  let pendientesAprobacion = 0;
  if (profile.rol === 'responsable' || profile.rol === 'admin') {
    const ids = await idsEfectivos(supabase, user.id);
    const { count } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .in('responsable_id', ids)
      .eq('requiere_aprobacion', true)
      .is('aprobado', null);
    pendientesAprobacion = count || 0;
  }

  const tieneCarrito = profile.rol === 'admin' || profile.rol === 'usuario' || profile.rol === 'responsable';

  return (
    <CartProvider userId={user.id}>
      <div className="flex">
        <Nav rol={profile.rol} pendientesAprobacion={pendientesAprobacion} />
        <main className="flex-1 min-h-screen">
          <Suspense fallback={<div className="h-[57px] border-b border-borde bg-white" />}>
            <HeaderBar nombre={profile.nombre_completo} rol={profile.rol} mostrarCarrito={tieneCarrito} />
          </Suspense>
          {children}
        </main>
      </div>
    </CartProvider>
  );
}
