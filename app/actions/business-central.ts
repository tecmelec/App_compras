'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { obtenerItemsComunesBC, obtenerProyectosBC, obtenerProveedoresBC } from '@/lib/business-central';
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

export async function sincronizarProyectosBC() {
  await requireAdmin();
  const supabase = createClient();

  let proyectos;
  try {
    proyectos = await obtenerProyectosBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('proyectos').select('id, bc_job_no');
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_job_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const proyecto of proyectos) {
    const idExistente = existentesPorNo.get(proyecto.No);

    if (idExistente) {
      const { error } = await supabase
        .from('proyectos')
        .update({
          descripcion: proyecto.Description,
          estado: proyecto.Status,
          direccion: proyecto.Sell_to_Address,
          codigo_postal: proyecto.Sell_to_Post_Code,
          ciudad: proyecto.Sell_to_City,
          provincia: proyecto.Sell_to_County,
        })
        .eq('id', idExistente);

      if (error) errores.push(`${proyecto.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('proyectos').insert({
        bc_job_no: proyecto.No,
        descripcion: proyecto.Description,
        estado: proyecto.Status,
        direccion: proyecto.Sell_to_Address,
        codigo_postal: proyecto.Sell_to_Post_Code,
        ciudad: proyecto.Sell_to_City,
        provincia: proyecto.Sell_to_County,
      });

      if (error) errores.push(`${proyecto.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/proyectos');
  revalidatePath('/proyectos-equipo');

  return { success: true, creados, actualizados, totalBC: proyectos.length, errores };
}

export async function sincronizarProveedoresBC() {
  await requireAdmin();
  const supabase = createClient();

  let proveedores;
  try {
    proveedores = await obtenerProveedoresBC();
  } catch (e: any) {
    return { error: e.message || 'No se pudo conectar con Business Central.' };
  }

  const { data: existentes } = await supabase.from('proveedores').select('id, bc_proveedor_no');
  const existentesPorNo = new Map((existentes || []).map((p) => [p.bc_proveedor_no, p.id]));

  let creados = 0;
  let actualizados = 0;
  const errores: string[] = [];

  for (const proveedor of proveedores) {
    const idExistente = existentesPorNo.get(proveedor.No);

    if (idExistente) {
      const { error } = await supabase
        .from('proveedores')
        .update({ nombre: proveedor.Name })
        .eq('id', idExistente);

      if (error) errores.push(`${proveedor.No}: ${error.message}`);
      else actualizados++;
    } else {
      const { error } = await supabase.from('proveedores').insert({
        bc_proveedor_no: proveedor.No,
        nombre: proveedor.Name,
      });

      if (error) errores.push(`${proveedor.No}: ${error.message}`);
      else creados++;
    }
  }

  revalidatePath('/admin/proveedores');

  return { success: true, creados, actualizados, totalBC: proveedores.length, errores };
}
