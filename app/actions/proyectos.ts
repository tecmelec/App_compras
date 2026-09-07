'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function asignarProyecto(usuarioId: string, proyectoId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('usuario_proyectos')
    .insert({ usuario_id: usuarioId, proyecto_id: proyectoId });

  if (error) return { error: 'No se pudo asignar el proyecto.' };

  revalidatePath('/proyectos-equipo');
  return { success: true };
}

export async function desasignarProyecto(usuarioId: string, proyectoId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('usuario_proyectos')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('proyecto_id', proyectoId);

  if (error) return { error: 'No se pudo quitar el proyecto.' };

  revalidatePath('/proyectos-equipo');
  return { success: true };
}
