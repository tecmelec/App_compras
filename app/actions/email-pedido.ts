'use server';

import { createClient } from '@/lib/supabase/server';
import { construirPedidoCompraPdf } from '@/lib/pdf/generar-pedido-pdf';
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
    const resultado = await construirPedidoCompraPdf(numeroTecmelec, conFotos);
    if (!resultado) {
      return { error: 'Pedido no encontrado.' };
    }

    await enviarPedidoCompraPorEmail({
      destinatarios,
      numeroTecmelec,
      proveedorNombre: resultado.proveedorNombre,
      pdfBuffer: resultado.buffer,
      nombreArchivo: `Pedido_compra_${numeroTecmelec}${conFotos ? '_con_fotos' : ''}.pdf`,
      mensaje,
    });

    return { success: true, destinatarios };
  } catch (e: any) {
    return { error: e.message || 'No se pudo enviar el email.' };
  }
}
