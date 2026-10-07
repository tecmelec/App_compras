import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Fotos de albaranes subidas desde la app "Alb. Tecmelec" (tabla photo_ocr y
// bucket "Fotos albaranes" del mismo proyecto de Supabase). Se enlazan con la
// Tienda por el Nº de Pedido Tecmelec (photo_ocr.pedido_compra).
//
// photo_ocr se puede leer con la clave pública (anon) y el bucket es público,
// igual que en la PWA. Se consulta desde el servidor y solo para los Pedidos
// Tecmelec de una solicitud que el usuario ya puede ver (comprobado por RLS).
//
// Por defecto usa el mismo proyecto que la Tienda. En la vista previa (que usa
// la base de PRUEBAS, sin photo_ocr) se puede apuntar a la base real con
// ALBARANES_SUPABASE_URL y ALBARANES_SUPABASE_ANON_KEY.

const BUCKET = 'Fotos albaranes';

export type FotoAlbaran = {
  nombre: string;
  fecha: string; // ISO
  url: string; // original
  miniatura: string; // versión reducida
};

function urlPublica(base: string, fileName: string, transformar?: string) {
  const ruta = `${encodeURIComponent(BUCKET)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;
  return transformar
    ? `${base}/storage/v1/render/image/public/${ruta}?${transformar}`
    : `${base}/storage/v1/object/public/${ruta}`;
}

export async function obtenerFotosAlbaranes(numerosTecmelec: string[]): Promise<Record<string, FotoAlbaran[]>> {
  const numeros = Array.from(new Set(numerosTecmelec.map((n) => (n || '').trim().toUpperCase()).filter(Boolean)));
  const resultado: Record<string, FotoAlbaran[]> = {};
  if (!numeros.length) return resultado;

  try {
    const base = process.env.ALBARANES_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const clave = process.env.ALBARANES_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const cliente = createSupabaseClient(base, clave, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await cliente
      .from('photo_ocr')
      .select('file_name, created_at, pedido_compra')
      .in('pedido_compra', numeros)
      .order('created_at');
    if (error || !data) return resultado;

    for (const f of data as { file_name: string; created_at: string; pedido_compra: string }[]) {
      if (!/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.file_name)) continue;
      const clave = (f.pedido_compra || '').trim().toUpperCase();
      (resultado[clave] ||= []).push({
        nombre: f.file_name,
        fecha: f.created_at,
        url: urlPublica(base, f.file_name),
        miniatura: urlPublica(base, f.file_name, 'width=320&height=320&resize=cover&quality=70'),
      });
    }
  } catch {
    // Si falla la consulta, simplemente no se muestran fotos.
  }
  return resultado;
}
