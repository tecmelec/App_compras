import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CartProvider } from '@/context/CartContext';
import Nav from '@/components/Nav';

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
    const { count } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('responsable_id', user.id)
      .eq('requiere_aprobacion', true)
      .is('aprobado', null);
    pendientesAprobacion = count || 0;
  }

  return (
    <CartProvider userId={user.id}>
      <div className="flex">
        <Nav nombre={profile.nombre_completo} rol={profile.rol} pendientesAprobacion={pendientesAprobacion} />
        <main className="flex-1 min-h-screen">{children}</main>
      </div>
    </CartProvider>
  );
}
