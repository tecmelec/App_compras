'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  actualizarEntregaSolicitud,
  opcionesEntregaSolicitud,
  type OpcionDireccion,
} from '@/app/actions/entrega-solicitud';

type Actual = {
  nombre: string;
  telefono: string;
  direccion: string;
  codigo_postal: string;
  ciudad: string;
  provincia: string;
};

// "Editar" del contacto y la dirección de entrega de la solicitud (vista del comprador).
export default function EditarEntregaBoton({ pedidoId, actual }: { pedidoId: string; actual: Actual }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-marca font-medium hover:underline">
        Editar
      </button>
      {abierto && <Modal pedidoId={pedidoId} actual={actual} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Modal({ pedidoId, actual, onCerrar }: { pedidoId: string; actual: Actual; onCerrar: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(actual.nombre);
  const [telefono, setTelefono] = useState(actual.telefono);
  const [dir, setDir] = useState({
    direccion: actual.direccion,
    codigo_postal: actual.codigo_postal,
    ciudad: actual.ciudad,
    provincia: actual.provincia,
  });
  const [alias, setAlias] = useState('Entrega');
  const [direccionCambiada, setDireccionCambiada] = useState(false);
  const [opciones, setOpciones] = useState<OpcionDireccion[]>([]);
  const [contactos, setContactos] = useState<{ id: string; nombre: string; telefono: string }[]>([]);
  const [pedidosBC, setPedidosBC] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opcionesEntregaSolicitud(pedidoId).then((r) => {
      if (r.error) return setError(r.error);
      setOpciones(r.direcciones || []);
      setContactos(r.contactos || []);
      setPedidosBC(r.pedidosBC || []);
    });
  }, [pedidoId]);

  function cambiarDir(campo: keyof typeof dir, valor: string) {
    setDir((prev) => ({ ...prev, [campo]: valor }));
    setDireccionCambiada(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await actualizarEntregaSolicitud(pedidoId, {
      nombre_contacto: nombre,
      telefono_contacto: telefono,
      direccion: direccionCambiada ? { ...dir, alias } : null,
    });
    setGuardando(false);
    if (r.error) return setError(r.error);
    router.refresh();
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onCerrar}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-grafito mb-4">Contacto y dirección de entrega</h2>

        <p className="text-sm font-medium text-grafito mb-2">Contacto</p>
        {contactos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {contactos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setNombre(c.nombre);
                  setTelefono(c.telefono);
                }}
                className="text-xs border border-borde rounded-full px-2.5 py-1 hover:border-marca hover:text-marca"
              >
                {c.nombre} · {c.telefono}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
          <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" />
        </div>

        <p className="text-sm font-medium text-grafito mb-2">Dirección de entrega</p>
        {opciones.length > 0 && (
          <select
            className="input w-full mb-2"
            value=""
            onChange={(e) => {
              const o = opciones[Number(e.target.value)];
              if (!o) return;
              setDir({
                direccion: o.direccion || '',
                codigo_postal: o.codigo_postal || '',
                ciudad: o.ciudad || '',
                provincia: o.provincia || '',
              });
              setAlias(o.id ? o.etiqueta : 'Predet.');
              setDireccionCambiada(true);
            }}
          >
            <option value="">Usar una dirección del solicitante o del proyecto…</option>
            {opciones.map((o, i) => (
              <option key={`${o.id}-${i}`} value={i}>
                {o.etiqueta} — {o.direccion}
                {o.ciudad ? `, ${o.ciudad}` : ''}
              </option>
            ))}
          </select>
        )}
        <div className="space-y-2">
          <input
            className="input w-full"
            value={dir.direccion}
            onChange={(e) => cambiarDir('direccion', e.target.value)}
            placeholder="Dirección"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              className="input"
              value={dir.codigo_postal}
              onChange={(e) => cambiarDir('codigo_postal', e.target.value)}
              placeholder="CP"
            />
            <input className="input" value={dir.ciudad} onChange={(e) => cambiarDir('ciudad', e.target.value)} placeholder="Ciudad" />
            <input
              className="input"
              value={dir.provincia}
              onChange={(e) => cambiarDir('provincia', e.target.value)}
              placeholder="Provincia"
            />
          </div>
        </div>

        {pedidosBC.length > 0 && (
          <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mt-4">
            Ya hay pedidos de compra creados en BC ({pedidosBC.join(', ')}): no se modifican. Si hace falta, cambia también
            allí el contacto o la dirección de envío. Los pedidos que se creen y los PDF que se envíen a partir de ahora
            llevarán los datos nuevos.
          </p>
        )}

        {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="btn-primary">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
