import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { COOKIE_RECORDAR, opcionesCookieSesion, recordarSesion } from '@/lib/supabase/sesion';

type CookieToSet = { name: string; value: string; options?: CookieOptionsWithName };

export function createClient(opciones?: { recordar?: boolean }) {
  const cookieStore = cookies();
  // "Recuérdame": en el login se indica a mano; en el resto se lee de la cookie de preferencia.
  const recordar = opciones?.recordar ?? recordarSesion(cookieStore.get(COOKIE_RECORDAR)?.value);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, opcionesCookieSesion(name, value, options, recordar))
            );
          } catch {
            // se llama desde un Server Component; el middleware refresca la sesión igualmente
          }
        },
      },
    }
  );
}
