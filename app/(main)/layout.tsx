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

  return (
    <CartProvider>
      <div className="flex">
        <Nav nombre={profile.nombre_completo} rol={profile.rol} />
        <main className="flex-1 min-h-screen">{children}</main>
      </div>
    </CartProvider>
  );
}
