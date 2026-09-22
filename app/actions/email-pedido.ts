'use server';

import { randomUUID } from 'crypto';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  enviarEmailConAdjuntoGraph,
  obtenerConversacionGraph,
  buscarMensajeEnviadoPorAsunto,
} from '@/lib/microsoft-graph';
import { obtenerFichaProveedorPorNumeroBC } from '@/lib/business-central';

function construirBaseUrl(): string {
  const h = headers();
  const host = h.get('host');
  const protocolo = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocolo}://${host}`;
}

// Precarga rápida (sin generar el PDF) del proveedor y su(s) email(s) de BC,
// para que el usuario los vea y pueda editarlos antes de enviar.
export async function obtenerDatosEmailPedido(numeroTecmelec: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No autenticado.' };
  }

  try {
    const { data: item } = await supabase
      .from('pedido_items')
      .select('proveedor_id')
      .eq('numero_tecmelec', numeroTecmelec)
      .limit(1)
      .maybeSingle();

    if (!item) {
      return { error: 'Pedido no encontrado.' };
    }

    let proveedorNombre = '';
    let emails: string[] = [];

    if (item.proveedor_id) {
      const { data: proveedor } = await supabase
        .from('proveedores')
        .select('bc_proveedor_no, nombre')
        .eq('id', item.proveedor_id)
        .single();

      if (proveedor?.bc_proveedor_no) {
        proveedorNombre = `${proveedor.bc_proveedor_no} - ${proveedor.nombre}`;
        try {
          const ficha = await obtenerFichaProveedorPorNumeroBC(proveedor.bc_proveedor_no);
          emails = (ficha?.E_Mail || '')
            .split(/[;,]/)
            .map((e) => e.trim())
            .filter(Boolean);
        } catch {
          // Sin email sugerido si BC no responde; el usuario puede escribirlo a mano.
        }
      }
    }

    return { success: true, proveedorNombre, emails };
  } catch (e: any) {
    return { error: e.message || 'No se pudieron cargar los datos del proveedor.' };
  }
}

