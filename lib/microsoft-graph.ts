import { aplicarDesvioEmail } from '@/lib/desvio-email';
// Envía emails a través de Microsoft Graph (Outlook / Microsoft 365).
//
// Usa GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET si están definidas
// (necesario cuando el correo @tecmelec.es vive en un tenant de Microsoft 365
// distinto al que se usa para Business Central); si no, reutiliza las
// credenciales de BC (BC_TENANT_ID/BC_CLIENT_ID/BC_CLIENT_SECRET), por si en
// algún caso coincidieran en el mismo tenant.
//
// Requiere en la app de Azure AD de ESE tenant (el que gestiona el correo):
//   - Permiso de aplicación "Mail.Send" de Microsoft Graph, con Admin consent.
//   - Permiso de aplicación "Mail.Read" de Microsoft Graph, con Admin consent
//     (para poder leer después las respuestas del proveedor y armar el
//     historial de la conversación).
//   - (Recomendado) una política de acceso de aplicación en Exchange Online
//     que limite qué buzones puede usar esta app.

let tokenCache: { token: string; expira: number } | null = null;

async function obtenerTokenGraph(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 30_000) {
    return tokenCache.token;
  }

  // Usa un tenant/app dedicado al correo si se ha configurado (necesario si
  // el correo @tecmelec.es vive en un tenant de Microsoft 365 distinto al
  // que se usa para Business Central); si no, cae en las mismas credenciales
  // de BC por si en algún momento coinciden en el mismo tenant.
  const tenantId = process.env.GRAPH_TENANT_ID || process.env.BC_TENANT_ID!;
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.BC_CLIENT_ID!;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.BC_CLIENT_SECRET!;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const respuesta = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`No se pudo autenticar con Microsoft Graph: ${texto}`);
  }

  const data = await respuesta.json();
  tokenCache = { token: data.access_token, expira: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Busca en la carpeta de Enviados el mensaje que se acaba de mandar con
// /sendMail, para sacar su Id y su conversationId (sendMail no los devuelve
// directamente, a diferencia de crear+enviar un borrador). Se identifica por
// asunto + fecha más reciente; el asunto ya incluye el Nº de pedido, así que
// es suficientemente único.
//
// No se usa $filter=subject eq '...' combinado con $orderby: Graph puede
// devolver 0 resultados en silencio (sin error) para esa combinación en
// ciertos buzones/tenants por restricciones de indexación. En su lugar se
// piden los últimos mensajes de Enviados sin filtro y se compara el asunto
// aquí mismo, que es fiable siempre que el mensaje esté entre los más
// recientes.
//
// Si Graph tarda un poco en indexarlo en Enviados, o responde con un error
// transitorio (5xx — ocurre de vez en cuando en Exchange Online, ajeno a
// nuestro código), se reintenta con espera creciente (backoff exponencial)
// antes de rendirse — nunca lanza error: si no lo encuentra, el email ya
// salió igualmente, solo no se podrá enlazar la conversación después.
async function buscarMensajeEnviado(
  token: string,
  buzon: string,
  asunto: string,
  intentos: number,
  esperaMs: number
): Promise<{ messageId: string; conversationId: string | null }> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    buzon
  )}/mailFolders/sentitems/messages?$select=id,conversationId,subject,sentDateTime&$orderby=sentDateTime desc&$top=15`;

  for (let intento = 0; intento < intentos; intento++) {
    if (intento > 0) await esperar(esperaMs * Math.pow(2, intento - 1));

    try {
      const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!respuesta.ok) {
        const texto = await respuesta.text().catch(() => '');
        console.error(`buscarMensajeEnviado: Graph respondió ${respuesta.status} en intento ${intento + 1}/${intentos}:`, texto);
        continue;
      }

      const data = await respuesta.json();
      const mensajes: any[] = data.value || [];
      const mensaje = mensajes.find((m) => (m.subject || '').trim() === asunto.trim());
      if (mensaje?.id) {
        return { messageId: mensaje.id, conversationId: mensaje.conversationId || null };
      }
      console.error(
        `buscarMensajeEnviado: sin coincidencia en intento ${intento + 1}/${intentos} (buzon=${buzon}, asunto buscado="${asunto}", asuntos recibidos=${JSON.stringify(mensajes.map((m) => m.subject))})`
      );
    } catch (err) {
      console.error(`buscarMensajeEnviado: excepción en intento ${intento + 1}/${intentos}:`, err);
    }
  }

  return { messageId: '', conversationId: null };
}

// Repite la búsqueda del mensaje en Enviados bastante después del envío (p.
// ej. cuando el comprador abre "Ver conversación"), para los casos en que el
// intento justo después de enviar no llegó a tiempo porque Graph tardó más
// en indexarlo, o Graph devolvió un error transitorio (5xx) — aquí ya no hay
// prisa, así que se dan varios intentos con espera creciente (1s, 2s, 4s,
// 8s) antes de rendirse. Quien llama decide si actualiza el registro
// guardado con lo que se encuentre.
export async function buscarMensajeEnviadoPorAsunto(
  buzon: string,
  asunto: string
): Promise<{ messageId: string; conversationId: string | null }> {
  const token = await obtenerTokenGraph();
  return buscarMensajeEnviado(token, buzon, asunto, 5, 1000);
}

// Envía el email directamente con /sendMail (requiere solo el permiso de
// aplicación Mail.Send). No usamos crear-borrador + enviar por separado
// porque ese primer paso (POST /messages) necesita Mail.ReadWrite, que no
// forma parte de los permisos concedidos — con Mail.Send + Mail.Read (que sí
// están concedidos) basta: se manda con /sendMail y luego se busca el
// mensaje en Enviados para recuperar su Id y conversationId.
export async function enviarEmailConAdjuntoGraph({
  buzon,
  destinatarios,
  cc,
  asunto,
  cuerpo,
  cuerpoEsHtml,
  nombreArchivo,
  contenidoBase64,
  adjuntosExtra = [],
  adjuntosEnLinea = [],
}: {
  buzon: string; // email de la persona/buzón que envía (aparece como remitente real)
  destinatarios: string[];
  cc?: string[];
  asunto: string;
  cuerpo: string;
  cuerpoEsHtml?: boolean;
  nombreArchivo: string;
  contenidoBase64: string;
  // Documentos adicionales que el comprador adjunta a mano (además del PDF del pedido).
  adjuntosExtra?: { nombre: string; tipo: string; base64: string }[];
  // Imágenes incrustadas en el cuerpo HTML (<img src="cid:...">), no aparecen como adjunto.
  adjuntosEnLinea?: { nombre: string; tipo: string; base64: string; contentId: string }[];
}): Promise<{ messageId: string; conversationId: string | null }> {
  const token = await obtenerTokenGraph();
  const desvio = aplicarDesvioEmail(destinatarios, cc || []);
  const contenido = desvio.avisoHtml
    ? cuerpoEsHtml
      ? desvio.avisoHtml + cuerpo
      : `[ENTORNO DE PRUEBAS — destinatarios originales: ${destinatarios.join(', ')}${cc?.length ? ` · CC: ${cc.join(', ')}` : ''}]\n\n${cuerpo}`
    : cuerpo;

  const urlEnviar = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/sendMail`;
  const respuestaEnviar = await fetch(urlEnviar, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: asunto,
        body: { contentType: cuerpoEsHtml ? 'HTML' : 'Text', content: contenido },
        toRecipients: desvio.to.map((email) => ({ emailAddress: { address: email } })),
        ccRecipients: desvio.cc.map((email) => ({ emailAddress: { address: email } })),
        attachments: [
          // El PDF del pedido es opcional (p. ej. el recordatorio de fecha de entrega no lo lleva).
          ...(contenidoBase64
            ? [
              {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: nombreArchivo,
                contentType: 'application/pdf',
                contentBytes: contenidoBase64,
              },
              ]
            : []),
          ...adjuntosExtra.map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.nombre,
            contentType: a.tipo || 'application/octet-stream',
            contentBytes: a.base64,
          })),
          ...adjuntosEnLinea.map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.nombre,
            contentType: a.tipo,
            contentBytes: a.base64,
            contentId: a.contentId,
            isInline: true,
          })),
        ],
      },
      saveToSentItems: true,
    }),
  });

  if (!respuestaEnviar.ok) {
    const texto = await respuestaEnviar.text();
    throw new Error(`Microsoft Graph rechazó el envío: ${texto}`);
  }

  return buscarMensajeEnviado(token, buzon, asunto, 4, 1500);
}

