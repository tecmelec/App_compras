'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-guard';
import { revalidatePath } from 'next/cache';

export async function crearProducto(datos: {
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  categoria: string;
}) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('productos').insert(datos);
  if (error) return { error: 'No se pudo crear el producto.' };

  revalidatePath('/admin/productos');
  revalidatePath('/tienda');
  return { success: true };
}

export async function actualizarProducto(
  id: string,
  datos: { nombre: string; descripcion: string; imagen_url: string | null; categoria: string; visible: boolean }
) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('productos').update(datos).eq('id', id);
  if (error) return { error: 'No se pudo actualizar el producto.' };

  revalidatePath('/admin/productos');
  revalidatePath('/tienda');
  return { success: true };
}

export async function eliminarProducto(id: string) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) return { error: 'No se pudo eliminar el producto.' };

  revalidatePath('/admin/productos');
  revalidatePath('/tienda');
  return { success: true };
}

export async function crearEstado(nombre: string, orden: number) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('estados_pedido').insert({ nombre, orden });
  if (error) return { error: 'No se pudo crear el estado.' };

  revalidatePath('/admin/estados');
  return { success: true };
}

export async function eliminarEstado(id: number) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('estados_pedido').delete().eq('id', id);
  if (error) return { error: 'No se pudo eliminar el estado (puede estar en uso por algún pedido).' };

  revalidatePath('/admin/estados');
  return { success: true };
}
