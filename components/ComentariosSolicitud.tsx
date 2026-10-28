import { createAdminClient } from '@/lib/supabase/admin';

// "Comentarios al comprador" del solicitante, resaltado en naranja encima de los
// documentos adjuntos. Solo aparece si hay comentarios. Se monta en páginas que ya han
// comprobado el acceso a la solicitud.
export default async function ComentariosSolicitud({ pedidoId }: { pedidoId: string }) {
  const { data } = await createAdminClient()
    .from('pedidos')
    .select('*, profiles!pedidos_usuario_id_fkey(nombre_completo)')
    .eq('id', pedidoId)
    .maybeSingle();
  const texto = ((data as any)?.comentarios_comprador || '').trim();
  const textoAprobador = ((data as any)?.comentarios_aprobador || '').trim();
  const autorAprobador = (data as any)?.comentarios_aprobador_por;
  if (!texto && !textoAprobador) return null;
  const autor = (data as any)?.profiles?.nombre_completo;

  return (
    <section className="bg-[#FFF4E5] border border-[#F5B971] rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-[#9A4D00] mb-1 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Comentarios al comprador
        {autor && texto && <span className="font-normal text-xs text-[#9A4D00]/80">· {autor}</span>}
      </h2>
      {texto && <p className="text-sm text-grafito whitespace-pre-line break-words">{texto}</p>}
      {textoAprobador && (
        <div className={texto ? 'mt-3 pt-3 border-t border-[#F5B971]/60' : ''}>
          <p className="text-xs font-semibold text-[#9A4D00] mb-0.5">Del aprobador{autorAprobador ? ` · ${autorAprobador}` : ''}</p>
          <p className="text-sm text-grafito whitespace-pre-line break-words">{textoAprobador}</p>
        </div>
      )}
    </section>
  );
}
