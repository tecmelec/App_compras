import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerJefeObraProyectoBC } from '@/lib/business-central';

// Cambio del proyecto de una solicitud (migración 20261104120000_cambio_proyecto_solicitud.sql).
// Lo usan el botón "Editar" del comprador (solo admin y comprador) y la sincronización
// con BC (cuando todas las líneas del pedido de compra tienen otro proyecto).

export type CambioProyecto = {
  job_no_anterior: string | null;
  job_no_nuevo: string | null;
  origen: 'manual' | 'bc';
  comentario: string | null;
  usuario_nombre: string | null;
  created_at: string;
};

// ¿Quién aprobaría en el proyecto nuevo? Solo se usa si la solicitud sigue pendiente de
// aprobación. Mismo criterio que crearPedido: aprobadores asignados en la app (hay que
// elegir uno) o el jefe de obra de BC si está en la app. null = no cambiar el aprobador.
export async function jefeObraEnApp(proyectoId: string): Promise<string | null> {
  const admin = createAdminClient();
  try {
    const { data: proyecto } = await admin.from('proyectos').select('bc_job_no').eq('id', proyectoId).single();
    if (!proyecto?.bc_job_no) return null;
    const jefe = await obtenerJefeObraProyectoBC(proyecto.bc_job_no);
    if (!jefe.userSecurityId) return null;
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('bc_user_id', jefe.userSecurityId)
      .eq('activo', true)
      .in('rol', ['responsable', 'admin', 'integral'])
      .limit(1);
    return data?.[0]?.id || null;
  } catch (e) {
    console.error('[cambio-proyecto] No se pudo obtener el jefe de obra en BC', e);
    return null;
  }
}

export async function aplicarCambioProyecto(datos: {
  pedidoId: string;
  proyectoNuevoId: string;
  origen: 'manual' | 'bc';
  usuarioId?: string | null;
  usuarioNombre?: string | null;
  comentario?: string | null;
  // Nuevo aprobador (solo si la solicitud sigue pendiente de aprobación).
  aprobadorId?: string | null;
}): Promise<{ error?: string; anterior?: string | null; nuevo?: string | null }> {
  const admin = createAdminClient();
  const { data: pedido } = await admin
    .from('pedidos')
    .select('id, proyecto_id, requiere_aprobacion, aprobado, proyectos(bc_job_no)')
    .eq('id', datos.pedidoId)
    .single();
  if (!pedido) return { error: 'Solicitud no encontrada.' };
  if (pedido.proyecto_id === datos.proyectoNuevoId) return { error: 'La solicitud ya es de ese proyecto.' };
  const { data: nuevo } = await admin.from('proyectos').select('id, bc_job_no').eq('id', datos.proyectoNuevoId).single();
  if (!nuevo) return { error: 'Proyecto no encontrado.' };

  const cambios: Record<string, any> = { proyecto_id: nuevo.id, updated_at: new Date().toISOString() };
  const pendiente = !!pedido.requiere_aprobacion && pedido.aprobado == null;
  if (pendiente && datos.aprobadorId) {
    const { data: sustituto } = await admin.rpc('resolver_sustituto', { id: datos.aprobadorId });
    cambios.responsable_id = sustituto || datos.aprobadorId;
  }
  const { error } = await admin.from('pedidos').update(cambios).eq('id', pedido.id);
  if (error) return { error: `No se pudo cambiar el proyecto: ${error.message}` };

  const anterior = (pedido as any).proyectos?.bc_job_no || null;
  const { error: eHist } = await admin.from('pedido_cambios_proyecto').insert({
    pedido_id: pedido.id,
    proyecto_anterior_id: pedido.proyecto_id,
    proyecto_nuevo_id: nuevo.id,
    job_no_anterior: anterior,
    job_no_nuevo: nuevo.bc_job_no,
    origen: datos.origen,
    comentario: (datos.comentario || '').trim().slice(0, 1000) || null,
    usuario_id: datos.usuarioId || null,
    usuario_nombre: datos.usuarioNombre || (datos.origen === 'bc' ? 'Sincronización con BC' : null),
  });
  if (eHist) console.error('[cambio-proyecto] No se pudo registrar el cambio (¿migración sin aplicar?)', eHist.message);
  return { anterior, nuevo: nuevo.bc_job_no };
}

export async function cambiosProyectoSolicitud(pedidoId: string): Promise<CambioProyecto[]> {
  const { data } = await createAdminClient()
    .from('pedido_cambios_proyecto')
    .select('job_no_anterior, job_no_nuevo, origen, comentario, usuario_nombre, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false });
  return (data || []) as CambioProyecto[];
}
