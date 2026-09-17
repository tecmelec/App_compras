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

// Crea el mensaje como borrador y luego lo envía (en vez de usar /sendMail
// directamente), porque así Graph nos devuelve el Nº de mensaje y el Nº de
// conversación — los necesitamos para poder recuperar después el hilo
// completo (incluidas las respuestas del proveedor).
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
  const headersComunes = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const urlCrear = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages`;
  const respuestaCrear = await fetch(urlCrear, {
    method: 'POST',
    headers: headersComunes,
    body: JSON.stringify({
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
    }),
  });

  if (!respuestaCrear.ok) {
    const texto = await respuestaCrear.text();
    throw new Error(`Microsoft Graph rechazó la creación del email: ${texto}`);
  }

  const mensajeCreado = await respuestaCrear.json();

  const urlEnviar = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/messages/${mensajeCreado.id}/send`;
  const respuestaEnviar = await fetch(urlEnviar, {
    method: 'POST',
    headers: headersComunes,
  });

  if (!respuestaEnviar.ok) {
    const texto = await respuestaEnviar.text();
    throw new Error(`Microsoft Graph rechazó el envío: ${texto}`);
  }

  return { messageId: mensajeCreado.id, conversationId: mensajeCreado.conversationId || null };
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
