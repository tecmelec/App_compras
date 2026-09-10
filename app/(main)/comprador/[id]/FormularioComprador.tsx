'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarPedido, actualizarLineasTecmelec } from '@/app/actions/pedidos';

type Estado = { id: number; nombre: string };
type ItemForm = {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  numeroTecmelec: string;
  fechaEstimada: string;
  estadoId: number;
  estadoRecepcion: string;
};

const ESTADOS_GENERALES = ['Pendiente de tramitar', 'Tramitado', 'Tramitado parcial', 'Anulado'];
const ESTADOS_RECEPCION = ['Pendiente de recibir', 'Recibido parcial', 'Recibido', 'Anulado'];

export default function FormularioComprador({
  pedidoId,
  items,
  totalEstimado,
  estadoGeneral,
  fechaEstimada,
  estados,
}: {
  pedidoId: string;
  items: ItemForm[];
  totalEstimado: number;
  estadoGeneral: string;
  fechaEstimada: string;
  estados: Estado[];
}) {
  const [numerosTecmelec, setNumerosTecmelec] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.numeroTecmelec]))
  );
  const [fechasLinea, setFechasLinea] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.fechaEstimada]))
  );
  const [estadosLinea, setEstadosLinea] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.estadoId]))
  );
  const [recepcionesLinea, setRecepcionesLinea] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.estadoRecepcion]))
  );
  const [estado, setEstado] = useState(estadoGeneral);
  const [fecha, setFecha] = useState(fechaEstimada);
  const [asignarVacios, setAsignarVacios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleGuardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);

    const resultadoLineas = await actualizarLineasTecmelec(
      items.map((i) => {
        const fechaLinea = fechasLinea[i.id] || '';
        const fechaFinal = !fechaLinea && asignarVacios && fecha ? fecha : fechaLinea;
        return {
          id: i.id,
          numero_tecmelec: numerosTecmelec[i.id] || '',
          fecha_estimada_entrega: fechaFinal || null,
          estado_id: estadosLinea[i.id],
          estado_recepcion: recepcionesLinea[i.id],
        };
      })
    );

    if (resultadoLineas.error) {
      setGuardando(false);
      setError(resultadoLineas.error);
      return;
    }

    const resultadoPedido = await actualizarPedido(pedidoId, {
      estado_general: estado,
      fecha_estimada_entrega: fecha || null,
    });

    setGuardando(false);

    if (resultadoPedido.error) {
      setError(resultadoPedido.error);
      return;
    }

    setGuardado(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-grafito mb-3">Artículos solicitados</h2>
        <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-end gap-4 p-4 text-sm">
              <div className="flex-1 min-w-[10rem]">
                <p className="text-grafito">{item.nombre}</p>
                <p className="font-mono text-slate text-xs">
                  {item.precio?.toFixed(2)} € c/u — x{item.cantidad}
                </p>
              </div>
              <div className="w-40 shrink-0">
                <label className="block text-xs text-slate mb-1">Nº pedido Tecmelec</label>
                <input
                  className="input font-mono"
                  value={numerosTecmelec[item.id]}
                  onChange={(e) =>
                    setNumerosTecmelec((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Ej: TM-2026-0451"
                />
              </div>
              <div className="w-40 shrink-0">
                <label className="block text-xs text-slate mb-1">Fecha estimada de entrega</label>
                <input
                  type="date"
                  className="input"
                  value={fechasLinea[item.id]}
                  onChange={(e) =>
                    setFechasLinea((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
              </div>
              <div className="w-40 shrink-0">
                <label className="block text-xs text-slate mb-1">Estado</label>
                <select
                  className="input"
                  value={estadosLinea[item.id]}
                  onChange={(e) =>
                    setEstadosLinea((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                  }
                >
                  {estados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-40 shrink-0">
                <label className="block text-xs text-slate mb-1">Estado de recepción</label>
                <select
                  className="input"
                  value={recepcionesLinea[item.id]}
                  onChange={(e) =>
                    setRecepcionesLinea((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                >
                  {ESTADOS_RECEPCION.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <p className="text-right font-mono text-grafito mt-2">
          Total: <strong>{totalEstimado?.toFixed(2)} €</strong>
        </p>
      </div>

      <div className="bg-white border border-borde rounded-lg p-5 space-y-4">
        <h2 className="font-medium text-grafito">Gestión general del pedido</h2>
        <p className="text-xs text-slate -mt-2">
          Esto es un resumen general (se usa en los listados). El detalle real que ve el
          solicitante se arma por línea, según el Nº pedido Tecmelec de cada artículo.
        </p>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Estado general</label>
          <select
            className="input"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            {ESTADOS_GENERALES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">
            Fecha estimada de entrega
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              className="input w-48"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-grafito">
              <input
                type="checkbox"
                checked={asignarVacios}
                onChange={(e) => setAsignarVacios(e.target.checked)}
              />
              Asignar a campos vacíos
            </label>
          </div>
          <p className="text-xs text-slate mt-1">
            Si la marcas, esta fecha se aplica a cada línea de artículo que no tenga su propia
            fecha estimada asignada (sin sobrescribir las que ya tengan una).
          </p>
        </div>

        {error && (
          <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button onClick={handleGuardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
