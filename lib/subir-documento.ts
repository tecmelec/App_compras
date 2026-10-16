'use client';

import { createClient } from '@/lib/supabase/client';
import { prepararSubidaDocumento } from '@/app/actions/documentos-solicitud';
import { BUCKET_DOCUMENTOS, EXTENSIONES_DOCUMENTO, MAX_DOCUMENTO_BYTES, extensionDe } from '@/lib/documentos-solicitud';

// Sube un documento directamente a Storage con URL firmada (sin pasar por Vercel).
// Devuelve la ruta para registrarlo después, o un error legible.
export async function subirDocumento(archivo: File): Promise<{ ruta: string } | { error: string }> {
  if (!EXTENSIONES_DOCUMENTO.includes(extensionDe(archivo.name))) {
    return { error: `"${archivo.name}": tipo de archivo no admitido.` };
  }
  if (archivo.size > MAX_DOCUMENTO_BYTES) return { error: `"${archivo.name}" supera el máximo de 25 MB.` };
  const prep = await prepararSubidaDocumento(archivo.name, archivo.size);
  if ('error' in prep && prep.error) return { error: prep.error };
  const { ruta, token } = prep as { ruta: string; token: string };
  const { error } = await createClient()
    .storage.from(BUCKET_DOCUMENTOS)
    .uploadToSignedUrl(ruta, token, archivo, { contentType: archivo.type || 'application/octet-stream' });
  if (error) return { error: `"${archivo.name}": no se pudo subir (${error.message}).` };
  return { ruta };
}
