'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { obtenerItemsComunesBC } from '@/lib/business-central';
import { revalidatePath } from 'next/cache';

export async function sincronizarProductosBC() {
  await requireAdmin();
  const supabase = createClient();

  let items;
  try {
    items = await obtenerItemsComunesBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('productos').select('id, bc_item_no').not('bc_item_no', 'is', null);
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_item_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const item of items) {
    const idExistente = existentesPorNo.get(item.No);

    if (idExistente) {
      const { error } = await supabase
        .from('productos')
        .update({
          nombre: item.Description,
          unidad_medida: item.Base_Unit_of_Measure,
          precio: item.Unit_Price,
        })
        .eq('id', idExistente);

      if (error) errores.push(`${item.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('productos').insert({
        bc_item_no: item.No,
        nombre: item.Description,
        unidad_medida: item.Base_Unit_of_Measure,
        precio: item.Unit_Price,
        visible: false, // el admin decide cuáles mostrar y sube la imagen antes de publicarlos
      });

      if (error) errores.push(`${item.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/productos');
  revalidatePath('/tienda');

  return { success: true, creados, actualizados, totalBC: items.length, errores };
}
