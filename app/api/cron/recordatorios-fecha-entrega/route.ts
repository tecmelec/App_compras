import { NextRequest, NextResponse } from 'next/server';
import { enviarRecordatoriosFechaEntrega } from '@/lib/recordatorio-fecha-entrega';

// Recordatorio de fecha de entrega a proveedores (un email, el día laborable siguiente
// al envío del pedido, si aún no han indicado la fecha). Programado en vercel.json.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    const resultado = await enviarRecordatoriosFechaEntrega();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    console.error('Error en cron recordatorios-fecha-entrega:', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error desconocido' }, { status: 500 });
  }
}
