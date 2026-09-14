import { NextRequest, NextResponse } from 'next/server';
import { sincronizarPedidosAbiertosConBC } from '@/app/actions/business-central';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const resultado = await sincronizarPedidosAbiertosConBC();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    console.error('Error en cron sincronizar-pedidos-bc:', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error desconocido' }, { status: 500 });
  }
}
