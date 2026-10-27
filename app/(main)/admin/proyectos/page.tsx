import { textoUltimaSincronizacionProyectos } from '@/lib/ultima-sincronizacion';
import { createClient } from '@/lib/supabase/server';
import SincronizarProyectosBoton from './SincronizarProyectosBoton';
import DiagnosticoJefeObra from './DiagnosticoJefeObra';
import AprobadoresProyectos from './AprobadoresProyectos';
import { createAdminClient } from '@/lib/supabase/admin';
import ExportarExcelSimple from '@/components/ExportarExcelSimple';

export default async function ProyectosAdminPage() {
  const supabase = createClient();

  // Supabase devuelve como máximo 1.000 filas por consulta: se piden por tandas.
  const proyectos: { id: string; bc_job_no: string; descripcion: string | null; estado: string | null; tipo?: string | null }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase
      .from('proyectos')
      .select('*')
      .order('bc_job_no')
      .range(desde, desde + 999);
    proyectos.push(...((data || []) as any[]));
    if (!data || data.length < 1000) break;
  }

  // Aprobadores por proyecto y posibles aprobadores (responsables y admins activos)
  const admin = createAdminClient();
  const [{ data: asignaciones }, { data: personas }] = await Promise.all([
    admin.from('proyecto_aprobadores').select('id, proyecto_id, usuario_id'),
    admin.from('profiles').select('id, nombre_completo, rol').eq('activo', true).in('rol', ['responsable', 'admin', 'integral']).order('nombre_completo'),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Proyectos</h1>
      <p className="text-slate text-sm mb-6">
        Proyectos/obras sincronizados desde Business Central. Para asignarlos a un usuario, ve a{' '}
        <a href="/proyectos-equipo" className="text-marca underline">
          Proyectos de equipo
        </a>
        .
      </p>

      <SincronizarProyectosBoton ultima={await textoUltimaSincronizacionProyectos(supabase)} />
      <DiagnosticoJefeObra />
      <AprobadoresProyectos
        proyectos={proyectos.map(({ id, bc_job_no, descripcion }) => ({ id, bc_job_no, descripcion }))}
        personas={(personas || []).map((p: any) => ({ id: p.id, nombre: p.nombre_completo, rol: p.rol }))}
        asignaciones={(asignaciones as any[]) || []}
      />

      {!proyectos || proyectos.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay proyectos sincronizados.</p>
      ) : (
        <>
        <div className="flex justify-end mb-3">
          <ExportarExcelSimple
            nombreArchivo="Proyectos"
            nombreHoja="Proyectos"
            cabeceras={[{ titulo: 'Nº', ancho: 14 }, { titulo: 'Descripción', ancho: 50 }, { titulo: 'Tipo', ancho: 10 }, { titulo: 'Estado', ancho: 12 }]}
            filas={proyectos.map((p) => [p.bc_job_no, p.descripcion, p.tipo || '', p.estado])}
          />
        </div>
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {proyectos.map((p) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3 font-mono text-grafito">{p.bc_job_no}</td>
                  <td className="px-4 py-3 text-grafito">{p.descripcion}</td>
                  <td className="px-4 py-3">
                    {p.tipo ? (
                      <span className={p.tipo === 'Obra' ? 'text-grafito' : 'text-slate italic'} title={p.tipo === 'Obra' ? undefined : 'No se puede usar para solicitar material'}>
                        {p.tipo}
                      </span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${p.estado === 'Open' ? 'badge-entregado' : 'badge-cancelado'}`}>
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
