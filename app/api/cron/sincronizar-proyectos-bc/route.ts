import { NextRequest, NextResponse } from 'next/server';
import { sincronizarProyectosNucleo } from '@/lib/sincronizar-proyectos';
import { sincronizarProveedoresNucleo } from '@/lib/sincronizar-proveedores';

export const maxDuration = 60;

// Sincronización automática de proyectos con BC (a las 9:15 y 14:15, desde Supabase
// pg_cron + pg_net; ver migración 20261023170000). Protegida con CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    // Proveedores y proyectos en la misma pasada (9:15 y 14:15).
    const proveedores = await sincronizarProveedoresNucleo().catch((e: any) => ({ error: e?.message || String(e) }));
    const r = await sincronizarProyectosNucleo('automática');
    if ('error' in r && r.error) return NextResponse.json({ ok: false, error: r.error, proveedores }, { status: 500 });
    return NextResponse.json({ ok: true, ...r, proveedores });
  } catch (e: any) {
    console.error('Error en cron sincronizar-proyectos-bc:', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error desconocido' }, { status: 500 });
  }
}
