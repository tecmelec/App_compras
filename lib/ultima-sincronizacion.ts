import type { SupabaseClient } from '@supabase/supabase-js';

// Texto "Última sincronización: dd/mm/aaaa, hh:mm (quién)" de la última sincronización
// masiva con BC (cron o botón "Sincronizar todas"), en hora de Madrid. null si no hay.
export async function textoUltimaSincronizacionBC(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('configuracion')
    .select('ultima_sincronizacion_bc, ultima_sincronizacion_bc_por')
    .eq('id', 1)
    .maybeSingle();
  if (!data?.ultima_sincronizacion_bc) return null;
  const fecha = new Date(data.ultima_sincronizacion_bc).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Última sincronización con BC: ${fecha}${data.ultima_sincronizacion_bc_por ? ` (${data.ultima_sincronizacion_bc_por})` : ''}`;
}

// Igual, para la sincronización de proyectos (Admin → Proyectos).
export async function textoUltimaSincronizacionProyectos(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('configuracion')
    .select('ultima_sincronizacion_proyectos, ultima_sincronizacion_proyectos_por')
    .eq('id', 1)
    .maybeSingle();
  if (!data?.ultima_sincronizacion_proyectos) return null;
  const fecha = new Date(data.ultima_sincronizacion_proyectos).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Última sincronización con BC: ${fecha}${data.ultima_sincronizacion_proyectos_por ? ` (${data.ultima_sincronizacion_proyectos_por})` : ''}`;
}
