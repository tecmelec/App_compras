'use client';

import { Fragment, useState } from 'react';
import { crearUsuario, actualizarUsuario, resetearPassword } from '@/app/actions/usuarios';
import { useRouter } from 'next/navigation';

type Usuario = {
  id: string;
  nombre_completo: string;
  email: string;
  telefono: string | null;
  rol: 'admin' | 'usuario' | 'comprador' | 'responsable';
  comprador_id: string | null;
  responsable_id: string | null;
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

  function nombrePorId(id: string | null) {
    if (!id) return '—';
    return usuarios.find((u) => u.id === id)?.nombre_completo || '—';
  }

  return (
    <div>
      <button onClick={() => setCreando(true)} className="btn-primary mb-4">
        + Nuevo usuario
      </button>

      {creando && (
        <UsuarioForm
          compradores={compradores}
          responsables={responsables}
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditandoId(editandoId === u.id ? null : u.id)}
                      className="text-acero text-sm hover:underline"
                    >
                      {editandoId === u.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </td>
                </tr>
                {editandoId === u.id && (
                  <tr>
                    <td colSpan={6} className="bg-fondo p-4">
                      <UsuarioForm
                        usuario={u}
                        compradores={compradores}
                        responsables={responsables}
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
  onCancel,
  onSuccess,
}: {
  usuario?: Usuario;
  compradores: Usuario[];
  responsables: Usuario[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const esEdicion = !!usuario;

  const [nombre, setNombre] = useState(usuario?.nombre_completo || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [telefono, setTelefono] = useState(usuario?.telefono || '');
  const [password, setPassword] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [rol, setRol] = useState<Usuario['rol']>(usuario?.rol || 'usuario');
  const [compradorId, setCompradorId] = useState(usuario?.comprador_id || '');
  const [responsableId, setResponsableId] = useState(usuario?.responsable_id || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);

    const datosComunes = {
      nombre_completo: nombre,
      telefono,
      rol,
      comprador_id: rol === 'usuario' ? compradorId || null : null,
      responsable_id: rol === 'usuario' ? responsableId || null : null,
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
          <>
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

            <div>
              <label className="block text-sm font-medium text-grafito mb-1">Responsable asignado</label>
              <select className="input" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                <option value="">Sin asignar</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre_completo}
                  </option>
                ))}
              </select>
            </div>
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
      </div>
    </div>
  );
}
