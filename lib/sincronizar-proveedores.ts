import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerProveedoresBC } from '@/lib/business-central';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';

// Sincronización de proveedores con BC (botón de Admin → Proveedores y sincronización
// automática de las 9:15 y 14:15). Solo se escriben los cambios: altas nuevas en bloque
// y nombres que hayan cambiado, para que quepa en el límite de 60 s de Vercel aunque
// haya miles de proveedores.
export async function sincronizarProveedoresNucleo() {
  const supabase = createAdminClient();
  let proveedores;
  try {
    proveedores = await obtenerProveedoresBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes, error: errorLeer } = await obtenerTodosLosProveedores(supabase, 'id, bc_proveedor_no, nombre', 'bc_proveedor_no');
  if (errorLeer) return { error: 'No se pudieron leer los proveedores de la app: ' + errorLeer.message };
  const existentesPorNo = new Map((existentes || []).map((p: any) => [p.bc_proveedor_no, p]));

  const nuevos: { bc_proveedor_no: string; nombre: string }[] = [];
  const cambiados: { id: string; nombre: string; no: string }[] = [];
  for (const prov of proveedores) {
    if (!prov.No) continue;
    const ex: any = existentesPorNo.get(prov.No);
    if (!ex) nuevos.push({ bc_proveedor_no: prov.No, nombre: prov.Name });
    else if ((ex.nombre || '') !== (prov.Name || '')) cambiados.push({ id: ex.id, nombre: prov.Name, no: prov.No });
  }

  const errores: string[] = [];
  let creados = 0;
  for (let k = 0; k < nuevos.length; k += 500) {
    const lote = nuevos.slice(k, k + 500);
    const { error } = await supabase.from('proveedores').insert(lote);
    if (error) errores.push(`Alta de ${lote.length} proveedores (${lote[0].bc_proveedor_no}…): ${error.message}`);
    else creados += lote.length;
  }
  let actualizados = 0;
  for (let k = 0; k < cambiados.length; k += 20) {
    const r = await Promise.all(
      cambiados.slice(k, k + 20).map((c) => supabase.from('proveedores').update({ nombre: c.nombre }).eq('id', c.id))
    );
    r.forEach((x, i) => {
      if (x.error) errores.push(`${cambiados[k + i].no}: ${x.error.message}`);
      else actualizados++;
    });
  }

  revalidatePath('/admin/proveedores');
  return { success: true, creados, actualizados, totalBC: proveedores.length, errores };
}
