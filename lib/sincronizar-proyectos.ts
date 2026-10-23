import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerProyectosBC, tipoProyectoBC } from '@/lib/business-central';

// Sincronización de proyectos sin comprobación de usuario: la usan el botón de
// Admin → Proyectos (arriba) y la sincronización automática (/api/cron/sincronizar-proyectos-bc,
// a las 9:15 y 14:15 desde Supabase). "por" es quién la lanzó ("automática" en el cron).
export async function sincronizarProyectosNucleo(por: string | null) {
  const supabase = createAdminClient();

  let proyectos;
  try {
    proyectos = await obtenerProyectosBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  // Todos los proyectos de la app (paginado: Supabase devuelve como máximo 1.000 filas)
  const existentes: { id: string; bc_job_no: string }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('proyectos').select('id, bc_job_no').order('id').range(desde, desde + 999);
    if (error) return { error: 'No se pudieron leer los proyectos de la app: ' + error.message };
    existentes.push(...((data || []) as any[]));
    if (!data || data.length < 1000) break;
  }
  const existentesPorNo = new Map(existentes.map((p) => [p.bc_job_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];
  // Si la columna "tipo" aún no existe (migración 20261023180000), se sigue sin ella.
  let conTipo = true;
  const sinTipo = (d: Record<string, any>) => {
    const { tipo: _t, ...resto } = d;
    return resto;
  };

  for (const proyecto of proyectos) {
    const idExistente = existentesPorNo.get(proyecto.No);
    const datos = {
      descripcion: proyecto.Description,
      estado: proyecto.Status,
      direccion: proyecto.Sell_to_Address,
      codigo_postal: proyecto.Sell_to_Post_Code,
      ciudad: proyecto.Sell_to_City,
      provincia: proyecto.Sell_to_County,
    } as Record<string, any>;
    const { tipo } = tipoProyectoBC(proyecto as any);
    if (tipo && conTipo) datos.tipo = tipo;
    const guardar = async (d: Record<string, any>) =>
      idExistente
        ? (await supabase.from('proyectos').update(d).eq('id', idExistente)).error
        : (await supabase.from('proyectos').insert({ bc_job_no: proyecto.No, ...d })).error;
    let error = await guardar(datos);
    if (error && 'tipo' in datos && /tipo/.test(error.message || '')) {
      conTipo = false;
      error = await guardar(sinTipo(datos));
    }
    if (error) errores.push(`${proyecto.No}: ${error.message}`);
    else if (idExistente) actualizados++;
    else creados++;
  }

  revalidatePath('/admin/proyectos');
  revalidatePath('/proyectos-equipo');

  // Fecha y hora de esta sincronización (se muestra junto al botón en Admin → Proyectos)
  const { error: errorFecha } = await supabase
    .from('configuracion')
    .update({ ultima_sincronizacion_proyectos: new Date().toISOString(), ultima_sincronizacion_proyectos_por: por })
    .eq('id', 1);
  if (errorFecha) console.error('[proyectos] No se pudo guardar la fecha de la última sincronización:', errorFecha.message);

  return { success: true, creados, actualizados, totalBC: proyectos.length, errores };
}

