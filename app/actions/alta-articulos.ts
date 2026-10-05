'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { buscarArticulosBC } from '@/lib/business-central';
import { despacharPushPendientes } from '@/lib/push';

const ROLES_PERMITIDOS = ['comprador', 'responsable', 'admin'];
export type EstadoAlta = 'Solicitud enviada' | 'Rechazada' | 'Disponible en tienda';
const ESTADOS: EstadoAlta[] = ['Solicitud enviada', 'Rechazada', 'Disponible en tienda'];

async function usuarioConRol() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, rol: null };
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  return { supabase, user, rol: (perfil?.rol as string) || null };
}

// Busca artículos en la ficha de productos de Business Central.
export async function buscarArticulosParaAlta(texto: string, campo: 'codigo' | 'descripcion') {
  const { user, rol } = await usuarioConRol();
  if (!user || !rol || !ROLES_PERMITIDOS.includes(rol)) return { error: 'No autorizado.', articulos: [] };
  if (String(texto || '').trim().length < 2) return { articulos: [] };
  try {
    const articulos = await buscarArticulosBC(String(texto).slice(0, 60), campo);
    return { articulos };
  } catch (e: any) {
    return { error: 'No se pudo consultar Business Central: ' + (e.message || ''), articulos: [] };
  }
}

// Comprueba si el artículo ya está publicado en la tienda o ya tiene una
// solicitud pendiente.
export async function comprobarArticuloEnTienda(bcItemNo: string) {
  const { supabase, user, rol } = await usuarioConRol();
  if (!user || !rol || !ROLES_PERMITIDOS.includes(rol)) return { error: 'No autorizado.' };

  const [{ data: producto }, { data: pendiente }] = await Promise.all([
    supabase.from('productos').select('id, visible').eq('bc_item_no', bcItemNo).maybeSingle(),
    supabase
      .from('solicitudes_alta_articulo')
      .select('id')
      .eq('bc_item_no', bcItemNo)
      .eq('estado', 'Solicitud enviada')
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    disponible: !!producto?.visible,
    solicitudPendiente: !!pendiente,
  };
}

export async function enviarSolicitudAlta(bcItemNo: string, descripcion: string) {
  const { supabase, user, rol } = await usuarioConRol();
  if (!user || !rol || !ROLES_PERMITIDOS.includes(rol)) return { error: 'No autorizado.' };

  const no = String(bcItemNo || '').trim().slice(0, 40);
  const desc = String(descripcion || '').trim().slice(0, 250);
  if (!no || !desc) return { error: 'Selecciona un artículo de Business Central.' };

  const comprobacion = await comprobarArticuloEnTienda(no);
  if ('error' in comprobacion && comprobacion.error) return { error: comprobacion.error };
  if (comprobacion.disponible) return { error: 'Este artículo ya está disponible en la tienda.' };
  if (comprobacion.solicitudPendiente) return { error: 'Ya hay una solicitud pendiente para este artículo.' };

  const { error } = await supabase
    .from('solicitudes_alta_articulo')
    .insert({ bc_item_no: no, descripcion: desc, solicitado_por: user.id });
  if (error) return { error: 'No se pudo enviar la solicitud: ' + error.message };

  revalidatePath('/alta-articulos');
  return { success: true };
}

// Solo admin: cambia el estado de una solicitud.
export async function cambiarEstadoSolicitudAlta(id: string, estado: EstadoAlta) {
  const { supabase, user, rol } = await usuarioConRol();
  if (!user || rol !== 'admin') return { error: 'No autorizado.' };
  if (!ESTADOS.includes(estado)) return { error: 'Estado no válido.' };

  const { error } = await supabase
    .from('solicitudes_alta_articulo')
    .update({ estado, gestionado_por: user.id, gestionado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: 'No se pudo cambiar el estado: ' + error.message };

  await despacharPushPendientes();
  revalidatePath('/alta-articulos');
  return { success: true };
}
