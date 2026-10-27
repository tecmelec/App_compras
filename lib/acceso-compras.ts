import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ¿Puede quien está conectado gestionar como compras esta solicitud?
// Comprador y admin: cualquiera. Integral: solo las suyas (las crea o es su comprador).
export async function accesoComprasPedido(pedidoId: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo) return false;
  if (perfil.rol === 'comprador' || perfil.rol === 'admin') return true;
  if (perfil.rol !== 'integral') return false;
  const { data: p } = await createAdminClient().from('pedidos').select('usuario_id, comprador_id').eq('id', pedidoId).maybeSingle();
  return !!p && (p.usuario_id === user.id || p.comprador_id === user.id);
}
