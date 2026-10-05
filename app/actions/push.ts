'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Registra (o reasigna) este dispositivo para recibir avisos del usuario conectado.
export async function guardarSuscripcionPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return { error: 'Suscripción no válida.' };

  // Con el cliente de servicio: si el mismo dispositivo lo usaba otra persona
  // antes, pasa a ser de quien lo activa ahora.
  const admin = createAdminClient();
  const { error } = await admin.from('push_suscripciones').upsert(
    { usuario_id: user.id, endpoint, p256dh, auth, user_agent: (userAgent || '').slice(0, 300) },
    { onConflict: 'endpoint' }
  );
  if (error) return { error: 'No se pudieron activar los avisos: ' + error.message };
  return { success: true };
}

export async function eliminarSuscripcionPush(endpoint: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };
  await supabase.from('push_suscripciones').delete().eq('endpoint', endpoint).eq('usuario_id', user.id);
  return { success: true };
}

// Envía un aviso de prueba a los dispositivos del usuario conectado.
export async function enviarPushDePrueba() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Debes iniciar sesión.' };

  const webpush = (await import('web-push')).default;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return { error: 'Faltan las claves de notificaciones en el servidor (VAPID).' };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:compras@tecmelec.es', publica, privada);

  const { data: subs } = await supabase.from('push_suscripciones').select('endpoint, p256dh, auth').eq('usuario_id', user.id);
  if (!subs || subs.length === 0) return { error: 'No tienes ningún dispositivo con los avisos activados.' };

  const cuerpo = JSON.stringify({ titulo: 'Tienda Tecmelec', cuerpo: 'Avisos activados correctamente en este dispositivo.', url: '/tienda' });
  const resultados = await Promise.allSettled(
    subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo))
  );
  const ok = resultados.filter((r) => r.status === 'fulfilled').length;
  return ok > 0 ? { success: true, dispositivos: ok } : { error: 'No se pudo enviar el aviso de prueba.' };
}
