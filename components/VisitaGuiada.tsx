'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { VISITAS, type Visita } from '@/lib/asistente/visitas';

// Visitas guiadas (fase 2 del asistente). Se inician con el evento
// "iniciar-visita" ({ detail: { id } }) desde el chat del asistente. El estado se guarda
// en sessionStorage para seguir la visita al cambiar de pantalla.
const CLAVE = 'asistente_visita';
type Estado = { id: string; paso: number };
type Rect = { top: number; left: number; width: number; height: number };

function leer(): Estado | null {
  try {
    const v = window.sessionStorage.getItem(CLAVE);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function guardar(e: Estado | null) {
  try {
    if (e) window.sessionStorage.setItem(CLAVE, JSON.stringify(e));
    else window.sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la visita sigue en memoria */
  }
}

// Primer elemento visible que cumple el selector.
function buscarVisible(selector: string): HTMLElement | null {
  const todos = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return todos.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }) || null;
}

export default function VisitaGuiada({ rol }: { rol: string }) {
  const ruta = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [buscando, setBuscando] = useState(false);
  // La tarjeta se puede arrastrar (por su cabecera) si tapa algo; se recoloca en cada paso.
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const [altoTarjeta, setAltoTarjeta] = useState(200);
  useEffect(() => {
    setDesplazamiento({ x: 0, y: 0 });
  }, [estado?.id, estado?.paso]);
  useEffect(() => {
    if (tarjetaRef.current) setAltoTarjeta(tarjetaRef.current.offsetHeight);
  });

  useEffect(() => {
    setEstado(leer());
    const iniciar = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      const v = VISITAS.find((x) => x.id === id && x.roles.includes(rol));
      if (!v) return;
      const nuevo = { id, paso: 0 };
      guardar(nuevo);
      setEstado(nuevo);
    };
    window.addEventListener('iniciar-visita', iniciar);
    return () => window.removeEventListener('iniciar-visita', iniciar);
  }, [rol]);

  const visita: Visita | undefined = estado ? VISITAS.find((v) => v.id === estado.id) : undefined;
  const paso = visita && estado ? visita.pasos[estado.paso] : undefined;

  const ir = useCallback(
    (n: number | null) => {
      if (n === null || !visita || n < 0 || n >= visita.pasos.length) {
        guardar(null);
        setEstado(null);
        setRect(null);
        return;
      }
      const e = { id: visita.id, paso: n };
      guardar(e);
      setEstado(e);
    },
    [visita]
  );

  // Ir a la pantalla del paso y localizar el elemento (lo reintenta un momento por si
  // aún se está cargando).
  useEffect(() => {
    setRect(null);
    if (!paso) return;
    if (paso.ruta && ruta !== paso.ruta) {
      router.push(paso.ruta);
      return;
    }
    if (!paso.selector) return;
    let cancelado = false;
    let intentos = 0;
    setBuscando(true);
    const buscar = () => {
      if (cancelado) return;
      const el = buscarVisible(paso.selector!);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => {
          if (!cancelado) {
            const r = el.getBoundingClientRect();
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
            setBuscando(false);
          }
        }, 350);
      } else if (intentos++ < 20) setTimeout(buscar, 150);
      else setBuscando(false);
    };
    buscar();
    return () => {
      cancelado = true;
    };
  }, [paso, ruta, router]);

  // Seguir al elemento si cambia de sitio (scroll, tamaño de la ventana).
  useEffect(() => {
    if (!paso?.selector) return;
    const actualizar = () => {
      const el = buscarVisible(paso.selector!);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener('scroll', actualizar, true);
    window.addEventListener('resize', actualizar);
    return () => {
      window.removeEventListener('scroll', actualizar, true);
      window.removeEventListener('resize', actualizar);
    };
  }, [paso]);

  useEffect(() => {
    if (!estado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ir(null);
      else if (e.key === 'ArrowRight' && estado) ir(estado.paso + 1 < (visita?.pasos.length || 0) ? estado.paso + 1 : null);
      else if (e.key === 'ArrowLeft' && estado && estado.paso > 0) ir(estado.paso - 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [estado, visita, ir]);

  if (!visita || !paso || !estado) return null;
  // Esperando a que cargue la pantalla del paso
  if (paso.ruta && ruta !== paso.ruta) return null;

  const total = visita.pasos.length;
  const ultimo = estado.paso === total - 1;
  const margen = 6;
  const hueco = rect
    ? { top: rect.top - margen, left: rect.left - margen, width: rect.width + margen * 2, height: rect.height + margen * 2 }
    : null;

  // Tarjeta: donde no tape el elemento (debajo, encima o al lado, según el hueco libre);
  // sin elemento, centrada. Después se suma lo que la haya arrastrado el usuario.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
  const anchoTarjeta = Math.min(340, vw - 24);
  let pos = { left: (vw - anchoTarjeta) / 2, top: Math.max(12, (vh - altoTarjeta) / 2) };
  if (hueco) {
    const leftAlineado = Math.max(12, Math.min(hueco.left, vw - anchoTarjeta - 12));
    const abajo = vh - (hueco.top + hueco.height) - 10;
    const arriba = hueco.top - 10;
    const derecha = vw - (hueco.left + hueco.width) - 10;
    const izquierda = hueco.left - 10;
    if (abajo >= altoTarjeta + 12) pos = { left: leftAlineado, top: hueco.top + hueco.height + 10 };
    else if (arriba >= altoTarjeta + 12) pos = { left: leftAlineado, top: hueco.top - 10 - altoTarjeta };
    else if (derecha >= anchoTarjeta + 12)
      pos = { left: hueco.left + hueco.width + 10, top: Math.max(12, Math.min(hueco.top, vh - altoTarjeta - 12)) };
    else if (izquierda >= anchoTarjeta + 12)
      pos = { left: hueco.left - 10 - anchoTarjeta, top: Math.max(12, Math.min(hueco.top, vh - altoTarjeta - 12)) };
    else pos = { left: leftAlineado, top: abajo >= arriba ? vh - altoTarjeta - 12 : 12 };
  }
  const estiloTarjeta: React.CSSProperties = {
    left: Math.max(4, Math.min(pos.left + desplazamiento.x, vw - 60)),
    top: Math.max(4, Math.min(pos.top + desplazamiento.y, vh - 48)),
    width: anchoTarjeta,
  };

  const empezarArrastre = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    arrastre.current = { x: e.clientX, y: e.clientY, dx: desplazamiento.x, dy: desplazamiento.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moverArrastre = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    setDesplazamiento({ x: a.dx + e.clientX - a.x, y: a.dy + e.clientY - a.y });
  };
  const soltarArrastre = () => {
    arrastre.current = null;
  };

  return (
    <div className="print:hidden">
      {hueco ? (
        <div
          className="fixed z-[90] rounded-lg ring-4 ring-[#4ADE80] pointer-events-none transition-all duration-300"
          style={{ ...hueco, boxShadow: '0 0 0 9999px rgba(15, 23, 20, 0.55)' }}
        />
      ) : (
        !buscando && <div className="fixed inset-0 z-[90] bg-[rgba(15,23,20,0.55)] pointer-events-none" />
      )}
      <div ref={tarjetaRef} className="fixed z-[95] bg-white rounded-xl shadow-2xl border border-borde p-4 asistente-aparecer" style={estiloTarjeta}>
        <div
          className="flex items-start gap-3 cursor-move select-none touch-none"
          onPointerDown={empezarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={soltarArrastre}
          title="Arrastra para mover el recuadro"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/asistente/mascota-96.png" alt="" width={40} height={40} className="rounded-full bg-white shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate">
              {visita.titulo} · Paso {estado.paso + 1} de {total}
            </p>
            <p className="text-sm font-semibold text-grafito">{paso.titulo}</p>
          </div>
          <span className="text-slate/60 text-xs mt-0.5" aria-hidden title="Arrastra para mover">
            ⠿
          </span>
          <button type="button" onClick={() => ir(null)} className="text-slate hover:text-grafito text-lg leading-none" aria-label="Salir de la visita">
            ×
          </button>
        </div>
        <p className="text-sm text-grafito mt-2 leading-snug">{paso.texto}</p>
        {paso.selector && !rect && !buscando && (
          <p className="text-[11px] text-slate mt-1">(Ese elemento no está visible ahora mismo en esta pantalla.)</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex gap-1">
            {visita.pasos.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === estado.paso ? 'bg-marca' : 'bg-borde'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {estado.paso > 0 && (
              <button type="button" onClick={() => ir(estado.paso - 1)} className="btn-secondary text-sm py-1.5">
                Atrás
              </button>
            )}
            <button type="button" onClick={() => ir(ultimo ? null : estado.paso + 1)} className="btn-primary text-sm py-1.5">
              {ultimo ? 'Terminar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
