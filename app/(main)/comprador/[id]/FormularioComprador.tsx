'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { actualizarPedido, actualizarLineasTecmelec } from '@/app/actions/pedidos';
import EstadoBadge, { claseBadgeEstado } from '@/components/EstadoBadge';
import ComboboxProveedor from '@/components/ComboboxProveedor';

type Estado = { id: number; nombre: string };
type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };
type ItemForm = {
  id: string;
  nombre: string;
  imagenUrl: string | null;
  precio: number;
  cantidad: number;
  numeroTecmelec: string;
  fechaEstimada: string;
  estadoId: number;
  estadoRecepcion: string;
  proveedorId: string;
};

const ESTADOS_RECEPCION = ['Pendiente de recibir', 'Recibido parcial', 'Recibido', 'Anulado'];

function SelectPildora({
  value,
  claseColor,
  onChange,
  children,
}: {
  value: string;
  claseColor: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-block">
      <select
        className={`badge ${claseColor} appearance-none pr-6 cursor-pointer border-0`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

export default function FormularioComprador({
  pedidoId,
  items,
  totalEstimado,
  estadoGeneral,
  fechaEstimada,
  estados,
  proveedores,
}: {
  pedidoId: string;
  items: ItemForm[];
  totalEstimado: number;
  estadoGeneral: string;
  fechaEstimada: string;
  estados: Estado[];
  proveedores: Proveedor[];
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
  const [proveedoresLinea, setProveedoresLinea] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.proveedorId]))
  );
  const [preciosLinea, setPreciosLinea] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.precio.toString()]))
  );
  const [anulado, setAnulado] = useState(estadoGeneral === 'Anulado');
  const [fecha, setFecha] = useState(fechaEstimada);
  const [asignarVacios, setAsignarVacios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Agrupa visualmente los artículos que comparten el mismo Nº pedido Tecmelec
  // (se recalcula al vuelo según lo que se va editando, no solo al cargar la página).
  const grupos = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const item of items) {
      const clave = (numerosTecmelec[item.id] || '').trim();
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(item.id);
    }
    return mapa;
  }, [items, numerosTecmelec]);

  function actualizarNumeroTecmelecGrupo(ids: string[], valor: string) {
    setNumerosTecmelec((prev) => {
      const copia = { ...prev };
      for (const id of ids) copia[id] = valor;
      return copia;
    });
  }

  const itemsPorId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const totalCalculado = useMemo(
    () => items.reduce((suma, i) => suma + (Number(preciosLinea[i.id]) || 0) * i.cantidad, 0),
    [items, preciosLinea]
  );

  async function handleGuardar() {
    setGuardando(true);
    setGuardado(false);
    setError(null);

    const resultadoLineas = await actualizarLineasTecmelec(
      pedidoId,
      items.map((i) => {
        const fechaLinea = fechasLinea[i.id] || '';
        const fechaFinal = !fechaLinea && asignarVacios && fecha ? fecha : fechaLinea;
        return {
          id: i.id,
          numero_tecmelec: numerosTecmelec[i.id] || '',
          fecha_estimada_entrega: fechaFinal || null,
          estado_id: estadosLinea[i.id],
          estado_recepcion: recepcionesLinea[i.id],
          proveedor_id: proveedoresLinea[i.id] || null,
          precio_unitario: Number(preciosLinea[i.id]) || 0,
        };
      })
    );

    if (resultadoLineas.error) {
      setGuardando(false);
      setError(resultadoLineas.error);
      return;
    }

    // El Estado general ya se recalculó solo a partir de las líneas (arriba);
    // aquí solo forzamos "Anulado" si el comprador lo ha marcado a mano.
    const resultadoPedido = await actualizarPedido(pedidoId, {
      ...(anulado ? { estado_general: 'Anulado' } : {}),
      fecha_estimada_entrega: fecha || null,
      total_estimado: totalCalculado,
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
        <h2 className="font-medium text-grafito mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-marca">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Artículos solicitados
        </h2>

        <div className="space-y-3">
          {Array.from(grupos.entries()).map(([clave, ids]) => {
            const esGrupoCompartido = clave !== '' && ids.length > 1;

            if (esGrupoCompartido) {
              return (
                <div key={clave} className="bg-white border border-borde rounded-lg overflow-hidden">
                  <div className="bg-fondo px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate">Pedido</span>
                      <input
                        className="input font-mono w-44 py-1"
                        value={clave}
                        onChange={(e) => actualizarNumeroTecmelecGrupo(ids, e.target.value)}
                      />
                    </div>
                    <span className="text-xs text-slate">{ids.length} artículos en este pedido</span>
                  </div>
                  <div className="divide-y divide-borde">
                    {ids.map((id) => (
                      <ItemFila
                        key={id}
                        item={itemsPorId.get(id)!}
                        mostrarPedido={false}
                        numeroTecmelec={numerosTecmelec[id]}
                        onNumeroTecmelec={(v) => setNumerosTecmelec((prev) => ({ ...prev, [id]: v }))}
                        fecha={fechasLinea[id]}
                        onFecha={(v) => setFechasLinea((prev) => ({ ...prev, [id]: v }))}
                        estadoId={estadosLinea[id]}
                        onEstadoId={(v) => setEstadosLinea((prev) => ({ ...prev, [id]: v }))}
                        recepcion={recepcionesLinea[id]}
                        onRecepcion={(v) => setRecepcionesLinea((prev) => ({ ...prev, [id]: v }))}
                        proveedorId={proveedoresLinea[id]}
                        onProveedorId={(v) => setProveedoresLinea((prev) => ({ ...prev, [id]: v }))}
                        precio={preciosLinea[id]}
                        onPrecio={(v) => setPreciosLinea((prev) => ({ ...prev, [id]: v }))}
                        estados={estados}
                        proveedores={proveedores}
                      />
                    ))}
                  </div>
                </div>
              );
            }

            return ids.map((id) => (
              <div key={id} className="bg-white border border-borde rounded-lg overflow-hidden">
                <ItemFila
                  item={itemsPorId.get(id)!}
                  mostrarPedido
                  numeroTecmelec={numerosTecmelec[id]}
                  onNumeroTecmelec={(v) => setNumerosTecmelec((prev) => ({ ...prev, [id]: v }))}
                  fecha={fechasLinea[id]}
                  onFecha={(v) => setFechasLinea((prev) => ({ ...prev, [id]: v }))}
                  estadoId={estadosLinea[id]}
                  onEstadoId={(v) => setEstadosLinea((prev) => ({ ...prev, [id]: v }))}
                  recepcion={recepcionesLinea[id]}
                  onRecepcion={(v) => setRecepcionesLinea((prev) => ({ ...prev, [id]: v }))}
                  proveedorId={proveedoresLinea[id]}
                  onProveedorId={(v) => setProveedoresLinea((prev) => ({ ...prev, [id]: v }))}
                  precio={preciosLinea[id]}
                  onPrecio={(v) => setPreciosLinea((prev) => ({ ...prev, [id]: v }))}
                  estados={estados}
                  proveedores={proveedores}
                />
              </div>
            ));
          })}
        </div>

        <div className="mt-3 bg-marcaClaro border border-[#C4DECD] rounded-lg px-5 py-3 flex items-center justify-between">
          <span className="text-sm text-grafito">Total solicitado</span>
          <span className="font-mono text-lg font-semibold text-marca">{totalCalculado.toFixed(2)} €</span>
        </div>
      </div>

      <div className="bg-white border border-borde rounded-lg p-5 space-y-4">
        <h2 className="font-medium text-grafito">Gestión general del pedido</h2>
        <p className="text-xs text-slate -mt-2">
          Esto es un resumen general (se usa en los listados). El detalle real que ve el
          solicitante se arma por línea, según el Nº pedido Tecmelec de cada artículo.
        </p>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Estado general</label>
          <div className="flex items-center gap-3">
            <EstadoBadge estado={anulado ? 'Anulado' : estadoGeneral} />
            <span className="text-xs text-slate">
              (se calcula solo según el estado de las líneas de abajo)
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-grafito mt-2">
            <input type="checkbox" checked={anulado} onChange={(e) => setAnulado(e.target.checked)} />
            Marcar todo el pedido como Anulado
          </label>
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

function ItemFila({
  item,
  mostrarPedido,
  numeroTecmelec,
  onNumeroTecmelec,
  fecha,
  onFecha,
  estadoId,
  onEstadoId,
  recepcion,
  onRecepcion,
  proveedorId,
  onProveedorId,
  precio,
  onPrecio,
  estados,
  proveedores,
}: {
  item: ItemForm;
  mostrarPedido: boolean;
  numeroTecmelec: string;
  onNumeroTecmelec: (v: string) => void;
  fecha: string;
  onFecha: (v: string) => void;
  estadoId: number;
  onEstadoId: (v: number) => void;
  recepcion: string;
  onRecepcion: (v: string) => void;
  proveedorId: string;
  onProveedorId: (v: string) => void;
  precio: string;
  onPrecio: (v: string) => void;
  estados: Estado[];
  proveedores: Proveedor[];
}) {
  const nombreEstado = estados.find((e) => e.id === estadoId)?.nombre || '';
  // En cuanto hay Nº pedido Tecmelec, la sincronización con BC es quien manda
  // sobre precio/proveedor/fecha/estado — se puede seguir editando a mano,
  // pero se avisa de que el próximo sync lo puede sobrescribir.
  const gestionadoPorBC = !!numeroTecmelec.trim();

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-fondo rounded relative shrink-0 overflow-hidden">
            {item.imagenUrl && <Image src={item.imagenUrl} alt="" fill className="object-contain" />}
          </div>
          <div>
            <p className="text-sm font-medium text-grafito">{item.nombre}</p>
            <p className="font-mono text-slate text-xs mt-0.5">x{item.cantidad}</p>
          </div>
        </div>

        <div className="flex items-start gap-6 flex-wrap">
          {mostrarPedido && (
            <div>
              <p className="text-xs text-slate mb-1">Pedido</p>
              <input
                className="input font-mono w-40 py-1"
                value={numeroTecmelec}
                onChange={(e) => onNumeroTecmelec(e.target.value)}
                placeholder="Ej: TM-2026-0451"
              />
            </div>
          )}
          <div>
            <p className="text-xs text-slate mb-1">Fecha estimada de entrega</p>
            <input type="date" className="input w-40 py-1" value={fecha} onChange={(e) => onFecha(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 flex-wrap text-sm pt-3 border-t border-borde">
        <div>
          <p className="text-xs text-slate mb-1">Estado</p>
          <SelectPildora
            value={String(estadoId)}
            claseColor={claseBadgeEstado(nombreEstado)}
            onChange={(v) => onEstadoId(Number(v))}
          >
            {estados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </SelectPildora>
        </div>

        <div>
          <p className="text-xs text-slate mb-1">Recepción</p>
          <SelectPildora value={recepcion} claseColor={claseBadgeEstado(recepcion)} onChange={onRecepcion}>
            {ESTADOS_RECEPCION.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </SelectPildora>
        </div>

        <div>
          <p className="text-xs text-slate mb-1">Proveedor</p>
          <ComboboxProveedor
            proveedores={proveedores}
            value={proveedorId}
            onChange={onProveedorId}
            className="w-72"
          />
        </div>

        <div>
          <p className="text-xs text-slate mb-1">Precio / ud.</p>
          <div className="relative">
            <input
              type="number"
              step="0.00001"
              className="input py-1 w-28 font-mono"
              value={precio}
              onChange={(e) => onPrecio(e.target.value)}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate text-xs pointer-events-none">€</span>
          </div>
        </div>
      </div>

      {gestionadoPorBC && (
        <p className="text-xs text-slate mt-2">
          ⓘ Al sincronizar con Business Central, el precio, proveedor, fecha y estado de esta línea se
          actualizan automáticamente desde el pedido de compra.
        </p>
      )}
    </div>
  );
}
