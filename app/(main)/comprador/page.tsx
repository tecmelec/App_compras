import { createClient } from '@/lib/supabase/server';
import SolicitudesFiltrables, { type PedidoFila } from '@/components/SolicitudesFiltrables';
import { numerosTecmelecTexto, idsEfectivos } from '@/lib/pedidos-utils';
import SincronizarTodasBCBoton from './SincronizarTodasBCBoton';

export default async function CompradorPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ids = await idsEfectivos(supabase, user!.id);

  // Los compradores ven las solicitudes de TODOS los compradores; las suyas
  // (o las de quien sustituyen) se marcan como "Asignada a mí".
  // Supabase devuelve como máximo 1.000 filas por consulta: se pide por tramos.
  const pedidos: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase
      .from('pedidos')
      .select(
        'id, numero_app, created_at, total_estimado, requiere_aprobacion, aprobado, estado_general, usuario_id, comprador_id, proyectos(bc_job_no, descripcion), profiles!pedidos_usuario_id_fkey(nombre_completo), comprador:profiles!pedidos_comprador_id_fkey(nombre_completo), pedido_items(numero_tecmelec)'
      )
      .order('created_at', { ascending: false })
      .range(desde, desde + 999);
    pedidos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const [{ data: guardado }, { data: perfiles }] = await Promise.all([
    supabase.from('filtros_rapidos_solicitudes').select('solicitantes, obras').eq('usuario_id', user!.id).maybeSingle(),
    supabase
      .from('profiles')
      .select('id, nombre_completo')
      .in('rol', ['usuario', 'comprador', 'responsable', 'admin'])
      .order('nombre_completo'),
  ]);

  // "PDF enviado" por solicitud: Sí solo si TODOS sus Pedidos Tecmelec tienen
  // el check marcado en "Gestión de pedidos"; null si aún no tiene ninguno.
  const numerosTecmelecPorPedido = new Map<string, string[]>(
    (pedidos || []).map((p: any) => [
      p.id,
      Array.from(new Set((p.pedido_items || []).map((i: any) => i.numero_tecmelec).filter(Boolean))) as string[],
    ])
  );
  const todosLosNumeros = Array.from(new Set(Array.from(numerosTecmelecPorPedido.values()).flat()));
  const marcasPdf: { numero_tecmelec: string; pdf_enviado: boolean }[] = [];
  for (let i = 0; i < todosLosNumeros.length; i += 200) {
    const { data } = await supabase
      .from('pedido_compra_pdf_enviado')
      .select('numero_tecmelec, pdf_enviado')
      .in('numero_tecmelec', todosLosNumeros.slice(i, i + 200));
    marcasPdf.push(...((data as any[]) || []));
  }
  const numerosConPdfEnviado = new Set(
    (marcasPdf || []).filter((m: any) => m.pdf_enviado).map((m: any) => m.numero_tecmelec as string)
  );

  const filas: PedidoFila[] = (pedidos || []).map((p: any) => ({
    id: p.id,
    numero_app: p.numero_app,
    numero_tecmelec: numerosTecmelecTexto(p.pedido_items),
    nro_obra: p.proyectos?.bc_job_no || '',
    nombre_obra: p.proyectos?.descripcion || '',
    solicitante: p.profiles?.nombre_completo || '—',
    solicitante_id: p.usuario_id,
    comprador: p.comprador?.nombre_completo || (p.comprador_id ? '—' : 'Sin asignar'),
    asignada_a_mi: !!p.comprador_id && ids.includes(p.comprador_id),
    total_estimado: p.total_estimado || 0,
    requiere_aprobacion: p.requiere_aprobacion,
    aprobado: p.aprobado,
    estado: p.estado_general || null,
    pdf_enviado: (() => {
      const numeros = numerosTecmelecPorPedido.get(p.id) || [];
      if (numeros.length === 0) return null;
      return numeros.every((n) => numerosConPdfEnviado.has(n));
    })(),
    created_at: p.created_at,
  }));

  // Opciones de los desplegables "Por usuario" y "Por obra".
  const usuarios = new Map<string, string>();
  for (const pf of perfiles || []) if (pf.nombre_completo) usuarios.set(pf.id, pf.nombre_completo);
  for (const p of pedidos) if (p.usuario_id && !usuarios.has(p.usuario_id)) usuarios.set(p.usuario_id, p.profiles?.nombre_completo || '—');
  const obrasGuardadas: string[] = guardado?.obras || [];
  const obras = new Map<string, string>();
  for (const p of pedidos) if (p.proyectos?.bc_job_no) obras.set(p.proyectos.bc_job_no, p.proyectos.descripcion || '');
  const faltan = obrasGuardadas.filter((n) => !obras.has(n));
  if (faltan.length) {
    const { data: proyectosGuardados } = await supabase.from('proyectos').select('bc_job_no, descripcion').in('bc_job_no', faltan);
    for (const pr of proyectosGuardados || []) obras.set(pr.bc_job_no, pr.descripcion || '');
    for (const n of faltan) if (!obras.has(n)) obras.set(n, '');
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitudes por comprar</h1>
      <p className="text-slate text-sm mb-6">
        Solicitudes de material de todos los usuarios. Puedes ver solo las que te han asignado o seguir las de ciertos usuarios u obras.
      </p>

      <SincronizarTodasBCBoton />

      {filas.length === 0 ? (
        <p className="text-slate text-sm">No hay solicitudes.</p>
      ) : (
        <SolicitudesFiltrables
          pedidos={filas}
          linkBase="/comprador"
          mostrarComprador
          mostrarPdfEnviado
          filtrosRapidos={{
            usuarios: Array.from(usuarios, ([id, nombre]) => ({ id, nombre })),
            obras: Array.from(obras, ([numero, nombre]) => ({ numero, nombre })),
            guardados: { solicitantes: guardado?.solicitantes || [], obras: obrasGuardadas },
          }}
        />
      )}
    </div>
  );
}
