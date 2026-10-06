'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';
import { revalidatePath } from 'next/cache';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ID de usuario de BC (GUID). Vacío -> null. Admite que se pegue con llaves {…}.
function normalizarBcUserId(valor?: string): string | null {
  const limpio = (valor || '').trim().replace(/^\{|\}$/g, '');
  return limpio || null;
}

function validarBcUserId(valor?: string): string | null {
  const limpio = normalizarBcUserId(valor);
  if (limpio && !GUID.test(limpio)) return 'El ID de usuario de BC no tiene formato válido (ej. 7b069824-359b-4fc4-a20f-cff70ff56d15).';
  return null;
}

export async function crearUsuario(datos: {
  nombre_completo: string;
  email: string;
  password: string;
  telefono: string;
  bc_user_id?: string;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  comprador_id: string | null;
  responsable_id: string | null;
  sustituto_id: string | null;
  sustituto_activo: boolean;
}) {
  await requireAdmin();
  const errorBc = validarBcUserId(datos.bc_user_id);
  if (errorBc) return { error: errorBc };
  const admin = createAdminClient();

  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });

  if (errorAuth || !nuevoUsuario.user) {
    return { error: errorAuth?.message || 'No se pudo crear el usuario.' };
  }

  const esComprablesOResponsable = datos.rol === 'comprador' || datos.rol === 'responsable';

  const { error: errorPerfil } = await admin.from('profiles').insert({
    id: nuevoUsuario.user.id,
    nombre_completo: datos.nombre_completo,
    email: datos.email,
    telefono: datos.telefono || null,
    bc_user_id: normalizarBcUserId(datos.bc_user_id),
    rol: datos.rol,
    comprador_id: datos.rol === 'usuario' ? datos.comprador_id : null,
    responsable_id: datos.rol === 'usuario' || datos.rol === 'comprador' ? datos.responsable_id : null,
    sustituto_id: esComprablesOResponsable ? datos.sustituto_id : null,
    sustituto_activo: esComprablesOResponsable ? datos.sustituto_activo : false,
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
    telefono: string;
    bc_user_id?: string;
    rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
    comprador_id: string | null;
    responsable_id: string | null;
    sustituto_id: string | null;
    sustituto_activo: boolean;
  }
) {
  await requireAdmin();
  const errorBc = validarBcUserId(datos.bc_user_id);
  if (errorBc) return { error: errorBc };
  const supabase = createClient();

  const esComprablesOResponsable = datos.rol === 'comprador' || datos.rol === 'responsable';

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre_completo: datos.nombre_completo,
      telefono: datos.telefono || null,
      bc_user_id: normalizarBcUserId(datos.bc_user_id),
      rol: datos.rol,
      comprador_id: datos.rol === 'usuario' ? datos.comprador_id : null,
      responsable_id: datos.rol === 'usuario' || datos.rol === 'comprador' ? datos.responsable_id : null,
      sustituto_id: esComprablesOResponsable ? datos.sustituto_id : null,
      sustituto_activo: esComprablesOResponsable ? datos.sustituto_activo : false,
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

// Elimina un usuario de la Tienda.
// - No se permite si tiene historial (solicitudes, aprobaciones, emails a
//   proveedores, movimientos de almacén…): se perdería el rastro.
// - No se permite si otros usuarios lo tienen como comprador, responsable o
//   sustituto: primero hay que reasignarlos.
// - Si también es usuario del CRM (misma cuenta de acceso), solo se quita su
//   perfil de la Tienda y conserva el acceso al CRM; si no, se borra la cuenta.
export async function eliminarUsuario(id: string) {
  const yo = await requireAdmin();
  if (id === yo.id) return { error: 'No puedes eliminar tu propio usuario.' };

  const admin = createAdminClient();
  const { data: perfil } = await admin.from('profiles').select('id, nombre_completo').eq('id', id).maybeSingle();
  if (!perfil) return { error: 'Usuario no encontrado.' };

  const contar = async (tabla: string, columna: string) => {
    const { count } = await admin.from(tabla).select('*', { count: 'exact', head: true }).eq(columna, id);
    return count || 0;
  };

  const [solicitudesPropias, comoComprador, comoResponsable, aprobadas, emails, enlaces, pdfEnviado, almacen] =
    await Promise.all([
      contar('pedidos', 'usuario_id'),
      contar('pedidos', 'comprador_id'),
      contar('pedidos', 'responsable_id'),
      contar('pedidos', 'aprobado_por'),
      contar('pedido_emails', 'enviado_por'),
      contar('enlaces_proveedor_pedido', 'creado_por'),
      contar('pedido_compra_pdf_enviado', 'actualizado_por'),
      contar('almacen_movimientos', 'usuario_id'),
    ]);

  const historial: string[] = [];
  if (solicitudesPropias) historial.push(`${solicitudesPropias} solicitud(es) hechas por él`);
  if (comoComprador) historial.push(`${comoComprador} solicitud(es) como comprador`);
  if (comoResponsable || aprobadas) historial.push(`${Math.max(comoResponsable, aprobadas)} solicitud(es) como responsable`);
  if (emails || enlaces || pdfEnviado) historial.push('envíos de pedidos a proveedores');
  if (almacen) historial.push(`${almacen} movimiento(s) de almacén`);
  if (historial.length) {
    return {
      error: `No se puede eliminar a ${perfil.nombre_completo}: tiene historial en la app (${historial.join(', ')}) y se perdería el rastro de esas solicitudes.`,
    };
  }

  const { data: dependientes } = await admin
    .from('profiles')
    .select('nombre_completo, comprador_id, responsable_id, sustituto_id')
    .or(`comprador_id.eq.${id},responsable_id.eq.${id},sustituto_id.eq.${id}`);
  if (dependientes && dependientes.length) {
    const nombres = dependientes.map((d) => {
      const como = [
        d.comprador_id === id ? 'comprador' : null,
        d.responsable_id === id ? 'responsable' : null,
        d.sustituto_id === id ? 'sustituto' : null,
      ]
        .filter(Boolean)
        .join('/');
      return `${d.nombre_completo} (${como})`;
    });
    return {
      error: `No se puede eliminar a ${perfil.nombre_completo}: está asignado a otros usuarios. Primero cambia su asignación en: ${nombres.join(', ')}.`,
    };
  }

  // ¿Usa también el CRM? (tabla de otra aplicación que comparte las cuentas de acceso)
  const { count: enCrm, error: errorCrm } = await admin
    .from('crm_usuarios')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', id);
  const usaCrm = !errorCrm && (enCrm || 0) > 0;

  if (usaCrm) {
    const { error } = await admin.from('profiles').delete().eq('id', id);
    if (error) return { error: 'No se pudo eliminar el usuario: ' + error.message };
  } else {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return { error: 'No se pudo eliminar el usuario: ' + error.message };
  }

  revalidatePath('/admin/usuarios');
  return { success: true, soloTienda: usaCrm };
}

// Desactiva un usuario: conserva todo su historial pero pierde el acceso a la
// Tienda (y los permisos de su rol). No afecta al CRM ni al almacén.
// No se permite si otros usuarios lo tienen asignado como comprador,
// responsable o sustituto, ni si tiene solicitudes pendientes de su aprobación.
export async function desactivarUsuario(id: string) {
  const yo = await requireAdmin();
  if (id === yo.id) return { error: 'No puedes desactivar tu propio usuario.' };

  const admin = createAdminClient();
  const { data: perfil } = await admin.from('profiles').select('id, nombre_completo').eq('id', id).maybeSingle();
  if (!perfil) return { error: 'Usuario no encontrado.' };

  const { data: dependientes } = await admin
    .from('profiles')
    .select('nombre_completo, comprador_id, responsable_id, sustituto_id')
    .eq('activo', true)
    .or(`comprador_id.eq.${id},responsable_id.eq.${id},sustituto_id.eq.${id}`);
  if (dependientes && dependientes.length) {
    const nombres = dependientes.map((d) => {
      const como = [
        d.comprador_id === id ? 'comprador' : null,
        d.responsable_id === id ? 'responsable' : null,
        d.sustituto_id === id ? 'sustituto' : null,
      ]
        .filter(Boolean)
        .join('/');
      return `${d.nombre_completo} (${como})`;
    });
    return {
      error: `No se puede desactivar a ${perfil.nombre_completo}: está asignado a otros usuarios. Primero cambia su asignación en: ${nombres.join(', ')}.`,
    };
  }

  const { count: pendientes } = await admin
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('responsable_id', id)
    .eq('requiere_aprobacion', true)
    .is('aprobado', null);
  if (pendientes) {
    return {
      error: `No se puede desactivar a ${perfil.nombre_completo}: tiene ${pendientes} solicitud(es) pendiente(s) de su aprobación. Apruébalas o recházalas antes.`,
    };
  }

  const { error } = await admin
    .from('profiles')
    .update({ activo: false, sustituto_activo: false })
    .eq('id', id);
  if (error) return { error: 'No se pudo desactivar el usuario: ' + error.message };

  // Deja de recibir avisos en el móvil.
  await admin.from('push_suscripciones').delete().eq('usuario_id', id);

  revalidatePath('/admin/usuarios');
  return { success: true };
}

export async function reactivarUsuario(id: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ activo: true }).eq('id', id);
  if (error) return { error: 'No se pudo reactivar el usuario: ' + error.message };
  revalidatePath('/admin/usuarios');
  return { success: true };
}