// El PDF se pide a nuestra propia ruta /api/pedidos/.../pdf en vez de
// generarlo aquí mismo: esa ruta ya está aislada para poder cargar
// @react-pdf/renderer (ESM); importarlo directamente en esta Server Action
// arrastra esa dependencia al bundle de la página que usa el botón de email
// y rompe el build (Terser no admite el "await" que genera esa interop ESM
// en ese contexto).
async function pedirPdfPorHttp(numeroTecmelec: string, conFotos: boolean): Promise<Buffer> {
  const query = conFotos ? '?fotos=1' : '';
  const url = `${construirBaseUrl()}/api/pedidos/${encodeURIComponent(numeroTecmelec)}/pdf${query}`;

  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const respuesta = await fetch(url, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo generar el PDF del pedido (HTTP ${respuesta.status}).`);
  }

  const arrayBuffer = await respuesta.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function construirCuerpoHtml(mensaje: string, enlaceFechaEntrega: string): string {
  const parrafos = mensaje
    .split('\n')
    .map((linea) => `<p style="margin:0 0 10px;">${escapeHtml(linea)}</p>`)
    .join('');

  return `
    <div style="font-family: sans-serif; color:#1C2126;">
      ${parrafos}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td style="background-color:#178A4C;border-radius:8px;">
            <a href="${enlaceFechaEntrega}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-weight:bold;text-decoration:none;font-family:sans-serif;font-size:14px;">
              📅 Indica la fecha de entrega estimada
            </a>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export async function enviarPedidoPorEmail(
  numeroTecmelec: string,
  conFotos: boolean,
  destinatarios: string[],
  mensaje: string
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No autenticado.' };
  }
  if (!user.email) {
    return { error: 'Tu usuario no tiene un email asociado, no se puede enviar en tu nombre.' };
  }

  if (destinatarios.length === 0) {
    return { error: 'Añade al menos un destinatario.' };
  }

  try {
    const { data: item } = await supabase
      .from('pedido_items')
      .select('pedido_id')
      .eq('numero_tecmelec', numeroTecmelec)
      .limit(1)
      .maybeSingle();

    if (!item) {
      return { error: 'Pedido no encontrado.' };
    }

    const pdfBuffer = await pedirPdfPorHttp(numeroTecmelec, conFotos);
    const asunto = `PEDIDO DE COMPRA ${numeroTecmelec}`;
    const token = randomUUID();
    const enlaceFechaEntrega = `${construirBaseUrl()}/proveedor/pedido/${token}`;
    const cuerpoHtml = construirCuerpoHtml(mensaje, enlaceFechaEntrega);

    const { messageId, conversationId } = await enviarEmailConAdjuntoGraph({
      buzon: user.email,
      destinatarios,
      asunto,
      cuerpo: cuerpoHtml,
      cuerpoEsHtml: true,
      nombreArchivo: `Pedido_compra_${numeroTecmelec}${conFotos ? '_con_fotos' : ''}.pdf`,
      contenidoBase64: pdfBuffer.toString('base64'),
    });

    const { error: errorGuardado } = await supabase.from('pedido_emails').insert({
      pedido_id: item.pedido_id,
      numero_tecmelec: numeroTecmelec,
      enviado_por: user.id,
      buzon: user.email,
      destinatarios,
      asunto,
      mensaje,
      con_fotos: conFotos,
      graph_message_id: messageId,
      graph_conversation_id: conversationId,
      token,
    });

    if (errorGuardado) {
      // El email ya salió; que no se guarde el registro no debe impedir avisar del envío,
      // pero sí lo dejamos en consola para poder investigarlo.
      console.error('No se pudo guardar el registro de pedido_emails:', errorGuardado);
    }

    return { success: true, destinatarios };
  } catch (e: any) {
    return { error: e.message || 'No se pudo enviar el email.' };
  }
}

// Historial de emails enviados desde la app para este pedido, más la
// conversación completa leída en vivo desde Microsoft Graph (incluye las
// respuestas del proveedor que hayan llegado al buzón de quien envió).
export async function obtenerConversacionPedido(numeroTecmelec: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No autenticado.' };
  }

  try {
    const { data: envios } = await supabase
      .from('pedido_emails')
      .select('id, buzon, asunto, graph_conversation_id, created_at, enviado_por, profiles(nombre_completo)')
      .eq('numero_tecmelec', numeroTecmelec)
      .order('created_at', { ascending: true });

    if (!envios || envios.length === 0) {
      return { success: true, mensajes: [], enviado: false };
    }

    // Normalmente hay una sola conversación por pedido; si se envió más de
    // una vez (p. ej. reenvío), se combinan los hilos de cada envío.
    const hilos = new Map<string, string>(); // conversationId -> buzon

    // Si algún envío se quedó sin conversationId (Graph tardó en indexar el
    // mensaje justo cuando se mandó), se reintenta ahora, que ya no hay
    // prisa, y se repara el registro guardado para no tener que repetirlo.
    await Promise.all(
      (envios as any[])
        .filter((e) => !e.graph_conversation_id && e.buzon && e.asunto)
        .map(async (e) => {
          const encontrado = await buscarMensajeEnviadoPorAsunto(e.buzon, e.asunto).catch(() => null);
          if (encontrado?.conversationId) {
            e.graph_conversation_id = encontrado.conversationId;
            await supabase
              .from('pedido_emails')
              .update({ graph_message_id: encontrado.messageId || null, graph_conversation_id: encontrado.conversationId })
              .eq('id', e.id);
          }
        })
    );

    for (const e of envios as any[]) {
      if (e.graph_conversation_id && e.buzon) {
        hilos.set(e.graph_conversation_id, e.buzon);
      }
    }

    const mensajesPorHilo = await Promise.all(
      Array.from(hilos.entries()).map(([conversationId, buzon]) =>
        obtenerConversacionGraph(buzon, conversationId).catch(() => [])
      )
    );

    const mensajes = mensajesPorHilo
      .flat()
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    return { success: true, mensajes, enviado: true };
  } catch (e: any) {
    return { error: e.message || 'No se pudo leer la conversación.' };
  }
}
