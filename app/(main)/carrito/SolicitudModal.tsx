'use client';

import { useEffect, useState } from 'react';
import { aprobadoresParaSolicitud, type AprobadorOpcion } from '@/app/actions/aprobadores-proyecto';
import { createClient } from '@/lib/supabase/client';
import { useCart } from '@/context/CartContext';
import TareasPlanificacionModal from './TareasPlanificacionModal';
import { crearDireccion, actualizarDireccion, eliminarDireccion } from '@/app/actions/direcciones';
import { crearContactoEntrega, eliminarContactoEntrega } from '@/app/actions/contactos';
import { comprobarTiendaProyectoCarrito } from '@/app/actions/tienda-proyecto';
import type { ExcesoTienda } from '@/lib/tienda-proyecto';
import { formatoCantidad } from '@/lib/cantidad';

type ContactoEntrega = { id: string; nombre: string; telefono: string };

// "+34 600111222" -> { codigo: '+34', numero: '600111222' }
function separarTelefono(valor: string | null | undefined): { codigo: string; numero: string } {
  const t = (valor || '').trim();
  const partes = t.split(' ');
  if (partes.length > 1 && partes[0].startsWith('+')) return { codigo: partes[0], numero: partes.slice(1).join('').replace(/\D/g, '') };
  return { codigo: '+34', numero: t.replace(/\D/g, '') };
}

type Direccion = {
  id: string;
  alias: string;
  direccion: string;
  codigo_postal: string | null;
  ciudad: string | null;
  provincia: string | null;
};

type Proyecto = {
  id: string;
  bc_job_no: string;
  descripcion: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
};

const CODIGOS_PAIS = [
  { value: '+34', label: '+34 España' },
  { value: '+351', label: '+351 Portugal' },
  { value: '+33', label: '+33 Francia' },
  { value: '+44', label: '+44 Reino Unido' },
  { value: '+49', label: '+49 Alemania' },
  { value: '+1', label: '+1 EE.UU./Canadá' },
];

const PASOS = ['proyecto', 'direccion', 'contacto', 'fecha'] as const;
const TITULOS_PASO: Record<(typeof PASOS)[number], string> = {
  proyecto: 'Proyecto',
  direccion: '¿Dónde quieres recibir tu pedido?',
  contacto: 'Persona de contacto',
  fecha: 'Fecha requerida de entrega',
};

function formatoFechaLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function saltarFinDeSemana(fecha: Date) {
  while (fecha.getDay() === 0 || fecha.getDay() === 6) {
    fecha.setDate(fecha.getDate() + 1);
  }
}

function proximaFechaHabilValida(): string {
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0 = domingo ... 6 = sábado
  const horaDecimal = ahora.getHours() + ahora.getMinutes() / 60;

  const fueraDeHorario =
    (diaSemana >= 1 && diaSemana <= 4 && horaDecimal >= 17) ||
    (diaSemana === 5 && horaDecimal >= 13.5) ||
    diaSemana === 0 ||
    diaSemana === 6;

  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() + 1);
  saltarFinDeSemana(fecha);

  if (fueraDeHorario) {
    fecha.setDate(fecha.getDate() + 1);
    saltarFinDeSemana(fecha);
  }

  return formatoFechaLocal(fecha);
}

