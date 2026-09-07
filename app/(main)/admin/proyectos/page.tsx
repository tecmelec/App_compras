import { createClient } from '@/lib/supabase/server';
import SincronizarProyectosBoton from './SincronizarProyectosBoton';

export default async function ProyectosAdminPage() {
  const supabase = createClient();

  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id, bc_job_no, descripcion, estado')
    .order('bc_job_no');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Proyectos</h1>
      <p className="text-slate text-sm mb-6">
        Proyectos/obras sincronizados desde Business Central. Para asignarlos a un usuario, ve a{' '}
        <a href="/proyectos-equipo" className="text-acero underline">
          Proyectos de equipo
        </a>
        .
      </p>

      <SincronizarProyectosBoton />

      {!proyectos || proyectos.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay proyectos sincronizados.</p>
      ) : (
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {proyectos.map((p) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3 font-mono text-grafito">{p.bc_job_no}</td>
                  <td className="px-4 py-3 text-grafito">{p.descripcion}</td>
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
      )}
    </div>
  );
}