export type MensajeConversacionGraph = {
  id: string;
  de: string;
  deNombre: string;
  fecha: string;
  asunto: string;
  resumen: string;
  esBorrador: boolean;
};

// Trae todos los mensajes de una conversación (el nuestro + las respuestas
// del proveedor que hayan llegado a ese buzón), ordenados por fecha.
//
// No se combina $filter con $orderby (mismo problema visto en
// buscarMensajeEnviado: Graph puede devolver 0 resultados en silencio para
// esa combinación en ciertos buzones); se ordena aquí mismo tras traer los
// resultados del filtro.
export async function obtenerConversacionGraph(
  buzon: string,
  conversationId: string
): Promise<MensajeConversacionGraph[]> {
  const token = await obtenerTokenGraph();

  const filtro = `conversationId eq '${conversationId.replace(/'/g, "''")}'`;
  const seleccion = 'id,subject,from,receivedDateTime,sentDateTime,bodyPreview,isDraft';
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    buzon
  )}/messages?$filter=${encodeURIComponent(filtro)}&$select=${seleccion}&$top=50`;

  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    console.error(`obtenerConversacionGraph: Graph respondió ${respuesta.status} (buzon=${buzon}, conversationId=${conversationId}):`, texto);
    throw new Error(`No se pudo leer la conversación en Microsoft Graph: ${texto}`);
  }

  const data = await respuesta.json();
  const mensajes = data.value || [];

  console.error(
    `obtenerConversacionGraph: ${mensajes.length} mensaje(s) encontrados (buzon=${buzon}, conversationId=${conversationId})`
  );

  return mensajes
    .map((m: any) => ({
      id: m.id,
      de: m.from?.emailAddress?.address || '',
      deNombre: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
      fecha: m.receivedDateTime || m.sentDateTime,
      asunto: m.subject || '',
      resumen: m.bodyPreview || '',
      esBorrador: !!m.isDraft,
    }))
    .sort((a: MensajeConversacionGraph, b: MensajeConversacionGraph) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}

// Adjuntos de un mensaje (sin el contenido), para las respuestas a peticiones de oferta.
export async function listarAdjuntosMensajeGraph(
  buzon: string,
  messageId: string
): Promise<{ id: string; nombre: string; tipo: string; tamano: number; enLinea: boolean }[]> {
  const token = await obtenerTokenGraph();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages/${encodeURIComponent(
    messageId
  )}/attachments?$select=id,name,contentType,size,isInline`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`No se pudieron leer los adjuntos en Microsoft Graph (${r.status}).`);
  const data = await r.json();
  return (data.value || [])
    .filter((a: any) => (a['@odata.type'] || '').includes('fileAttachment'))
    .map((a: any) => ({ id: a.id, nombre: a.name || 'adjunto', tipo: a.contentType || 'application/octet-stream', tamano: a.size || 0, enLinea: !!a.isInline }));
}

