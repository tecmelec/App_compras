'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Guarda lo que el usuario decidió al revisar la lista (producto y cantidad que
// añade al carrito por cada línea), para el informe de la solicitud.
export async function confirmarListaFoto(
  listaId: string,
  decisiones: { n: number; producto_id: string | null; cantidad: number | null }[]
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const admin = createAdminClient();
  const { data: lista } = await admin
    .from('listas_foto')
    .select('id, lineas, pedido_id')
    .eq('id', listaId)
    .eq('usuario_id', user.id)
    .single();
  if (!lista) return { error: 'No se encontró la lista.' };
  if (lista.pedido_id) return { error: 'Esta lista ya se envió en una solicitud.' };

  const porLinea = new Map(decisiones.map((d) => [d.n, d]));
  const lineas = (lista.lineas as any[]).map((l) => {
    const d = porLinea.get(l.n);
    return {
      ...l,
      producto_id: d?.producto_id || null,
      cantidad_carrito: d?.producto_id ? d.cantidad : null,
    };
  });

  const { error } = await admin.from('listas_foto').update({ lineas }).eq('id', listaId);
  if (error) return { error: 'No se pudo guardar la revisión de la lista.' };
  return { success: true };
}
