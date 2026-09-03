import { createClient } from '@/lib/supabase/server';
import UsuariosClient from './UsuariosClient';

export default async function UsuariosPage() {
  const supabase = createClient();

  const { data: usuarios } = await supabase
    .from('profiles')
    .select('id, nombre_completo, email, telefono, rol, comprador_id, responsable_id')
    .order('nombre_completo');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Usuarios</h1>
      <p className="text-slate text-sm mb-6">
        Crea las cuentas de acceso y define el rol, comprador y responsable de cada persona.
      </p>

      <UsuariosClient usuarios={usuarios || []} />
    </div>
  );
}
