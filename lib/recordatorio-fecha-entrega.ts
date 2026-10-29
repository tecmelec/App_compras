// Recordatorio automático de fecha de entrega: si un pedido de compra se envió al
// proveedor y al día siguiente el proveedor aún no ha indicado la fecha de entrega
// estimada en su enlace, se le envía UN email recordándoselo (con el mismo enlace).
// Lo lanza el cron /api/cron/recordatorios-fecha-entrega (días laborables por la mañana).

import { createAdminClient } from '@/lib/supabase/admin';
import { enviarEmailConAdjuntoGraph } from '@/lib/microsoft-graph';
import {
  BOTON_FECHA_ENTREGA_ALTO,
  BOTON_FECHA_ENTREGA_ANCHO,
  BOTON_FECHA_ENTREGA_BASE64,
  BOTON_FECHA_ENTREGA_CID,
} from '@/lib/email/boton-fecha-entrega';

// Solo envíos de los últimos días: así, al activar esta función no se manda un
// recordatorio de golpe a todos los pedidos antiguos. 4 días cubre un envío del viernes
// que se recuerda el lunes.
const DIAS_VENTANA = 4;

const fechaMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD

function baseUrl(): string {
  const dominio =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || 'comprastecmelec.vercel.app'
      : process.env.VERCEL_URL || 'comprastecmelec.vercel.app';
  return `https://${dominio}`;
}

function cuerpoRecordatorio(numeroTecmelec: string, enlace: string): string {
  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1F2A2E;">
      <p>Buenos días,</p>
      <p>Todavía no nos habéis indicado la fecha de entrega estimada del pedido de compra
        <strong>${numeroTecmelec}</strong> que os enviamos. ¿Podéis indicárnosla, por favor?</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px;">
        <tr>
          <td>
            <a href="${enlace}" style="text-decoration:none;">
              <img src="cid:${BOTON_FECHA_ENTREGA_CID}" width="${BOTON_FECHA_ENTREGA_ANCHO}" height="${BOTON_FECHA_ENTREGA_ALTO}"
                alt="Indica la fecha de entrega estimada" border="0"
                style="display:block;border:0;outline:none;width:${BOTON_FECHA_ENTREGA_ANCHO}px;height:auto;max-width:100%;" />
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:12px;color:#5B6670;">
        Si no ves el botón, indica la fecha en este enlace: <a href="${enlace}" style="color:#178A4C;">${enlace}</a>
      </p>
      <p>Muchas gracias,<br/>Departamento de Compras<br/>Tecmelec Electricidad S.L.</p>
    </div>`;
}

export async function enviarRecordatoriosFechaEntrega(): Promise<{
  revisados: number;
  enviados: string[];
  omitidos: number;
  errores: string[];
}> {
  const admin = createAdminClient();
  const hoy = fechaMadrid(new Date());
  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 3600 * 1000).toISOString();

  const { data: emails, error } = await admin
    .from('pedido_emails')
    .select('id, numero_tecmelec, buzon, destinatarios, cc, asunto, token, created_at, recordatorio_enviado_en')
    .gte('created_at', desde)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`No se pudieron leer los emails enviados: ${error.message}`);

  // Por pedido de compra, solo el último envío (si se reenvió, cuenta el más reciente).
  const ultimoPorPedido = new Map<string, any>();
  for (const e of emails || []) {
    if (!ultimoPorPedido.has(e.numero_tecmelec)) ultimoPorPedido.set(e.numero_tecmelec, e);
  }
  // Ya recordado (en ese envío o en otro anterior del mismo pedido) → no se repite.
  const yaRecordados = new Set((emails || []).filter((e) => e.recordatorio_enviado_en).map((e) => e.numero_tecmelec));
  const candidatos = Array.from(ultimoPorPedido.values()).filter(
    (e) => !yaRecordados.has(e.numero_tecmelec) && fechaMadrid(new Date(e.created_at)) < hoy
  );
  if (candidatos.length === 0) return { revisados: 0, enviados: [], omitidos: 0, errores: [] };

  const { data: items } = await admin
    .from('pedido_items')
    .select('*')
    .in(
      'numero_tecmelec',
      candidatos.map((c) => c.numero_tecmelec)
    );

  const enviados: string[] = [];
  const errores: string[] = [];
  let omitidos = 0;
  for (const e of candidatos) {
    const lineas = (items || []).filter(
      (i) =>
        i.numero_tecmelec === e.numero_tecmelec &&
        !i.eliminada_en_bc &&
        !i.rechazada_por_aprobador &&
        !['Anulado', 'Recibido'].includes(i.estado_recepcion || '') &&
        Number((i as any).cantidad ?? 1) > 0
    );
    // Nada pendiente de recibir, o el proveedor ya indicó la fecha después del envío → no hace falta.
    const confirmado = lineas.some(
      (i: any) =>
        [i.fecha_estimada_entrega_confirmada_en, i.fecha_estimada_entrega_seguidor_en].some(
          (f) => f && new Date(f) >= new Date(e.created_at)
        )
    );
    if (lineas.length === 0 || confirmado) {
      omitidos++;
      continue;
    }
    try {
      await enviarEmailConAdjuntoGraph({
        buzon: e.buzon,
        destinatarios: e.destinatarios || [],
        cc: e.cc || [],
        asunto: `RE: ${e.asunto}`,
        cuerpo: cuerpoRecordatorio(e.numero_tecmelec, `${baseUrl()}/proveedor/pedido/${e.token}`),
        cuerpoEsHtml: true,
        nombreArchivo: '',
        contenidoBase64: '',
        adjuntosEnLinea: [
          { nombre: 'indica-fecha-entrega.jpg', tipo: 'image/jpeg', base64: BOTON_FECHA_ENTREGA_BASE64, contentId: BOTON_FECHA_ENTREGA_CID },
        ],
      });
      await admin
        .from('pedido_emails')
        .update({ recordatorio_enviado_en: new Date().toISOString(), recordatorio_error: null })
        .eq('id', e.id);
      enviados.push(e.numero_tecmelec);
    } catch (err: any) {
      const mensaje = err?.message || String(err);
      errores.push(`${e.numero_tecmelec}: ${mensaje}`);
      await admin.from('pedido_emails').update({ recordatorio_error: mensaje.slice(0, 500) }).eq('id', e.id);
    }
  }
  return { revisados: candidatos.length, enviados, omitidos, errores };
}
