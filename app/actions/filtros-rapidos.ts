'use server';

import { createClient } from '@/lib/supabase/server';

// Guarda la selección de los filtros rápidos "Por usuario" (ids de
// solicitantes) y "Por obra" (Nº de obra de BC) de la persona conectada.
export async function guardarFiltroRapido(tipo: 'solicitantes' | 'obras', valores: string[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  const limpios = Array.from(new Set((valores || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, 500);
  if (tipo === 'solicitantes' && limpios.some((v) => !/^[0-9a-f-]{36}$/i.test(v))) {
    return { error: 'Selección de usuarios no válida.' };
  }

  const { error } = await supabase
    .from('filtros_rapidos_solicitudes')
    .upsert({ usuario_id: user.id, [tipo]: limpios, updated_at: new Date().toISOString() }, { onConflict: 'usuario_id' });

  if (error) return { error: 'No se pudo guardar el filtro: ' + error.message };
  return { success: true, valores: limpios };
}

// Búsqueda de obras (proyectos de BC) por número o nombre, para poder seguir
// obras que todavía no tienen solicitudes.
export async function buscarObras(texto: string) {
  const supabase = createClient();
  const t = String(texto || '').trim().replace(/[%,()]/g, ' ');
  if (t.length < 2) return [] as { numero: string; nombre: string }[];

  const { data } = await supabase
    .from('proyectos')
    .select('bc_job_no, descripcion')
    .or(`bc_job_no.ilike.%${t}%,descripcion.ilike.%${t}%`)
    .order('bc_job_no', { ascending: false })
    .limit(25);

  return (data || [])
    .filter((p: any) => p.bc_job_no)
    .map((p: any) => ({ numero: p.bc_job_no as string, nombre: (p.descripcion as string) || '' }));
}
