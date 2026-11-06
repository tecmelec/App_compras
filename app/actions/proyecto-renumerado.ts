'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Admin → Proyectos: unir un proyecto que ya no está en BC (renumerado) al nuevo Nº.
// Usa la función renumerar_proyecto (migración 20261105120000_proyecto_renumerado.sql).
export async function renumerarProyecto(antiguo: string, nuevo: string): Promise<{ mensaje?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };
  const { data: perfil } = await supabase.from('profiles').select('rol, activo, nombre_completo').eq('id', user.id).single();
  if (!perfil?.activo || perfil.rol !== 'admin') return { error: 'Solo el administrador puede hacerlo.' };
  const { data, error } = await createAdminClient().rpc('renumerar_proyecto', {
    p_antiguo: antiguo,
    p_nuevo: nuevo,
    p_usuario: perfil.nombre_completo,
  });
  if (error) {
    if (/renumerar_proyecto/.test(error.message || '') && /function|does not exist|schema cache/i.test(error.message || '')) {
      return { error: 'Falta aplicar la migración 20261105120000_proyecto_renumerado.sql.' };
    }
    return { error: error.message };
  }
  revalidatePath('/admin/proyectos');
  revalidatePath('/proyectos-equipo');
  return { mensaje: String(data || 'Hecho.') };
}
