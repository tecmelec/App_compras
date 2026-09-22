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
// Si Graph tarda un poco en indexarlo en Enviados, se reintenta un par de
// veces antes de rendirse — nunca lanza error: si no lo encuentra, el email
// ya salió igualmente, solo no se podrá enlazar la conversación después.
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
    if (intento > 0) await esperar(esperaMs);

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
// en indexarlo — aquí ya no hay prisa, así que con 1-2 intentos debería
// bastar siempre. Quien llama decide si actualiza el registro guardado con
// lo que se encuentre.
export async function buscarMensajeEnviadoPorAsunto(
  buzon: string,
  asunto: string
): Promise<{ messageId: string; conversationId: string | null }> {
  const token = await obtenerTokenGraph();
  return buscarMensajeEnviado(token, buzon, asunto, 2, 1000);
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
  asunto,
  cuerpo,
  cuerpoEsHtml,
  nombreArchivo,
  contenidoBase64,
}: {
  buzon: string; // email de la persona/buzón que envía (aparece como remitente real)
  destinatarios: string[];
  asunto: string;
  cuerpo: string;
  cuerpoEsHtml?: boolean;
  nombreArchivo: string;
  contenidoBase64: string;
}): Promise<{ messageId: string; conversationId: string | null }> {
  const token = await obtenerTokenGraph();

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
        body: { contentType: cuerpoEsHtml ? 'HTML' : 'Text', content: cuerpo },
        toRecipients: destinatarios.map((email) => ({ emailAddress: { address: email } })),
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: nombreArchivo,
            contentType: 'application/pdf',
            contentBytes: contenidoBase64,
          },
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
export async function obtenerConversacionGraph(
  buzon: string,
  conversationId: string
): Promise<MensajeConversacionGraph[]> {
  const token = await obtenerTokenGraph();

  const filtro = `conversationId eq '${conversationId.replace(/'/g, "''")}'`;
  const seleccion = 'id,subject,from,receivedDateTime,sentDateTime,bodyPreview,isDraft';
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    buzon
  )}/messages?$filter=${encodeURIComponent(filtro)}&$select=${seleccion}&$orderby=receivedDateTime asc&$top=50`;

  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`No se pudo leer la conversación en Microsoft Graph: ${texto}`);
  }

  const data = await respuesta.json();

  return (data.value || []).map((m: any) => ({
    id: m.id,
    de: m.from?.emailAddress?.address || '',
    deNombre: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
    fecha: m.receivedDateTime || m.sentDateTime,
    asunto: m.subject || '',
    resumen: m.bodyPreview || '',
    esBorrador: !!m.isDraft,
  }));
}
