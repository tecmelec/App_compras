'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';
import { revalidatePath } from 'next/cache';

// Administración → Usuarios: visibilidad ampliada en "Líns. compras"
// (ver migración 20261019130000_visibilidad_lineas_compras.sql).

export type ProyectoVisibilidad = { id: string; bc_job_no: string; descripcion: string | null };

export async function obtenerVisibilidadLineas(usuarioId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: perfil }, { data: filas }] = await Promise.all([
    admin.from('profiles').select('lineas_compras_todos').eq('id', usuarioId).maybeSingle(),
    admin
      .from('usuario_proyectos_consulta')
      .select('proyectos(id, bc_job_no, descripcion)')
      .eq('usuario_id', usuarioId),
  ]);
  const proyectos = ((filas || []).map((f: any) => f.proyectos).filter(Boolean) as ProyectoVisibilidad[]).sort((a, b) =>
    a.bc_job_no.localeCompare(b.bc_job_no)
  );
  return { todos: !!perfil?.lineas_compras_todos, proyectos };
}

export async function cambiarVerTodosLineas(usuarioId: string, todos: boolean) {
  await requireAdmin();
  const { error } = await createAdminClient().from('profiles').update({ lineas_compras_todos: todos }).eq('id', usuarioId);
  if (error) return { error: 'No se pudo guardar: ' + error.message };
  revalidatePath('/lineas-compras');
  return { success: true };
}

export async function buscarProyectosVisibilidad(texto: string) {
  await requireAdmin();
  const t = texto.trim().replace(/[%,()]/g, ' ');
  let q = createAdminClient().from('proyectos').select('id, bc_job_no, descripcion').order('bc_job_no').limit(30);
  if (t) q = q.or(`bc_job_no.ilike.%${t}%,descripcion.ilike.%${t}%`);
  const { data } = await q;
  return (data || []) as ProyectoVisibilidad[];
}

export async function anadirProyectoConsulta(usuarioId: string, proyectoId: string) {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from('usuario_proyectos_consulta')
    .upsert({ usuario_id: usuarioId, proyecto_id: proyectoId }, { onConflict: 'usuario_id,proyecto_id', ignoreDuplicates: true });
  if (error) return { error: 'No se pudo añadir el proyecto: ' + error.message };
  revalidatePath('/lineas-compras');
  return { success: true };
}

export async function quitarProyectoConsulta(usuarioId: string, proyectoId: string) {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from('usuario_proyectos_consulta')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('proyecto_id', proyectoId);
  if (error) return { error: 'No se pudo quitar el proyecto: ' + error.message };
  revalidatePath('/lineas-compras');
  return { success: true };
}
