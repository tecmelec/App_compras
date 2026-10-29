'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { COOKIE_RECORDAR } from '@/lib/supabase/sesion';

export async function login(formData: FormData) {
  // "Recuérdame": marcado = sesión persistente; sin marcar = se cierra al cerrar el navegador.
  const recordar = formData.get('recordar') === 'on';
  const supabase = createClient({ recordar });
  cookies().set(COOKIE_RECORDAR, recordar ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    ...(recordar ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=' + encodeURIComponent('Usuario o contraseña incorrectos'));
  }

  redirect('/tienda');
}
