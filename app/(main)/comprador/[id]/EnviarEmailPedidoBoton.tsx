'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  enviarPedidoPorEmail,
  obtenerDatosEmailPedido,
  obtenerContactosSugeridos,
  ocultarContactoSugerido,
} from '@/app/actions/email-pedido';
import CampoDestinatarios, { ContactoSugerido } from './CampoDestinatarios';

// Límite para los documentos adjuntos (además del PDF del pedido). Microsoft
// Graph no admite emails de más de ~4 MB en total; el servidor vuelve a
// comprobar el total sumando el PDF.
const MAX_ADJUNTOS_BYTES = 3 * 1024 * 1024;
const MAX_ADJUNTOS = 10;

type Adjunto = { nombre: string; tipo: string; tamano: number; base64: string };

function formatoTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function leerComoBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const r = String(lector.result || '');
      resolve(r.slice(r.indexOf(',') + 1)); // quita el prefijo "data:...;base64,"
    };
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

const MENSAJE_POR_DEFECTO = (numeroTecmelec: string) => `Buenas,\nAdjuntamos el pedido de compra ${numeroTecmelec}.`;

export default function EnviarEmailPedidoBoton({
  numeroTecmelec,
  conFotos,
  yaEnviado = false,
  puedeEnviar = true,
}: {
  numeroTecmelec: string;
  conFotos: boolean;
  yaEnviado?: boolean;
  puedeEnviar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [mostrarCc, setMostrarCc] = useState(false);
  const [sugerencias, setSugerencias] = useState<ContactoSugerido[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [enviado, setEnviado] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const inputArchivosRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Verde si ya se envió antes (dato del servidor, persiste tras recargar) o
  // si se acaba de enviar ahora mismo en esta misma sesión.
  const enviadoOk = yaEnviado || !!enviado;

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  async function abrir() {
    setEnviado(null);
    setError(null);
    setAbierto(true);
    setCargando(true);
    setCc([]);
    setMostrarCc(false);
    setAdjuntos([]);

    const [r, contactos] = await Promise.all([obtenerDatosEmailPedido(numeroTecmelec), obtenerContactosSugeridos()]);

    setCargando(false);
    setSugerencias(contactos);

    if (r.error) {
      setError(r.error);
      return;
    }

    setPara((r.emails || []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    setMensaje(MENSAJE_POR_DEFECTO(numeroTecmelec));
  }

  async function handleEnviar() {
    if (para.length === 0) {
      setError('Añade al menos un destinatario.');
      return;
    }

    setEnviando(true);
    setError(null);

    const r = await enviarPedidoPorEmail(
      numeroTecmelec,
      conFotos,
      para,
      mensaje,
      cc,
      adjuntos.map(({ nombre, tipo, base64 }) => ({ nombre, tipo, base64 }))
    );

    setEnviando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setEnviado(r.destinatarios || para);
    // Refresca los datos del servidor para que el check "PDF enviado" aparezca marcado.
    router.refresh();
  }

  async function anadirArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setError(null);
    const nuevos: Adjunto[] = [];
    let total = adjuntos.reduce((s, a) => s + a.tamano, 0);
    for (const archivo of Array.from(lista)) {
      if (adjuntos.length + nuevos.length >= MAX_ADJUNTOS) {
        setError(`Puedes adjuntar como máximo ${MAX_ADJUNTOS} documentos.`);
        break;
      }
      if (adjuntos.some((a) => a.nombre === archivo.name) || nuevos.some((a) => a.nombre === archivo.name)) continue;
      if (total + archivo.size > MAX_ADJUNTOS_BYTES) {
        setError(
          `"${archivo.name}" (${formatoTamano(archivo.size)}) no cabe: los adjuntos no pueden superar ${formatoTamano(MAX_ADJUNTOS_BYTES)} en total.`
        );
        continue;
      }
      try {
        const base64 = await leerComoBase64(archivo);
        nuevos.push({ nombre: archivo.name, tipo: archivo.type, tamano: archivo.size, base64 });
        total += archivo.size;
      } catch {
        setError(`No se pudo leer "${archivo.name}".`);
      }
    }
    if (nuevos.length) setAdjuntos((actual) => [...actual, ...nuevos]);
    if (inputArchivosRef.current) inputArchivosRef.current.value = '';
  }

  function ocultarSugerencia(email: string) {
    setSugerencias((actual) => actual.filter((s) => s.email !== email));
    ocultarContactoSugerido(email).catch(() => {
      // Si falla el guardado, no pasa nada grave: en la próxima apertura
      // volvería a aparecer en las sugerencias.
    });
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={puedeEnviar ? abrir : undefined}
        disabled={!puedeEnviar}
        title={
          !puedeEnviar
            ? 'Este pedido debe estar en estado "Pedido lanzado" (o posterior) en Business Central antes de poder enviarlo por email al proveedor.'
            : enviadoOk
              ? `Ya enviado por email${conFotos ? ' (con fotos)' : ''} — pulsa para reenviar`
              : conFotos
                ? 'Enviar por email (con fotos)'
                : 'Enviar por email'
        }
        className={
          !puedeEnviar
            ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/10 text-slate/40 cursor-not-allowed'
            : enviadoOk
              ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-marcaClaro text-marca hover:bg-marca hover:text-white'
              : 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate/20 text-slate hover:bg-slate/30 hover:text-grafito'
        }
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6 12 13 2 6" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-lg border border-borde bg-white shadow-lg p-4 text-sm">
          {cargando && <p className="text-xs text-slate">Cargando datos del proveedor…</p>}

          {!cargando && !enviado && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-grafito">
                  Pedido {numeroTecmelec}
                  {conFotos ? ' (con fotos)' : ''}
                </p>
                {!mostrarCc && (
                  <button
                    type="button"
                    onClick={() => setMostrarCc(true)}
                    className="text-[11px] text-marca hover:underline"
                  >
                    Añadir CC
                  </button>
                )}
              </div>

              <div className="mb-3">
                <CampoDestinatarios
                  label="Para"
                  emails={para}
                  onChange={setPara}
                  sugerencias={sugerencias}
                  onOcultarSugerencia={ocultarSugerencia}
                  placeholder="email@proveedor.com"
                />
              </div>

              {mostrarCc && (
                <div className="mb-3">
                  <CampoDestinatarios
                    label="CC"
                    emails={cc}
                    onChange={setCc}
                    sugerencias={sugerencias}
                    onOcultarSugerencia={ocultarSugerencia}
                    placeholder="email@empresa.com"
                  />
                </div>
              )}

              <label className="block text-xs text-slate mb-1">Mensaje</label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={4}
                className="input w-full text-xs mb-1 resize-none"
              />
              <p className="text-[11px] text-slate mb-3">Asunto: PEDIDO DE COMPRA {numeroTecmelec}</p>

              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate">Adjuntos</span>
                  <button
                    type="button"
                    onClick={() => inputArchivosRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] text-marca hover:underline"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    Adjuntar documentos
                  </button>
                  <input
                    ref={inputArchivosRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => anadirArchivos(e.target.files)}
                  />
                </div>
                <ul className="mt-1 space-y-1">
                  <li className="flex items-center gap-2 text-[11px] text-slate bg-fondo rounded px-2 py-1">
                    <span className="truncate flex-1">
                      Pedido_compra_{numeroTecmelec}
                      {conFotos ? '_con_fotos' : ''}.pdf
                    </span>
                    <span className="shrink-0">se adjunta siempre</span>
                  </li>
                  {adjuntos.map((a) => (
                    <li key={a.nombre} className="flex items-center gap-2 text-[11px] text-grafito bg-fondo rounded px-2 py-1">
                      <span className="truncate flex-1" title={a.nombre}>
                        {a.nombre}
                      </span>
                      <span className="shrink-0 text-slate">{formatoTamano(a.tamano)}</span>
                      <button
                        type="button"
                        onClick={() => setAdjuntos((actual) => actual.filter((x) => x.nombre !== a.nombre))}
                        aria-label={`Quitar ${a.nombre}`}
                        className="shrink-0 text-slate hover:text-rojo px-1 leading-none"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {adjuntos.length > 0 && (
                  <p className="text-[10px] text-slate mt-1">
                    {formatoTamano(adjuntos.reduce((s, a) => s + a.tamano, 0))} de {formatoTamano(MAX_ADJUNTOS_BYTES)} máx.
                  </p>
                )}
              </div>

              {error && <p className="text-xs text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">{error}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbierto(false)} className="text-xs text-slate hover:text-grafito px-2 py-1">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleEnviar}
                  disabled={enviando}
                  className="text-xs bg-marca text-white rounded-md px-3 py-1.5 disabled:opacity-60"
                >
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          )}

          {enviado && (
            <>
              <p className="text-grafito mb-1">Email enviado a:</p>
              <p className="text-xs text-slate mb-3">{enviado.join(', ')}</p>
              {adjuntos.length > 0 && (
                <p className="text-xs text-slate mb-3">
                  Con {adjuntos.length} documento{adjuntos.length === 1 ? '' : 's'} adjunto{adjuntos.length === 1 ? '' : 's'} además del PDF.
                </p>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={() => setAbierto(false)} className="text-xs text-marca hover:underline px-2 py-1">
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
