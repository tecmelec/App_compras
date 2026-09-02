import { createClient } from '@/lib/supabase/server';
import EstadosClient from './EstadosClient';

export default async function EstadosAdminPage() {
  const supabase = createClient();

  const { data: estados } = await supabase.from('estados_pedido').select('id, nombre, orden').order('orden');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Estados de pedido</h1>
      <p className="text-slate text-sm mb-6">
        Define los estados por los que puede pasar una solicitud, en el orden que corresponda.
      </p>

      <EstadosClient estados={estados || []} />
    </div>
  );
}
