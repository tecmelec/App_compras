'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function marcarFavorito(productoId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('favoritos')
    .insert({ usuario_id: user.id, producto_id: productoId });

  if (error) return { error: 'No se pudo marcar como favorito.' };

  revalidatePath('/tienda');
  return { success: true };
}

export async function quitarFavorito(productoId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('favoritos')
    .delete()
    .eq('usuario_id', user.id)
    .eq('producto_id', productoId);

  if (error) return { error: 'No se pudo quitar de favoritos.' };

  revalidatePath('/tienda');
  return { success: true };
}
