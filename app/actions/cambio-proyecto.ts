'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { aprobadoresElegibles, type AprobadorOpcion } from '@/app/actions/aprobadores-proyecto';
import { aplicarCambioProyecto, jefeObraEnApp } from '@/lib/cambio-proyecto';
import { comprobarExcesosTienda } from '@/lib/tienda-proyecto';
import { formatoCantidad } from '@/lib/cantidad';

// "Editar" del proyecto de una solicitud: solo admin y comprador.
const ROLES_CAMBIO_PROYECTO = ['admin', 'comprador'];

async function usuarioActual() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo, nombre_completo').eq('id', user.id).single();
  if (!perfil?.activo || !ROLES_CAMBIO_PROYECTO.includes(perfil.rol)) return null;
  return { id: user.id, rol: perfil.rol as string, nombre: (perfil.nombre_completo as string) || '' };
}

export type ProyectoOpcion = { id: string; bc_job_no: string; descripcion: string | null };

export async function opcionesCambioProyecto(pedidoId: string): Promise<{
  proyectos?: ProyectoOpcion[];
  pendienteAprobacion?: boolean;
  lineasConTarea?: number;
  pedidosBC?: string[];
  error?: string;
}> {
  const yo = await usuarioActual();
  if (!yo) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const [{ data: pedido }, { data: proyectos }, { data: items }] = await Promise.all([
    admin.from('pedidos').select('requiere_aprobacion, aprobado').eq('id', pedidoId).single(),
    admin.from('proyectos').select('*').eq('estado', 'Open').order('bc_job_no'),
    admin.from('pedido_items').select('*').eq('pedido_id', pedidoId),
  ]);
  if (!pedido) return { error: 'Solicitud no encontrada.' };
  return {
    proyectos: (proyectos || [])
      .filter((p: any) => !p.tipo || p.tipo === 'Obra')
      .map((p: any) => ({ id: p.id, bc_job_no: p.bc_job_no, descripcion: p.descripcion })),
    pendienteAprobacion: !!pedido.requiere_aprobacion && pedido.aprobado == null,
    lineasConTarea: (items || []).filter((i: any) => i.job_task_no && !i.rechazada_por_aprobador).length,
    pedidosBC: Array.from(new Set((items || []).map((i: any) => i.numero_tecmelec).filter(Boolean))) as string[],
  };
}

// Solo si la solicitud sigue pendiente de aprobación: quién la aprobaría en el proyecto nuevo.
export async function aprobadoresCambioProyecto(
  proyectoId: string
): Promise<{ elegibles: AprobadorOpcion[]; jefe: { id: string; nombre: string } | null; error?: string }> {
  const yo = await usuarioActual();
  if (!yo) return { elegibles: [], jefe: null, error: 'No autorizado.' };
  const elegibles = await aprobadoresElegibles(proyectoId);
  if (elegibles.length > 0) return { elegibles, jefe: null };
  const jefeId = await jefeObraEnApp(proyectoId);
  if (!jefeId) return { elegibles: [], jefe: null };
  const { data: p } = await createAdminClient().from('profiles').select('nombre_completo').eq('id', jefeId).single();
  return { elegibles: [], jefe: { id: jefeId, nombre: p?.nombre_completo || 'Jefe de obra' } };
}

export async function cambiarProyectoSolicitud(
  pedidoId: string,
  proyectoId: string,
  comentario: string,
  aprobadorId?: string | null
): Promise<{ success?: boolean; aviso?: string; error?: string }> {
  const yo = await usuarioActual();
  if (!yo) return { error: 'Solo admin y comprador pueden cambiar el proyecto.' };
  if (!proyectoId) return { error: 'Elige el proyecto.' };
  const admin = createAdminClient();
  const [{ data: pedido }, { data: proyecto }] = await Promise.all([
    admin.from('pedidos').select('id, numero_app, requiere_aprobacion, aprobado').eq('id', pedidoId).single(),
    admin.from('proyectos').select('*').eq('id', proyectoId).single(),
  ]);
  if (!pedido) return { error: 'Solicitud no encontrada.' };
  if (!proyecto) return { error: 'Proyecto no encontrado.' };
  if ((proyecto as any).tipo && (proyecto as any).tipo !== 'Obra') {
    return { error: `El proyecto ${proyecto.bc_job_no} es de tipo "${(proyecto as any).tipo}": solo se admiten proyectos de tipo Obra.` };
  }

  // Pendiente de aprobación: el aprobador pasa a ser el del proyecto nuevo.
  let aprobadorFinal: string | null = null;
  if (pedido.requiere_aprobacion && pedido.aprobado == null) {
    const elegibles = await aprobadoresElegibles(proyectoId);
    if (elegibles.length > 0) {
      if (!aprobadorId || !elegibles.some((a) => a.id === aprobadorId)) {
        return { error: 'Elige quién aprueba la solicitud en el proyecto nuevo.' };
      }
      aprobadorFinal = aprobadorId;
    } else {
      aprobadorFinal = await jefeObraEnApp(proyectoId); // si no hay, se mantiene el actual
    }
  }

  const r = await aplicarCambioProyecto({
    pedidoId,
    proyectoNuevoId: proyectoId,
    origen: 'manual',
    usuarioId: yo.id,
    usuarioNombre: yo.nombre,
    comentario,
    aprobadorId: aprobadorFinal,
  });
  if (r.error) return { error: r.error };

  // Tienda por proyecto: avisar (sin bloquear) si en el proyecto nuevo se supera lo autorizado.
  let aviso: string | undefined;
  try {
    const { data: items } = await admin
      .from('pedido_items')
      .select('*')
      .eq('pedido_id', pedidoId)
      .eq('rechazada_por_aprobador', false);
    const activos = (items || []).filter((i: any) => i.estado_recepcion !== 'Anulado');
    const excesos = await comprobarExcesosTienda(proyectoId, activos as any, pedidoId);
    if (excesos.length > 0) {
      aviso = `En la tienda del proyecto ${proyecto.bc_job_no} se supera lo autorizado: ${excesos
        .map((x) => `"${x.nombre}" (+${formatoCantidad(x.exceso)} ${x.unidad})`)
        .join(', ')}. Revísalo en Tienda por proyecto.`;
    }
  } catch {
    // sin tienda por proyecto: nada que avisar
  }

  for (const ruta of ['/comprador', '/mis-pedidos', '/lineas-compras', '/responsable', '/admin/pedidos']) {
    revalidatePath(`${ruta}/${pedidoId}`);
  }
  return { success: true, aviso };
}
