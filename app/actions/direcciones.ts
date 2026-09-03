'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function crearDireccion(datos: {
  alias: string;
  direccion: string;
  codigo_postal: string;
  ciudad: string;
  provincia: string;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { data, error } = await supabase
    .from('direcciones')
    .insert({ ...datos, usuario_id: user.id })
    .select('id, alias, direccion, codigo_postal, ciudad, provincia')
    .single();

  if (error) return { error: 'No se pudo guardar la dirección.' };

  revalidatePath('/carrito');
  return { success: true, direccion: data };
}
