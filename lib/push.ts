import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

// Envío de notificaciones push (Web Push) a los móviles/ordenadores donde cada
// usuario ha activado los avisos. Cada aviso de la campana (tabla
// notificaciones) se envía UNA vez: se "reserva" marcando push_enviado antes
// de mandarlo, así dos envíos simultáneos no lo duplican.
//
// Variables de entorno (Vercel): NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto:...). Sin ellas no se envía nada.

function configurado(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:compras@tecmelec.es', publica, privada);
  return true;
}

function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promesa, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

// Envía al móvil los avisos de la campana que aún no se han enviado (de las
// últimas 24 h). Nunca lanza error: si algo falla, el aviso sigue en la campana.
export async function despacharPushPendientes(): Promise<void> {
  try {
    if (!configurado()) return;
    const supabase = createAdminClient();

    const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: pendientes } = await supabase
      .from('notificaciones')
      .select('id')
      .eq('push_enviado', false)
      .gte('created_at', hace24h)
      .order('created_at')
      .limit(200);
    if (!pendientes || pendientes.length === 0) return;

    // Reserva: solo se envían las que esta llamada consiga marcar.
    const { data: reservadas } = await supabase
      .from('notificaciones')
      .update({ push_enviado: true })
      .in('id', pendientes.map((p) => p.id))
      .eq('push_enviado', false)
      .select('id, usuario_id, pedido_id, mensaje, enlace');
    if (!reservadas || reservadas.length === 0) return;

    const usuarios = Array.from(new Set(reservadas.map((n) => n.usuario_id)));
    const { data: suscripciones } = await supabase
      .from('push_suscripciones')
      .select('id, usuario_id, endpoint, p256dh, auth')
      .in('usuario_id', usuarios);
    if (!suscripciones || suscripciones.length === 0) return;

    const caducadas: string[] = [];
    const usadas = new Set<string>();
    const envios: Promise<unknown>[] = [];

    for (const n of reservadas) {
      const url = n.enlace || (n.pedido_id ? `/mis-pedidos/${n.pedido_id}` : '/tienda');
      const cuerpo = JSON.stringify({ titulo: 'Tienda Tecmelec', cuerpo: n.mensaje, url, tag: n.id });
      for (const s of suscripciones.filter((x) => x.usuario_id === n.usuario_id)) {
        envios.push(
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 24 * 3600 })
            .then(() => usadas.add(s.id))
            .catch((e: any) => {
              // 404/410: el dispositivo ya no existe o retiró el permiso.
              if (e?.statusCode === 404 || e?.statusCode === 410) caducadas.push(s.id);
              else console.error('Push no enviado:', e?.statusCode, e?.body || e?.message);
            })
        );
      }
    }

    await conTiempoLimite(Promise.allSettled(envios), 8000);

    if (caducadas.length) await supabase.from('push_suscripciones').delete().in('id', caducadas);
    if (usadas.size)
      await supabase.from('push_suscripciones').update({ ultimo_uso: new Date().toISOString() }).in('id', Array.from(usadas));
  } catch (e) {
    console.error('Error enviando notificaciones push:', e);
  }
}
