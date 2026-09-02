'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';
import { revalidatePath } from 'next/cache';

export async function crearUsuario(datos: {
  nombre_completo: string;
  email: string;
  password: string;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  comprador_id: string | null;
  responsable_id: string | null;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });

  if (errorAuth || !nuevoUsuario.user) {
    return { error: errorAuth?.message || 'No se pudo crear el usuario.' };
  }

  const { error: errorPerfil } = await admin.from('profiles').insert({
    id: nuevoUsuario.user.id,
    nombre_completo: datos.nombre_completo,
    email: datos.email,
    rol: datos.rol,
    comprador_id: datos.rol === 'usuario' ? datos.comprador_id : null,
    responsable_id: datos.rol === 'usuario' ? datos.responsable_id : null,
  });

  if (errorPerfil) {
    // revertir la creación en Auth si falla el perfil, para no dejar cuentas huérfanas
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return { error: 'No se pudo crear el perfil del usuario.' };
  }

  revalidatePath('/admin/usuarios');
  return { success: true };
}

export async function actualizarUsuario(
  id: string,
  datos: {
    nombre_completo: string;
    rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
    comprador_id: string | null;
    responsable_id: string | null;
  }
) {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre_completo: datos.nombre_completo,
      rol: datos.rol,
      comprador_id: datos.rol === 'usuario' ? datos.comprador_id : null,
      responsable_id: datos.rol === 'usuario' ? datos.responsable_id : null,
    })
    .eq('id', id);

  if (error) return { error: 'No se pudo actualizar el usuario.' };

  revalidatePath('/admin/usuarios');
  return { success: true };
}

export async function resetearPassword(id: string, nuevaPassword: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(id, { password: nuevaPassword });
  if (error) return { error: 'No se pudo cambiar la contraseña.' };

  return { success: true };
}
