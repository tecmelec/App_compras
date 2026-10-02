'use server';

import { createClient } from '@/lib/supabase/server';

// Contactos de entrega guardados por el usuario (paso "Persona de contacto").

export async function crearContactoEntrega(datos: { nombre: string; telefono: string }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  const nombre = String(datos.nombre || '').trim().slice(0, 120);
  const telefono = String(datos.telefono || '').trim().slice(0, 30);
  if (!nombre) return { error: 'Falta el nombre del contacto.' };
  if (!/^\+\d{1,4} \d{6,12}$/.test(telefono)) return { error: 'El teléfono debe tener entre 6 y 12 dígitos.' };

  const { data, error } = await supabase
    .from('contactos_entrega')
    .insert({ usuario_id: user.id, nombre, telefono })
    .select('id, nombre, telefono')
    .single();

  if (error) return { error: 'No se pudo guardar el contacto.' };
  return { success: true, contacto: data };
}

export async function eliminarContactoEntrega(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase.from('contactos_entrega').delete().eq('id', id).eq('usuario_id', user.id);
  if (error) return { error: 'No se pudo eliminar el contacto.' };
  return { success: true };
}
