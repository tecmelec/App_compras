'use server';

import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { enviarPedidoCompraPorEmail } from '@/lib/email';
import { obtenerFichaProveedorPorNumeroBC } from '@/lib/business-central';

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
  const h = headers();
  const host = h.get('host');
  const protocolo = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  const query = conFotos ? '?fotos=1' : '';
  const url = `${protocolo}://${host}/api/pedidos/${encodeURIComponent(numeroTecmelec)}/pdf${query}`;

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

  if (destinatarios.length === 0) {
    return { error: 'Añade al menos un destinatario.' };
  }

  try {
    const pdfBuffer = await pedirPdfPorHttp(numeroTecmelec, conFotos);

    await enviarPedidoCompraPorEmail({
      destinatarios,
      numeroTecmelec,
      proveedorNombre: '',
      pdfBuffer,
      nombreArchivo: `Pedido_compra_${numeroTecmelec}${conFotos ? '_con_fotos' : ''}.pdf`,
      mensaje,
      replyTo: user.email,
    });

    return { success: true, destinatarios };
  } catch (e: any) {
    return { error: e.message || 'No se pudo enviar el email.' };
  }
}
