import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generarComparativoExcel } from '@/lib/comparativo-excel';
import { accesoComprasPedido } from '@/lib/acceso-compras';

export const dynamic = 'force-dynamic';

// Descarga el comparativo de ofertas (Excel) de una solicitud. Solo comprador/admin.
export async function GET(_req: Request, { params }: { params: { pedidoId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !['comprador', 'admin', 'integral'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }
  if (!(await accesoComprasPedido(params.pedidoId))) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  const r = await generarComparativoExcel(params.pedidoId);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(r.nombre)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
