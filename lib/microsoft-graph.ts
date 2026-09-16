// Envía emails a través de Microsoft Graph (Outlook / Microsoft 365), usando
// el mismo registro de app de Azure AD que ya se usa para Business Central
// (mismo tenant/client id/secret), pero pidiendo un token para el recurso de
// Graph en vez del de Business Central.
//
// Requiere en Azure AD, sobre esa misma app:
//   - Permiso de aplicación "Mail.Send" de Microsoft Graph, con Admin consent.
//   - (Recomendado) una política de acceso de aplicación en Exchange Online
//     que limite qué buzones puede usar esta app para enviar correo.

let tokenCache: { token: string; expira: number } | null = null;

async function obtenerTokenGraph(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const tenantId = process.env.BC_TENANT_ID!;
  const clientId = process.env.BC_CLIENT_ID!;
  const clientSecret = process.env.BC_CLIENT_SECRET!;

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

export async function enviarEmailConAdjuntoGraph({
  buzon,
  destinatarios,
  asunto,
  cuerpo,
  nombreArchivo,
  contenidoBase64,
}: {
  buzon: string; // email de la persona/buzón que envía (aparece como remitente real)
  destinatarios: string[];
  asunto: string;
  cuerpo: string;
  nombreArchivo: string;
  contenidoBase64: string;
}) {
  const token = await obtenerTokenGraph();

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(buzon)}/sendMail`;

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: asunto,
        body: { contentType: 'Text', content: cuerpo },
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

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`Microsoft Graph rechazó el envío: ${texto}`);
  }
}
