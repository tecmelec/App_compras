import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// ⚠️ Este cliente usa la Service Role Key y se salta RLS por completo.
// Nunca importar desde un componente cliente ni exponer esta key con NEXT_PUBLIC_.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
