import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLES_TIENDA_PROYECTO } from '@/lib/tienda-proyecto';
import TiendaProyectoCliente from './TiendaProyectoCliente';

export const dynamic = 'force-dynamic';

export default async function TiendaProyectoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  if (!perfil || !ROLES_TIENDA_PROYECTO.includes(perfil.rol)) redirect('/tienda');
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate">Cargando…</p>}>
      <TiendaProyectoCliente />
    </Suspense>
  );
}
