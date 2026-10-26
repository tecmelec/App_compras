'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { preguntarAsistente, valorarRespuestaAsistente, type MensajeAsistente } from '@/app/actions/asistente';

// Asistente de la app (fase 1). Se abre con el botón flotante "?" o desde el recuadro
// "¿Necesitas ayuda?" del menú (evento "abrir-asistente").
type Msg = MensajeAsistente & { id?: string | null; valoracion?: 1 | -1 };

const SUGERENCIAS: Record<string, string[]> = {
  usuario: ['Quiero hacer una solicitud de material', 'No encuentro un artículo en la tienda', '¿Cómo sé cuándo llega mi material?'],
  responsable: ['Quiero hacer una solicitud de material', '¿Cómo apruebo una solicitud?', '¿Cómo asigno proyectos a mi equipo?'],
  comprador: ['¿Cómo tramito una solicitud?', '¿Cómo pido ofertas a varios proveedores?', '¿Cómo envío el pedido al proveedor?'],
  admin: ['Quiero hacer una solicitud de material', '¿Cómo apruebo una solicitud?', '¿Cómo tramito una solicitud?'],
};

// Texto con botones [[Etiqueta|/ruta]] y **negritas**.
function Contenido({ texto, onIr }: { texto: string; onIr: () => void }) {
  const lineas = texto.split('\n');
  return (
    <div className="space-y-1">
      {lineas.map((linea, i) => {
        const partes = linea.split(/(\[\[[^|\]]+\|[^\]]+\]\])/g).filter((p) => p !== '');
        if (partes.length === 0) return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="leading-snug">
            {partes.map((p, k) => {
              const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
              if (m) {
                return (
                  <Link
                    key={k}
                    href={m[2].trim()}
                    onClick={onIr}
                    className="inline-flex items-center gap-1 my-0.5 mr-1 px-2.5 py-1 rounded-full bg-marca text-white text-xs font-medium hover:bg-[#12703D]"
                  >
                    {m[1].trim()} →
                  </Link>
                );
              }
              return p.split(/(\*\*[^*]+\*\*)/g).map((t, j) =>
                /^\*\*[^*]+\*\*$/.test(t) ? <strong key={`${k}-${j}`}>{t.slice(2, -2)}</strong> : <span key={`${k}-${j}`}>{t}</span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

export default function AsistenteChat({ rol, nombre }: { rol: string; nombre: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('abrir-asistente', abrir);
    return () => window.removeEventListener('abrir-asistente', abrir);
  }, []);
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 50);
  }, [abierto]);
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  async function enviar(pregunta?: string) {
    const t = (pregunta ?? texto).trim();
    if (!t || pensando) return;
    const nuevos: Msg[] = [...mensajes, { rol: 'user', texto: t }];
    setMensajes(nuevos);
    setTexto('');
    setError(null);
    setPensando(true);
    const r = await preguntarAsistente(
      nuevos.map(({ rol, texto }) => ({ rol, texto })),
      ruta || ''
    );
    setPensando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    const d = r as { respuesta: string; id: string | null };
    setMensajes((prev) => [...prev, { rol: 'assistant', texto: d.respuesta, id: d.id }]);
  }

  async function valorar(k: number, v: 1 | -1) {
    const m = mensajes[k];
    if (!m.id || m.valoracion) return;
    setMensajes((prev) => prev.map((x, i) => (i === k ? { ...x, valoracion: v } : x)));
    await valorarRespuestaAsistente(m.id, v);
  }

  const primerNombre = (nombre || '').split(' ')[0];

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-marca text-white shadow-lg flex items-center justify-center hover:bg-[#12703D] print:hidden"
          title="Asistente: pregúntame cómo usar la app"
          aria-label="Abrir el asistente"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
            <path d="M12 15h.01" />
          </svg>
        </button>
      )}

      {abierto && (
        <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[380px] h-[75vh] sm:h-[560px] bg-white sm:rounded-xl rounded-t-xl shadow-2xl border border-borde flex flex-col print:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#0F3D2A] text-white sm:rounded-t-xl rounded-t-xl">
            <div>
              <p className="text-sm font-semibold">Asistente de compras</p>
              <p className="text-[11px] text-white/70">Te guío paso a paso en el uso de la app</p>
            </div>
            <div className="flex items-center gap-1">
              {mensajes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMensajes([]);
                    setError(null);
                  }}
                  className="text-[11px] text-white/80 hover:text-white px-2"
                  title="Empezar de nuevo"
                >
                  Nueva conversación
                </button>
              )}
              <button type="button" onClick={() => setAbierto(false)} className="text-white/80 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <div className="bg-fondo rounded-lg px-3 py-2 text-grafito">
                  Hola{primerNombre ? ` ${primerNombre}` : ''} 👋 Pregúntame cómo hacer cualquier cosa en la app y te guío paso a paso.
                </div>
                <div className="flex flex-col gap-1.5">
                  {(SUGERENCIAS[rol] || SUGERENCIAS.usuario).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="text-left text-xs border border-borde rounded-full px-3 py-1.5 text-marca hover:bg-marcaClaro"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, k) =>
              m.rol === 'user' ? (
                <div key={k} className="flex justify-end">
                  <div className="max-w-[85%] bg-marca text-white rounded-lg rounded-br-sm px-3 py-2 whitespace-pre-line">{m.texto}</div>
                </div>
              ) : (
                <div key={k} className="max-w-[92%]">
                  <div className="bg-fondo text-grafito rounded-lg rounded-bl-sm px-3 py-2">
                    <Contenido texto={m.texto} onIr={() => (window.innerWidth < 640 ? setAbierto(false) : undefined)} />
                  </div>
                  {m.id && (
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate">
                      {m.valoracion ? (
                        <span>{m.valoracion === 1 ? '¡Gracias!' : 'Gracias, lo revisaremos.'}</span>
                      ) : (
                        <>
                          <span>¿Te ha ayudado?</span>
                          <button type="button" onClick={() => valorar(k, 1)} className="px-1 hover:scale-110" aria-label="Sí">
                            👍
                          </button>
                          <button type="button" onClick={() => valorar(k, -1)} className="px-1 hover:scale-110" aria-label="No">
                            👎
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
            {pensando && <div className="text-xs text-slate px-1">Escribiendo…</div>}
            {error && <div className="text-xs text-rojo bg-[#F6E9E9] rounded-md px-3 py-2">{error}</div>}
            <div ref={finRef} />
          </div>

          <div className="border-t border-borde p-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                } else if (e.key === 'Escape') setAbierto(false);
              }}
              rows={1}
              maxLength={1500}
              placeholder="Escribe tu pregunta…"
              className="input flex-1 text-sm resize-none max-h-28"
            />
            <button
              type="button"
              onClick={() => enviar()}
              disabled={!texto.trim() || pensando}
              className="btn-primary px-3 py-2 disabled:opacity-60"
              aria-label="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
