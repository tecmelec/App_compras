'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerJefeObraProyectoBC } from '@/lib/business-central';

// Aprobadores por proyecto (tabla proyecto_aprobadores): el admin asigna varios
// responsables a un proyecto y, al pedir material para él, el solicitante elige quién
// aprueba la solicitud.

async function usuarioActual() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  return perfil?.activo ? { id: user.id, rol: perfil.rol as string } : null;
}

export type AprobadorOpcion = { id: string; nombre: string; jefeObraBC: boolean; integral?: boolean };

// Aprobadores elegibles para una solicitud de este proyecto: los asignados en la app y,
// si está dado de alta (responsable/admin activo), el jefe de obra de BC. Lista vacía si
// el proyecto no tiene aprobadores asignados (flujo normal, sin elegir).
export async function aprobadoresParaSolicitud(proyectoId: string): Promise<AprobadorOpcion[]> {
  const yo = await usuarioActual();
  if (!yo || !proyectoId) return [];
  return aprobadoresElegibles(proyectoId);
}

export async function aprobadoresElegibles(proyectoId: string): Promise<AprobadorOpcion[]> {
  const admin = createAdminClient();
  const { data: asignados } = await admin
    .from('proyecto_aprobadores')
    .select('usuario_id, profiles(id, nombre_completo, rol, activo)')
    .eq('proyecto_id', proyectoId);
  const opciones: AprobadorOpcion[] = (asignados || [])
    .map((a: any) => a.profiles)
    .filter((p: any) => p && p.activo && ['responsable', 'admin', 'integral'].includes(p.rol))
    .map((p: any) => ({ id: p.id, nombre: p.nombre_completo, jefeObraBC: false, integral: p.rol === 'integral' }));
  if (opciones.length === 0) return [];

  // El jefe de obra de BC también se ofrece (si está en la app y no está ya en la lista).
  try {
    const { data: proyecto } = await admin.from('proyectos').select('bc_job_no').eq('id', proyectoId).single();
    if (proyecto?.bc_job_no) {
      const jefe = await obtenerJefeObraProyectoBC(proyecto.bc_job_no);
      if (jefe.userSecurityId) {
        const { data: perfiles } = await admin
          .from('profiles')
          .select('id, nombre_completo, rol')
          .eq('bc_user_id', jefe.userSecurityId)
          .eq('activo', true)
          .in('rol', ['responsable', 'admin', 'integral'])
          .limit(1);
        const p = perfiles?.[0];
        if (p) {
          const ya = opciones.find((o) => o.id === p.id);
          if (ya) ya.jefeObraBC = true;
          else opciones.unshift({ id: p.id, nombre: p.nombre_completo, jefeObraBC: true, integral: (p as any).rol === 'integral' });
        }
      }
    }
  } catch (e) {
    console.error('[aprobadores] No se pudo leer el jefe de obra en BC', e);
  }
  return opciones.sort((a, b) => Number(b.jefeObraBC) - Number(a.jefeObraBC) || a.nombre.localeCompare(b.nombre));
}

// --- Administración --------------------------------------------------------------------

export async function agregarAprobadorProyecto(proyectoId: string, usuarioId: string) {
  const yo = await usuarioActual();
  if (yo?.rol !== 'admin') return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { data: perfil } = await admin.from('profiles').select('rol, activo').eq('id', usuarioId).single();
  if (!perfil?.activo || !['responsable', 'admin', 'integral'].includes(perfil.rol)) {
    return { error: 'Solo se pueden asignar usuarios con rol responsable o admin.' };
  }
  const { error } = await admin.from('proyecto_aprobadores').insert({ proyecto_id: proyectoId, usuario_id: usuarioId });
  if (error && !/duplicate|unique/i.test(error.message)) return { error: 'No se pudo asignar: ' + error.message };
  revalidatePath('/admin/proyectos');
  return { success: true };
}

export async function quitarAprobadorProyecto(id: string) {
  const yo = await usuarioActual();
  if (yo?.rol !== 'admin') return { error: 'No autorizado.' };
  const { error } = await createAdminClient().from('proyecto_aprobadores').delete().eq('id', id);
  if (error) return { error: 'No se pudo quitar: ' + error.message };
  revalidatePath('/admin/proyectos');
  return { success: true };
}
