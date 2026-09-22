import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptionsWithName };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/tienda';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  // api/cron/* queda fuera: lo llama el cron de Vercel sin sesión de usuario
  // (se autentica con CRON_SECRET dentro de la propia ruta), así que si pasa
  // por aquí primero, este middleware lo redirige a /login antes de que el
  // código de la ruta llegue a comprobar ese secreto.
  // proveedor/* queda fuera: es la página pública (sin login) que abre el
  // proveedor desde el enlace del email o el enlace copiado, para indicar la
  // fecha de entrega; se identifica por el token de la URL, no por sesión.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|proveedor).*)'],
};
