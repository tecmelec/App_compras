import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { idsEfectivos } from '@/lib/pedidos-utils';
import ProyectosEquipoClient from './ProyectosEquipoClient';

export default async function ProyectosEquipoPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();

  if (perfil?.rol !== 'admin' && perfil?.rol !== 'responsable') redirect('/tienda');

  let usuariosQuery = supabase
    .from('profiles')
    .select('id, nombre_completo, email')
    .eq('rol', 'usuario')
    .order('nombre_completo');

  if (perfil.rol === 'responsable') {
    const ids = await idsEfectivos(supabase, user.id);
    usuariosQuery = usuariosQuery.in('responsable_id', ids);
  }

  const { data: usuarios } = await usuariosQuery;

  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id, bc_job_no, descripcion')
    .eq('estado', 'Open')
    .order('bc_job_no');

  const { data: asignaciones } = await supabase.from('usuario_proyectos').select('usuario_id, proyecto_id');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Proyectos de equipo</h1>
      <p className="text-slate text-sm mb-6">
        Elige un usuario y marca los proyectos que puede seleccionar al solicitar materiales.
      </p>

      <ProyectosEquipoClient
        usuarios={usuarios || []}
        proyectos={proyectos || []}
        asignaciones={asignaciones || []}
      />
    </div>
  );
}
