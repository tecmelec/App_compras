'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { crearDireccion, actualizarDireccion, eliminarDireccion } from '@/app/actions/direcciones';

type Direccion = {
  id: string;
  alias: string;
  direccion: string;
  codigo_postal: string | null;
  ciudad: string | null;
  provincia: string | null;
};

type Proyecto = { id: string; bc_job_no: string; descripcion: string | null };

const CODIGOS_PAIS = [
  { value: '+34', label: '+34 España' },
  { value: '+351', label: '+351 Portugal' },
  { value: '+33', label: '+33 Francia' },
  { value: '+44', label: '+44 Reino Unido' },
  { value: '+49', label: '+49 Alemania' },
  { value: '+1', label: '+1 EE.UU./Canadá' },
];

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

  // ¿La solicitud se hace fuera del horario de corte? En ese caso, el día siguiente tampoco es válido.
  const fueraDeHorario =
    (diaSemana >= 1 && diaSemana <= 4 && horaDecimal >= 17) || // lunes a jueves después de las 17:00
    (diaSemana === 5 && horaDecimal >= 13.5) || // viernes después de las 13:30
    diaSemana === 0 ||
    diaSemana === 6; // sábado o domingo, a cualquier hora

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
  }) => void;
  enviando: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [codigoPais, setCodigoPais] = useState('+34');
  const [telefono, setTelefono] = useState('');
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [direccionId, setDireccionId] = useState('');
  const [fecha, setFecha] = useState(proximaFechaHabilValida());
  const [creandoDireccion, setCreandoDireccion] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comprador: bloqueado (asignado por admin) para "usuario"; seleccionable para admin/responsable
  const [rol, setRol] = useState<string>('usuario');
  const [compradorAsignadoId, setCompradorAsignadoId] = useState<string | null>(null);
  const [compradoresDisponibles, setCompradoresDisponibles] = useState<{ id: string; nombre_completo: string }[]>([]);
  const [compradorSeleccionado, setCompradorSeleccionado] = useState('');

  // Proyecto: obligatorio para todos los roles
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [busquedaProyecto, setBusquedaProyecto] = useState('');

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
        if (perfil.telefono) {
          // separa el código de país si ya viene guardado como "+34 600111222"
          const partes = perfil.telefono.split(' ');
          if (partes.length > 1 && partes[0].startsWith('+')) {
            setCodigoPais(partes[0]);
            setTelefono(partes.slice(1).join(''));
          } else {
            setTelefono(perfil.telefono.replace(/\D/g, ''));
          }
        }

        if (perfil.rol === 'usuario') {
          setCompradorAsignadoId(perfil.comprador_id || null);
        } else {
          // admin o responsable: eligen el comprador manualmente
          const { data: compradores } = await supabase
            .from('profiles')
            .select('id, nombre_completo')
            .eq('rol', 'comprador')
            .order('nombre_completo');
          setCompradoresDisponibles(compradores || []);
        }
      }

      const { data: dirs } = await supabase
        .from('direcciones')
        .select('id, alias, direccion, codigo_postal, ciudad, provincia')
        .order('created_at', { ascending: false });

      setDirecciones(dirs || []);
      if (dirs && dirs.length > 0) setDireccionId(dirs[0].id);

      if (perfil?.rol === 'usuario') {
        const { data: asignados } = await supabase
          .from('usuario_proyectos')
          .select('proyectos(id, bc_job_no, descripcion)')
          .eq('usuario_id', user.id);
        setProyectos(((asignados || []) as any).map((a: any) => a.proyectos).filter(Boolean));
      } else {
        const { data: abiertos } = await supabase
          .from('proyectos')
          .select('id, bc_job_no, descripcion')
          .eq('estado', 'Open')
          .order('bc_job_no');
        setProyectos(abiertos || []);
      }

      setCargando(false);
    }
    cargar();
  }, []);

  function validarYEnviar() {
    setError(null);

    if (!nombre.trim()) return setError('Falta el nombre de contacto.');
    if (!/^\d{6,12}$/.test(telefono.trim())) {
      return setError('El teléfono debe tener solo números (6 a 12 dígitos).');
    }
    if (!proyectoId) return setError('Selecciona el proyecto.');
    if (!direccionId) return setError('Selecciona una dirección de entrega.');
    if (!fecha) return setError('Selecciona la fecha requerida de entrega.');

    if (rol !== 'usuario' && !compradorSeleccionado) {
      return setError('Selecciona el comprador para esta solicitud.');
    }

    const fechaSeleccionada = new Date(fecha + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaSeleccionada <= hoy) return setError('La fecha debe ser posterior a hoy.');
    const dia = fechaSeleccionada.getDay();
    if (dia === 0 || dia === 6) return setError('La fecha no puede ser sábado ni domingo.');

    const minimaPermitida = new Date(proximaFechaHabilValida() + 'T00:00:00');
    if (fechaSeleccionada < minimaPermitida) {
      return setError(
        'Por el horario de corte, la fecha más próxima disponible es ' +
          minimaPermitida.toLocaleDateString('es-ES') +
          '.'
      );
    }

    onConfirmar({
      proyecto_id: proyectoId,
      nombre_contacto: nombre.trim(),
      telefono_contacto: `${codigoPais} ${telefono.trim()}`,
      direccion_entrega_id: direccionId,
      fecha_requerida: fecha,
      comprador_id: rol === 'usuario' ? compradorAsignadoId : compradorSeleccionado,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-semibold text-grafito mb-1">Método de entrega</h2>
        <p className="text-sm text-slate mb-5">
          Completa estos datos para enviar tu solicitud de materiales.
        </p>

        {cargando ? (
          <p className="text-sm text-slate">Cargando…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="font-medium text-grafito mb-2">Proyecto</h3>

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
                  <div className="border border-borde rounded-lg divide-y divide-borde max-h-40 overflow-y-auto">
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
                </>
              )}
            </div>

            <div>
              <h3 className="font-medium text-grafito mb-2">¿Dónde quieres recibir tu pedido? *</h3>

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

            {rol !== 'usuario' && (
              <div>
                <h3 className="font-medium text-grafito mb-2">Comprador</h3>
                <select
                  className="input"
                  value={compradorSeleccionado}
                  onChange={(e) => setCompradorSeleccionado(e.target.value)}
                >
                  <option value="">Selecciona un comprador</option>
                  {compradoresDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <h3 className="font-medium text-grafito mb-2">Persona de contacto</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate mb-1">Nombre</label>
                  <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-slate mb-1">Teléfono</label>
                  <div className="flex gap-2">
                    <select
                      className="input w-28"
                      value={codigoPais}
                      onChange={(e) => setCodigoPais(e.target.value)}
                    >
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
            </div>

            <div>
              <label className="block text-sm font-medium text-grafito mb-1">
                Fecha requerida de entrega
              </label>
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
            </div>

            {error && (
              <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={validarYEnviar} disabled={enviando} className="btn-primary flex-1">
                {enviando ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              <button onClick={onCancel} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        )}
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
