import { createAdminClient } from '@/lib/supabase/admin';
import { idsEfectivos } from '@/lib/pedidos-utils';

// Qué solicitudes puede ver en "Líns. compras" un perfil usuario o responsable
// (admin y comprador lo ven todo). Ver migración 20261019130000.
//   - todos: ve las líneas de todos los proyectos.
//   - proyectos: proyectos cuyas solicitudes ve (usuario: los habilitados para solicitar
//     + los de consulta; responsable: los de consulta).
//   - responsableIds: (responsable) solicitudes que aprueba él o a quien sustituye.
export type VisibilidadLineas = {
  todos: boolean;
  proyectos: string[];
  responsableIds: string[];
};

export async function visibilidadLineas(userId: string, rol: string | null | undefined): Promise<VisibilidadLineas> {
  const admin = createAdminClient();
  if (rol !== 'usuario' && rol !== 'responsable') return { todos: true, proyectos: [], responsableIds: [] };

  const [{ data: perfil }, { data: consulta }, { data: habilitados }, responsableIds] = await Promise.all([
    admin.from('profiles').select('lineas_compras_todos').eq('id', userId).maybeSingle(),
    admin.from('usuario_proyectos_consulta').select('proyecto_id').eq('usuario_id', userId),
    rol === 'usuario'
      ? admin.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', userId)
      : Promise.resolve({ data: [] as { proyecto_id: string }[] }),
    rol === 'responsable' ? idsEfectivos(admin, userId) : Promise.resolve([] as string[]),
  ]);

  const proyectos = Array.from(
    new Set([...(habilitados || []), ...(consulta || [])].map((p: any) => p.proyecto_id as string))
  );
  return { todos: !!perfil?.lineas_compras_todos, proyectos, responsableIds };
}

// ¿Puede ver esta solicitud? (para el detalle de consulta)
export function puedeVerSolicitud(
  v: VisibilidadLineas,
  userId: string,
  pedido: { usuario_id: string; proyecto_id: string | null; responsable_id: string | null }
): boolean {
  if (v.todos || pedido.usuario_id === userId) return true;
  if (pedido.proyecto_id && v.proyectos.includes(pedido.proyecto_id)) return true;
  return !!pedido.responsable_id && v.responsableIds.includes(pedido.responsable_id);
}
