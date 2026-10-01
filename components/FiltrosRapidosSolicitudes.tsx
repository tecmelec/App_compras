'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { guardarFiltroRapido, buscarObras } from '@/app/actions/filtros-rapidos';

// Barra de filtros rápidos de "Solicitudes por comprar":
//   Todas · Asignadas a mí · Por usuario ▾ · Por obra ▾
// "Por usuario" y "Por obra" filtran con la selección que cada comprador
// guarda en su desplegable (la flecha de la derecha del botón).

export type ModoRapido = 'todas' | 'mias' | 'usuario' | 'obra';
export type OpcionUsuario = { id: string; nombre: string };
export type OpcionObra = { numero: string; nombre: string };

export type ConfigFiltrosRapidos = {
  usuarios: OpcionUsuario[];
  obras: OpcionObra[]; // obras conocidas (las de las solicitudes + las guardadas)
  guardados: { solicitantes: string[]; obras: string[] };
};

export default function FiltrosRapidosSolicitudes({
  modo,
  onModo,
  conteos,
  config,
  guardados,
  onGuardados,
}: {
  modo: ModoRapido;
  onModo: (m: ModoRapido) => void;
  conteos: Record<ModoRapido, number>;
  config: ConfigFiltrosRapidos;
  guardados: { solicitantes: string[]; obras: string[] };
  onGuardados: (g: { solicitantes: string[]; obras: string[] }) => void;
}) {
  const [abierto, setAbierto] = useState<'usuario' | 'obra' | null>(null);

  function pulsarSeleccion(tipo: 'usuario' | 'obra') {
    const lista = tipo === 'usuario' ? guardados.solicitantes : guardados.obras;
    // Sin nada guardado todavía: se abre el desplegable para elegir.
    if (lista.length === 0) {
      setAbierto(tipo);
      return;
    }
    onModo(modo === tipo ? 'todas' : tipo);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <BotonRapido activo={modo === 'todas'} onClick={() => onModo('todas')} icono={<IconoGrupo />} texto="Todas" conteo={conteos.todas} />
      <BotonRapido
        activo={modo === 'mias'}
        onClick={() => onModo(modo === 'mias' ? 'todas' : 'mias')}
        icono={<IconoPersona />}
        texto="Asignadas a mí"
        conteo={conteos.mias}
      />
      <BotonConDesplegable
        activo={modo === 'usuario'}
        texto="Por usuario"
        icono={<IconoPersona />}
        conteo={guardados.solicitantes.length ? conteos.usuario : null}
        detalle={guardados.solicitantes.length ? `${guardados.solicitantes.length} usuario${guardados.solicitantes.length === 1 ? '' : 's'} guardado${guardados.solicitantes.length === 1 ? '' : 's'}` : 'Elige qué usuarios seguir'}
        onClick={() => pulsarSeleccion('usuario')}
        abierto={abierto === 'usuario'}
        onAbrir={(v) => setAbierto(v ? 'usuario' : null)}
      >
        <SelectorUsuarios
          opciones={config.usuarios}
          seleccion={guardados.solicitantes}
          onGuardar={async (valores) => {
            const r = await guardarFiltroRapido('solicitantes', valores);
            if (r.error) return r.error;
            onGuardados({ ...guardados, solicitantes: r.valores || valores });
            onModo(valores.length ? 'usuario' : modo === 'usuario' ? 'todas' : modo);
            setAbierto(null);
            return null;
          }}
          onCancelar={() => setAbierto(null)}
        />
      </BotonConDesplegable>
      <BotonConDesplegable
        activo={modo === 'obra'}
        texto="Por obra"
        icono={<IconoEdificio />}
        conteo={guardados.obras.length ? conteos.obra : null}
        detalle={guardados.obras.length ? `${guardados.obras.length} obra${guardados.obras.length === 1 ? '' : 's'} guardada${guardados.obras.length === 1 ? '' : 's'}` : 'Elige qué obras seguir'}
        onClick={() => pulsarSeleccion('obra')}
        abierto={abierto === 'obra'}
        onAbrir={(v) => setAbierto(v ? 'obra' : null)}
      >
        <SelectorObras
          conocidas={config.obras}
          seleccion={guardados.obras}
          onGuardar={async (valores) => {
            const r = await guardarFiltroRapido('obras', valores);
            if (r.error) return r.error;
            onGuardados({ ...guardados, obras: r.valores || valores });
            onModo(valores.length ? 'obra' : modo === 'obra' ? 'todas' : modo);
            setAbierto(null);
            return null;
          }}
          onCancelar={() => setAbierto(null)}
        />
      </BotonConDesplegable>
    </div>
  );
}

