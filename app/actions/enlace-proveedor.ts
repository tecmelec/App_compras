'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

function construirBaseUrl(): string {
  const h = headers();
  const host = h.get('host');
  const protocolo = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocolo}://${host}`;
}

// Genera (o reutiliza, si ya existe uno) un enlace público para que el
// proveedor indique la fecha de entrega de este Pedido Tecmelec, sin
// necesidad de enviarle un email desde la app (p. ej. para pasarlo por
// WhatsApp o teléfono). Usa la misma página pública /proveedor/pedido/[token]
// que ya usan los enlaces incluidos en los emails.
export async function generarEnlaceProveedor(numeroTecmelec: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No autenticado.' };
  }

  const { data: token, error } = await supabase.rpc('crear_enlace_proveedor', {
    p_numero_tecmelec: numeroTecmelec,
  });

  if (error) {
    return { error: error.message || 'No se pudo generar el enlace.' };
  }

  return { success: true, url: `${construirBaseUrl()}/proveedor/pedido/${token}` };
}
