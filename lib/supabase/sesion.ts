// "Recuérdame" del login. Las cookies de sesión de Supabase (sb-…) son persistentes por
// defecto. Si el usuario NO marca "Recuérdame", se guardan como cookies de sesión (se
// borran al cerrar el navegador). La preferencia viaja en la cookie `tm_recordar`:
//   '0' = no recordar · cualquier otro valor o ausente = recordar (así las sesiones
//   iniciadas antes de existir esta opción siguen como estaban).
export const COOKIE_RECORDAR = 'tm_recordar';

export function recordarSesion(valorCookie: string | undefined | null): boolean {
  return valorCookie !== '0';
}

export function opcionesCookieSesion<T extends Record<string, any> | undefined>(nombre: string, valor: string, options: T, recordar: boolean): T {
  if (recordar || !nombre.startsWith('sb-')) return options;
  // Borrado de la cookie (cerrar sesión): se deja tal cual para que caduque de verdad.
  const borra =
    valor === '' ||
    options?.maxAge === 0 ||
    (options?.expires !== undefined && new Date(options.expires as any).getTime() <= Date.now());
  if (borra) return options;
  // Sin maxAge ni expires: cookie de sesión (se borra al cerrar el navegador).
  const { maxAge: _m, expires: _e, ...resto } = (options || {}) as Record<string, any>;
  return resto as T;
}
