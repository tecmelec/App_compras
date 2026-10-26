'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerTareasRegistroProyectoBC } from '@/lib/business-central';

// Tareas de proyecto (tipo Registro) del proyecto elegido en la solicitud, para
// "Asignar líneas de planificación manualmente". Todos los perfiles excepto usuario.
export async function tareasRegistroProyecto(proyectoId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || perfil.rol === 'usuario') return { error: 'No autorizado.' };
  const { data: proyecto } = await createAdminClient().from('proyectos').select('bc_job_no').eq('id', proyectoId).maybeSingle();
  if (!proyecto?.bc_job_no) return { error: 'Proyecto no encontrado.' };
  try {
    return { tareas: await obtenerTareasRegistroProyectoBC(proyecto.bc_job_no) };
  } catch (e: any) {
    return { error: 'No se pudieron leer las tareas del proyecto en BC: ' + (e?.message || e) };
  }
}
