import { NextRequest, NextResponse } from 'next/server';
import { enviarRecordatoriosFechaEntrega } from '@/lib/recordatorio-fecha-entrega';
import { createClient } from '@/lib/supabase/server';

// Recordatorio de fecha de entrega a proveedores (un email, el día laborable siguiente
// al envío del pedido, si aún no han indicado la fecha). Programado en vercel.json.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const esCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  // También se puede lanzar a mano abriendo esta dirección con la sesión de un admin
  // (útil para probarlo en la Preview, donde Vercel no ejecuta los crons).
  let esAdmin = false;
  if (!esCron) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
      esAdmin = perfil?.rol === 'admin';
    }
  }
  if (!esCron && !esAdmin) {
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
