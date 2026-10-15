import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_DOCUMENTOS, extensionDe, tamanoLegible } from '@/lib/documentos-solicitud';

// Documentos adjuntos a la solicitud (desde el carrito). Se sirven con URL firmada de
// 1 hora. Solo se monta en páginas que ya han comprobado el acceso a la solicitud.
const SE_VEN_EN_NAVEGADOR = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt'];

export default async function DocumentosSolicitud({ pedidoId }: { pedidoId: string }) {
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from('solicitud_documentos')
    .select('id, ruta, nombre, tamano, created_at, profiles(nombre_completo)')
    .eq('pedido_id', pedidoId)
    .order('created_at');
  if (!docs || docs.length === 0) return null;

  const conUrl = await Promise.all(
    docs.map(async (d: any) => {
      const verEnNavegador = SE_VEN_EN_NAVEGADOR.includes(extensionDe(d.nombre));
      const { data } = await admin.storage
        .from(BUCKET_DOCUMENTOS)
        .createSignedUrl(d.ruta, 60 * 60, verEnNavegador ? undefined : { download: d.nombre });
      return { ...d, url: data?.signedUrl || null };
    })
  );

  return (
    <section className="bg-white border border-borde rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-grafito mb-2">
        Documentos adjuntos <span className="text-slate font-normal">({conUrl.length})</span>
      </h2>
      <ul className="divide-y divide-borde">
        {conUrl.map((d: any) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
            <span aria-hidden>📄</span>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-marca hover:underline break-all">
                {d.nombre}
              </a>
            ) : (
              <span className="text-grafito break-all">{d.nombre}</span>
            )}
            <span className="text-xs text-slate">
              {tamanoLegible(d.tamano)}
              {d.profiles?.nombre_completo ? ` · ${d.profiles.nombre_completo}` : ''} · {new Date(d.created_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