function BotonRapido({
  activo,
  onClick,
  icono,
  texto,
  conteo,
}: {
  activo: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  texto: string;
  conteo: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
        activo ? 'bg-marca border-marca text-white' : 'bg-white border-borde text-grafito hover:border-marca/50'
      }`}
    >
      {icono}
      {texto}
      {conteo !== null && (
        <span className={`min-w-[1.5rem] rounded-full px-1.5 text-xs leading-5 text-center ${activo ? 'bg-white/25 text-white' : 'bg-fondo text-slate'}`}>
          {conteo}
        </span>
      )}
    </button>
  );
}

function BotonConDesplegable({
  activo,
  texto,
  icono,
  conteo,
  detalle,
  onClick,
  abierto,
  onAbrir,
  children,
}: {
  activo: boolean;
  texto: string;
  icono: React.ReactNode;
  conteo: number | null;
  detalle: string;
  onClick: () => void;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onAbrir(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [abierto, onAbrir]);

  return (
    <div ref={ref} className="relative">
      <div
        className={`inline-flex items-stretch rounded-lg border text-sm font-medium transition-colors ${
          activo ? 'bg-marca border-marca text-white' : 'bg-white border-borde text-grafito hover:border-marca/50'
        }`}
      >
        <button type="button" onClick={onClick} title={detalle} className="inline-flex items-center gap-2 pl-3.5 pr-2.5 py-2">
          {icono}
          {texto}
          {conteo !== null && (
            <span className={`min-w-[1.5rem] rounded-full px-1.5 text-xs leading-5 text-center ${activo ? 'bg-white/25 text-white' : 'bg-fondo text-slate'}`}>
              {conteo}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onAbrir(!abierto)}
          aria-label={`Elegir ${texto.toLowerCase().replace('por ', '')}s del filtro`}
          title="Elegir qué filtra este botón"
          className={`px-2 border-l ${activo ? 'border-white/30 hover:bg-white/10' : 'border-borde hover:bg-fondo'} rounded-r-lg`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={abierto ? 'rotate-180' : ''}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {abierto && (
        <div className="absolute left-0 top-full mt-2 z-30 w-80 rounded-lg border border-borde bg-white shadow-lg p-3 text-sm font-normal text-grafito">
          {children}
        </div>
      )}
    </div>
  );
}

function PieSelector({
  n,
  onLimpiar,
  onCancelar,
  onGuardar,
  guardando,
  error,
}: {
  n: number;
  onLimpiar: () => void;
  onCancelar: () => void;
  onGuardar: () => void;
  guardando: boolean;
  error: string | null;
}) {
  return (
    <>
      {error && <p className="text-xs text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-2 py-1.5 mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-borde">
        <span className="text-xs text-slate">{n} seleccionado{n === 1 ? '' : 's'}</span>
        {n > 0 && (
          <button type="button" onClick={onLimpiar} className="text-xs text-marca hover:underline">
            Quitar todos
          </button>
        )}
        <button type="button" onClick={onCancelar} className="ml-auto text-xs text-slate hover:text-grafito px-2 py-1">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando}
          className="text-xs bg-marca text-white rounded-md px-3 py-1.5 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar y filtrar'}
        </button>
      </div>
    </>
  );
}

function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function SelectorUsuarios({
  opciones,
  seleccion,
  onGuardar,
  onCancelar,
}: {
  opciones: OpcionUsuario[];
  seleccion: string[];
  onGuardar: (valores: string[]) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [marcados, setMarcados] = useState<string[]>(seleccion);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const t = normalizar(busqueda.trim());
    return opciones
      .filter((o) => !t || normalizar(o.nombre).includes(t))
      .sort((a, b) => Number(seleccion.includes(b.id)) - Number(seleccion.includes(a.id)) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [opciones, busqueda, seleccion]);

  return (
    <>
      <p className="text-xs font-semibold mb-2">Usuarios que quieres seguir</p>
      <input className="input w-full text-sm mb-2" placeholder="Buscar usuario…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
      <div className="max-h-60 overflow-y-auto space-y-1">
        {visibles.length === 0 && <p className="text-xs text-slate py-2">Sin resultados.</p>}
        {visibles.map((o) => (
          <label key={o.id} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-fondo">
            <input
              type="checkbox"
              checked={marcados.includes(o.id)}
              onChange={() => setMarcados((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id]))}
            />
            <span className="truncate">{o.nombre}</span>
          </label>
        ))}
      </div>
      <PieSelector
        n={marcados.length}
        onLimpiar={() => setMarcados([])}
        onCancelar={onCancelar}
        guardando={guardando}
        error={error}
        onGuardar={async () => {
          setGuardando(true);
          setError(null);
          const e = await onGuardar(marcados);
          setGuardando(false);
          if (e) setError(e);
        }}
      />
    </>
  );
}

function SelectorObras({
  conocidas,
  seleccion,
  onGuardar,
  onCancelar,
}: {
  conocidas: OpcionObra[];
  seleccion: string[];
  onGuardar: (valores: string[]) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [marcadas, setMarcadas] = useState<string[]>(seleccion);
  const [busqueda, setBusqueda] = useState('');
  const [encontradas, setEncontradas] = useState<OpcionObra[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nombres de las obras encontradas en la búsqueda, para no perderlos al marcar.
  const [extra, setExtra] = useState<OpcionObra[]>([]);

  // Búsqueda en todas las obras de BC (no solo las que ya tienen solicitudes).
  useEffect(() => {
    const t = busqueda.trim();
    if (t.length < 2) {
      setEncontradas([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const temporizador = setTimeout(async () => {
      const r = await buscarObras(t);
      if (!cancelado) {
        setEncontradas(r);
        setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [busqueda]);

  const visibles = useMemo(() => {
    const porNumero = new Map<string, OpcionObra>();
    for (const o of [...conocidas, ...extra, ...encontradas]) if (!porNumero.has(o.numero)) porNumero.set(o.numero, o);
    const t = normalizar(busqueda.trim());
    return Array.from(porNumero.values())
      .filter((o) => !t || normalizar(`${o.numero} ${o.nombre}`).includes(t))
      .sort((a, b) => Number(seleccion.includes(b.numero)) - Number(seleccion.includes(a.numero)) || b.numero.localeCompare(a.numero));
  }, [conocidas, extra, encontradas, busqueda, seleccion]);

  function alternar(o: OpcionObra) {
    setMarcadas((m) => (m.includes(o.numero) ? m.filter((x) => x !== o.numero) : [...m, o.numero]));
    setExtra((e) => (e.some((x) => x.numero === o.numero) ? e : [...e, o]));
  }

  return (
    <>
      <p className="text-xs font-semibold mb-2">Obras que quieres seguir</p>
      <input className="input w-full text-sm mb-2" placeholder="Buscar por número o nombre de obra…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
      <div className="max-h-60 overflow-y-auto space-y-1">
        {buscando && <p className="text-xs text-slate py-1">Buscando en todas las obras…</p>}
        {!buscando && visibles.length === 0 && (
          <p className="text-xs text-slate py-2">{busqueda.trim().length < 2 ? 'Escribe para buscar obras.' : 'Sin resultados.'}</p>
        )}
        {visibles.map((o) => (
          <label key={o.numero} className="flex items-start gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-fondo">
            <input type="checkbox" className="mt-1" checked={marcadas.includes(o.numero)} onChange={() => alternar(o)} />
            <span className="min-w-0">
              <span className="block font-mono text-marca text-xs">{o.numero}</span>
              <span className="block text-xs text-slate truncate">{o.nombre || 'Sin nombre de obra'}</span>
            </span>
          </label>
        ))}
      </div>
      <PieSelector
        n={marcadas.length}
        onLimpiar={() => setMarcadas([])}
        onCancelar={onCancelar}
        guardando={guardando}
        error={error}
        onGuardar={async () => {
          setGuardando(true);
          setError(null);
          const e = await onGuardar(marcadas);
          setGuardando(false);
          if (e) setError(e);
        }}
      />
    </>
  );
}

function IconoGrupo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconoPersona() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconoEdificio() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}
