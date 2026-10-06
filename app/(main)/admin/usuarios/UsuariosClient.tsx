'use client';

import { Fragment, useState } from 'react';
import { crearUsuario, actualizarUsuario, resetearPassword, eliminarUsuario } from '@/app/actions/usuarios';
import { useRouter } from 'next/navigation';
import ExportarExcelBoton from '@/components/ExportarExcelBoton';

type Usuario = {
  id: string;
  nombre_completo: string;
  email: string;
  telefono: string | null;
  bc_user_id: string | null;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  comprador_id: string | null;
  responsable_id: string | null;
  sustituto_id: string | null;
  sustituto_activo: boolean;
};

const ROLES = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'comprador', label: 'Comprador' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'admin', label: 'Administrador' },
];

export default function UsuariosClient({ usuarios }: { usuarios: Usuario[] }) {
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const router = useRouter();

  const compradores = usuarios.filter((u) => u.rol === 'comprador');
  const responsables = usuarios.filter((u) => u.rol === 'responsable');
  // Un admin también puede actuar como responsable asignado de un usuario/comprador.
  const responsablesDisponibles = usuarios.filter((u) => u.rol === 'responsable' || u.rol === 'admin');
  // Y también como sustituto de un comprador o responsable (p.ej. para poder
  // gestionar sus compras/aprobaciones sin tener que cambiarle el rol).
  const compradoresSustitutosDisponibles = usuarios.filter((u) => u.rol === 'comprador' || u.rol === 'admin');
  const responsablesSustitutosDisponibles = usuarios.filter((u) => u.rol === 'responsable' || u.rol === 'admin');

  function nombrePorId(id: string | null) {
    if (!id) return '—';
    return usuarios.find((u) => u.id === id)?.nombre_completo || '—';
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={() => setCreando(true)} className="btn-primary">
          + Nuevo usuario
        </button>
        <ExportarExcelBoton
          className="ml-auto"
          filas={usuarios}
          nombreArchivo="Usuarios"
          nombreHoja="Usuarios"
          columnas={[
            { titulo: 'Nombre', valor: (u) => u.nombre_completo, ancho: 28 },
            { titulo: 'Email', valor: (u) => u.email, ancho: 32 },
            { titulo: 'Teléfono', valor: (u) => u.telefono, ancho: 14 },
            { titulo: 'Rol', valor: (u) => ROLES.find((r) => r.value === u.rol)?.label || u.rol, ancho: 14 },
            { titulo: 'Comprador', valor: (u) => (u.comprador_id ? nombrePorId(u.comprador_id) : ''), ancho: 25 },
            { titulo: 'Responsable', valor: (u) => (u.responsable_id ? nombrePorId(u.responsable_id) : ''), ancho: 25 },
            { titulo: 'Sustituto', valor: (u) => (u.sustituto_id ? nombrePorId(u.sustituto_id) : ''), ancho: 25 },
            { titulo: 'Sustituto activo', valor: (u) => (u.sustituto_id ? u.sustituto_activo : ''), ancho: 15 },
            { titulo: 'ID de usuario en BC', valor: (u) => u.bc_user_id, ancho: 38 },
          ]}
        />
      </div>

      {creando && (
        <UsuarioForm
          compradores={compradores}
          responsables={responsables}
          responsablesDisponibles={responsablesDisponibles}
          compradoresSustitutosDisponibles={compradoresSustitutosDisponibles}
          responsablesSustitutosDisponibles={responsablesSustitutosDisponibles}
          onCancel={() => setCreando(false)}
          onSuccess={() => {
            setCreando(false);
            router.refresh();
          }}
        />
      )}

      <div className="bg-white border border-borde rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Comprador</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Sustituto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {usuarios.map((u) => (
              <Fragment key={u.id}>
                <tr className="hover:bg-fondo">
                  <td className="px-4 py-3 text-grafito">{u.nombre_completo}</td>
                  <td className="px-4 py-3 text-slate">{u.email}</td>
                  <td className="px-4 py-3 text-grafito capitalize">{u.rol}</td>
                  <td className="px-4 py-3 text-slate">{nombrePorId(u.comprador_id)}</td>
                  <td className="px-4 py-3 text-slate">{nombrePorId(u.responsable_id)}</td>
                  <td className="px-4 py-3 text-slate">
                    {u.sustituto_id ? (
                      <>
                        {nombrePorId(u.sustituto_id)}
                        {u.sustituto_activo && (
                          <span className="badge badge-pendiente ml-2">Activo</span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditandoId(editandoId === u.id ? null : u.id)}
                      className="text-marca text-sm hover:underline"
                    >
                      {editandoId === u.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </td>
                </tr>
                {editandoId === u.id && (
                  <tr>
                    <td colSpan={7} className="bg-fondo p-4">
                      <UsuarioForm
                        usuario={u}
                        compradores={compradores}
                        responsables={responsables}
                        responsablesDisponibles={responsablesDisponibles}
                        compradoresSustitutosDisponibles={compradoresSustitutosDisponibles}
                        responsablesSustitutosDisponibles={responsablesSustitutosDisponibles}
                        onCancel={() => setEditandoId(null)}
                        onSuccess={() => {
                          setEditandoId(null);
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsuarioForm({
  usuario,
  compradores,
  responsables,
  responsablesDisponibles,
  compradoresSustitutosDisponibles,
  responsablesSustitutosDisponibles,
  onCancel,
  onSuccess,
}: {
  usuario?: Usuario;
  compradores: Usuario[];
  responsables: Usuario[];
  responsablesDisponibles: Usuario[];
  compradoresSustitutosDisponibles: Usuario[];
  responsablesSustitutosDisponibles: Usuario[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const esEdicion = !!usuario;

  const [nombre, setNombre] = useState(usuario?.nombre_completo || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [telefono, setTelefono] = useState(usuario?.telefono || '');
  const [bcUserId, setBcUserId] = useState(usuario?.bc_user_id || '');
  const [password, setPassword] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [rol, setRol] = useState<Usuario['rol']>(usuario?.rol || 'usuario');
  const [compradorId, setCompradorId] = useState(usuario?.comprador_id || '');
  const [responsableId, setResponsableId] = useState(usuario?.responsable_id || '');
  const [sustitutoId, setSustitutoId] = useState(usuario?.sustituto_id || '');
  const [sustitutoActivo, setSustitutoActivo] = useState(usuario?.sustituto_activo || false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEliminar() {
    if (!usuario) return;
    if (
      !confirm(
        `¿Eliminar a ${usuario.nombre_completo} (${usuario.email})?\n\nPerderá el acceso a la Tienda y se borrarán sus direcciones, contactos, favoritos y proyectos asignados. Esta acción no se puede deshacer.`
      )
    )
      return;
    setEliminando(true);
    setError(null);
    const r = await eliminarUsuario(usuario.id);
    setEliminando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.soloTienda) alert(`${usuario.nombre_completo} ya no tiene acceso a la Tienda. Conserva su acceso al CRM.`);
    onSuccess();
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);

    const datosComunes = {
      nombre_completo: nombre,
      telefono,
      bc_user_id: bcUserId,
      rol,
      comprador_id: rol === 'usuario' ? compradorId || null : null,
      responsable_id: rol === 'usuario' || rol === 'comprador' ? responsableId || null : null,
      sustituto_id: rol === 'comprador' || rol === 'responsable' ? sustitutoId || null : null,
      sustituto_activo: rol === 'comprador' || rol === 'responsable' ? sustitutoActivo : false,
    };

    const resultado = esEdicion
      ? await actualizarUsuario(usuario!.id, datosComunes)
      : await crearUsuario({ ...datosComunes, email, password });

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    if (esEdicion && nuevaPassword) {
      await resetearPassword(usuario!.id, nuevaPassword);
    }

    onSuccess();
  }

  return (
    <div className={esEdicion ? '' : 'bg-white border border-borde rounded-lg p-5 mb-4'}>
      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Nombre completo</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            disabled={esEdicion}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Teléfono</label>
          <input
            className="input"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+34 600111222"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">ID de usuario en BC (opcional)</label>
          <input
            className="input font-mono text-xs"
            value={bcUserId}
            onChange={(e) => setBcUserId(e.target.value)}
            placeholder="7b069824-359b-4fc4-a20f-cff70ff56d15"
          />
          <p className="text-xs text-slate mt-1">
            Si tiene usuario en Business Central: los pedidos que cree se envían a aprobación en su nombre.
            Es el <strong>Id. de seguridad de usuario</strong> de su ficha de usuario en BC (no el Id. de telemetría).
          </p>
        </div>

        {!esEdicion && (
          <div>
            <label className="block text-sm font-medium text-grafito mb-1">Contraseña inicial</label>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        )}

        {esEdicion && (
          <div>
            <label className="block text-sm font-medium text-grafito mb-1">
              Nueva contraseña (opcional)
            </label>
            <input
              className="input"
              type="text"
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              placeholder="Dejar en blanco para no cambiarla"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Rol</label>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value as Usuario['rol'])}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {rol === 'usuario' && (
          <div>
            <label className="block text-sm font-medium text-grafito mb-1">Comprador asignado</label>
            <select className="input" value={compradorId} onChange={(e) => setCompradorId(e.target.value)}>
              <option value="">Sin asignar</option>
              {compradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo}
                </option>
              ))}
            </select>
          </div>
        )}

        {(rol === 'usuario' || rol === 'comprador') && (
          <div>
            <label className="block text-sm font-medium text-grafito mb-1">Responsable asignado</label>
            <select className="input" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {responsablesDisponibles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre_completo} {r.rol === 'admin' ? '(admin)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {(rol === 'comprador' || rol === 'responsable') && (
          <>
            <div>
              <label className="block text-sm font-medium text-grafito mb-1">Sustituto (vacaciones)</label>
              <select className="input" value={sustitutoId} onChange={(e) => setSustitutoId(e.target.value)}>
                <option value="">Sin sustituto</option>
                {(rol === 'comprador' ? compradoresSustitutosDisponibles : responsablesSustitutosDisponibles)
                  .filter((u) => u.id !== usuario?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre_completo} {u.rol === 'admin' ? '(admin)' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-grafito self-end pb-2">
              <input
                type="checkbox"
                checked={sustitutoActivo}
                disabled={!sustitutoId}
                onChange={(e) => setSustitutoActivo(e.target.checked)}
              />
              Sustituir ahora (el sustituto asume sus pedidos)
            </label>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4 max-w-2xl">
          {error}
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={handleGuardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        {esEdicion && (
          <button
            type="button"
            onClick={handleEliminar}
            disabled={eliminando || guardando}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#E7C7C7] bg-white px-4 py-2 text-sm font-medium text-rojo hover:bg-[#F6E9E9] disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            {eliminando ? 'Eliminando…' : 'Eliminar usuario'}
          </button>
        )}
      </div>
    </div>
  );
}
