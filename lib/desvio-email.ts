// Desvío de emails en el entorno de PRUEBAS.
// Si la variable EMAIL_DESVIO_PRUEBAS tiene una dirección (solo se define en el
// entorno Preview de Vercel), TODOS los emails que envía la app van a esa
// dirección en vez de a los destinatarios reales (proveedores, compradores...).
// Se añade un aviso al principio del cuerpo con los destinatarios originales.
// El asunto NO se toca (la app lo usa para localizar el mensaje en Outlook).

export type Desvio = { to: string[]; cc: string[]; avisoHtml: string };

export function aplicarDesvioEmail(to: string[], cc: string[] = []): Desvio {
  const desvio = (process.env.EMAIL_DESVIO_PRUEBAS || '').trim();
  if (!desvio) return { to, cc, avisoHtml: '' };

  const lista = (xs: string[]) => (xs.length ? xs.join(', ') : '—');
  const avisoHtml = `
    <div style="margin:0 0 16px;padding:10px 12px;background:#FDF2E3;border:1px solid #F2D9AE;border-radius:6px;color:#8A5A15;font-family:sans-serif;font-size:13px;">
      <strong>ENTORNO DE PRUEBAS</strong> — este email no se ha enviado a sus destinatarios reales.<br/>
      Para: ${lista(to)}<br/>
      CC: ${lista(cc)}
    </div>`;

  return { to: [desvio], cc: [], avisoHtml };
}
