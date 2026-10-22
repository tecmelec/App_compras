import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

// Comprador IA — Fase 1, paso 4: métricas de "Proponer compra" a partir de lo registrado
// en propuestas_compra (qué se propuso y qué hizo el comprador) y peticiones_oferta.

const ORIGENES: Record<string, string> = {
  presupuesto: 'Presupuesto de la solicitud',
  presupuesto_otra: 'Presupuesto de otra solicitud',
  compra_reciente: 'Compra reciente en BC',
  compra_antigua: 'Compra antigua en BC',
  catalogo: 'Catálogo / proveedor predeterminado',
  pedir_oferta: 'Pedir oferta (sin datos)',
};

type Cuenta = { total: number; aceptada: number; modificada: number; descartada: number; cambiadaDespues: number; desv: number[] };
const nueva = (): Cuenta => ({ total: 0, aceptada: 0, modificada: 0, descartada: 0, cambiadaDespues: 0, desv: [] });
const pctTxt = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export default async function MetricasPropuestaPage({ searchParams }: { searchParams: { dias?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user!.id).single();
  if (perfil?.rol !== 'admin') redirect('/');

  const dias = ['30', '90', '0'].includes(searchParams.dias || '') ? Number(searchParams.dias) : 30;
  const desde = dias ? new Date(Date.now() - dias * 86400000).toISOString() : '2000-01-01';
  const admin = createAdminClient();

  const { data: propuestas, error } = await admin
    .from('propuestas_compra')
    .select('id, pedido_id, resultado, aplicado_en, ia, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(2000);
  const { data: peticiones } = await admin.from('peticiones_oferta').select('id, sugerido').gte('enviado_en', desde).limit(5000);

  const aplicadas = (propuestas || []).filter((p: any) => p.aplicado_en && Array.isArray(p.resultado));
  // Líneas que, tras aplicarlas, el comprador cambió después a mano (ya no tienen la marca).
  const idsAplicados = aplicadas.flatMap((p: any) => (p.resultado as any[]).filter((r) => r.aplicado).map((r) => r.itemId));
  const marcaActual = new Map<string, string | null>();
  for (let k = 0; k < idsAplicados.length; k += 200) {
    const { data } = await admin.from('pedido_items').select('id, propuesta_compra_id').in('id', idsAplicados.slice(k, k + 200));
    for (const d of data || []) marcaActual.set((d as any).id, (d as any).propuesta_compra_id);
  }

  const porOrigen = new Map<string, Cuenta>();
  const porConfianza = new Map<string, Cuenta>();
  const global = nueva();
  let lineasRevisarIA = 0;
  let lineasIA = 0;
  for (const p of aplicadas as any[]) {
    for (const r of p.resultado as any[]) {
      const claves: [Map<string, Cuenta>, string][] = [
        [porOrigen, r.origen || 'pedir_oferta'],
        [porConfianza, r.confianza || 'sin datos'],
      ];
      const cuentas = [global, ...claves.map(([m, k]) => (m.get(k) || (m.set(k, nueva()), m.get(k)!)))];
      for (const c of cuentas) {
        c.total++;
        c[r.estado as 'aceptada' | 'modificada' | 'descartada']++;
        if (r.aplicado && marcaActual.has(r.itemId) && marcaActual.get(r.itemId) !== p.id) c.cambiadaDespues++;
        if (r.estado === 'modificada' && r.propuesto?.precio > 0 && r.aplicado?.precio != null) {
          c.desv.push(Math.abs(r.aplicado.precio - r.propuesto.precio) / r.propuesto.precio);
        }
      }
    }
    const notas = (p.ia?.lineas || []) as any[];
    lineasIA += (p.resultado as any[]).length;
    lineasRevisarIA += notas.filter((n) => n.revisar).length;
  }

  // Criterio para la fase 2 (propuesta): ≥ 90 % de las líneas de confianza alta aceptadas sin cambios.
  const alta = porConfianza.get('alta') || nueva();
  const tasaAlta = alta.total ? (alta.aceptada - alta.cambiadaDespues) / alta.total : null;

  const Tabla = ({ titulo, mapa, nombres }: { titulo: string; mapa: Map<string, Cuenta>; nombres?: Record<string, string> }) => (
    <div className="bg-white border border-borde rounded-lg p-4 mb-6 overflow-x-auto">
      <h2 className="font-medium text-grafito mb-2">{titulo}</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate">
          <tr className="text-left">
            <th className="py-1 pr-3 font-medium"></th>
            <th className="py-1 px-2 font-medium text-right">Líneas</th>
            <th className="py-1 px-2 font-medium text-right">Aceptadas tal cual</th>
            <th className="py-1 px-2 font-medium text-right">Modificadas</th>
            <th className="py-1 px-2 font-medium text-right">Descartadas</th>
            <th className="py-1 px-2 font-medium text-right">Cambiadas después</th>
            <th className="py-1 px-2 font-medium text-right">Desv. precio (modif.)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {Array.from(mapa.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .map(([k, c]) => (
              <tr key={k}>
                <td className="py-1.5 pr-3 text-grafito">{nombres?.[k] || k.charAt(0).toUpperCase() + k.slice(1)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{c.total}</td>
                <td className="py-1.5 px-2 text-right font-mono">
                  {c.aceptada} <span className="text-slate">({pctTxt(c.aceptada, c.total)})</span>
                </td>
                <td className="py-1.5 px-2 text-right font-mono">{c.modificada}</td>
                <td className="py-1.5 px-2 text-right font-mono">{c.descartada}</td>
                <td className="py-1.5 px-2 text-right font-mono">{c.cambiadaDespues}</td>
                <td className="py-1.5 px-2 text-right font-mono">
                  {media(c.desv) == null ? '—' : `${(media(c.desv)! * 100).toFixed(1)} %`}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Métricas de la propuesta de compra</h1>
      <p className="text-slate text-sm mb-4">
        Cuánto acierta &quot;Proponer compra&quot;: lo que se propuso frente a lo que hizo el comprador. &quot;Cambiadas después&quot; son líneas
        aplicadas cuyo precio se cambió luego a mano.
      </p>
      <div className="flex gap-2 mb-6 text-sm">
        {[
          ['30', 'Últimos 30 días'],
          ['90', 'Últimos 90 días'],
          ['0', 'Todo'],
        ].map(([v, t]) => (
          <Link
            key={v}
            href={`/admin/propuesta-compra?dias=${v}`}
            className={`px-3 py-1.5 rounded-md border ${String(dias) === v ? 'bg-marca text-white border-marca' : 'border-borde text-grafito hover:bg-fondo'}`}
          >
            {t}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-rojo">Falta aplicar la migración de la propuesta de compra en la base de datos.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              ['Propuestas calculadas', String((propuestas || []).length)],
              ['Propuestas aplicadas', `${aplicadas.length} (${pctTxt(aplicadas.length, (propuestas || []).length)})`],
              ['Líneas aceptadas tal cual', `${global.aceptada} de ${global.total} (${pctTxt(global.aceptada, global.total)})`],
              ['Peticiones de oferta', `${(peticiones || []).length} (${(peticiones || []).filter((p: any) => !p.sugerido).length} a mano)`],
            ].map(([t, v]) => (
              <div key={t} className="bg-white border border-borde rounded-lg p-3">
                <p className="text-xs text-slate">{t}</p>
                <p className="text-lg font-semibold text-grafito">{v}</p>
              </div>
            ))}
          </div>

          <div
            className={`rounded-lg border p-4 mb-6 ${
              tasaAlta != null && tasaAlta >= 0.9 ? 'bg-[#D1FAE5] border-[#A7E3C4]' : 'bg-white border-borde'
            }`}
          >
            <p className="text-sm font-medium text-grafito">Criterio para la fase 2 (confianza alta)</p>
            <p className="text-sm text-slate">
              {tasaAlta == null
                ? 'Aún no hay líneas de confianza alta aplicadas en este periodo.'
                : `${Math.round(tasaAlta * 100)} % de las ${alta.total} líneas de confianza alta se aceptaron tal cual y no se cambiaron después (objetivo: 90 % durante 6 semanas).`}
            </p>
            {lineasIA > 0 && (
              <p className="text-xs text-slate mt-1">
                La IA marcó &quot;revisar&quot; en {lineasRevisarIA} de {lineasIA} líneas ({pctTxt(lineasRevisarIA, lineasIA)}).
              </p>
            )}
          </div>

          <Tabla titulo="Por origen del dato" mapa={porOrigen} nombres={ORIGENES} />
          <Tabla titulo="Por confianza" mapa={porConfianza} />
        </>
      )}
    </div>
  );
}
