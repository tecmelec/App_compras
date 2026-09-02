import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

type ItemEmail = { nombre: string; cantidad: number };

export async function enviarEmailSolicitud({
  destinatarios,
  solicitante,
  numeroApp,
  items,
}: {
  destinatarios: string[];
  solicitante: string;
  numeroApp: string;
  items: ItemEmail[];
}) {
  if (destinatarios.length === 0) return;

  const filas = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #DDE1E0;">${i.nombre}</td><td style="padding:6px 12px;border-bottom:1px solid #DDE1E0;text-align:center;">${i.cantidad}</td></tr>`
    )
    .join('');

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Tecmelec <notificaciones@tecmelec.com>',
    to: destinatarios,
    subject: `Nueva solicitud de materiales — ${numeroApp}`,
    html: `
      <div style="font-family: sans-serif; color:#1C2126;">
        <p><strong>${solicitante}</strong> ha solicitado los siguientes materiales.</p>
        <p>Nº de pedido APP: <strong>${numeroApp}</strong></p>
        <table style="border-collapse:collapse;width:100%;max-width:480px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1C2126;">Artículo</th>
              <th style="text-align:center;padding:6px 12px;border-bottom:2px solid #1C2126;">Cantidad</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <p style="margin-top:16px;">Ingresa a la plataforma para asignar el número de pedido Tecmelec y la fecha estimada de entrega.</p>
      </div>
    `,
  });
}
