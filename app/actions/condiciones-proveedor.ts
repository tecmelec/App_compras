'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth-guard';

// Condiciones comerciales por proveedor (pronto pago y rappel). Solo admin.

export async function guardarCondicionProveedor(datos: { proveedorId: string; prontoPago: number; rappel: number; notas: string }) {
  const user = await requireAdmin();
  const { prontoPago, rappel } = datos;
  if (![prontoPago, rappel].every((n) => Number.isFinite(n) && n >= 0 && n < 100)) {
    return { error: 'Los porcentajes deben estar entre 0 y 100.' };
  }
  const { error } = await createAdminClient()
    .from('condiciones_proveedor')
    .upsert(
      {
        proveedor_id: datos.proveedorId,
        pronto_pago_pct: prontoPago,
        rappel_pct: rappel,
        notas: datos.notas.trim().slice(0, 500) || null,
        actualizado_por: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'proveedor_id' }
    );
  if (error) return { error: 'No se pudo guardar: ' + error.message };
  revalidatePath('/admin/condiciones-comerciales');
  return { success: true };
}

export async function borrarCondicionProveedor(proveedorId: string) {
  await requireAdmin();
  const { error } = await createAdminClient().from('condiciones_proveedor').delete().eq('proveedor_id', proveedorId);
  if (error) return { error: 'No se pudo borrar: ' + error.message };
  revalidatePath('/admin/condiciones-comerciales');
  return { success: true };
}
