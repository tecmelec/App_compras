'use server';

import { createClient } from '@/lib/supabase/server';
import { construirPedidoCompraPdf } from '@/lib/pdf/generar-pedido-pdf';
import { enviarPedidoCompraPorEmail } from '@/lib/email';

export async function enviarPedidoPorEmail(numeroTecmelec: string, conFotos: boolean) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'No autenticado.' };
  }

  try {
    const resultado = await construirPedidoCompraPdf(numeroTecmelec, conFotos);
    if (!resultado) {
      return { error: 'Pedido no encontrado.' };
    }
    if (resultado.proveedorEmails.length === 0) {
      return { error: 'El proveedor no tiene ningún email registrado en la ficha de Business Central.' };
    }

    await enviarPedidoCompraPorEmail({
      destinatarios: resultado.proveedorEmails,
      numeroTecmelec,
      proveedorNombre: resultado.proveedorNombre,
      pdfBuffer: resultado.buffer,
      nombreArchivo: `Pedido_compra_${numeroTecmelec}${conFotos ? '_con_fotos' : ''}.pdf`,
    });

    return { success: true, destinatarios: resultado.proveedorEmails };
  } catch (e: any) {
    return { error: e.message || 'No se pudo enviar el email.' };
  }
}
