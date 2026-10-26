import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

// Administración → preguntas al asistente (para mejorar la guía).
export default async function AsistenteAdminPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const filtro = searchParams.filtro === 'negativas' ? 'negativas' : 'todas';
  let q = createAdminClient()
    .from('asistente_mensajes')
    .select('id, rol, ruta, pregunta, respuesta, valoracion, created_at, profiles(nombre_completo)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtro === 'negativas') q = q.eq('valoracion', -1);
  const { data, error } = await q;
  const fecha = (f: string) => new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Preguntas al asistente</h1>
      <p className="text-slate text-sm mb-4">Últimas 200 preguntas con su respuesta y valoración, para ver qué no se entiende de la app y mejorar la guía.</p>
      <div className="flex gap-2 mb-4 text-sm">
        {[
          ['todas', 'Todas'],
          ['negativas', 'Solo 👎'],
        ].map(([v, t]) => (
          <Link
            key={v}
            href={`/admin/asistente?filtro=${v}`}
            className={`px-3 py-1.5 rounded-md border ${filtro === v ? 'bg-marca text-white border-marca' : 'border-borde text-grafito hover:bg-fondo'}`}
          >
            {t}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-rojo">Falta aplicar la migración del asistente (20261024130000) en la base de datos.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate">Aún no hay preguntas.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((m: any) => (
            <li key={m.id} className="bg-white border border-borde rounded-lg p-3">
              <p className="text-xs text-slate">
                {fecha(m.created_at)} · {m.profiles?.nombre_completo || '—'} ({m.rol}) · {m.ruta || '—'}{' '}
                {m.valoracion === 1 ? '· 👍' : m.valoracion === -1 ? '· 👎' : ''}
              </p>
              <p className="text-sm font-medium text-grafito mt-1">{m.pregunta}</p>
              <details className="mt-1">
                <summary className="text-xs text-marca cursor-pointer">Ver respuesta</summary>
                <p className="text-sm text-grafito whitespace-pre-line mt-1">{m.respuesta}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