// Contenido (base64) de un adjunto.
export async function descargarAdjuntoGraph(
  buzon: string,
  messageId: string,
  attachmentId: string
): Promise<{ nombre: string; tipo: string; base64: string }> {
  const token = await obtenerTokenGraph();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages/${encodeURIComponent(
    messageId
  )}/attachments/${encodeURIComponent(attachmentId)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`No se pudo descargar el adjunto (${r.status}).`);
  const a = await r.json();
  return { nombre: a.name || 'adjunto', tipo: a.contentType || 'application/octet-stream', base64: a.contentBytes || '' };
}

// Mensajes de una conversación indicando si traen adjuntos.
export async function mensajesConversacionGraph(
  buzon: string,
  conversationId: string
): Promise<(MensajeConversacionGraph & { conAdjuntos: boolean })[]> {
  const token = await obtenerTokenGraph();
  const filtro = `conversationId eq '${conversationId.replace(/'/g, "''")}'`;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages?$filter=${encodeURIComponent(
    filtro
  )}&$select=id,subject,from,receivedDateTime,sentDateTime,bodyPreview,isDraft,hasAttachments&$top=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`No se pudo leer la conversación en Microsoft Graph (${r.status}).`);
  const data = await r.json();
  return (data.value || [])
    .map((m: any) => ({
      id: m.id,
      de: m.from?.emailAddress?.address || '',
      deNombre: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
      fecha: m.receivedDateTime || m.sentDateTime,
      asunto: m.subject || '',
      resumen: m.bodyPreview || '',
      esBorrador: !!m.isDraft,
      conAdjuntos: !!m.hasAttachments,
    }))
    .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}

type MensajeBuzon = { id: string; de: string; deNombre: string; fecha: string; asunto: string; resumen: string; conAdjuntos: boolean; conversacion: string | null };
const mapMensaje = (m: any): MensajeBuzon => ({
  id: m.id,
  de: m.from?.emailAddress?.address || '',
  deNombre: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
  fecha: m.receivedDateTime || m.sentDateTime,
  asunto: m.subject || '',
  resumen: m.bodyPreview || '',
  conAdjuntos: !!m.hasAttachments,
  conversacion: m.conversationId || null,
});
const SELECCION_BUZON = 'id,subject,from,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,conversationId,isDraft';

// Mensajes del buzón que contienen un texto (asunto o cuerpo), p. ej. "APP-2600056".
// $search no se puede combinar con $filter: la fecha y el remitente se filtran después.
export async function buscarMensajesGraph(buzon: string, texto: string): Promise<MensajeBuzon[]> {
  const token = await obtenerTokenGraph();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages?$search=${encodeURIComponent(
    `"${texto.replace(/"/g, '')}"`
  )}&$select=${SELECCION_BUZON}&$top=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`No se pudo buscar en el buzón (${r.status}).`);
  const data = await r.json();
  return (data.value || []).filter((m: any) => !m.isDraft).map(mapMensaje);
}

// Mensajes con adjuntos recibidos desde una fecha (sin $orderby, ver buscarMensajeEnviado).
export async function mensajesConAdjuntosDesdeGraph(buzon: string, desdeIso: string): Promise<MensajeBuzon[]> {
  const token = await obtenerTokenGraph();
  const filtro = `receivedDateTime ge ${desdeIso} and hasAttachments eq true`;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages?$filter=${encodeURIComponent(
    filtro
  )}&$select=${SELECCION_BUZON}&$top=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`No se pudo leer el buzón (${r.status}).`);
  const data = await r.json();
  return (data.value || []).filter((m: any) => !m.isDraft).map(mapMensaje);
}
