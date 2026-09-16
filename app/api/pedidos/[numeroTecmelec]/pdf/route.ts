import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { construirPedidoCompraPdf } from '@/lib/pdf/generar-pedido-pdf';

export async function GET(request: NextRequest, { params }: { params: { numeroTecmelec: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse('No autenticado.', { status: 401 });
    }

    const conFotos = request.nextUrl.searchParams.get('fotos') === '1';
    const numeroTecmelec = decodeURIComponent(params.numeroTecmelec);
    const resultado = await construirPedidoCompraPdf(numeroTecmelec, conFotos);

    if (!resultado) {
      return new NextResponse('Pedido no encontrado.', { status: 404 });
    }

    return new NextResponse(new Uint8Array(resultado.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Pedido_compra_${numeroTecmelec}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error('Error generando PDF de pedido:', e);
    return NextResponse.json(
      { error: e?.message || 'Error desconocido', stack: e?.stack || null },
      { status: 500 }
    );
  }
}