export default function SolicitudModal({
  onCancel,
  onConfirmar,
  enviando,
}: {
  onCancel: () => void;
  onConfirmar: (datos: {
    proyecto_id: string;
    nombre_contacto: string;
    telefono_contacto: string;
    direccion_entrega_id: string;
    fecha_requerida: string;
    comprador_id: string | null;
    seguir_pedido: boolean;
    aprobador_id: string | null;
    tareas_planificacion: Record<string, string>;
    ampliaciones_tienda: Record<string, { comentario?: string | null }>;
  }) => void;
  enviando: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [codigoPais, setCodigoPais] = useState('+34');
  const [telefono, setTelefono] = useState('');
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  // Contactos: "__yo__" = los datos del propio usuario (editables); si no, un contacto guardado.
  const [contactos, setContactos] = useState<ContactoEntrega[]>([]);
  const [contactoId, setContactoId] = useState<string>('__yo__');
  const [misDatos, setMisDatos] = useState({ nombre: '', codigo: '+34', numero: '' });
  const [creandoContacto, setCreandoContacto] = useState(false);
  const [direccionId, setDireccionId] = useState('');
  const [fecha, setFecha] = useState(proximaFechaHabilValida());
  const [seguirPedido, setSeguirPedido] = useState(false);
  const [creandoDireccion, setCreandoDireccion] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rol, setRol] = useState<string>('usuario');
  const [compradorAsignadoId, setCompradorAsignadoId] = useState<string | null>(null);
  const [compradoresDisponibles, setCompradoresDisponibles] = useState<
    { id: string; nombre_completo: string; rol?: string }[]
  >([]);
  const [compradorSeleccionado, setCompradorSeleccionado] = useState('');

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  // "Asignar líneas de planificación manualmente" (todos los perfiles excepto usuario):
  // producto_id → Nº tarea proyecto. Se borra al cambiar de proyecto (vuelve a 95.01).
  const { items: itemsCarrito } = useCart();
  const [asignarTareas, setAsignarTareas] = useState(false);
  const [tareasPlan, setTareasPlan] = useState<Record<string, string>>({});
  const [editandoTareas, setEditandoTareas] = useState(false);
  useEffect(() => {
    setAsignarTareas(false);
    setTareasPlan({});
  }, [proyectoId]);
  // Proyectos con varios aprobadores: el solicitante elige quién aprueba la solicitud.
  const [aprobadores, setAprobadores] = useState<AprobadorOpcion[]>([]);
  const [aprobadorId, setAprobadorId] = useState('');
  // Si el aprobador elegido es un perfil integral, también se le puede elegir como comprador.
  const aprobadorIntegral = aprobadores.find((a) => a.id === aprobadorId && a.integral);
  const opcionesComprador = [
    ...(aprobadorIntegral && !compradoresDisponibles.some((c) => c.id === aprobadorIntegral.id)
      ? [{ id: aprobadorIntegral.id, nombre_completo: aprobadorIntegral.nombre, rol: 'integral' }]
      : []),
    ...compradoresDisponibles,
  ];
  // Si se cambia el aprobador, deja de ser elegible el integral anterior como comprador.
  useEffect(() => {
    if (compradorSeleccionado && !opcionesComprador.some((c) => c.id === compradorSeleccionado)) setCompradorSeleccionado('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aprobadorId, aprobadores]);
  const [cargandoAprobadores, setCargandoAprobadores] = useState(false);
  useEffect(() => {
    setAprobadores([]);
    setAprobadorId('');
    if (!proyectoId) return;
    let vigente = true;
    setCargandoAprobadores(true);
    aprobadoresParaSolicitud(proyectoId)
      .then((lista) => {
        if (vigente) setAprobadores(lista);
      })
      .finally(() => {
        if (vigente) setCargandoAprobadores(false);
      });
    return () => {
      vigente = false;
    };
  }, [proyectoId]);
  const [busquedaProyecto, setBusquedaProyecto] = useState('');

  // Tienda por proyecto: artículos del carrito que superan lo autorizado para la obra.
  // Quien puede autorizar la ampliación (admin o responsable del proyecto) lo hace aquí;
  // si no, puede seguir y el aprobador decidirá.
  const [excesosTienda, setExcesosTienda] = useState<ExcesoTienda[]>([]);
  const [puedeAutorizarTienda, setPuedeAutorizarTienda] = useState(false);
  const [comprobandoTienda, setComprobandoTienda] = useState(false);
  const [autorizaciones, setAutorizaciones] = useState<Record<string, { ok: boolean; comentario: string }>>({});
  useEffect(() => {
    setExcesosTienda([]);
    setPuedeAutorizarTienda(false);
    setAutorizaciones({});
    if (!proyectoId || itemsCarrito.length === 0) return;
    let vigente = true;
    setComprobandoTienda(true);
    comprobarTiendaProyectoCarrito(
      proyectoId,
      itemsCarrito.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }))
    )
      .then((r) => {
        if (!vigente) return;
        setExcesosTienda(r.excesos || []);
        setPuedeAutorizarTienda(!!r.puedeAutorizar);
      })
      .finally(() => {
        if (vigente) setComprobandoTienda(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const [pasoIndex, setPasoIndex] = useState(0);
  const paso = PASOS[pasoIndex];

  useEffect(() => {
    async function cargar() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: perfil } = await supabase
        .from('profiles')
        .select('nombre_completo, telefono, rol, comprador_id')
        .eq('id', user.id)
        .single();

      if (perfil) {
        setNombre(perfil.nombre_completo || '');
        setRol(perfil.rol);
        const tel = separarTelefono(perfil.telefono);
        if (perfil.telefono) {
          setCodigoPais(tel.codigo);
          setTelefono(tel.numero);
        }
        setMisDatos({ nombre: perfil.nombre_completo || '', codigo: tel.codigo, numero: tel.numero });

        if (perfil.rol === 'usuario') {
          setCompradorAsignadoId(perfil.comprador_id || null);
        } else {
          // Un admin también puede figurar como comprador asignable (p.ej. si
          // quiere tramitar él mismo una solicitud), igual que ya puede actuar
          // como responsable o como sustituto de un comprador.
          const { data: compradores } = await supabase
            .from('profiles')
            .select('id, nombre_completo, rol')
            .in('rol', ['comprador', 'admin'])
            .eq('activo', true)
            .order('nombre_completo');
          setCompradoresDisponibles(compradores || []);
        }
      }

      const { data: dirs } = await supabase
        .from('direcciones')
        .select('id, alias, direccion, codigo_postal, ciudad, provincia')
        .eq('usuario_id', user.id)
        .eq('oculta', false)
        .order('created_at', { ascending: false });

      setDirecciones(dirs || []);

      const { data: contactosGuardados } = await supabase
        .from('contactos_entrega')
        .select('id, nombre, telefono')
        .eq('usuario_id', user.id)
        .order('nombre');
      setContactos(contactosGuardados || []);

      // Solo proyectos de tipo Obra (los de tipo Estudio u otros no admiten solicitudes).
      // Se pide "*" para no fallar si la columna "tipo" aún no existe.
      const esDeObra = (p: any) => !p?.tipo || p.tipo === 'Obra';
      if (perfil?.rol === 'usuario') {
        const { data: asignados } = await supabase
          .from('usuario_proyectos')
          .select('proyectos(*)')
          .eq('usuario_id', user.id);
        setProyectos(((asignados || []) as any).map((a: any) => a.proyectos).filter((p: any) => p && esDeObra(p)));
      } else {
        const { data: abiertos } = await supabase
          .from('proyectos')
          .select('*')
          .eq('estado', 'Open')
          .order('bc_job_no');
        setProyectos((abiertos || []).filter(esDeObra));
      }

      setCargando(false);
    }
    cargar();
  }, []);

  function validarPasoActual(): string | null {
    if (paso === 'proyecto') {
      if (!proyectoId) return 'Selecciona el proyecto.';
      if (cargandoAprobadores) return 'Comprobando los aprobadores del proyecto…';
      if (aprobadores.length > 0 && !aprobadorId) return 'Selecciona el aprobador para esta solicitud.';
      if (comprobandoTienda) return 'Comprobando la tienda del proyecto…';
      if (excesosTienda.length > 0 && puedeAutorizarTienda && excesosTienda.some((x) => !autorizaciones[x.producto_id]?.ok)) {
        return 'Hay artículos que superan lo autorizado en la tienda del proyecto: autoriza la ampliación o reduce la cantidad en el carrito.';
      }
    }

    if (paso === 'direccion') {
      if (!direccionId) return 'Selecciona una dirección de entrega.';
    }

    if (paso === 'contacto') {
      if (rol !== 'usuario' && rol !== 'integral' && !compradorSeleccionado) return 'Selecciona el comprador para esta solicitud.';
      if (!nombre.trim()) return 'Falta el nombre de contacto.';
      if (!/^\d{6,12}$/.test(telefono.trim())) {
        return 'El teléfono debe tener solo números (6 a 12 dígitos).';
      }
    }

    if (paso === 'fecha') {
      if (!fecha) return 'Selecciona la fecha requerida de entrega.';

      const fechaSeleccionada = new Date(fecha + 'T00:00:00');
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (fechaSeleccionada <= hoy) return 'La fecha debe ser posterior a hoy.';
      const dia = fechaSeleccionada.getDay();
      if (dia === 0 || dia === 6) return 'La fecha no puede ser sábado ni domingo.';

      const minimaPermitida = new Date(proximaFechaHabilValida() + 'T00:00:00');
      if (fechaSeleccionada < minimaPermitida) {
        return (
          'Por el horario de corte, la fecha más próxima disponible es ' +
          minimaPermitida.toLocaleDateString('es-ES') +
          '.'
        );
      }
    }

    return null;
  }

  function siguiente() {
    const err = validarPasoActual();
    if (err) {
      setError(err);
      return;
    }
    setError(null);

    if (pasoIndex < PASOS.length - 1) {
      const siguientePaso = PASOS[pasoIndex + 1];
      if (siguientePaso === 'direccion' && !direccionId) {
        const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId);
        if (proyectoSeleccionado?.direccion) {
          setDireccionId('__predet__');
        } else if (direcciones.length > 0) {
          setDireccionId(direcciones[0].id);
        }
      }
      setPasoIndex((i) => i + 1);
      return;
    }

    onConfirmar({
      proyecto_id: proyectoId,
      nombre_contacto: nombre.trim(),
      telefono_contacto: `${codigoPais} ${telefono.trim()}`,
      direccion_entrega_id: direccionId,
      fecha_requerida: fecha,
      comprador_id: rol === 'usuario' ? compradorAsignadoId : rol === 'integral' ? null : compradorSeleccionado,
      seguir_pedido: seguirPedido,
      aprobador_id: aprobadores.length > 0 ? aprobadorId : null,
      tareas_planificacion: rol !== 'usuario' && asignarTareas ? tareasPlan : {},
      ampliaciones_tienda: puedeAutorizarTienda
        ? Object.fromEntries(
            excesosTienda
              .filter((x) => autorizaciones[x.producto_id]?.ok)
              .map((x) => [x.producto_id, { comentario: autorizaciones[x.producto_id]?.comentario || null }])
          )
        : {},
    });
  }

  function atras() {
    setError(null);
    setPasoIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-semibold text-grafito mb-1">Método de entrega</h2>

        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 mb-5">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-2 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  i < pasoIndex
                    ? 'bg-marca text-white'
                    : i === pasoIndex
                    ? 'bg-marcaClaro text-marca border-2 border-marca'
                    : 'bg-fondo text-slate'
                }`}
              >
                {i < pasoIndex ? '✓' : i + 1}
              </div>
              {i < PASOS.length - 1 && (
                <div className={`h-0.5 flex-1 ${i < pasoIndex ? 'bg-marca' : 'bg-borde'}`} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate mb-1">
          Paso {pasoIndex + 1} de {PASOS.length}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <h3 className="font-medium text-grafito text-lg">{TITULOS_PASO[paso]}</h3>
          {paso === 'proyecto' && rol !== 'usuario' && itemsCarrito.length > 0 && (
            <div className="text-right">
              <label
                className={`inline-flex items-center gap-2 text-xs ${proyectoId ? 'text-grafito cursor-pointer' : 'text-slate/70 cursor-not-allowed'}`}
                title={proyectoId ? undefined : 'Elige primero el proyecto'}
              >
                <input
                  type="checkbox"
                  disabled={!proyectoId}
                  checked={asignarTareas}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAsignarTareas(true);
                      setEditandoTareas(true);
                    } else {
                      setAsignarTareas(false);
                      setTareasPlan({});
                    }
                  }}
                />
                Asignar líneas de planificación manualmente
              </label>
              {asignarTareas && (
                <p className="text-[11px] text-slate mt-0.5">
                  {Object.keys(tareasPlan).length} de {itemsCarrito.length} con tarea ·{' '}
                  <button type="button" onClick={() => setEditandoTareas(true)} className="text-marca hover:underline">
                    Editar
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
        {editandoTareas && proyectoId && (
          <TareasPlanificacionModal
            proyectoId={proyectoId}
            proyectoNo={proyectos.find((p) => p.id === proyectoId)?.bc_job_no || ''}
            items={itemsCarrito.map((i) => ({
              producto_id: i.producto_id,
              nombre: i.nombre,
              cantidad: i.cantidad,
              unidad_medida: i.unidad_medida,
            }))}
            inicial={tareasPlan}
            onAceptar={(t) => {
              setTareasPlan(t);
              setEditandoTareas(false);
              if (Object.keys(t).length === 0) setAsignarTareas(false);
            }}
            onCancelar={() => {
              setEditandoTareas(false);
              if (Object.keys(tareasPlan).length === 0) setAsignarTareas(false);
            }}
          />
        )}

        {cargando ? (
          <p className="text-sm text-slate">Cargando…</p>
        ) : (
          <div>
            {paso === 'proyecto' && (
              <div>
                {proyectos.length === 0 ? (
                  <p className="text-sm text-slate">
                    No tienes proyectos asignados. Contacta a tu administrador o responsable.
                  </p>
                ) : (
                  <>
                    <input
                      className="input mb-2"
                      placeholder="Buscar proyecto por número o descripción..."
                      value={busquedaProyecto}
                      onChange={(e) => setBusquedaProyecto(e.target.value)}
                    />
                    <div className="border border-borde rounded-lg divide-y divide-borde max-h-72 overflow-y-auto">
                      {proyectos
                        .filter((p) => {
                          const texto = busquedaProyecto.trim().toLowerCase();
                          if (!texto) return true;
                          return (
                            p.bc_job_no.toLowerCase().includes(texto) ||
                            (p.descripcion || '').toLowerCase().includes(texto)
                          );
                        })
                        .map((p) => (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2 p-2.5 text-sm cursor-pointer ${
                              proyectoId === p.id ? 'bg-marcaClaro' : 'hover:bg-fondo'
                            }`}
                          >
                            <input
                              type="radio"
                              name="proyecto"
                              checked={proyectoId === p.id}
                              onChange={() => setProyectoId(p.id)}
                            />
                            <span className="font-mono text-grafito">{p.bc_job_no}</span>
                            <span className="text-slate">{p.descripcion}</span>
                          </label>
                        ))}
                    </div>
                    {aprobadores.length > 0 && (
                      <div className="mt-4 border border-[#F2D9AE] bg-[#FDF2E3] rounded-lg p-3">
                        <p className="text-sm font-medium text-[#8A5A15] mb-2">
                          Selecciona el aprobador para esta solicitud
                        </p>
                        <div className="space-y-1.5">
                          {aprobadores.map((a) => (
                            <label key={a.id} className="flex items-center gap-2 text-sm text-grafito cursor-pointer">
                              <input
                                type="radio"
                                name="aprobador"
                                checked={aprobadorId === a.id}
                                onChange={() => setAprobadorId(a.id)}
                              />
                              {a.nombre}
                              {a.jefeObraBC && <span className="text-xs text-slate">(jefe de obra en BC)</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {cargandoAprobadores && <p className="text-xs text-slate mt-2">Comprobando los aprobadores del proyecto…</p>}
                    {comprobandoTienda && <p className="text-xs text-slate mt-2">Comprobando la tienda del proyecto…</p>}
                    {excesosTienda.length > 0 && (
                      <div
                        className={`mt-4 rounded-lg p-3 border ${
                          puedeAutorizarTienda ? 'border-[#E7C7C7] bg-[#FBF3F3]' : 'border-[#F2D9AE] bg-[#FDF2E3]'
                        }`}
                      >
                        <p className={`text-sm font-medium mb-1 ${puedeAutorizarTienda ? 'text-rojo' : 'text-[#8A5A15]'}`}>
                          Supera lo autorizado en la tienda del proyecto
                        </p>
                        <p className="text-xs text-slate mb-2">
                          {puedeAutorizarTienda
                            ? 'Para continuar, autoriza la ampliación de cada artículo o vuelve al carrito y reduce la cantidad.'
                            : 'Puedes continuar con la solicitud: el aprobador tendrá que ajustar la cantidad o aprobar la ampliación.'}
                        </p>
                        <div className="space-y-2">
                          {excesosTienda.map((x) => {
                            const a = autorizaciones[x.producto_id];
                            return (
                              <div key={x.producto_id} className="bg-white border border-borde rounded-md p-2.5">
                                <p className="text-sm text-grafito">{x.nombre}</p>
                                <p className="text-xs text-slate">
                                  Pides {formatoCantidad(x.pedido)} {x.unidad} · quedan {formatoCantidad(x.disponible)} {x.unidad} de{' '}
                                  {formatoCantidad(x.limite)} {x.unidad} ·{' '}
                                  <span className="text-rojo font-medium">
                                    exceso {formatoCantidad(x.exceso)} {x.unidad}
                                  </span>
                                </p>
                                {puedeAutorizarTienda && (
                                  <>
                                    <label className="flex items-center gap-2 text-sm text-grafito mt-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={!!a?.ok}
                                        onChange={(e) =>
                                          setAutorizaciones((prev) => ({
                                            ...prev,
                                            [x.producto_id]: { ok: e.target.checked, comentario: prev[x.producto_id]?.comentario || '' },
                                          }))
                                        }
                                      />
                                      Autorizo una ampliación de {formatoCantidad(x.exceso)} {x.unidad}
                                    </label>
                                    {a?.ok && (
                                      <input
                                        className="input py-1 text-sm mt-1.5"
                                        maxLength={1000}
                                        placeholder="Comentario de la ampliación (opcional)"
                                        value={a.comentario}
                                        onChange={(e) =>
                                          setAutorizaciones((prev) => ({
                                            ...prev,
                                            [x.producto_id]: { ok: true, comentario: e.target.value },
                                          }))
                                        }
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {paso === 'direccion' && (
              <div>
                {(() => {
                  const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId);
                  if (!proyectoSeleccionado?.direccion) return null;
                  const seleccionada = direccionId === '__predet__';
                  return (
                    <label
                      className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer mb-2 ${
                        seleccionada ? 'border-marca bg-marcaClaro' : 'border-borde'
                      }`}
                    >
                      <input
                        type="radio"
                        name="direccion"
                        className="mt-1"
                        checked={seleccionada}
                        onChange={() => setDireccionId('__predet__')}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-grafito">Predet.</p>
                        <p className="text-slate">
                          {proyectoSeleccionado.direccion}
                          {proyectoSeleccionado.codigo_postal ? ` — CP ${proyectoSeleccionado.codigo_postal}` : ''}
                          {proyectoSeleccionado.ciudad ? `, ${proyectoSeleccionado.ciudad}` : ''}
                          {proyectoSeleccionado.provincia ? ` (${proyectoSeleccionado.provincia})` : ''}
                        </p>
                        <p className="text-xs text-slate mt-0.5">Dirección del proyecto en Business Central</p>
                      </div>
                    </label>
                  );
                })()}

                {direcciones.length === 0 && !creandoDireccion && (
                  <p className="text-sm text-slate mb-2">Todavía no tienes direcciones guardadas.</p>
                )}

                <div className="space-y-2 mb-2">
                  {direcciones.map((d) =>
                    editandoId === d.id ? (
                      <NuevaDireccionForm
                        key={d.id}
                        direccion={d}
                        onCancel={() => setEditandoId(null)}
                        onCreada={(dir) => {
                          setDirecciones((prev) => prev.map((x) => (x.id === dir.id ? dir : x)));
                          setEditandoId(null);
                        }}
                      />
                    ) : (
                      <label
                        key={d.id}
                        className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${
                          direccionId === d.id ? 'border-marca bg-marcaClaro' : 'border-borde'
                        }`}
                      >
                        <input
                          type="radio"
                          name="direccion"
                          className="mt-1"
                          checked={direccionId === d.id}
                          onChange={() => setDireccionId(d.id)}
                        />
                        <div className="flex-1 text-sm">
                          <p className="font-medium text-grafito">{d.alias}</p>
                          <p className="text-slate">
                            {d.direccion}
                            {d.codigo_postal ? ` — CP ${d.codigo_postal}` : ''}
                            {d.ciudad ? `, ${d.ciudad}` : ''}
                            {d.provincia ? ` (${d.provincia})` : ''}
                          </p>
                          <div className="flex gap-3 mt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setEditandoId(d.id);
                              }}
                              className="text-xs text-marca hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault();
                                if (!confirm(`¿Eliminar la dirección "${d.alias}"?`)) return;
                                const resultado = await eliminarDireccion(d.id);
                                if (resultado.error) {
                                  setError(resultado.error);
                                  return;
                                }
                                setDirecciones((prev) => prev.filter((x) => x.id !== d.id));
                                if (direccionId === d.id) setDireccionId('');
                              }}
                              className="text-xs text-rojo hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </label>
                    )
                  )}
                </div>

                {!creandoDireccion ? (
                  <button
                    type="button"
                    onClick={() => setCreandoDireccion(true)}
                    className="text-sm text-marca hover:underline"
                  >
                    + Nueva dirección
                  </button>
                ) : (
                  <NuevaDireccionForm
                    onCancel={() => setCreandoDireccion(false)}
                    onCreada={(dir) => {
                      setDirecciones((prev) => [dir, ...prev]);
                      setDireccionId(dir.id);
                      setCreandoDireccion(false);
                    }}
                  />
                )}
              </div>
            )}

            {paso === 'contacto' && (
              <div className="space-y-5">
                {rol === 'integral' && (
                  <div>
                    <p className="block text-sm text-slate mb-1">Comprador</p>
                    <p className="text-sm text-grafito">Tú gestionas la compra de esta solicitud.</p>
                  </div>
                )}
                {rol !== 'usuario' && rol !== 'integral' && (
                  <div>
                    <label className="block text-sm text-slate mb-1">Comprador</label>
                    <select
                      className="input"
                      value={compradorSeleccionado}
                      onChange={(e) => setCompradorSeleccionado(e.target.value)}
                    >
                      <option value="">Selecciona un comprador</option>
                      {opcionesComprador.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre_completo} {c.rol === 'admin' ? '(admin)' : c.rol === 'integral' ? '(aprobador · integral)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate mb-2">Contacto para la entrega</label>
                  <div className="space-y-2">
                    <label
                      className={`block border rounded-lg p-3 cursor-pointer ${
                        contactoId === '__yo__' ? 'border-marca bg-marcaClaro' : 'border-borde'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="contacto"
                          className="mt-1"
                          checked={contactoId === '__yo__'}
                          onChange={() => {
                            setContactoId('__yo__');
                            setNombre(misDatos.nombre);
                            setCodigoPais(misDatos.codigo);
                            setTelefono(misDatos.numero);
                          }}
                        />
                        <div className="flex-1 text-sm">
                          <p className="font-medium text-grafito">Mis datos</p>
                          {contactoId !== '__yo__' && (
                            <p className="text-slate">
                              {misDatos.nombre || '—'}
                              {misDatos.numero ? ` — ${misDatos.codigo} ${misDatos.numero}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      {contactoId === '__yo__' && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <span className="block text-xs text-slate mb-1">Nombre</span>
                            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                          </div>
                          <div>
                            <span className="block text-xs text-slate mb-1">Teléfono</span>
                            <div className="flex gap-2">
                              <select className="input w-24" value={codigoPais} onChange={(e) => setCodigoPais(e.target.value)}>
                                {CODIGOS_PAIS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.value}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="input"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
                                placeholder="600111222"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </label>

                    {contactos.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${
                          contactoId === c.id ? 'border-marca bg-marcaClaro' : 'border-borde'
                        }`}
                      >
                        <input
                          type="radio"
                          name="contacto"
                          className="mt-1"
                          checked={contactoId === c.id}
                          onChange={() => {
                            const tel = separarTelefono(c.telefono);
                            setContactoId(c.id);
                            setNombre(c.nombre);
                            setCodigoPais(tel.codigo);
                            setTelefono(tel.numero);
                          }}
                        />
                        <div className="flex-1 text-sm">
                          <p className="font-medium text-grafito">{c.nombre}</p>
                          <p className="text-slate">{c.telefono}</p>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              if (!confirm(`¿Eliminar el contacto "${c.nombre}"?`)) return;
                              const r = await eliminarContactoEntrega(c.id);
                              if (r.error) {
                                setError(r.error);
                                return;
                              }
                              setContactos((prev) => prev.filter((x) => x.id !== c.id));
                              if (contactoId === c.id) {
                                setContactoId('__yo__');
                                setNombre(misDatos.nombre);
                                setCodigoPais(misDatos.codigo);
                                setTelefono(misDatos.numero);
                              }
                            }}
                            className="text-xs text-rojo hover:underline mt-1"
                          >
                            Eliminar
                          </button>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="mt-2">
                    {!creandoContacto ? (
                      <button type="button" onClick={() => setCreandoContacto(true)} className="text-sm text-marca hover:underline">
                        + Nuevo contacto
                      </button>
                    ) : (
                      <NuevoContactoForm
                        onCancel={() => setCreandoContacto(false)}
                        onCreado={(c) => {
                          const tel = separarTelefono(c.telefono);
                          setContactos((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
                          setContactoId(c.id);
                          setNombre(c.nombre);
                          setCodigoPais(tel.codigo);
                          setTelefono(tel.numero);
                          setCreandoContacto(false);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {paso === 'fecha' && (
              <div>
                <input
                  type="date"
                  className="input"
                  value={fecha}
                  min={proximaFechaHabilValida()}
                  onChange={(e) => setFecha(e.target.value)}
                />
                <p className="text-xs text-slate mt-1">
                  No se permiten sábados ni domingos. Fuera del horario de corte (L-J después de las
                  17:00, o V después de las 13:30), la fecha más próxima se ajusta automáticamente.
                </p>

                <label className="flex items-start gap-2 mt-4 text-sm text-grafito cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={seguirPedido}
                    onChange={(e) => setSeguirPedido(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-borde text-marca focus:ring-marca"
                  />
                  <span>
                    Seguir pedido
                    <span className="block text-xs text-slate">
                      Recibe una notificación cada vez que cambie el estado de los pedidos asociados a esta solicitud.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-5">
              {pasoIndex > 0 && (
                <button onClick={atras} className="btn-secondary">
                  Atrás
                </button>
              )}
              <button onClick={onCancel} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={siguiente} disabled={enviando} className="btn-primary flex-1">
                {pasoIndex === PASOS.length - 1
                  ? enviando
                    ? 'Enviando…'
                    : 'Enviar solicitud'
                  : 'Siguiente'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NuevoContactoForm({
  onCancel,
  onCreado,
}: {
  onCancel: () => void;
  onCreado: (c: ContactoEntrega) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('+34');
  const [numero, setNumero] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim()) return setError('Falta el nombre.');
    if (!/^\d{6,12}$/.test(numero)) return setError('El teléfono debe tener entre 6 y 12 dígitos.');
    setGuardando(true);
    setError(null);
    const r = await crearContactoEntrega({ nombre: nombre.trim(), telefono: `${codigo} ${numero}` });
    setGuardando(false);
    if (r.error || !r.contacto) return setError(r.error || 'No se pudo guardar el contacto.');
    onCreado(r.contacto);
  }

  return (
    <div className="border border-borde rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate mb-1">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" autoFocus />
        </div>
        <div>
          <label className="block text-xs text-slate mb-1">Teléfono</label>
          <div className="flex gap-2">
            <select className="input w-24" value={codigo} onChange={(e) => setCodigo(e.target.value)}>
              {CODIGOS_PAIS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
            <input className="input" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="600111222" />
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-rojo">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate hover:text-grafito px-3 py-1.5">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={guardando} className="text-sm bg-marca text-white rounded-md px-3 py-1.5 disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar contacto'}
        </button>
      </div>
    </div>
  );
}

function NuevaDireccionForm({
  direccion: direccionExistente,
  onCancel,
  onCreada,
}: {
  direccion?: Direccion;
  onCancel: () => void;
  onCreada: (dir: Direccion) => void;
}) {
  const esEdicion = !!direccionExistente;
  const [alias, setAlias] = useState(direccionExistente?.alias || '');
  const [direccion, setDireccion] = useState(direccionExistente?.direccion || '');
  const [codigoPostal, setCodigoPostal] = useState(direccionExistente?.codigo_postal || '');
  const [ciudad, setCiudad] = useState(direccionExistente?.ciudad || '');
  const [provincia, setProvincia] = useState(direccionExistente?.provincia || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    if (!alias.trim() || !direccion.trim()) {
      setError('Falta el alias o la dirección.');
      return;
    }
    setGuardando(true);
    setError(null);

    const datos = {
      alias: alias.trim(),
      direccion: direccion.trim(),
      codigo_postal: codigoPostal.trim(),
      ciudad: ciudad.trim(),
      provincia: provincia.trim(),
    };

    if (esEdicion) {
      const resultado = await actualizarDireccion(direccionExistente!.id, datos);
      setGuardando(false);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      onCreada({ id: direccionExistente!.id, ...datos });
      return;
    }

    const resultado = await crearDireccion(datos);
    setGuardando(false);

    if (resultado.error || !resultado.direccion) {
      setError(resultado.error || 'No se pudo guardar.');
      return;
    }

    onCreada(resultado.direccion);
  }

  return (
    <div className="bg-fondo border border-borde rounded-lg p-4 space-y-2 mt-2">
      <input
        className="input"
        placeholder="Alias (ej: Oficina, Almacén Central)"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
      />
      <input
        className="input"
        placeholder="Dirección (calle y número)"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          className="input"
          placeholder="Código postal"
          value={codigoPostal}
          onChange={(e) => setCodigoPostal(e.target.value)}
        />
        <input
          className="input"
          placeholder="Ciudad"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
        />
        <input
          className="input"
          placeholder="Provincia"
          value={provincia}
          onChange={(e) => setProvincia(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleGuardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar dirección'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  );
}
